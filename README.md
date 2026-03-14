# Spaceship MCP Server

MCP server for [Spaceship](https://www.spaceship.com) (by Namecheap) — domain registrar with DNS management, WHOIS privacy, domain transfers, and a built-in SellerHub marketplace. Manage everything from any MCP-compatible client.

27 tools across 6 categories.

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

| Variable | Required | Description |
|----------|----------|-------------|
| `SPACESHIP_API_KEY` | Yes | API key from [API Manager](https://www.spaceship.com/application/api-manager/) |
| `SPACESHIP_API_SECRET` | Yes | API secret from API Manager |

## Tools

### Domains (11 tools)

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

### DNS (3 tools)

| Tool | Description |
|------|-------------|
| `ss_dns_records` | List DNS records (A, AAAA, CNAME, MX, TXT, SRV, etc.) |
| `ss_dns_save` | Add or update records (up to 500 per call) |
| `ss_dns_delete` | Delete records by exact match |

### Contacts (2 tools)

| Tool | Description |
|------|-------------|
| `ss_contact_save` | Create/update contact, returns contact ID |
| `ss_contact_get` | Read contact details by ID |

### Transfers (4 tools)

| Tool | Description |
|------|-------------|
| `ss_domain_transfer` | Initiate inbound domain transfer (async) |
| `ss_domain_transfer_details` | Check transfer status |
| `ss_domain_auth_code` | Get EPP/auth code for outbound transfers |
| `ss_domain_restore` | Restore a deleted/expired domain (async) |

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

### Async Operations (1 tool)

| Tool | Description |
|------|-------------|
| `ss_async_status` | Check status of registration, renewal, transfer, or restore |

## Async Operations

Domain registration, renewal, transfer, and restoration are asynchronous. These tools return an `asyncOperationId` — use `ss_async_status` to poll for completion. Statuses: `pending`, `success`, `failed`.

## Security

- 30-second timeout on all HTTP requests
- Path injection prevention (rejects `..`, `#`)
- Error responses truncated to 500 characters
- JSON parsing wrapped in try/catch
- All parameters validated with Zod schemas
- No credentials stored on disk (env vars only)

## Architecture

```
src/
  index.ts               Entry point, env validation
  spaceship-client.ts    API client (key + secret headers)
  tools/
    domains.ts           Domain management (11 tools)
    dns.ts               DNS records (3 tools)
    contacts.ts          Contact management (2 tools)
    transfer.ts          Transfers and restore (4 tools)
    sellerhub.ts         Marketplace (7 tools)
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
