// Minimal Zoho CRM v8 client: OAuth refresh, paging (page -> page_token past 2,000 records), field chunks of
// 50, bounded concurrency, retry on 429/5xx, and an API-credit tally using Zoho's published costs.
export const DATA_CENTERS = {
	us: { accounts: 'https://accounts.zoho.com', api: 'https://www.zohoapis.com' },
	eu: { accounts: 'https://accounts.zoho.eu', api: 'https://www.zohoapis.eu' },
	in: { accounts: 'https://accounts.zoho.in', api: 'https://www.zohoapis.in' },
	au: { accounts: 'https://accounts.zoho.com.au', api: 'https://www.zohoapis.com.au' },
	jp: { accounts: 'https://accounts.zoho.jp', api: 'https://www.zohoapis.jp' },
	ca: { accounts: 'https://accounts.zohocloud.ca', api: 'https://www.zohoapis.ca' },
};

// Credits per Zoho's API limits page: update/insert 1 per 10 records, bulk read 50, records with cvid 3,
// everything else (get records, metadata, merge, users) 1.
export function creditCost(method, path, body) {
	if ((method === 'PUT' || method === 'POST') && Array.isArray(body?.data) && !/\/actions\//.test(path)) return Math.max(1, Math.ceil(body.data.length / 10));
	if (/\/bulk\/v\d\/read/.test(path)) return 50;
	return 1;
}

export class Zoho {
	constructor({ accountsUrl, apiDomain, clientId, clientSecret, refreshToken, concurrency = 5, version = 'v8', log = () => {} }) {
		Object.assign(this, { accountsUrl, apiDomain, clientId, clientSecret, refreshToken, concurrency, version, log });
		this.token = null; this.expires = 0; this.credits = 0; this.calls = 0; this.retries = 0;
		this.active = 0; this.queue = [];
	}
	static fromEnv(env = process.env) {
		const dc = DATA_CENTERS[env.ZOHO_DC || 'us'] || DATA_CENTERS.us;
		return new Zoho({ accountsUrl: env.ZOHO_ACCOUNTS_URL || dc.accounts, apiDomain: env.ZOHO_API_DOMAIN || dc.api, clientId: env.ZOHO_CLIENT_ID, clientSecret: env.ZOHO_CLIENT_SECRET, refreshToken: env.ZOHO_REFRESH_TOKEN, concurrency: Number(env.ZOHO_CONCURRENCY || 5) });
	}
	async auth() {
		if (this.token && Date.now() < this.expires - 60e3) return this.token;
		if (!this.clientId || !this.refreshToken) throw new Error('Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET and ZOHO_REFRESH_TOKEN (a Self Client in api-console.zoho.com).');
		const u = new URL('/oauth/v2/token', this.accountsUrl);
		for (const [k, v] of Object.entries({ refresh_token: this.refreshToken, client_id: this.clientId, client_secret: this.clientSecret, grant_type: 'refresh_token' })) u.searchParams.set(k, v || '');
		const r = await fetch(u, { method: 'POST' }); const j = await r.json();
		if (!j.access_token) throw new Error('Token refresh failed: ' + JSON.stringify(j));
		this.token = j.access_token; this.expires = Date.now() + (j.expires_in || 3600) * 1000;
		if (j.api_domain) this.apiDomain = j.api_domain;
		return this.token;
	}
	async slot() { if (this.active < this.concurrency) { this.active++; return; } await new Promise((ok) => this.queue.push(ok)); this.active++; }
	release() { this.active--; const n = this.queue.shift(); if (n) n(); }
	async request(method, path, { query, body } = {}) {
		await this.slot();
		try {
			for (let attempt = 0; ; attempt++) {
				const u = new URL(`/crm/${this.version}/${path}`, this.apiDomain);
				for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null) u.searchParams.set(k, v);
				const r = await fetch(u, { method, headers: { Authorization: 'Zoho-oauthtoken ' + (await this.auth()), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
				if (r.status === 401 && attempt === 0) { this.token = null; continue; }
				if ((r.status === 429 || r.status >= 500) && attempt < 5) { this.retries++; await new Promise((ok) => setTimeout(ok, 300 * 2 ** attempt)); continue; }
				this.calls++; this.credits += creditCost(method, path, body);
				if (r.status === 204) return {};
				const j = await r.json();
				if (r.status >= 400 && r.status !== 207) { const e = new Error(`${method} ${path}: ${j.code} ${j.message}`); e.zoho = j; e.status = r.status; throw e; }
				return j;
			}
		} finally { this.release(); }
	}
	// all records of a module with the given fields: chunks of 49 fields (+id), page 1 then next_page_token
	async records(module, fields) {
		const chunks = []; const list = fields.filter((f) => f !== 'id');
		for (let i = 0; i < list.length; i += 49) chunks.push(list.slice(i, i + 49));
		const byId = new Map();
		for (const chunk of chunks) {
			let token = null, page = 1;
			for (;;) {
				const j = await this.request('GET', module, { query: { fields: chunk.join(','), per_page: 200, ...(token ? { page_token: token } : { page }) } });
				for (const r of j.data || []) byId.set(r.id, { ...(byId.get(r.id) || {}), ...r });
				if (!j.info?.more_records) break;
				token = j.info.next_page_token; if (!token) page++;
			}
		}
		return [...byId.values()];
	}
}
