# AGENTS.md

MCP server for the Spaceship domain registrar API (domains, DNS, contacts, transfers, SellerHub). TypeScript, Node 22+, stdio transport. Layout and design: [ARCHITECTURE.md](ARCHITECTURE.md).

## Commands

```bash
npm ci
npm run build            # tsc -> dist/
npm test                 # build + node:test suite (fake Spaceship API, no credentials)
npm run check:contract   # validate every tool's request against the Spaceship OpenAPI spec
```

## Rules

- Any change to a request a tool sends must pass `npm run check:contract`. Look up field names in the spec (`.spec-cache/spaceship-openapi.json` after the first run), not in memory.
- Every tool has MCP annotations. Tools that spend money or delete take `confirm: CONFIRM` (`src/utils.ts`).
- Never auto-retry POST/PATCH on timeout: the client reports "outcome unknown" instead. Keep it that way.
- New tools: register in `src/index.ts`, add a request case to `test/tools.test.mjs` and a row to the README tools table (a test checks the README against the registered tools).
- Synthetic data only in tests and docs: `example.com`, `192.0.2.x`, placeholder contact IDs. Never commit credentials; configuration is env-only.
- No live API calls in tests or scripts.
