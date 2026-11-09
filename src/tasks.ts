// Task logic shared by the MCP tools. Parsing reuses the app's own code
// (lib/parseTaskInput.ts, lib/extractDate.ts) so an agent adding
// "WEBASSIGN friday; reply to roderick" gets exactly what the app would do.
import * as chrono from 'chrono-node';
import { parseTaskInput } from './lib/parseTaskInput.ts';
import { extractDate } from './lib/extractDate.ts';

export type Task = {
  id: string;
  title: string;
  body: string | null;
  status: 'open' | 'done';
  due_at: string | null;
  completed_at: string | null;
  priority: number | null;
  source: string;
  created_at: string;
};

export const PRIORITY = { none: 0, medium: 1, high: 2 } as const;
export type PriorityName = keyof typeof PRIORITY;
const PRIORITY_NAME = ['none', 'medium', 'high'] as const;

export const VIEWS = ['today', 'week', 'overdue', 'upcoming', 'undated', 'open', 'done', 'all'] as const;
export type View = (typeof VIEWS)[number];

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/**
 * Turns an agent-supplied due value into an ISO string.
 * Accepts ISO timestamps, natural language ("friday 5pm", "tomorrow"),
 * or "none"/"" to clear. Throws on input it can't read, rather than guessing.
 */
export function resolveDue(input: string, now = new Date()): string | null {
  const s = input.trim();
  if (s === '' || /^(none|null|no date|clear|undated)$/i.test(s)) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T09:00:00` : s);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const r = chrono.parse(s, now, { forwardDate: true })[0];
  if (!r) throw new Error(`Couldn't read "${input}" as a date. Try "friday 5pm" or an ISO date.`);
  const d = r.start.date();
  if (!r.start.isCertain('hour')) d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

export function parsePriority(p: PriorityName | undefined): number | undefined {
  return p === undefined ? undefined : PRIORITY[p];
}

export type NewTask = ReturnType<typeof planInserts>[number];
export type TaskPatch = Partial<Pick<Task, 'title' | 'body' | 'due_at' | 'priority'>>;
export type ListOpts = { includeDone: boolean; limit: number; now: Date };

/**
 * Where tasks live. The Supabase store (store-supabase.ts) talks to the real
 * backend, the memory store (store-memory.ts) backs demo mode. All parsing and
 * validation stays in this file so both behave the same.
 */
export interface TaskStore {
  userId(): Promise<string>;
  list(view: View, opts: ListOpts): Promise<Task[]>;
  /** `safe` is already stripped of filter syntax. Case-insensitive match on title or notes. */
  search(safe: string, includeDone: boolean): Promise<Task[]>;
  insert(rows: NewTask[]): Promise<Task[]>;
  update(id: string, patch: TaskPatch): Promise<Task | null>;
  setDone(ids: string[], done: boolean, at: string): Promise<Task[]>;
  delete(ids: string[]): Promise<Pick<Task, 'id' | 'title'>[]>;
}

export function viewRange(view: View, now: Date): { from?: Date; to?: Date } {
  const today = startOfDay(now);
  switch (view) {
    case 'today':
      return { from: today, to: addDays(today, 1) };
    case 'week':
      return { from: today, to: addDays(today, 7) };
    case 'overdue':
      return { to: today };
    case 'upcoming':
      return { from: today };
    default:
      return {};
  }
}

export async function listTasks(
  store: TaskStore,
  view: View,
  opts: { includeDone?: boolean; limit?: number; now?: Date } = {},
): Promise<Task[]> {
  return store.list(view, {
    now: opts.now ?? new Date(),
    includeDone: opts.includeDone ?? view === 'done',
    limit: opts.limit ?? 200,
  });
}

export async function searchTasks(store: TaskStore, query: string, includeDone = false) {
  // Escape PostgREST or-filter syntax characters so a query can't break the filter.
  const safe = query.replace(/[%_,().*\\]/g, ' ').trim();
  if (!safe) return [];
  return store.search(safe, includeDone);
}

export type AddInput = { text: string; parseDates?: boolean; due?: string; priority?: PriorityName; notes?: string };

/** Paste-to-many: one task per line/semicolon, dates pulled out of each title. */
export function planInserts(userId: string, input: AddInput, now = new Date()) {
  const titles = parseTaskInput(input.text);
  const sharedDue = input.due !== undefined ? resolveDue(input.due, now) : undefined;
  const priority = parsePriority(input.priority) ?? 0;
  return titles.map((raw) => {
    let title = raw;
    let due_at: string | null = null;
    if (sharedDue !== undefined) due_at = sharedDue;
    else if (input.parseDates !== false) ({ cleanTitle: title, due_at } = extractDate(raw, now));
    return {
      user_id: userId,
      title,
      due_at,
      priority,
      body: input.notes ?? null,
      status: 'open' as const,
      source: 'app',
    };
  });
}

export async function addTasks(store: TaskStore, input: AddInput) {
  const rows = planInserts(await store.userId(), input);
  if (rows.length === 0) throw new Error('No tasks found in that text.');
  if (rows.length > 100) throw new Error(`That's ${rows.length} tasks. Add at most 100 at once.`);
  return store.insert(rows);
}

export type UpdateInput = { title?: string; notes?: string | null; due?: string; priority?: PriorityName };

export async function updateTask(store: TaskStore, id: string, input: UpdateInput) {
  const patch: TaskPatch = {};
  if (input.title !== undefined) {
    if (!input.title.trim()) throw new Error('Title cannot be empty.');
    patch.title = input.title.trim();
  }
  if (input.notes !== undefined) patch.body = input.notes || null;
  if (input.due !== undefined) patch.due_at = resolveDue(input.due);
  if (input.priority !== undefined) patch.priority = PRIORITY[input.priority];
  if (Object.keys(patch).length === 0) throw new Error('Nothing to change.');
  const task = await store.update(id, patch);
  if (!task) throw new Error(`No task with id ${id}.`);
  return task;
}

export async function setDone(store: TaskStore, ids: string[], done: boolean) {
  return store.setDone(ids, done, new Date().toISOString());
}

export async function deleteTasks(store: TaskStore, ids: string[]) {
  return store.delete(ids);
}

// ---------- formatting ----------

const fmt = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function formatTask(t: Task): string {
  const parts = [`${t.status === 'done' ? '[x]' : '[ ]'} ${t.title}`];
  if (t.due_at) parts.push(`due ${fmt.format(new Date(t.due_at))}`);
  const p = t.priority ?? 0;
  if (p > 0) parts.push(`${PRIORITY_NAME[p]} priority`);
  if (t.source !== 'app') parts.push(`from ${t.source}`);
  let line = `- ${parts.join(' · ')}  (id: ${t.id})`;
  if (t.body) line += `\n    notes: ${t.body.replace(/\n/g, ' ')}`;
  return line;
}

export function formatList(tasks: Task[], heading: string): string {
  if (tasks.length === 0) return `${heading}: nothing here.`;
  return `${heading} (${tasks.length}):\n${tasks.map(formatTask).join('\n')}`;
}
