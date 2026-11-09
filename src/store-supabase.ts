// TaskStore backed by 2DooD's Supabase project. Row-level security scopes
// every query to the signed-in user, the user_id filters are belt and braces.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Task, TaskStore } from './tasks.ts';
import { viewRange } from './tasks.ts';

const COLUMNS = 'id,title,body,status,due_at,completed_at,priority,source,created_at';

export function supabaseStore(db: SupabaseClient, requireUser: (db: SupabaseClient) => Promise<string>): TaskStore {
  const uid = () => requireUser(db);
  return {
    userId: uid,

    async list(view, { includeDone, limit, now }) {
      let q = db.from('tasks').select(COLUMNS).eq('user_id', await uid());
      const { from, to } = viewRange(view, now);
      if (from) q = q.gte('due_at', from.toISOString());
      if (to) q = q.lt('due_at', to.toISOString());
      if (view === 'overdue') q = q.eq('status', 'open');
      if (view === 'undated') q = q.is('due_at', null);
      if (view === 'done') q = q.eq('status', 'done');
      if (view === 'open' || (!includeDone && view !== 'done')) q = q.eq('status', 'open');
      const { data, error } = await q
        .order('priority', { ascending: false })
        .order('due_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as Task[];
    },

    async search(safe, includeDone) {
      let q = db
        .from('tasks')
        .select(COLUMNS)
        .eq('user_id', await uid())
        .or(`title.ilike.%${safe}%,body.ilike.%${safe}%`);
      if (!includeDone) q = q.eq('status', 'open');
      const { data, error } = await q.order('due_at', { ascending: true, nullsFirst: false }).limit(100);
      if (error) throw new Error(error.message);
      return (data ?? []) as Task[];
    },

    async insert(rows) {
      const { data, error } = await db.from('tasks').insert(rows).select(COLUMNS);
      if (error) throw new Error(error.message);
      return (data ?? []) as Task[];
    },

    async update(id, patch) {
      const { data, error } = await db.from('tasks').update(patch).eq('user_id', await uid()).eq('id', id).select(COLUMNS);
      if (error) throw new Error(error.message);
      return (data?.[0] as Task | undefined) ?? null;
    },

    async setDone(ids, done, at) {
      const { data, error } = await db
        .from('tasks')
        .update({ status: done ? 'done' : 'open', completed_at: done ? at : null })
        .eq('user_id', await uid())
        .in('id', ids)
        .select(COLUMNS);
      if (error) throw new Error(error.message);
      return (data ?? []) as Task[];
    },

    async delete(ids) {
      const { data, error } = await db.from('tasks').delete().eq('user_id', await uid()).in('id', ids).select('id,title');
      if (error) throw new Error(error.message);
      return (data ?? []) as Pick<Task, 'id' | 'title'>[];
    },
  };
}
