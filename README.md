# Spaceship MCP Server

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node.js Version](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)

MCP server for [Spaceship](https://www.spaceship.com) (by Namecheap) — domain registrar with DNS management, WHOIS privacy, domain transfers, and a built-in SellerHub marketplace. Manage everything from any MCP-compatible client.

35 tools across 9 categories. Built-in response caching, rate limit handling with exponential backoff, and actionable error messages.

## Requirements

- Node.js 20+
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
| `SPACESHIP_MAX_RETRIES` | No | `3` | Max retry attempts for rate-limited (429) and timeout requests |

## Tools

### Domains (12 tools)

| Tool | Description |
|------|-------------|
| `ss_domains` | List all domains (paginated) |
| `ss_domain_info` | Get domain details (status, expiry, nameservers, privacy) |
| `ss_domain_check` | Check single domain availability |
| `ss_domains_check` | Bulk availability check (up to 20 domains) |
| `ss_domain_register` | Register a domain (async) |
| `ss_domain_renew` | Renew a domain (async) |
| `ss_domain_autorenew` | Toggle auto-renewal |
| `ss_domain_nameservers` | Update nameservers (basic or custom) |
| `ss_domain_contacts` | Update domain contacts |
| `ss_domain_privacy` | Set WHOIS privacy level |
| `ss_domain_transfer_lock` | Lock/unlock transfers |
| `ss_domain_email_protection` | Toggle contact form in WHOIS |

### DNS (3 tools)

| Tool | Description |
|------|-------------|
| `ss_dns_records` | List DNS records (A, AAAA, CNAME, MX, TXT, SRV, etc.) |
| `ss_dns_save` | Add or update records (up to 500 per call) |
| `ss_dns_delete` | Delete records by exact match |

### Contacts (4 tools)

| Tool | Description |
|------|-------------|
| `ss_contact_save` | Create/update contact, returns contact ID |
| `ss_contact_get` | Read contact details by ID |
| `ss_contact_attr_save` | Save TLD-specific contact attributes (e.g. .ca) |
| `ss_contact_attr_get` | Read contact attributes by ID |

### Transfers (4 tools)

| Tool | Description |
|------|-------------|
| `ss_domain_transfer` | Initiate inbound domain transfer (async) |
| `ss_domain_transfer_details` | Check transfer status |
| `ss_domain_auth_code` | Get EPP/auth code for outbound transfers |
| `ss_domain_restore` | Restore a deleted/expired domain (async) |

### Personal Nameservers (4 tools)

| Tool | Description |
|------|-------------|
| `ss_personal_ns_list` | List vanity/glue nameservers for a domain |
| `ss_personal_ns_get` | Get IPs for a specific nameserver host |
| `ss_personal_ns_update` | Create or update a personal nameserver |
| `ss_personal_ns_delete` | Delete a personal nameserver |

### SellerHub (7 tools)

| Tool | Description |
|------|-------------|
| `ss_sellerhub_list` | List marketplace listings |
| `ss_sellerhub_get` | Get listing details |
| `ss_sellerhub_create` | List a domain for sale |
| `ss_sellerhub_update` | Update listing (price, description) |
| `ss_sellerhub_delete` | Remove from SellerHub |
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

Domain registration, renewal, transfer, and restoration are asynchronous. These tools return an `asyncOperationId` — use `ss_async_status` to poll for completion. Statuses: `pending`, `success`, `failed`.

## Response Caching

GET responses are cached for 120 seconds by default (configurable via `SPACESHIP_CACHE_TTL`). Write operations automatically invalidate related cache entries. Set `SPACESHIP_CACHE_TTL=0` to disable caching entirely.

## Rate Limit Handling

When Spaceship returns HTTP 429, the client automatically retries with exponential backoff, respecting the `Retry-After` header when present. Default: up to 3 retries. Timeout errors are also retried.

## Security

- 30-second timeout on all HTTP requests
- Path injection prevention (rejects `..`, `#`)
- Automatic retry with backoff for rate limits and timeouts
- Error responses truncated to 500 characters
- Context-aware recovery hints in error messages
- JSON parsing wrapped in try/catch
- All parameters validated with Zod schemas
- No credentials stored on disk (env vars only)

## Architecture

```
src/
  index.ts               Entry point, env validation, config
  spaceship-client.ts    API client (key + secret headers, retry, caching)
  cache.ts               TTL-based response cache with write invalidation
  tools/
    domains.ts           Domain management + email protection (12 tools)
    dns.ts               DNS records (3 tools)
    contacts.ts          Contact management + TLD attributes (4 tools)
    transfer.ts          Transfers and restore (4 tools)
    nameservers.ts       Personal nameservers (4 tools)
    sellerhub.ts         Marketplace (7 tools)
    analysis.ts          DNS alignment check (1 tool)
    async.ts             Async operation polling (1 tool)
```

## Tech Stack

- TypeScript, ESM
- `@modelcontextprotocol/sdk` (stdio transport)
- Zod (schema validation)
- Native `fetch` with `AbortSignal.timeout`

## API Reference

- [Spaceship API docs](https://docs.spaceship.dev/)
- [API Manager](https://www.spaceship.com/application/api-manager/)

## License

[MIT](LICENSE)
