const { ROLES } = require('./database');

const ROLE_HIERARCHY = {
  [ROLES.OWNER]: [ROLES.OWNER, ROLES.ADMIN, ROLES.VIEWER],
  [ROLES.ADMIN]: [ROLES.ADMIN, ROLES.VIEWER],
  [ROLES.VIEWER]: [ROLES.VIEWER]
};

const PERMISSIONS = {
  'tasks:view': new Set([ROLES.OWNER, ROLES.ADMIN, ROLES.VIEWER]),
  'tasks:create': new Set([ROLES.OWNER, ROLES.ADMIN]),
  'tasks:update': new Set([ROLES.OWNER, ROLES.ADMIN]),
  'tasks:delete': new Set([ROLES.OWNER]),
  'audit:view': new Set([ROLES.OWNER, ROLES.ADMIN]),
  'users:view-all': new Set([ROLES.OWNER, ROLES.ADMIN]),
  // Legacy broad category manage permission (kept for backward compatibility)
  'categories:manage': new Set([ROLES.OWNER, ROLES.ADMIN]),
  // New granular category permissions
  'categories:create': new Set([ROLES.OWNER, ROLES.ADMIN]),
  'categories:update': new Set([ROLES.OWNER, ROLES.ADMIN]),
  'categories:delete': new Set([ROLES.OWNER, ROLES.ADMIN]),
  'categories:access:configure': new Set([ROLES.OWNER]),
  // Viewing categories list is implicit via org scope; explicit permission enables future restriction option
  'categories:view': new Set([ROLES.OWNER, ROLES.ADMIN, ROLES.VIEWER]),
  // Roles management permissions
  'roles:view': new Set([ROLES.OWNER, ROLES.ADMIN]),
  'roles:create': new Set([ROLES.OWNER, ROLES.ADMIN]),
  'roles:update': new Set([ROLES.OWNER, ROLES.ADMIN]),
  'roles:delete': new Set([ROLES.OWNER])
};

function normalizeRole(role) {
  return typeof role === 'string' ? role.trim().toLowerCase() : '';
}

function roleAllows(role, permission) {
  const normalized = normalizeRole(role);
  const allowedRoles = PERMISSIONS[permission];
  if (!allowedRoles) {
    return false;
  }
  const inherited = ROLE_HIERARCHY[normalized] || [];
  return inherited.some((candidate) => allowedRoles.has(candidate));
}

function getInheritedRoles(role) {
  const normalized = normalizeRole(role);
  return ROLE_HIERARCHY[normalized] || [];
}

function buildOrgIndex(organizations) {
  const byId = new Map();
  const children = new Map();
  (organizations || []).forEach((org) => {
    byId.set(org.id, org);
    if (!children.has(org.parent_id || null)) {
      children.set(org.parent_id || null, []);
    }
    children.get(org.parent_id || null).push(org);
  });
  return { byId, children };
}

function collectDescendants(id, childrenMap, acc) {
  const queue = [id];
  while (queue.length) {
    const current = queue.shift();
    if (!current || acc.has(current)) {
      continue;
    }
    acc.add(current);
    const childList = childrenMap.get(current) || [];
    childList.forEach((child) => queue.push(child.id));
  }
}

function resolveOrgScopeForUser(user, organizations) {
  const scope = new Set();
  if (!user) {
    return scope;
  }
  const normalizedRole = normalizeRole(user.role);
  const { byId, children } = buildOrgIndex(organizations);
  const userOrgId = user.organization_id || user.organizationId;
  if (!userOrgId) {
    return scope;
  }
  scope.add(userOrgId);
  const orgRecord = byId.get(userOrgId);
  const isRoot = !orgRecord || !orgRecord.parent_id;

  if (normalizedRole === ROLES.OWNER) {
    // Owner has unrestricted visibility: include every organization (not just descendants)
    (organizations || []).forEach((o) => scope.add(o.id));
  } else if (normalizedRole === ROLES.ADMIN) {
    if (isRoot) {
      collectDescendants(userOrgId, children, scope);
    }
  }

  return scope;
}

module.exports = {
  PERMISSIONS,
  normalizeRole,
  roleAllows,
  getInheritedRoles,
  resolveOrgScopeForUser
};
