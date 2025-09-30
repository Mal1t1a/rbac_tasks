function createAuditLogger(dbApi)
{
	return async function logAudit(event)
	{
		if (!event || !event.action || !event.entity || !event.entityId)
		{
			throw new Error('Invalid audit event payload');
		}
		const entry = {
			organizationId: event.organizationId ?? null,
			actorId: event.actorId ?? null,
			action: event.action,
			entity: event.entity,
			entityId: String(event.entityId),
			before: event.before ?? null,
			after: event.after ?? null,
			metadata: event.metadata ?? null
		};
		const record = await dbApi.createAuditEvent(entry);
		const summaryPieces = [
			`[AUDIT] ${entry.action}`,
			`entity=${entry.entity}`,
			`entityId=${entry.entityId}`
		];
		if (entry.actorId)
		{
			summaryPieces.push(`actor=${entry.actorId}`);
		}
		if (entry.organizationId)
		{
			summaryPieces.push(`org=${entry.organizationId}`);
		}
		console.info(summaryPieces.join(' '));
		return record;
	};
}

module.exports = {
	createAuditLogger
};
