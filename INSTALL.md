# Installation & Setup Guide (`unapi-mcp`)

`unapi-mcp` runs on **macOS, Linux, and Windows** with **Node.js 18, 20, 22, or 24+**. Unlike browser automation frameworks, it does **not** download a 500MB Chromium binary—it connects directly to your existing Chrome, Brave, or Edge browser via the Chrome DevTools Protocol (CDP) or imports `.har` files offline.

---

## 1. Instant Execution via `npx` (No Install Required)

Run the built-in interactive demo or inspect your environment immediately:

```bash
npx unapi-mcp doctor
npx unapi-mcp demo
npx unapi-mcp audit acme-flights
```

---

## 2. Global CLI Installation

If you use `unapi-mcp` frequently from your terminal:

```bash
npm install -g unapi-mcp

# Both `unapi-mcp` and the short alias `unapi` are now available:
unapi doctor
unapi list
```

---

## 3. Wiring into AI Coding Agents (MCP)

### Claude Code
```bash
npx unapi-mcp setup --client claude
```
Or using the native Claude CLI:
```bash
claude mcp add unapi-mcp -- npx -y unapi-mcp mcp
```

### Cursor
```bash
npx unapi-mcp setup --client cursor
```
This writes the MCP configuration to `~/.cursor/mcp.json`.

### OpenCode / Windsurf / Claude Desktop
Add the following block to your MCP configuration file:
```json
{
  "mcpServers": {
    "unapi-mcp": {
      "command": "npx",
      "args": ["-y", "unapi-mcp", "mcp"]
    }
  }
}
```

---

## 4. Installing From Source (Contributors)

```bash
git clone https://github.com/mohdxaid/unapi-mcp.git
cd unapi-mcp
npm install
npm run build
npm test
npm link
```
