const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DEFAULT_DB_FILE = 'app.db';

const TABLES = {
	ORGANIZATIONS: 'organizations',
	USERS: 'users',
	TASKS: 'tasks',
	AUDIT_LOG: 'audit_log',
	ROLE_PERMISSIONS: 'role_permissions',
	CATEGORIES: 'categories'
};

const ROLES = {
	OWNER: 'owner',
	ADMIN: 'admin',
	VIEWER: 'viewer'
};

function initDatabase(dataDir, fileName = DEFAULT_DB_FILE)
{
	if (!fs.existsSync(dataDir))
	{
		fs.mkdirSync(dataDir, { recursive: true });
	}
	const dbPath = path.join(dataDir, fileName);
	const db = new sqlite3.Database(dbPath);

	db.serialize(() =>
	{
		db.run('PRAGMA foreign_keys = ON');

		db.run(`CREATE TABLE IF NOT EXISTS ${TABLES.ORGANIZATIONS} (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT REFERENCES ${TABLES.ORGANIZATIONS}(id) ON DELETE CASCADE,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    )`);

		db.run(`CREATE TABLE IF NOT EXISTS ${TABLES.USERS} (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES ${TABLES.ORGANIZATIONS}(id) ON DELETE CASCADE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      first_login_at INTEGER,
      has_seen_welcome INTEGER NOT NULL DEFAULT 0,
      welcome_version INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    )`);

		db.run(`CREATE TABLE IF NOT EXISTS ${TABLES.TASKS} (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES ${TABLES.ORGANIZATIONS}(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      category TEXT DEFAULT 'Work',
      priority TEXT DEFAULT 'medium',
      due_date INTEGER,
      position INTEGER DEFAULT 0,
      created_by TEXT REFERENCES ${TABLES.USERS}(id) ON DELETE SET NULL,
      assigned_to TEXT REFERENCES ${TABLES.USERS}(id) ON DELETE SET NULL,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    )`);

		db.run(`CREATE TABLE IF NOT EXISTS ${TABLES.CATEGORIES} (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES ${TABLES.ORGANIZATIONS}(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      UNIQUE(organization_id, name)
    )`);

		// Category role access mapping (which roles may view a category).
		// If no rows exist for a category, all roles inheriting categories:view may see it (backward compatible default open behavior).
		db.run(`CREATE TABLE IF NOT EXISTS category_role_access (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL REFERENCES ${TABLES.CATEGORIES}(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      UNIQUE(category_id, role)
    )`);

		db.run(`CREATE TABLE IF NOT EXISTS ${TABLES.AUDIT_LOG} (
      id TEXT PRIMARY KEY,
      organization_id TEXT REFERENCES ${TABLES.ORGANIZATIONS}(id) ON DELETE SET NULL,
      actor_id TEXT REFERENCES ${TABLES.USERS}(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      before TEXT,
      after TEXT,
      metadata TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    )`);

		db.run(`CREATE TABLE IF NOT EXISTS current_session (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      user_id TEXT REFERENCES ${TABLES.USERS}(id),
      token_expires_at INTEGER,
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    )`);

		db.run(`CREATE TABLE IF NOT EXISTS ${TABLES.ROLE_PERMISSIONS} (
      id TEXT PRIMARY KEY,
      organization_id TEXT REFERENCES ${TABLES.ORGANIZATIONS}(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      permission TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      UNIQUE(organization_id, role, permission)
    )`);

		// Roles catalog (supports custom roles)
		db.run(`CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    )`);

		db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_org_position ON ${TABLES.TASKS} (organization_id, position)`);
		db.run(`CREATE INDEX IF NOT EXISTS idx_audit_org_created ON ${TABLES.AUDIT_LOG} (organization_id, created_at DESC)`);
		db.run(`CREATE INDEX IF NOT EXISTS idx_users_org_role ON ${TABLES.USERS} (organization_id, role)`);
		db.run(`CREATE INDEX IF NOT EXISTS idx_users_welcome_pending ON ${TABLES.USERS} (has_seen_welcome) WHERE has_seen_welcome = 0`);
		db.run(`CREATE INDEX IF NOT EXISTS idx_categories_org_name ON ${TABLES.CATEGORIES} (organization_id, name)`);
	});

	// Lightweight migration: add columns if missing
	migrateUsersTable(db).catch((error) =>
	{
		console.error('Failed to run users table migration', error);
	});

	// Categories table migration (add is_system)
	migrateCategoriesTable(db).catch((error) =>
	{
		console.error('Failed to migrate categories table', error);
	});

	// Ensure role support migrations (drop legacy CHECK constraints if present)
	migrateRoleSupport(db).catch((error) =>
	{
		console.error('Failed to migrate role support', error);
	});

	seedInitialData(db).catch((error) =>
	{
		console.error('Failed to seed database', error);
	});

	return {
		db,
		dbPath,
		getUserByEmail: (email) => get(db, `SELECT * FROM ${TABLES.USERS} WHERE email = ?`, [String(email).toLowerCase()]),
		getUserById: (id) => get(db, `SELECT * FROM ${TABLES.USERS} WHERE id = ?`, [id]),
		listOrganizations: () => all(db, `SELECT * FROM ${TABLES.ORGANIZATIONS} ORDER BY created_at ASC`),
		getOrganizationById: (id) => get(db, `SELECT * FROM ${TABLES.ORGANIZATIONS} WHERE id = ?`, [id]),
		getChildOrganizations: (parentId) => all(db, `SELECT * FROM ${TABLES.ORGANIZATIONS} WHERE parent_id = ?`, [parentId]),
		createTask: (task) => createTask(db, task),
		updateTask: (id, updates) => updateTask(db, id, updates),
		deleteTask: (id) => run(db, `DELETE FROM ${TABLES.TASKS} WHERE id = ?`, [id]),
		getTaskById: (id) => get(db, `${taskSelectAllColumns()} WHERE t.id = ?`, [id]),
		listTasksForOrganizations: (orgIds, filters = {}) => listTasksForOrganizations(db, orgIds, filters),
		// Categories helpers
		createCategory: (data) => createCategory(db, data),
		updateCategory: (id, updates) => updateCategory(db, id, updates),
		deleteCategory: (id) => run(db, `DELETE FROM ${TABLES.CATEGORIES} WHERE id = ?`, [id]),
		getCategoryById: (id) => get(db, `SELECT id, organization_id AS organizationId, name, is_system AS isSystem, created_at AS createdAt FROM ${TABLES.CATEGORIES} WHERE id = ?`, [id]),
		listCategoriesForOrganizations: (orgIds) => listCategoriesForOrganizations(db, orgIds),
		// Category access helpers
		listCategoryRoleAccess: (categoryId) => listCategoryRoleAccess(db, categoryId),
		setCategoryRoleAccess: (categoryId, roles) => setCategoryRoleAccess(db, categoryId, roles),
		listAccessibleCategoriesForRole: (orgIds, role) => listAccessibleCategoriesForRole(db, orgIds, role),
		createAuditEvent: (event) => createAuditEvent(db, event),
		listAuditEvents: (orgIds, limit = 100) => listAuditEvents(db, orgIds, limit),
		getMaxTaskPosition: (orgId) => getMaxTaskPosition(db, orgId),
		upsertUser: (user) => upsertUser(db, user),
		listAllUsers: () => listAllUsers(db),
		listUsersForOrganizations: (orgIds) => listUsersForOrganizations(db, orgIds),
		deleteUser: (id) => run(db, `DELETE FROM ${TABLES.USERS} WHERE id = ?`, [id]),
		// Role permission helpers
		hasRolePermission: (opts) => hasRolePermission(db, opts),
		setRolePermission: (opts) => setRolePermission(db, opts),
		listRolePermissions: (opts) => listRolePermissions(db, opts),
		// Roles catalog helpers
		listRoles: () => listRoles(db),
		getRoleByName: (name) => getRoleByName(db, name),
		createRole: (role) => createRole(db, role),
		updateRole: (oldName, updates) => updateRole(db, oldName, updates),
		deleteRole: (name) => deleteRole(db, name),
		// First-login helpers
		markFirstLoginIfNeeded: (userId, welcomeVersion = 1) => markFirstLoginIfNeeded(db, userId, welcomeVersion),
		completeWelcome: (userId) => completeWelcome(db, userId),
		getWelcomeState: (userId) => getWelcomeState(db, userId),
		// Current session helpers
		setCurrentSession: (userId, tokenExpiresAt) => setCurrentSession(db, userId, tokenExpiresAt),
		getCurrentSession: () => getCurrentSession(db),
		close: () => db.close()
	};
}

function taskSelectAllColumns()
{
	return `SELECT
      t.id,
      t.organization_id AS organizationId,
      t.title,
      t.description,
      t.status,
      t.category,
      t.priority,
      t.due_date AS dueDate,
      t.position,
      t.created_by AS createdBy,
      creator.name AS createdByName,
      t.assigned_to AS assignedTo,
      assignee.name AS assignedToName,
      t.created_at AS createdAt,
      t.updated_at AS updatedAt
    FROM ${TABLES.TASKS} t
    LEFT JOIN ${TABLES.USERS} creator ON creator.id = t.created_by
    LEFT JOIN ${TABLES.USERS} assignee ON assignee.id = t.assigned_to`;
}

async function seedInitialData(db)
{
	const orgCountRow = await get(db, `SELECT COUNT(*) AS count FROM ${TABLES.ORGANIZATIONS}`);
	if (!orgCountRow || orgCountRow.count === 0)
	{
		const orgId = uuidv4();
		await run(db, `INSERT INTO ${TABLES.ORGANIZATIONS} (id, name, parent_id) VALUES (?, ?, NULL)`, [orgId, 'Acme']);

		const ownerId = uuidv4();
		const adminId = uuidv4();
		const viewerId = uuidv4();

		await run(db, `INSERT INTO ${TABLES.USERS} (id, organization_id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?, ?)`, [
			ownerId,
			orgId,
			'owner@acme.test',
			hashPassword('Owner123!'),
			'Olivia Owner',
			ROLES.OWNER
		]);

		await run(db, `INSERT INTO ${TABLES.USERS} (id, organization_id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?, ?)`, [
			adminId,
			orgId,
			'admin@acme.test',
			hashPassword('Admin123!'),
			'Avery Admin',
			ROLES.ADMIN
		]);

		await run(db, `INSERT INTO ${TABLES.USERS} (id, organization_id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?, ?)`, [
			viewerId,
			orgId,
			'viewer@acme.test',
			hashPassword('Viewer123!'),
			'Vera Viewer',
			ROLES.VIEWER
		]);

		const seedTasks = [
			{
				title: 'Plan quarterly objectives',
				description: 'Draft OKRs and circulate for review.',
				status: 'todo',
				category: 'Work',
				priority: 'high',
				dueDate: Date.now() + 7 * 86400000,
				organizationId: orgId,
				createdBy: ownerId,
				assignedTo: adminId,
				position: 1
			},
			{
				title: 'Schedule field training',
				description: 'Coordinate onboarding workshop for new hires.',
				status: 'in_progress',
				category: 'Work',
				priority: 'medium',
				dueDate: Date.now() + 3 * 86400000,
				organizationId: orgId,
				createdBy: adminId,
				assignedTo: viewerId,
				position: 2
			},
			{
				title: 'Team social outing',
				description: 'Plan informal gathering to celebrate launch.',
				status: 'todo',
				category: 'Personal',
				priority: 'low',
				dueDate: Date.now() + 14 * 86400000,
				organizationId: orgId,
				createdBy: adminId,
				assignedTo: viewerId,
				position: 3
			}
		];

		for (const task of seedTasks)
		{
			await createTask(db, task);
		}

		// Seed system roles catalog (idempotent)
		await ensureSystemRoles(db);

		// Seed default dynamic permissions: allow admin role to access admin UI globally (organization_id NULL)
		const rpId = uuidv4();
		await run(
			db,
			`INSERT OR IGNORE INTO ${TABLES.ROLE_PERMISSIONS} (id, organization_id, role, permission, enabled)
       VALUES (?, NULL, ?, 'admin:access', 1)`,
			[rpId, ROLES.ADMIN]
		);

		// Seed users:view-all permission enabled for admin globally
		const rpId2 = uuidv4();
		await run(
			db,
			`INSERT OR IGNORE INTO ${TABLES.ROLE_PERMISSIONS} (id, organization_id, role, permission, enabled)
       VALUES (?, NULL, ?, 'users:view-all', 1)`,
			[rpId2, ROLES.ADMIN]
		);

		// Seed roles management defaults for admin (view/create/update enabled; delete remains owner-only)
		const seedRolePerm = async (perm) =>
		{
			const id = uuidv4();
			await run(
				db,
				`INSERT OR IGNORE INTO ${TABLES.ROLE_PERMISSIONS} (id, organization_id, role, permission, enabled)
         VALUES (?, NULL, ?, ?, 1)`,
				[id, ROLES.ADMIN, perm]
			);
		};
		await seedRolePerm('roles:view');
		await seedRolePerm('roles:create');
		await seedRolePerm('roles:update');
	}
	// Ensure system roles exist even when organizations already seeded
	await ensureSystemRoles(db);
	// Ensure system categories for all organizations
	const orgs = await all(db, `SELECT id FROM ${TABLES.ORGANIZATIONS}`);
	for (const o of orgs)
	{
		await ensureSystemCategories(db, o.id);
	}

	// Ensure critical role permissions exist globally (idempotent)
	// Seed roles:delete for admin and owner by default, and keep existing admin seeds intact on existing DBs
	const ensureGlobalRolePermission = async (role, permission, enabled = 1) =>
	{
		const id = uuidv4();
		await run(
			db,
			`INSERT OR IGNORE INTO ${TABLES.ROLE_PERMISSIONS} (id, organization_id, role, permission, enabled)
       VALUES (?, NULL, ?, ?, ?)`,
			[id, role, permission, enabled ? 1 : 0]
		);
	};
	await ensureGlobalRolePermission(ROLES.ADMIN, 'roles:delete', 1);
	await ensureGlobalRolePermission(ROLES.OWNER, 'roles:delete', 1);
}

function hashPassword(password)
{
	return bcrypt.hashSync(password, 10);
}

async function createTask(db, task)
{
	const id = task.id || uuidv4();
	await run(
		db,
		`INSERT INTO ${TABLES.TASKS} (id, organization_id, title, description, status, category, priority, due_date, position, created_by, assigned_to)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			id,
			task.organizationId,
			task.title,
			task.description ?? null,
			task.status ?? 'todo',
			task.category ?? 'Work',
			task.priority ?? 'medium',
			task.dueDate ?? null,
			task.position ?? 0,
			task.createdBy,
			task.assignedTo ?? null
		]
	);
	return get(db, `${taskSelectAllColumns()} WHERE t.id = ?`, [id]);
}

