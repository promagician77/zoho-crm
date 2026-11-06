// Applies a plan: merges (master + up to 2 children per call), then record updates in batches of 100.
// Dry run by default. Every update writes its before-values to a journal so it can be rolled back; merges
// cannot be undone through the API, which is why only groups marked "auto" (or approved) are merged.
export async function applyPlan(zoho, plan, { dryRun = true, approve = 'auto', log = () => {} } = {}) {
	const journal = { startedAt: new Date().toISOString(), merges: [], updates: [], errors: [] };
	const ok = (m) => approve === 'all' || m.status === 'auto' || (Array.isArray(approve) && approve.includes(m.master));
	const merges = plan.merges.filter(ok);
	const requests = [];
	for (const m of merges) for (let i = 0; i < m.children.length; i += 2) {
		const kids = m.children.slice(i, i + 2);
		requests.push({ method: 'POST', path: `${m.module}/${m.master}/actions/merge`, body: { merge: [{ data: kids.map((c) => ({ id: c.id, _fields: c.fields.map((f) => ({ api_name: f })) })) }] }, m });
	}
	const removed = new Set(merges.flatMap((m) => m.children.map((c) => c.id)));
	for (const u of plan.updates) {
		const recs = u.records.filter((r) => !removed.has(r.id) || false);
		for (let i = 0; i < recs.length; i += 100) {
			const batch = recs.slice(i, i + 100);
			requests.push({ method: 'PUT', path: u.module, body: { data: batch.map(({ _before, _to, ...r }) => r) }, u, batch });
		}
	}
	if (dryRun) return { dryRun: true, requests: requests.map(({ method, path, body }) => ({ method, path, records: body.data?.length || body.merge[0].data.length })), journal };

	// merges one group at a time (a group's second call needs the first to finish)
	for (const rq of requests.filter((r) => r.m)) {
		try { await zoho.request(rq.method, rq.path, { body: rq.body }); journal.merges.push({ module: rq.m.module, master: rq.m.master, children: rq.body.merge[0].data.map((d) => d.id) }); }
		catch (e) { journal.errors.push({ path: rq.path, error: e.message }); }
	}
	log(`merged ${journal.merges.length} calls`);
	// updates in parallel up to the client's concurrency
	await Promise.all(requests.filter((r) => r.u).map(async (rq) => {
		try {
			const j = await zoho.request('PUT', rq.path, { body: rq.body });
			j.data.forEach((res, i) => {
				const rec = rq.batch[i];
				if (res.status === 'success') journal.updates.push({ module: rq.u.module, id: rec.id, reason: rq.u.reason, before: rec._before, after: Object.fromEntries(Object.entries(rec).filter(([k]) => !k.startsWith('_') && k !== 'id')) });
				else journal.errors.push({ module: rq.u.module, id: rec.id, error: `${res.code} ${res.message}` });
			});
		} catch (e) { journal.errors.push({ path: rq.path, error: e.message }); }
	}));
	journal.finishedAt = new Date().toISOString();
	return { dryRun: false, journal };
}

// puts back the before-values of every update in a journal (merges are not reversible)
export async function rollback(zoho, journal) {
	const byMod = {};
	for (const u of [...journal.updates].reverse()) { // one row per record; the earliest before-value wins
		const m = (byMod[u.module] = byMod[u.module] || new Map());
		const rec = m.get(u.id) || { id: u.id };
		for (const [k, v] of Object.entries(u.before)) rec[k] = k === 'Owner' ? { id: v.id } : v;
		m.set(u.id, rec);
	}
	// Owner changes are restored in their own calls: if the API refuses to hand a record back to a deactivated
	// user, those come back as listed failures while every other field is still restored.
	let restored = 0; const failed = [];
	const send = async (mod, recs) => { for (let i = 0; i < recs.length; i += 100) { const batch = recs.slice(i, i + 100); const j = await zoho.request('PUT', mod, { body: { data: batch } }); j.data.forEach((r, k) => (r.status === 'success' ? restored++ : failed.push({ module: mod, id: batch[k].id, error: `${r.code} ${r.message}` }))); } };
	for (const [mod, map] of Object.entries(byMod)) {
		const recs = [...map.values()];
		await send(mod, recs.map(({ Owner, ...r }) => r).filter((r) => Object.keys(r).length > 1));
		await send(mod, recs.filter((r) => r.Owner).map((r) => ({ id: r.id, Owner: r.Owner })));
	}
	return { restored, failed };
}
