import { useState } from 'react';
import { HiRefresh, HiEye, HiEyeOff } from 'react-icons/hi';
import { Button, Card, FormRow, Input, SectionHeader, Toggle } from './UI';
import Portal from './Portal';
import Dropdown from './Dropdown';
import type { Role } from './RolesTab';

export type AdminUser = {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'viewer';
  isActive: boolean;
};

function UsersTab({ users, rolesCatalog, canManage, canCreate, onCreate, onUpdate, onDelete, loading }: { users: AdminUser[]; rolesCatalog: Role[]; canManage: boolean; canCreate: boolean; onCreate: (p: any) => Promise<void>; onUpdate: (id: string, p: any) => Promise<void>; onDelete: (id: string) => Promise<void>; loading: boolean; }) {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', role: 'viewer', password: '' });
  const [showTempPwd, setShowTempPwd] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const generatePseudoPassword = () => {
    // Simple readable pseudo password: consonant-vowel pairs + number + symbol
    const consonants = 'bcdfghjkmnpqrstvwxyz';
    const vowels = 'aeiou';
    const pairs = Array.from({ length: 3 }, () =>
      consonants[Math.floor(Math.random() * consonants.length)] + vowels[Math.floor(Math.random() * vowels.length)]
    ).join('');
    const tail = Math.floor(100 + Math.random() * 900); // 3-digit number
    const symbols = '!@#$%';
    const sym = symbols[Math.floor(Math.random() * symbols.length)];
    const candidate = pairs + tail + sym;
    setForm((f) => ({ ...f, password: candidate }));
  };
  const reset = () => setForm({ email: '', name: '', role: 'viewer', password: '' });
  const roleOptions = [
    // Always include system roles first
    { label: 'viewer', value: 'viewer' },
    { label: 'admin', value: 'admin' },
    { label: 'owner', value: 'owner' },
    // Then append custom roles from catalog (exclude duplicates)
    ...rolesCatalog
      .filter((r) => !r.isSystem)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => ({ label: r.name, value: r.name }))
      .filter((opt, idx, arr) => arr.findIndex((o) => o.value === opt.value) === idx)
  ];
  return (
    <div className="mt-6 space-y-6">
      <Card className="p-4">
        <SectionHeader
          title="Users"
          actions={canCreate ? (
            <Button
              variant={showCreate ? 'primary' : 'outline'}
              size="sm"
              className="u-press-accent"
              onClick={() => setShowCreate((v) => !v)}
            >
              {showCreate ? 'Close' : 'Create User'}
            </Button>
          ) : null}
        />
        {!showCreate && (
        <div className="mt-3">
          <Input placeholder="Filter users…" value={filter} onChange={(e)=>setFilter(e.target.value)} />
        </div>
        )}
        {showCreate && canCreate && (
          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              onCreate(form).then(() => { reset(); setShowCreate(false); });
            }}
          >
            <FormRow>
              <Input label="Email" type="email" required value={form.email} onChange={(e)=>setForm((f)=>({ ...f, email: e.target.value }))} />
              <Input label="Name" required value={form.name} onChange={(e)=>setForm((f)=>({ ...f, name: e.target.value }))} />
            </FormRow>
            <FormRow>
              <div className="flex flex-col gap-1 text-sm">
                <span className="form-label">Role</span>
                <Dropdown
                  value={form.role}
                  onChange={(v)=>setForm((f)=>({ ...f, role: v }))}
                  options={roleOptions}
                  className="w-full"
                  ariaLabel="Role"
                />
              </div>
              <label className="flex flex-col gap-1 text-sm">
                <span className="form-label flex items-center gap-2">
                  Temporary Password
                  <span className="text-fg-subtle text-[10px] font-normal">(optional)</span>
                </span>
                <div className="relative">
                  <input
                    type={showTempPwd ? 'text' : 'password'}
                    placeholder="ChangeMe123!"
                    value={form.password}
                    onChange={(e)=>setForm((f)=>({ ...f, password: e.target.value }))}
                    className="w-full rounded-xl border border-subtle bg-surface-token text-fg placeholder:text-fg-muted px-3 py-2 pr-28 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    aria-describedby="temp-pwd-actions"
                  />
                  <div id="temp-pwd-actions" className="absolute inset-y-0 right-2 flex items-center gap-1">
                    <button
                      type="button"
                      className="h-7 w-8 inline-flex items-center justify-center rounded-lg bg-pill text-fg hover-bg-pill focus:outline-none focus:ring-2 focus:ring-primary/40"
                      onClick={generatePseudoPassword}
                      title="Generate password"
                      aria-label="Generate password"
                    >
                      <HiRefresh className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="h-7 w-9 inline-flex items-center justify-center rounded-lg bg-pill text-fg hover-bg-pill focus:outline-none focus:ring-2 focus:ring-primary/40"
                      onClick={()=>setShowTempPwd((v)=>!v)}
                      title={showTempPwd ? 'Hide password' : 'Show password'}
                      aria-pressed={showTempPwd}
                      aria-label={showTempPwd ? 'Hide password' : 'Show password'}
                    >
                      {showTempPwd ? <HiEyeOff className="w-4 h-4" aria-hidden="true" /> : <HiEye className="w-4 h-4" aria-hidden="true" />}
                    </button>
                  </div>
                </div>
              </label>
            </FormRow>
            <div className="flex items-center gap-2">
              <Button type="submit" variant="primary">Create</Button>
              <Button type="button" variant="pill" onClick={() => { reset(); setShowCreate(false); }}>Cancel</Button>
            </div>
          </form>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface">
            <tr>
              <th className="text-left p-3 text-fg-subtle">Email</th>
              <th className="text-left p-3 text-fg-subtle">Name</th>
              <th className="text-left p-3 text-fg-subtle">Role</th>
              <th className="text-left p-3 text-fg-subtle">Active</th>
              <th className="text-left p-3 text-fg-subtle">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users
              .filter((u)=>{
                const q = filter.trim().toLowerCase();
                if (!q) return true;
                return (
                  u.email.toLowerCase().includes(q) ||
                  u.name.toLowerCase().includes(q) ||
                  u.role.toLowerCase().includes(q)
                );
              })
              .map((u) => (
              <UserRow key={u.id} user={u} roleOptions={roleOptions} canManage={canManage} onUpdate={onUpdate} onRequestDelete={(user)=>{ setPendingDelete(user); setDeleteError(null); }} />
            ))}
          </tbody>
        </table>
        {loading && <div className="p-4 text-fg-muted">Loading…</div>}
      </Card>
      {pendingDelete && (
        <DeleteUserModal
          user={pendingDelete}
          error={deleteError}
          loading={deleteLoading}
          onCancel={()=>{ if (!deleteLoading) { setPendingDelete(null); setDeleteError(null);} }}
          onConfirm={async ()=>{
            try {
              setDeleteLoading(true);
              setDeleteError(null);
              await onDelete(pendingDelete.id);
              setPendingDelete(null);
            } catch (e:any) {
              setDeleteError(e.message || 'Failed to delete user');
            } finally {
              setDeleteLoading(false);
            }
          }}
        />
      )}
    </div>
  );
}

