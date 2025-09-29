import { FormEvent, useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';

export function Login({ port }: { port: number | null }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('owner@acme.test');
  const [password, setPassword] = useState('Owner123!');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const navigate = useNavigate();

  const finishWelcome = useCallback(async () => {
    setShowWelcome(false);
    setTimeout(() => navigate('/tasks', { replace: true, state: { loginSuccess: true } }), 100);
  }, [navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!port) return;
    setBusy(true);
    setError(null);
    try {
      const result = await login(`http://localhost:${port}`, email, password);
      setSuccess(true);
      if (!result.firstLogin) {
        navigate('/', { replace: true, state: { loginSuccess: true } });
        // setTimeout(() => navigate('/tasks', { replace: true, state: { loginSuccess: true } }), 400);
      }
    } catch (_err) {
      // Do not reveal which field failed
      setError('invalid username/password combination');
    } finally {
      setBusy(false);
    }
  };

  return (
  <section className="bg-surface-token backdrop-blur rounded-3xl p-8 shadow-glow border border-subtle max-w-lg mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold">Sign in</h1>
  <p className="text-fg-muted">Use your email and password.</p>
      </header>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-fg-subtle">Email</span>
          <input
            className="mt-1 w-full rounded-2xl border border-subtle bg-white/5 px-4 py-3 text-fg focus:border-primary focus:outline-none"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-fg-subtle">Password</span>
          <input
            className="mt-1 w-full rounded-2xl border border-subtle bg-white/5 px-4 py-3 text-fg focus:border-primary focus:outline-none"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button
          type="submit"
           className="w-full rounded-full bg-primary text-white py-3 hover:bg-primary/90 disabled:opacity-50"
          disabled={!port || busy}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      {error && (
        <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {success && (
        <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Signed in successfully. Redirecting…
        </div>
      )}
      <div className="mt-6">
        <div className="text-[10px] uppercase tracking-wider text-fg-subtle mb-2">Demo Accounts</div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Owner', email: 'owner@acme.test', password: 'Owner123!' },
            { label: 'Admin', email: 'admin@acme.test', password: 'Admin123!' },
            { label: 'Viewer', email: 'viewer@acme.test', password: 'Viewer123!' }
          ].map(acc => (
            <button
              key={acc.email}
              type="button"
              onClick={() => { setEmail(acc.email); setPassword(acc.password); }}
              className="group relative inline-flex items-center gap-1 rounded-full border border-subtle bg-pill px-3 py-1.5 text-xs font-medium text-fg hover:border-primary/50 hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/40"
              aria-label={`Use ${acc.label} demo credentials`}
            >
              <span>{acc.label}</span>
              <span className="text-[10px] font-normal text-fg-muted group-hover:text-primary/80">{acc.email}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[10px] text-fg-muted">Click a badge to prefill credentials.</p>
      </div>
    {/* Welcome overlay is now handled globally in App shell */}
    </section>
  );
}
