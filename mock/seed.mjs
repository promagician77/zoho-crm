// Generates a fictional Zoho CRM org ("Brightwater Supply Co.") with the kind of mess a few years of real use
// leaves behind, plus a ground-truth file saying which problems were planted, so the audit can be scored.
//   node mock/seed.mjs [seed]   -> mock/data/org.json, mock/data/truth.json, mock/data/events.json
import { writeFileSync, mkdirSync } from 'node:fs';

const SEED = Number(process.argv[2] || 20261105);
let s = SEED >>> 0;
const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const chance = (p) => rnd() < p;
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const weighted = (pairs) => { const t = pairs.reduce((x, [, w]) => x + w, 0); let r = rnd() * t; for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; } return pairs[0][0]; };

const TODAY = new Date('2026-11-02T12:00:00-05:00');
const day = 864e5;
const iso = (d) => { const z = new Date(d.getTime() - 5 * 36e5); return z.toISOString().slice(0, 19) + '-05:00'; };
const ago = (minDays, maxDays) => new Date(TODAY.getTime() - (minDays + rnd() * (maxDays - minDays)) * day);
const dateOnly = (d) => iso(d).slice(0, 10);
let idc = 6123456000000100000n;
const nid = () => String(++idc);

// ---------- users ----------
const users = [
	['Ana Ruiz', 'Administrator', 'Sales Manager', 'active'], ['Ben Okafor', 'Standard', 'Sales Rep', 'active'],
	['Chloe Martin', 'Standard', 'Sales Rep', 'active'], ['Dev Patel', 'Standard', 'Sales Rep', 'active'],
	['Ella Novak', 'Standard', 'Sales Rep', 'active'], ['Farid Haddad', 'Standard', 'Sales Rep', 'inactive'],
	['Grace Lim', 'Standard', 'Sales Rep', 'active'],
].map(([full_name, profile, role, status]) => ({ id: nid(), full_name, email: full_name.toLowerCase().replace(' ', '.') + '@brightwater.example', status, profile: { name: profile, id: nid() }, role: { name: role, id: nid() } }));
const owner = (u) => ({ name: u.full_name, id: u.id, email: u.email });
const reps = users.filter((u) => u.role.name === 'Sales Rep');
const activeReps = reps.filter((u) => u.status === 'active');
const farid = users.find((u) => u.full_name === 'Farid Haddad');

// ---------- name and company pools ----------
const FIRST = ['James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Christopher', 'Karen', 'Daniel', 'Lisa', 'Matthew', 'Nancy', 'Anthony', 'Sandra', 'Mark', 'Ashley', 'Steven', 'Kimberly', 'Andrew', 'Emily', 'Joshua', 'Donna', 'Kenneth', 'Michelle', 'Kevin', 'Carol', 'Brian', 'Amanda', 'Timothy', 'Melissa', 'Ronald', 'Deborah', 'Jason', 'Stephanie', 'Ryan', 'Rebecca', 'Jacob', 'Laura', 'Nicholas', 'Helen', 'Eric', 'Amy', 'Samuel', 'Angela', 'Gregory', 'Katherine', 'Alexander', 'Rachel', 'Priya', 'Wei', 'Olu', 'Mateo', 'Sofia', 'Yuki', 'Fatima', 'Lars', 'Ingrid', 'Rafael', 'Aisha', 'Tomasz', 'Noor', 'Diego', 'Hana', 'Kofi', 'Elena', 'Arjun', 'Lucia', 'Mei'];
const LAST = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts', 'Kowalski', 'Okonkwo', 'Fischer', 'Novak', 'Haddad', 'Tanaka', 'Silva', 'Andersen', 'Murphy', "O'Brien", 'Schmidt', 'Rossi', 'Dubois', 'Kim', 'Chen', 'Patel', 'Singh', 'Cohen', 'Bergstrom', 'Ivanova', 'Mendes', 'Abara', 'Lindqvist', 'Moreau', 'Kaplan', 'Weber', 'Costa', 'Yamamoto', 'Petrov', 'Byrne'];
const W1 = ['North', 'Cedar', 'Blue', 'Iron', 'Silver', 'Harbor', 'Summit', 'Pine', 'River', 'Granite', 'Maple', 'Copper', 'Oak', 'Lake', 'Stone', 'Bright', 'Prairie', 'Coastal', 'Eagle', 'Red', 'Green', 'Golden', 'Willow', 'Falcon', 'Atlas', 'Beacon', 'Keystone', 'Frontier', 'Pioneer', 'Union'];
const W2 = ['gate', 'ridge', 'field', 'point', 'brook', 'view', 'line', 'wood', 'crest', 'port', 'stone', 'side', 'haven', 'way', 'land'];
const W3 = ['Packaging', 'Medical', 'Logistics', 'Foods', 'Manufacturing', 'Builders', 'Dental', 'Hospitality', 'Labs', 'Retail', 'Facilities', 'Engineering', 'Fitness', 'Schools', 'Clinics', 'Hotels', 'Distribution', 'Printing', 'Auto Group', 'Property Management'];
const SUFFIX = ['Inc.', 'LLC', 'Co.', 'Ltd', 'Corp.', ''];
const INDUSTRY = ['Healthcare', 'Manufacturing', 'Hospitality', 'Education', 'Retail', 'Logistics', 'Construction', 'Real Estate', 'Food & Beverage', 'Fitness'];
const AREA = ['212', '312', '415', '512', '617', '702', '713', '303', '404', '206', '503', '602', '615', '919', '414'];
const NICK = { Robert: 'Bob', William: 'Bill', Elizabeth: 'Liz', Michael: 'Mike', Katherine: 'Kate', James: 'Jim', Thomas: 'Tom', David: 'Dave', Christopher: 'Chris', Jennifer: 'Jen', Alexander: 'Alex', Samuel: 'Sam', Daniel: 'Dan', Matthew: 'Matt', Nicholas: 'Nick', Anthony: 'Tony', Joseph: 'Joe', Richard: 'Rick', Steven: 'Steve', Patricia: 'Pat' };

