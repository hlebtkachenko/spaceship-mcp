# Architecture

## Structure

```
src/
  index.ts              Entry point: env config, tool registration
  spaceship-client.ts   API client (key + secret headers, timeouts, retries, caching, error text)
  cache.ts              TTL response cache with substring invalidation
  records.ts            Per-type DNS record schemas and zone-style value formatting
  types.ts              DNS record types
  utils.ts              Tool result helpers, CONFIRM parameter
  tools/                One file per area; each registers its MCP tools
test/                   node:test suite, runs dist/ against a fake Spaceship API
scripts/check-contract.mjs   Validates every tool's request against the Spaceship OpenAPI spec
```

## Flow

```
MCP client --stdio--> tool handler (zod-validated args) --> SpaceshipClient.request --HTTPS--> spaceship.dev/api
                           ^                                        |
                           +---- text result / isError <------------+
```

## Design notes

- **The spec is the contract.** Spaceship publishes its OpenAPI spec inside https://docs.spaceship.dev/ (`__redoc_state`). `npm run check:contract` extracts it to `.spec-cache/`, calls every tool (all fields, required only, one call per union branch) and validates method, path, parameters and body with ajv, plus the fake API's canned response against the operation's response schema. The spec puts a `discriminator` on base schemas (DNS records, contact attributes), which validators ignore; the script rewrites those references to `oneOf` the mapped types.
- **DNS records** use a different field per type (MX `exchange`+`preference`, CNAME `cname`, ...). `records.ts` holds the zod union for save/delete and `recordValue`/`ownerName` for listing and `ss_dns_alignment`. The list endpoint returns at most 100 items per page, so paging advances by the number of items returned.
- **Retries**: 429 is retried for every method (not processed). Timeouts are retried only for GET/PUT/DELETE; a POST/PATCH that timed out or lost its connection may have charged the account, so it fails with "outcome unknown". `Retry-After` accepts seconds or an HTTP date, capped at 30 s. HTTP errors are never retried.
- **Errors**: HTTP errors carry the API `detail` plus per-field validation `data`; an async operation with status `failed` is returned as an error.
- **Cache**: GETs are cached (`SPACESHIP_CACHE_TTL`), except async operations and transfer status. Writes invalidate the domain's entries and the domain list, including 202 (async) responses.
- **Safety**: spend tools (register, renew, transfer, restore) and delete tools require `confirm: true`; WHOIS `userConsent` is always an explicit parameter.
