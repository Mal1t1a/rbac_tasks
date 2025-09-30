import { useEffect, useState, Fragment } from 'react';
import { Button, Card, FormRow, Input, SectionHeader, Checkbox } from './UI';

export type Role = {
	id: string;
	name: string; // lowercase key
	description?: string | null;
	isSystem: boolean;
	createdAt?: number;
};

export type RolePermissionsResponse = {
	role: string;
	permissions: { permission: string; enabled: boolean }[];
	catalog: string[];
	scope?: 'global' | 'org';
};

function RolesTab({ roles, canEdit, canCreate, canUpdate, canDelete, isOwnerActor, onCreate, onUpdate, onDelete, onOpenPermissions, permissionsApi, activePermRole, onClosePermissions }: {
	roles: Role[];
	canEdit?: boolean;
	canCreate?: boolean;
	canUpdate?: boolean;
	canDelete?: boolean;
	isOwnerActor?: boolean;
	onCreate: (p: { name: string; description?: string; permissions?: string[] }) => Promise<void>;
	onUpdate: (name: string, p: { name?: string; description?: string }) => Promise<void>;
	onDelete: (name: string) => Promise<void>;
	onOpenPermissions: (name: string) => void;
	permissionsApi: {
		fetchRolePermissions: (name: string) => Promise<RolePermissionsResponse>;
		setRolePermission: (name: string, permission: string, enabled: boolean) => Promise<{ role: string; permission: string; enabled: boolean }>;
		fetchAdminAccess: () => Promise<{ enabled: boolean }>;
		setAdminAccess: (enabled: boolean) => Promise<{ enabled: boolean }>;
	};
	activePermRole: string | null;
	onClosePermissions: () => void;
})
{
	const [showCreate, setShowCreate] = useState(false);
	const [form, setForm] = useState({ name: '', description: '' });
	const [filter, setFilter] = useState('');
	const filtered = roles.filter((r) => r.name.includes(filter.toLowerCase()));
	const [permData, setPermData] = useState<RolePermissionsResponse | null>(null);
	const [permLoading, setPermLoading] = useState(false);
	const [permError, setPermError] = useState<string | null>(null);
	const [permSaving, setPermSaving] = useState<Record<string, boolean>>({});
	const [adminAccessEnabled, setAdminAccessEnabled] = useState<boolean | null>(null);
	const [adminAccessSaving, setAdminAccessSaving] = useState(false);
	const [adminAccessError, setAdminAccessError] = useState<string | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
	const [deleteSaving, setDeleteSaving] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [animating, setAnimating] = useState(false);
	const [createCatalog, setCreateCatalog] = useState<string[] | null>(null);
	const [createCatalogLoading, setCreateCatalogLoading] = useState(false);
	const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());

	useEffect(() =>
	{
		if (activePermRole)
		{
			setAnimating(true);
		} else
		{
			setAnimating(false);
		}
	}, [activePermRole]);

	useEffect(() =>
	{
		let ignore = false;
		if (activePermRole)
		{
			setPermLoading(true);
			setPermError(null);
			permissionsApi
				.fetchRolePermissions(activePermRole)
				.then((data) => { if (!ignore) setPermData(data); })
				.catch((err) => { if (!ignore) setPermError((err as Error).message); })
				.finally(() => { if (!ignore) setPermLoading(false); });

			if (activePermRole === 'admin')
			{
				setAdminAccessError(null);
				permissionsApi
					.fetchAdminAccess()
					.then((data) => { if (!ignore) setAdminAccessEnabled(Boolean(data.enabled)); })
					.catch((err) => { if (!ignore) setAdminAccessError((err as Error).message); });
			} else
			{
				setAdminAccessEnabled(null);
				setAdminAccessError(null);
			}
		} else
		{
			setPermData(null);
			setPermLoading(false);
			setPermError(null);
			setPermSaving({});
			setAdminAccessEnabled(null);
			setAdminAccessError(null);
		}
		return () => { ignore = true; };
	}, [activePermRole, permissionsApi]);

	useEffect(() =>
	{
		if (showCreate && !createCatalog && !createCatalogLoading)
		{
			setCreateCatalogLoading(true);
			permissionsApi
				.fetchRolePermissions('admin')
				.then((data) =>
				{
					setCreateCatalog(data.catalog || []);
				})
				.catch((err) =>
				{
					console.error('Failed to fetch permissions catalog', err);
				})
				.finally(() =>
				{
					setCreateCatalogLoading(false);
				});
		}
	}, [showCreate, createCatalog, createCatalogLoading, permissionsApi]);

	useEffect(() =>
	{
		if (showCreate)
		{
			setSelectedPermissions(new Set());
		}
	}, [showCreate]);

	const togglePermission = async (permission: string, enabled: boolean) =>
	{
		if (!activePermRole) return;
		setPermSaving((s) => ({ ...s, [permission]: true }));
		try
		{
			await permissionsApi.setRolePermission(activePermRole, permission, enabled);
			setPermData((d) =>
				d ? { ...d, permissions: d.permissions.map((p) => (p.permission === permission ? { ...p, enabled } : p)) } : d
			);
		} catch (err)
		{
			setPermError((err as Error).message);
		} finally
		{
			setPermSaving((s) => ({ ...s, [permission]: false }));
		}
	};
	return (
		<div className="mt-6 space-y-6">
			<Card className="p-4">
				<SectionHeader
					title="Roles"
					actions={canCreate ? (
						<Button
							variant={showCreate ? 'primary' : 'outline'}
							size="sm"
							className="u-press-accent"
							onClick={() => setShowCreate((v) => !v)}
						>
							{showCreate ? 'Close' : 'Create Role'}
						</Button>
					) : null}
				/>
				{!showCreate && (
					<div className="mt-3">
						<Input placeholder="Filter roles…" value={filter} onChange={(e) => setFilter(e.target.value)} />
					</div>
				)}
				{showCreate && canCreate && (
					<form
						className="mt-4 space-y-4"
						onSubmit={(e) =>
						{
							e.preventDefault();
							const name = form.name.trim().toLowerCase();
							if (!name) return;
							const permissions = Array.from(selectedPermissions);
							onCreate({ name, description: form.description || undefined, permissions }).then(() => { setForm({ name: '', description: '' }); setSelectedPermissions(new Set()); setShowCreate(false); });
						}}
					>
						<FormRow>
							<Input label="Name" placeholder="e.g. editor" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
							<Input label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
						</FormRow>
						{createCatalogLoading && <div className="text-fg-muted">Loading permissions…</div>}
						{createCatalog && createCatalog.length > 0 && (
							<div className="space-y-2">
								<SectionHeader
									title="Permissions"
									actions={
										<div className="flex gap-2">
											<Button
												variant="pill"
												size="sm"
												type="button"
												onClick={() => setSelectedPermissions(new Set(createCatalog))}
											>
												Enable All
											</Button>
											<Button
												variant="pill"
												size="sm"
												type="button"
												onClick={() => setSelectedPermissions(new Set())}
											>
												Disable All
											</Button>
										</div>
									}
								/>
								<div className="max-h-48 overflow-y-auto space-y-2">
									{createCatalog.map((perm) => (
										<div key={perm} className="flex items-center justify-between rounded-xl border border-subtle p-3">
											<div>
												<div className="font-medium text-fg">{perm}</div>
												<div className="text-xs text-fg-muted">Global scope</div>
											</div>
											<Button
												size="sm"
												type="button"
												variant={selectedPermissions.has(perm) ? 'primary' : 'pill'}
												onClick={() =>
												{
													setSelectedPermissions((prev) =>
													{
														const newSet = new Set(prev);
														if (newSet.has(perm))
														{
															newSet.delete(perm);
														} else
														{
															newSet.add(perm);
														}
														return newSet;
													});
												}}
											>
												{selectedPermissions.has(perm) ? 'Enabled' : 'Disabled'}
											</Button>
										</div>
									))}
								</div>
							</div>
						)}
						<div className="flex items-center gap-2">
							<Button type="submit" variant="primary" disabled={!(canEdit && canCreate)}>Create</Button>
							<Button type="button" variant="pill" onClick={() => { setForm({ name: '', description: '' }); setSelectedPermissions(new Set()); setShowCreate(false); }}>Cancel</Button>
						</div>
					</form>
				)}
			</Card>

			<Card className="p-0 overflow-hidden">
				<table className="w-full text-sm">
					<thead className="bg-surface">
						<tr>
							<th className="text-left p-3 text-fg-subtle">Name</th>
							<th className="text-left p-3 text-fg-subtle">Description</th>
							<th className="text-left p-3 text-fg-subtle">Type</th>
							<th className="text-left p-3 text-fg-subtle">Actions</th>
						</tr>
					</thead>
					<tbody>
						{filtered.map((r) => (
							<Fragment key={r.id}>
								<RoleRow
									key={r.id}
									role={r}
									canEdit={!!canEdit}
									canUpdate={!!canUpdate}
									canDelete={!!canDelete}
									onUpdate={onUpdate}
									onRequestDelete={(name) => setDeleteTarget(name)}
									onOpenPermissions={onOpenPermissions}
								/>
								{activePermRole === r.name && (
									<tr key={`perm-${r.id}`}>
										<td colSpan={4} className="p-0">
											<Card className={`mt-6 pt-4 m-4 rounded-none border-0 border-t border-subtle transition-opacity duration-300 ease-in-out ${animating ? 'opacity-100' : 'opacity-0'}`}>
												<SectionHeader
													title={`Permissions: ${activePermRole}`}
													actions={<Button variant="pill" size="sm" onClick={onClosePermissions}>Close</Button>}
												/>
												{permError && <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{permError}</div>}
												{adminAccessError && <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{adminAccessError}</div>}
												{permLoading && <div className="p-3 text-fg-muted">Loading permissions…</div>}
												{!permLoading && permData && (
													<div className="mt-4 space-y-2">
														{activePermRole === 'owner' && (
															<div className="flex items-center gap-2 rounded-xl border border-subtle bg-pill p-3">
																<div className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
																<div className="text-xs text-fg-muted">Owner permissions are locked and always enabled.</div>
															</div>
														)}
														{activePermRole === 'admin' && adminAccessEnabled !== null && (
															<div className="flex items-center justify-between rounded-xl border border-subtle p-3">
																<div>
																	<div className="font-medium text-fg">Admin UI Access</div>
																	<div className="text-xs text-fg-muted">Controls whether the <code>admin</code> role can access the Admin area.</div>
																</div>
																<Button
																	size="sm"
																	variant={adminAccessEnabled ? 'primary' : 'pill'}
																	disabled={!isOwnerActor || adminAccessSaving}
																	onClick={async () =>
																	{
																		try
																		{
																			setAdminAccessSaving(true);
																			const next = !adminAccessEnabled;
																			const res = await permissionsApi.setAdminAccess(next);
																			setAdminAccessEnabled(Boolean(res.enabled));
																		} catch (err)
																		{
																			setAdminAccessError((err as Error).message);
																		} finally
																		{
																			setAdminAccessSaving(false);
																		}
																	}}
																>
																	{adminAccessSaving ? 'Saving…' : adminAccessEnabled ? 'Enabled' : 'Disabled'}
																</Button>
															</div>
														)}
														{(permData.catalog || []).filter((perm) =>
														{
															// Hide the dedicated admin:access entry from the general list when admin role panel is shown
															if (activePermRole === 'admin' && perm === 'admin:access') return false;
															return true;
														}).map((perm) =>
														{
															const current = permData.permissions.find((p) => p.permission === perm);
															const roleName = activePermRole;
															const isOwner = roleName === 'owner';
															const isAdmin = roleName === 'admin';
															const effectiveEnabled = isOwner ? true : (isAdmin ? (current ? current.enabled : true) : (current ? current.enabled : false));
															const saving = !!permSaving[perm];
															return (
																<div key={perm} className="flex items-center justify-between rounded-xl border border-subtle p-3">
																	<div>
																		<div className="font-medium text-fg">{perm}</div>
																		<div className="text-xs text-fg-muted">Global scope</div>
																	</div>
																	<Button
																		size="sm"
																		variant={effectiveEnabled ? 'primary' : 'pill'}
																		disabled={!isOwnerActor || saving || isOwner}
																		onClick={() =>
																		{
																			if (isOwner || !isOwnerActor) return; // Only owner actor may change
																			togglePermission(perm, !effectiveEnabled);
																		}}
																	>
																		{saving ? 'Saving…' : effectiveEnabled ? 'Enabled' : 'Disabled'}
																	</Button>
																</div>
															);
														})}
													</div>
												)}
											</Card>
										</td>
									</tr>
								)}
							</Fragment>
						))}
					</tbody>
				</table>
				{roles.length === 0 && <div className="p-4 text-fg-muted">No roles yet.</div>}
			</Card>

			{deleteTarget && (
				<div className="fixed inset-0 z-50 flex items-center justify-center">
					<div className="absolute inset-0 bg-black/60" onClick={() => (!deleteSaving ? setDeleteTarget(null) : null)} />
					<div className="relative z-10 w-full max-w-md rounded-2xl border border-subtle bg-surface-token p-6 shadow-xl">
						<div className="text-lg font-semibold text-fg">Delete role</div>
						<div className="mt-2 text-sm text-fg-muted">
							Are you sure you want to delete the role <span className="font-mono text-fg">{deleteTarget}</span>? Users assigned to it must be reassigned first. This action cannot be undone.
						</div>
						{deleteError && (
							<div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{deleteError}</div>
						)}
						<div className="mt-5 flex justify-end gap-2">
							<Button variant="pill" onClick={() => setDeleteTarget(null)} disabled={deleteSaving}>Cancel</Button>
							<Button
								variant="danger"
								onClick={async () =>
								{
									if (!deleteTarget) return;
									setDeleteError(null);
									setDeleteSaving(true);
									try
									{
										await onDelete(deleteTarget);
										setDeleteTarget(null);
									} catch (err)
									{
										setDeleteError((err as Error).message);
									} finally
									{
										setDeleteSaving(false);
									}
								}}
							>
								{deleteSaving ? 'Deleting…' : 'Delete'}
							</Button>
						</div>
					</div>
				</div>
			)}


		</div>
	);
}

