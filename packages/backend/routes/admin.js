const express = require('express');
const { ROLES } = require('../lib/database');
const { PERMISSIONS } = require('../lib/rbac');

function createAdminRouter({ dbApi, auditLogger }) {
  const router = express.Router();

  // Access guard: owners always; others require admin:access dynamic permission
  router.use(async (req, res, next) => {
    try {
      const user = req.auth?.user;
      if (!user) return res.status(401).json({ error: 'Unauthenticated' });
      if (user.role === ROLES.OWNER) return next();
      const allowed = await dbApi.hasRolePermission({ organizationId: null, role: user.role, permission: 'admin:access' });
      if (!allowed) return res.status(403).json({ error: 'Forbidden' });
      next();
    } catch (err) {
      next(err);
    }
  });

  // Users CRUD within org scope
  router.get('/users', async (req, res, next) => {
    try {
      const actor = req.auth?.user;
      let users;
      const canViewAll = actor?.role === ROLES.OWNER
        || (await dbApi.hasRolePermission({ organizationId: null, role: actor?.role, permission: 'users:view-all' }));
      if (canViewAll) {
        users = await dbApi.listAllUsers();
      } else {
        const orgIds = req.auth?.orgScope || [];
        users = await dbApi.listUsersForOrganizations(orgIds);
      }
      const sanitized = (users || []).map((u) => ({
        ...u,
        isActive: typeof u.isActive === 'boolean' ? u.isActive : u.isActive === 1
      }));
      res.json({ users: sanitized });
    } catch (err) {
      next(err);
    }
  });

  router.post('/users', async (req, res, next) => {
    try {
      const payload = req.body || {};
      const orgScope = new Set(req.auth?.orgScope || []);
      const organizationId = payload.organizationId || req.auth?.user?.organization_id;
      if (!organizationId || !orgScope.has(organizationId)) {
        return res.status(403).json({ error: 'Organization not in scope' });
      }
      const required = ['email', 'password', 'name', 'role'];
      for (const k of required) {
        if (!payload[k] || typeof payload[k] !== 'string') {
          return res.status(400).json({ error: `Missing or invalid ${k}` });
        }
      }
      // Validate role: allow system roles or any role present in roles catalog
      const requestedRole = String(payload.role || '').trim().toLowerCase();
      if (![ROLES.OWNER, ROLES.ADMIN, ROLES.VIEWER].includes(requestedRole)) {
        const roleExists = await dbApi.getRoleByName(requestedRole);
        if (!roleExists) {
          return res.status(400).json({ error: 'Invalid role' });
        }
      }
      const created = await dbApi.upsertUser({
        organizationId,
        email: payload.email,
        password: payload.password,
        name: payload.name,
        role: requestedRole,
        isActive: payload.isActive !== false
      });
      await auditLogger({
        action: 'user.created',
        entity: 'user',
        entityId: created.id,
        actorId: req.auth?.user?.id,
        organizationId,
        after: { id: created.id, email: created.email, role: created.role, is_active: created.is_active }
      });
      res.status(201).json({ user: sanitizeUser(created) });
    } catch (err) {
      next(err);
    }
  });

  router.put('/users/:id', async (req, res, next) => {
    try {
      const { id } = req.params;
      const existing = await dbApi.getUserById(id);
      if (!existing) return res.status(404).json({ error: 'User not found' });
      const orgScope = new Set(req.auth?.orgScope || []);
      if (!orgScope.has(existing.organization_id)) {
        return res.status(403).json({ error: 'Organization not in scope' });
      }
      const updates = sanitizeUserUpdate(req.body || {});
      // Validate role change if provided
      if (typeof updates.role === 'string') {
        const requestedRole = String(updates.role || '').trim().toLowerCase();
        if (![ROLES.OWNER, ROLES.ADMIN, ROLES.VIEWER].includes(requestedRole)) {
          const roleExists = await dbApi.getRoleByName(requestedRole);
          if (!roleExists) {
            return res.status(400).json({ error: 'Invalid role' });
          }
        }
        updates.role = requestedRole;
      }
      const updated = await dbApi.upsertUser({ id, ...existing, ...updates });
      await auditLogger({
        action: 'user.updated',
        entity: 'user',
        entityId: id,
        actorId: req.auth?.user?.id,
        organizationId: updated.organization_id,
        before: maskUser(existing),
        after: maskUser(updated)
      });
      res.json({ user: sanitizeUser(updated) });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/users/:id', async (req, res, next) => {
    try {
      const { id } = req.params;
      const existing = await dbApi.getUserById(id);
      if (!existing) return res.status(404).json({ error: 'User not found' });
      const orgScope = new Set(req.auth?.orgScope || []);
      if (!orgScope.has(existing.organization_id)) {
        return res.status(403).json({ error: 'Organization not in scope' });
      }
      await dbApi.deleteUser(id);
      await auditLogger({
        action: 'user.deleted',
        entity: 'user',
        entityId: id,
        actorId: req.auth?.user?.id,
        organizationId: existing.organization_id,
        before: maskUser(existing)
      });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  // Admin access toggle (owner only)
  router.get('/permissions/admin-access', async (req, res, next) => {
    try {
      const user = req.auth?.user;
      const enabled = await dbApi.hasRolePermission({ organizationId: null, role: ROLES.ADMIN, permission: 'admin:access' });
      res.json({ enabled, role: ROLES.ADMIN, permission: 'admin:access', scope: 'global' });
    } catch (err) {
      next(err);
    }
  });

  router.put('/permissions/admin-access', async (req, res, next) => {
    try {
      const actor = req.auth?.user;
      if (actor.role !== ROLES.OWNER) return res.status(403).json({ error: 'Owner required' });
      const enabled = Boolean(req.body?.enabled);
      await dbApi.setRolePermission({ organizationId: null, role: ROLES.ADMIN, permission: 'admin:access', enabled });
      await auditLogger({
        action: 'permission.updated',
        entity: 'role_permission',
        entityId: `${ROLES.ADMIN}:admin:access`,
        actorId: actor.id,
        organizationId: actor.organization_id,
        after: { role: ROLES.ADMIN, permission: 'admin:access', enabled }
      });
      res.json({ enabled });
    } catch (err) {
      next(err);
    }
  });

  // Roles catalog CRUD (owner required for create/update/delete)
  router.get('/roles', async (req, res, next) => {
    try {
      const actor = req.auth?.user;
      const canViewRoles = actor?.role === ROLES.OWNER || (await dbApi.hasRolePermission({ organizationId: null, role: actor?.role, permission: 'roles:view' }));
      if (!canViewRoles) return res.status(403).json({ error: 'Forbidden' });
      const roles = await dbApi.listRoles();
      res.json({ roles });
    } catch (err) {
      next(err);
    }
  });

  router.post('/roles', async (req, res, next) => {
    try {
      const actor = req.auth?.user;
      const canCreate = actor?.role === ROLES.OWNER || (await dbApi.hasRolePermission({ organizationId: null, role: actor?.role, permission: 'roles:create' }));
      if (!canCreate) return res.status(403).json({ error: 'Forbidden' });
      const { name, description } = req.body || {};
      if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Invalid role name' });
      const created = await dbApi.createRole({ name, description });
      await auditLogger({
        action: 'role.created',
        entity: 'role',
        entityId: created.id,
        actorId: actor.id,
        organizationId: actor.organization_id,
        after: created
      });
      res.status(201).json({ role: created });
    } catch (err) {
      if (String(err.message || '').toLowerCase().includes('unique')) {
        return res.status(409).json({ error: 'Role already exists' });
      }
      next(err);
    }
  });

  router.put('/roles/:name', async (req, res, next) => {
    try {
      const actor = req.auth?.user;
      const canUpdate = actor?.role === ROLES.OWNER || (await dbApi.hasRolePermission({ organizationId: null, role: actor?.role, permission: 'roles:update' }));
      if (!canUpdate) return res.status(403).json({ error: 'Forbidden' });
      const { name, description } = req.body || {};
      const updated = await dbApi.updateRole(req.params.name, { name, description });
      await auditLogger({
        action: 'role.updated',
        entity: 'role',
        entityId: updated.id,
        actorId: actor.id,
        organizationId: actor.organization_id,
        after: updated
      });
      res.json({ role: updated });
    } catch (err) {
      if (err.message === 'Role not found') return res.status(404).json({ error: 'Role not found' });
      if (err.message === 'Cannot modify system role') return res.status(400).json({ error: 'Cannot modify system role' });
      if (String(err.message || '').toLowerCase().includes('unique')) {
        return res.status(409).json({ error: 'Role name already exists' });
      }
      next(err);
    }
  });

  router.delete('/roles/:name', async (req, res, next) => {
    try {
      const actor = req.auth?.user;
      const canDelete = actor?.role === ROLES.OWNER || (await dbApi.hasRolePermission({ organizationId: null, role: actor?.role, permission: 'roles:delete' }));
      if (!canDelete) return res.status(403).json({ error: 'Forbidden' });
      await dbApi.deleteRole(req.params.name);
      await auditLogger({
        action: 'role.deleted',
        entity: 'role',
        entityId: req.params.name,
        actorId: actor.id,
        organizationId: actor.organization_id
      });
      res.status(204).send();
    } catch (err) {
      if (err.message === 'Role not found') return res.status(404).json({ error: 'Role not found' });
      if (err.message === 'Cannot delete system role') return res.status(400).json({ error: 'Cannot delete system role' });
      if (err.code === 'ROLE_IN_USE') return res.status(409).json({ error: 'Role in use by users' });
      next(err);
    }
  });

  // Role permissions (owner required for mutations)
  router.get('/roles/:name/permissions', async (req, res, next) => {
    try {
      const actor = req.auth?.user;
      const canViewRoles = actor?.role === ROLES.OWNER || (await dbApi.hasRolePermission({ organizationId: null, role: actor?.role, permission: 'roles:view' }));
      if (!canViewRoles) return res.status(403).json({ error: 'Forbidden' });
      const roleName = String(req.params.name || '').trim().toLowerCase();
      const role = await dbApi.getRoleByName(roleName);
      if (!role) return res.status(404).json({ error: 'Role not found' });
      const catalog = Array.from(new Set(['admin:access', ...Object.keys(PERMISSIONS || {})]));
      const all = await dbApi.listRolePermissions({ organizationId: null });
      const current = (all || []).filter((r) => (r.role || '').toLowerCase() === roleName && r.organizationId == null);
      const permissions = catalog.map((key) => {
        const found = current.find((r) => r.permission === key);
        let enabled;
        if (roleName === ROLES.OWNER) {
          enabled = true;
        } else if (roleName === ROLES.ADMIN) {
          enabled = found ? Boolean(found.enabled) : true; // default to enabled when unspecified
        } else {
          enabled = found ? Boolean(found.enabled) : false; // default disabled for other roles
        }
        return { permission: key, enabled };
      });
      res.json({ role: role.name, permissions, catalog, scope: 'global' });
    } catch (err) {
      next(err);
    }
  });

  router.put('/roles/:name/permissions/:permission', async (req, res, next) => {
    try {
      const actor = req.auth?.user;
      if (actor.role !== ROLES.OWNER) return res.status(403).json({ error: 'Owner required' });
      const roleName = String(req.params.name || '').trim().toLowerCase();
      const role = await dbApi.getRoleByName(roleName);
      if (!role) return res.status(404).json({ error: 'Role not found' });
      if (role.name === ROLES.OWNER) return res.status(400).json({ error: 'Cannot modify owner permissions' });
      const permission = String(req.params.permission || '').trim();
      const enabled = Boolean(req.body?.enabled);
      await dbApi.setRolePermission({ organizationId: null, role: role.name, permission, enabled });
      await auditLogger({
        action: 'permission.updated',
        entity: 'role_permission',
        entityId: `${role.name}:${permission}`,
        actorId: actor.id,
        organizationId: actor.organization_id,
        after: { role: role.name, permission, enabled }
      });
      res.json({ role: role.name, permission, enabled });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function sanitizeUser(u) {
  return {
    id: u.id,
    organizationId: u.organization_id,
    email: u.email,
    name: u.name,
    role: u.role,
    isActive: u.is_active === 1
  };
}

function sanitizeUserUpdate(body) {
  const out = {};
  if (typeof body.email === 'string') out.email = body.email.toLowerCase();
  if (typeof body.name === 'string') out.name = body.name;
  if (typeof body.role === 'string') out.role = body.role;
  if (typeof body.password === 'string' && body.password.trim()) out.password = body.password;
  if (typeof body.isActive === 'boolean') out.isActive = body.isActive;
  if (typeof body.organizationId === 'string') out.organizationId = body.organizationId;
  return out;
}

function maskUser(u) {
  const { password_hash, ...rest } = u || {};
  return rest;
}

module.exports = { createAdminRouter };
