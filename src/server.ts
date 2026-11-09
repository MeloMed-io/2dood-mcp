// The MCP server itself: six task tools over a TaskStore. index.ts picks the
// store (Supabase for real accounts, memory for --demo).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DEMO_PERSONA } from './demo.ts';
import {
  VIEWS,
  addTasks,
  deleteTasks,
  formatList,
  formatTask,
  listTasks,
  searchTasks,
  setDone,
  updateTask,
  type TaskStore,
} from './tasks.ts';

const priority = z.enum(['none', 'medium', 'high']);
const id = z.string().uuid();

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}
function fail(e: unknown) {
  return { content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true };
}
async function run(fn: () => Promise<string>) {
  try {
    return ok(await fn());
  } catch (e) {
    return fail(e);
  }
}

export const VERSION = '0.3.0';

const INSTRUCTIONS =
  '2DooD is a student to-do app (to do or doom). Tasks are often course-coded ' +
  '(for example CS101 or WEBASSIGN). Use list_tasks to see what is due, add_tasks to capture ' +
  'one or many tasks from free text (dates like "friday" are parsed out of titles), and ' +
  'complete_task when something is finished. Get ids from list_tasks or search_tasks. ' +
  'Times are in the local timezone of the machine running this server.';

const DEMO_NOTE =
  ` DEMO MODE: this is demo data for a fictional student, ${DEMO_PERSONA}. It is not a real ` +
  'account or a real person. Changes are kept in memory only and vanish when the server stops.';

export function buildServer(store: TaskStore, opts: { demo?: boolean } = {}) {
  const server = new McpServer(
    { name: opts.demo ? '2DooD (demo)' : '2DooD', version: VERSION },
    { instructions: INSTRUCTIONS + (opts.demo ? DEMO_NOTE : '') },
  );

  server.registerTool(
    'list_tasks',
    {
      title: 'List tasks',
      description:
        'List 2DooD tasks for a view. today = due today, week = next 7 days, overdue = open and past due, ' +
        'upcoming = due today or later, undated = no due date, open = every open task, done = finished, all = everything. ' +
        'Open tasks only unless include_done is true. Sorted by priority, then due date.',
      inputSchema: {
        view: z.enum(VIEWS).default('today'),
        include_done: z.boolean().optional().describe('Also show finished tasks (default false, except for view=done).'),
        limit: z.number().int().min(1).max(500).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    ({ view, include_done, limit }) =>
      run(async () => formatList(await listTasks(store, view, { includeDone: include_done, limit }), `${view} tasks`)),
  );

  server.registerTool(
    'search_tasks',
    {
      title: 'Search tasks',
      description: 'Find tasks whose title or notes contain the text (case-insensitive). Open tasks only unless include_done.',
      inputSchema: { query: z.string().min(1), include_done: z.boolean().optional() },
      annotations: { readOnlyHint: true },
    },
    ({ query, include_done }) =>
      run(async () => formatList(await searchTasks(store, query, include_done), `tasks matching "${query}"`)),
  );

  server.registerTool(
    'add_tasks',
    {
      title: 'Add tasks',
      description:
        'Add one or more tasks from free text, the same way pasting into 2DooD works: one task per line ' +
        '(also splits on semicolons or tabs, and on commas when there are 2+ commas and no newlines). ' +
        'Bullets, checkboxes and numbering are stripped. A date phrase in each title ("WEBASSIGN friday", ' +
        '"essay due nov 12 5pm") becomes its due date unless parse_dates is false or due is given.',
      inputSchema: {
        text: z.string().min(1).describe('One or more tasks, e.g. "WEBASSIGN friday\\nreply to roderick"'),
        due: z.string().optional().describe('Due date for ALL tasks, natural language or ISO. Overrides dates in titles.'),
        priority: priority.optional(),
        notes: z.string().optional().describe('Notes attached to every task added.'),
        parse_dates: z.boolean().optional().describe('Pull dates out of titles (default true).'),
      },
    },
    ({ text, due, priority: p, notes, parse_dates }) =>
      run(async () => {
        const added = await addTasks(store, { text, due, priority: p, notes, parseDates: parse_dates });
        return formatList(added, 'Added');
      }),
  );

  server.registerTool(
    'update_task',
    {
      title: 'Update task',
      description: 'Change a task\'s title, notes, due date or priority. due accepts natural language, ISO, or "none" to clear it.',
      inputSchema: {
        id,
        title: z.string().optional(),
        notes: z.string().nullable().optional().describe('New notes. Empty string or null clears them.'),
        due: z.string().optional(),
        priority: priority.optional(),
      },
      annotations: { idempotentHint: true },
    },
    ({ id: taskId, ...rest }) => run(async () => `Updated:\n${formatTask(await updateTask(store, taskId, rest))}`),
  );

  server.registerTool(
    'complete_task',
    {
      title: 'Complete task',
      description: 'Mark one or more tasks done. Pass done=false to reopen them.',
      inputSchema: { ids: z.array(id).min(1).max(100), done: z.boolean().default(true) },
      annotations: { idempotentHint: true },
    },
    ({ ids, done }) =>
      run(async () => {
        const changed = await setDone(store, ids, done);
        const missing = ids.length - changed.length;
        return formatList(changed, done ? 'Marked done' : 'Reopened') + (missing ? `\n(${missing} id(s) not found)` : '');
      }),
  );

  server.registerTool(
    'delete_task',
    {
      title: 'Delete task',
      description: 'Permanently delete tasks. Cannot be undone. Prefer complete_task for finished work; only delete when the user asks.',
      inputSchema: { ids: z.array(id).min(1).max(100) },
      annotations: { destructiveHint: true },
    },
    ({ ids }) =>
      run(async () => {
        const gone = await deleteTasks(store, ids);
        if (!gone.length) return 'Nothing deleted (no matching ids).';
        return `Deleted ${gone.length}:\n${gone.map((t) => `- ${t.title}  (id: ${t.id})`).join('\n')}`;
      }),
  );

  return server;
}
