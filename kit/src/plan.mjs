// Turns an audit into a change plan. Nothing here calls Zoho: the plan is a JSON file you can read, edit and
// approve. Record changes are applied by apply.mjs; settings changes are listed as manual steps.
import * as N from './normalize.mjs';
import { mergePlan, prep } from './dupes.mjs';
import { remapUpdates } from './picklists.mjs';

const MERGE_MODULES = ['Leads', 'Contacts'];
const PROTECTED = new Set(['Stage', 'Pipeline', 'Lead_Status', 'Rating']);

export function buildPlan(snap, aud, { mappings = {}, phoneFormat = 'e164', reassign = 'round-robin' } = {}) {
	const byId = new Map(); for (const recs of Object.values(snap.records)) for (const r of recs) byId.set(r.id, r);
	const after = new Map(); // id -> record as it will look after merges
	const removed = new Set();
	const merges = [];
	for (const mod of MERGE_MODULES) for (const g of aud.data.duplicates[mod] || []) {
		const m = mergePlan(g, byId);
		const ids = [m.master, ...m.children.map((c) => c.id)];
		const emails = new Set(ids.map((id) => prep(byId.get(id), mod)).filter((p) => p.email && !p.role).map((p) => p.email));
		const status = emails.size > 1 ? 'review' : 'auto'; // two different personal addresses: a person decides
		const master = { ...byId.get(m.master) };
		for (const c of m.children) for (const f of c.fields) master[f] = byId.get(c.id)[f];
		if (status === 'auto') { after.set(m.master, master); m.children.forEach((c) => removed.add(c.id)); }
		const calls = []; for (let i = 0; i < m.children.length; i += 2) calls.push(m.children.slice(i, i + 2));
		merges.push({ module: mod, status, master: m.master, children: m.children, calls: calls.length, reasons: m.reasons, preview: ids.map((id) => { const r = byId.get(id); return { id, name: `${r.First_Name || ''} ${r.Last_Name || ''}`.trim(), email: r.Email, phone: r.Phone, company: r.Company || r.Account_Name?.name || null, created: r.Created_Time }; }) });
	}
	const current = (r) => after.get(r.id) || r;

	const updates = []; // { module, reason, records: [{id, field: value, _before}] }
	const push = (module, reason, records) => { const live = records.filter((r) => !removed.has(r.id)); if (live.length) updates.push({ module, reason, records: live }); };

	// picklist values: spelling variants found by the audit, then meaning-level decisions from mappings/
	for (const field of new Set(aud.data.picklists.map((p) => p.field))) {
		if (PROTECTED.has(field)) continue; // stages and statuses change only through an explicit mapping (below)
		const map = {};
		for (const p of aud.data.picklists.filter((x) => x.field === field)) for (const g of p.groups) for (const m of g.members) if (m.value !== g.canonical) map[m.value] = g.canonical;
		Object.assign(map, mappings[field]?.map || {});
		for (const [k, v] of Object.entries(map)) if (map[v] && map[v] !== v) map[k] = map[v]; // chains: web form -> Web Form -> Website
		if (!Object.keys(map).length) continue;
		for (const [mod, ups] of Object.entries(remapUpdates({ ...snap, records: Object.fromEntries(Object.entries(snap.records).map(([m, rs]) => [m, rs.map(current)])) }, field, map))) push(mod, `${field}: merge spelling variants`, ups);
	}
	// owners: records of deactivated users go to active people, evenly
	const active = snap.users.filter((u) => u.status === 'active' && (!mappings.owners?.only || mappings.owners.only.includes(u.full_name)));
	const inactive = new Set(snap.users.filter((u) => u.status !== 'active').map((u) => u.id));
	let rr = 0;
	for (const [mod, recs] of Object.entries(snap.records)) {
		const ups = recs.filter((r) => r.Owner && inactive.has(r.Owner.id)).map((r) => { const u = reassign === 'round-robin' ? active[rr++ % active.length] : active.find((x) => x.full_name === reassign); return { id: r.id, Owner: { id: u.id }, _before: { Owner: r.Owner }, _to: u.full_name }; });
		push(mod, 'Owner: reassign from deactivated users', ups);
	}
	// stages that left the pipeline
	if (mappings.Stage?.map) for (const [mod, ups] of Object.entries(remapUpdates(snap, 'Stage', mappings.Stage.map))) push(mod, 'Stage: move off retired stages', ups);
	// phones in one format, emails trimmed and lower-case
	for (const mod of ['Leads', 'Contacts', 'Accounts']) {
		const ups = [];
		for (const r0 of snap.records[mod] || []) {
			const r = current(r0); const u = { id: r.id }; const before = {};
			for (const k of ['Phone', 'Mobile']) if (r[k]) { const p = N.phone(r[k]); const want = p && phoneFormat === 'e164' ? p : r[k]; if (p && want !== r[k]) { u[k] = want; before[k] = r[k]; } }
			if (r.Email && N.email(r.Email) && N.email(r.Email) !== r.Email) { u.Email = N.email(r.Email); before.Email = r.Email; }
			if (Object.keys(u).length > 1) ups.push({ ...u, _before: before });
		}
		push(mod, 'Phone/Email: one format', ups);
	}

	const auto = merges.filter((m) => m.status === 'auto');
	const recordUpdates = updates.reduce((s, u) => s + u.records.length, 0);
	const updateCalls = updates.reduce((s, u) => s + Math.ceil(u.records.length / 100), 0);
	const updateCredits = updates.reduce((s, u) => { let c = 0; for (let i = 0; i < u.records.length; i += 100) c += Math.ceil(Math.min(100, u.records.length - i) / 10); return s + c; }, 0);
	const manual = buildManual(snap, aud, mappings);
	return {
		createdFrom: snap.takenAt, summary: {
			mergeGroups: merges.length, autoMerges: auto.length, reviewMerges: merges.length - auto.length, recordsRemovedByAutoMerge: removed.size,
			recordUpdates, apiCalls: auto.reduce((s, m) => s + m.calls, 0) + updateCalls, apiCredits: auto.reduce((s, m) => s + m.calls, 0) + updateCredits, manualSteps: manual.length,
		},
		merges, updates, manual,
	};
}