async function updateTask(db, id, updates)
{
	const columns = [];
	const values = [];
	const fieldMap = {
		title: 'title',
		description: 'description',
		status: 'status',
		category: 'category',
		priority: 'priority',
		dueDate: 'due_date',
		assignedTo: 'assigned_to',
		position: 'position',
		organizationId: 'organization_id'
	};

	Object.entries(fieldMap).forEach(([key, column]) =>
	{
		if (Object.prototype.hasOwnProperty.call(updates, key))
		{
			columns.push(`${column} = ?`);
			values.push(updates[key] ?? null);
		}
	});

	if (columns.length === 0)
	{
		return get(db, `${taskSelectAllColumns()} WHERE t.id = ?`, [id]);
	}

	columns.push("updated_at = (strftime('%s','now'))");
	values.push(id);

	await run(db, `UPDATE ${TABLES.TASKS} SET ${columns.join(', ')} WHERE id = ?`, values);
	return get(db, `${taskSelectAllColumns()} WHERE t.id = ?`, [id]);
}

function listTasksForOrganizations(db, orgIds, filters)
{
	if (!Array.isArray(orgIds) || orgIds.length === 0)
	{
		return Promise.resolve([]);
	}
	const clauses = [`t.organization_id IN (${orgIds.map(() => '?').join(',')})`];
	const params = [...orgIds];

	if (filters.status)
	{
		clauses.push('t.status = ?');
		params.push(filters.status);
	}
	if (filters.category)
	{
		clauses.push('t.category = ?');
		params.push(filters.category);
	}
	if (filters.search)
	{
		clauses.push('(t.title LIKE ? OR t.description LIKE ?)');
		params.push(`%${filters.search}%`, `%${filters.search}%`);
	}
	if (filters.assignedTo)
	{
		clauses.push('t.assigned_to = ?');
		params.push(filters.assignedTo);
	}

	const orderBy = filters.orderBy === 'dueDate'
		? 'CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END ASC, t.due_date ASC'
		: 't.position ASC, t.created_at ASC';

	return all(db, `${taskSelectAllColumns()} WHERE ${clauses.join(' AND ')} ORDER BY ${orderBy}`, params);
}

