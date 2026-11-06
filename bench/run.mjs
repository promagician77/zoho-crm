// Full measured run on the sample org: snapshot -> audit -> plan -> apply -> snapshot -> audit -> plan,
// scored against the planted ground truth. Writes results/measurements.json (everything the site shows).
//   node bench/run.mjs   (starts its own mock API)
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Zoho } from '../kit/src/zoho.mjs';
import { takeSnapshot } from '../kit/src/snapshot.mjs';
import { audit } from '../kit/src/audit.mjs';
import { buildPlan } from '../kit/src/plan.mjs';
import { applyPlan } from '../kit/src/apply.mjs';
import { findDuplicates, naiveLoose, naiveExact, score, crossModule } from '../kit/src/dupes.mjs';
import { simulate } from '../kit/src/simulate.mjs';
import { registerData, registerMarkdown } from '../kit/src/register.mjs';
import { EDITIONS, emailCap, apiCredits } from '../kit/src/limits.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const OUT = ROOT + 'results/';
mkdirSync(OUT + 'run', { recursive: true });
const PORT = 8711, API = `http://127.0.0.1:${PORT}`;
const AS_OF = '2026-11-02T12:00:00-05:00';
const read = (p) => JSON.parse(readFileSync(ROOT + p, 'utf8'));
const save = (p, o) => writeFileSync(OUT + p, typeof o === 'string' ? o : JSON.stringify(o, null, 1));

