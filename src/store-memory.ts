// In-memory TaskStore for demo mode. Mirrors the Supabase queries (view
// filters, sort order, limits) so the tools answer the same way. Nothing
// leaves the process and nothing is written to disk.
import { randomUUID } from 'node:crypto';
import type { Task, TaskStore } from './tasks.ts';
import { viewRange } from './tasks.ts';

export const DEMO_USER_ID = 'demo-user';

const time = (iso: string | null) => (iso === null ? null : new Date(iso).getTime());

/** priority desc (nulls first, like Postgres), due_at asc nulls last, created_at asc. */
function byListOrder(a: Task, b: Task) {
  const pa = a.priority ?? Infinity;
  const pb = b.priority ?? Infinity;
  if (pa !== pb) return pb - pa;
  return byDue(a, b) || time(a.created_at)! - time(b.created_at)!;
}
function byDue(a: Task, b: Task) {
  const da = time(a.due_at);
  const db = time(b.due_at);
  if (da === db) return 0;
  if (da === null) return 1;
  if (db === null) return -1;
  return da - db;
}

export function memoryStore(seed: Task[] = []): TaskStore & { all(): Task[] } {
  const tasks = new Map<string, Task>(seed.map((t) => [t.id, { ...t }]));
  const copy = (t: Task) => ({ ...t });

  return {
    all: () => [...tasks.values()].map(copy),

    async userId() {
      return DEMO_USER_ID;
    },

    async list(view, { includeDone, limit, now }) {
      const { from, to } = viewRange(view, now);
      const openOnly = view === 'open' || view === 'overdue' || (!includeDone && view !== 'done');
      return [...tasks.values()]
        .filter((t) => {
          const due = time(t.due_at);
          if ((from || to) && due === null) return false;
          if (from && due! < from.getTime()) return false;
          if (to && due! >= to.getTime()) return false;
          if (view === 'undated' && due !== null) return false;
          if (view === 'done' && t.status !== 'done') return false;
          if (openOnly && t.status !== 'open') return false;
          return true;
        })
        .sort(byListOrder)
        .slice(0, limit)
        .map(copy);
    },

    async search(safe, includeDone) {
      const needle = safe.toLowerCase();
      return [...tasks.values()]
        .filter((t) => t.title.toLowerCase().includes(needle) || (t.body ?? '').toLowerCase().includes(needle))
        .filter((t) => includeDone || t.status === 'open')
        .sort(byDue)
        .slice(0, 100)
        .map(copy);
    },

    async insert(rows) {
      const created_at = new Date().toISOString();
      return rows.map(({ user_id: _, ...row }) => {
        const t: Task = { id: randomUUID(), completed_at: null, created_at, ...row };
        tasks.set(t.id, t);
        return copy(t);
      });
    },

    async update(id, patch) {
      const t = tasks.get(id);
      if (!t) return null;
      Object.assign(t, patch);
      return copy(t);
    },

    async setDone(ids, done, at) {
      const out: Task[] = [];
      for (const id of new Set(ids)) {
        const t = tasks.get(id);
        if (!t) continue;
        t.status = done ? 'done' : 'open';
        t.completed_at = done ? at : null;
        out.push(copy(t));
      }
      return out;
    },

    async delete(ids) {
      const out: Pick<Task, 'id' | 'title'>[] = [];
      for (const id of new Set(ids)) {
        const t = tasks.get(id);
        if (!t) continue;
        tasks.delete(id);
        out.push({ id: t.id, title: t.title });
      }
      return out;
    },
  };
}
