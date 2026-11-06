// Read-only snapshot of a Zoho CRM org: users, field metadata, pipeline, workflow rules (with their
// conditions and actions), rule limits, and every record of the chosen modules. Scopes needed (read only):
//   ZohoCRM.users.READ, ZohoCRM.settings.fields.READ, ZohoCRM.settings.layouts.READ,
//   ZohoCRM.settings.pipeline.READ, ZohoCRM.settings.workflow_rules.READ, ZohoCRM.modules.READ
const SKIP_TYPES = new Set(['subform', 'multiselectlookup', 'fileupload', 'imageupload', 'profileimage', 'formula_rollup']);
const INNER = 'conditions,conditions.instant_actions,conditions.criteria_details,conditions.scheduled_actions';

export async function takeSnapshot(zoho, { modules = ['Leads', 'Contacts', 'Accounts', 'Deals'], asOf, log = () => {} } = {}) {
	const t0 = Date.now();
	const users = (await zoho.request('GET', 'users', { query: { type: 'AllUsers', per_page: 200 } })).users;
	const fields = {};
	await Promise.all(modules.map(async (m) => { fields[m] = (await zoho.request('GET', 'settings/fields', { query: { module: m } })).fields; }));
	const layouts = modules.includes('Deals') ? (await zoho.request('GET', 'settings/layouts', { query: { module: 'Deals' } })).layouts || [] : [];
	const pipeline = [];
	for (const l of layouts) for (const p of (await zoho.request('GET', 'settings/pipeline', { query: { layout_id: l.id } })).pipeline || []) if (!pipeline.some((x) => x.id === p.id)) pipeline.push(p);
	const workflows = [];
	await Promise.all(modules.map(async (m) => { const j = await zoho.request('GET', 'settings/automation/workflow_rules', { query: { module: m, per_page: 200, include_inner_details: INNER } }); workflows.push(...(j.workflow_rules || [])); }));
	const rulesCount = (await zoho.request('GET', 'settings/automation/workflow_rules/actions/rules_count')).rules_count;
	log(`metadata: ${zoho.calls} calls`);
	const records = {};
	await Promise.all(modules.map(async (m) => {
		const names = fields[m].filter((f) => !SKIP_TYPES.has(f.data_type)).map((f) => f.api_name);
		records[m] = await zoho.records(m, names);
		log(`${m}: ${records[m].length} records`);
	}));
	return { takenAt: asOf || new Date().toISOString(), source: zoho.apiDomain, modules, users, fields, pipeline, workflows, rulesCount, records, api: { calls: zoho.calls, credits: zoho.credits, retries: zoho.retries, ms: Date.now() - t0 } };
}
