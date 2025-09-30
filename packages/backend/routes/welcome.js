const express = require('express');

function createWelcomeRouter({ dbApi, auditLogger })
{
	const router = express.Router();

	router.post('/complete', async (req, res, next) =>
	{
		try
		{
			const user = req.auth?.user;
			if (!user)
			{
				res.status(401).json({ error: 'Unauthenticated' });
				return;
			}
			const state = await dbApi.completeWelcome(user.id);
			await auditLogger({
				action: 'welcome_completed',
				entity: 'user',
				entityId: user.id,
				actorId: user.id,
				organizationId: user.organization_id,
				metadata: { version: state.welcomeVersion, firstLoginAt: state.firstLoginAt }
			}).catch(() => null);
			res.json({ ok: true, ...state });
		} catch (error)
		{
			next(error);
		}
	});

	return router;
}

module.exports = { createWelcomeRouter };