execFileSync(process.execPath, [ROOT + 'mock/seed.mjs'], { stdio: 'inherit' });
const truth = read('mock/data/truth.json'), events = read('mock/data/events.json');
const srv = spawn(process.execPath, [ROOT + 'mock/server.mjs', String(PORT)], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { await fetch(API + '/__stats'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
const stats = async () => (await fetch(API + '/__stats')).json();
const client = () => new Zoho({ accountsUrl: API, apiDomain: API, clientId: 'mock', clientSecret: 'x', refreshToken: 'mock-refresh-token', concurrency: 5 });
const mappings = { Lead_Source: read('mappings/Lead_Source.json'), Stage: read('mappings/Stage.json'), owners: read('mappings/owners.json') };
const M = { generatedAt: new Date().toISOString(), asOf: AS_OF, org: null, edition: 'Professional' };

try {
	// 1. snapshot + audit
	let z = client(); let t = Date.now();
	const before = await takeSnapshot(z, { asOf: AS_OF });
	M.snapshot = { calls: z.calls, credits: z.credits, serverCredits: (await stats()).credits, ms: Date.now() - t, records: Object.fromEntries(Object.entries(before.records).map(([k, v]) => [k, v.length])) };
	save('run/snapshot-before.json', before);
	const licenses = before.users.filter((u) => u.status === 'active').length;
	M.org = { licenses, users: before.users.length, edition: 'Professional', allowance: apiCredits('Professional', licenses) };
	t = Date.now(); const a1 = audit(before, { edition: 'Professional' }); M.auditMs = Date.now() - t;
	save('run/audit-before.json', a1);

	// 2. detection quality against the planted truth
	M.duplicates = {};
	for (const mod of ['Leads', 'Contacts']) {
		const tg = Object.values(truth.duplicates[mod]);
		const ours = score(a1.data.duplicates[mod], tg);
		const loose = score(findDuplicates(before.records[mod], mod, naiveLoose), tg);
		const exact = score(naiveExact(before.records[mod]), tg);
		M.duplicates[mod] = { trueGroups: tg.length, ours, loose, exact };
	}
	const pid = truth.pids; const kinds = truth.dupKinds;
	const missedKinds = {}; for (const g of Object.values(truth.duplicates.Leads)) { const found = a1.data.duplicates.Leads.some((p) => g.every((id) => p.ids.includes(id))); if (!found) for (const id of g) if (kinds[id]) missedKinds[kinds[id]] = (missedKinds[kinds[id]] || 0) + 1; }
	M.duplicates.Leads.missedBy = missedKinds;
	const cm = crossModule(before.records.Leads, before.records.Contacts); const T = new Set(truth.crossModule.map((x) => x.join('|')));
	M.crossModule = { found: cm.length, correct: cm.filter((x) => T.has(x.lead + '|' + x.contact)).length, planted: T.size };

	// 3. picklist variants: spelling check vs meaning-level review
	const variants = Object.entries(truth.sources).filter(([v, c]) => v !== c);
	const src = a1.data.picklists.find((p) => p.module === 'Leads' && p.field === 'Lead_Source');
	const auto = {}; for (const g of src.groups) for (const m of g.members) if (m.value !== g.canonical) auto[m.value] = g.canonical;
	const finalMap = { ...auto, ...mappings.Lead_Source.map }; for (const [k, v] of Object.entries(finalMap)) if (finalMap[v] && finalMap[v] !== v) finalMap[k] = finalMap[v];
	M.picklists = {
		variantsPlanted: variants.length,
		foundBySpelling: variants.filter(([v, c]) => auto[v] === c || (auto[v] && finalMap[auto[v]] === c)).length,
		decidedInReview: Object.keys(mappings.Lead_Source.map).length,
		wrongMerges: Object.entries(finalMap).filter(([v, c]) => truth.sources[v] && truth.sources[v] !== c).length,
		valuesBefore: src.used, unusedOptions: src.unused.length, groups: src.groups.map((g) => ({ canonical: g.canonical, members: g.members.map((m) => [m.value, m.count]) })),
	};

	// 4. plan + apply
	const plan = buildPlan(before, a1, { mappings });
	save('run/plan.json', plan);
	const autoPairs = plan.merges.filter((m) => m.status === 'auto');
	const wrongAuto = autoPairs.filter((m) => { const ids = [m.master, ...m.children.map((c) => c.id)]; return new Set(ids.map((id) => pid[m.module][id])).size > 1; }).length;
	const review = plan.merges.filter((m) => m.status === 'review');
	const reviewTrue = review.filter((m) => { const ids = [m.master, ...m.children.map((c) => c.id)]; return new Set(ids.map((id) => pid[m.module][id])).size === 1; }).length;
	M.plan = { ...plan.summary, autoMergeGroupsWrong: wrongAuto, reviewGroupsTrue: reviewTrue, reviewGroupsFalse: review.length - reviewTrue, updatesByReason: plan.updates.reduce((o, u) => ((o[u.reason] = (o[u.reason] || 0) + u.records.length), o), {}) };
	const dry = await applyPlan(null, plan, { dryRun: true });
	M.dryRun = { requests: dry.requests.length };
	z = client(); const c0 = (await stats()).credits; t = Date.now();
	const { journal } = await applyPlan(z, plan, { dryRun: false });
	M.apply = { ms: Date.now() - t, mergeCalls: journal.merges.length, updated: journal.updates.length, errors: journal.errors.length, clientCredits: z.credits, serverCredits: (await stats()).credits - c0, estimate: plan.summary.apiCredits, maxInFlight: (await stats()).maxInFlight, rejected429: (await stats()).rejected429 };
	save('run/journal.json', journal);

	// 5. after
	z = client(); const after = await takeSnapshot(z, { asOf: AS_OF });
	save('run/snapshot-after.json', after);
	const a2 = audit(after, { edition: 'Professional' });
	save('run/audit-after.json', a2);
	const plan2 = buildPlan(after, a2, { mappings });
	M.secondRun = plan2.summary;
	const pick = (a) => Object.fromEntries(a.findings.map((f) => [f.id, f.count]));
	M.findings = { before: a1.findings.map(({ examples, ...f }) => f), after: pick(a2) };

	// 6. report data for the before/after dashboards
	const bySource = (snap) => { const o = {}; for (const r of snap.records.Leads) { const k = r.Lead_Source || '(none)'; o[k] = (o[k] || 0) + 1; } return Object.entries(o).sort((x, y) => y[1] - x[1]); };
	const won = (snap) => { const o = {}; for (const d of snap.records.Deals) if (d.Stage === 'Closed Won') { const k = d.Lead_Source || '(none)'; o[k] = (o[k] || 0) + (d.Amount || 0); } return Object.entries(o).sort((x, y) => y[1] - x[1]); };
	const stagesOf = (snap) => { const st = snap.pipeline[0].maps.map((m) => m.actual_value); const o = {}; for (const d of snap.records.Deals) { const k = st.includes(d.Stage) ? d.Stage : d.Stage + ' (retired)'; o[k] = o[k] || { count: 0, amount: 0 }; o[k].count++; o[k].amount += d.Amount || 0; } return o; };
	const owners = (snap) => { const o = {}; for (const r of snap.records.Leads) o[r.Owner.name] = (o[r.Owner.name] || 0) + 1; return o; };
	const now = new Date(AS_OF).getTime();
	const openOverdue = (snap) => { const st = new Map(snap.pipeline[0].maps.map((m) => [m.actual_value, m])); return snap.records.Deals.filter((d) => (st.get(d.Stage)?.forecast_type || 'Open') === 'Open' && !String(d.Stage).startsWith('Closed')).map((d) => ({ stage: d.Stage, amount: d.Amount || 0, overdue: new Date(d.Closing_Date + 'T23:59:59').getTime() < now, idleDays: Math.round((now - new Date(d.Last_Activity_Time || d.Created_Time).getTime()) / 864e5) })); };
	M.reports = { sourceBefore: bySource(before), sourceAfter: bySource(after), wonBySourceBefore: won(before), wonBySourceAfter: won(after), stagesBefore: stagesOf(before), stagesAfter: stagesOf(after), ownersBefore: owners(before), ownersAfter: owners(after), openDeals: openOverdue(after) };

	// 7. workflow e-mail volume: current rules vs the proposed set, on the same 30 days of activity
	const OFF = ['New web lead - notify owner (copy)', 'Lead changed - notify owner', 'Deal changed - notify owner', 'Value Proposition stage task', 'Test rule do not use', 'Trade show 2022 follow-up'];
	const proposed = before.workflows.map((w) => {
		const r = JSON.parse(JSON.stringify(w));
		if (OFF.includes(r.name)) r.status.active = false;
		if (r.name === 'New web lead - notify owner') r.conditions[0].criteria_details.criteria.value = ['Website'];
		if (r.name === 'Stage change - notify manager') r.conditions[0].criteria_details = { criteria: { comparator: 'in', field: { api_name: 'Stage' }, value: ['Negotiation/Review', 'Closed Won', 'Closed Lost'] } };
		return r;
	});
	save('proposed-workflows.json', proposed);
	const mapEv = events.events.map((e) => (e.values?.Lead_Source ? { ...e, values: { ...e.values, Lead_Source: finalMap[e.values.Lead_Source] || e.values.Lead_Source } } : e));
	M.email = {};
	for (const ed of ['Standard', 'Professional']) M.email[ed] = { current: simulate(before.workflows, events.events, { edition: ed, licenses }), proposed: simulate(proposed, mapEv, { edition: ed, licenses }) };
	M.proposedOff = OFF;

	// 8. limits table and the configuration register
	M.limits = EDITIONS;
	M.register = registerData(before, { edition: 'Professional' });
	save('register.md', registerMarkdown(M.register, { changes: [
		`Merged ${journal.merges.length} duplicate groups (${plan.summary.recordsRemovedByAutoMerge} records); ${M.plan.reviewMerges} groups left for review`,
		...Object.entries(M.plan.updatesByReason).map(([k, v]) => `${k}: ${v} records`),
	] }));
	M.tests = execFileSync(process.execPath, ['--test', ...['unit', 'api'].map((n) => ROOT + `kit/test/${n}.test.mjs`)], { encoding: 'utf8' }).split('\n').filter((l) => /^# (tests|pass|fail)/.test(l)).map((l) => l.slice(2));
	save('measurements.json', M);
	console.log(JSON.stringify({ snapshot: M.snapshot, duplicates: { Leads: { p: M.duplicates.Leads.ours.precision, r: M.duplicates.Leads.ours.recall, missed: M.duplicates.Leads.missedBy }, Contacts: { p: M.duplicates.Contacts.ours.precision, r: M.duplicates.Contacts.ours.recall } }, cross: M.crossModule, picklists: { ...M.picklists, groups: undefined }, plan: M.plan, apply: M.apply, secondRun: M.secondRun, email: Object.fromEntries(Object.entries(M.email).map(([k, v]) => [k, { cap: v.current.cap, curAvg: v.current.avg, curPeak: v.current.peak, curOver: v.current.daysOverCap, curDropped: v.current.dropped, propAvg: v.proposed.avg, propPeak: v.proposed.peak }])), tests: M.tests }, null, 1));
} finally { srv.kill(); }
