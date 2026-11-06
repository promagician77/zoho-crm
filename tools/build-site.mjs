// Builds site/index.html from results/ so every number on the page is a measured one.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
const ROOT = new URL('../', import.meta.url).pathname;
const J = (p) => JSON.parse(readFileSync(ROOT + p, 'utf8'));
const M = J('results/measurements.json');
const plan = J('results/run/plan.json');
const truth = J('mock/data/truth.json');
const transcript = readFileSync(ROOT + 'results/transcript.txt', 'utf8');
mkdirSync(ROOT + 'site/files', { recursive: true });
copyFileSync(ROOT + 'results/register.md', ROOT + 'site/files/configuration-register.md');
copyFileSync(ROOT + 'results/measurements.json', ROOT + 'site/files/measurements.json');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const n = (x) => Number(x).toLocaleString('en-US');
const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';
const usd = (x) => (x >= 1e6 ? '$' + (x / 1e6).toFixed(2) + 'M' : '$' + Math.round(x / 1000).toLocaleString('en-US') + 'k');
const L = M.duplicates.Leads, C = M.duplicates.Contacts;
const before = Object.fromEntries(M.findings.before.map((f) => [f.id, f]));
const after = M.findings.after;
const recTotal = Object.values(M.snapshot.records).reduce((a, b) => a + b, 0);
const creditsUsed = M.snapshot.credits + M.apply.serverCredits;
const email = M.email;

// ---------- merge examples (from the real plan) ----------
const pidOf = (mod, id) => truth.pids[mod][id];
const auto = plan.merges.filter((m) => m.status === 'auto');
const ex = [
	auto.find((m) => m.reasons.includes('phone') && !m.reasons.includes('email') && m.children.some((c) => c.fields.length)),
	auto.find((m) => m.reasons.includes('company') && !m.reasons.includes('email')),
	auto.find((m) => m.children.length === 2),
].filter(Boolean);
const namesake = plan.merges.find((m) => m.status === 'review' && new Set([m.master, ...m.children.map((c) => c.id)].map((id) => pidOf(m.module, id))).size > 1);
const realReview = plan.merges.find((m) => m.status === 'review' && new Set([m.master, ...m.children.map((c) => c.id)].map((id) => pidOf(m.module, id))).size === 1);
const why = { email: 'same email', phone: 'same phone + names agree', company: 'same company + names agree' };
const card = (m, label, note) => `<article class="mg"><header><span class="tag ${m.status}">${label}</span><span class="why">${m.reasons.map((r) => why[r] || r).join(' · ')}</span></header>
	<table><thead><tr><th></th><th>Name</th><th>Email</th><th>Phone</th><th>Company</th></tr></thead><tbody>
	${m.preview.map((p, i) => `<tr class="${i === 0 ? 'master' : ''}"><td>${i === 0 ? 'keep' : 'merge in'}</td><td>${esc(p.name)}</td><td class="mono em" title="${esc((p.email || '').trim())}">${esc((p.email || '—').trim())}</td><td class="mono ph">${esc(p.phone || '—')}</td><td>${esc(p.company)}</td></tr>`).join('')}
	</tbody></table>${note ? `<p>${note}</p>` : m.children.some((c) => c.fields.length) ? `<p>Fields the kept record takes from the others: ${[...new Set(m.children.flatMap((c) => c.fields))].map((f) => `<code>${f}</code>`).join(' ')}</p>` : ''}</article>`;

