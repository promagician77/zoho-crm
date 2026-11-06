// Normalisers and string similarity used for matching. No dependencies.
const NICK = { bob: 'robert', rob: 'robert', bobby: 'robert', bill: 'william', will: 'william', liz: 'elizabeth', beth: 'elizabeth', mike: 'michael', kate: 'katherine', katie: 'katherine', jim: 'james', jimmy: 'james', tom: 'thomas', dave: 'david', chris: 'christopher', jen: 'jennifer', jenny: 'jennifer', alex: 'alexander', sam: 'samuel', dan: 'daniel', danny: 'daniel', matt: 'matthew', nick: 'nicholas', tony: 'anthony', joe: 'joseph', rick: 'richard', dick: 'richard', steve: 'steven', pat: 'patricia', sue: 'susan', becky: 'rebecca', andy: 'andrew', ken: 'kenneth', tim: 'timothy', ron: 'ronald', greg: 'gregory', josh: 'joshua', jake: 'jacob', meg: 'margaret', peggy: 'margaret' };
const ROLE = new Set(['info', 'sales', 'contact', 'office', 'admin', 'hello', 'support', 'enquiries', 'inquiries', 'team', 'mail', 'accounts', 'billing', 'orders', 'reception', 'service']);
const SUFFIX = new Set(['inc', 'llc', 'ltd', 'co', 'corp', 'corporation', 'company', 'gmbh', 'the', 'limited', 'plc', 'bv', 'sa', 'srl', 'pty']);

export const plain = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function email(s) { const e = String(s ?? '').trim().toLowerCase(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null; }
export const isRoleEmail = (e) => !!e && ROLE.has(e.split('@')[0]);
export function phone(s, defaultCountry = '1') {
	let d = String(s ?? '').replace(/[^\d+]/g, '');
	const plus = d.startsWith('+'); d = d.replace(/\D/g, '');
	if (d.length < 7) return null;
	if (!plus && d.length === 10) d = defaultCountry + d;          // national number
	if (!plus && d.length === 11 && d.startsWith('1')) return '+' + d;
	return '+' + d;
}
export const firstName = (s) => { const f = plain(s).replace(/[^a-z]/g, ''); return NICK[f] || f; };
export const lastName = (s) => plain(s).replace(/[^a-z]/g, '');
export const company = (s) => plain(s).replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((t) => t && !SUFFIX.has(t)).join(' ');

export function jaroWinkler(a, b) {
	if (!a || !b) return 0; if (a === b) return 1;
	const m = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
	const am = new Array(a.length).fill(false), bm = new Array(b.length).fill(false);
	let matches = 0;
	for (let i = 0; i < a.length; i++) for (let j = Math.max(0, i - m); j < Math.min(b.length, i + m + 1); j++) if (!bm[j] && a[i] === b[j]) { am[i] = bm[j] = true; matches++; break; }
	if (!matches) return 0;
	let t = 0, k = 0;
	for (let i = 0; i < a.length; i++) if (am[i]) { while (!bm[k]) k++; if (a[i] !== b[k]) t++; k++; }
	const jaro = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;
	let l = 0; while (l < 4 && a[l] === b[l]) l++;
	return jaro + l * 0.1 * (1 - jaro);
}
export function editDistance(a, b) { // Damerau-Levenshtein (optimal string alignment)
	const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
	for (let j = 0; j <= b.length; j++) d[0][j] = j;
	for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
		d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
		if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
	}
	return d[a.length][b.length];
}
export const isEmpty = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);
