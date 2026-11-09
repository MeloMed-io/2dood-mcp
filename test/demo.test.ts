import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { seedDemoTasks } from '../src/demo.ts';
import { memoryStore } from '../src/store-memory.ts';
import { buildServer } from '../src/server.ts';
import { listTasks } from '../src/tasks.ts';

const now = new Date(2026, 10, 5, 14, 0); // Thu Nov 5 2026, 2pm local

/** Whole days from `now`'s date to the task's local due date. */
function dayOf(iso: string, ref = now) {
  const d = new Date(iso);
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate());
  return Math.round((a - b) / 86_400_000);
}
const find = (tasks: ReturnType<typeof seedDemoTasks>, title: string) => {
  const t = tasks.find((x) => x.title === title);
  assert.ok(t, `missing seed task "${title}"`);
  return t;
};

test('demo seed is dated relative to the injected now', () => {
  for (const ref of [now, new Date(2027, 2, 14, 7, 30), new Date(2026, 0, 1, 23, 0)]) {
    const tasks = seedDemoTasks(ref);
    assert.ok(tasks.length >= 60 && tasks.length <= 80, `${tasks.length} tasks`);
    for (const t of tasks) {
      if (t.due_at) {
        const d = dayOf(t.due_at, ref);
        assert.ok(d >= -42 && d <= 14, `${t.title} on day ${d}`);
      }
      assert.ok(new Date(t.created_at) <= ref, `${t.title} created in the future`);
      if (t.completed_at) assert.ok(new Date(t.completed_at) <= ref, `${t.title} completed in the future`);
      assert.equal(t.status === 'done', t.completed_at !== null);
    }
    const midterm = find(tasks, 'CHEM 201 midterm');
    assert.equal(dayOf(midterm.due_at!, ref), -21);
    assert.equal(midterm.status, 'done');
    const lab = find(tasks, 'BIO 210 lab report: enzyme kinetics');
    assert.equal(dayOf(lab.due_at!, ref), -3);
    assert.equal(dayOf(lab.completed_at!, ref), -2);
    assert.equal(dayOf(find(tasks, 'CHEM 201 exam 2').due_at!, ref), 4);
    assert.equal(dayOf(find(tasks, 'BIO 210 problem set 4').due_at!, ref), 9);
    assert.equal(dayOf(find(tasks, 'Internship application due').due_at!, ref), 12);
    // Rough patch: everything due on days -10 to -8 except the roommate talk was missed.
    const rough = tasks.filter((t) => t.due_at && dayOf(t.due_at, ref) >= -10 && dayOf(t.due_at, ref) <= -8);
    assert.ok(rough.length >= 4);
    for (const t of rough) if (t.title !== 'Talk to roommate about the fight') assert.equal(t.status, 'open', t.title);
    // Weekly routines land on the right weekdays.
    for (const t of tasks) {
      const wd = t.due_at && new Date(t.due_at).getDay();
      if (t.title === 'Climbing gym') assert.ok(wd === 2 || wd === 4);
      if (t.title === 'Long run' || t.title === 'Call mom') assert.equal(wd, 0);
    }
    assert.ok(tasks.filter((t) => !t.due_at).length >= 3);
  }
});

test('views on the memory store match the seed', async () => {
  const store = memoryStore(seedDemoTasks(now));
  const today = await listTasks(store, 'today', { now });
  assert.deepEqual(today.map((t) => t.title).sort(), ['BIO 210 lab 3 prelab', 'Climbing gym', 'ENG 105 essay 2 outline']);
  assert.equal(today[0].title, 'ENG 105 essay 2 outline'); // medium priority sorts first
  const overdue = await listTasks(store, 'overdue', { now });
  assert.ok(overdue.some((t) => t.title === 'CHEM 201 problem set 5'));
  assert.ok(overdue.every((t) => t.status === 'open' && dayOf(t.due_at!) < 0));
  const undated = await listTasks(store, 'undated', { now });
  assert.ok(undated.length >= 3 && undated.every((t) => t.due_at === null && t.status === 'open'));
  const done = await listTasks(store, 'done', { now });
  assert.ok(done.every((t) => t.status === 'done'));
});

test('all six tools work end to end on the memory store', async () => {
  const store = memoryStore(seedDemoTasks());
  const server = buildServer(store, { demo: true });
  const client = new Client({ name: 'test', version: '0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  assert.match(client.getInstructions() ?? '', /demo data for a fictional student, Maya Chen/);

  const tools = (await client.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(tools, ['add_tasks', 'complete_task', 'delete_task', 'list_tasks', 'search_tasks', 'update_task']);

  const text = async (name: string, args: Record<string, unknown>) => {
    const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
    assert.ok(!r.isError, r.content[0].text);
    return r.content[0].text;
  };
  const idsIn = (s: string) => [...s.matchAll(/id: ([0-9a-f-]{36})/g)].map((m) => m[1]);

  assert.match(await text('search_tasks', { query: 'chem 201 exam' }), /CHEM 201 exam 2 /);

  const added = await text('add_tasks', { text: 'ENG 105 vocab quiz friday\n- [ ] buy chalk', priority: 'high' });
  assert.match(added, /Added \(2\)/);
  assert.match(added, /ENG 105 vocab quiz · due Fri/);
  const [quiz, chalk] = idsIn(added);

  assert.match(await text('update_task', { id: chalk, title: 'buy liquid chalk', due: 'none', notes: 'gym shop' }), /buy liquid chalk.*\n.*gym shop/);
  assert.match(await text('list_tasks', { view: 'undated' }), /buy liquid chalk/);

  assert.match(await text('complete_task', { ids: [quiz] }), /\[x\] ENG 105 vocab quiz/);
  assert.doesNotMatch(await text('list_tasks', { view: 'week' }), /vocab quiz/);
  assert.match(await text('list_tasks', { view: 'week', include_done: true }), /vocab quiz/);

  assert.match(await text('delete_task', { ids: [chalk, quiz] }), /Deleted 2/);
  assert.match(await text('delete_task', { ids: [chalk] }), /Nothing deleted/);

  const bad = (await client.callTool({ name: 'update_task', arguments: { id: chalk, title: 'x' } })) as { isError?: boolean };
  assert.equal(bad.isError, true);
  await client.close();
});

test('--demo over stdio never loads supabase-js or touches the network', async () => {
  const child = spawn(
    process.execPath,
    ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--import', './test/fixtures/no-network.mjs', 'src/index.ts', '--demo'],
    { cwd: new URL('..', import.meta.url), stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, TWODOOD_SUPABASE_URL: 'http://127.0.0.1:9' } },
  );
  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d));
  const replies = new Map<number, any>();
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const msg = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (msg.id !== undefined) replies.set(msg.id, msg);
    }
  });
  const send = (m: object) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
  const reply = async (id: number) => {
    for (let i = 0; i < 100 && !replies.has(id); i++) await new Promise((r) => setTimeout(r, 50));
    assert.ok(replies.has(id), `no reply ${id}. stderr: ${stderr}`);
    return replies.get(id);
  };
  send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } });
  assert.match((await reply(1)).result.instructions, /DEMO MODE/);
  send({ method: 'notifications/initialized' });
  send({ id: 2, method: 'tools/call', params: { name: 'list_tasks', arguments: { view: 'week' } } });
  assert.match((await reply(2)).result.content[0].text, /CHEM 201 exam 2/);
  child.kill();
  assert.doesNotMatch(stderr, /demo mode (loaded|called|opened)/);
});
