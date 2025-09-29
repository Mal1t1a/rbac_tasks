import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

type AuditEvent = {
  id: string;
  organizationId: string | null;
  actorId: string | null;
  actorName?: string | null;
  action: string;
  entity: string;
  entityId: string;
  createdAt: number;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
};

export function AuditLog({ port }: { port: number | null }) {
  const { apiFetch } = useAuth();
  const base = port ? `http://localhost:${port}` : '';
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!port) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch('/api/audit-log?limit=100', { baseUrl: base });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as { events: AuditEvent[] };
        setEvents(data.events || []);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [port, base, apiFetch]);

  if (!port) return <div className="text-fg-muted">Backend not ready.</div>;
  if (loading) return <div className="text-fg-muted">Loading audit log…</div>;
  if (error) return <div className="text-warning">{error}</div>;

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Audit Log</h1>
      <div className="rounded-3xl border border-subtle bg-surface-token">
        <ul className="divide-y divide-white/5">
          {events.map((e) => (
            <li key={e.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-fg-muted">
                  <span className="text-fg">{e.action}</span> · {e.entity}#{e.entityId}
                </div>
                <div className="text-xs text-fg-subtle">{new Date(e.createdAt * 1000).toLocaleString()}</div>
              </div>
              <div className="mt-1 text-xs text-fg-subtle">Actor: {e.actorName || e.actorId || 'system'}</div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
