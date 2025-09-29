import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { MdDragIndicator, MdEdit, MdDelete } from 'react-icons/md';
import { Button } from '../components/UI';
import Dropdown from '../components/Dropdown';
import { useAuth } from '../context/AuthContext';

type Task = {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  status: string;
  category: string;
  priority: string;
  dueDate: number | null;
  position: number;
  createdBy: string;
  createdByName?: string | null;
  assignedTo: string | null;
  assignedToName?: string | null;
  createdAt: number;
  updatedAt: number;
};

export function Tasks({ port }: { port: number | null }) {
  const { apiFetch, user } = useAuth();
  const base = port ? `http://localhost:${port}` : '';

  const DEBUG_DRAG = true;
  const debugLog = (...args: any[]) => {
    if (DEBUG_DRAG) console.log('[DRAG]', ...args);
  };

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Categories state (dynamic)
  const [categories, setCategories] = useState<string[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState<boolean>(false);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ status: '', category: '', search: '' });
  const [creating, setCreating] = useState({ title: '', category: 'Work' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ title: string; description: string }>({ title: '', description: '' });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragOverIndexRef = useRef<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const draggingIdRef = useRef<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    debugLog('state change: draggingId ->', draggingId);
  }, [draggingId]);
  useEffect(() => {
    debugLog('state change: isDragging ->', isDragging);
  }, [isDragging]);
  useEffect(() => {
    debugLog('state change: dragOverCol ->', dragOverCol);
  }, [dragOverCol]);
  useEffect(() => {
    debugLog('state change: dragOverIndex ->', dragOverIndex);
  }, [dragOverIndex]);
  useEffect(() => {
    debugLog('state change: editingId ->', editingId);
  }, [editingId]);

  const grouped = useMemo(() => {
    const cols: Record<string, Task[]> = { todo: [], in_progress: [], done: [] };
    for (const t of tasks) {
      const key = (t.status || 'todo') as keyof typeof cols;
      if (!cols[key]) cols[key] = [] as any;
      cols[key].push(t);
    }
    Object.values(cols).forEach((arr) => arr.sort((a, b) => a.position - b.position));
    return cols;
  }, [tasks]);

  useEffect(() => {
    if (!port) return;
    (async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (filters.status) qs.set('status', filters.status);
        if (filters.category) qs.set('category', filters.category);
        if (filters.search) qs.set('search', filters.search);
        const res = await apiFetch(`/api/tasks?${qs.toString()}`, { baseUrl: base });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as { tasks: Task[] };
        setTasks(data.tasks || []);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [port, base, apiFetch, filters]);

  // Fetch categories list
  const loadCategories = useCallback(async () => {
    if (!port) return;
    setCategoriesLoading(true);
    setCategoriesError(null);
    try {
      const res = await apiFetch('/api/categories', { baseUrl: base });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { categories: { name: string }[] };
      const names = Array.from(new Set(data.categories.map(c => c.name))).sort((a,b)=> a.localeCompare(b));
      setCategories(names);
      // Preserve existing selected filter & creating.category; if removed, reset gracefully
      setFilters(f => ({ ...f, category: f.category && names.includes(f.category) ? f.category : '' }));
      setCreating(c => {
        const fallback = names[0] || 'Work';
        return { ...c, category: c.category && names.includes(c.category) ? c.category : fallback };
      });
    } catch (e:any) {
      setCategoriesError(e.message || 'Failed to load categories');
    } finally {
      setCategoriesLoading(false);
    }
  }, [apiFetch, base, port]);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  const [canCreateTasks, setCanCreateTasks] = useState<boolean>(false);
  const canDrag = canCreateTasks; // treat non-creators as read-only for drag
  const canDelete = user?.role === 'owner';
  const [canUpdateTasks, setCanUpdateTasks] = useState<boolean>(false);

  // Determine permissions for creating/updating tasks (tasks:create, tasks:update)
  useEffect(() => {
    let ignore = false;
    (async () => {
      if (!user) { if (!ignore) { setCanUpdateTasks(false); setCanCreateTasks(false);} return; }
      if (user.role === 'owner') { if (!ignore) { setCanUpdateTasks(true); setCanCreateTasks(true);} return; }
      try {
        const res = await apiFetch(`/api/admin/roles/${user.role}/permissions`).catch(() => null);
        if (res && res.ok) {
          const data = await res.json();
            const pList = data.permissions || [];
            const upd = pList.find((p: any) => p.permission === 'tasks:update');
            const crt = pList.find((p: any) => p.permission === 'tasks:create');
            if (!ignore) {
              setCanUpdateTasks(Boolean(upd?.enabled));
              // For admin default semantics: if unspecified and role is admin treat as enabled (handled below fallback as well)
              setCanCreateTasks(Boolean(crt?.enabled));
            }
        } else {
          // Fallback heuristic: admins default to enabled unless explicitly disabled server-side (which we couldn't fetch)
          if (!ignore) {
            const isAdmin = user.role === 'admin';
            setCanUpdateTasks(isAdmin);
            setCanCreateTasks(isAdmin);
          }
        }
      } catch (_e) {
        if (!ignore) {
          const isAdmin = user.role === 'admin';
          setCanUpdateTasks(isAdmin);
          setCanCreateTasks(isAdmin);
        }
      }
    })();
    return () => { ignore = true; };
  }, [apiFetch, user]);

  async function createTask() {
    if (!creating.title.trim() || !user) return;
    const payload = {
      title: creating.title.trim(),
      category: creating.category || 'Work',
      organizationId: user.organizationId
    };
    const res = await apiFetch('/api/tasks', { baseUrl: base, method: 'POST', body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as { task: Task };
    setTasks((prev) => [...prev, data.task]);
    setCreating(c => ({ title: '', category: c.category }));
    // After creating a task, categories may have changed elsewhere (admin page) - optional refresh if new category not in list
    if (creating.category && !categories.includes(creating.category)) {
      void loadCategories();
    }
  }

  async function updateTask(id: string, patch: Partial<Task>) {
    const res = await apiFetch(`/api/tasks/${id}`, { baseUrl: base, method: 'PUT', body: JSON.stringify(patch) });
    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as { task: Task };
    setTasks((prev) => prev.map((t) => (t.id === id ? data.task : t)));
  }

  async function deleteTask(id: string) {
    const res = await apiFetch(`/api/tasks/${id}`, { baseUrl: base, method: 'DELETE' });
    if (!res.ok && res.status !== 204) throw new Error(await res.text());
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function isActionable(el: EventTarget | null): boolean {
    if (!(el instanceof Element)) return false;
    if (el.closest('[data-drag-allowed="true"]')) return false;
    const actionableSelectors = [
      'button',
      'a',
      'input',
      'select',
      'textarea',
      '[role="button"]',
      '[contenteditable="true"]',
      '[data-actionable="true"]'
    ].join(',');
    const result = !!el.closest(actionableSelectors);
    debugLog('isActionable?', { result, target: (el as Element)?.tagName });
    return result;
  }

  function beginPointerDrag(clientX: number, clientY: number, task: Task) {
    if (!canDrag) return;
    debugLog('beginPointerDrag', { taskId: task.id, at: { x: clientX, y: clientY } });
    setDraggingId(task.id);
    draggingIdRef.current = task.id;
    setIsDragging(true); // start ghosting immediately on hold
    isDraggingRef.current = true;
    dragStartRef.current = { x: clientX, y: clientY };
    pointerRef.current = { x: clientX, y: clientY };
    // Precompute initial drop target based on pointer location
    const initialCol = computeColFromPoint(clientX, clientY);
    setDragOverCol(initialCol);
    if (initialCol) {
      const idx = computeIndexFromPoint(clientX, clientY, initialCol);
      dragOverIndexRef.current = idx;
      setDragOverIndex(idx);
    } else {
      dragOverIndexRef.current = null;
      setDragOverIndex(null);
    }
    // Place ghost immediately at start location
    requestAnimationFrame(() => updateGhost());
    document.addEventListener('mousemove', onPointerMove, true);
    document.addEventListener('mouseup', onPointerUp, true);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, true);
    debugLog('listeners attached: mousemove/mouseup/touchmove/touchend');
  }

  function onTitleBarMouseDown(e: React.MouseEvent, task: Task) {
    debugLog('onTitleBarMouseDown', { button: e.button, taskId: task.id, target: (e.target as Element | null)?.tagName });
    if (!canDrag) { debugLog('abort mousedown: cannot drag'); return; }
    if (editingId === task.id) { debugLog('abort mousedown: task is in edit mode'); return; }
    if (e.button !== 0) { debugLog('abort mousedown: not left button'); return; }
    if (isActionable(e.target)) { debugLog('abort mousedown: actionable target'); return; }
    e.preventDefault();
    beginPointerDrag(e.clientX, e.clientY, task);
  }

  function onTitleBarTouchStart(e: React.TouchEvent, task: Task) {
    debugLog('onTitleBarTouchStart', { taskId: task.id });
    if (!canDrag) { debugLog('abort touchstart: cannot drag'); return; }
    if (editingId === task.id) { debugLog('abort touchstart: task is in edit mode'); return; }
    if (isActionable(e.target)) { debugLog('abort touchstart: actionable target'); return; }
    const t = e.touches[0];
    if (t) beginPointerDrag(t.clientX, t.clientY, task);
  }

  function updateGhost() {
    const g = ghostRef.current;
    const p = pointerRef.current;
    if (!g || !p) return;
    g.style.transform = `translate(${p.x + 8}px, ${p.y + 8}px)`;
    debugLog('updateGhost', { x: p.x, y: p.y });
  }

  function computeColFromPoint(x: number, y: number) {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const col = el?.closest('[data-col]') as HTMLElement | null;
    const result = col?.getAttribute('data-col') || null;
    debugLog('computeColFromPoint', { x, y, result });
    return result;
  }

  function computeIndexFromPoint(x: number, y: number, status: string): number {
    const colEl = document.querySelector(`[data-col="${status}"]`) as HTMLElement | null;
    if (!colEl) return 0;
    const cards = Array.from(colEl.querySelectorAll<HTMLElement>('[data-task-id]'))
      .filter((el) => el.getAttribute('data-task-id') !== draggingIdRef.current);
    if (cards.length === 0) return 0;
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (y < midY) return i;
    }
    const idx = cards.length; // end of column
    debugLog('computeIndexFromPoint', { x, y, status, idx });
    return idx;
  }

  function onPointerMove(e: MouseEvent) {
    if (!dragStartRef.current || !pointerRef.current || !draggingIdRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    pointerRef.current = { x: e.clientX, y: e.clientY };
    if (isDraggingRef.current) {
      const col = computeColFromPoint(e.clientX, e.clientY);
      setDragOverCol(col);
      if (col) {
        const idx = computeIndexFromPoint(e.clientX, e.clientY, col);
        dragOverIndexRef.current = idx;
        setDragOverIndex(idx);
      } else {
        dragOverIndexRef.current = null;
        setDragOverIndex(null);
      }
      updateGhost();
      e.preventDefault();
    }
    debugLog('onPointerMove', { x: e.clientX, y: e.clientY, dx, dy, isDragging: isDraggingRef.current });
  }

  function onTouchMove(e: TouchEvent) {
    if (!dragStartRef.current || !pointerRef.current || !draggingIdRef.current) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - dragStartRef.current.x;
    const dy = t.clientY - dragStartRef.current.y;
    pointerRef.current = { x: t.clientX, y: t.clientY };
    if (isDraggingRef.current) {
      const col = computeColFromPoint(t.clientX, t.clientY);
      setDragOverCol(col);
      if (col) {
        const idx = computeIndexFromPoint(t.clientX, t.clientY, col);
        dragOverIndexRef.current = idx;
        setDragOverIndex(idx);
      } else {
        dragOverIndexRef.current = null;
        setDragOverIndex(null);
      }
      updateGhost();
      e.preventDefault();
    }
    debugLog('onTouchMove', { x: t.clientX, y: t.clientY, dx, dy, isDragging: isDraggingRef.current });
  }

  async function finishDrag() {
    const currentDraggingId = draggingIdRef.current;
    if (!currentDraggingId) return;
    debugLog('finishDrag:start', {
      draggingId: currentDraggingId,
      isDraggingRef: isDraggingRef.current,
      pointer: pointerRef.current,
      dragOverCol,
      dragOverIndex: dragOverIndexRef.current
    });
    // If it never became a drag, just reset
    if (!isDraggingRef.current) {
      setDraggingId(null);
      setIsDragging(false);
      setDragOverCol(null);
      setDragOverIndex(null);
      dragStartRef.current = null;
      pointerRef.current = null;
      debugLog('finishDrag:end (no-drag) - reset state');
      return;
    }
    // Determine final target from current pointer
    const p = pointerRef.current;
    const computedCol = p ? computeColFromPoint(p.x, p.y) : null;
    const targetCol = computedCol || dragOverCol;
    const targetIndex = targetCol && p ? computeIndexFromPoint(p.x, p.y, targetCol) : dragOverIndexRef.current ?? null;
    debugLog('finishDrag:computed target', { targetCol, targetIndex });
    setIsDragging(false);
    isDraggingRef.current = false;
    setDragOverCol(null);
    setDragOverIndex(null);
    dragStartRef.current = null;
    pointerRef.current = null;
    if (targetCol) {
      const moved = tasks.find((t) => t.id === currentDraggingId);
      if (moved) {
        const fromStatus = moved.status;
        const toStatus = targetCol;
        const index = targetIndex ?? 0;
        debugLog('finishDrag:moving', { moved: moved.id, fromStatus, toStatus, index });

        if (fromStatus === toStatus) {
          // Same-column reorder: build a single reordered list and update positions
          const column = tasks
            .filter((t) => t.status === fromStatus && t.id !== moved.id)
            .sort((a, b) => a.position - b.position);
          const insertAt = Math.max(0, Math.min(index, column.length));
          const reordered = [...column.slice(0, insertAt), moved, ...column.slice(insertAt)];
          const withPositions = reordered.map((t, i) => ({ ...t, position: i + 1 }));

          // Local state update
          const updated = tasks.map((t) => {
            if (t.status !== fromStatus) return t;
            const nt = withPositions.find((x) => x.id === t.id);
            return nt ? { ...t, position: nt.position } : t;
          });
          setTasks(updated);

          // Persist only changed positions for this column
          try {
            const previousById = new Map(tasks.filter((t) => t.status === fromStatus).map((t) => [t.id, t.position] as const));
            const updates = withPositions
              .filter((t) => previousById.get(t.id) !== t.position)
              .map((t) => updateTask(t.id, { position: t.position } as Partial<Task>));
            debugLog('finishDrag:persisting same-column updates', { count: updates.length });
            await Promise.all(updates);
          } catch (err) {
            debugLog('finishDrag:update error (same-column)', err);
          }
        } else {
          // Cross-column move: compute both lists, reindex, and persist
          const from = tasks
            .filter((t) => t.status === fromStatus && t.id !== moved.id)
            .sort((a, b) => a.position - b.position);
          const to = tasks
            .filter((t) => t.status === toStatus && t.id !== moved.id)
            .sort((a, b) => a.position - b.position);
          const insertAt = Math.max(0, Math.min(index, to.length));
          const newTo = [...to.slice(0, insertAt), { ...moved, status: toStatus }, ...to.slice(insertAt)];

          // Local state for instant feedback
          const nextTasks = tasks.map((t) => (t.id === moved.id ? { ...t, status: toStatus } : t));
          newTo.forEach((t, i) => (t.position = i + 1));
          from.forEach((t, i) => (t.position = i + 1));
          const merged = nextTasks.map((t) => {
            if (t.status === toStatus) {
              const nt = newTo.find((x) => x.id === t.id);
              return nt ? { ...t, position: nt.position } : t;
            }
            if (t.status === fromStatus) {
              const nf = from.find((x) => x.id === t.id);
              return nf ? { ...t, position: nf.position } : t;
            }
            return t;
          });
          setTasks(merged);

          // Persist changes (status for moved, positions for both columns)
          try {
            const updates = [] as Promise<any>[];
            updates.push(
              updateTask(
                moved.id,
                { status: toStatus, position: newTo.findIndex((x) => x.id === moved.id) + 1 } as Partial<Task>
              )
            );
            for (const t of newTo) {
              if (t.id !== moved.id) updates.push(updateTask(t.id, { position: t.position } as Partial<Task>));
            }
            for (const t of from) {
              updates.push(updateTask(t.id, { position: t.position } as Partial<Task>));
            }
            debugLog('finishDrag:persisting cross-column updates', { count: updates.length });
            await Promise.all(updates);
          } catch (err) {
            debugLog('finishDrag:update error (cross-column)', err);
            // On error, we don’t hard-revert here; backend responses will re-sync next fetch.
          }
        }
      }
    }
    setDraggingId(null);
    draggingIdRef.current = null;
    debugLog('finishDrag:end - cleared draggingId');
  }

  function onPointerUp() {
    debugLog('onPointerUp');
    void finishDrag();
    cleanupDragListeners();
  }

  function onTouchEnd() {
    debugLog('onTouchEnd');
    void finishDrag();
    cleanupDragListeners();
  }

  function cleanupDragListeners() {
    document.removeEventListener('mousemove', onPointerMove, true);
    document.removeEventListener('mouseup', onPointerUp, true);
    document.removeEventListener('touchmove', onTouchMove as any);
    document.removeEventListener('touchend', onTouchEnd, true);
    debugLog('listeners removed: mousemove/mouseup/touchmove/touchend');
  }

  // native onDrop removed in favor of custom finishDrag

  async function onReorder(status: string, fromIndex: number, toIndex: number) {
    const column = tasks.filter((t) => t.status === status).sort((a, b) => a.position - b.position);
    const moved = column[fromIndex];
    if (!moved) return;
    const target = column[toIndex];
    if (!target) return;
    await updateTask(moved.id, { position: target.position });
  }

  // Keep controls mounted; show inline states instead of early returns
  const backendNotReady = !port;

  const renderColumn = (title: string, status: string) => {
    const isActiveDrop = dragOverCol === status && !!draggingId && isDragging;
    const containerClass = `rounded-3xl border ${
      isActiveDrop ? 'border-primary/60 bg-white/10 ring-2 ring-primary/30' : 'border-subtle bg-surface-token'
    } p-4 min-h-[300px] transition-colors`;
    return (
      <div className={containerClass} data-col={status} aria-label={isActiveDrop ? `Release to move to ${title}` : undefined}>
        <h3 className="mb-3 text-sm uppercase tracking-wide text-fg-muted">{title}</h3>
        <div className="space-y-3">
          {(() => {
            const items = grouped[status as keyof typeof grouped] || [];
            const list: Array<{ type: 'placeholder' } | { type: 'task'; task: Task; idx: number }> = [];
            const showPlaceholder = isActiveDrop && dragOverIndex != null;

            const isDraggingInThisCol = isActiveDrop && !!draggingId && items.some((t) => t.id === draggingId);
            const nonDraggedItems = isDraggingInThisCol ? items.filter((t) => t.id !== draggingId) : items;
            const placeholderIndex = showPlaceholder
              ? Math.max(0, Math.min(dragOverIndex!, nonDraggedItems.length))
              : -1;

            if (isDraggingInThisCol) {
              let nonDraggedCounter = 0;
              let skipNextSlot = false;
              items.forEach((task, idx) => {
                const atDesiredSlot = showPlaceholder && nonDraggedCounter === placeholderIndex;
                if (atDesiredSlot) {
                  if (skipNextSlot) {
                    skipNextSlot = false;
                  } else if (task.id === draggingId) {
                    skipNextSlot = true;
                  } else {
                    list.push({ type: 'placeholder' });
                  }
                }
                list.push({ type: 'task', task, idx });
                if (task.id !== draggingId) nonDraggedCounter++;
              });
              if (showPlaceholder && placeholderIndex === nonDraggedCounter) {
                if (skipNextSlot) {
                  skipNextSlot = false;
                } else {
                  list.push({ type: 'placeholder' });
                }
              }
            } else {
              items.forEach((task, idx) => {
                if (showPlaceholder && idx === placeholderIndex) list.push({ type: 'placeholder' });
                list.push({ type: 'task', task, idx });
              });
              if (showPlaceholder && placeholderIndex === items.length) list.push({ type: 'placeholder' });
            }

            return list.map((entry, renderIdx) => {
              if (entry.type === 'placeholder') {
                return (
                  <div key={`ph-${status}-${renderIdx}`} className="h-14 rounded-xl border border-primary/40 bg-primary/10" />
                );
              }
              const t = entry.task;
              const cardDragging = draggingId === t.id && isDragging;
              return (
                <div
                  key={t.id}
                  data-task-id={t.id}
                  onKeyDown={(e) => {
                    if ((e.key === ' ' || e.key === 'Spacebar') && canDrag && editingId !== t.id) {
                      debugLog('keyboard:Space -> beginPointerDrag', { taskId: t.id });
                      e.preventDefault();
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      beginPointerDrag(rect.left + rect.width / 2, rect.top + rect.height / 2, t);
                    }
                  }}
                  tabIndex={0}
                  className={[
                    'group rounded-2xl border border-subtle bg-app overflow-hidden',
                    'motion-safe:transition-transform motion-safe:duration-150',
                    cardDragging ? 'ring-2 ring-primary/40 shadow-xl motion-safe:scale-[1.01] pointer-events-none opacity-40' : '',
                    canDrag ? 'cursor-default' : 'cursor-not-allowed opacity-80',
                    'mb-3'
                  ].join(' ')}
                >
                  <div
                    className={[
                      'flex items-center justify-between gap-2 px-3 select-none',
                      canDrag ? (cardDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default',
                      'h-8 md:h-8 border-b border-transparent group-hover:bg-white/8 group-hover:border-white/10',
                      'motion-safe:transition-colors motion-safe:duration-150'
                    ].join(' ')}
                    aria-label={canDrag ? 'Drag to move task' : undefined}
                    title={canDrag ? 'Drag to move task' : undefined}
                    onMouseDown={(e) => onTitleBarMouseDown(e, t)}
                    onTouchStart={(e) => {
                      const el = e.currentTarget;
                      el.classList.add('after:opacity-100');
                      setTimeout(() => el.classList.remove('after:opacity-100'), 180);
                      onTitleBarTouchStart(e, t);
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="text-fg-subtle" aria-hidden>
                        <MdDragIndicator size={18} />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs shrink-0">
                      {canUpdateTasks && (
                        <button
                          className="text-primary-token hover:underline font-medium inline-flex items-center gap-1"
                          onClick={() => {
                            if (!canUpdateTasks) return;
                            setEditingId(t.id);
                            setEditDraft({ title: t.title, description: t.description || '' });
                          }}
                          data-actionable="true"
                          draggable={false}
                        >
                          <MdEdit aria-hidden />
                          <span className="sr-only md:not-sr-only">Edit</span>
                        </button>
                      )}
                      {canDelete && (
                        <button className="text-danger-token hover:underline font-medium inline-flex items-center gap-1" onClick={() => deleteTask(t.id)} data-actionable="true" draggable={false}>
                          <MdDelete aria-hidden />
                          <span className="sr-only md:not-sr-only">Delete</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="p-3">
                    {editingId === t.id && canUpdateTasks ? (
                      <input
                        className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1 text-sm mb-2"
                        value={editDraft.title}
                        onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                        placeholder="Title"
                        draggable={false}
                      />
                    ) : (
                      <div className="font-medium text-base truncate mb-1">{t.title}</div>
                    )}

                    {editingId === t.id && canUpdateTasks ? (
                      <textarea
                        className="mt-2 w-full rounded-md bg-white/5 border border-white/10 px-2 py-2 text-sm"
                        rows={3}
                        placeholder="Description"
                        value={editDraft.description}
                        onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                        draggable={false}
                      />
                    ) : (
                      t.description && <p className="mt-1 text-sm text-fg-muted">{t.description}</p>
                    )}
                    {editingId === t.id && canUpdateTasks && (
                      <div className="mt-2 flex gap-2">
                        <button
                          className="rounded-full bg-primary text-white px-4 py-1 text-sm"
                          data-actionable="true"
                          onClick={async () => {
                            await updateTask(t.id, { title: editDraft.title, description: editDraft.description });
                            setEditingId(null);
                          }}
                          draggable={false}
                        >
                          Save
                        </button>
                        <button
                          className="rounded-full bg-pill text-fg hover-bg-pill px-4 py-1 text-sm"
                          onClick={() => setEditingId(null)}
                          data-actionable="true"
                          draggable={false}
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    <div className="mt-2 flex justify-end">
                      <span className="inline-flex items-center rounded-full bg-pill border border-subtle px-2.5 py-1 text-xs text-fg select-none">
                        {t.category}
                      </span>
                    </div>
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>
    );
  };

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tasks</h1>
        <div className="flex gap-3 items-center flex-wrap">
          <input
            className="rounded-full bg-surface-token/60 border border-subtle px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 placeholder:text-fg-muted text-fg"
            placeholder="Search tasks"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            disabled={backendNotReady}
          />
          <Dropdown
            className="min-w-[160px]"
            buttonClassName="rounded-full px-4 py-2 border border-white/10 bg-white/5"
            value={filters.category}
            onChange={(val) => setFilters((f) => ({ ...f, category: val }))}
            options={[{ label: 'All Categories', value: '' }, ...categories]}
            ariaLabel="Filter by category"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="u-press-accent"
            title="Refresh categories"
            disabled={categoriesLoading}
            onClick={() => loadCategories()}
          >
            {categoriesLoading ? 'Refreshing…' : 'Refresh'}
          </Button>
          {loading && !backendNotReady && (
            <span className="text-xs text-fg-subtle animate-pulse">Loading…</span>
          )}
          {error && (
            <span className="text-xs text-warning" role="alert">{error}</span>
          )}
          {backendNotReady && (
            <span className="text-xs text-fg-subtle">Backend not ready</span>
          )}
        </div>
      </header>

  {(canCreateTasks || canUpdateTasks) && (
  <div className="rounded-3xl border border-subtle bg-surface-token p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <input
            className="flex-1 rounded-2xl border border-subtle bg-surface-token/60 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 placeholder:text-fg-muted"
            placeholder="Task title"
            value={creating.title}
            onChange={(e) => setCreating((c) => ({ ...c, title: e.target.value }))}
            disabled={backendNotReady}
          />
          <Dropdown
            className="min-w-[160px]"
            value={creating.category}
            onChange={(val) => setCreating((c) => ({ ...c, category: val }))}
            options={categories.length ? categories : [creating.category || 'Work']}
            ariaLabel="Select category"
          />
          {canCreateTasks ? (
            <button className="rounded-full bg-primary text-white px-5 py-3 disabled:opacity-50 disabled:cursor-not-allowed" onClick={() => createTask()} disabled={backendNotReady || !creating.title.trim()}>
              Add Task
            </button>
          ) : (
            null
          )}
        </div>
      </div>
  )}

      <div className="grid gap-4 md:grid-cols-3 opacity-100">
        {renderColumn('To do', 'todo')}
        {renderColumn('In progress', 'in_progress')}
        {renderColumn('Done', 'done')}
      </div>
      {draggingId && isDragging && pointerRef.current && (
        <div
          ref={(el) => (ghostRef.current = el)}
          className="fixed left-0 top-0 z-50 pointer-events-none select-none"
          style={{ transform: `translate(${pointerRef.current.x + 8}px, ${pointerRef.current.y + 8}px)` }}
        >
          {(() => {
            const t = tasks.find((x) => x.id === draggingId);
            return (
              <div className="rounded-xl bg-app/90 border border-primary/40 px-3 py-2 text-xs shadow-lg min-w-[160px] max-w-[240px]">
                <div className="font-medium truncate">{t?.title || 'Task'}</div>
                <div className="text-fg-subtle truncate">{t?.category || ''}</div>
              </div>
            );
          })()}
        </div>
      )}
    </section>
  );
}