function listUsersForOrganizations(db, orgIds)
{
	if (!Array.isArray(orgIds) || orgIds.length === 0)
	{
		return Promise.resolve([]);
	}
	const placeholders = orgIds.map(() => '?').join(',');
	return all(
		db,
		`SELECT id, organization_id AS organizationId, email, name, role, is_active AS isActive, created_at AS createdAt
     FROM ${TABLES.USERS}
     WHERE organization_id IN (${placeholders})
     ORDER BY created_at ASC`,
		orgIds
	);
}

async function createCategory(db, { organizationId, name })
{
	const id = uuidv4();
	const trimmed = String(name || '').trim();
	if (!organizationId) throw new Error('organizationId required');
	if (!trimmed) throw new Error('name required');
	await run(db, `INSERT INTO ${TABLES.CATEGORIES} (id, organization_id, name, is_system) VALUES (?, ?, ?, 0)`, [id, organizationId, trimmed]);
	return get(db, `SELECT c.id, c.organization_id AS organizationId, o.name AS organizationName, c.name, c.is_system AS isSystem, c.created_at AS createdAt
                  FROM ${TABLES.CATEGORIES} c
                  LEFT JOIN ${TABLES.ORGANIZATIONS} o ON o.id = c.organization_id
                  WHERE c.id = ?`, [id]);
}

