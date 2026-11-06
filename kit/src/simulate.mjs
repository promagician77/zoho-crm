// How many workflow e-mails a rule set sends per day, replaying a log of record events through the rules'
// triggers and criteria, against the edition's daily cap (Zoho: per-licence allowance or the org maximum,
// whichever is lower). Covers create / edit / create_or_edit / field_update triggers and simple criteria.
import { emailCap } from './limits.mjs';

function test(crit, values) {
	if (!crit) return true;
	if (crit.group) return crit.group_operator === 'OR' ? crit.group.some((c) => test(c, values)) : crit.group.every((c) => test(c, values));
	const v = values[crit.field.api_name];
	switch (crit.comparator) {
		case 'equal': return v === crit.value;
		case 'not_equal': return v !== crit.value;
		case 'in': return crit.value.includes(v);
		case 'not_in': return !crit.value.includes(v);
		case 'is_empty': return v === null || v === undefined || v === '';
		case 'is_not_empty': return !(v === null || v === undefined || v === '');
		default: return false;
	}
}
function fires(rule, ev) {
	const t = rule.execute_when.type, d = rule.execute_when.details || {};
	if (rule.module.api_name !== ev.module) return false;
	if (ev.action === 'create') return t === 'create' || t === 'create_or_edit';
	if (t === 'edit' || t === 'create_or_edit') return !!d.repeat;
	if (t === 'field_update') return (ev.changed || []).includes(d.field?.api_name);
	return false;
}
export function simulate(rules, events, { edition = 'Professional', licenses = 5 } = {}) {
	const cap = emailCap(edition, licenses);
	const days = new Map(); const byRule = new Map();
	for (const ev of events) {
		let n = 0;
		for (const r of rules) {
			if (!r.status.active || !fires(r, ev)) continue;
			for (const c of r.conditions || []) {
				if (!test(c.criteria_details?.criteria, ev.values || {})) continue;
				for (const a of c.instant_actions?.actions || []) if (a.type === 'email_notifications') { const k = (a.details?.to || ['record_owner']).length; n += k; byRule.set(r.name, (byRule.get(r.name) || 0) + k); }
				break; // first matching condition only, as Zoho does
			}
		}
		days.set(ev.date, (days.get(ev.date) || 0) + n);
	}
	const series = [...days.entries()].map(([date, sent]) => ({ date, sent, overCap: Math.max(0, sent - cap) }));
	const total = series.reduce((s, d) => s + d.sent, 0);
	return { edition, licenses, cap, days: series, total, avg: Math.round(total / series.length), peak: Math.max(...series.map((d) => d.sent)), daysOverCap: series.filter((d) => d.overCap).length, dropped: series.reduce((s, d) => s + d.overCap, 0), byRule: Object.fromEntries([...byRule.entries()].sort((a, b) => b[1] - a[1])) };
}
