import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Categories({ port }: { port: number | null }) {
  const { apiFetch, user } = useAuth();
  const base = port ? `http://localhost:${port}` : '';

  const [items, setItems] = useState<Array<{ id: string; organizationId: string; name: string; createdAt: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [canManage, setCanManage] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const [listRes, permsRes] = await Promise.all([
          apiFetch(`${base}/api/categories`),
          apiFetch(`${base}/api/admin/roles/${user?.role}/permissions`)
        ]);
        if (!listRes.ok) throw new Error('Failed to load categories');
        const data = await listRes.json();
        if (!cancelled) setItems(data.categories || []);
        if (permsRes.ok) {
          const pdata = await permsRes.json();
          const p = (pdata.permissions || []).find((x: any) => x.permission === 'categories:manage');
          if (!cancelled) setCanManage(Boolean(p?.enabled));
        } else {
          setCanManage(false);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [apiFetch, base, user?.role]);

  async function createCategory() {
    try {
      const name = draft.trim();
      if (!name) return;
      const res = await apiFetch(`${base}/api/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) {
        const msg = (await res.json().catch(() => null))?.error || 'Failed to create';
        throw new Error(msg);
      }
      const data = await res.json();
      setItems((list) => [...list, data.category].sort((a, b) => a.name.localeCompare(b.name)));
      setDraft('');
    } catch (e: any) {
      setError(e.message || 'Error creating');
    }
  }

  async function saveEdit(id: string) {
    try {
      const name = editName.trim();
      if (!name) return;
      const res = await apiFetch(`${base}/api/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) {
        const msg = (await res.json().catch(() => null))?.error || 'Failed to update';
        throw new Error(msg);
      }
      const data = await res.json();
      setItems((list) => list.map((c) => (c.id === id ? data.category : c)).sort((a, b) => a.name.localeCompare(b.name)));
      setEditingId(null);
      setEditName('');
    } catch (e: any) {
      setError(e.message || 'Error updating');
    }
  }

  async function remove(id: string) {
    try {
      const res = await apiFetch(`${base}/api/categories/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const msg = (await res.json().catch(() => null))?.error || 'Failed to delete';
        throw new Error(msg);
      }
      setItems((list) => list.filter((c) => c.id !== id));
    } catch (e: any) {
      setError(e.message || 'Error deleting');
    }
  }

  return (
    <div className="rounded-3xl border border-subtle bg-surface-token p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Categories</h2>
      </div>
      {error && (
        <div className="mb-3 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">{error}</div>
      )}
      {loading ? (
        <div className="text-fg-muted">Loading…</div>
      ) : (
        <>
          {canManage && (
            <div className="mb-4 flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-lg border border-subtle bg-app px-3 py-2 text-sm text-fg"
                placeholder="New category name"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button
                className="rounded-lg bg-primary px-3 py-2 text-sm text-white disabled:opacity-50"
                onClick={createCategory}
                disabled={!draft.trim()}
              >Create</button>
            </div>
          )}
          <ul className="divide-y divide-subtle rounded-lg border border-subtle">
            {items.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 p-3">
                {editingId === c.id ? (
                  <input
                    className="min-w-0 flex-1 rounded-lg border border-subtle bg-app px-3 py-2 text-sm text-fg"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                ) : (
                  <div className="min-w-0 flex-1 truncate">{c.name}</div>
                )}
                {canManage && (
                  <div className="flex gap-2">
                    {editingId === c.id ? (
                      <>
                        <button className="rounded-lg bg-primary px-3 py-2 text-sm text-white" onClick={() => saveEdit(c.id)}>Save</button>
                        <button className="rounded-lg bg-pill px-3 py-2 text-sm" onClick={() => { setEditingId(null); setEditName(''); }}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="rounded-lg bg-pill px-3 py-2 text-sm" onClick={() => { setEditingId(c.id); setEditName(c.name); }}>Edit</button>
                        <button className="rounded-lg bg-danger px-3 py-2 text-sm text-white" onClick={() => remove(c.id)}>Delete</button>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
