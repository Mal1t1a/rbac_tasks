import { useEffect, useMemo, useState } from 'react';
import { NavLink, Route, Routes, Navigate, useNavigate } from 'react-router';
import { FiSettings, FiHome, FiLoader, FiClipboard, FiShield, FiLogOut, FiUser } from 'react-icons/fi';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { useBackend } from './hooks/useBackend';
import { TitleBar } from './components/TitleBar';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Login } from './pages/Login';
import { Tasks } from './pages/Tasks';
import { AuditLog } from './pages/AuditLog';
import Admin from './pages/Admin';
import WelcomeManager from './components/WelcomeManager';

export default function App() {
  const backend = useBackend();
  const { serverInfo, userProfile, loading } = backend;
  const apiBase = serverInfo.port ? `http://localhost:${serverInfo.port}` : '';

  const envSummary = useMemo(() => {
    const keys = Object.keys(serverInfo.env ?? {});
    if (keys.length === 0) {
      return 'No public env vars';
    }
    return keys.map((key) => `${key}=${serverInfo.env[key] ?? ''}`).join(' • ');
  }, [serverInfo.env]);

  const Shell = () => {
  const auth = useAuth();
    const navigate = useNavigate();
    const role = auth.user?.role;
  const [adminAllowed, setAdminAllowed] = useState<boolean>(false);

    useEffect(() => {
      let cancelled = false;
      async function checkAdmin() {
        try {
          // No user => no admin access
          if (!auth.user) { if (!cancelled) setAdminAllowed(false); return; }
          // Owner always allowed
          if (role === 'owner') { if (!cancelled) setAdminAllowed(true); return; }
          // Probe an admin endpoint: if it returns 200, current role has admin:access
          const res = await auth.apiFetch(`/api/admin/permissions/admin-access`).catch(() => null as any);
          if (!cancelled) setAdminAllowed(Boolean(res && res.ok));
        } catch {
          if (!cancelled) setAdminAllowed(false);
        }
      }
      checkAdmin();
      return () => { cancelled = true; };
    }, [role, auth.user, auth.apiFetch]);
    // Curtain is now managed globally by WelcomeManager
    return (
  <div className="h-screen bg-app text-fg flex flex-col relative">
  <TitleBar />
      <div className="flex-1 overflow-auto">
        <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-6 px-6 py-10">
          <header className="flex flex-col gap-4 rounded-3xl border border-subtle bg-surface-token p-6 backdrop-blur lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold">Task Management</h1>
              <p className="text-fg-muted">Secure RBAC with JWT authentication.</p>
            </div>
            <nav className="flex items-center gap-3 text-sm">
              {auth.user && auth.uiReady ? (
                <>
                  <NavLink
                    to="/"
                    end
                    className={({ isActive }) =>
                      [
                        'inline-flex items-center gap-2 rounded-full px-5 py-2.5 transition',
                        isActive ? 'bg-primary text-white shadow-glow' : 'bg-pill text-fg hover-bg-pill'
                      ].join(' ')
                    }
                  >
                    <FiHome /> Overview
                  </NavLink>
                  <NavLink
                    to="/tasks"
                    className={({ isActive }) =>
                      [
                        'inline-flex items-center gap-2 rounded-full px-5 py-2.5 transition',
                        isActive ? 'bg-primary text-white shadow-glow' : 'bg-pill text-fg hover-bg-pill'
                      ].join(' ')
                    }
                  >
                    <FiClipboard /> Tasks
                  </NavLink>
                  {(role === 'owner' || adminAllowed) && (
                    <NavLink
                      to="/admin"
                      className={({ isActive }) =>
                        [
                          'inline-flex items-center gap-2 rounded-full px-5 py-2.5 transition',
                          isActive ? 'bg-primary text-white shadow-glow' : 'bg-pill text-fg hover-bg-pill'
                        ].join(' ')
                      }
                    >
                      <FiUser /> Admin
                    </NavLink>
                  )}
                  {(role === 'owner' || role === 'admin') && (
                    <NavLink
                      to="/settings"
                      className={({ isActive }) =>
                        [
                          'inline-flex items-center gap-2 rounded-full px-5 py-2.5 transition',
                          isActive ? 'bg-primary text-white shadow-glow' : 'bg-pill text-fg hover-bg-pill'
                        ].join(' ')
                      }
                    >
                      <FiSettings /> Settings
                    </NavLink>
                  )}
                  {(role === 'owner' || role === 'admin') && (
                    <NavLink
                      to="/audit"
                      className={({ isActive }) =>
                        [
                          'inline-flex items-center gap-2 rounded-full px-5 py-2.5 transition',
                          isActive ? 'bg-primary text-white shadow-glow' : 'bg-pill text-fg hover-bg-pill'
                        ].join(' ')
                      }
                    >
                      <FiShield /> Audit
                    </NavLink>
                  )}
                  <button
                    className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 bg-pill text-fg hover-bg-pill"
                    onClick={() =>
                      auth
                        .logout(apiBase)
                        .then(() => navigate('/login', { replace: true }))
                    }
                  >
                    <FiLogOut /> Logout
                  </button>
                </>
              ) : (
                <NavLink
                  to="/login"
                  className={({ isActive }) =>
                    [
                      'inline-flex items-center gap-2 rounded-full px-5 py-2.5 transition',
                      isActive ? 'bg-primary text-white shadow-glow' : 'bg-pill text-fg hover-bg-pill'
                    ].join(' ')
                  }
                >
                  Login
                </NavLink>
              )}
            </nav>
          </header>

          <main className="flex-1 pb-10">
              {loading || auth.loading ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-subtle bg-surface-token py-20 text-fg-muted">
                <FiLoader className="animate-spin text-3xl" />
                  <span>Preparing your session…</span>
              </div>
            ) : (
              <Routes>
                <Route path="/" element={auth.user ? <Dashboard /> : <Navigate to="/login" replace />} />
                <Route
                    path="/login"
                    element={auth.user && !auth.pendingWelcome ? (
                      <Navigate to="/" replace />
                    ) : (
                      <Login port={serverInfo.port} />
                    )}
                />
                <Route
                  path="/tasks"
                  element={auth.user ? <Tasks port={serverInfo.port} /> : <Navigate to="/login" replace />}
                />
                <Route
                  path="/admin"
                  element={auth.user && (role === 'owner' || adminAllowed) ? <Admin port={serverInfo.port} /> : <Navigate to="/" replace />}
                />
                <Route
                  path="/audit"
                  element={auth.user && (role === 'owner' || role === 'admin') ? <AuditLog port={serverInfo.port} /> : <Navigate to="/" replace />}
                />
                <Route
                  path="/settings"
                  element={auth.user && (role === 'owner' || role === 'admin') ? <Settings port={serverInfo.port} /> : <Navigate to="/" replace />}
                />
              </Routes>
            )}
          </main>

          <footer className="rounded-3xl border border-subtle bg-surface-token p-4 text-xs text-fg-subtle">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <span>Backend port: {serverInfo.port ?? 'unknown'}</span>
              <span className="truncate">{envSummary}</span>
            </div>
          </footer>
        </div>
      </div>
      {/* Global welcome manager overlay */}
      <WelcomeManager port={serverInfo.port} />
    </div>
    );
  };

  return (
    <ThemeProvider>
      <AuthProvider baseUrl={apiBase}>
        <Shell />
      </AuthProvider>
    </ThemeProvider>
  );
}
