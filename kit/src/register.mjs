// Configuration register: the "documentation of completed configurations" deliverable, generated from a
// snapshot so it is always current. Markdown out; the same object feeds the review site.
import { isEmpty } from './normalize.mjs';
import { EDITIONS } from './limits.mjs';

export function registerData(snap, { edition = 'Professional' } = {}) {
	const modules = Object.entries(snap.fields).map(([mod, fields]) => {
		const recs = snap.records[mod] || [];
		return { module: mod, records: recs.length, fields: fields.map((f) => ({ label: f.field_label, api: f.api_name, type: f.data_type, custom: !!f.custom_field, required: !!f.system_mandatory, unique: !!(f.unique && Object.keys(f.unique).length), options: f.pick_list_values?.length || 0, fill: recs.length ? recs.filter((r) => !isEmpty(r[f.api_name]) && r[f.api_name] !== false).length / recs.length : 0 })) };
	});
	const rules = snap.workflows.map((w) => ({
		name: w.name, module: w.module.api_name, active: w.status.active, trigger: w.execute_when.type + (w.execute_when.details?.field ? ` (${w.execute_when.details.field.api_name})` : '') + (w.execute_when.details?.repeat ? ', every time' : ''),
		criteria: (w.conditions || []).map((c) => describe(c.criteria_details?.criteria)).join(' / ') || 'all records',
		actions: (w.conditions || []).flatMap((c) => (c.instant_actions?.actions || []).map((a) => `${a.type.replace(/_/g, ' ')}: ${a.name}`)), lastRun: w.last_executed_time,
	}));
	return { takenAt: snap.takenAt, edition, limits: EDITIONS[edition], users: snap.users.map((u) => ({ name: u.full_name, role: u.role?.name, profile: u.profile?.name, status: u.status })), modules, pipeline: snap.pipeline.map((p) => ({ name: p.display_value, stages: p.maps.map((m) => ({ stage: m.display_value, type: m.forecast_type, category: m.forecast_category?.name })) })), rules };
}
function describe(c) {
	if (!c) return '';
	if (c.group) return c.group.map(describe).join(` ${c.group_operator} `);
	const v = Array.isArray(c.value) ? c.value.join(', ') : c.value;
	return `${c.field.api_name} ${c.comparator.replace(/_/g, ' ')} ${v}`;
}
export function registerMarkdown(d, { changes } = {}) {
	const pct = (x) => (x * 100).toFixed(0) + '%';
	const L = [`# Zoho CRM configuration register`, '', `Snapshot ${d.takenAt.slice(0, 10)} · edition ${d.edition}`, ''];
	L.push('## Users', '', '| User | Role | Profile | Status |', '|---|---|---|---|', ...d.users.map((u) => `| ${u.name} | ${u.role} | ${u.profile} | ${u.status} |`), '');
	for (const m of d.modules) {
		const custom = m.fields.filter((f) => f.custom).length;
		L.push(`## ${m.module}`, '', `${m.records} records · ${m.fields.length} fields, ${custom} custom (${d.edition} allows ${d.limits.customFieldsPerModule} custom per module)`, '', '| Field | API name | Type | Custom | Filled |', '|---|---|---|---|---|');
		for (const f of m.fields) L.push(`| ${f.label}${f.required ? ' *' : ''}${f.unique ? ' (unique)' : ''} | \`${f.api}\` | ${f.type}${f.options ? ` (${f.options} options)` : ''} | ${f.custom ? 'yes' : ''} | ${pct(f.fill)} |`);
		L.push('');
	}
	for (const p of d.pipeline) L.push(`## Pipeline: ${p.name}`, '', ...p.stages.map((s, i) => `${i + 1}. ${s.stage} (${s.type}, forecast: ${s.category})`), '');
	L.push('## Workflow rules', '', '| Rule | Module | Active | Trigger | Criteria | Actions | Last run |', '|---|---|---|---|---|---|---|');
	for (const r of d.rules) L.push(`| ${r.name} | ${r.module} | ${r.active ? 'yes' : 'no'} | ${r.trigger} | ${r.criteria} | ${r.actions.join('; ')} | ${r.lastRun ? r.lastRun.slice(0, 10) : 'never'} |`);
	if (changes) { L.push('', '## Changes applied', '', ...changes.map((c) => `- ${c}`)); }
	return L.join('\n') + '\n';
}
