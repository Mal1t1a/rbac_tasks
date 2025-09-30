import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button, Card, Checkbox, FormRow, Input, SectionHeader, Toggle } from '../components/UI';
import { CategoriesTab } from '../components/CategoriesTab';
import RolesTab from '../components/RolesTab';
import UsersTab from '../components/UsersTab';
import type { Role, RolePermissionsResponse } from '../components/RolesTab';
import type { AdminUser } from '../components/UsersTab';

type Category = { id: string; organizationId: string; organizationName?: string; name: string; isSystem?: boolean; createdAt: number };

export function Admin({ port }: { port: number | null })
{
	const { apiFetch, user } = useAuth();
	const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'categories'>('users');
	const [users, setUsers] = useState<AdminUser[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [roles, setRoles] = useState<Role[]>([]);
	const [permEditorRole, setPermEditorRole] = useState<string | null>(null);
	// Tabs positioning
	const containerRef = useRef<HTMLDivElement | null>(null);
	const usersRef = useRef<HTMLSpanElement | null>(null);
	const rolesRef = useRef<HTMLSpanElement | null>(null);
	const catsRef = useRef<HTMLSpanElement | null>(null);
	const [sliderRect, setSliderRect] = useState<{ left: number; width: number }>({ left: 0, width: 0 });
	const [categories, setCategories] = useState<Category[]>([]);
	const [catLoading, setCatLoading] = useState(false);
	const [catError, setCatError] = useState<string | null>(null);
	const [canManageCategories, setCanManageCategories] = useState<boolean>(false);
	const [canConfigureCategoryAccess, setCanConfigureCategoryAccess] = useState<boolean>(false);
	const [canCreateCategories, setCanCreateCategories] = useState<boolean>(false);
	// Roles permissions
	const [canViewRoles, setCanViewRoles] = useState<boolean>(false);
	const [canCreateRoles, setCanCreateRoles] = useState<boolean>(false);
	const [canUpdateRoles, setCanUpdateRoles] = useState<boolean>(false);
	const [canDeleteRoles, setCanDeleteRoles] = useState<boolean>(false);
	// Users manage capability (UI): reserve to owner/admin
	const canManageUsers = user?.role === 'owner' || user?.role === 'admin';
	// Users create capability (UI): align with manage for now
	const canCreateUsers = canManageUsers;

	useEffect(() =>
	{
		(async () =>
		{
			setLoading(true);
			try
			{
				// Fetch permissions for current role to gate roles tab/actions
				const permsRes = await apiFetch(`/api/admin/roles/${user?.role}/permissions`).catch(() => null);
				if (permsRes && permsRes.ok)
				{
					const pdata = await permsRes.json();
					const find = (k: string) => Boolean((pdata.permissions || []).find((x: any) => x.permission === k)?.enabled);
					setCanViewRoles(user?.role === 'owner' ? true : find('roles:view'));
					setCanCreateRoles(user?.role === 'owner' ? true : find('roles:create'));
					setCanUpdateRoles(user?.role === 'owner' ? true : find('roles:update'));
					setCanDeleteRoles(user?.role === 'owner' ? true : find('roles:delete'));
				} else
				{
					// Fallback (conservative): hide roles for non-owners if fetch fails
					const isOwner = user?.role === 'owner';
					setCanViewRoles(!!isOwner);
					setCanCreateRoles(!!isOwner);
					setCanUpdateRoles(!!isOwner);
					setCanDeleteRoles(!!isOwner);
				}

				const [uRes, rRes] = await Promise.all([
					apiFetch(`/api/admin/users`),
					canViewRoles ? apiFetch(`/api/admin/roles`) : Promise.resolve({ ok: false, json: async () => ({ roles: [] }) } as any)
				]);
				if (uRes.ok)
				{
					const data = (await uRes.json()) as { users: AdminUser[] };
					setUsers(data.users || []);
				} else
				{
					setError(await uRes.text());
				}
				if (rRes.ok)
				{
					const data = (await rRes.json()) as { roles: Role[] };
					setRoles(data.roles || []);
				}
			} catch (err)
			{
				setError((err as Error).message);
			} finally
			{
				setLoading(false);
			}
		})();
	}, [apiFetch, user?.role, canViewRoles]);

	// Categories: load list and permission
	useEffect(() =>
	{
		let ignore = false;
		(async () =>
		{
			try
			{
				setCatLoading(true);
				setCatError(null);
				// Load categories
				const res = await apiFetch(`/api/categories`);
				if (res.ok)
				{
					const data = await res.json();
					if (!ignore) setCategories((data.categories || []) as Category[]);
				} else
				{
					if (!ignore) setCatError(await res.text());
				}
				// Check permission catalog for categories permissions
				const permsRes = await apiFetch(`/api/admin/roles/${user?.role}/permissions`).catch(() => null);
				if (permsRes && permsRes.ok)
				{
					const pdata = await permsRes.json();
					const manage = (pdata.permissions || []).find((x: any) => x.permission === 'categories:manage' || x.permission === 'categories:update' || x.permission === 'categories:delete');
					const create = (pdata.permissions || []).find((x: any) => x.permission === 'categories:create' || x.permission === 'categories:manage');
					const configure = (pdata.permissions || []).find((x: any) => x.permission === 'categories:access:configure');
					if (!ignore)
					{
						setCanManageCategories(Boolean(manage?.enabled));
						setCanCreateCategories(Boolean(create?.enabled));
						setCanConfigureCategoryAccess(Boolean(configure?.enabled));
					}
				} else
				{
					if (!ignore)
					{
						setCanManageCategories(user?.role === 'owner' || user?.role === 'admin');
						setCanCreateCategories(user?.role === 'owner' || user?.role === 'admin');
						setCanConfigureCategoryAccess(user?.role === 'owner');
					}
				}
			} catch (e: any)
			{
				if (!ignore) setCatError(e.message || 'Failed to load categories');
			} finally
			{
				if (!ignore) setCatLoading(false);
			}
		})();
		return () => { ignore = true; };
	}, [apiFetch, user?.role]);


	// Measure tab positions and update slider
	useLayoutEffect(() =>
	{
		const measure = () =>
		{
			const map: Record<'users' | 'roles' | 'categories', React.RefObject<HTMLSpanElement>> = {
				users: usersRef,
				roles: rolesRef,
				categories: catsRef
			};
			const el = map[activeTab]?.current;
			const container = containerRef.current;
			if (el && container)
			{
				const rawLeft = (el as HTMLElement).offsetLeft;
				const width = (el as HTMLElement).offsetWidth;
				const containerWidth = (container as HTMLElement).clientWidth;
				const left = Math.max(0, Math.min(rawLeft, containerWidth - width));
				setSliderRect({ left: Math.round(left), width: Math.round(width) });
			}
		};
		// Measure now and on next frame to avoid layout jank
		measure();
		const id = requestAnimationFrame(measure);
		const onResize = () => measure();
		window.addEventListener('resize', onResize);
		return () =>
		{
			cancelAnimationFrame(id);
			window.removeEventListener('resize', onResize);
		};
	}, [activeTab, users.length, roles.length]);

	const onCreate = async (payload: Partial<AdminUser> & { password?: string }) =>
	{
		setError(null);
		const res = await apiFetch(`/api/admin/users`, {
			method: 'POST',
			body: JSON.stringify({
				email: payload.email,
				name: payload.name,
				role: payload.role || 'viewer',
				password: payload['password'] || 'ChangeMe123!',
				organizationId: payload.organizationId || user?.organizationId
			})
		});
		if (!res.ok) throw new Error(await res.text());
		const data = (await res.json()) as { user: AdminUser };
		setUsers((prev) => [...prev, data.user]);
	};

	const onUpdate = async (id: string, patch: Partial<AdminUser> & { password?: string }) =>
	{
		setError(null);
		const res = await apiFetch(`/api/admin/users/${id}`, {
			method: 'PUT',
			body: JSON.stringify(patch)
		});
		if (!res.ok) throw new Error(await res.text());
		const data = (await res.json()) as { user: AdminUser };
		setUsers((prev) => prev.map((u) => (u.id === id ? data.user : u)));
	};

	const onDelete = async (id: string) =>
	{
		const res = await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
		if (!res.ok) throw new Error(await res.text());
		setUsers((prev) => prev.filter((u) => u.id !== id));
	};

	// Admin UI Access (for admin role) API helpers
	const fetchAdminAccess = async (): Promise<{ enabled: boolean }> =>
	{
		const res = await apiFetch(`/api/admin/permissions/admin-access`);
		if (!res.ok) throw new Error(await res.text());
		return res.json();
	};

	const setAdminAccess = async (enabled: boolean): Promise<{ enabled: boolean }> =>
	{
		const res = await apiFetch(`/api/admin/permissions/admin-access`, {
			method: 'PUT',
			body: JSON.stringify({ enabled })
		});
		if (!res.ok) throw new Error(await res.text());
		return res.json();
	};

	// Roles CRUD (owner only for mutations)
	const createRole = async (payload: { name: string; description?: string; permissions?: string[] }) =>
	{
		setError(null);
		const res = await apiFetch(`/api/admin/roles`, {
			method: 'POST',
			body: JSON.stringify({ name: payload.name, description: payload.description })
		});
		if (!res.ok) throw new Error(await res.text());
		const data = (await res.json()) as { role: Role };
		setRoles((prev) => [...prev, data.role].sort((a, b) => Number(b.isSystem) - Number(a.isSystem) || a.name.localeCompare(b.name)));
		// Set initial permissions if provided
		if (payload.permissions && payload.permissions.length > 0)
		{
			for (const perm of payload.permissions)
			{
				await setRolePermission(data.role.name, perm, true);
			}
		}
	};

	const updateRole = async (name: string, patch: { name?: string; description?: string }) =>
	{
		setError(null);
		const res = await apiFetch(`/api/admin/roles/${encodeURIComponent(name)}`, {
			method: 'PUT',
			body: JSON.stringify(patch)
		});
		if (!res.ok) throw new Error(await res.text());
		const data = (await res.json()) as { role: Role };
		setRoles((prev) => prev.map((r) => (r.id === data.role.id ? data.role : r)).sort((a, b) => Number(b.isSystem) - Number(a.isSystem) || a.name.localeCompare(b.name)));
	};

	const deleteRole = async (name: string) =>
	{
		if (!confirm('Delete this role? Users assigned to it must be reassigned first.')) return;
		const res = await apiFetch(`/api/admin/roles/${encodeURIComponent(name)}`, { method: 'DELETE' });
		if (!res.ok) throw new Error(await res.text());
		setRoles((prev) => prev.filter((r) => r.name !== name));
	};

	const fetchRolePermissions = async (name: string): Promise<RolePermissionsResponse> =>
	{
		const res = await apiFetch(`/api/admin/roles/${encodeURIComponent(name)}/permissions`);
		if (!res.ok) throw new Error(await res.text());
		return res.json();
	};

	const setRolePermission = async (name: string, permission: string, enabled: boolean): Promise<{ role: string; permission: string; enabled: boolean }> =>
	{
		const res = await apiFetch(`/api/admin/roles/${encodeURIComponent(name)}/permissions/${encodeURIComponent(permission)}`, {
			method: 'PUT',
			body: JSON.stringify({ enabled })
		});
		if (!res.ok) throw new Error(await res.text());
		return res.json();
	};

	return (
		<section className="bg-surface-token rounded-3xl p-6 border border-subtle backdrop-blur">
			<SectionHeader
				title="Admin"
				actions={
					<div ref={containerRef} className="relative inline-flex rounded-full bg-pill p-1 items-stretch gap-2">
						<div
							className="u-tabs-chip-slider shadow-glow"
							style={{ left: `${sliderRect.left - (activeTab === 'users' ? 0 : 1)}px`, width: `${sliderRect.width}px`, transform: 'none' }}
							aria-hidden
						/>
						<span ref={usersRef} className="relative">
							<Button
								size="sm"
								className={[
									'relative z-10 flex-1 bg-transparent hover:bg-transparent u-tabs-chip-btn',
									activeTab === 'users' ? 'u-tabs-chip-btn--active' : ''
								].join(' ')}
								aria-selected={activeTab === 'users'}
								onClick={() => setActiveTab('users')}
							>
								Users
							</Button>
						</span>
						{canViewRoles && (
							<span ref={rolesRef} className="relative">
								<Button
									size="sm"
									className={[
										'relative z-10 flex-1 bg-transparent hover:bg-transparent u-tabs-chip-btn',
										activeTab === 'roles' ? 'u-tabs-chip-btn--active' : ''
									].join(' ')}
									aria-selected={activeTab === 'roles'}
									onClick={() => setActiveTab('roles')}
								>
									Roles
								</Button>
							</span>
						)}
						<span ref={catsRef} className="relative">
							<Button
								size="sm"
								className={[
									'relative z-10 flex-1 bg-transparent hover:bg-transparent u-tabs-chip-btn',
									activeTab === 'categories' ? 'u-tabs-chip-btn--active' : ''
								].join(' ')}
								aria-selected={activeTab === 'categories'}
								onClick={() => setActiveTab('categories')}
							>
								Categories
							</Button>
						</span>
					</div>
				}
			/>
			{error && <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}
			{activeTab === 'users' && (
				<UsersTab
					users={users}
					rolesCatalog={roles}
					canManage={canManageUsers}
					canCreate={canCreateUsers}
					onCreate={onCreate}
					onUpdate={onUpdate}
					onDelete={onDelete}
					loading={loading}
				/>
			)}
			{activeTab === 'roles' && (
				<RolesTab
					roles={roles}
					canEdit={user?.role === 'owner' || canUpdateRoles || canCreateRoles || canDeleteRoles}
					canCreate={canCreateRoles || user?.role === 'owner'}
					canUpdate={canUpdateRoles || user?.role === 'owner'}
					canDelete={canDeleteRoles || user?.role === 'owner'}
					isOwnerActor={user?.role === 'owner'}
					onCreate={createRole}
					onUpdate={updateRole}
					onDelete={deleteRole}
					onOpenPermissions={(name: string) => setPermEditorRole(name)}
					permissionsApi={{ fetchRolePermissions, setRolePermission, fetchAdminAccess, setAdminAccess }}
					activePermRole={permEditorRole}
					onClosePermissions={() => setPermEditorRole(null)}
				/>
			)}
			{activeTab === 'categories' && (
				<CategoriesTab
					categories={categories}
					setCategories={setCategories}
					loading={catLoading}
					error={catError}
					canCreate={canCreateCategories}
					canManage={canManageCategories}
					canConfigureAccess={canConfigureCategoryAccess}
					setError={setCatError}
				/>
			)}
		</section>
	);
}

export default Admin;

