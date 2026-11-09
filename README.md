# 2DooD MCP

Connects your 2DooD tasks to AI apps that support MCP: Claude Desktop, Claude Code, Cursor, Codex and others. The app can list, search, add, update, complete and delete your tasks. Changes show up in the 2DooD apps on iPhone, Mac and web.

Full guide: https://melomed.io/developers/2dood

## Demo mode (no account)

Want to try it first? Demo mode runs the same six tools on made-up data for a fictional student, Maya Chen, a college sophomore with chemistry exams, lab reports and an internship deadline coming up. No 2DooD account, no sign-in and no network. Dates are relative to when the server starts, so there is always something due today. Changes you make are kept in memory and reset when the server restarts.

Claude Code:

```sh
claude mcp add 2dood-demo -s user -- npx -y 2dood-mcp --demo
```

Claude Desktop, Cursor and other apps that use `mcpServers` JSON:

```json
{
  "mcpServers": {
    "2dood-demo": { "command": "npx", "args": ["-y", "2dood-mcp", "--demo"] }
  }
}
```

Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.2dood-demo]
command = "npx"
args = ["-y", "2dood-mcp", "--demo"]
```

Setting `TWODOOD_DEMO=1` in the environment does the same as `--demo`. Try asking "what's overdue?" or "add CHEM 201 flashcards for tomorrow night".

## Requirements

- Node.js 20 or newer
- A 2DooD account that signs in with email and password (Apple and Google sign-in aren't supported yet)

## 1. Sign in once

```sh
npx -y 2dood-mcp login
```

This asks for your 2DooD email and password. Your password isn't stored. The session is saved to `~/.config/2dood-mcp/session.json`, readable only by you, and refreshes itself.

```sh
npx -y 2dood-mcp whoami   # who the server acts as
npx -y 2dood-mcp logout   # forget the session
```

## 2. Add it to your AI app

Claude Code:

```sh
claude mcp add 2dood -s user -- npx -y 2dood-mcp
```

Claude Desktop (`claude_desktop_config.json`), Cursor (`~/.cursor/mcp.json`) and other apps that use `mcpServers` JSON:

```json
{
  "mcpServers": {
    "2dood": { "command": "npx", "args": ["-y", "2dood-mcp"] }
  }
}
```

Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.2dood]
command = "npx"
args = ["-y", "2dood-mcp"]
```

Restart the app after editing its config.

## Tools

| Tool | What it does |
|---|---|
| `list_tasks` | Tasks for today, week, overdue, upcoming, undated, open, done or all |
| `search_tasks` | Finds tasks whose title or notes contain some text |
| `add_tasks` | Adds one or many tasks from text, one per line, with dates like "friday 5pm" read from the title |
| `update_task` | Changes title, notes, due date or priority |
| `complete_task` | Marks tasks done, or reopens them |
| `delete_task` | Deletes tasks permanently |

## Privacy

The server runs on your computer and signs in as you, so it can only reach your own tasks. Task text you share with an AI app is handled under that app's privacy policy.

## Develop

```sh
npm install
npm test                 # node --test, demo store, no network
npm run dev -- --demo    # run from source on the demo data
```

`npm run build` bundles `dist/index.js` and needs `TWODOOD_SUPABASE_URL` and `TWODOOD_SUPABASE_ANON_KEY` (the public URL and publishable key, never a secret key). Most people should use the npm package instead.

`src/lib/` holds the date parsing shared with the 2DooD apps.

## License

MIT. The 2DooD name is not covered by the license.