const usedCompanies = new Set();
function company() {
	for (;;) {
		const base = pick(W1) + pick(W2) + ' ' + pick(W3);
		if (!usedCompanies.has(base)) { usedCompanies.add(base); const sfx = pick(SUFFIX); return { base, name: (base + ' ' + sfx).trim(), domain: base.toLowerCase().replace(/[^a-z]/g, '') + '.example', phone: `${pick(AREA)}555${String(int(100, 9999)).padStart(4, '0')}`.replace(/^(\d{3})555(\d{4})$/, '$1555$2') }; }
	}
}
const fmtPhone = (digits, style) => {
	const d = digits.padStart(10, '0'), a = d.slice(0, 3), b = d.slice(3, 6), c = d.slice(6);
	return [`(${a}) ${b}-${c}`, `${a}-${b}-${c}`, `+1 ${a} ${b} ${c}`, `${a}${b}${c}`, `${a}.${b}.${c}`, `1-${a}-${b}-${c}`][style];
};
const mobile = () => `${pick(AREA)}555${String(int(1000, 9999))}`;
const titleOf = () => pick(['Facilities Manager', 'Operations Director', 'Office Manager', 'Purchasing Lead', 'Owner', 'General Manager', 'Procurement Specialist', 'COO', 'Maintenance Supervisor', 'Practice Manager']);

// ---------- picklists ----------
// Lead_Source: what the picklist looks like after years of "just add an option"; truth maps each to a clean value.
const SOURCE_TRUTH = {
	Website: 'Website', 'Web Form': 'Website', 'web form': 'Website', 'Web Site': 'Website',
	'Google Ads': 'Google Ads', 'Google Adwords': 'Google Ads', 'google ads': 'Google Ads',
	LinkedIn: 'LinkedIn', Linkedin: 'LinkedIn', 'Linked In': 'LinkedIn',
	Referral: 'Referral', Referal: 'Referral', Referrals: 'Referral',
	'Trade Show': 'Trade Show', Tradeshow: 'Trade Show', 'Trade show': 'Trade Show', 'Trade Show 2023': 'Trade Show',
	'Email Campaign': 'Email Campaign', 'E-mail Campaign': 'Email Campaign', 'Email campaign': 'Email Campaign',
	'Cold Call': 'Cold Call', Partner: 'Partner', Chat: 'Chat', 'Employee Referral': 'Employee Referral', 'External Referral': 'External Referral',
};
const SOURCE_UNUSED = ['Advertisement', 'Online Store', 'Public Relations', 'Sales Email Alias', 'Seminar Partner', 'Web Research', 'Internal Seminar'];
const SOURCE_WEIGHTS = [['Website', 22], ['Web Form', 14], ['web form', 4], ['Web Site', 2], ['Google Ads', 12], ['Google Adwords', 6], ['google ads', 2], ['LinkedIn', 7], ['Linkedin', 4], ['Linked In', 1], ['Referral', 6], ['Referal', 2], ['Referrals', 1], ['Trade Show', 4], ['Tradeshow', 2], ['Trade show', 1], ['Trade Show 2023', 2], ['Email Campaign', 4], ['E-mail Campaign', 1], ['Email campaign', 1], ['Cold Call', 7], ['Partner', 4], ['Chat', 3], ['Employee Referral', 1], ['External Referral', 1]];
const LEAD_STATUS = ['Not Contacted', 'Attempted to Contact', 'Contact in Future', 'Contacted', 'Pre-Qualified', 'Not Qualified', 'Junk Lead', 'Lost Lead'];
const STAGES = [['Qualification', 10, 'Open'], ['Needs Analysis', 20, 'Open'], ['Proposal/Price Quote', 50, 'Open'], ['Negotiation/Review', 75, 'Open'], ['Closed Won', 100, 'Closed Won'], ['Closed Lost', 0, 'Closed Lost']];
const LEGACY_STAGES = ['Value Proposition', 'Id. Decision Makers']; // removed from the pipeline years ago, still on deals

