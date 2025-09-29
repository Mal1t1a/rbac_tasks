import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as any;
  const loginSuccess = Boolean(location?.state?.loginSuccess);

  return (
  <section className="bg-surface-token backdrop-blur rounded-3xl p-8 shadow-glow border border-subtle">
      {loginSuccess && (
        <div className="mb-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Signed in successfully.
        </div>
      )}
      <h1 className="text-3xl font-semibold">Welcome{user ? `, ${user.name}` : ''}</h1>
  <p className="text-fg-muted">Use the Tasks page to manage your work with role-based access control.</p>
      <div className="mt-6">
        <button className="rounded-full bg-primary text-white px-5 py-3" onClick={() => navigate('/tasks')}>
          Go to Tasks
        </button>
      </div>
    </section>
  );
}
