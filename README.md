# Spaceship MCP Server

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node.js Version](https://img.shields.io/badge/node-%3E%3D22-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-7-blue)

MCP server for [Spaceship](https://www.spaceship.com) (by Namecheap) — domain registrar with DNS management, WHOIS privacy, domain transfers, and a built-in SellerHub marketplace. Manage everything from any MCP-compatible client.

36 tools across 8 categories. Built-in response caching, rate limit handling with exponential backoff, and actionable error messages. Tools that spend money or delete data require an explicit `confirm: true` argument.

## Requirements

- Node.js 22+
- Spaceship API key and secret ([API Manager](https://www.spaceship.com/application/api-manager/))

## Installation

```bash
git clone https://github.com/hlebtkachenko/spaceship-mcp.git
cd spaceship-mcp
npm ci
npm run build
```

### Docker

```bash
docker build -t spaceship-mcp .
docker run -i --rm \
  -e SPACESHIP_API_KEY=your-key \
  -e SPACESHIP_API_SECRET=your-secret \
  spaceship-mcp
```

## Configuration

### Cursor

`~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "spaceship": {
      "command": "node",
      "args": ["/path/to/spaceship-mcp/dist/index.js"],
      "env": {
        "SPACESHIP_API_KEY": "your-api-key",
        "SPACESHIP_API_SECRET": "your-api-secret"
      }
    }
  }
}
```

### Claude Desktop

`claude_desktop_config.json` ([location](https://modelcontextprotocol.io/quickstart/user#1-open-your-mcp-client))

```json
{
  "mcpServers": {
    "spaceship": {
      "command": "node",
      "args": ["/path/to/spaceship-mcp/dist/index.js"],
      "env": {
        "SPACESHIP_API_KEY": "your-api-key",
        "SPACESHIP_API_SECRET": "your-api-secret"
      }
    }
  }
}
```

### Claude Code

`.mcp.json` in your project root, or `~/.claude.json` globally:

```json
{
  "mcpServers": {
    "spaceship": {
      "command": "node",
      "args": ["/path/to/spaceship-mcp/dist/index.js"],
      "env": {
        "SPACESHIP_API_KEY": "your-api-key",
        "SPACESHIP_API_SECRET": "your-api-secret"
      }
    }
  }
}
```

### Any MCP client (stdio)

The server uses `stdio` transport. Point your MCP client to:

```
node /path/to/spaceship-mcp/dist/index.js
```

With `SPACESHIP_API_KEY` and `SPACESHIP_API_SECRET` environment variables set.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SPACESHIP_API_KEY` | Yes | — | API key from [API Manager](https://www.spaceship.com/application/api-manager/) |
| `SPACESHIP_API_SECRET` | Yes | — | API secret from API Manager |
| `SPACESHIP_CACHE_TTL` | No | `120` | Response cache lifetime in seconds (0 to disable) |
| `SPACESHIP_MAX_RETRIES` | No | `3` | Max retries for rate-limited (429) requests, and for timed-out GET/PUT/DELETE requests |
| `SPACESHIP_BASE_URL` | No | `https://spaceship.dev/api` | API base URL (tests point it at a fake server) |

## Tools

### Domains (12 tools)

| Tool | Description |
|------|-------------|
| `ss_domains` | List all domains (paginated) |
| `ss_domain_info` | Get domain details (status, expiry, nameservers, privacy) |
| `ss_domain_check` | Check single domain availability |
| `ss_domains_check` | Bulk availability check (up to 20 domains) |
| `ss_domain_register` | Register a domain (async, charges the account, needs `confirm` and `userConsent`) |
| `ss_domain_renew` | Renew a domain (async, charges the account, needs `confirm`) |
| `ss_domain_autorenew` | Toggle auto-renewal |
| `ss_domain_nameservers` | Update nameservers (basic or custom) |
| `ss_domain_contacts` | Update domain contacts |
| `ss_domain_privacy` | Set WHOIS privacy level (needs `userConsent`) |
| `ss_domain_transfer_lock` | Lock/unlock transfers |
| `ss_domain_email_protection` | Toggle contact form in WHOIS |

### DNS (3 tools)

| Tool | Description |
|------|-------------|
| `ss_dns_records` | List DNS records (A, AAAA, ALIAS, CAA, CNAME, HTTPS, MX, NS, PTR, SRV, SVCB, TLSA, TXT) |
| `ss_dns_save` | Add or update records (up to 500 per call, per-type fields) |
| `ss_dns_delete` | Delete records by exact match (needs `confirm`) |

### Contacts (4 tools)

| Tool | Description |
|------|-------------|
| `ss_contact_save` | Create/update contact, returns contact ID |
| `ss_contact_get` | Read contact details by ID |
| `ss_contact_attr_save` | Save TLD-specific contact attributes (.ca, .us) |
| `ss_contact_attr_get` | Read contact attributes by ID |

### Transfers (4 tools)

| Tool | Description |
|------|-------------|
| `ss_domain_transfer` | Initiate inbound domain transfer (async, charges the account, needs `confirm` and `userConsent`) |
| `ss_domain_transfer_details` | Check transfer status |
| `ss_domain_auth_code` | Get EPP/auth code for outbound transfers (the code lands in the transcript) |
| `ss_domain_restore` | Restore a deleted/expired domain (async, charges the account, needs `confirm`) |

### Personal Nameservers (4 tools)

| Tool | Description |
|------|-------------|
| `ss_personal_ns_list` | List vanity/glue nameservers for a domain |
| `ss_personal_ns_get` | Get IPs for a specific nameserver host |
| `ss_personal_ns_update` | Create or update a personal nameserver |
| `ss_personal_ns_delete` | Delete a personal nameserver (needs `confirm`) |

### SellerHub (7 tools)

| Tool | Description |
|------|-------------|
| `ss_sellerhub_list` | List marketplace listings |
| `ss_sellerhub_get` | Get listing details |
| `ss_sellerhub_create` | List a domain for sale |
| `ss_sellerhub_update` | Update listing (price, description) |
| `ss_sellerhub_delete` | Remove from SellerHub (needs `confirm`) |
| `ss_sellerhub_checkout` | Create Buy Now checkout link |
| `ss_sellerhub_verify` | Get DNS verification records |

### Analysis (1 tool)

| Tool | Description |
|------|-------------|
| `ss_dns_alignment` | Compare expected vs actual DNS records to detect misconfigurations |

### Async Operations (1 tool)

| Tool | Description |
|------|-------------|
| `ss_async_status` | Check status of registration, renewal, transfer, or restore |

## Async Operations

Domain registration, renewal, transfer, and restoration are asynchronous. These tools return an `asyncOperationId`: use `ss_async_status` to poll for completion. Statuses: `pending`, `success`, `failed` (returned as an error).

## Safety

- Every tool carries MCP annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`).
- `ss_domain_register`, `ss_domain_renew`, `ss_domain_transfer`, `ss_domain_restore` (spend money) and `ss_dns_delete`, `ss_personal_ns_delete`, `ss_sellerhub_delete` (delete) require `confirm: true`.
- `userConsent` for WHOIS privacy is a required parameter, never assumed.

## Response Caching

GET responses are cached for 120 seconds by default (configurable via `SPACESHIP_CACHE_TTL`). Async operation and transfer status are never cached. Write operations invalidate the related domain, DNS, contact or SellerHub entries and the domain list. Set `SPACESHIP_CACHE_TTL=0` to disable caching entirely.

## Rate Limits and Timeouts

When Spaceship returns HTTP 429, the client retries with exponential backoff, respecting the `Retry-After` header (seconds or HTTP date, capped at 30 s) when present. Default: up to 3 retries. Timed-out GET, PUT and DELETE requests are retried too. A POST or PATCH (registration, renewal, transfer, restore, SellerHub) that times out or loses its connection is never retried: the tool returns an "outcome unknown" error so you can check with `ss_async_status` or `ss_domain_info` before trying again. Other HTTP errors are not retried.

## Security

- 30-second timeout on all HTTP requests
- Path parameters are URL-encoded; API paths containing `..` or `#` are rejected
- Error responses truncated to 500 characters, with the API's per-field validation details
- Context-aware recovery hints in error messages
- All parameters validated with Zod schemas
- No credentials stored on disk (env vars only)

## Development

```bash
npm test                 # build + node:test suite against a fake Spaceship API
npm run check:contract   # validate every tool's request and the fake API's responses against the Spaceship OpenAPI spec
```

Layout and design notes: [ARCHITECTURE.md](ARCHITECTURE.md).

## Tech Stack

- TypeScript 7, ESM
- `@modelcontextprotocol/sdk` (stdio transport)
- Zod (schema validation)
- Native `fetch` with `AbortSignal.timeout`

## API Reference

- [Spaceship API docs](https://docs.spaceship.dev/)
- [API Manager](https://www.spaceship.com/application/api-manager/)

## License

[MIT](LICENSE)
