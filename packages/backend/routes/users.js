const express = require('express');
const { getInheritedRoles } = require('../lib/rbac');

function createUserRouter()
{
	const router = express.Router();

	router.get('/me', (req, res) =>
	{
		const user = req.auth?.user;
		if (!user)
		{
			res.status(401).json({ error: 'Unauthenticated' });
			return;
		}
		const organization = req.auth?.organizations?.find((org) => org.id === user.organization_id) || null;
		res.json({
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
				role: user.role,
				organizationId: user.organization_id,
				organizationName: organization?.name || null,
				inheritedRoles: getInheritedRoles(user.role)
			},
			scope: req.auth?.orgScope || []
		});
	});

	router.get('/organizations', (req, res) =>
	{
		const scope = new Set(req.auth?.orgScope || []);
		const organizations = (req.auth?.organizations || []).filter((org) => scope.has(org.id));
		res.json({ organizations });
	});

	return router;
}

module.exports = {
	createUserRouter
};