// ---------- field metadata ----------
const F = (api_name, label, data_type, extra = {}) => ({ api_name, field_label: label, display_label: label, data_type, json_type: data_type === 'integer' ? 'integer' : data_type === 'currency' || data_type === 'double' ? 'double' : data_type === 'boolean' ? 'boolean' : data_type === 'lookup' || data_type === 'ownerlookup' ? 'jsonobject' : 'string', custom_field: false, visible: true, system_mandatory: false, length: 255, created_source: 'default', unique: {}, pick_list_values: [], lookup: {}, id: nid(), ...extra });
const PL = (values, used) => values.map((v, i) => ({ display_value: v, actual_value: v, reference_value: v, sequence_number: i + 1, colour_code: null, id: nid(), type: used && !used.includes(v) ? 'unused' : 'used' }));
const C = (api_name, label, type, extra = {}) => F(api_name, label, type, { custom_field: true, created_source: 'crm', ...extra });
const sourceValues = [...Object.keys(SOURCE_TRUTH), ...SOURCE_UNUSED];
const common = (mod) => [
	F('Owner', mod === 'Accounts' ? 'Account Owner' : mod === 'Leads' ? 'Lead Owner' : 'Contact Owner', 'ownerlookup', { system_mandatory: true }),
	F('Created_Time', 'Created Time', 'datetime'), F('Modified_Time', 'Modified Time', 'datetime'), F('Last_Activity_Time', 'Last Activity Time', 'datetime'),
	F('Description', 'Description', 'textarea'),
];
const person = () => [
	F('First_Name', 'First Name', 'text', { length: 40 }), F('Last_Name', 'Last Name', 'text', { system_mandatory: true, length: 80 }),
	F('Email', 'Email', 'email', { unique: { casesensitive: 'false' } }), F('Phone', 'Phone', 'phone'), F('Mobile', 'Mobile', 'phone'),
	F('Title', 'Title', 'text'), F('Mailing_City', 'City', 'text'), F('Mailing_State', 'State', 'text'),
	F('Lead_Source', 'Lead Source', 'picklist', { pick_list_values: PL(sourceValues, Object.keys(SOURCE_TRUTH)) }),
];
const fields = {
	Leads: [
		...common('Leads'), ...person().map((f) => (f.api_name.startsWith('Mailing_') ? { ...f, api_name: f.api_name.replace('Mailing_', '') } : f)),
		F('Company', 'Company', 'text', { system_mandatory: true }), F('Website', 'Website', 'website'),
		F('Lead_Status', 'Lead Status', 'picklist', { pick_list_values: PL(LEAD_STATUS) }),
		F('Industry', 'Industry', 'picklist', { pick_list_values: PL(INDUSTRY) }),
		F('No_of_Employees', 'No. of Employees', 'integer'), F('Annual_Revenue', 'Annual Revenue', 'currency'),
		F('Rating', 'Rating', 'picklist', { pick_list_values: PL(['Hot', 'Warm', 'Cold']) }),
		C('Product_Interest', 'Product Interest', 'picklist', { pick_list_values: PL(['Janitorial Supplies', 'Paper Products', 'Safety & PPE', 'Breakroom', 'Equipment Service']) }),
		C('Region', 'Region', 'picklist', { pick_list_values: PL(['Northeast', 'Southeast', 'Midwest', 'Southwest', 'West']) }),
		C('Budget_Range', 'Budget Range', 'picklist', { pick_list_values: PL(['< $5k', '$5k-$25k', '$25k-$100k', '> $100k']) }),
		C('Source_Detail', 'Source Detail', 'text'),
		C('Referral_Partner', 'Referral Partner', 'text'),
		C('Preferred_Contact', 'Preferred Contact', 'picklist', { pick_list_values: PL(['Email', 'Phone', 'Text']) }),
		C('Old_CRM_ID', 'Old CRM ID', 'text'), C('Fax_Alt', 'Fax (alt)', 'phone'),
		C('Trade_Show_2022', 'Trade Show 2022', 'boolean'), C('Temp_Import_Batch', 'Temp Import Batch', 'text'),
		C('Second_Email_Old', 'Second Email (old)', 'email'),
	],
	Contacts: [
		...common('Contacts'), ...person(), F('Account_Name', 'Account Name', 'lookup', { lookup: { module: { api_name: 'Accounts' } } }),
		C('Region', 'Region', 'picklist', { pick_list_values: PL(['Northeast', 'Southeast', 'Midwest', 'Southwest', 'West']) }),
		C('Birthday_Card', 'Birthday Card', 'boolean'), C('Old_CRM_ID', 'Old CRM ID', 'text'),
	],
	Accounts: [
		...common('Accounts'), F('Account_Name', 'Account Name', 'text', { system_mandatory: true, unique: { casesensitive: 'false' } }),
		F('Phone', 'Phone', 'phone'), F('Website', 'Website', 'website'), F('Industry', 'Industry', 'picklist', { pick_list_values: PL(INDUSTRY) }),
		F('Billing_City', 'Billing City', 'text'), F('Billing_State', 'Billing State', 'text'),
		C('Contract_Renewal', 'Contract Renewal', 'date'), C('Region', 'Region', 'picklist', { pick_list_values: PL(['Northeast', 'Southeast', 'Midwest', 'Southwest', 'West']) }),
	],
	Deals: [
		F('Owner', 'Deal Owner', 'ownerlookup', { system_mandatory: true }), F('Created_Time', 'Created Time', 'datetime'), F('Modified_Time', 'Modified Time', 'datetime'), F('Last_Activity_Time', 'Last Activity Time', 'datetime'),
		F('Deal_Name', 'Deal Name', 'text', { system_mandatory: true }), F('Account_Name', 'Account Name', 'lookup', { lookup: { module: { api_name: 'Accounts' } } }),
		F('Contact_Name', 'Contact Name', 'lookup', { lookup: { module: { api_name: 'Contacts' } } }),
		F('Stage', 'Stage', 'picklist', { system_mandatory: true, pick_list_values: PL([...STAGES.map((x) => x[0]), ...LEGACY_STAGES]) }),
		F('Amount', 'Amount', 'currency'), F('Closing_Date', 'Closing Date', 'date', { system_mandatory: true }), F('Probability', 'Probability (%)', 'integer'),
		F('Pipeline', 'Pipeline', 'picklist', { pick_list_values: PL(['Standard (Standard)']) }),
		F('Lead_Source', 'Lead Source', 'picklist', { pick_list_values: PL(sourceValues, Object.keys(SOURCE_TRUTH)) }),
		C('Product_Line', 'Product Line', 'picklist', { pick_list_values: PL(['Janitorial Supplies', 'Paper Products', 'Safety & PPE', 'Breakroom', 'Equipment Service']) }),
		C('Loss_Reason', 'Loss Reason', 'picklist', { pick_list_values: PL(['Price', 'Competitor', 'No Decision', 'Timing', 'Other']) }),
	],
};

