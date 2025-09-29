const express = require('express');

function createSessionRouter({ auditLogger, dbApi }) {
  const router = express.Router();

  router.post('/logout', async (req, res, next) => {
    try {
      const user = req.auth?.user;
      if (!user) {
        res.status(401).json({ error: 'Unauthenticated' });
        return;
      }
      await auditLogger({
        action: 'auth.logout',
        entity: 'user',
        entityId: user.id,
        actorId: user.id,
        organizationId: user.organization_id
      }).catch(() => null);
      // Clear current session
      await dbApi.setCurrentSession(null, 0);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createSessionRouter };
