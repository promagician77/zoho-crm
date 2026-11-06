// Zoho CRM edition limits that shape a redesign, from zoho.com/crm/complete-feature-list.html and the API
// limits page (checked November 2026). null = not available in that edition.
export const EDITIONS = {
	Standard: { customFieldsPerModule: 10, rulesPerModule: 30, activeRulesPerModule: 15, emailsPerLicense: 100, emailsPerDayMax: 5000, layoutsPerModule: null, pipelines: 5, validationRulesPerLayout: null, uniqueFieldsPerModule: 2, blueprints: null, apiBase: 5000, apiPerLicense: 250, apiMax: 100000 },
	Professional: { customFieldsPerModule: 155, rulesPerModule: 80, activeRulesPerModule: 40, emailsPerLicense: 200, emailsPerDayMax: 10000, layoutsPerModule: 1, pipelines: 10, validationRulesPerLayout: 5, uniqueFieldsPerModule: 2, blueprints: 3, apiBase: 10000, apiPerLicense: 500, apiMax: 500000 },
	Enterprise: { customFieldsPerModule: 300, rulesPerModule: 125, activeRulesPerModule: 75, emailsPerLicense: 500, emailsPerDayMax: 25000, layoutsPerModule: 3, pipelines: 20, validationRulesPerLayout: 10, uniqueFieldsPerModule: 2, blueprints: 50, apiBase: 15000, apiPerLicense: 1000, apiMax: 1000000 },
	Ultimate: { customFieldsPerModule: 500, rulesPerModule: 150, activeRulesPerModule: 100, emailsPerLicense: 1000, emailsPerDayMax: 50000, layoutsPerModule: 6, pipelines: 50, validationRulesPerLayout: 25, uniqueFieldsPerModule: 2, blueprints: 100, apiBase: 15000, apiPerLicense: 2000, apiMax: Infinity },
};
export const emailCap = (edition, licenses) => { const e = EDITIONS[edition]; return Math.min(e.emailsPerLicense * licenses, e.emailsPerDayMax); };
export const apiCredits = (edition, licenses) => { const e = EDITIONS[edition]; return Math.min(e.apiBase + e.apiPerLicense * licenses, e.apiMax); };