async function updateCategory(db, id, updates)
{
	const fields = [];
	const values = [];
	if (typeof updates.name === 'string')
	{
		fields.push('name = ?');
		values.push(updates.name.trim());
	}
	if (typeof updates.organizationId === 'string')
	{
		fields.push('organization_id = ?');
		values.push(updates.organizationId);
	}
	if (fields.length === 0)
	{
		return get(db, `SELECT c.id, c.organization_id AS organizationId, o.name AS organizationName, c.name, c.is_system AS isSystem, c.created_at AS createdAt
                    FROM ${TABLES.CATEGORIES} c
                    LEFT JOIN ${TABLES.ORGANIZATIONS} o ON o.id = c.organization_id
                    WHERE c.id = ?`, [id]);
	}
	values.push(id);
	await run(db, `UPDATE ${TABLES.CATEGORIES} SET ${fields.join(', ')} WHERE id = ?`, values);
	return get(db, `SELECT c.id, c.organization_id AS organizationId, o.name AS organizationName, c.name, c.is_system AS isSystem, c.created_at AS createdAt
                  FROM ${TABLES.CATEGORIES} c
                  LEFT JOIN ${TABLES.ORGANIZATIONS} o ON o.id = c.organization_id
                  WHERE c.id = ?`, [id]);
}

function listCategoriesForOrganizations(db, orgIds)
{
	if (!Array.isArray(orgIds) || orgIds.length === 0) return Promise.resolve([]);
	const placeholders = orgIds.map(() => '?').join(',');
	return all(
		db,
		`SELECT c.id,
            c.organization_id AS organizationId,
            o.name AS organizationName,
            c.name,
            c.is_system AS isSystem,
            c.created_at AS createdAt
       FROM ${TABLES.CATEGORIES} c
       LEFT JOIN ${TABLES.ORGANIZATIONS} o ON o.id = c.organization_id
      WHERE c.organization_id IN (${placeholders})
      ORDER BY c.name ASC, o.name ASC`,
		orgIds
	);
}

async function listCategoryRoleAccess(db, categoryId)
{
	return all(db, `SELECT role FROM category_role_access WHERE category_id = ? ORDER BY role ASC`, [categoryId]).then(rows => rows.map(r => r.role));
}

