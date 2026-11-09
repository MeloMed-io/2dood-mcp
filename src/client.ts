// Supabase client for the MCP server. Signs in as YOU (row-level security
// scopes every query to your own tasks), and keeps the session in a file so
// the token refreshes across restarts without re-entering a password.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const CONFIG_DIR = process.env.TWODOOD_MCP_HOME ?? join(homedir(), '.config', '2dood-mcp');
const SESSION_FILE = join(CONFIG_DIR, 'session.json');

/** Read EXPO_PUBLIC_* from the app's .env so there is one source of truth. */
// The npm build bakes in 2DooD's public Supabase URL and publishable key (the
// same values every copy of the app ships with). Row-level security, not the
// key, is what keeps each user to their own tasks.
declare const __TWODOOD_SUPABASE_URL__: string | undefined;
declare const __TWODOOD_SUPABASE_KEY__: string | undefined;
const BUILT_URL = typeof __TWODOOD_SUPABASE_URL__ === 'string' ? __TWODOOD_SUPABASE_URL__ : undefined;
const BUILT_KEY = typeof __TWODOOD_SUPABASE_KEY__ === 'string' ? __TWODOOD_SUPABASE_KEY__ : undefined;

export function supabaseConfig() {
  const url = process.env.TWODOOD_SUPABASE_URL ?? BUILT_URL;
  const key = process.env.TWODOOD_SUPABASE_ANON_KEY ?? BUILT_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing Supabase config. Set TWODOOD_SUPABASE_URL and TWODOOD_SUPABASE_ANON_KEY, or use the npm build.',
    );
  }
  return { url, key };
}

// File-backed storage adapter. supabase-js writes refreshed tokens through it.
const fileStorage = {
  getItem(key: string): string | null {
    if (!existsSync(SESSION_FILE)) return null;
    try {
      const all = JSON.parse(readFileSync(SESSION_FILE, 'utf8'));
      return all[key] ?? null;
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    let all: Record<string, string> = {};
    try {
      all = JSON.parse(readFileSync(SESSION_FILE, 'utf8'));
    } catch {
      /* fresh file */
    }
    all[key] = value;
    writeFileSync(SESSION_FILE, JSON.stringify(all), { mode: 0o600 });
    chmodSync(SESSION_FILE, 0o600);
  },
  removeItem(key: string) {
    if (!existsSync(SESSION_FILE)) return;
    try {
      const all = JSON.parse(readFileSync(SESSION_FILE, 'utf8'));
      delete all[key];
      writeFileSync(SESSION_FILE, JSON.stringify(all), { mode: 0o600 });
    } catch {
      rmSync(SESSION_FILE, { force: true });
    }
  },
};

export function makeClient(): SupabaseClient {
  const { url, key } = supabaseConfig();
  return createClient(url, key, {
    auth: { storage: fileStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
}

/** Returns the signed-in user id, or throws a message an agent can relay. */
export async function requireUser(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) {
    throw new Error('Not signed in to 2DooD. Run `npx -y 2dood-mcp login` in a terminal once, then retry.');
  }
  return data.session.user.id;
}

export function logout() {
  rmSync(SESSION_FILE, { force: true });
}
