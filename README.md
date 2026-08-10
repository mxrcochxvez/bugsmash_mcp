# BugSmash MCP

Local [Model Context Protocol](https://modelcontextprotocol.io) server that lets an LLM read and manage [BugSmash](https://bugsmash.io) reviewer feedback **without ever seeing your BugSmash API key**.

```
LLM (Claude) --MCP--> bugsmash-mcp --HTTPS + X-API-Key--> https://api.bugsmash.io/api/v2
```

## Install

```bash
npm install -g @mxrcochxvez/bugsmash-mcp
```

Or run without a global install via `npx` (see connector config below).

Requires Node.js 18+.

## Generate an API key

1. Sign in at [tools.bugsmash.io](https://tools.bugsmash.io).
2. Open your profile menu → **Settings**.
3. Find the **API Key** section and copy the key.
4. Treat it like a password. If it leaks, regenerate it immediately from the same settings page.

Official auth docs: [docs.bugsmash.io/authentication](https://docs.bugsmash.io/authentication)

## Set `BUGSMASH_API_KEY` (do not commit it)

Export the key in your shell — never put it in a committed file.

```bash
export BUGSMASH_API_KEY="your-key-here"
```

macOS / Linux (zsh), persist for your user:

```bash
echo 'export BUGSMASH_API_KEY="your-key-here"' >> ~/.zshrc
source ~/.zshrc
```

Confirm it is set (does not print the value):

```bash
test -n "$BUGSMASH_API_KEY" && echo "BUGSMASH_API_KEY is set"
```

## Register as a user-level MCP connector

Use a **user** scope so the server is available in every project.

### Claude Code / Claude CLI (recommended: npx)

```bash
claude mcp add --scope user bugsmash --env BUGSMASH_API_KEY=$BUGSMASH_API_KEY -- npx -y @mxrcochxvez/bugsmash-mcp
```

If you installed globally:

```bash
claude mcp add --scope user bugsmash --env BUGSMASH_API_KEY=$BUGSMASH_API_KEY -- bugsmash-mcp
```

### Claude Desktop

Edit your Claude Desktop config (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "bugsmash": {
      "command": "npx",
      "args": ["-y", "@mxrcochxvez/bugsmash-mcp"],
      "env": {
        "BUGSMASH_API_KEY": "your-key-here"
      }
    }
  }
}
```

Prefer injecting the key from the environment your Desktop app inherits, rather than pasting it into a synced config file when possible.

### Cursor

Add a similar MCP entry: `command` `npx`, `args` `["-y", "@mxrcochxvez/bugsmash-mcp"]`, and `BUGSMASH_API_KEY` under `env`.

## Tools

| Tool | BugSmash API | Purpose |
| --- | --- | --- |
| `list_projects` | `GET /projects` | Paginated project list (find `projectId`) |
| `get_project` | `GET /project/{projectId}` | Project details + versions |
| `list_feedback` | `GET /comments?projectId` | All reviewer comments on a project |
| `get_feedback` | `GET /comment/{commentId}` | Single comment (+ replies) |
| `update_feedback` | `PATCH /comment/{commentId}` | Update text / status / priority / privacy |
| `list_replies` | `GET /comment/{commentId}/replies` | Thread replies |
| `post_reply` | `POST /reply` | Reply on a thread |

Base URL: `https://api.bugsmash.io/api/v2`  
Auth header: `X-API-Key` (never a tool argument).

Typical flow: `list_projects` → `list_feedback` → optionally `update_feedback` / `post_reply`.

## Security note

- The API key is read **only** from `BUGSMASH_API_KEY`.
- It is **never** accepted as a tool parameter.
- It must **never** be logged, printed, masked-partially in errors, or returned in tool responses.
- On startup, a missing key exits with the generic message `BUGSMASH_API_KEY is not set`.
- All HTTP calls go through one helper that attaches `X-API-Key`; request headers are not surfaced on errors.

## Local development

```bash
git clone https://github.com/mxrcochxvez/bugsmash_mcp.git
cd bugsmash_mcp
npm install
npm run build
export BUGSMASH_API_KEY="your-key-here"
npm start
```

```bash
npm run typecheck   # tsc --noEmit
npm run pack:check  # preview files included in the npm tarball
```

API reference: [docs.bugsmash.io](https://docs.bugsmash.io/)
