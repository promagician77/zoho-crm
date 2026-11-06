// Two-page summary (US Letter) from the same results as the site. No pricing or schedule.
import { readFileSync, writeFileSync } from 'node:fs';
const ROOT = new URL('../', import.meta.url).pathname;
const M = JSON.parse(readFileSync(ROOT + 'results/measurements.json', 'utf8'));
const n = (x) => Number(x).toLocaleString('en-US');
const pct = (x, d = 0) => (x * 100).toFixed(d) + '%';
const L = M.duplicates.Leads;
const F = Object.fromEntries(M.findings.before.map((f) => [f.id, f]));
const A = M.findings.after;
const credits = M.snapshot.credits + M.apply.serverCredits;
const font = (f) => 'file://' + ROOT + 'site/fonts/' + f;
const rows = ['owners.inactive', 'duplicates.Leads', 'duplicates.Contacts', 'picklists.leadSource', 'data.phoneFormats', 'deals.legacyStage', 'deals.overdue', 'duplicates.leadIsContact', 'workflows.noisy', 'workflows.duplicate', 'fields.sparse']
	.map((id) => { const f = F[id]; const a = A[id]; return `<tr><td><span class="sev ${f.severity}">${f.severity}</span></td><td class="num">${n(f.count)}</td><td class="num ${a === 0 ? 'ok' : ''}">${a === 0 ? '0 ✓' : n(a)}</td><td>${f.title}</td></tr>`; }).join('');