function UserRow({ user, roleOptions, canManage, onUpdate, onRequestDelete }: { user: AdminUser; roleOptions: { label: string; value: string }[]; canManage: boolean; onUpdate: (id: string, p: any) => Promise<void>; onRequestDelete: (user: AdminUser) => void }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState({ email: user.email, name: user.name, role: user.role, isActive: user.isActive });
  return (
    <tr className="border-t border-subtle">
      <td className="p-3 align-middle">
        {editing ? (
          <Input type="email" value={local.email} onChange={(e)=>setLocal((l)=>({ ...l, email: e.target.value }))} />
        ) : (
          <span className="text-fg">{user.email}</span>
        )}
      </td>
      <td className="p-3 align-middle">
        {editing ? (
          <Input value={local.name} onChange={(e)=>setLocal((l)=>({ ...l, name: e.target.value }))} />
        ) : (
          <span className="text-fg">{user.name}</span>
        )}
      </td>
      <td className="p-3 align-middle">
        {editing ? (
          <div className="min-w-[12rem]">
            {/* Role options wired from UsersTab via closure over roleOptions */}
            <Dropdown
              value={local.role}
              onChange={(v)=>setLocal((l)=>({ ...l, role: v as any }))}
              options={roleOptions}
              className="w-full"
              ariaLabel="Role"
            />
          </div>
        ) : (
          <span className="text-fg">{user.role}</span>
        )}
      </td>
      <td className="p-3 align-middle">
        {editing ? (
          <Toggle checked={local.isActive} onChange={(v)=>setLocal((l)=>({ ...l, isActive: v }))} />
        ) : (
          <span className={user.isActive ? 'text-success-token' : 'text-danger-token'}>
            {user.isActive ? 'Enabled' : 'Disabled'}
          </span>
        )}
      </td>
      <td className="p-3 align-middle">
        {canManage ? (
          editing ? (
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={()=>{ onUpdate(user.id, local).then(()=>setEditing(false)); }}>Save</Button>
              <Button variant="pill" size="sm" onClick={()=>{ setLocal({ email: user.email, name: user.name, role: user.role, isActive: user.isActive }); setEditing(false); }}>Cancel</Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="pill" size="sm" onClick={()=>setEditing(true)}>Edit</Button>
              <Button variant="danger" size="sm" onClick={()=>onRequestDelete(user)}>Delete</Button>
            </div>
          )
        ) : (
          <span className="text-fg-subtle">No permission</span>
        )}
      </td>
    </tr>
  );
}

function DeleteUserModal({ user, loading, error, onCancel, onConfirm }: { user: AdminUser; loading: boolean; error: string | null; onCancel: () => void; onConfirm: () => void; }) {
  return (
    <Portal>
      <div role="dialog" aria-modal="true" aria-labelledby={`delete-user-title-${user.id}`} className="fixed inset-0 z-[100]">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={()=>(!loading ? onCancel() : null)} />
        <div className="relative z-10 mx-auto mt-32 w-full max-w-md rounded-2xl border border-subtle bg-surface-token p-6 shadow-xl">
          <div id={`delete-user-title-${user.id}`} className="text-lg font-semibold text-fg">Delete User</div>
          <div className="mt-2 text-sm text-fg-muted">
            Are you sure you want to delete <span className="font-mono text-fg">{user.email}</span>? This action cannot be undone.
          </div>
          {error && <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="pill" onClick={onCancel} disabled={loading}>Cancel</Button>
            <Button variant="danger" onClick={onConfirm} disabled={loading}>{loading ? 'Deleting…' : 'Delete'}</Button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

export default UsersTab;