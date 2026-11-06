// Picklist hygiene: which options are used, which are dead, and which are spelling variants of each other.
// Variants are grouped by spelling only (case, spaces, punctuation, a trailing "s", a year, one typo).
// Meaning-level variants ("Web Form" vs "Website") need a person to decide and go in mappings/<field>.json.
import { plain, editDistance } from './normalize.mjs';

// a trailing year is dropped ("Trade Show 2023"), other digits are kept ("$5k-$25k" is a band, not a typo)
export const labelKey = (s) => plain(s).replace(/\b(19|20)\d\d\b/g, '').replace(/[^a-z0-9]/g, '').replace(/s$/, '');

export function variantGroups(values) { // values: [{value, count, seq}]
	const parent = values.map((_, i) => i); const f = (x) => (parent[x] === x ? x : (parent[x] = f(parent[x])));
	const keys = values.map((v) => labelKey(v.value));
	for (let i = 0; i < values.length; i++) for (let j = i + 1; j < values.length; j++) {
		const a = keys[i], b = keys[j];
		if (!a || !b || a.length < 4 || b.length < 4) continue; // too little text to call it a spelling variant
		if (a === b || (Math.min(a.length, b.length) >= 6 && editDistance(a, b) <= 1)) parent[f(i)] = f(j);
	}
	const g = new Map(); values.forEach((v, i) => { const r = f(i); if (!g.has(r)) g.set(r, []); g.get(r).push(v); });
	return [...g.values()].filter((x) => x.length > 1).map((members) => {
		members.sort((a, b) => b.count - a.count || a.seq - b.seq);
		return { canonical: members[0].value, members };
	});
}

export function picklistReport(snapshot) {
	const out = [];
	for (const [mod, fields] of Object.entries(snapshot.fields)) for (const f of fields) {
		if (f.data_type !== 'picklist' || !f.pick_list_values?.length) continue;
		const counts = new Map();
		for (const r of snapshot.records[mod] || []) { const v = r[f.api_name]; if (v !== null && v !== undefined && v !== '') counts.set(v, (counts.get(v) || 0) + 1); }
		const values = f.pick_list_values.map((p) => ({ value: p.actual_value, count: counts.get(p.actual_value) || 0, seq: p.sequence_number }));
		const offList = [...counts.keys()].filter((v) => !f.pick_list_values.some((p) => p.actual_value === v)).map((v) => ({ value: v, count: counts.get(v) }));
		const groups = variantGroups(values.filter((v) => v.count > 0));
		out.push({ module: mod, field: f.api_name, label: f.field_label, defined: values.length, used: values.filter((v) => v.count).length, unused: values.filter((v) => !v.count).map((v) => v.value), offList, groups, values });
	}
	return out;
}

// apply a value map to the records of the modules that carry the field; returns record updates
export function remapUpdates(snapshot, field, map) {
	const ups = {};
	for (const [mod, recs] of Object.entries(snapshot.records)) {
		if (!snapshot.fields[mod]?.some((f) => f.api_name === field)) continue;
		for (const r of recs) if (r[field] in map && map[r[field]] !== r[field]) (ups[mod] = ups[mod] || []).push({ id: r.id, [field]: map[r[field]], _before: { [field]: r[field] } });
	}
	return ups;
}
