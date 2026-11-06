#!/usr/bin/env node
// zcrm: audit and clean up a Zoho CRM org through the v8 API.
//   zcrm snapshot  --out snapshot.json              read-only copy of metadata + records
//   zcrm audit     snapshot.json [--edition Professional] [--out audit.json]
//   zcrm plan      snapshot.json [--mappings mappings/] [--out plan.json]
//   zcrm apply     plan.json [--yes] [--approve auto|all] [--journal journal.json]   (dry run without --yes)
//   zcrm rollback  journal.json --yes               restore before-values of applied updates
//   zcrm register  snapshot.json [--out register.md]
//   zcrm simulate  snapshot.json events.json [--licenses 6] [--rules rules.json]
// Connection: ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_DC=us|eu|in|au|jp|ca
//             or --mock http://127.0.0.1:8701 for the bundled sample org.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Zoho } from '../src/zoho.mjs';
import { takeSnapshot } from '../src/snapshot.mjs';
import { audit } from '../src/audit.mjs';
import { buildPlan } from '../src/plan.mjs';
import { applyPlan, rollback } from '../src/apply.mjs';
import { registerData, registerMarkdown } from '../src/register.mjs';
import { simulate } from '../src/simulate.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const args = { _: [] };
for (let i = 0; i < rest.length; i++) { const a = rest[i]; if (a.startsWith('--')) { const k = a.slice(2); const v = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true; args[k] = v; } else args._.push(a); }
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const write = (p, o) => { writeFileSync(p, typeof o === 'string' ? o : JSON.stringify(o, null, 1)); console.error(`wrote ${p}`); };
const client = () => {
	if (args.mock) return new Zoho({ accountsUrl: args.mock, apiDomain: args.mock, clientId: 'mock', clientSecret: 'mock', refreshToken: 'mock-refresh-token', concurrency: Number(args.concurrency || 5) });
	const z = Zoho.fromEnv(); if (args.concurrency) z.concurrency = Number(args.concurrency); return z;
};
const mappings = (dir) => { const m = {}; if (dir && existsSync(dir)) for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) m[f.replace(/\.json$/, '')] = read(join(dir, f)); return m; };

switch (cmd) {
	case 'snapshot': {
		const z = client();
		const snap = await takeSnapshot(z, { asOf: args['as-of'], modules: args.modules ? String(args.modules).split(',') : undefined, log: (m) => console.error(m) });
		write(args.out || 'snapshot.json', snap);
		console.log(`${Object.entries(snap.records).map(([m, r]) => `${m} ${r.length}`).join(', ')} · ${snap.api.calls} API calls, ${snap.api.credits} credits, ${(snap.api.ms / 1000).toFixed(1)} s`);
		break;
	}
	case 'audit': {
		const a = audit(read(args._[0]), { edition: args.edition || 'Professional' });
		write(args.out || 'audit.json', a);
		for (const f of a.findings) console.log(`${f.severity.padEnd(6)} ${String(f.count).padStart(5)} ${f.unit.padEnd(18)} ${f.title}`);
		break;
	}
	case 'plan': {
		const snap = read(args._[0]);
		const a = args.audit ? read(args.audit) : audit(snap, { edition: args.edition || 'Professional' });
		const p = buildPlan(snap, a, { mappings: mappings(args.mappings || 'mappings') });
		write(args.out || 'plan.json', p);
		console.log(JSON.stringify(p.summary, null, 1));
		break;
	}
	case 'apply': {
		const plan = read(args._[0]);
		const approve = args.approve === 'all' ? 'all' : 'auto';
		const r = await applyPlan(args.yes ? client() : null, plan, { dryRun: !args.yes, approve, log: (m) => console.error(m) });
		if (r.dryRun) { console.log(`DRY RUN: ${r.requests.length} requests (${r.requests.filter((q) => q.method === 'POST').length} merges, ${r.requests.filter((q) => q.method === 'PUT').length} update batches). Add --yes to run.`); break; }
		write(args.journal || 'journal.json', r.journal);
		console.log(`merge calls ${r.journal.merges.length}, records updated ${r.journal.updates.length}, errors ${r.journal.errors.length}`);
		break;
	}
	case 'rollback': {
		if (!args.yes) { console.log('Add --yes to restore the before-values in this journal.'); break; }
		const rb = await rollback(client(), read(args._[0])); console.log(`restored ${rb.restored} record changes; ${rb.failed.length} could not be restored`); if (rb.failed.length) write('rollback-failed.json', rb.failed);
		break;
	}
	case 'register': {
		const d = registerData(read(args._[0]), { edition: args.edition || 'Professional' });
		write(args.out || 'register.md', registerMarkdown(d));
		break;
	}
	case 'simulate': {
		const snap = read(args._[0]); const ev = read(args._[1]);
		const rules = args.rules ? read(args.rules) : snap.workflows;
		const s = simulate(rules, ev.events, { edition: args.edition || 'Professional', licenses: Number(args.licenses || ev.users || 5) });
		console.log(`cap ${s.cap}/day · average ${s.avg} · peak ${s.peak} · days over cap ${s.daysOverCap} · e-mails over cap ${s.dropped}`);
		if (args.out) write(args.out, s);
		break;
	}
	default:
		console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
}
