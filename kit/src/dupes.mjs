// Duplicate detection for people records (Leads, Contacts). Records are compared only inside blocks that share
// an email, a phone number, a company, or a name key, then a pair is a match when one of three rules holds:
//   email  - same address, and it is a personal address (info@, sales@ ... need matching names too)
//   phone  - same number AND the names agree (nicknames allowed, last name within a typo)
//   company - same company once "Inc./LLC/Co." and case are ignored AND the names agree
// A shared company switchboard number alone is never enough: colleagues are not duplicates.
import * as N from './normalize.mjs';

export function prep(r, mod) {
	const phones = [r.Phone, r.Mobile].map((p) => N.phone(p)).filter(Boolean);
	const e = N.email(r.Email);
	return { id: r.id, r, email: e, role: N.isRoleEmail(e), phones, first: N.firstName(r.First_Name), last: N.lastName(r.Last_Name), company: N.company(mod === 'Contacts' ? r.Account_Name?.name : r.Company) };
}
const namesAgree = (a, b) => !!a.last && !!b.last && N.jaroWinkler(a.last, b.last) >= 0.9 && (!a.first || !b.first || a.first === b.first || N.jaroWinkler(a.first, b.first) >= 0.9);

export function matchPair(a, b) {
	if (a.email && a.email === b.email) {
		if (!a.role) return 'email';
		if (namesAgree(a, b)) return 'email';
		return null; // shared role address: different people (reported separately for review)
	}
	if (a.phones.some((p) => b.phones.includes(p)) && namesAgree(a, b)) return 'phone';
	if (a.company && a.company === b.company && namesAgree(a, b) && N.jaroWinkler(a.last, b.last) >= 0.92) return 'company';
	return null;
}

function blocks(items) {
	const m = new Map(); const add = (k, i) => { if (!k) return; let l = m.get(k); if (!l) m.set(k, (l = [])); l.push(i); };
	items.forEach((x, i) => { add('e:' + x.email, i); x.phones.forEach((p) => add('p:' + p, i)); add('c:' + x.company, i); if (x.last) add('n:' + x.first + '|' + x.last.slice(0, 3), i); });
	return m;
}
class UF { constructor(n) { this.p = Array.from({ length: n }, (_, i) => i); } f(x) { while (this.p[x] !== x) x = this.p[x] = this.p[this.p[x]]; return x; } u(a, b) { this.p[this.f(a)] = this.f(b); } }

export function findDuplicates(records, mod, matcher = matchPair) {
	const items = records.map((r) => prep(r, mod));
	const uf = new UF(items.length); const reasons = new Map(); const seen = new Set();
	for (const idx of blocks(items).values()) {
		if (idx.length > 400) continue; // very large blocks (an empty company) carry no signal
		for (let x = 0; x < idx.length; x++) for (let y = x + 1; y < idx.length; y++) {
			const i = idx[x], j = idx[y], key = i < j ? i + ',' + j : j + ',' + i;
			if (seen.has(key)) continue; seen.add(key);
			const why = matcher(items[i], items[j]);
			if (why) { uf.u(i, j); reasons.set(key, why); }
		}
	}
	const groups = new Map();
	items.forEach((x, i) => { const r = uf.f(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); });
	const out = [];
	for (const g of groups.values()) if (g.length > 1) {
		const why = new Set(); for (const i of g) for (const j of g) { const k = i < j ? i + ',' + j : null; if (k && reasons.has(k)) why.add(reasons.get(k)); }
		out.push({ ids: g.map((i) => items[i].id), reasons: [...why] });
	}
	return out;
}

// naive single-field matching, the way a quick spreadsheet or a one-field duplicate check works
export const naiveLoose = (a, b) => (a.email && a.email === b.email) || a.phones.some((p) => b.phones.includes(p)) || (a.first && a.first === b.first && a.last === b.last) ? 'naive' : null;
export function naiveExact(records) { // exact text of Email or Phone, no normalisation
	const by = new Map(); const add = (k, id) => { if (!k) return; if (!by.has(k)) by.set(k, []); by.get(k).push(id); };
	for (const r of records) { add('e:' + (r.Email || ''), r.Email ? r.id : null); add('p:' + (r.Phone || ''), r.Phone ? r.id : null); }
	const uf = new Map(); const f = (x) => { while (uf.get(x) !== x) x = uf.get(x); return x; };
	for (const r of records) uf.set(r.id, r.id);
	for (const [k, ids] of by) if (!k.endsWith(':') && ids.length > 1) for (const id of ids.slice(1)) if (id) uf.set(f(id), f(ids[0]));
	const g = new Map(); for (const r of records) { const k = f(r.id); if (!g.has(k)) g.set(k, []); g.get(k).push(r.id); }
	return [...g.values()].filter((x) => x.length > 1).map((ids) => ({ ids, reasons: ['exact'] }));
}

// leads that are already contacts: same personal email, or same phone with agreeing names
export function crossModule(leads, contacts) {
	const C = contacts.map((r) => prep(r, 'Contacts')); const byE = new Map(), byP = new Map();
	C.forEach((c) => { if (c.email && !c.role) byE.set(c.email, c); c.phones.forEach((p) => { if (!byP.has(p)) byP.set(p, []); byP.get(p).push(c); }); });
	const out = [];
	for (const r of leads) {
		const l = prep(r, 'Leads');
		let hit = l.email && !l.role ? byE.get(l.email) : null, why = 'email';
		if (!hit) { for (const p of l.phones) { hit = (byP.get(p) || []).find((c) => namesAgree(l, c)); if (hit) { why = 'phone'; break; } } }
		if (hit) out.push({ lead: l.id, contact: hit.id, reason: why });
	}
	return out;
}

// master = most complete record, ties go to the oldest; children give the master any field it lacks
const SYSTEM = new Set(['id', 'Created_Time', 'Modified_Time', 'Last_Activity_Time', 'Owner']);
export function mergePlan(group, byId) {
	const recs = group.ids.map((id) => byId.get(id));
	const filled = (r) => Object.entries(r).filter(([k, v]) => !SYSTEM.has(k) && !N.isEmpty(v)).length;
	recs.sort((a, b) => filled(b) - filled(a) || String(a.Created_Time).localeCompare(String(b.Created_Time)));
	const [master, ...children] = recs;
	const take = new Map(); // child id -> fields
	const newestFirst = [...children].sort((a, b) => String(b.Modified_Time).localeCompare(String(a.Modified_Time)));
	for (const k of Object.keys(master)) {
		if (SYSTEM.has(k) || !N.isEmpty(master[k])) continue;
		const donor = newestFirst.find((c) => !N.isEmpty(c[k]));
		if (donor) { if (!take.has(donor.id)) take.set(donor.id, []); take.get(donor.id).push(k); }
	}
	return { master: master.id, children: children.map((c) => ({ id: c.id, fields: take.get(c.id) || [] })), reasons: group.reasons };
}

// score predicted groups against true groups, pair by pair
export function score(predGroups, trueGroups) {
	const pairs = (gs) => { const s = new Set(); for (const g of gs) { const ids = [...g].sort(); for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) s.add(ids[i] + '|' + ids[j]); } return s; };
	const P = pairs(predGroups.map((g) => g.ids || g)), T = pairs(trueGroups);
	let tp = 0; for (const p of P) if (T.has(p)) tp++;
	return { predictedPairs: P.size, truePairs: T.size, truePositives: tp, falsePositives: P.size - tp, missed: T.size - tp, precision: P.size ? tp / P.size : 1, recall: T.size ? tp / T.size : 1 };
}