const lim = (k) => ['Standard', 'Professional', 'Enterprise'].map((e) => `<td class="num">${M.limits[e][k] === null ? '—' : n(M.limits[e][k])}</td>`).join('');

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Zoho CRM audit kit</title><style>
@font-face { font-family: Plex; src: url(${font('ibm-plex-sans-latin-400-normal.woff2')}); font-weight: 400; }
@font-face { font-family: Plex; src: url(${font('ibm-plex-sans-latin-500-normal.woff2')}); font-weight: 500; }
@font-face { font-family: Plex; src: url(${font('ibm-plex-sans-latin-600-normal.woff2')}); font-weight: 600; }
@font-face { font-family: PlexMono; src: url(${font('ibm-plex-mono-latin-400-normal.woff2')}); font-weight: 400; }
@font-face { font-family: PlexSerif; src: url(${font('ibm-plex-serif-latin-400-normal.woff2')}); font-weight: 400; }
@page { size: Letter; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font: 400 9.3pt/1.45 Plex, sans-serif; color: #1C1B19; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sheet { width: 8.5in; height: 11in; overflow: hidden; position: relative; background: #FAF8F3; page-break-after: always; }
.sheet:last-child { page-break-after: auto; }
.bar { background: #1C1B19; color: #F3F1EA; display: flex; justify-content: space-between; align-items: center; padding: 0 0.55in; height: 0.42in; font-size: 8pt; }
.bar b { font-weight: 600; font-size: 9pt; } .bar span { color: #B9B5AA; }
.pad { padding: 0 0.55in; }
.k { font: 400 7pt PlexMono, monospace; letter-spacing: .14em; text-transform: uppercase; color: #77756f; margin: 0 0 4pt; }
h1 { font: 400 21pt/1.15 PlexSerif, serif; margin: 0; letter-spacing: -.01em; }
h2 { font: 600 11pt Plex, sans-serif; margin: 0 0 4pt; }
p { margin: 0; }
.lede { color: #52514e; margin-top: 6pt; font-size: 9.5pt; max-width: 6.6in; }
.stats { display: grid; grid-template-columns: repeat(5, 1fr); border-top: 1px solid #1C1B19; margin: 12pt 0 12pt; }
.stats div { padding: 7pt 8pt 0 0; } .stats b { display: block; font: 400 18pt/1 PlexSerif, serif; } .stats span { display: block; font-size: 7.6pt; color: #52514e; margin-top: 4pt; line-height: 1.3; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font: 400 6.6pt PlexMono, monospace; letter-spacing: .08em; text-transform: uppercase; color: #77756f; border-bottom: 1px solid #1C1B19; padding: 3pt 6pt 3pt 0; }
td { border-bottom: 1px solid #DDD8CC; padding: 3.2pt 6pt 3.2pt 0; font-size: 8.6pt; }
td.num { font-family: PlexMono, monospace; text-align: right; } td.ok { color: #1E7A4C; }
.sev { font: 400 6.4pt PlexMono, monospace; text-transform: uppercase; color: #fff; padding: 1pt 4pt; border-radius: 2pt; }
.sev.high { background: #B3261E; } .sev.medium { background: #A15C00; } .sev.low { background: #5F6B7A; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 14pt; }
.card { background: #fff; border: 1px solid #DDD8CC; padding: 8pt 10pt; }
.card.us { border: 1.5pt solid #1C1B19; }
img { width: 100%; display: block; }
img.crop { height: 2.38in; object-fit: cover; object-position: top; }
.score { display: grid; grid-template-columns: 1.4fr 1fr 1fr 1fr; font-size: 8.4pt; }
.score div { padding: 3pt 4pt 3pt 0; border-bottom: 1px solid #DDD8CC; } .score .h { font: 400 6.6pt PlexMono, monospace; text-transform: uppercase; color: #77756f; border-bottom: 1px solid #1C1B19; }
.score .us { font-weight: 600; }
ol { margin: 4pt 0 0; padding-left: 14pt; } li { margin-bottom: 3pt; font-size: 8.6pt; }
.foot { position: absolute; left: 0; right: 0; bottom: 0; background: #1C1B19; color: #D7D3C8; padding: 9pt 0.55in; display: grid; grid-template-columns: 1fr 1fr; gap: 14pt; font-size: 7.8pt; }
.foot h2 { color: #F3F1EA; font-size: 8.6pt; }
</style></head><body>

<section class="sheet">
	<div class="bar"><b>Zoho CRM audit &amp; cleanup kit</b><span>Live review: [your Vercel link]</span></div>
	<div class="pad" style="padding-top:14pt">
		<p class="k">One measured run · fictional sample org · Zoho CRM v8 API</p>
		<h1>What the kit found in a three-year-old CRM, and what it fixed</h1>
		<p class="lede">Brightwater Supply Co. is invented: ${n(Object.values(M.snapshot.records).reduce((a, b) => a + b, 0))} records, ${M.org.users} users (one deactivated), ${M.register.rules.length} workflow rules, Professional edition. Problems were planted on purpose so the results can be scored. The kit read the org, wrote a plan, and applied it through the API.</p>
		<div class="stats">
			<div><b>${n(M.plan.recordsRemovedByAutoMerge)}</b><span>duplicates merged, ${M.plan.autoMergeGroupsWrong} wrong; ${M.plan.reviewMerges} groups held for review</span></div>
			<div><b>${M.picklists.valuesBefore} → ${M.reports.sourceAfter.length}</b><span>Lead Source values</span></div>
			<div><b>${n(M.plan.updatesByReason['Owner: reassign from deactivated users'])}</b><span>records moved off a deactivated user</span></div>
			<div><b>${n(M.apply.updated)}</b><span>record updates, ${M.apply.errors} errors; second run: ${M.secondRun.recordUpdates} left</span></div>
			<div><b>${n(credits)}</b><span>API credits, ${pct(credits / M.org.allowance, 1)} of the daily allowance</span></div>
		</div>
		<div class="two">
			<div><h2>Findings, before and after</h2><table><thead><tr><th></th><th style="text-align:right">Before</th><th style="text-align:right">After</th><th>Finding</th></tr></thead><tbody>${rows}</tbody></table>
				<p style="font-size:7.8pt;color:#52514e;margin-top:4pt">Overdue deals and leads-that-are-contacts are flagged for the owners, not changed: those need a person.</p></div>
			<div><h2>Duplicates: not merging the wrong people</h2>
				<div class="score"><div class="h">Method</div><div class="h">Real</div><div class="h">Found</div><div class="h">Wrong pairs</div>
					<div>Exact text match</div><div>${pct(L.exact.precision)}</div><div>${pct(L.exact.recall)}</div><div>${n(L.exact.falsePositives)}</div>
					<div>Any one field</div><div>${pct(L.loose.precision)}</div><div>${pct(L.loose.recall)}</div><div>${n(L.loose.falsePositives)}</div>
					<div class="us">This kit</div><div class="us">${pct(L.ours.precision)}</div><div class="us">${pct(L.ours.recall)}</div><div class="us">${n(L.ours.falsePositives)}</div></div>
				<p style="font-size:8.2pt;color:#52514e;margin:5pt 0 6pt">Rules: same personal email; or same phone and names that agree; or same company and names that agree. A shared switchboard never counts. When two personal emails disagree, the group waits for a person: all ${L.ours.falsePositives} wrong pairs (namesakes at one company) were stopped there.</p>
				<img src="img/review-card.png" alt="" style="border:1px solid #DDD8CC">
			</div>
		</div>
		<div class="two" style="margin-top:9pt">
			<div class="card"><img class="crop" src="img/source-before.png" alt=""></div>
			<div class="card"><img class="crop" src="img/source-after.png" alt=""></div>
		</div>
	</div>
</section>

<section class="sheet">
	<div class="bar"><b>Zoho CRM audit &amp; cleanup kit</b><span>2 / 2</span></div>
	<div class="pad" style="padding-top:14pt">
		<p class="k">Workflows</p>
		<h1 style="font-size:17pt">Every edition caps workflow e-mails per user licence, per day</h1>
		<p class="lede">The sample's rules replayed against 30 days of activity. Two rules that mail on every edit plus one rule copied twice send most of the volume: on Standard (${M.limits.Standard.emailsPerLicense} per licence) that goes over the cap on ${M.email.Standard.current.daysOverCap} of 30 days. The proposed set averages ${M.email.Standard.proposed.avg} a day.</p>
		<div class="two" style="grid-template-columns:1.45fr 1fr;margin-top:8pt;align-items:start">
			<div class="card"><img src="img/email.png" alt=""></div>
			<div><h2>Edition limits that shape a redesign</h2><table><thead><tr><th></th><th style="text-align:right">Std</th><th style="text-align:right">Pro</th><th style="text-align:right">Ent</th></tr></thead><tbody>
				<tr><td>Custom fields / module</td>${lim('customFieldsPerModule')}</tr>
				<tr><td>Page layouts / module</td>${lim('layoutsPerModule')}</tr>
				<tr><td>Active rules / module</td>${lim('activeRulesPerModule')}</tr>
				<tr><td>Workflow e-mails / licence / day</td>${lim('emailsPerLicense')}</tr>
				<tr><td>Validation rules / layout</td>${lim('validationRulesPerLayout')}</tr>
				<tr><td>Unique fields / module</td>${lim('uniqueFieldsPerModule')}</tr>
				<tr><td>Blueprints</td>${lim('blueprints')}</tr></tbody></table>
				<p style="font-size:7.4pt;color:#77756f;margin-top:3pt">Zoho feature comparison, November 2026. — = not available.</p></div>
		</div>
		<div class="two" style="margin-top:12pt">
			<div><p class="k">How it runs</p><h2>Read first, change second, everything written down</h2><ol>
				<li><b>Snapshot</b> with read-only scopes: users, fields, pipeline, workflow rules with their criteria and actions, every record. ${M.snapshot.calls} calls / ${M.snapshot.credits} credits here.</li>
				<li><b>Audit</b> offline: ${M.findings.before.length} checks, re-runnable for free.</li>
				<li><b>Plan</b> as a JSON file you can read. Business decisions (which sources are the same, who takes a leaver's records) live in small mapping files.</li>
				<li><b>Dry run</b>: every request and its credit cost (${n(M.plan.apiCredits)} estimated = ${n(M.apply.serverCredits)} charged).</li>
				<li><b>Apply</b> with a journal of before-values; <b>rollback</b> restores them. Merges can't be undone via the API, so uncertain groups wait for approval.</li>
			</ol></div>
			<div><p class="k">Documentation</p><h2>The register writes itself from the API</h2><p style="font-size:8.6pt;color:#52514e">Every field with type and fill rate, the pipeline, every workflow rule with trigger, criteria and actions, and a log of applied changes, regenerated after each change. Settings the API should not touch become a ${M.plan.manualSteps}-step checklist with where to find each one: removing picklist options, retiring ${F['fields.sparse'].count} near-empty fields after export, switching off the noisy and duplicate rules, Email duplicate check on web forms, an assignment rule for new leads, a required loss reason.</p>
				<p style="font-size:8.6pt;color:#52514e;margin-top:6pt">Checked: ${M.tests.join(', ')}, covering matching, picklists, credit maths, paging past 2,000 records, API limits, apply and rollback.</p></div>
		</div>
	</div>
	<div class="foot">
		<div><h2>Measured</h2>One run against a mock of the Zoho CRM v8 API that follows the documented endpoints, response shapes, paging, merge and update limits and credit costs. Scores are counted against the problems planted in the sample.</div>
		<div><h2>Not measured</h2>Your org: the sample and the rules share an author, so scores show the rules work on these patterns, not a promise for your data; every merge group is listed for approval first. Live API speed. The e-mail activity log is generated.</div>
	</div>
</section>
</body></html>`;
writeFileSync(ROOT + 'print/print.html', html);
console.log('print/print.html');
