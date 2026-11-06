// A stand-in for the Zoho CRM v8 REST API, serving mock/data/org.json. It follows the documented endpoints,
// response shapes and limits the kit relies on, and counts API credits the way Zoho's API-limits page does:
//   GET records 1 credit/call (needs `fields`, max 50; per_page max 200; page param only up to 2,000 records,
//   page_token beyond), metadata 1, update 1 per 10 records (max 100/call), merge 1 (max 2 children/call),
//   concurrency 15 per user (Professional). Errors use Zoho's {code, details, message, status} envelope.
//   node mock/server.mjs [port]
import http from 'node:http';
import { readFileSync } from 'node:fs';

const PORT = Number(process.argv[2] || 8701);
const SRC = new URL('./data/org.json', import.meta.url);
const LATENCY = [25, 90]; // ms, so concurrency is real
const CONCURRENCY = 15;
let org, stats, tokens, pageTokens;
function reset() {
	org = JSON.parse(readFileSync(SRC, 'utf8'));
	stats = { credits: 0, calls: 0, byEndpoint: {}, maxInFlight: 0, rejected429: 0, writes: { updated: 0, merged: 0 } };
	tokens = new Set(); pageTokens = new Map();
}
reset();
let inFlight = 0;

const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json;charset=UTF-8' }); res.end(body === undefined ? '' : JSON.stringify(body)); };
const err = (res, http, code, message, details = {}) => json(res, http, { code, details, message, status: 'error' });
const charge = (name, credits) => { stats.credits += credits; stats.calls++; const e = (stats.byEndpoint[name] = stats.byEndpoint[name] || { calls: 0, credits: 0 }); e.calls++; e.credits += credits; };
const body = (req) => new Promise((ok) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch { ok(null); } }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MODULES = ['Leads', 'Contacts', 'Accounts', 'Deals'];

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url, 'http://x');
	const p = url.pathname, q = url.searchParams;

	// mock-only controls
	if (p === '/__stats') return json(res, 200, stats);
	if (p === '/__reset') { reset(); return json(res, 200, { ok: true }); }
	if (p === '/__records') return json(res, 200, org.records[q.get('module')]);

	// OAuth (accounts server)
	if (p === '/oauth/v2/token' && req.method === 'POST') {
		if (q.get('grant_type') !== 'refresh_token' || q.get('refresh_token') !== 'mock-refresh-token' || !q.get('client_id')) return json(res, 200, { error: 'invalid_code' });
		const t = 'mock.' + Math.random().toString(36).slice(2); tokens.add(t);
		return json(res, 200, { access_token: t, api_domain: `http://127.0.0.1:${PORT}`, token_type: 'Bearer', expires_in: 3600 });
	}

	if (!p.startsWith('/crm/v8/')) return err(res, 404, 'INVALID_URL_PATTERN', 'Please check if the URL trying to access is a correct one');
	const auth = (req.headers.authorization || '').match(/^Zoho-oauthtoken (.+)$/);
	if (!auth || !tokens.has(auth[1])) return err(res, 401, 'INVALID_TOKEN', 'invalid oauth token');

	inFlight++; stats.maxInFlight = Math.max(stats.maxInFlight, inFlight);
	try {
		if (inFlight > CONCURRENCY) { stats.rejected429++; return err(res, 429, 'TOO_MANY_REQUESTS', 'concurrency limit exceeded'); }
		await sleep(LATENCY[0] + Math.random() * (LATENCY[1] - LATENCY[0]));
		const parts = p.slice('/crm/v8/'.length).split('/');

		if (parts[0] === 'users') {
			charge('users', 1);
			const type = q.get('type') || 'AllUsers';
			const list = org.users.filter((u) => type === 'AllUsers' || (type === 'ActiveUsers' ? u.status === 'active' : type === 'DeactiveUsers' ? u.status !== 'active' : true));
			return json(res, 200, { users: list, info: { per_page: 200, count: list.length, page: 1, more_records: false } });
		}
		if (parts[0] === 'settings') {
			if (parts[1] === 'fields') {
				const m = q.get('module'); if (!org.fields[m]) return err(res, 400, 'INVALID_MODULE', 'the module name given seems to be invalid', { param_name: 'module' });
				charge('settings/fields', 1); return json(res, 200, { fields: org.fields[m] });
			}
			if (parts[1] === 'layouts') { charge('settings/layouts', 1); return json(res, 200, { layouts: org.layouts[q.get('module')] || [] }); }
			if (parts[1] === 'pipeline') {
				if (!q.get('layout_id')) return err(res, 400, 'REQUIRED_PARAM_MISSING', 'One of the expected parameter is missing', { param_name: 'layout_id' });
				charge('settings/pipeline', 1); return json(res, 200, { pipeline: org.pipeline });
			}
			if (parts[1] === 'automation' && parts[2] === 'workflow_rules') {
				if (parts[3] === 'actions' && parts[4] === 'rules_count') { charge('workflow_rules/rules_count', 1); return json(res, 200, { rules_count: org.rulesCount }); }
				charge('workflow_rules', 1);
				const m = q.get('module'); const inner = (q.get('include_inner_details') || '').includes('conditions');
				if (inner && !m) return err(res, 400, 'REQUIRED_PARAM_MISSING', 'module is required with include_inner_details', { param_name: 'module' });
				let list = org.workflows.filter((w) => !m || w.module.api_name === m);
				if (q.get('status_active')) list = list.filter((w) => String(w.status.active) === q.get('status_active'));
				if (!inner) list = list.map(({ conditions, ...w }) => w);
				return json(res, 200, { workflow_rules: list, info: { per_page: 200, count: list.length, page: 1, more_records: false } });
			}
			return err(res, 404, 'INVALID_URL_PATTERN', 'unsupported settings path in mock');
		}

		const mod = parts[0];
		if (!MODULES.includes(mod)) return err(res, 400, 'INVALID_MODULE', 'the module name given seems to be invalid');
		const recs = org.records[mod];

		// merge
		if (parts[2] === 'actions' && parts[3] === 'merge' && req.method === 'POST') {
			const b = await body(req); charge('merge', 1);
			const master = recs.find((r) => r.id === parts[1]);
			const kids = b?.merge?.[0]?.data;
			if (!master) return err(res, 400, 'INVALID_DATA', 'the id given seems to be invalid', { api_name: 'id' });
			if (!Array.isArray(kids) || !kids.length) return err(res, 400, 'MANDATORY_NOT_FOUND', 'required field not found', { api_name: 'data' });
			if (kids.length > 2) return err(res, 400, 'LIMIT_EXCEEDED', 'maximum two child records can be merged at a time', { limit: 2 });
			if (mod === 'Deals' && String(master.Stage).startsWith('Closed')) return err(res, 400, 'NOT_ALLOWED', 'closed deals cannot be merged');
			for (const k of kids) {
				const child = recs.find((r) => r.id === k.id); if (!child) return err(res, 400, 'INVALID_DATA', 'the id given seems to be invalid', { id: k.id });
				for (const f of k._fields || []) master[f.api_name] = child[f.api_name];
				// related records follow the master (deals and contacts pointing at a merged contact/account)
				for (const m2 of MODULES) for (const r of org.records[m2]) for (const key of ['Contact_Name', 'Account_Name']) if (r[key] && r[key].id === child.id) r[key] = { ...r[key], id: master.id };
				org.records[mod] = org.records[mod].filter((r) => r.id !== child.id);
				stats.writes.merged++;
			}
			master.Modified_Time = org.org.today;
			return json(res, 200, { merge: [{ code: 'SUCCESS', details: { id: master.id }, message: 'Merged successfully', status: 'success' }] });
		}

		// update
		if (req.method === 'PUT' && parts.length === 1) {
			const b = await body(req); const data = b?.data;
			if (!Array.isArray(data)) return err(res, 400, 'INVALID_DATA', 'invalid data');
			if (data.length > 100) return err(res, 400, 'LIMIT_EXCEEDED', 'Only 100 records can be updated per call', { limit: 100 });
			charge('update ' + mod, Math.ceil(data.length / 10));
			const out = data.map((d) => {
				const r = recs.find((x) => x.id === d.id);
				if (!r) return { code: 'INVALID_DATA', details: { api_name: 'id' }, message: 'the id given seems to be invalid', status: 'error' };
				const bad = Object.keys(d).find((k) => k !== 'id' && !org.fields[mod].some((f) => f.api_name === k));
				if (bad) return { code: 'INVALID_DATA', details: { api_name: bad }, message: 'invalid field', status: 'error' };
				for (const [k, v] of Object.entries(d)) if (k !== 'id') {
					const f = org.fields[mod].find((x) => x.api_name === k);
					if (f.data_type === 'ownerlookup') { const u = org.users.find((x) => x.id === (v.id || v)); if (!u || u.status !== 'active') /* cautious: treat inactive owners as invalid */ return { code: 'INVALID_DATA', details: { api_name: k }, message: 'invalid owner', status: 'error' }; r[k] = { name: u.full_name, id: u.id, email: u.email }; }
					else r[k] = v;
				}
				r.Modified_Time = org.org.today; stats.writes.updated++;
				return { code: 'SUCCESS', details: { Modified_Time: r.Modified_Time, id: r.id }, message: 'record updated', status: 'success' };
			});
			return json(res, out.every((o) => o.status === 'success') ? 200 : 207, { data: out });
		}

		// get records
		if (req.method === 'GET' && parts.length === 1) {
			const fields = (q.get('fields') || '').split(',').filter(Boolean);
			if (!fields.length) return err(res, 400, 'REQUIRED_PARAM_MISSING', 'One of the expected parameter is missing', { param_name: 'fields' });
			if (fields.length > 50) return err(res, 400, 'LIMIT_EXCEEDED', 'fields limit exceeded', { limit: 50 });
			const per = Math.min(Number(q.get('per_page') || 200), 200);
			if (q.get('page') && q.get('page_token')) return err(res, 400, 'INVALID_REQUEST', 'page and page_token cannot be used together');
			let start;
			if (q.get('page_token')) { start = pageTokens.get(q.get('page_token')); if (start === undefined) return err(res, 400, 'INVALID_DATA', 'invalid page token', { param_name: 'page_token' }); }
			else { const page = Number(q.get('page') || 1); start = (page - 1) * per; if (start + per > 2000) return err(res, 400, 'DISCRETE_PAGINATION_LIMIT_EXCEEDED', 'use page_token to fetch more than 2000 records', { limit: 2000 }); }
			charge('get ' + mod, 1);
			const sorted = recs; // stable id order
			const slice = sorted.slice(start, start + per).map((r) => Object.fromEntries([['id', r.id], ...fields.map((f) => [f, r[f] === undefined ? null : r[f]])]));
			const more = start + per < sorted.length;
			let next = null;
			if (more) { next = 'pt' + Math.random().toString(36).slice(2, 14); pageTokens.set(next, start + per); }
			return json(res, 200, { data: slice, info: { per_page: per, count: slice.length, page: Math.floor(start / per) + 1, sort_by: 'id', sort_order: 'desc', more_records: more, next_page_token: next, previous_page_token: null, page_token_expiry: next ? org.org.today : null } });
		}
		return err(res, 405, 'METHOD_NOT_ALLOWED', 'method not supported in mock');
	} finally { inFlight--; }
});
server.listen(PORT, '127.0.0.1', () => console.log(`mock Zoho CRM v8 on http://127.0.0.1:${PORT}`));
