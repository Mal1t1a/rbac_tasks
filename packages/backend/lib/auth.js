const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { roleAllows, resolveOrgScopeForUser } = require('./rbac');

const DEFAULT_JWT_EXPIRES_IN = '2h';

function ensureSecret(env)
{
	const secret = env.JWT_SECRET || env.APP_JWT_SECRET;
	if (!secret)
	{
		throw new Error('JWT_SECRET is not configured');
	}
	return secret;
}

function signToken(user, env, options = {})
{
	const secret = ensureSecret(env);
	const payload = {
		sub: user.id,
		role: user.role,
		orgId: user.organization_id,
		name: user.name
	};
	const expiresIn = options.expiresIn || env.JWT_EXPIRES_IN || DEFAULT_JWT_EXPIRES_IN;
	return jwt.sign(payload, secret, { expiresIn });
}

function verifyToken(token, env)
{
	const secret = ensureSecret(env);
	return jwt.verify(token, secret);
}

function comparePasswords(plain, hash)
{
	return bcrypt.compare(plain, hash);
}

function createAuthMiddleware({ env, dbApi })
{
	const secret = ensureSecret(env);
	return async function authenticate(req, res, next)
	{
		try
		{
			const header = req.headers['authorization'] || req.headers['Authorization'];
			if (!header || !header.startsWith('Bearer '))
			{
				res.status(401).json({ error: 'Missing bearer token' });
				return;
			}
			const token = header.slice('Bearer '.length).trim();
			if (!token)
			{
				res.status(401).json({ error: 'Invalid authorization header' });
				return;
			}
			let payload;
			try
			{
				payload = jwt.verify(token, secret);
			} catch (error)
			{
				res.status(401).json({ error: 'Invalid or expired token' });
				return;
			}
			const user = await dbApi.getUserById(payload.sub);
			if (!user || user.is_active === 0)
			{
				res.status(401).json({ error: 'User is inactive or does not exist' });
				return;
			}
			const organizations = await dbApi.listOrganizations();
			const orgScope = Array.from(resolveOrgScopeForUser(user, organizations));
			req.auth = {
				token,
				payload,
				user,
				organizations,
				orgScope
			};
			next();
		} catch (error)
		{
			next(error);
		}
	};
}

function createPermissionGuard(permission)
{
	return function permissionGuard(req, res, next)
	{
		const user = req.auth?.user;
		if (!user)
		{
			res.status(401).json({ error: 'Unauthenticated' });
			return;
		}
		if (!roleAllows(user.role, permission))
		{
			res.status(403).json({ error: 'Forbidden', permission });
			return;
		}
		next();
	};
}

module.exports = {
	signToken,
	verifyToken,
	comparePasswords,
	createAuthMiddleware,
	createPermissionGuard
};