async function setCategoryRoleAccess(db, categoryId, roles)
{
	const uniqueRoles = Array.from(new Set((roles || []).map(r => String(r).trim().toLowerCase()).filter(Boolean)));
	return withTransaction(db, async () =>
	{
		await run(db, `DELETE FROM category_role_access WHERE category_id = ?`, [categoryId]);
		for (const role of uniqueRoles)
		{
			const id = uuidv4();
			await run(db, `INSERT INTO category_role_access (id, category_id, role) VALUES (?, ?, ?)`, [id, categoryId, role]);
		}
		return listCategoryRoleAccess(db, categoryId);
	});
}

function listAccessibleCategoriesForRole(db, orgIds, role)
{
	if (!Array.isArray(orgIds) || orgIds.length === 0) return Promise.resolve([]);
	const placeholders = orgIds.map(() => '?').join(',');
	// Revised logic:
	// - System categories (is_system = 1) remain visible to any role that can view categories when no explicit access rows exist.
	// - Non-system (custom) categories now require explicit category_role_access entries granting the role.
	//   This prevents newly created custom categories from automatically appearing for every viewer until configured.
	// - If access rows exist for a category, the role must be present regardless of is_system flag.
	const sql = `SELECT c.id, c.organization_id AS organizationId, c.name, c.is_system AS isSystem, c.created_at AS createdAt
               FROM ${TABLES.CATEGORIES} c
               LEFT JOIN (
                  SELECT category_id, COUNT(*) AS cnt FROM category_role_access GROUP BY category_id
               ) counts ON counts.category_id = c.id
               LEFT JOIN category_role_access cra ON cra.category_id = c.id AND cra.role = ?
               WHERE c.organization_id IN (${placeholders})
                 AND ( (counts.cnt IS NULL AND c.is_system = 1) OR cra.role IS NOT NULL )
               ORDER BY c.name ASC`;
	return all(db, sql, [role, ...orgIds]);
}

async function migrateCategoriesTable(db)
{
	const columns = await all(db, `PRAGMA table_info(${TABLES.CATEGORIES})`);
	const names = new Set(columns.map((c) => c.name));
	if (!names.has('is_system'))
	{
		await run(db, `ALTER TABLE ${TABLES.CATEGORIES} ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0`);
	}
}

async function ensureSystemCategories(db, organizationId)
{
	const rows = await all(db, `SELECT id, name, is_system FROM ${TABLES.CATEGORIES} WHERE organization_id = ?`, [organizationId]);
	const byLower = rows.reduce((acc, r) =>
	{
		const key = r.name.toLowerCase();
		if (!acc[key]) acc[key] = [];
		acc[key].push(r);
		return acc;
	}, {});
	const desired = ['work', 'personal'];
	for (const key of desired)
	{
		const canonicalName = key.charAt(0).toUpperCase() + key.slice(1);
		const list = byLower[key] || [];
		if (list.length === 0)
		{
			const id = uuidv4();
			await run(db, `INSERT INTO ${TABLES.CATEGORIES} (id, organization_id, name, is_system) VALUES (?, ?, ?, 1)`, [id, organizationId, canonicalName]);
			continue;
		}
		// Keep the first entry (arbitrary) and remove any duplicates for same lower-cased name
		const [keep, ...dupes] = list;
		if (!keep.is_system)
		{
			await run(db, `UPDATE ${TABLES.CATEGORIES} SET is_system = 1, name = ? WHERE id = ?`, [canonicalName, keep.id]);
		} else if (keep.name !== canonicalName)
		{
			// Normalize casing of the kept row
			await run(db, `UPDATE ${TABLES.CATEGORIES} SET name = ? WHERE id = ?`, [canonicalName, keep.id]);
		}
		for (const d of dupes)
		{
			await run(db, `DELETE FROM ${TABLES.CATEGORIES} WHERE id = ?`, [d.id]);
		}
	}
}

function listAllUsers(db)
{
	return all(
		db,
		`SELECT id, organization_id AS organizationId, email, name, role, is_active AS isActive, created_at AS createdAt
     FROM ${TABLES.USERS}
     ORDER BY created_at ASC`,
		[]
	);
}

