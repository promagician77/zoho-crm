// Audit of a snapshot: every check reads the snapshot only (no API calls), so it can be re-run for free.
import * as N from './normalize.mjs';
import { findDuplicates, crossModule } from './dupes.mjs';
import { picklistReport } from './picklists.mjs';
import { EDITIONS } from './limits.mjs';

const DAY = 864e5;
const OPEN_LEAD = new Set(['Not Contacted', 'Attempted to Contact', 'Contact in Future', 'Contacted', 'Pre-Qualified']);
const sample = (a, n = 5) => a.slice(0, n);

export function audit(snap, { edition = 'Professional', staleDays = 90, dealIdleDays = 30, sparseFill = 0.02 } = {}) {
	const now = new Date(snap.takenAt).getTime();
	const R = snap.records; const F = [];
	const add = (f) => F.push(f);
	const days = (t) => (t ? (now - new Date(t).getTime()) / DAY : Infinity);
	const users = new Map(snap.users.map((u) => [u.id, u]));
	const lim = EDITIONS[edition];

	// 1-3 duplicates
	const dup = {};
	for (const mod of ['Leads', 'Contacts']) {
		const groups = findDuplicates(R[mod], mod);
		dup[mod] = groups;
		const extra = groups.reduce((s, g) => s + g.ids.length - 1, 0);
		const by = {}; for (const g of groups) for (const r of g.reasons) by[r] = (by[r] || 0) + 1;
		add({ id: `duplicates.${mod}`, area: 'Data', title: `Duplicate ${mod.toLowerCase()}`, severity: extra > R[mod].length * 0.02 ? 'high' : 'medium', count: extra, unit: 'extra records', detail: `${groups.length} groups, ${extra} records to merge away (${(100 * extra / R[mod].length).toFixed(1)}% of ${mod}). Matched on: ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ')}.`, examples: sample(groups).map((g) => g.ids) });
	}
	const cross = crossModule(R.Leads, R.Contacts);
	add({ id: 'duplicates.leadIsContact', area: 'Data', title: 'Leads that are already contacts', severity: 'medium', count: cross.length, unit: 'leads', detail: 'Zoho merges only within a module, so these need converting into the existing contact (or deleting) rather than merging.', examples: sample(cross) });
	const roles = {}; for (const r of R.Leads) { const e = N.email(r.Email); if (N.isRoleEmail(e)) (roles[e] = roles[e] || []).push(r.id); }
	const sharedRoles = Object.entries(roles).filter(([, ids]) => ids.length > 1);
	add({ id: 'data.roleEmails', area: 'Data', title: 'Different people sharing info@ / sales@ addresses', severity: 'low', count: sharedRoles.reduce((s, [, i]) => s + i.length, 0), unit: 'leads', detail: 'Not merged: a shared role address is not the same person. Worth asking for a direct address.', examples: sample(sharedRoles.map(([e, ids]) => ({ email: e, ids }))) });

	// 4 records owned by inactive users
	const inactive = snap.users.filter((u) => u.status !== 'active');
	const orphan = {}; for (const [mod, recs] of Object.entries(R)) orphan[mod] = recs.filter((r) => r.Owner && users.get(r.Owner.id)?.status !== 'active').length;
	const orphanTotal = Object.values(orphan).reduce((a, b) => a + b, 0);
	add({ id: 'owners.inactive', area: 'Leads & ownership', title: 'Records owned by deactivated users', severity: orphanTotal ? 'high' : 'low', count: orphanTotal, unit: 'records', detail: `${inactive.map((u) => u.full_name).join(', ') || 'No one'} still owns ${Object.entries(orphan).filter(([, n]) => n).map(([m, n]) => `${n} ${m.toLowerCase()}`).join(', ')}. Workflow alerts to "record owner" on these go nowhere useful.`, examples: [] });

	// 5 stale open leads
	const stale = R.Leads.filter((r) => OPEN_LEAD.has(r.Lead_Status) && days(r.Last_Activity_Time || r.Created_Time) > staleDays);
	const neverTouched = R.Leads.filter((r) => r.Lead_Status === 'Not Contacted' && !r.Last_Activity_Time && days(r.Created_Time) > 14);
	add({ id: 'leads.stale', area: 'Leads & ownership', title: `Open leads with no activity in ${staleDays}+ days`, severity: 'medium', count: stale.length, unit: 'leads', detail: `${(100 * stale.length / R.Leads.length).toFixed(0)}% of all leads sit in an open status untouched. ${neverTouched.length} were never contacted at all after two weeks.`, examples: [] });
	const noSource = R.Leads.filter((r) => N.isEmpty(r.Lead_Source)).length;

	// 6 picklists
	const pl = picklistReport(snap);
	const sprawl = pl.filter((p) => p.groups.length || p.unused.length);
	const src = pl.find((p) => p.module === 'Leads' && p.field === 'Lead_Source');
	if (src) add({ id: 'picklists.leadSource', area: 'Reports', title: 'Lead Source split across spelling variants', severity: 'high', count: src.groups.reduce((s, g) => s + g.members.length - 1, 0), unit: 'variant values', detail: `${src.used} values in use for what are about ${src.used - src.groups.reduce((s, g) => s + g.members.length - 1, 0)} sources, plus ${src.unused.length} options nobody uses. A "leads by source" report shows "LinkedIn", "Linkedin" and "Linked In" as three bars.${noSource ? ` ${noSource} leads have no source.` : ''}`, examples: src.groups.map((g) => ({ canonical: g.canonical, members: g.members.map((m) => `${m.value} (${m.count})`) })) });
	add({ id: 'picklists.unused', area: 'Configuration', title: 'Picklist options nobody uses', severity: 'low', count: sprawl.reduce((s, p) => s + p.unused.length, 0), unit: 'options', detail: sprawl.filter((p) => p.unused.length).map((p) => `${p.module}.${p.field}: ${p.unused.length}`).join(', '), examples: [] });

	// 7 field usage and edition headroom
	const sparse = [];
	const customCount = {};
	for (const [mod, fields] of Object.entries(snap.fields)) {
		const recs = R[mod] || []; customCount[mod] = fields.filter((f) => f.custom_field).length;
		for (const f of fields) {
			if (!f.custom_field) continue;
			const filled = recs.filter((r) => !N.isEmpty(r[f.api_name]) && r[f.api_name] !== false).length;
			const rate = recs.length ? filled / recs.length : 0;
			if (rate < sparseFill) sparse.push({ module: mod, field: f.api_name, label: f.field_label, filled, rate });
		}
	}
	add({ id: 'fields.sparse', area: 'Configuration', title: `Custom fields filled on under ${sparseFill * 100}% of records`, severity: 'medium', count: sparse.length, unit: 'fields', detail: 'Candidates to retire after exporting their values; they clutter layouts and count against the edition\'s custom-field limit.', examples: sparse.map((s) => `${s.module}.${s.label}: ${s.filled} filled`) });
	add({ id: 'limits.customFields', area: 'Configuration', title: `Custom fields vs the ${edition} limit (${lim.customFieldsPerModule}/module)`, severity: Object.values(customCount).some((n) => n > lim.customFieldsPerModule * 0.8) ? 'high' : 'info', count: Math.max(...Object.values(customCount)), unit: 'in the fullest module', detail: Object.entries(customCount).map(([m, n]) => `${m} ${n}`).join(', '), examples: [] });

	// 8 phone and email hygiene
	let phones = 0, e164 = 0; const formats = new Set();
	let badEmail = 0, messyEmail = 0;
	for (const mod of ['Leads', 'Contacts', 'Accounts']) for (const r of R[mod]) {
		for (const k of ['Phone', 'Mobile']) if (r[k]) { phones++; if (/^\+\d{8,15}$/.test(r[k])) e164++; formats.add(String(r[k]).replace(/\d/g, '9')); }
		if (r.Email) { if (!N.email(r.Email)) badEmail++; else if (r.Email !== N.email(r.Email)) messyEmail++; }
	}
	add({ id: 'data.phoneFormats', area: 'Data', title: 'Phone numbers in mixed formats', severity: 'medium', count: phones - e164, unit: 'numbers', detail: `${formats.size} different formats across ${phones.toLocaleString('en-US')} numbers; ${e164.toLocaleString('en-US')} are in international (+1...) form. Mixed formats are why phone-based duplicate checks and click-to-call miss.`, examples: [...formats].slice(0, 6) });
	add({ id: 'data.emails', area: 'Data', title: 'Emails with capitals or stray spaces', severity: 'low', count: messyEmail + badEmail, unit: 'emails', detail: `${messyEmail} need trimming/lower-casing, ${badEmail} are not valid addresses.`, examples: [] });

	// 9 deals and pipeline
	const stages = new Map(); for (const p of snap.pipeline) for (const m of p.maps) stages.set(m.actual_value, m);
	const open = R.Deals.filter((d) => { const m = stages.get(d.Stage); return m ? m.forecast_type === 'Open' : !String(d.Stage).startsWith('Closed'); });
	const overdue = open.filter((d) => d.Closing_Date && new Date(d.Closing_Date + 'T23:59:59').getTime() < now);
	const legacy = R.Deals.filter((d) => !stages.has(d.Stage));
	const noAmount = open.filter((d) => N.isEmpty(d.Amount) && stages.get(d.Stage)?.sequence_number >= 3);
	const idle = open.filter((d) => days(d.Last_Activity_Time || d.Created_Time) > dealIdleDays); // not Modified_Time: an owner change is not activity
	const lostNoReason = R.Deals.filter((d) => d.Stage === 'Closed Lost' && N.isEmpty(d.Loss_Reason));
	const sum = (a) => a.reduce((s, d) => s + (d.Amount || 0), 0);
	add({ id: 'deals.overdue', area: 'Pipeline', title: 'Open deals past their closing date', severity: 'high', count: overdue.length, unit: 'deals', detail: `${overdue.length} of ${open.length} open deals (${(100 * overdue.length / open.length).toFixed(0)}%), worth ${sum(overdue).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}, still count in this quarter's forecast.`, examples: [] });
	add({ id: 'deals.legacyStage', area: 'Pipeline', title: 'Deals in stages that are no longer in the pipeline', severity: legacy.length ? 'medium' : 'info', count: legacy.length, unit: 'deals', detail: `${[...new Set(legacy.map((d) => d.Stage))].join(', ')}: they drop out of pipeline-by-stage reports.`, examples: [] });
	add({ id: 'deals.noAmount', area: 'Pipeline', title: 'Deals at proposal stage or later with no amount', severity: 'medium', count: noAmount.length, unit: 'deals', detail: 'Pipeline value and forecast reports under-count these.', examples: [] });
	add({ id: 'deals.idle', area: 'Pipeline', title: `Open deals with no activity in ${dealIdleDays}+ days`, severity: 'medium', count: idle.length, unit: 'deals', detail: `${(100 * idle.length / open.length).toFixed(0)}% of open deals.`, examples: [] });
	add({ id: 'deals.lossReason', area: 'Pipeline', title: 'Lost deals without a loss reason', severity: 'low', count: lostNoReason.length, unit: 'deals', detail: `${(100 * lostNoReason.length / R.Deals.filter((d) => d.Stage === 'Closed Lost').length).toFixed(0)}% of lost deals; "why we lose" reports are mostly blank.`, examples: [] });

	// 10 workflows
	const W = snap.workflows; const active = W.filter((w) => w.status.active);
	const sig = (w) => JSON.stringify([w.module.api_name, w.execute_when.type, w.execute_when.details?.field?.api_name || null, (w.conditions || []).map((c) => [c.criteria_details, (c.instant_actions?.actions || []).map((a) => [a.type, a.details?.to || null])])]);
	const bySig = new Map(); for (const w of active) { const k = sig(w); if (!bySig.has(k)) bySig.set(k, []); bySig.get(k).push(w); }
	const dupRules = [...bySig.values()].filter((l) => l.length > 1);
	const noisy = active.filter((w) => w.execute_when.type === 'create_or_edit' && w.execute_when.details?.repeat && (w.conditions || []).some((c) => !c.criteria_details && (c.instant_actions?.actions || []).some((a) => a.type === 'email_notifications')));
	const dead = W.filter((w) => !w.status.active || !w.last_executed_time || days(w.last_executed_time) > 365);
	const ghost = active.filter((w) => (w.conditions || []).some((c) => { const crit = c.criteria_details?.criteria; return crit && crit.field?.api_name === 'Stage' && !stages.has(crit.value); }));
	const hooks = active.filter((w) => (w.conditions || []).some((c) => (c.instant_actions?.actions || []).some((a) => a.type === 'webhooks')));
	add({ id: 'workflows.duplicate', area: 'Automation', title: 'Active workflow rules that do the same thing twice', severity: dupRules.length ? 'high' : 'info', count: dupRules.reduce((s, l) => s + l.length - 1, 0), unit: 'rules', detail: dupRules.map((l) => l.map((w) => `"${w.name}"`).join(' = ')).join('; ') + '. Each matching record sends every alert twice.', examples: [] });
	add({ id: 'workflows.noisy', area: 'Automation', title: 'Rules that email on every single edit', severity: noisy.length ? 'high' : 'info', count: noisy.length, unit: 'rules', detail: noisy.map((w) => `"${w.name}" (${w.module.api_name})`).join(', ') + ': no criteria, repeat on. These use up the daily e-mail allowance and teach people to ignore CRM mail.', examples: [] });
	add({ id: 'workflows.dead', area: 'Automation', title: 'Rules that are off, never ran, or not run in a year', severity: 'low', count: dead.length, unit: 'rules', detail: dead.map((w) => `"${w.name}"`).join(', '), examples: [] });
	add({ id: 'workflows.ghost', area: 'Automation', title: 'Active rules waiting for a stage that no longer exists', severity: ghost.length ? 'medium' : 'info', count: ghost.length, unit: 'rules', detail: ghost.map((w) => `"${w.name}"`).join(', '), examples: [] });
	add({ id: 'workflows.webhooks', area: 'Automation', title: 'Active webhooks to check', severity: hooks.length ? 'medium' : 'info', count: hooks.length, unit: 'rules', detail: hooks.map((w) => `"${w.name}": ${(w.conditions[0].instant_actions.actions.find((a) => a.type === 'webhooks') || {}).name}`).join(', '), examples: [] });
	const perMod = {}; for (const w of active) perMod[w.module.api_name] = (perMod[w.module.api_name] || 0) + 1;
	add({ id: 'limits.activeRules', area: 'Automation', title: `Active rules vs the ${edition} limit (${lim.activeRulesPerModule}/module)`, severity: 'info', count: Math.max(0, ...Object.values(perMod)), unit: 'in the busiest module', detail: Object.entries(perMod).map(([m, n]) => `${m} ${n}`).join(', '), examples: [] });

	const order = { high: 0, medium: 1, low: 2, info: 3 };
	F.sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count);
	return {
		takenAt: snap.takenAt, edition, counts: Object.fromEntries(Object.entries(R).map(([k, v]) => [k, v.length])), findings: F,
		data: { duplicates: dup, cross, picklists: pl, sparse, overdue: overdue.map((d) => d.id), legacy: legacy.map((d) => d.id), open: open.length, stages: [...stages.keys()], inactiveUsers: inactive.map((u) => u.id) },
	};
}
