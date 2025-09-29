const express = require('express');
const { createPermissionGuard } = require('../lib/auth');

function createAuditRouter({ dbApi }) {
  const router = express.Router();
  const guard = createPermissionGuard('audit:view');

  router.get('/', guard, async (req, res, next) => {
    try {
      const scope = req.auth?.orgScope || [];
      const limit = Math.max(1, Math.min(Number.parseInt(req.query?.limit, 10) || 100, 500));
      const events = await dbApi.listAuditEvents(scope, limit);
      res.json({ events: events.map(sanitizeAuditEvent) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function sanitizeAuditEvent(event) {
  return {
    id: event.id,
    organizationId: event.organization_id,
    actorId: event.actor_id,
    actorName: event.actorName || null,
    action: event.action,
    entity: event.entity,
    entityId: event.entity_id,
    before: event.before ?? null,
    after: event.after ?? null,
    metadata: event.metadata ?? null,
    createdAt: event.created_at
  };
}

module.exports = {
  createAuditRouter
};
