const express = require('express');
const { createPermissionGuard } = require('../lib/auth');
const { ROLES } = require('../lib/database');

function createCategoryRouter({ dbApi, auditLogger }) {
  const router = express.Router();

  // List categories for organizations in scope
  router.get('/', async (req, res, next) => {
    try {
      const orgScope = req.auth?.orgScope || [];
      const user = req.auth?.user;
      let items;
      if (user?.role === ROLES.OWNER) {
        // Owner sees all categories in scope
        items = await dbApi.listCategoriesForOrganizations(orgScope);
      } else {
        // Admin and other roles must have explicit access (system categories remain visible by default)
        items = await dbApi.listAccessibleCategoriesForRole(orgScope, user.role);
      }
      res.json({ categories: items });
    } catch (error) {
      next(error);
    }
  });

  // Create category (requires categories:manage)
  router.post('/', createPermissionGuard('categories:create'), async (req, res, next) => {
    try {
      const user = req.auth?.user;
      const orgScope = new Set(req.auth?.orgScope || []);
      const name = String(req.body?.name || '').trim();
      const organizationId = req.body?.organizationId || user?.organization_id;
      if (!organizationId || !orgScope.has(organizationId)) {
        return res.status(403).json({ error: 'Organization not in scope' });
      }
      if (!name) return res.status(400).json({ error: 'Category name is required' });
      const created = await dbApi.createCategory({ organizationId, name });
      await auditLogger({
        action: 'category.created',
        entity: 'category',
        entityId: created.id,
        actorId: user?.id,
        organizationId,
        after: created
      });
      res.status(201).json({ category: created });
    } catch (error) {
      if (String(error.message || '').toLowerCase().includes('unique')) {
        return res.status(409).json({ error: 'Category name already exists' });
      }
      next(error);
    }
  });

  // Update category (requires categories:manage)
  router.put('/:id', createPermissionGuard('categories:update'), async (req, res, next) => {
    try {
      const user = req.auth?.user;
      const orgScope = new Set(req.auth?.orgScope || []);
      const { id } = req.params;
      const existing = await dbApi.getCategoryById(id);
      if (!existing) return res.status(404).json({ error: 'Category not found' });
      if (!orgScope.has(existing.organizationId)) {
        return res.status(403).json({ error: 'Category outside allowed scope' });
      }
      const updates = {};
      if (typeof req.body?.name === 'string') updates.name = String(req.body.name).trim();
      if (typeof req.body?.organizationId === 'string') {
        if (!orgScope.has(req.body.organizationId)) {
          return res.status(403).json({ error: 'Target organization outside allowed scope' });
        }
        updates.organizationId = req.body.organizationId;
      }
      const updated = await dbApi.updateCategory(id, updates);
      await auditLogger({
        action: 'category.updated',
        entity: 'category',
        entityId: id,
        actorId: user?.id,
        organizationId: updated.organizationId,
        before: existing,
        after: updated
      });
      res.json({ category: updated });
    } catch (error) {
      if (String(error.message || '').toLowerCase().includes('unique')) {
        return res.status(409).json({ error: 'Category name already exists' });
      }
      next(error);
    }
  });

  // Delete category (requires categories:manage)
  router.delete('/:id', createPermissionGuard('categories:delete'), async (req, res, next) => {
    try {
      const user = req.auth?.user;
      const orgScope = new Set(req.auth?.orgScope || []);
      const { id } = req.params;
      const existing = await dbApi.getCategoryById(id);
      if (!existing) return res.status(404).json({ error: 'Category not found' });
      if (!orgScope.has(existing.organizationId)) {
        return res.status(403).json({ error: 'Category outside allowed scope' });
      }
      if (existing.isSystem) {
        return res.status(400).json({ error: 'System category cannot be deleted' });
      }
      await dbApi.deleteCategory(id);
      await auditLogger({
        action: 'category.deleted',
        entity: 'category',
        entityId: id,
        actorId: user?.id,
        organizationId: existing.organizationId,
        before: existing
      });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // Get role access list for a category
  router.get('/:id/access', createPermissionGuard('categories:view'), async (req, res, next) => {
    try {
      const { id } = req.params;
      const existing = await dbApi.getCategoryById(id);
      if (!existing) return res.status(404).json({ error: 'Category not found' });
      const roles = await dbApi.listCategoryRoleAccess(id);
      res.json({ roles });
    } catch (error) {
      next(error);
    }
  });

  // Update role access list (owner only)
  router.put('/:id/access', createPermissionGuard('categories:access:configure'), async (req, res, next) => {
    try {
      const user = req.auth?.user;
      if (user.role !== ROLES.OWNER) {
        return res.status(403).json({ error: 'Only owner can modify access' });
      }
      const { id } = req.params;
      const existing = await dbApi.getCategoryById(id);
      if (!existing) return res.status(404).json({ error: 'Category not found' });
      const roles = Array.isArray(req.body?.roles) ? req.body.roles : [];
      const updated = await dbApi.setCategoryRoleAccess(id, roles);
      res.json({ roles: updated });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createCategoryRouter };