function buildManual(snap, aud, mappings) {
	const steps = [];
	const f = (id) => aud.findings.find((x) => x.id === id);
	const byField = new Map();
	for (const p of aud.data.picklists) { if (!byField.has(p.field)) byField.set(p.field, []); byField.get(p.field).push(p); }
	for (const [field, list] of byField) {
		const mods = list.map((p) => p.module); const label = list[0].label;
		if (field === 'Stage') { const retired = Object.keys(mappings.Stage?.map || {}); if (retired.length) steps.push({ area: 'Pipeline', module: 'Deals', what: `Stage: remove the retired stages ${retired.map((x) => `"${x}"`).join(', ')} from the picklist once their deals have moved`, where: 'Setup > Modules and Fields > Deals > Stage' }); continue; }
		if (PROTECTED.has(field)) continue;
		const variants = new Set(list.flatMap((p) => p.groups.flatMap((g) => g.members.filter((m) => m.value !== g.canonical).map((m) => m.value))).concat(Object.keys(mappings[field]?.map || {})));
		const unused = new Set(list.flatMap((p) => p.unused));
		if (variants.size || unused.size) steps.push({ area: 'Fields', module: mods.join(', '), what: `${label} (${mods.join(', ')}): remove ${variants.size} merged variants and ${unused.size} options nobody uses, after the record updates`, where: `Setup > Modules and Fields > {module} > ${label}` });
	}
	for (const s of aud.data.sparse) steps.push({ area: 'Fields', module: s.module, what: `Export then retire "${s.label}" (${s.filled} records filled)`, where: `Setup > Modules and Fields > ${s.module}` });
	const dupRules = f('workflows.duplicate'); if (dupRules?.count) steps.push({ area: 'Workflows', what: `Deactivate the copy: ${dupRules.detail.split('.')[0]}`, where: 'Setup > Automation > Workflow Rules' });
	const noisy = f('workflows.noisy'); if (noisy?.count) steps.push({ area: 'Workflows', what: `Replace ${noisy.detail.split(':')[0]} with alerts on the changes that matter (new hot lead, stage change) and a daily digest report`, where: 'Setup > Automation > Workflow Rules; Reports > Schedule' });
	const ghost = f('workflows.ghost'); if (ghost?.count) steps.push({ area: 'Workflows', what: `Delete ${ghost.detail} (its stage is gone)`, where: 'Setup > Automation > Workflow Rules' });
	const hooks = f('workflows.webhooks'); if (hooks?.count) steps.push({ area: 'Workflows', what: `Confirm or remove ${hooks.detail}`, where: 'Setup > Automation > Actions > Webhooks' });
	const dead = f('workflows.dead'); if (dead?.count) steps.push({ area: 'Workflows', what: `Delete inactive/never-run rules: ${dead.detail}`, where: 'Setup > Automation > Workflow Rules' });
	steps.push({ area: 'Duplicates', what: 'Turn on duplicate check for Email on web forms and imports so new duplicates stop at the door', where: 'Setup > Modules and Fields > Leads > Email (unique) / Web Forms' });
	steps.push({ area: 'Leads', what: 'Assignment rule for new leads (round robin by region) so no lead waits unowned', where: 'Setup > Automation > Assignment Rules' });
	steps.push({ area: 'Pipeline', what: 'Make Loss Reason mandatory when Stage = Closed Lost (layout rule or validation rule)', where: 'Setup > Modules and Fields > Deals > Layout Rules' });
	return steps;
}
