#!/usr/bin/env -S node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON
// 2DooD MCP server (stdio). Lets any MCP-capable agent read and write your
// 2DooD tasks. Same Supabase backend as the iOS/macOS/web apps, so changes
// show up everywhere.
//
//   node src/index.ts login    sign in once (session saved to ~/.config/2dood-mcp)
//   node src/index.ts whoami   show who the server acts as
//   node src/index.ts logout   forget the saved session
//   node src/index.ts          run the MCP server on stdio
//   node src/index.ts --demo   run on fictional demo data, no account or network
//                              (same as TWODOOD_DEMO=1)
//   node src/index.ts --help   usage (--version prints the version)
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createInterface } from 'node:readline';
import { DEMO_PERSONA, seedDemoTasks } from './demo.ts';
import { VERSION, buildServer } from './server.ts';
import { memoryStore } from './store-memory.ts';

// ---------- CLI ----------

function ask(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    // Mute echo while the password is typed.
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      if (s.includes(question)) process.stdout.write(s);
    };
  }
  return new Promise((resolve) => {
    let answered = false;
    // stdin closed before an answer (piped or no terminal): say so instead of exiting silently.
    rl.on('close', () => {
      if (answered) return;
      console.error('\nNo input. Run this in a terminal, or set TWODOOD_EMAIL and TWODOOD_PASSWORD.');
      process.exit(1);
    });
    rl.question(question, (a) => {
      answered = true;
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(a.trim());
    });
  });
}

const USAGE = `2dood-mcp ${VERSION}, MCP server for 2DooD tasks

Usage:
  2dood-mcp            run the MCP server on stdio (add it to your AI app, see below)
  2dood-mcp --demo     run it on fictional demo data, no account or network (same as TWODOOD_DEMO=1)
  2dood-mcp login      sign in once with your 2DooD email and password
  2dood-mcp whoami     show who the server acts as
  2dood-mcp logout     forget the saved session
  2dood-mcp --help     show this help
  2dood-mcp --version  print the version

Claude Code:  claude mcp add 2dood -s user -- npx -y 2dood-mcp
Guide:        https://melomed.io/developers/2dood`;

const COMMANDS = ['login', 'logout', 'whoami'];

/** Started by hand in a terminal: the server waits for an MCP client on stdin, so say what it is. */
function terminalHint(demo: boolean) {
  if (!process.stdin.isTTY) return;
  console.error(
    `2dood-mcp ${VERSION}${demo ? ' (demo)' : ''} is running and waiting for an MCP client on stdin. ` +
      'Add it to your AI app instead of running it here (see --help). Ctrl+C to quit.',
  );
}

async function login(db: SupabaseClient) {
  const email = process.env.TWODOOD_EMAIL || (await ask('2DooD email: '));
  const password = process.env.TWODOOD_PASSWORD || (await ask('Password: ', true));
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    console.error(`Sign-in failed: ${error.message}`);
    process.exit(1);
  }
  console.log(`Signed in as ${data.user.email}. Session saved, the MCP server will use it.`);
}

async function main() {
  const args = process.argv.slice(2);
  const demo = args.includes('--demo') || /^(1|true|yes)$/i.test(process.env.TWODOOD_DEMO ?? '');
  const cmd = args.find((a) => !a.startsWith('-'));

  if (args.includes('--help') || args.includes('-h') || cmd === 'help') return console.log(USAGE);
  if (args.includes('--version') || args.includes('-v')) return console.log(VERSION);
  // A typo used to start the server silently, so reject anything we don't know.
  const unknown = args.find((a) => a !== '--demo' && (a !== cmd || !COMMANDS.includes(a)));
  if (unknown !== undefined) {
    console.error(`Unknown argument "${unknown}".\n\n${USAGE}`);
    process.exit(1);
  }

  if (demo) {
    // No Supabase client, no network: everything lives in this process.
    if (cmd === 'whoami') return console.log(`Demo account: ${DEMO_PERSONA}. Fictional data, no sign-in.`);
    if (cmd === 'login' || cmd === 'logout') return console.log('Demo mode needs no account. Drop --demo to use your own.');
    const store = memoryStore(seedDemoTasks(new Date()));
    terminalHint(true);
    return buildServer(store, { demo: true }).connect(new StdioServerTransport());
  }

  // Loaded only outside demo mode, so --demo never touches supabase-js.
  const { logout, makeClient, requireUser } = await import('./client.ts');
  const { supabaseStore } = await import('./store-supabase.ts');
  const db = makeClient();
  if (cmd === 'login') return login(db);
  if (cmd === 'logout') {
    await db.auth.signOut({ scope: 'local' }).catch(() => {});
    logout();
    return console.log('Signed out.');
  }
  if (cmd === 'whoami') {
    const { data } = await db.auth.getSession();
    return console.log(data.session ? data.session.user.email : 'Not signed in.');
  }
  terminalHint(false);
  await buildServer(supabaseStore(db, requireUser)).connect(new StdioServerTransport());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
