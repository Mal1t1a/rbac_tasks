import { ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface PortalProps {
  children: ReactNode;
  containerId?: string;
}

// Simple portal: renders children into a detached div appended to body (or containerId root)
export default function Portal({ children, containerId }: PortalProps) {
  const elRef = useRef<HTMLDivElement | null>(null);
  if (!elRef.current) {
    elRef.current = document.createElement('div');
  }
  useEffect(() => {
    const target = containerId ? document.getElementById(containerId) : document.body;
    const el = elRef.current!;
    if (target) target.appendChild(el);
    return () => { if (target && el.parentElement === target) target.removeChild(el); };
  }, [containerId]);
  return createPortal(children, elRef.current);
}
