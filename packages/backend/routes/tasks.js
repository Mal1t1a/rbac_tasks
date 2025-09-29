const express = require('express');
const { roleAllows } = require('../lib/rbac');

function createTaskRouter({ dbApi, auditLogger }) {
  const router = express.Router();

  // Dynamic permission guard that supports both static catalog and DB overrides (for custom roles)
  const guard = (permission) => async (req, res, next) => {
    try {
      const user = req.auth?.user;
      if (!user) return res.status(401).json({ error: 'Unauthenticated' });
      if (user.role === 'owner') return next();
      const allowedStatic = roleAllows(user.role, permission);
      const allowedDynamic = await dbApi.hasRolePermission({ organizationId: null, role: user.role, permission });
      if (allowedStatic || allowedDynamic) return next();
      return res.status(403).json({ error: 'Forbidden', permission });
    } catch (err) {
      next(err);
    }
  };

  router.get('/', guard('tasks:view'), async (req, res, next) => {
    try {
      const filters = normalizeTaskFilters(req.query);
      const orgScope = req.auth?.orgScope || [];
      const user = req.auth?.user;
      let tasks = await dbApi.listTasksForOrganizations(orgScope, filters);
      // Personal tasks are only visible to creator
      tasks = tasks.filter(t => {
        if (t.category === 'Personal') {
          return t.createdBy === user.id; // only owner of task sees it
        }
        return true;
      });
      // Apply category access restrictions for all non-owner roles (admin included)
      if (user && user.role !== 'owner') {
        // For performance: get accessible categories list
        const categories = await dbApi.listAccessibleCategoriesForRole(orgScope, user.role);
        const allowedCategoryNames = new Set(categories.map(c => c.name));
        tasks = tasks.filter(t => t.category === 'Personal' || allowedCategoryNames.has(t.category));
      }
      res.json({ tasks: tasks.map(sanitizeTask) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', guard('tasks:create'), async (req, res, next) => {
    try {
      const payload = req.body || {};
      const user = req.auth?.user;
      const orgScope = new Set(req.auth?.orgScope || []);
      const organizationId = payload.organizationId || user.organization_id;

      if (!organizationId || !orgScope.has(organizationId)) {
        res.status(403).json({ error: 'Organization not in scope' });
        return;
      }
      if (!payload.title || typeof payload.title !== 'string') {
        res.status(400).json({ error: 'Task title is required' });
        return;
      }

      const categoryName = (payload.category || 'Work').trim();
      // Enforce Personal tasks only created by their owner (already true) and anyone can create their own Personal; other category must be accessible
      if (categoryName === 'Personal' && payload.assignedTo && payload.assignedTo !== user.id) {
        return res.status(400).json({ error: 'Personal task cannot be pre-assigned to another user' });
      }
      if (categoryName !== 'Personal') {
        // Non-owner roles (including admin) must have category access
        if (user.role !== 'owner') {
          const categories = await dbApi.listAccessibleCategoriesForRole([organizationId], user.role);
          if (!categories.some(c => c.name === categoryName)) {
            return res.status(403).json({ error: 'Category access denied' });
          }
        }
      }

      const maxPosition = await dbApi.getMaxTaskPosition(organizationId);
      const created = await dbApi.createTask({
        organizationId,
        title: payload.title.trim(),
        description: payload.description ?? null,
        status: payload.status || 'todo',
        category: categoryName,
        priority: payload.priority || 'medium',
        dueDate: payload.dueDate || null,
        position: maxPosition + 1,
        createdBy: user.id,
        assignedTo: payload.assignedTo || null
      });

      await auditLogger({
        action: 'task.created',
        entity: 'task',
        entityId: created.id,
        actorId: user.id,
        organizationId,
        after: created
      });

      res.status(201).json({ task: sanitizeTask(created) });
    } catch (error) {
      next(error);
    }
  });

  router.put('/:id', guard('tasks:update'), async (req, res, next) => {
    try {
      const { id } = req.params;
      const updates = req.body || {};
      const user = req.auth?.user;
      const orgScope = new Set(req.auth?.orgScope || []);

      const existing = await dbApi.getTaskById(id);
      if (!existing) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      if (!orgScope.has(existing.organizationId)) {
        res.status(403).json({ error: 'Task outside allowed scope' });
        return;
      }

      if (updates.organizationId && !orgScope.has(updates.organizationId)) {
        res.status(403).json({ error: 'Target organization outside allowed scope' });
        return;
      }

      const sanitizedUpdates = sanitizeTaskUpdates(updates);
      if (Object.keys(sanitizedUpdates).length === 0) {
        res.json({ task: sanitizeTask(existing) });
        return;
      }

      // Enforce Personal privacy: only creator can change Personal task title/desc etc.
      if (existing.category === 'Personal' && existing.createdBy !== user.id) {
        return res.status(403).json({ error: 'Forbidden: cannot modify personal task you do not own' });
      }
      if (sanitizedUpdates.category) {
        const newCat = sanitizedUpdates.category.trim();
        if (existing.category === 'Personal' && newCat !== 'Personal' && existing.createdBy !== user.id) {
          return res.status(403).json({ error: 'Cannot move personal task you do not own' });
        }
        if (newCat === 'Personal' && existing.createdBy !== user.id) {
          return res.status(403).json({ error: 'Cannot move task into Personal owned by another user' });
        }
        if (newCat !== 'Personal' && user.role !== 'owner') {
          const categories = await dbApi.listAccessibleCategoriesForRole([existing.organizationId], user.role);
          if (!categories.some(c => c.name === newCat)) {
            return res.status(403).json({ error: 'Category access denied' });
          }
        }
      }

      const updated = await dbApi.updateTask(id, sanitizedUpdates);
      await auditLogger({
        action: 'task.updated',
        entity: 'task',
        entityId: id,
        actorId: user.id,
        organizationId: updated.organizationId,
        before: existing,
        after: updated
      });

      res.json({ task: sanitizeTask(updated) });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', guard('tasks:delete'), async (req, res, next) => {
    try {
      const { id } = req.params;
      const user = req.auth?.user;
      const orgScope = new Set(req.auth?.orgScope || []);

      const existing = await dbApi.getTaskById(id);
      if (!existing) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      if (!orgScope.has(existing.organizationId)) {
        res.status(403).json({ error: 'Task outside allowed scope' });
        return;
      }

      await dbApi.deleteTask(id);
      await auditLogger({
        action: 'task.deleted',
        entity: 'task',
        entityId: id,
        actorId: user.id,
        organizationId: existing.organizationId,
        before: existing
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function sanitizeTask(task) {
  if (!task) {
    return null;
  }
  return {
    id: task.id,
    organizationId: task.organizationId,
    title: task.title,
    description: task.description,
    status: task.status,
    category: task.category,
    priority: task.priority,
    dueDate: task.dueDate,
    position: task.position,
    createdBy: task.createdBy,
    createdByName: task.createdByName,
    assignedTo: task.assignedTo,
    assignedToName: task.assignedToName,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  };
}

function sanitizeTaskUpdates(updates) {
  const payload = {};
  if (typeof updates.title === 'string') {
    payload.title = updates.title.trim();
  }
  if (typeof updates.description === 'string' || updates.description === null) {
    payload.description = updates.description;
  }
  if (typeof updates.status === 'string') {
    payload.status = updates.status;
  }
  if (typeof updates.category === 'string') {
    payload.category = updates.category;
  }
  if (typeof updates.priority === 'string') {
    payload.priority = updates.priority;
  }
  if (updates.dueDate === null || typeof updates.dueDate === 'number') {
    payload.dueDate = updates.dueDate;
  }
  if (updates.assignedTo === null || typeof updates.assignedTo === 'string') {
    payload.assignedTo = updates.assignedTo;
  }
  if (typeof updates.position === 'number') {
    payload.position = updates.position;
  }
  if (typeof updates.organizationId === 'string') {
    payload.organizationId = updates.organizationId;
  }
  return payload;
}

function normalizeTaskFilters(query) {
  const filters = {};
  if (typeof query?.status === 'string' && query.status.trim()) {
    filters.status = query.status.trim();
  }
  if (typeof query?.category === 'string' && query.category.trim()) {
    filters.category = query.category.trim();
  }
  if (typeof query?.search === 'string' && query.search.trim()) {
    filters.search = query.search.trim();
  }
  if (typeof query?.assignedTo === 'string' && query.assignedTo.trim()) {
    filters.assignedTo = query.assignedTo.trim();
  }
  if (typeof query?.orderBy === 'string' && ['dueDate', 'position'].includes(query.orderBy)) {
    filters.orderBy = query.orderBy;
  }
  return filters;
}

module.exports = {
  createTaskRouter
};