// ---------- charts (SVG, hover tooltips) ----------
function hbars(rows, { max, color = 'var(--s1)', fmt = n, flag = () => false, w = 560 }) {
	const bh = 18, gap = 6, lw = 190, top = 4; const H = rows.length * (bh + gap) + top;
	const m = max || Math.max(...rows.map((r) => r[1]));
	const sc = (v) => (v / m) * (w - lw - 60);
	return `<div class="scroll"><svg class="chart" viewBox="0 0 ${w} ${H}" role="img">${rows.map(([k, v], i) => { const y = top + i * (bh + gap); const f = flag(k); return `<g class="bar" data-tip="${esc(k)}: ${fmt(v)}"><rect x="0" y="${y - 3}" width="${w}" height="${bh + gap}" fill="transparent"/><text x="${lw - 8}" y="${y + 13}" text-anchor="end" class="${f ? 'flag' : ''}">${esc(k)}</text><rect x="${lw}" y="${y}" width="${Math.max(2, sc(v))}" height="${bh}" rx="3" fill="${f ? 'var(--s2)' : color}"/><text x="${lw + sc(v) + 6}" y="${y + 13}" class="val">${fmt(v)}</text></g>`; }).join('')}</svg></div>`;
}
function emailChart() {
	const cur = email.Standard.current.days, pro = email.Standard.proposed.days;
	const W = 760, H = 300, l = 44, r = 140, t = 16, b = 34;
	const maxY = 1300; const x = (i) => l + (i / (cur.length - 1)) * (W - l - r); const y = (v) => t + (1 - v / maxY) * (H - t - b);
	const path = (d) => d.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.sent).toFixed(1)}`).join('');
	const grid = [0, 300, 600, 900, 1200].map((v) => `<line x1="${l}" x2="${W - r}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${l - 6}" y="${y(v) + 4}" text-anchor="end" class="ax">${n(v)}</text>`).join('');
	const caps = [['Standard', email.Standard.current.cap], ['Professional', email.Professional.current.cap]].map(([k, v]) => `<line x1="${l}" x2="${W - r}" y1="${y(v)}" y2="${y(v)}" class="cap"/><text x="${W - r + 6}" y="${y(v) + 4}" class="capt">${k} cap ${n(v)}</text>`).join('');
	const ticks = cur.map((d, i) => (i % 7 === 0 ? `<text x="${x(i)}" y="${H - 12}" text-anchor="middle" class="ax">${d.date.slice(5)}</text>` : '')).join('');
	const over = cur.map((d, i) => (d.sent > email.Standard.current.cap ? `<circle cx="${x(i)}" cy="${y(d.sent)}" r="4" class="over"/>` : '')).join('');
	return `<div class="scroll"><svg class="chart line" viewBox="0 0 ${W} ${H}" data-days='${JSON.stringify(cur.map((d, i) => [d.date, d.sent, pro[i].sent]))}' data-l="${l}" data-r="${r}" data-w="${W}" role="img" aria-label="Workflow e-mails per day, current rules versus proposed">
		${grid}${caps}${ticks}
		<path d="${path(cur)}" class="ln s2"/><path d="${path(pro)}" class="ln s1"/>${over}
		<text x="${x(cur.length - 1) + 6}" y="${y(cur[cur.length - 1].sent) - 18}" class="dl s2t">current rules</text>
		<text x="${x(cur.length - 1) + 6}" y="${y(pro[pro.length - 1].sent) + 4}" class="dl s1t">proposed</text>
		<line class="xh" x1="0" x2="0" y1="${t}" y2="${H - b}" style="display:none"/>
	</svg></div>`;
}

// ---------- tables ----------
const sevOrder = ['high', 'medium', 'low', 'info'];
const MANUAL = (f) => f.area === 'Automation' || f.id.startsWith('fields') || f.id === 'picklists.unused';
const findingsRows = M.findings.before.filter((f) => f.severity !== 'info').map((f) => {
	const a = after[f.id]; const fixed = a === 0 && f.count > 0; const changed = a !== undefined && a !== f.count;
	return `<tr><td><span class="sev ${f.severity}">${f.severity}</span></td><td class="num">${n(f.count)}</td><td class="num ${fixed ? 'fixed' : ''}">${a === undefined ? '' : fixed ? '0 ✓' : n(a)}</td><td><b>${esc(f.title)}</b><small>${esc(f.detail)}</small></td><td class="act">${fixed ? 'fixed by the kit' : MANUAL(f) ? 'manual step in the plan' : changed ? 'partly; the rest needs a decision' : 'flagged for the team'}</td></tr>`;
}).join('');
const rules = M.register.rules.map((r) => {
	const off = M.proposedOff.includes(r.name);
	const fb = email.Standard.current.byRule[r.name] || 0;
	return `<tr class="${r.active ? '' : 'inactive'}"><td>${esc(r.name)}</td><td>${r.module}</td><td>${r.active ? 'on' : 'off'}</td><td class="mono sm">${esc(r.trigger)}</td><td class="num">${fb ? n(fb) : '—'}</td><td>${!r.active ? 'delete' : off ? '<b>turn off</b>' : r.name === 'New web lead - notify owner' ? 'keep, criteria = Website' : r.name === 'Stage change - notify manager' ? 'keep, late stages only' : r.name.includes('old email tool') ? 'confirm with you' : 'keep'}</td></tr>`;
}).join('');
const ED = ['Standard', 'Professional', 'Enterprise'];
const limRow = (label, key, fmt = (v) => (v === null ? '<span class="no">not available</span>' : n(v))) => `<tr><td>${label}</td>${ED.map((e) => `<td class="num">${fmt(M.limits[e][key], e)}</td>`).join('')}</tr>`;
const leads = M.register.modules.find((m) => m.module === 'Leads');
const regRows = leads.fields.map((f) => `<tr class="${f.custom && f.fill < 0.02 ? 'sparse' : ''}"><td>${esc(f.label)}${f.required ? ' <span class="req">*</span>' : ''}</td><td class="mono sm">${f.api}</td><td class="sm">${f.type}${f.options ? ` · ${f.options}` : ''}</td><td>${f.custom ? 'custom' : ''}</td><td class="num"><span class="fill"><i style="width:${(f.fill * 100).toFixed(0)}%"></i></span>${(f.fill * 100).toFixed(0)}%</td></tr>`).join('');
const manual = plan.manual.map((s) => `<li><b>${esc(s.area)}</b> ${esc(s.what)}<small>${esc(s.where.replace('{module}', s.module && s.module.includes(',') ? 'each module' : s.module))}</small></li>`).join('');
const stageRows = Object.entries(M.reports.stagesBefore).sort((a, b) => b[1].count - a[1].count).map(([k, v]) => [k, v.count]);
const openDeals = M.reports.openDeals; const overdue = openDeals.filter((d) => d.overdue);
const overdueByStage = {}; for (const d of overdue) overdueByStage[d.stage] = (overdueByStage[d.stage] || 0) + d.amount;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>Zoho CRM audit kit</title>
<link rel="preload" href="fonts/ibm-plex-sans-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<style>
@font-face { font-family: "IBM Plex Sans"; src: url(fonts/ibm-plex-sans-latin-400-normal.woff2) format('woff2'); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: "IBM Plex Sans"; src: url(fonts/ibm-plex-sans-latin-500-normal.woff2) format('woff2'); font-weight: 500; font-style: normal; font-display: swap; }
@font-face { font-family: "IBM Plex Sans"; src: url(fonts/ibm-plex-sans-latin-600-normal.woff2) format('woff2'); font-weight: 600; font-style: normal; font-display: swap; }
@font-face { font-family: "IBM Plex Sans"; src: url(fonts/ibm-plex-sans-latin-400-italic.woff2) format('woff2'); font-weight: 400; font-style: italic; font-display: swap; }
@font-face { font-family: "IBM Plex Mono"; src: url(fonts/ibm-plex-mono-latin-400-normal.woff2) format('woff2'); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: "IBM Plex Mono"; src: url(fonts/ibm-plex-mono-latin-500-normal.woff2) format('woff2'); font-weight: 500; font-style: normal; font-display: swap; }
@font-face { font-family: "IBM Plex Serif"; src: url(fonts/ibm-plex-serif-latin-400-normal.woff2) format('woff2'); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: "IBM Plex Serif"; src: url(fonts/ibm-plex-serif-latin-500-normal.woff2) format('woff2'); font-weight: 500; font-style: normal; font-display: swap; }
:root { color-scheme: light; --paper: #FAF8F3; --card: #FFFFFF; --ink: #1C1B19; --ink2: #52514e; --ink3: #77756f; --rule: #DDD8CC; --rule2: #ECE8DE; --s1: #2a78d6; --s2: #eb6834; --good: #1E7A4C; --high: #B3261E; --med: #A15C00; --low: #5F6B7A; --pad: clamp(16px, 4vw, 56px); }
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 400 15px/1.55 "IBM Plex Sans", system-ui, sans-serif; }
.mono, code, pre { font-family: "IBM Plex Mono", ui-monospace, monospace; }
code { font-size: .86em; background: var(--rule2); padding: 1px 5px; border-radius: 3px; }
h1, h2, h3 { margin: 0; font-weight: 500; line-height: 1.2; }
h2 { font-family: "IBM Plex Serif", Georgia, serif; font-size: clamp(26px, 3vw, 38px); font-weight: 400; letter-spacing: -.01em; max-width: 22em; }
h3 { font-size: 17px; font-weight: 600; }
.wrap { max-width: 1320px; margin: 0 auto; padding: 0 var(--pad); }
.kicker { font: 500 11px/1 "IBM Plex Mono", monospace; letter-spacing: .14em; text-transform: uppercase; color: var(--ink3); margin: 0 0 12px; }
.lede { color: var(--ink2); max-width: 46em; font-size: 16px; margin: 14px 0 0; }
small { display: block; color: var(--ink3); font-size: 13px; margin-top: 2px; }
.top { background: var(--ink); color: #F3F1EA; }
.top .wrap { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 24px; padding-top: 22px; padding-bottom: 18px; }
.top h1 { font-size: 18px; font-weight: 600; }
.top p { margin: 0; color: #B9B5AA; font-size: 13px; }
.top .flag { margin-left: auto; font: 500 11px "IBM Plex Mono", monospace; letter-spacing: .1em; text-transform: uppercase; border: 1px solid #5d5a52; padding: 4px 8px; color: #d8d4c8; }
nav { position: sticky; top: 0; z-index: 5; background: var(--paper); border-bottom: 1px solid var(--rule); }
nav .wrap { display: flex; gap: 2px; overflow-x: auto; scrollbar-width: none; }
nav .wrap::-webkit-scrollbar { display: none; }
[role=tab] { appearance: none; border: 0; background: none; font: 500 14px "IBM Plex Sans", sans-serif; color: var(--ink2); padding: 16px 14px 14px; border-bottom: 3px solid transparent; cursor: pointer; white-space: nowrap; }
[role=tab][aria-selected=true] { color: var(--ink); border-bottom-color: var(--ink); }
[role=tab]:focus-visible { outline: 2px solid var(--s1); outline-offset: -4px; }
[role=tabpanel] { padding: clamp(32px, 5vw, 64px) 0 72px; }
[role=tabpanel][hidden] { display: none; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font: 500 11px "IBM Plex Mono", monospace; letter-spacing: .08em; text-transform: uppercase; color: var(--ink3); padding: 8px 10px 8px 0; border-bottom: 1px solid var(--ink); }
td { padding: 10px 10px 10px 0; border-bottom: 1px solid var(--rule); vertical-align: top; }
td.num { font-family: "IBM Plex Mono", monospace; text-align: right; white-space: nowrap; }
.sm { font-size: 12.5px; }
.scroll { overflow-x: auto; }
.scroll > svg.chart { min-width: 520px; } .scroll > svg.chart.line { min-width: 640px; }
/* audit */
.stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); border-top: 1px solid var(--ink); margin: 36px 0 44px; }
.stats div { padding: 16px 18px 0 0; }
.stats b { display: block; font: 400 clamp(28px, 3.2vw, 42px)/1 "IBM Plex Serif", serif; }
.stats span { display: block; color: var(--ink2); font-size: 13px; margin-top: 8px; max-width: 17em; }
.sev { font: 500 10.5px "IBM Plex Mono", monospace; text-transform: uppercase; letter-spacing: .08em; padding: 3px 7px; border-radius: 3px; color: #fff; }
.sev.high { background: var(--high); } .sev.medium { background: var(--med); } .sev.low { background: var(--low); }
td.fixed { color: var(--good); font-weight: 500; }
td.act { font-size: 13px; color: var(--ink2); white-space: nowrap; }
.ledger td:nth-child(4) { min-width: 300px; }
.orgline { display: flex; flex-wrap: wrap; gap: 8px 28px; font-size: 13px; color: var(--ink2); margin-top: 18px; }
.orgline b { color: var(--ink); font-weight: 500; }
/* duplicates */
.scores { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin: 32px 0 12px; }
.score { background: var(--card); border: 1px solid var(--rule); padding: 20px 22px; }
.score.us { border: 2px solid var(--ink); }
.score h3 { font-size: 15px; } .score p { font-size: 13px; color: var(--ink2); margin: 4px 0 16px; min-height: 3.2em; }
.pr { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.pr b { display: block; font: 400 34px/1 "IBM Plex Serif", serif; }
.pr span { font-size: 12px; color: var(--ink3); }
.meter { height: 6px; background: var(--rule2); margin-top: 8px; border-radius: 3px; overflow: hidden; }
.meter i { display: block; height: 100%; background: var(--ink); }
.score .fp { margin-top: 14px; font-size: 13px; border-top: 1px solid var(--rule); padding-top: 10px; }
.mgs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 20px; }
.mg { background: var(--card); border: 1px solid var(--rule); padding: 16px 18px; overflow-x: auto; }
.mg header { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }
.mg .why { font-size: 12.5px; color: var(--ink2); }
.mg table { font-size: 12.5px; } .mg td, .mg th { padding: 6px 8px 6px 0; }
.mg tr.master td { font-weight: 500; }
.mg td.em { max-width: 210px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .mg td.ph { white-space: nowrap; }
.mg tr td:first-child { color: var(--ink3); font-size: 11.5px; white-space: nowrap; }
.mg p { font-size: 13px; color: var(--ink2); margin: 10px 0 0; }
.tag { font: 500 10.5px "IBM Plex Mono", monospace; text-transform: uppercase; letter-spacing: .08em; padding: 3px 7px; border-radius: 3px; }
.tag.auto { background: #E3F0E9; color: var(--good); } .tag.review { background: #FBEBD9; color: var(--med); }
.split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 48px; margin-top: 48px; }
.split.wide { grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); }
/* reports */
.chart { width: 100%; height: auto; display: block; font: 12px "IBM Plex Sans", sans-serif; }
.chart text { fill: var(--ink2); } .chart text.val { fill: var(--ink); font-family: "IBM Plex Mono", monospace; font-size: 11.5px; }
.chart text.flag { fill: var(--ink); font-weight: 600; }
.chart .bar:hover rect:nth-of-type(2) { opacity: .8; }
.panel { background: var(--card); border: 1px solid var(--rule); padding: 20px 22px; }
.panel h3 + p { font-size: 13px; color: var(--ink2); margin: 4px 0 14px; }
.legend { display: flex; gap: 16px; font-size: 12.5px; color: var(--ink2); margin: 0 0 10px; flex-wrap: wrap; }
.legend i { display: inline-block; width: 12px; height: 12px; border-radius: 2px; vertical-align: -1px; margin-right: 6px; }
.kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
.kpis div { background: var(--card); border: 1px solid var(--rule); padding: 14px 16px; }
.kpis b { display: block; font: 400 26px/1.1 "IBM Plex Serif", serif; } .kpis span { font-size: 12.5px; color: var(--ink2); }
/* automation */
.chart.line .grid { stroke: var(--rule2); } .chart.line .ax { fill: var(--ink3); font-size: 11px; }
.chart.line .ln { fill: none; stroke-width: 2; } .chart.line .s1 { stroke: var(--s1); } .chart.line .s2 { stroke: var(--s2); }
.chart.line .cap { stroke: var(--ink); stroke-dasharray: 4 4; stroke-width: 1; } .chart.line .capt { fill: var(--ink); font-size: 11.5px; font-weight: 500; }
.chart.line .over { fill: var(--paper); stroke: var(--s2); stroke-width: 2; }
.chart.line .dl { font-size: 12px; font-weight: 600; } .chart.line .s1t { fill: var(--ink); } .chart.line .s2t { fill: var(--ink); }
.chart.line .xh { stroke: var(--ink3); stroke-width: 1; }
.tip { position: fixed; pointer-events: none; background: var(--ink); color: #F3F1EA; font: 12px/1.4 "IBM Plex Sans", sans-serif; padding: 6px 9px; border-radius: 4px; z-index: 20; display: none; white-space: nowrap; }
tr.inactive td { color: var(--ink3); }
.no { color: var(--ink3); font-family: "IBM Plex Sans", sans-serif; font-size: 12.5px; }
.callout { border-left: 3px solid var(--ink); padding: 4px 0 4px 16px; margin: 24px 0 0; max-width: 52em; color: var(--ink2); }
.callout b { color: var(--ink); }
/* documentation */
.doc { background: var(--card); border: 1px solid var(--rule); box-shadow: 0 1px 0 var(--rule2), 0 18px 40px -28px rgba(0,0,0,.25); padding: clamp(20px, 3vw, 40px); }
.doc h3 { font-family: "IBM Plex Serif", serif; font-weight: 500; font-size: 22px; }
.doc .meta { font-size: 12.5px; color: var(--ink3); margin: 6px 0 18px; }
.fill { display: inline-block; width: 60px; height: 6px; background: var(--rule2); margin-right: 8px; vertical-align: middle; border-radius: 3px; overflow: hidden; }
.fill i { display: block; height: 100%; background: var(--s1); }
tr.sparse td { background: #FBF3EA; }
.req { color: var(--high); }
ol.steps { padding-left: 22px; margin: 12px 0 0; } ol.steps li { margin-bottom: 10px; } ol.steps small { margin-top: 1px; }
/* how it runs */
pre.term { background: #16181B; color: #DCE1E6; padding: 20px 22px; overflow-x: auto; font-size: 12.5px; line-height: 1.55; border-radius: 4px; }
pre.term .cmd { color: #9ED39A; }
.grid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-top: 28px; }
.grid3 > div { background: var(--card); border: 1px solid var(--rule); padding: 18px 20px; font-size: 14px; }
.grid3 h3 { margin-bottom: 8px; } .grid3 ul { margin: 0; padding-left: 18px; color: var(--ink2); } .grid3 li { margin-bottom: 6px; }
.disclose { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 40px; border-top: 1px solid var(--ink); padding-top: 20px; }
.disclose h3 { font-size: 14px; margin-bottom: 6px; } .disclose ul { margin: 0; padding-left: 18px; color: var(--ink2); font-size: 14px; }
@media (max-width: 960px) {
	.stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.scores, .mgs, .split, .split.wide, .grid3, .disclose { grid-template-columns: minmax(0, 1fr); }
	.kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.top .flag { margin-left: 0; }
	.ledger td.act { white-space: normal; }
}
</style></head>
<body>
<header class="top"><div class="wrap"><h1>Zoho CRM audit &amp; cleanup kit</h1><p>A full run on a fictional ${n(recTotal)}-record org, through the Zoho CRM v8 API</p><span class="flag">Sample data · no client data</span></div></header>
<nav><div class="wrap" role="tablist" aria-label="Sections">
	<button role="tab" id="t-audit" aria-controls="p-audit" aria-selected="true">Audit</button>
	<button role="tab" id="t-dupes" aria-controls="p-dupes" aria-selected="false" tabindex="-1">Duplicates</button>
	<button role="tab" id="t-reports" aria-controls="p-reports" aria-selected="false" tabindex="-1">Reports &amp; pipeline</button>
	<button role="tab" id="t-auto" aria-controls="p-auto" aria-selected="false" tabindex="-1">Workflows</button>
	<button role="tab" id="t-docs" aria-controls="p-docs" aria-selected="false" tabindex="-1">Documentation</button>
	<button role="tab" id="t-run" aria-controls="p-run" aria-selected="false" tabindex="-1">How it runs</button>
</div></nav>
<main>

<section role="tabpanel" id="p-audit" aria-labelledby="t-audit"><div class="wrap">
	<p class="kicker">01 · Audit</p>
	<h2>What three years of everyday use leaves in a Zoho CRM, and what the kit fixed</h2>
	<p class="lede">The kit reads the org through the API (read-only), checks ${M.findings.before.length} things, and writes a plan. Record fixes run through the API with a dry run first; settings changes become a checklist. The org here is invented, with problems planted on purpose so the results can be scored.</p>
	<div class="orgline"><span>Org <b>Brightwater Supply Co. (fictional)</b></span><span>Edition <b>${M.org.edition}</b></span><span>Users <b>${M.org.users}</b> (${M.org.licenses} active)</span><span>Records <b>${Object.entries(M.snapshot.records).map(([k, v]) => `${n(v)} ${k.toLowerCase()}`).join(', ')}</b></span></div>
	<div class="stats">
		<div><b>${n(M.plan.recordsRemovedByAutoMerge)}</b><span>duplicate records merged, 0 wrong merges; ${M.plan.reviewMerges} groups held for a person</span></div>
		<div><b>${M.picklists.valuesBefore} → ${M.reports.sourceAfter.length}</b><span>Lead Source values, so "leads by source" finally adds up</span></div>
		<div><b>${n(M.plan.updatesByReason['Owner: reassign from deactivated users'])}</b><span>records moved off a deactivated user to active reps</span></div>
		<div><b>${n(M.apply.updated)}</b><span>record updates applied, ${M.apply.errors} errors; a second run found 0 left to change</span></div>
		<div><b>${n(creditsUsed)}</b><span>API credits for the whole run: ${pct(creditsUsed / M.org.allowance)} of this org's ${n(M.org.allowance)} a day</span></div>
	</div>
	<div class="scroll"><table class="ledger">
		<thead><tr><th>Severity</th><th class="num">Before</th><th class="num">After</th><th>Finding</th><th>Handled by</th></tr></thead>
		<tbody>${findingsRows}</tbody>
	</table></div>
</div></section>

<section role="tabpanel" id="p-dupes" aria-labelledby="t-dupes" hidden><div class="wrap">
	<p class="kicker">02 · Duplicates</p>
	<h2>Merging duplicates is easy. Not merging the wrong people is the job.</h2>
	<p class="lede">Rules: same personal email; or same phone <i>and</i> names that agree (nicknames, one typo); or same company <i>and</i> names that agree. A shared switchboard number alone never counts, and two different personal emails send a group to a person for review instead of merging. Scored pair by pair against the ${n(L.trueGroups)} duplicate groups planted in the leads.</p>
	<div class="scores">
		${[['Exact text match', 'Same Email or Phone text, no clean-up. What a quick spreadsheet sort finds.', L.exact], ['Any one field', 'Same email, phone or full name, after clean-up. What a one-field duplicate check finds.', L.loose], ['This kit', 'The three rules above, then auto-merge only when no two personal emails disagree.', L.ours]].map(([h, p, s], i) => `<div class="score ${i === 2 ? 'us' : ''}"><h3>${h}</h3><p>${p}</p><div class="pr"><div><b>${pct(s.precision, 0)}</b><span>of matches are real</span><div class="meter"><i style="width:${pct(s.precision)}"></i></div></div><div><b>${pct(s.recall, 0)}</b><span>of real duplicates found</span><div class="meter"><i style="width:${pct(s.recall)}"></i></div></div></div><div class="fp">${n(s.falsePositives)} wrong pairs · ${n(s.missed)} missed</div></div>`).join('')}
	</div>
	<p class="callout"><b>Where it is wrong, and what happens then.</b> The ${L.ours.falsePositives} wrong pairs are namesakes at one company sharing a switchboard: different emails, so all of them went to review and none were merged. Of ${M.plan.mergeGroups} groups, ${M.plan.autoMerges} merged automatically (${M.plan.autoMergeGroupsWrong} wrong) and ${M.plan.reviewMerges} wait for a person (${M.plan.reviewGroupsTrue} real, ${M.plan.reviewGroupsFalse} not). The ${L.ours.missed} missed pairs are people who came back with a new personal email and no phone: nothing in the record links them. Contacts: ${pct(C.ours.precision, 0)} / ${pct(C.ours.recall, 0)}.</p>
	<div class="mgs">
		${ex.map((m) => card(m, 'auto-merged')).join('\n\t\t')}
		${namesake ? card(namesake, 'held for review', 'Two different people with the same name at one company. The rules matched them; the different emails stopped the merge.') : ''}
	</div>
	<div class="split">
		<div><h3>Leads that are already contacts</h3><p class="lede" style="font-size:14px">${n(M.crossModule.found)} leads match an existing contact (${M.crossModule.correct} correct of ${M.crossModule.planted} planted). Zoho merges only inside one module, so these are listed for converting into the existing contact rather than merged.</p></div>
		<div><h3>How merges run</h3><p class="lede" style="font-size:14px">Zoho's Merge Records API takes one master and up to two others per call, so ${M.plan.autoMerges} groups took ${M.apply.mergeCalls} calls. The kept record is the most complete one (oldest on a tie) and pulls in any field it is missing from the others. Merges can't be undone through the API, which is why the review queue exists.</p></div>
	</div>
</div></section>

<section role="tabpanel" id="p-reports" aria-labelledby="t-reports" hidden><div class="wrap">
	<p class="kicker">03 · Reports &amp; pipeline</p>
	<h2>Reports are only as good as the picklists under them</h2>
	<p class="lede">Same leads, same report, before and after the clean-up. ${M.picklists.foundBySpelling} of the ${M.picklists.variantsPlanted} planted variants were caught by spelling alone; the other ${M.picklists.variantsPlanted - M.picklists.foundBySpelling} ("Web Form" vs "Website", "Google Adwords") are decisions, recorded in a mapping file. ${M.picklists.wrongMerges} values were merged into the wrong source.</p>
	<div class="split" style="margin-top:28px">
		<div class="panel"><h3>Leads by source, before</h3><p>${M.picklists.valuesBefore} values. Orange: spelling or naming variants of another value.</p>${hbars(M.reports.sourceBefore, { flag: (k) => truth.sources[k] && truth.sources[k] !== k })}</div>
		<div class="panel"><h3>Leads by source, after</h3><p>${M.reports.sourceAfter.length} values; the totals now land on one bar each.</p>${hbars(M.reports.sourceAfter, { max: M.reports.sourceAfter[0][1] })}</div>
	</div>
	<div class="split">
		<div class="panel"><h3>Deals by stage, before</h3><p>Orange: stages removed from the pipeline years ago. They fall out of every stage report.</p>${hbars(stageRows, { flag: (k) => k.includes('retired') })}</div>
		<div class="panel"><h3>Open deals past their closing date</h3><p>${overdue.length} of ${openDeals.length} open deals, ${usd(overdue.reduce((s, d) => s + d.amount, 0))} still counted in the forecast. Flagged for each owner, not changed: only the rep knows the real date.</p>${hbars(Object.entries(overdueByStage).sort((a, b) => b[1] - a[1]), { fmt: usd })}</div>
	</div>
	<h3 style="margin-top:48px">The dashboard these fixes make possible</h3>
	<p class="lede" style="font-size:14px">Built from the cleaned sample data. Each tile maps to a Zoho report and dashboard component: Won by Lead Source, Deals by Stage, Overdue deals by Owner.</p>
	<div class="kpis">
		<div><b>${usd(M.reports.wonBySourceAfter.reduce((s, x) => s + x[1], 0))}</b><span>won revenue, all sources</span></div>
		<div><b>${esc(M.reports.wonBySourceAfter[0][0])}</b><span>top source by won revenue (${usd(M.reports.wonBySourceAfter[0][1])})</span></div>
		<div><b>${n(openDeals.length)}</b><span>open deals, ${usd(openDeals.reduce((s, d) => s + d.amount, 0))} in pipeline</span></div>
		<div><b>${pct(overdue.length / openDeals.length, 0)}</b><span>of open deals past their closing date</span></div>
	</div>
</div></section>

<section role="tabpanel" id="p-auto" aria-labelledby="t-auto" hidden><div class="wrap">
	<p class="kicker">04 · Workflows</p>
	<h2>Every edition caps workflow e-mails per user, per day</h2>
	<p class="lede">Zoho allows ${n(M.limits.Standard.emailsPerLicense)} workflow e-mails per user licence a day on Standard and ${n(M.limits.Professional.emailsPerLicense)} on Professional. The sample org's ${M.register.rules.length} rules were replayed against 30 days of activity (${n(M.org.licenses)} licences): two rules that mail on every edit, plus one rule copied twice, send most of the volume.</p>
	<div class="panel" style="margin-top:28px">
		<div class="legend"><span><i style="background:var(--s2)"></i>current rules · ${n(email.Standard.current.avg)}/day on average, peak ${n(email.Standard.current.peak)}</span><span><i style="background:var(--s1)"></i>proposed · ${n(email.Standard.proposed.avg)}/day, peak ${n(email.Standard.proposed.peak)}</span><span>○ over the Standard cap</span></div>
		${emailChart()}
		<p class="sm" style="color:var(--ink2);margin:8px 0 0">On Standard the current rules go over the cap on ${email.Standard.current.daysOverCap} of 30 days (${n(email.Standard.current.dropped)} e-mails past it). On Professional they fit, with ${pct(email.Professional.current.peak / email.Professional.current.cap, 0)} of the cap used on the busiest day.</p>
	</div>
	<div class="split">
		<div><h3>Rule inventory and what changes</h3><div class="scroll"><table style="margin-top:10px;font-size:13.5px"><thead><tr><th>Rule</th><th>Module</th><th>On</th><th>Trigger</th><th class="num">E-mails / 30 days</th><th>Change</th></tr></thead><tbody>${rules}</tbody></table></div></div>
		<div><h3>Edition limits that shape the design</h3><div class="scroll"><table style="margin-top:10px;font-size:13.5px"><thead><tr><th></th>${ED.map((e) => `<th class="num">${e}</th>`).join('')}</tr></thead><tbody>
			${limRow('Custom fields per module', 'customFieldsPerModule')}
			${limRow('Page layouts per module', 'layoutsPerModule')}
			${limRow('Active workflow rules per module', 'activeRulesPerModule')}
			${limRow('Workflow e-mails per licence / day', 'emailsPerLicense')}
			${limRow('Pipelines', 'pipelines')}
			${limRow('Validation rules per layout', 'validationRulesPerLayout')}
			${limRow('Unique fields per module', 'uniqueFieldsPerModule')}
			${limRow('Blueprints', 'blueprints')}
			${limRow('API credits / day (6 licences)', 'apiBase', (v, e) => n(Math.min(M.limits[e].apiBase + M.limits[e].apiPerLicense * M.org.licenses, M.limits[e].apiMax)))}
		</tbody></table></div><p class="sm" style="color:var(--ink3)">From Zoho's feature comparison and API limits pages, November 2026.</p></div>
	</div>
</div></section>

<section role="tabpanel" id="p-docs" aria-labelledby="t-docs" hidden><div class="wrap">
	<p class="kicker">05 · Documentation</p>
	<h2>The configuration register writes itself from the API</h2>
	<p class="lede">Generated from the snapshot, so it describes the CRM as it is rather than as someone remembers it: every field with its fill rate, the pipeline, every workflow rule with trigger, criteria and actions, and a log of what changed. Below, the Leads section and the manual checklist from the plan. <a href="files/configuration-register.md">Download the full register (Markdown)</a>.</p>
	<div class="split wide">
		<div class="doc"><h3>Leads</h3><p class="meta">${n(leads.records)} records · ${leads.fields.length} fields, ${leads.fields.filter((f) => f.custom).length} custom · ${M.org.edition} allows ${M.limits.Professional.customFieldsPerModule} custom per module · shaded: custom and under 2% filled</p>
			<div class="scroll"><table style="font-size:13px"><thead><tr><th>Field</th><th>API name</th><th>Type</th><th></th><th class="num">Filled</th></tr></thead><tbody>${regRows}</tbody></table></div></div>
		<div><h3>Settings checklist from the plan</h3><p class="lede" style="font-size:14px">Changes the API should not make on its own: removing picklist options, retiring fields (after export), switching rules off. ${plan.manual.length} steps, each with where to find it.</p><ol class="steps">${manual}</ol></div>
	</div>
</div></section>

<section role="tabpanel" id="p-run" aria-labelledby="t-run" hidden><div class="wrap">
	<p class="kicker">06 · How it runs</p>
	<h2>Read first, change second, and every change is written down</h2>
	<p class="lede">Node 22, no dependencies. Connects with a Zoho Self Client (OAuth refresh token) on any data centre. This transcript is the real output of the commands against the bundled mock API.</p>
	<pre class="term">${esc(transcript).replace(/^(\$ .*)$/gm, '<span class="cmd">$1</span>')}</pre>
	<div class="grid3">
		<div><h3>Read-only by default</h3><ul><li>Snapshot and audit need only READ scopes: users, fields, layouts, pipeline, workflow rules, modules</li><li>Paging switches to page_token past 2,000 records; field lists are split at 50</li><li>${M.snapshot.calls} calls / ${M.snapshot.credits} credits to read all ${n(recTotal)} records and settings</li></ul></div>
		<div><h3>Changes are reversible where Zoho allows</h3><ul><li>Dry run lists every request and its credit cost before anything changes</li><li>Every update stores its before-value; <code>zcrm rollback journal.json</code> puts them back</li><li>Merges can't be reversed via the API, so groups with conflicting emails wait for approval</li></ul></div>
		<div><h3>Checked</h3><ul><li>${M.tests.join(', ')}: matching rules, picklist grouping, credit maths, paging past 2,000, API limits, apply, rollback</li><li>Credit estimate ${n(M.apply.estimate)} = credits the API charged ${n(M.apply.serverCredits)}</li><li>Second run after apply: ${M.secondRun.recordUpdates} record changes left</li></ul></div>
	</div>
	<div class="disclose">
		<div><h3>Measured</h3><ul><li>Everything on this site comes from one run of the kit against a mock of the Zoho CRM v8 API that follows the documented endpoints, response shapes, paging rules, merge and update limits and credit costs.</li><li>Duplicate and picklist scores are counted against the problems planted in the sample org.</li><li>E-mail counts replay 30 days of sample activity through the rules' real triggers and criteria.</li></ul></div>
		<div><h3>Not measured</h3><ul><li>Your org. The sample was written by the same person as the matching rules, so the scores show the rules work on these patterns, not a promise for your data; that is why every merge group is listed for approval first.</li><li>Live Zoho response times; real API latency will make runs slower than the mock's ${(M.apply.ms / 1000).toFixed(0)} s.</li><li>The activity log behind the e-mail chart is generated, so the shape is realistic but the exact volumes are modelled.</li></ul></div>
	</div>
</div></section>
</main>
<div class="tip" id="tip"></div>
<script>
(function () {
	var tabs = [].slice.call(document.querySelectorAll('[role=tab]'));
	function sel(t, focus) { tabs.forEach(function (x) { var on = x === t; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; document.getElementById(x.getAttribute('aria-controls')).hidden = !on; }); if (focus) t.focus(); try { history.replaceState(null, '', '#' + t.id.slice(2)); } catch (e) {} }
	tabs.forEach(function (t, i) { t.addEventListener('click', function () { sel(t); }); t.addEventListener('keydown', function (e) { var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (d) { e.preventDefault(); sel(tabs[(i + d + tabs.length) % tabs.length], true); } }); });
	function fromHash() { var t = document.getElementById('t-' + location.hash.slice(1)); if (t) sel(t); }
	addEventListener('hashchange', fromHash); fromHash();
	var tip = document.getElementById('tip');
	function show(x, y, html) { tip.innerHTML = html; tip.style.display = 'block'; var w = tip.offsetWidth; tip.style.left = Math.min(innerWidth - w - 8, x + 14) + 'px'; tip.style.top = (y - 36) + 'px'; }
	document.addEventListener('mousemove', function (e) {
		var b = e.target.closest && e.target.closest('.bar');
		if (b) return show(e.clientX, e.clientY, b.getAttribute('data-tip'));
		var s = e.target.closest && e.target.closest('svg.line');
		if (s) {
			var r = s.getBoundingClientRect(), W = +s.dataset.w, l = +s.dataset.l, rr = +s.dataset.r, days = JSON.parse(s.dataset.days);
			var vx = (e.clientX - r.left) / r.width * W, i = Math.round((vx - l) / (W - l - rr) * (days.length - 1));
			if (i >= 0 && i < days.length) { var xh = s.querySelector('.xh'), px = l + i / (days.length - 1) * (W - l - rr); xh.setAttribute('x1', px); xh.setAttribute('x2', px); xh.style.display = ''; return show(e.clientX, e.clientY, days[i][0] + ' · current ' + days[i][1] + ' · proposed ' + days[i][2]); }
		}
		tip.style.display = 'none'; var h = document.querySelector('.xh'); if (h) h.style.display = 'none';
	});
})();
</script>
</body></html>`;
writeFileSync(ROOT + 'site/index.html', html);
writeFileSync(ROOT + 'site/robots.txt', 'User-agent: *\nDisallow: /\n');
console.log('site/index.html', Math.round(html.length / 1024) + ' KB');
