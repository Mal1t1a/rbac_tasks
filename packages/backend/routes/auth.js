const express = require('express');
const { signToken, comparePasswords } = require('../lib/auth');
const { resolveOrgScopeForUser } = require('../lib/rbac');

function createAuthRouter({ env, dbApi, auditLogger })
{
	const router = express.Router();

	router.post('/login', async (req, res, next) =>
	{
		try
		{
			const { email, password } = req.body || {};
			if (!email || !password)
			{
				res.status(400).json({ error: 'Email and password are required' });
				return;
			}
			const user = await dbApi.getUserByEmail(email);
			if (!user)
			{
				await auditFailedLogin(dbApi, auditLogger, email);
				res.status(401).json({ error: 'Invalid credentials' });
				return;
			}
			if (user.is_active === 0)
			{
				res.status(403).json({ error: 'User is inactive' });
				return;
			}
			const valid = await comparePasswords(password, user.password_hash);
			if (!valid)
			{
				await auditFailedLogin(dbApi, auditLogger, email);
				res.status(401).json({ error: 'Invalid credentials' });
				return;
			}

			const token = signToken(user, env);
			const organization = await dbApi.getOrganizationById(user.organization_id);
			const organizations = await dbApi.listOrganizations();
			const scope = Array.from(resolveOrgScopeForUser(user, organizations));

			// Mark first login if applicable and get state
			const welcomeVersion = Number(process.env.WELCOME_VERSION || 1);
			const welcomeState = await dbApi.markFirstLoginIfNeeded(user.id, welcomeVersion).catch(async (err) =>
			{
				console.warn('first-login mark failed', err?.message || err);
				return dbApi.getWelcomeState(user.id);
			});

			await auditLogger({
				action: 'auth.login',
				entity: 'user',
				entityId: user.id,
				actorId: user.id,
				organizationId: user.organization_id,
				metadata: { email: user.email, scope }
			});

			if (welcomeState?.firstLogin)
			{
				await auditLogger({
					action: 'first_login_detected',
					entity: 'user',
					entityId: user.id,
					actorId: user.id,
					organizationId: user.organization_id,
					metadata: { version: welcomeState.welcomeVersion, at: welcomeState.firstLoginAt }
				}).catch(() => null);
			}

			// Set current session
			const decoded = require('jsonwebtoken').decode(token);
			await dbApi.setCurrentSession(user.id, decoded.exp);

			res.json({
				token,
				user: sanitizeUser(user, organization),
				scope,
				firstLogin: welcomeState ? Boolean(welcomeState.firstLogin && !welcomeState.hasSeenWelcome) : false,
				firstLoginAt: welcomeState?.firstLoginAt || null,
				welcomeVersion: welcomeState?.welcomeVersion || welcomeVersion
			});
		} catch (error)
		{
			next(error);
		}
	});

	return router;
}

async function auditFailedLogin(dbApi, auditLogger, email)
{
	const user = await dbApi.getUserByEmail(email).catch(() => null);
	await auditLogger({
		action: 'auth.login_failed',
		entity: 'user',
		entityId: user?.id || email,
		actorId: user?.id || null,
		organizationId: user?.organization_id || null,
		metadata: { email }
	}).catch(() => null);
}

function sanitizeUser(user, organization)
{
	if (!user)
	{
		return null;
	}
	return {
		id: user.id,
		email: user.email,
		name: user.name,
		role: user.role,
		organizationId: user.organization_id,
		organizationName: organization?.name ?? null
	};
}

module.exports = {
	createAuthRouter
};