function RoleRow({ role, canEdit, canUpdate, canDelete, onUpdate, onRequestDelete, onOpenPermissions }: { role: Role; canEdit: boolean; canUpdate?: boolean; canDelete?: boolean; onUpdate: (name: string, p: { name?: string; description?: string }) => Promise<void>; onRequestDelete: (name: string) => void; onOpenPermissions: (name: string) => void; })
{
	const [editing, setEditing] = useState(false);
	const [local, setLocal] = useState({ name: role.name, description: role.description || '' });
	return (
		<tr className="border-t border-subtle">
			<td className="p-3 align-middle">
				{editing ? (
					<Input value={local.name} onChange={(e) => setLocal((l) => ({ ...l, name: e.target.value }))} />
				) : (
					<span className="text-fg">{role.name}</span>
				)}
			</td>
			<td className="p-3 align-middle">
				{editing ? (
					<Input value={local.description} onChange={(e) => setLocal((l) => ({ ...l, description: e.target.value }))} />
				) : (
					<span className="text-fg">{role.description || '—'}</span>
				)}
			</td>
			<td className="p-3 align-middle">
				<span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${Boolean((role as any).isSystem) ? 'bg-pill text-fg-muted' : 'bg-emerald-500/10 text-emerald-300'}`}>
					{Boolean((role as any).isSystem) ? 'system' : 'custom'}
				</span>
			</td>
			<td className="p-3 align-middle">
				{canEdit ? (
					editing ? (
						<div className="flex gap-2">
							<Button variant="primary" size="sm" disabled={!(canEdit && (canUpdate ?? true))} onClick={() => { onUpdate(role.name, { name: local.name.trim().toLowerCase(), description: local.description }).then(() => setEditing(false)); }}>Save</Button>
							<Button variant="pill" size="sm" onClick={() => { setLocal({ name: role.name, description: role.description || '' }); setEditing(false); }}>Cancel</Button>
						</div>
					) : (
						<div className="flex gap-2">
							<Button variant="pill" size="sm" disabled={!(canEdit && (canUpdate ?? true))} onClick={() => setEditing(true)}>Edit</Button>
							<Button variant="danger" size="sm" disabled={!(canEdit && (canDelete ?? false)) || Boolean((role as any).isSystem)} onClick={() => onRequestDelete(role.name)}>Delete</Button>
							<Button variant="pill" size="sm" onClick={() => onOpenPermissions(role.name)}>Permissions</Button>
						</div>
					)
				) : (
					<span className="text-fg-subtle">No permission</span>
				)}
			</td>
		</tr>
	);
}

export default RolesTab;