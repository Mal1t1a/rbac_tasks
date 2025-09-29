import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import WelcomeAnimation from './WelcomeAnimation';

export function WelcomeManager({ port }: { port: number | null }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [active, setActive] = useState(false);
  const triggeredRef = useRef(false);
  const nameRef = useRef<string>('');

  // Important: if a user logs out without closing the app and a different
  // user logs in, the previous in-memory guard could prevent the animation
  // from showing. Reset the guard when `auth.user?.id` changes so the
  // welcome flow is evaluated per-user rather than per-app session.
  useEffect(() => {
    triggeredRef.current = false;
  }, [auth.user?.id]);

  useEffect(() => {
    if (!triggeredRef.current && auth.user && auth.pendingWelcome) {
      triggeredRef.current = true;
      nameRef.current = auth.user.name || '';
      setActive(true);
    }
  }, [auth.user, auth.pendingWelcome]);

  if (!active) return null;

  return createPortal(
    <WelcomeAnimation
      name={nameRef.current}
      onMidway={() => {
        auth.markUIReady();
        navigate('/tasks', { replace: true });
      }}
      onDone={() => {
        if (port) {
          fetch(`http://localhost:${port}/api/welcome/complete`, {
            method: 'POST',
            headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : undefined
          }).catch(() => null);
        }
        auth.consumePendingWelcome();
        setActive(false);
      }}
    />,
    document.body
  );
}

export default WelcomeManager;
