import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../src/normalize.mjs';
import { prep, matchPair, findDuplicates, mergePlan, score } from '../src/dupes.mjs';
import { variantGroups, labelKey } from '../src/picklists.mjs';
import { simulate } from '../src/simulate.mjs';
import { creditCost } from '../src/zoho.mjs';
import { emailCap, apiCredits } from '../src/limits.mjs';

test('phones normalise to one international form', () => {
	for (const p of ['(415) 555-0134', '415-555-0134', '+1 415 555 0134', '4155550134', '415.555.0134', '1-415-555-0134']) assert.equal(N.phone(p), '+14155550134');
	assert.equal(N.phone('+44 20 7946 0958'), '+442079460958');
	assert.equal(N.phone('555'), null);
});
test('emails trim and lower-case; role addresses are recognised', () => {
	assert.equal(N.email('  Ana.Ruiz@Example.COM '), 'ana.ruiz@example.com');
	assert.equal(N.email('not-an-email'), null);
	assert.ok(N.isRoleEmail('info@acme.example')); assert.ok(!N.isRoleEmail('ana@acme.example'));
});
test('company names ignore suffixes, case and punctuation', () => {
	assert.equal(N.company('Northgate Packaging, Inc.'), N.company('NORTHGATE PACKAGING'));
	assert.notEqual(N.company('Northgate Packaging'), N.company('Northgate Printing'));
});
test('nicknames resolve to the same first name', () => { assert.equal(N.firstName('Bob'), N.firstName('Robert')); assert.equal(N.firstName('Liz'), 'elizabeth'); });

const L = (o) => prep({ id: o.id || Math.random().toString(), First_Name: 'Robert', Last_Name: 'Johnson', Company: 'Northgate Packaging Inc.', ...o }, 'Leads');
test('same personal email is a match even with capitals and spaces', () => assert.equal(matchPair(L({ Email: ' ROBERT.JOHNSON@NG.EXAMPLE ' }), L({ Email: 'robert.johnson@ng.example' })), 'email'));
test('same phone and agreeing names (nickname, typo) is a match', () => {
	assert.equal(matchPair(L({ Phone: '(415) 555-0134' }), L({ First_Name: 'Bob', Phone: '+1 415 555 0134' })), 'phone');
	assert.equal(matchPair(L({ Phone: '415-555-0134' }), L({ Last_Name: 'Jonson', Phone: '4155550134' })), 'phone');
});
test('colleagues sharing the switchboard number are not duplicates', () => assert.equal(matchPair(L({ Phone: '415-555-0100' }), L({ First_Name: 'Maria', Last_Name: 'Garcia', Phone: '415-555-0100' })), null));
test('two people on info@ are not merged', () => assert.equal(matchPair(L({ Email: 'info@ng.example' }), L({ First_Name: 'Maria', Last_Name: 'Garcia', Email: 'info@ng.example' })), null));
test('same name at a different company with nothing else in common is not a match', () => assert.equal(matchPair(L({ Email: 'rj@a.example' }), L({ Company: 'Cedarline Foods', Email: 'rj@b.example' })), null));

test('groups are transitive and the master is the most complete record', () => {
	const recs = [
		{ id: '1', First_Name: 'Robert', Last_Name: 'Johnson', Email: 'r@x.example', Phone: null, Company: 'X', Created_Time: '2024-01-01' },
		{ id: '2', First_Name: 'Bob', Last_Name: 'Johnson', Email: 'r@x.example', Phone: '4155550134', Company: 'X', Title: 'COO', Created_Time: '2025-01-01' },
		{ id: '3', First_Name: 'Bob', Last_Name: 'Jonson', Email: null, Phone: '+1 415 555 0134', Company: 'X', Created_Time: '2025-06-01' },
	];
	const g = findDuplicates(recs, 'Leads');
	assert.equal(g.length, 1); assert.deepEqual([...g[0].ids].sort(), ['1', '2', '3']);
	const m = mergePlan(g[0], new Map(recs.map((r) => [r.id, r])));
	assert.equal(m.master, '2'); assert.equal(m.children.length, 2);
});
test('pair scoring', () => {
	const s = score([{ ids: ['a', 'b', 'c'] }], [['a', 'b'], ['c', 'd']]);
	assert.equal(s.truePositives, 1); assert.equal(s.predictedPairs, 3); assert.equal(s.truePairs, 2);
});

test('picklist variants group by spelling, not by shared words', () => {
	const v = (value, count) => ({ value, count, seq: 1 });
	const g = variantGroups([v('Referral', 9), v('Referal', 3), v('Referrals', 2), v('Employee Referral', 1), v('External Referral', 1), v('Linked In', 1), v('LinkedIn', 5), v('Trade Show 2023', 2), v('Tradeshow', 4)]);
	const find = (x) => g.find((gr) => gr.members.some((m) => m.value === x));
	assert.equal(find('Referal').canonical, 'Referral'); assert.equal(find('Referrals').canonical, 'Referral');
	assert.equal(find('Employee Referral'), undefined); assert.equal(find('Linked In').canonical, 'LinkedIn');
	assert.equal(find('Trade Show 2023').canonical, 'Tradeshow');
	assert.equal(labelKey('E-mail Campaign'), labelKey('Email campaign'));
	assert.equal(variantGroups([v('< $5k', 3), v('> $100k', 2), v('$5k-$25k', 4), v('$25k-$100k', 1)]).length, 0, 'budget bands are not typos');
});

test('workflow simulation counts recipients per trigger and criteria', () => {
	const rule = (type, details, criteria, to, active = true) => ({ name: type + JSON.stringify(details), status: { active }, module: { api_name: 'Leads' }, execute_when: { type, details }, conditions: [{ criteria_details: criteria ? { criteria } : null, instant_actions: { actions: [{ type: 'email_notifications', details: { to } }] } }] });
	const rules = [
		rule('create', {}, { comparator: 'equal', field: { api_name: 'Rating' }, value: 'Hot' }, ['record_owner', 'manager']),
		rule('create_or_edit', { repeat: true }, null, ['record_owner']),
		rule('field_update', { field: { api_name: 'Lead_Status' } }, null, ['record_owner']),
		rule('create', {}, null, ['record_owner'], false),
	];
	const ev = [{ date: 'd1', module: 'Leads', action: 'create', values: { Rating: 'Hot' } }, { date: 'd1', module: 'Leads', action: 'edit', changed: ['Lead_Status'], values: {} }, { date: 'd2', module: 'Leads', action: 'edit', changed: ['Phone'], values: {} }];
	const s = simulate(rules, ev, { edition: 'Standard', licenses: 3 });
	assert.deepEqual(s.days.map((d) => d.sent), [5, 1]);
	assert.equal(s.cap, 300);
});
test('edition limits and API credit maths follow Zoho\'s published tables', () => {
	assert.equal(emailCap('Standard', 6), 600); assert.equal(emailCap('Professional', 6), 1200); assert.equal(emailCap('Standard', 80), 5000);
	assert.equal(apiCredits('Professional', 6), 13000); assert.equal(apiCredits('Enterprise', 1000), 1000000);
	assert.equal(creditCost('PUT', 'Leads', { data: new Array(100) }), 10); assert.equal(creditCost('PUT', 'Leads', { data: new Array(7) }), 1);
	assert.equal(creditCost('GET', 'Leads'), 1); assert.equal(creditCost('POST', 'Leads/1/actions/merge', { merge: [] }), 1);
});