async function createAuditEvent(db, event)
{
	const id = uuidv4();
	await run(
		db,
		`INSERT INTO ${TABLES.AUDIT_LOG} (id, organization_id, actor_id, action, entity, entity_id, before, after, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
		[
			id,
			event.organizationId ?? null,
			event.actorId ?? null,
			event.action,
			event.entity,
			event.entityId,
			event.before ? JSON.stringify(event.before) : null,
			event.after ? JSON.stringify(event.after) : null,
			event.metadata ? JSON.stringify(event.metadata) : null
		]
	);
	return get(db, `SELECT * FROM ${TABLES.AUDIT_LOG} WHERE id = ?`, [id]);
}

function listAuditEvents(db, orgIds, limit = 100)
{
	if (!Array.isArray(orgIds) || orgIds.length === 0)
	{
		return Promise.resolve([]);
	}
	const placeholders = orgIds.map(() => '?').join(',');
	const params = [...orgIds, limit];

	return all(
		db,
		`SELECT audit.*, users.name AS actorName
     FROM ${TABLES.AUDIT_LOG} audit
     LEFT JOIN ${TABLES.USERS} users ON users.id = audit.actor_id
     WHERE audit.organization_id IN (${placeholders})
     ORDER BY audit.created_at DESC
     LIMIT ?`,
		params
	).then((rows) =>
		rows.map((row) => ({
			...row,
			before: row.before ? safeParse(row.before) : null,
			after: row.after ? safeParse(row.after) : null,
			metadata: row.metadata ? safeParse(row.metadata) : null
		}))
	);
}

function getMaxTaskPosition(db, organizationId)
{
	return get(
		db,
		`SELECT MAX(position) AS maxPosition FROM ${TABLES.TASKS} WHERE organization_id = ?`,
		[organizationId]
	).then((row) => (row && row.maxPosition != null ? row.maxPosition : 0));
}

async function upsertUser(db, user)
{
	const id = user.id || uuidv4();
	const organizationId = user.organizationId ?? user.organization_id;
	const email = String(user.email || '').toLowerCase();
	const name = user.name;
	const role = user.role;
	const isActive =
		user.isActive != null
			? user.isActive ? 1 : 0
			: user.is_active != null
				? (user.is_active ? 1 : 0)
				: 1;

	const passwordHash = user.passwordHash ?? user.password_hash;
	const finalPasswordHash = passwordHash || (user.password ? hashPassword(user.password) : null);

	if (!organizationId) throw new Error('organizationId required');
	if (!email) throw new Error('email required');
	if (!name) throw new Error('name required');
	if (!role) throw new Error('role required');
	if (!finalPasswordHash) throw new Error('password or passwordHash required');

	await run(
		db,
		`INSERT INTO ${TABLES.USERS} (id, organization_id, email, password_hash, name, role, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       organization_id = excluded.organization_id,
       email = excluded.email,
       password_hash = excluded.password_hash,
       name = excluded.name,
       role = excluded.role,
       is_active = excluded.is_active`,
		[id, organizationId, email, finalPasswordHash, name, role, isActive]
	);

	return get(db, `SELECT * FROM ${TABLES.USERS} WHERE id = ?`, [id]);
}

function safeParse(value)
{
	try
	{
		return JSON.parse(value);
	} catch (error)
	{
		return value;
	}
}

function run(db, sql, params = [])
{
	return new Promise((resolve, reject) =>
	{
		db.run(sql, params, function (err)
		{
			if (err)
			{
				reject(err);
				return;
			}
			resolve(this);
		});
	});
}

function all(db, sql, params = [])
{
	return new Promise((resolve, reject) =>
	{
		db.all(sql, params, (err, rows) =>
		{
			if (err)
			{
				reject(err);
				return;
			}
			resolve(rows);
		});
	});
}

function get(db, sql, params = [])
{
	return new Promise((resolve, reject) =>
	{
		db.get(sql, params, (err, row) =>
		{
			if (err)
			{
				reject(err);
				return;
			}
			resolve(row || null);
		});
	});
}

module.exports = {
	initDatabase,
	DEFAULT_DB_FILE,
	TABLES,
	ROLES,
	run,
	get,
	all
};

// --- Migration and first-login helpers ---
async function migrateUsersTable(db)
{
	const columns = await all(db, `PRAGMA table_info(${TABLES.USERS})`);
	const names = new Set(columns.map((c) => c.name));
	const ops = [];
	if (!names.has('first_login_at'))
	{
		ops.push(run(db, `ALTER TABLE ${TABLES.USERS} ADD COLUMN first_login_at INTEGER`));
	}
	if (!names.has('has_seen_welcome'))
	{
		ops.push(run(db, `ALTER TABLE ${TABLES.USERS} ADD COLUMN has_seen_welcome INTEGER NOT NULL DEFAULT 0`));
	}
	if (!names.has('welcome_version'))
	{
		ops.push(run(db, `ALTER TABLE ${TABLES.USERS} ADD COLUMN welcome_version INTEGER DEFAULT 1`));
	}
	await Promise.all(ops);

	// Create index (partial-like) using simple index on has_seen_welcome; SQLite doesn't support true partial indexes in all builds
	await run(db, `CREATE INDEX IF NOT EXISTS idx_users_welcome_pending ON ${TABLES.USERS} (has_seen_welcome)`);

	// Optional backfill: set has_seen_welcome = 1 for existing users to avoid showing welcome retroactively
	const backfill = String(process.env.APP_WELCOME_BACKFILL_SEEN || process.env.WELCOME_BACKFILL_SEEN || '').toLowerCase();
	if (backfill === '1' || backfill === 'true' || backfill === 'yes')
	{
		await run(db, `UPDATE ${TABLES.USERS} SET has_seen_welcome = 1 WHERE has_seen_welcome = 0`);
	}
}

// --- Role support migrations and helpers ---
async function migrateRoleSupport(db)
{
	// Drop CHECK constraint on users.role and role_permissions.role if present by recreating tables
	const usersTableSql = await get(db, `SELECT sql FROM sqlite_master WHERE type='table' AND name='${TABLES.USERS}'`);
	const rolePermsTableSql = await get(db, `SELECT sql FROM sqlite_master WHERE type='table' AND name='${TABLES.ROLE_PERMISSIONS}'`);
	const needsUsersRebuild = !!(usersTableSql && /CHECK\(role\s+IN/i.test(usersTableSql.sql || ''));
	const needsRolePermsRebuild = !!(rolePermsTableSql && /CHECK\(role\s+IN/i.test(rolePermsTableSql.sql || ''));

	if (needsUsersRebuild)
	{
		await withTransaction(db, async () =>
		{
			await run(db, `CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES ${TABLES.ORGANIZATIONS}(id) ON DELETE CASCADE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        first_login_at INTEGER,
        has_seen_welcome INTEGER NOT NULL DEFAULT 0,
        welcome_version INTEGER DEFAULT 1,
        created_at INTEGER DEFAULT (strftime('%s','now'))
      )`);
			await run(db, `INSERT INTO users_new (id, organization_id, email, password_hash, name, role, is_active, first_login_at, has_seen_welcome, welcome_version, created_at)
        SELECT id, organization_id, email, password_hash, name, role, is_active, first_login_at, has_seen_welcome, welcome_version, created_at FROM ${TABLES.USERS}`);
			await run(db, `DROP TABLE ${TABLES.USERS}`);
			await run(db, `ALTER TABLE users_new RENAME TO ${TABLES.USERS}`);
			// Recreate indexes
			await run(db, `CREATE INDEX IF NOT EXISTS idx_users_org_role ON ${TABLES.USERS} (organization_id, role)`);
			await run(db, `CREATE INDEX IF NOT EXISTS idx_users_welcome_pending ON ${TABLES.USERS} (has_seen_welcome)`);
		});
	}

	if (needsRolePermsRebuild)
	{
		await withTransaction(db, async () =>
		{
			await run(db, `CREATE TABLE role_permissions_new (
        id TEXT PRIMARY KEY,
        organization_id TEXT REFERENCES ${TABLES.ORGANIZATIONS}(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        permission TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        UNIQUE(organization_id, role, permission)
      )`);
			await run(db, `INSERT INTO role_permissions_new (id, organization_id, role, permission, enabled, created_at)
        SELECT id, organization_id, role, permission, enabled, created_at FROM ${TABLES.ROLE_PERMISSIONS}`);
			await run(db, `DROP TABLE ${TABLES.ROLE_PERMISSIONS}`);
			await run(db, `ALTER TABLE role_permissions_new RENAME TO ${TABLES.ROLE_PERMISSIONS}`);
		});
	}
}

async function ensureSystemRoles(db)
{
	const system = [
		{ name: ROLES.OWNER, description: 'Full control of the organization', is_system: 1 },
		{ name: ROLES.ADMIN, description: 'Manage users and settings', is_system: 1 },
		{ name: ROLES.VIEWER, description: 'Read-only access', is_system: 1 }
	];
	for (const r of system)
	{
		const id = uuidv4();
		await run(
			db,
			`INSERT OR IGNORE INTO roles (id, name, description, is_system) VALUES (?, ?, ?, ?)`,
			[id, r.name, r.description, r.is_system]
		);
	}
}

function listRoles(db)
{
	return all(db, `SELECT id, name, description, is_system AS isSystem, created_at AS createdAt FROM roles ORDER BY is_system DESC, name ASC`);
}

function getRoleByName(db, name)
{
	return get(db, `SELECT id, name, description, is_system AS isSystem, created_at AS createdAt FROM roles WHERE LOWER(name) = LOWER(?)`, [name]);
}

async function createRole(db, { name, description })
{
	const roleName = String(name || '').trim().toLowerCase();
	if (!roleName) throw new Error('Role name is required');
	if ([ROLES.OWNER, ROLES.ADMIN, ROLES.VIEWER].includes(roleName)) throw new Error('Cannot create system role');
	const id = uuidv4();
	await run(db, `INSERT INTO roles (id, name, description, is_system) VALUES (?, ?, ?, 0)`, [id, roleName, description || null]);
	return get(db, `SELECT id, name, description, is_system AS isSystem, created_at AS createdAt FROM roles WHERE id = ?`, [id]);
}

async function updateRole(db, oldName, { name, description })
{
	const existing = await getRoleByName(db, oldName);
	if (!existing) throw new Error('Role not found');
	if (existing.isSystem) throw new Error('Cannot modify system role');
	const updates = { name: name != null ? String(name).trim().toLowerCase() : null, description };
	return withTransaction(db, async () =>
	{
		if (updates.name && updates.name !== existing.name)
		{
			// Update role name everywhere: roles table, users, role_permissions
			await run(db, `UPDATE roles SET name = ? WHERE id = ?`, [updates.name, existing.id]);
			await run(db, `UPDATE ${TABLES.USERS} SET role = ? WHERE role = ?`, [updates.name, existing.name]);
			await run(db, `UPDATE ${TABLES.ROLE_PERMISSIONS} SET role = ? WHERE role = ?`, [updates.name, existing.name]);
		}
		if (description !== undefined)
		{
			await run(db, `UPDATE roles SET description = ? WHERE id = ?`, [description || null, existing.id]);
		}
		return getRoleByName(db, updates.name || existing.name);
	});
}

async function deleteRole(db, name)
{
	const existing = await getRoleByName(db, name);
	if (!existing) throw new Error('Role not found');
	if (existing.isSystem) throw new Error('Cannot delete system role');
	const usage = await get(db, `SELECT COUNT(*) AS cnt FROM ${TABLES.USERS} WHERE role = ?`, [existing.name]);
	if (usage && usage.cnt > 0)
	{
		const err = new Error('Role is in use by users');
		err.code = 'ROLE_IN_USE';
		throw err;
	}
	await withTransaction(db, async () =>
	{
		await run(db, `DELETE FROM ${TABLES.ROLE_PERMISSIONS} WHERE role = ?`, [existing.name]);
		await run(db, `DELETE FROM roles WHERE id = ?`, [existing.id]);
	});
	return true;
}

function withTransaction(db, fn)
{
	return new Promise((resolve, reject) =>
	{
		db.serialize(async () =>
		{
			try
			{
				await run(db, 'BEGIN IMMEDIATE');
				const result = await fn();
				await run(db, 'COMMIT');
				resolve(result);
			} catch (error)
			{
				await run(db, 'ROLLBACK').catch(() => { });
				reject(error);
			}
		});
	});
}

async function markFirstLoginIfNeeded(db, userId, welcomeVersion = 1)
{
	return withTransaction(db, async () =>
	{
		const updated = await run(
			db,
			`UPDATE ${TABLES.USERS}
       SET first_login_at = COALESCE(first_login_at, strftime('%s','now')),
           welcome_version = COALESCE(welcome_version, ?)
       WHERE id = ? AND first_login_at IS NULL`,
			[welcomeVersion, userId]
		);
		const row = await get(db, `SELECT first_login_at, has_seen_welcome, welcome_version FROM ${TABLES.USERS} WHERE id = ?`, [userId]);
		const firstLogin = row && row.first_login_at != null && row.has_seen_welcome === 0 && updated.changes > 0;
		return {
			firstLogin,
			firstLoginAt: row?.first_login_at || null,
			hasSeenWelcome: row?.has_seen_welcome === 1,
			welcomeVersion: row?.welcome_version || 1
		};
	});
}

async function completeWelcome(db, userId)
{
	return withTransaction(db, async () =>
	{
		await run(
			db,
			`UPDATE ${TABLES.USERS} SET has_seen_welcome = 1 WHERE id = ?`,
			[userId]
		);
		const row = await get(db, `SELECT first_login_at, has_seen_welcome, welcome_version FROM ${TABLES.USERS} WHERE id = ?`, [userId]);
		return {
			firstLoginAt: row?.first_login_at || null,
			hasSeenWelcome: row?.has_seen_welcome === 1,
			welcomeVersion: row?.welcome_version || 1
		};
	});
}

function getWelcomeState(db, userId)
{
	return get(db, `SELECT first_login_at AS firstLoginAt, has_seen_welcome AS hasSeenWelcome, welcome_version AS welcomeVersion FROM ${TABLES.USERS} WHERE id = ?`, [userId]).then((row) => ({
		firstLoginAt: row?.firstLoginAt || null,
		hasSeenWelcome: row?.hasSeenWelcome === 1,
		welcomeVersion: row?.welcomeVersion || 1
	}));
}

// --- Role permission helpers ---
function hasRolePermission(db, { organizationId = null, role, permission })
{
	const params = [organizationId, role, permission];
	const sql = `SELECT enabled FROM ${TABLES.ROLE_PERMISSIONS}
               WHERE (organization_id IS NULL OR organization_id = ?)
                 AND role = ? AND permission = ?
               ORDER BY organization_id IS NULL DESC LIMIT 1`;
	return get(db, sql, params).then((row) => Boolean(row && row.enabled === 1));
}

function setRolePermission(db, { organizationId = null, role, permission, enabled })
{
	const id = uuidv4();
	return withTransaction(db, async () =>
	{
		// Upsert by unique key; prefer NULL organization_id as global setting if org not provided
		const whereOrg = organizationId == null ? 'organization_id IS NULL' : 'organization_id = ?';
		const existing = await get(
			db,
			`SELECT id FROM ${TABLES.ROLE_PERMISSIONS} WHERE ${whereOrg} AND role = ? AND permission = ?`,
			organizationId == null ? [role, permission] : [organizationId, role, permission]
		);
		if (existing)
		{
			await run(db, `UPDATE ${TABLES.ROLE_PERMISSIONS} SET enabled = ? WHERE id = ?`, [enabled ? 1 : 0, existing.id]);
			return existing.id;
		}
		await run(
			db,
			`INSERT INTO ${TABLES.ROLE_PERMISSIONS} (id, organization_id, role, permission, enabled)
       VALUES (?, ?, ?, ?, ?)`,
			[id, organizationId, role, permission, enabled ? 1 : 0]
		);
		return id;
	});
}

function listRolePermissions(db, { organizationId = null } = {})
{
	const params = [];
	let where = '';
	if (organizationId != null)
	{
		where = 'WHERE organization_id IS NULL OR organization_id = ?';
		params.push(organizationId);
	}
	return all(
		db,
		`SELECT organization_id AS organizationId, role, permission, enabled FROM ${TABLES.ROLE_PERMISSIONS} ${where}`,
		params
	);
}

async function setCurrentSession(db, userId, tokenExpiresAt)
{
	return run(db, 'INSERT OR REPLACE INTO current_session (id, user_id, token_expires_at) VALUES (1, ?, ?)', [userId, tokenExpiresAt]);
}

function getCurrentSession(db)
{
	return get(db, 'SELECT user_id, token_expires_at FROM current_session WHERE id = 1');
}

module.exports = {
	initDatabase,
	DEFAULT_DB_FILE,
	TABLES,
	ROLES,
	run,
	get,
	all,
	setCurrentSession,
	getCurrentSession
};
