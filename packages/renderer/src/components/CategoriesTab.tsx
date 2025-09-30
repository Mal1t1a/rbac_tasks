import { useState, Fragment } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button, Card, Checkbox, Input, SectionHeader } from '../components/UI';
import ConfirmDialog from '../components/ConfirmDialog';
import RoleAccessSelector from '../components/RoleAccessSelector';

export type Category = { id: string; organizationId: string; organizationName?: string; name: string; isSystem?: boolean; createdAt: number };

interface CategoriesTabProps
{
	categories: Category[];
	setCategories: React.Dispatch<React.SetStateAction<Category[]>>;
	loading: boolean;
	error: string | null;
	canCreate: boolean;
	canManage: boolean;
	canConfigureAccess: boolean;
	setError: (v: string | null) => void;
}

export function CategoriesTab({ categories, setCategories, loading, error, canCreate, canManage, canConfigureAccess, setError }: CategoriesTabProps)
{
	const { apiFetch } = useAuth();
	const [draft, setDraft] = useState('');
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editName, setEditName] = useState('');
	const [accessEditingId, setAccessEditingId] = useState<string | null>(null);
	const [accessRolesDraft, setAccessRolesDraft] = useState<Record<string, boolean>>({});
	const systemRoles = ['owner', 'admin', 'viewer'];
	const [showCreate, setShowCreate] = useState(false);
	const [filter, setFilter] = useState('');
	// New access control state: empty array => open access; list of roles (excluding owner) => restricted
	const [createAccessRoles, setCreateAccessRoles] = useState<string[]>([]);
	const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string; isSystem?: boolean } | null>(null);
	const sortCategories = (list: Category[]) =>
	{
		return [...list].sort((a, b) =>
		{
			if (a.isSystem && !b.isSystem) return -1;
			if (!a.isSystem && b.isSystem) return 1;
			return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
		});
	};

	const createCategory = async () =>
	{
		try
		{
			const name = draft.trim();
			if (!name) return;
			const res = await apiFetch(`/api/categories`, { method: 'POST', body: JSON.stringify({ name }) });
			if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Failed to create');
			const data = await res.json();
			setCategories((list) => sortCategories([...list, data.category]));
			// Apply access roles if restricted (non-empty) and canConfigureAccess
			if (canConfigureAccess && createAccessRoles.length > 0)
			{
				await apiFetch(`/api/categories/${data.category.id}/access`, { method: 'PUT', body: JSON.stringify({ roles: createAccessRoles }) }).catch(() => null);
			}
			setDraft('');
			setCreateAccessRoles([]);
			setError(null);
		} catch (e: any)
		{
			setError(e.message || 'Error creating');
		}
	};

	const saveCategoryEdit = async (id: string) =>
	{
		try
		{
			const name = editName.trim();
			if (!name) return;
			const res = await apiFetch(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
			if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Failed to update');
			const data = await res.json();
			setCategories((list) => sortCategories(list.map((c) => (c.id === id ? data.category : c))));
			setEditingId(null);
			setEditName('');
			setError(null);
		} catch (e: any)
		{
			setError(e.message || 'Error updating');
		}
	};

	const confirmDelete = async () =>
	{
		if (!pendingDelete) return;
		if (pendingDelete.isSystem) { setPendingDelete(null); return; }
		try
		{
			const res = await apiFetch(`/api/categories/${pendingDelete.id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Failed to delete');
			setCategories((list) => sortCategories(list.filter((c) => c.id !== pendingDelete.id)));
			setError(null);
		} catch (e: any)
		{
			setError(e.message || 'Error deleting');
		} finally
		{
			setPendingDelete(null);
		}
	};

	const openAccessEditor = async (categoryId: string) =>
	{
		try
		{
			setAccessEditingId(categoryId);
			setAccessRolesDraft({});
			const res = await apiFetch(`/api/categories/${categoryId}/access`);
			if (res.ok)
			{
				const data = await res.json();
				const currentRoles: string[] = data.roles || [];
				const draftMap: Record<string, boolean> = {};
				systemRoles.forEach(r => { draftMap[r] = currentRoles.includes(r); });
				setAccessRolesDraft(draftMap);
			}
		} catch {/* ignore */ }
	};

	const saveAccessRoles = async () =>
	{
		if (!accessEditingId) return;
		const roles = Object.entries(accessRolesDraft).filter(([r, v]) => r !== 'owner' && v).map(([r]) => r);
		try
		{
			const res = await apiFetch(`/api/categories/${accessEditingId}/access`, { method: 'PUT', body: JSON.stringify({ roles }) });
			if (!res.ok) throw new Error(await res.text());
			setAccessEditingId(null);
			setError(null);
		} catch (e: any)
		{
			setError(e.message || 'Failed to save access');
		}
	};

	return (
		<div className="mt-6 space-y-6">
			<Card className="p-4">
				<SectionHeader
					title="Categories"
					actions={canCreate ? (
						<Button
							variant={showCreate ? 'primary' : 'outline'}
							size="sm"
							className="u-press-accent"
							onClick={() => setShowCreate(v => !v)}
						>
							{showCreate ? 'Close' : 'Create Category'}
						</Button>
					) : null}
				/>
				{error && (
					<div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>
				)}
				{!showCreate && (
					<div className="mt-3">
						<Input placeholder="Filter categories…" value={filter} onChange={(e) => setFilter(e.target.value)} />
					</div>
				)}
				{showCreate && canCreate && !loading && (
					<form
						className="mt-4 space-y-4"
						onSubmit={(e) =>
						{
							e.preventDefault();
							createCategory();
							if (!error) setShowCreate(false);
						}}
					>
						<Input
							placeholder="Category name"
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							required
						/>
						{canConfigureAccess && (
							<RoleAccessSelector
								roles={systemRoles}
								value={createAccessRoles}
								onChange={setCreateAccessRoles}
								label="Initial Access"
								descriptionOpen="Category will start visible to all roles."
								descriptionRestricted="Select which roles (besides owner) may view this category. Empty = open."
							/>
						)}
						<div className="flex items-center gap-2">
							<Button type="submit" variant="primary" disabled={!draft.trim()}>Create</Button>
							<Button type="button" variant="pill" onClick={() => { setDraft(''); setShowCreate(false); }}>Cancel</Button>
						</div>
					</form>
				)}
				{loading && <div className="p-3 text-fg-muted">Loading…</div>}
			</Card>

			<Card className="p-0 overflow-hidden">
				<table className="w-full text-sm">
					<thead className="bg-surface">
						<tr>
							<th className="text-left p-3 text-fg-subtle">Name</th>
							<th className="text-left p-3 text-fg-subtle">Actions</th>
						</tr>
					</thead>
					<tbody>
						{sortCategories(categories)
							.filter((c) =>
							{
								const q = filter.trim().toLowerCase();
								if (!q) return true;
								return c.name.toLowerCase().includes(q);
							})
							.map((c) => (
								<Fragment key={c.id}>
									<tr className="border-t border-subtle">
										<td className="p-3 align-middle">
											{editingId === c.id ? (
												<Input value={editName} onChange={(e) => setEditName(e.target.value)} />
											) : (
												<span className="text-fg inline-flex items-center gap-2">{c.name}{Boolean(c.isSystem) && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-pill text-fg-muted border border-subtle">system</span>}</span>
											)}
										</td>
										<td className="p-3 align-middle">
											{canManage ? (
												editingId === c.id ? (
													<div className="flex gap-2">
														<Button size="sm" variant="primary" onClick={() => saveCategoryEdit(c.id)}>Save</Button>
														<Button size="sm" variant="pill" onClick={() => { setEditingId(null); setEditName(''); }}>Cancel</Button>
													</div>
												) : (
													<div className="flex gap-2">
														<Button size="sm" variant="pill" onClick={() => { setEditingId(c.id); setEditName(c.name); }}>Edit</Button>
														<Button size="sm" variant="danger" disabled={c.isSystem} title={c.isSystem ? 'System categories cannot be deleted' : 'Delete category'} onClick={() => !c.isSystem && setPendingDelete({ id: c.id, name: c.name, isSystem: c.isSystem })}>Delete</Button>
														{canConfigureAccess && <Button size="sm" variant={accessEditingId === c.id ? 'primary' : 'pill'} onClick={() => accessEditingId === c.id ? setAccessEditingId(null) : openAccessEditor(c.id)}>{accessEditingId === c.id ? 'Close Access' : 'Access'}</Button>}
													</div>
												)
											) : (
												<span className="text-fg-subtle">No permission</span>
											)}
										</td>
									</tr>
									{accessEditingId === c.id && (
										<tr className="border-t border-subtle bg-surface-token/40" key={c.id + ':access'}>
											<td className="p-3 align-middle" colSpan={2}>
												<RoleAccessSelector
													roles={systemRoles}
													value={Object.entries(accessRolesDraft).filter(([r, v]) => r !== 'owner' && v).map(([r]) => r)}
													onChange={(roles) =>
													{
														// Translate roles array back into accessRolesDraft map (owner always true internally)
														const map: Record<string, boolean> = { owner: true };
														systemRoles.forEach(r => { if (r !== 'owner') map[r] = roles.includes(r); });
														setAccessRolesDraft(map);
													}}
													label="Category Access"
													descriptionOpen="Currently visible to all roles. Switch to Restricted to limit visibility."
													descriptionRestricted="Select roles (besides owner) with visibility. Use Save to apply changes."
													hideModeToggle
												/>
												<div className="flex gap-2 pt-3">
													<Button variant="pill" size="sm" onClick={() => setAccessEditingId(null)}>Cancel</Button>
													<Button variant="primary" size="sm" onClick={saveAccessRoles}>Save</Button>
												</div>
											</td>
										</tr>
									)}
								</Fragment>
							))}
					</tbody>
				</table>
			</Card>
			<ConfirmDialog
				open={Boolean(pendingDelete)}
				title="Delete Category"
				body={pendingDelete ? (
					<span>Are you sure you want to delete the category <strong className="text-fg">{pendingDelete.name}</strong>? This cannot be undone and tasks will lose this category reference.</span>
				) : null}
				confirmLabel="Delete"
				cancelLabel="Cancel"
				destructive
				onConfirm={confirmDelete}
				onCancel={() => setPendingDelete(null)}
			/>
		</div>
	);
}

export default CategoriesTab;