// ---------- records ----------
const truth = { duplicates: { Leads: {}, Contacts: {} }, crossModule: [], decoyPairs: [], sources: SOURCE_TRUTH, inactiveOwner: farid.id, legacyStages: LEGACY_STAGES };
const records = { Leads: [], Contacts: [], Accounts: [], Deals: [] };
let pid = 0;
const stamp = (rec, created) => { rec.Created_Time = iso(created); const mod = new Date(Math.min(TODAY.getTime(), created.getTime() + rnd() * 200 * day)); rec.Modified_Time = iso(mod); rec.Last_Activity_Time = chance(0.85) ? iso(new Date(Math.min(TODAY.getTime(), created.getTime() + rnd() * (TODAY - created)))) : null; return rec; };

// accounts
const accounts = [];
for (let i = 0; i < 520; i++) {
	const co = company(); const u = pick(chance(0.07) ? [farid] : activeReps.concat([users[0]]));
	const a = stamp({ id: nid(), Account_Name: co.name, Phone: fmtPhone(co.phone, int(0, 2)), Website: 'www.' + co.domain, Industry: pick(INDUSTRY), Billing_City: null, Billing_State: null, Owner: owner(u), Region: chance(0.8) ? pick(['Northeast', 'Southeast', 'Midwest', 'Southwest', 'West']) : null, Contract_Renewal: chance(0.3) ? dateOnly(ago(-200, 300)) : null, Description: null }, ago(200, 1800));
	a._co = co; accounts.push(a); records.Accounts.push(a);
}
// contacts (people at accounts; colleagues share the switchboard phone)
const contactPeople = [];
for (const a of accounts) {
	const n = int(1, 5);
	for (let j = 0; j < n && records.Contacts.length < 1400; j++) {
		const p = { pid: ++pid, first: pick(FIRST), last: pick(LAST), co: a._co, title: titleOf(), mobile: mobile() };
		const c = stamp({ id: nid(), First_Name: p.first, Last_Name: p.last, Email: `${p.first}.${p.last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@' + p.co.domain, Phone: chance(0.7) ? fmtPhone(p.co.phone, int(0, 2)) : null, Mobile: chance(0.5) ? fmtPhone(p.mobile, int(0, 3)) : null, Title: p.title, Mailing_City: null, Mailing_State: null, Lead_Source: weighted(SOURCE_WEIGHTS), Account_Name: { name: a.Account_Name, id: a.id }, Owner: a.Owner, Region: a.Region, Birthday_Card: chance(0.01) ? true : null, Old_CRM_ID: chance(0.03) ? 'SF-' + int(10000, 99999) : null, Description: null }, ago(30, 1500));
		p.contactId = c.id; c._pid = p.pid; contactPeople.push(p); records.Contacts.push(c);
	}
}
// leads: new people at new companies, some colleagues share a switchboard (decoys), some already contacts (cross-module)
const leadCos = Array.from({ length: 2350 }, company);
function leadFor(p, created, ownerUser) {
	return stamp({
		id: nid(), First_Name: p.first, Last_Name: p.last, Company: p.coName || p.co.name, Email: p.email, Phone: p.phone ? fmtPhone(p.phone, int(0, 5)) : null, Mobile: chance(0.35) ? fmtPhone(p.mobile, int(0, 3)) : null, Title: p.title,
		City: null, State: null, Website: chance(0.4) ? 'www.' + p.co.domain : null, Lead_Source: p.source, Lead_Status: p.status, Industry: chance(0.7) ? pick(INDUSTRY) : null,
		No_of_Employees: chance(0.35) ? int(5, 900) : null, Annual_Revenue: chance(0.15) ? int(2, 400) * 10000 : null, Rating: chance(0.5) ? pick(['Hot', 'Warm', 'Cold']) : null,
		Product_Interest: chance(0.6) ? pick(['Janitorial Supplies', 'Paper Products', 'Safety & PPE', 'Breakroom', 'Equipment Service']) : null,
		Region: chance(0.55) ? pick(['Northeast', 'Southeast', 'Midwest', 'Southwest', 'West']) : null, Budget_Range: chance(0.3) ? pick(['< $5k', '$5k-$25k', '$25k-$100k', '> $100k']) : null,
		Source_Detail: chance(0.25) ? pick(['spring promo', 'Booth 14', 'pricing page', 'contact form', 'webinar Q2', 'newsletter']) : null,
		Referral_Partner: chance(0.05) ? pick(['CleanPro Partners', 'FacilityNet', 'J. Alvarez']) : null, Preferred_Contact: chance(0.03) ? pick(['Email', 'Phone', 'Text']) : null,
		Old_CRM_ID: chance(0.02) ? 'SF-' + int(10000, 99999) : null, Fax_Alt: chance(0.004) ? fmtPhone(mobile(), 1) : null, Trade_Show_2022: chance(0.01) ? true : null, Temp_Import_Batch: null, Second_Email_Old: chance(0.006) ? 'old.' + p.email : null,
		Owner: owner(ownerUser), Description: null,
	}, created);
}
const newPerson = (co) => { const first = pick(FIRST), last = pick(LAST); return { pid: ++pid, first, last, co, email: `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@' + co.domain, phone: chance(0.75) ? co.phone : null, mobile: mobile(), title: titleOf(), source: weighted(SOURCE_WEIGHTS), status: weighted([['Not Contacted', 30], ['Attempted to Contact', 22], ['Contact in Future', 8], ['Contacted', 18], ['Pre-Qualified', 9], ['Not Qualified', 6], ['Junk Lead', 4], ['Lost Lead', 3]]) }; };
const leadPeople = [];
for (const co of leadCos) {
	const n = chance(0.12) ? int(2, 3) : 1; // colleagues at the same company share its main number: not duplicates
	const group = [];
	for (let j = 0; j < n; j++) { const p = newPerson(co); if (j > 0) p.phone = co.phone; group.push(p); leadPeople.push(p); }
	if (group.length > 1) for (let a = 0; a < group.length; a++) for (let b = a + 1; b < group.length; b++) truth.decoyPairs.push([group[a].pid, group[b].pid, 'colleagues sharing a switchboard number']);
}
// a few genuinely different people with the same full name at different companies
for (let i = 0; i < 25; i++) { const a = pick(leadPeople), co = company(); const p = newPerson(co); p.first = a.first; p.last = a.last; p.email = `${p.first}.${p.last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@' + co.domain; leadPeople.push(p); truth.decoyPairs.push([a.pid, p.pid, 'same name, different company']); }
// role addresses: two different people at one company both submitted with info@ (not a duplicate; flag for review)
for (let i = 0; i < 12; i++) { const co = company(); const a = newPerson(co), b = newPerson(co); a.email = b.email = 'info@' + co.domain; leadPeople.push(a, b); truth.decoyPairs.push([a.pid, b.pid, 'shared role address']); }

const leadByPid = {};
for (const p of leadPeople) {
	const created = ago(1, 1100);
	const u = created < new Date(TODAY - 400 * day) && chance(0.18) ? farid : pick(activeReps);
	const l = leadFor(p, created, u); l._pid = p.pid; records.Leads.push(l); leadByPid[p.pid] = l;
}
// stale leads: no activity for a long time, still "Not Contacted"/"Attempted"
// (comes out of the dates above; truth computed after generation)

// within-Leads duplicates, five realistic ways
const variants = [
	['email case and spaces', (p) => ({ ...p, email: ' ' + p.email.replace(/^./, (c) => c.toUpperCase()).toUpperCase() + ' ' })],
	['phone typed differently', (p) => ({ ...p })],
	['typo in last name', (p) => ({ ...p, last: p.last.length > 4 ? p.last.slice(0, 2) + p.last.slice(3) : p.last + 'e', email: chance(0.5) ? p.email : null })],
	['nickname', (p) => ({ ...p, first: NICK[p.first] || p.first, email: chance(0.4) ? p.email : `${(NICK[p.first] || p.first)}.${p.last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@gmail.example' })],
	['company written differently', (p) => ({ ...p, coName: p.co.base.toUpperCase(), email: chance(0.6) ? p.email : null })],
];
const dupSources = leadPeople.filter((p) => !truth.decoyPairs.some(([a, b]) => a === p.pid || b === p.pid)).sort(() => rnd() - 0.5).slice(0, 165);
for (const p of dupSources) {
	const copies = chance(0.15) ? 2 : 1;
	for (let k = 0; k < copies; k++) {
		const [kind, fn] = pick(variants);
		if (kind === 'phone typed differently' && !p.phone) continue;
		const q = fn(p);
		if (kind === 'typo in last name' && !q.email && !q.phone) q.phone = p.phone || p.co.phone;
		if (kind === 'nickname' && !p.phone) q.phone = p.co.phone;
		const base = leadByPid[p.pid];
		const l = leadFor({ ...q, status: pick(['Not Contacted', 'Attempted to Contact']) }, new Date(new Date(base.Created_Time).getTime() + int(2, 300) * day), pick(activeReps));
		if (new Date(l.Created_Time) > TODAY) l.Created_Time = iso(ago(0, 3));
		l._pid = p.pid; l._dupKind = kind; records.Leads.push(l);
	}
}
// hard cases the matching rules were not written around
const dupSet = new Set(dupSources.map((p) => p.pid));
const fresh = leadPeople.filter((p) => !dupSet.has(p.pid) && !truth.decoyPairs.some(([a, b]) => a === p.pid || b === p.pid)).sort(() => rnd() - 0.5);
// (a) same person back with a personal address, no phone, company typed with a space: nothing in common to match on
for (const p of fresh.slice(0, 14)) {
	const spaced = p.co.base.replace(/^(\w+?)(gate|ridge|field|point|brook|view|line|wood|crest|port|stone|side|haven|way|land)\b/, '$1 $2');
	const l = leadFor({ ...p, email: `${p.first}${int(1, 99)}@gmail.example`.toLowerCase(), phone: null, coName: spaced, status: 'Not Contacted' }, ago(1, 300), pick(activeReps));
	l.Mobile = null; l._pid = p.pid; l._dupKind = 'new email, no phone'; records.Leads.push(l);
}
// (b) married-name change with the same work email: should be caught
for (const p of fresh.slice(14, 22)) {
	const l = leadFor({ ...p, last: pick(LAST), status: 'Attempted to Contact' }, ago(1, 300), pick(activeReps));
	l._pid = p.pid; l._dupKind = 'surname changed'; records.Leads.push(l);
}
// (c) two different people with the same name at the same company, sharing its switchboard: rules will wrongly join them
for (let i = 0; i < 9; i++) {
	const co = company(); const a = newPerson(co); const b = newPerson(co);
	b.first = a.first; b.last = a.last; a.phone = b.phone = co.phone; b.email = `${a.first[0]}${a.last}`.toLowerCase().replace(/[^a-z]/g, '') + '@' + co.domain;
	for (const p of [a, b]) { const l = leadFor(p, ago(1, 900), pick(activeReps)); l._pid = p.pid; records.Leads.push(l); leadByPid[p.pid] = l; }
	truth.decoyPairs.push([a.pid, b.pid, 'namesakes at one company']);
}

// leads that are already contacts (came back through a web form): Zoho can't merge across modules
for (const cp of contactPeople.sort(() => rnd() - 0.5).slice(0, 110)) {
	const p = { ...cp, email: chance(0.85) ? `${cp.first}.${cp.last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@' + cp.co.domain : null, phone: cp.co.phone, source: weighted(SOURCE_WEIGHTS), status: 'Not Contacted' };
	if (!p.email) p.mobile = cp.mobile;
	const l = leadFor({ ...p, mobile: cp.mobile }, ago(1, 200), pick(activeReps)); if (!p.email) l.Mobile = fmtPhone(cp.mobile, 2);
	l._pid = cp.pid; records.Leads.push(l); truth.crossModule.push([l.id, cp.contactId]);
}
// within-Contacts duplicates
for (const cp of contactPeople.sort(() => rnd() - 0.5).slice(0, 42)) {
	const base = records.Contacts.find((c) => c._pid === cp.pid);
	const [kind, fn] = pick(variants.filter(([k]) => k !== 'company written differently'));
	const q = fn({ ...cp, email: base.Email, phone: cp.co.phone });
	const c = stamp({ ...base, id: nid(), First_Name: q.first, Last_Name: q.last, Email: q.email ? q.email : null, Phone: fmtPhone(cp.co.phone, int(0, 5)), Mobile: base.Mobile || (chance(0.5) ? fmtPhone(cp.mobile, 1) : null), Owner: owner(pick(activeReps)) }, ago(5, 600));
	if (!c.Email) c.Mobile = fmtPhone(cp.mobile, 1);
	c._pid = cp.pid; c._dupKind = kind; records.Contacts.push(c);
}

// deals
for (let i = 0; i < 680; i++) {
	const a = pick(accounts); const ctc = records.Contacts.find((c) => c.Account_Name.id === a.id);
	const created = ago(3, 900);
	let stage = weighted([['Qualification', 16], ['Needs Analysis', 14], ['Proposal/Price Quote', 14], ['Negotiation/Review', 8], ['Closed Won', 26], ['Closed Lost', 22]]);
	if (chance(0.035)) stage = pick(LEGACY_STAGES);
	const open = !stage.startsWith('Closed');
	const st = STAGES.find((x) => x[0] === stage);
	const closing = open ? (chance(0.38) ? ago(5, 300) : ago(-120, -3)) : new Date(Math.min(TODAY.getTime(), created.getTime() + int(10, 120) * day));
	const d = stamp({
		id: nid(), Deal_Name: `${a._co.base} - ${pick(['Supply contract', 'Q' + int(1, 4) + ' order', 'Service renewal', 'Breakroom program', 'PPE rollout', 'Multi-site pilot'])}`, Account_Name: { name: a.Account_Name, id: a.id }, Contact_Name: ctc ? { name: ctc.First_Name + ' ' + ctc.Last_Name, id: ctc.id } : null,
		Stage: stage, Amount: chance(open && ['Qualification', 'Needs Analysis'].includes(stage) ? 0.55 : 0.93) ? int(12, 900) * 100 : null, Closing_Date: dateOnly(closing), Probability: st ? st[1] : null,
		Pipeline: 'Standard (Standard)', Lead_Source: weighted(SOURCE_WEIGHTS), Product_Line: chance(0.7) ? pick(['Janitorial Supplies', 'Paper Products', 'Safety & PPE', 'Breakroom', 'Equipment Service']) : null,
		Loss_Reason: stage === 'Closed Lost' && chance(0.45) ? pick(['Price', 'Competitor', 'No Decision', 'Timing', 'Other']) : null, Owner: a.Owner,
	}, created);
	if (open && chance(0.3)) d.Last_Activity_Time = iso(ago(45, 200));
	records.Deals.push(d);
}

// truth: duplicate groups by pid
for (const mod of ['Leads', 'Contacts']) {
	const by = {};
	for (const r of records[mod]) (by[r._pid] = by[r._pid] || []).push(r.id);
	for (const [p, ids] of Object.entries(by)) if (ids.length > 1) truth.duplicates[mod][p] = ids;
}
truth.counts = Object.fromEntries(Object.entries(records).map(([k, v]) => [k, v.length]));

// ---------- workflow rules (Zoho v8 shape, with conditions as include_inner_details returns them) ----------
const userRef = (u) => ({ name: u.full_name, id: u.id });
const mod = (api_name) => ({ api_name, id: nid() });
const rule = (name, module, type, details, active, conditions, lastExec, extra = {}) => ({
	id: nid(), name, description: extra.description || null, source: 'crm', status: { active }, module: mod(module), execute_when: { type, details: { trigger_module: mod(module), ...details } },
	editable: true, deletable: true, created_time: iso(ago(300, 1500)), created_by: userRef(users[0]), modified_time: iso(ago(20, 300)), modified_by: userRef(users[0]),
	last_executed_time: lastExec ? iso(lastExec) : null, lock: { locked_by: null, message: null, status: false },
	conditions: conditions.map((c, i) => ({ id: nid(), sequence_number: i + 1, criteria_details: c.criteria ? { criteria: c.criteria } : null, instant_actions: { actions: c.actions } })),
});
const crit = (api_name, comparator, value) => ({ comparator, field: { api_name }, value });
const allOf = (...g) => ({ group_operator: 'AND', group: g });
const webSources = ['Website', 'Web Form', 'web form', 'Web Site'];
const alert = (to, name) => ({ type: 'email_notifications', name, details: { to } });
const task = (name) => ({ type: 'tasks', name });
const upd = (name) => ({ type: 'field_updates', name });
const hook = (name) => ({ type: 'webhooks', name });
const workflows = [
	rule('New web lead - notify owner', 'Leads', 'create', {}, true, [{ criteria: crit('Lead_Source', 'in', webSources), actions: [alert(['record_owner'], 'New web lead')] }], ago(0, 1)),
	rule('New web lead - notify owner (copy)', 'Leads', 'create', {}, true, [{ criteria: crit('Lead_Source', 'in', webSources), actions: [alert(['record_owner'], 'New web lead')] }], ago(0, 1)),
	rule('Lead changed - notify owner', 'Leads', 'create_or_edit', { repeat: true }, true, [{ criteria: null, actions: [alert(['record_owner'], 'Lead updated')] }], ago(0, 1)),
	rule('Hot lead - task in 1 day', 'Leads', 'create', {}, true, [{ criteria: crit('Rating', 'equal', 'Hot'), actions: [task('Call hot lead'), alert(['record_owner', users[0].id], 'Hot lead')] }], ago(0, 2)),
	rule('Contacted - schedule follow-up', 'Leads', 'field_update', { field: { api_name: 'Lead_Status' } }, true, [{ criteria: crit('Lead_Status', 'equal', 'Contacted'), actions: [task('Follow up in 3 days')] }], ago(0, 2)),
	rule('Junk lead - notify manager', 'Leads', 'field_update', { field: { api_name: 'Lead_Status' } }, true, [{ criteria: crit('Lead_Status', 'equal', 'Junk Lead'), actions: [alert([users[0].id], 'Junk lead')] }], ago(1, 6)),
	rule('Trade show 2022 follow-up', 'Leads', 'create', {}, false, [{ criteria: crit('Trade_Show_2022', 'equal', true), actions: [task('Send booth follow-up')] }], new Date('2022-10-14T10:00:00-05:00')),
	rule('Test rule do not use', 'Leads', 'create', {}, false, [{ criteria: null, actions: [upd('Set rating')] }], null),
	rule('Push lead to old email tool', 'Leads', 'create', {}, true, [{ criteria: null, actions: [hook('POST to mail-sync (retired 2024)')] }], ago(0, 1)),
	rule('New contact - welcome task', 'Contacts', 'create', {}, true, [{ criteria: null, actions: [task('Welcome call')] }], ago(0, 3)),
	rule('Contact changed - notify owner', 'Contacts', 'create_or_edit', { repeat: true }, false, [{ criteria: null, actions: [alert(['record_owner'], 'Contact updated')] }], ago(200, 400)),
	rule('Deal changed - notify owner', 'Deals', 'create_or_edit', { repeat: true }, true, [{ criteria: null, actions: [alert(['record_owner'], 'Deal updated')] }], ago(0, 1)),
	rule('Stage change - notify manager', 'Deals', 'field_update', { field: { api_name: 'Stage' } }, true, [{ criteria: null, actions: [alert([users[0].id], 'Stage changed')] }], ago(0, 1)),
	rule('Closed won - tell the team', 'Deals', 'field_update', { field: { api_name: 'Stage' } }, true, [{ criteria: crit('Stage', 'equal', 'Closed Won'), actions: [alert(users.filter((u) => u.status === 'active').map((u) => u.id), 'Deal won')] }], ago(0, 4)),
	rule('Closed lost - ask for reason', 'Deals', 'field_update', { field: { api_name: 'Stage' } }, true, [{ criteria: crit('Stage', 'equal', 'Closed Lost'), actions: [task('Record loss reason')] }], ago(0, 3)),
	rule('Value Proposition stage task', 'Deals', 'field_update', { field: { api_name: 'Stage' } }, true, [{ criteria: crit('Stage', 'equal', 'Value Proposition'), actions: [task('Send value deck')] }], new Date('2023-03-02T09:00:00-05:00')),
];
const rulesCount = { scheduled_actions_per_rule_limit: 5, total_rules_limit: 2500, active_rules_configured: workflows.filter((w) => w.status.active).length, rules_per_process_limit: 10, total_actions_per_rule_limit: 50, total_rules_limit_per_module: 80, active_rules_limit: 2000, total_rules_configured: workflows.length, active_rules_limit_per_module: 40 };

// pipeline (Zoho v8 shape)
const dealsLayout = { id: nid(), name: 'Standard', status: 'active' };
const pipeline = [{ display_value: 'Standard (Standard)', actual_value: 'Standard (Standard)', default: true, id: nid(), maps: STAGES.map(([v, , type], i) => ({ display_value: v, actual_value: v, sequence_number: i + 1, id: nid(), forecast_type: type, forecast_category: { name: type === 'Open' ? 'Pipeline' : type === 'Closed Won' ? 'Closed' : 'Omitted', id: nid() } })) }];

// ---------- 30 days of activity, for the workflow e-mail simulation ----------
const events = [];
for (let d = 30; d >= 1; d--) {
	const date = dateOnly(new Date(TODAY - d * day)); const dow = new Date(TODAY - d * day).getDay(); const weekend = dow === 0 || dow === 6;
	const campaign = d === 9; // one campaign day
	const leadCreates = weekend ? int(8, 20) : campaign ? 430 : int(70, 125);
	for (let i = 0; i < leadCreates; i++) events.push({ date, module: 'Leads', action: 'create', values: { Lead_Source: campaign ? weighted([['Web Form', 6], ['Website', 3], ['Google Ads', 1]]) : weighted(SOURCE_WEIGHTS), Rating: chance(0.12) ? 'Hot' : null } });
	const leadEdits = weekend ? int(5, 20) : int(190, 290) + (d === 8 ? 260 : 0);
	for (let i = 0; i < leadEdits; i++) { const st = chance(0.3) ? pick(['Contacted', 'Attempted to Contact', 'Junk Lead', 'Pre-Qualified']) : null; events.push({ date, module: 'Leads', action: 'edit', changed: st ? ['Lead_Status'] : ['Phone'], values: { Lead_Status: st } }); }
	for (let i = 0, n = weekend ? int(0, 4) : int(10, 22); i < n; i++) events.push({ date, module: 'Contacts', action: 'create', values: {} });
	for (let i = 0, n = weekend ? int(2, 8) : int(60, 110); i < n; i++) { const stg = chance(0.25) ? weighted([['Needs Analysis', 5], ['Proposal/Price Quote', 5], ['Negotiation/Review', 3], ['Closed Won', 2], ['Closed Lost', 2]]) : null; events.push({ date, module: 'Deals', action: 'edit', changed: stg ? ['Stage'] : ['Amount'], values: { Stage: stg } }); }
	for (let i = 0, n = weekend ? 0 : int(3, 9); i < n; i++) events.push({ date, module: 'Deals', action: 'create', values: {} });
}

// strip private markers into truth, write files
const strip = (r) => { const o = { ...r }; for (const k of Object.keys(o)) if (k.startsWith('_')) delete o[k]; return o; };
truth.pids = { Leads: Object.fromEntries(records.Leads.map((r) => [r.id, r._pid])), Contacts: Object.fromEntries(records.Contacts.map((r) => [r.id, r._pid])) };
truth.dupKinds = Object.fromEntries([...records.Leads, ...records.Contacts].filter((r) => r._dupKind).map((r) => [r.id, r._dupKind]));
const org = {
	org: { company_name: 'Brightwater Supply Co. (fictional)', edition: 'Professional', licenses: users.filter((u) => u.status === 'active').length, time_zone: 'America/Chicago', today: iso(TODAY) },
	users, fields, layouts: { Deals: [dealsLayout] }, pipeline, workflows, rulesCount,
	records: Object.fromEntries(Object.entries(records).map(([k, v]) => [k, v.map(strip)])),
};
mkdirSync(new URL('./data/', import.meta.url), { recursive: true });
writeFileSync(new URL('./data/org.json', import.meta.url), JSON.stringify(org));
writeFileSync(new URL('./data/truth.json', import.meta.url), JSON.stringify(truth));
writeFileSync(new URL('./data/events.json', import.meta.url), JSON.stringify({ users: org.org.licenses, events }));
console.log('records', truth.counts, 'dup groups', Object.keys(truth.duplicates.Leads).length, Object.keys(truth.duplicates.Contacts).length, 'cross-module', truth.crossModule.length, 'decoy pairs', truth.decoyPairs.length, 'events', events.length);
