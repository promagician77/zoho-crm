// End-to-end against the bundled mock API: paging past 2,000 records, field chunks, credit counting,
// limits enforced by the API, apply and rollback.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { Zoho } from '../src/zoho.mjs';
import { takeSnapshot } from '../src/snapshot.mjs';
import { audit } from '../src/audit.mjs';
import { buildPlan } from '../src/plan.mjs';
import { applyPlan, rollback } from '../src/apply.mjs';

const PORT = 8790, URL_ = `http://127.0.0.1:${PORT}`;
let srv;
const z = () => new Zoho({ accountsUrl: URL_, apiDomain: URL_, clientId: 'mock', clientSecret: 'x', refreshToken: 'mock-refresh-token', concurrency: 5 });
before(async () => { srv = spawn(process.execPath, [new URL('../../mock/server.mjs', import.meta.url).pathname, String(PORT)], { stdio: 'ignore' }); for (let i = 0; i < 50; i++) { try { await fetch(URL_ + '/__stats'); return; } catch { await new Promise((r) => setTimeout(r, 100)); } } });
after(() => srv.kill());
const stats = async () => (await fetch(URL_ + '/__stats')).json();

test('the API refuses what Zoho refuses', async () => {
	await fetch(URL_ + '/__reset');
	const c = z();
	await assert.rejects(c.request('GET', 'Leads', { query: { per_page: 200 } }), /REQUIRED_PARAM_MISSING/);
	await assert.rejects(c.request('GET', 'Leads', { query: { fields: 'Last_Name', page: 11, per_page: 200 } }), /DISCRETE_PAGINATION_LIMIT_EXCEEDED/);
	await assert.rejects(c.request('GET', 'settings/pipeline'), /REQUIRED_PARAM_MISSING/);
	const big = Array.from({ length: 101 }, (_, i) => ({ id: String(i) }));
	await assert.rejects(c.request('PUT', 'Leads', { body: { data: big } }), /LIMIT_EXCEEDED/);
});
test('paging reads every record past 2,000 and field chunks over 49 are stitched together', async () => {
	await fetch(URL_ + '/__reset');
	const c = z();
	const names = ['Last_Name', ...Array.from({ length: 60 }, (_, i) => 'X' + i)];
	const recs = await c.records('Leads', names);
	const all = await (await fetch(URL_ + '/__records?module=Leads')).json();
	assert.equal(recs.length, all.length); assert.ok(all.length > 2000);
	assert.equal(new Set(recs.map((r) => r.id)).size, all.length);
	assert.ok('X59' in recs[0] && 'Last_Name' in recs[0]);
	const pages = Math.ceil(all.length / 200);
	assert.equal(c.calls, pages * 2); // two field chunks
	assert.equal((await stats()).credits, c.credits);
});
test('snapshot -> plan -> apply -> rollback round trip', async () => {
	await fetch(URL_ + '/__reset');
	const c = z();
	const snap = await takeSnapshot(c, { asOf: '2026-11-02T12:00:00-05:00' });
	const plan = buildPlan(snap, audit(snap));
	const dry = await applyPlan(null, plan, { dryRun: true });
	assert.equal(dry.requests.length, plan.summary.apiCalls);
	const before = (await stats()).credits;
	const { journal } = await applyPlan(c, plan, { dryRun: false });
	assert.equal(journal.errors.length, 0);
	assert.equal((await stats()).credits - before, plan.summary.apiCredits, 'plan credit estimate = credits the API charged');
	const leadsAfter = await (await fetch(URL_ + '/__records?module=Leads')).json();
	assert.equal(snap.records.Leads.length - leadsAfter.length, plan.merges.filter((m) => m.status === 'auto' && m.module === 'Leads').reduce((s, m) => s + m.children.length, 0));
	const snap2 = await takeSnapshot(c, { asOf: '2026-11-02T12:00:00-05:00' });
	assert.equal(buildPlan(snap2, audit(snap2)).summary.recordUpdates, 0, 'a second run has nothing left to change');
	// rollback puts every updated field back
	const rb = await rollback(c, journal);
	const ownerChanges = journal.updates.filter((u) => 'Owner' in u.before).length;
	assert.equal(rb.failed.length, ownerChanges, 'the mock refuses owners who are deactivated; those owner restores are reported, not silently lost');
	const restored = await (await fetch(URL_ + '/__records?module=Leads')).json();
	const orig = new Map(snap.records.Leads.map((r) => [r.id, r]));
	let diffs = 0;
	for (const r of restored) { const o = orig.get(r.id); for (const k of ['Lead_Source', 'Phone', 'Mobile', 'Email']) if (o[k] !== r[k] && !journal.merges.some((m) => m.master === r.id)) diffs++; }
	assert.equal(diffs, 0);
});
