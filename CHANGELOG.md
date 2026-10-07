# Changelog

## [3.0.0] - 2026-10-07

### Breaking
- `ss_dns_save` / `ss_dns_delete`: records use the per-type fields of the Spaceship API (MX `exchange`+`preference`, CNAME `cname`, TXT `value`, SRV, CAA, HTTPS, SVCB, TLSA, ...) instead of `address`/`priority`. TTL is limited to 60-3600.
- `ss_domain_register`, `ss_domain_transfer`, `ss_domain_privacy`: `userConsent` is a required parameter (it was always sent as `true`).
- `ss_contact_attr_save`: takes `attributes` (`ca` or `us`), with the required CIRA category for .ca and application purpose + nexus category for .us.
- Spend tools (`ss_domain_register`, `ss_domain_renew`, `ss_domain_transfer`, `ss_domain_restore`) and delete tools (`ss_dns_delete`, `ss_personal_ns_delete`, `ss_sellerhub_delete`) require `confirm: true`.
- SellerHub currencies accept `USD` only; amounts must look like `999.99`.

### Fixed
- A timed-out POST/PATCH is no longer retried (could register or renew twice); it returns an "outcome unknown" error. Only real 429 responses are retried, not any error mentioning 429.
- DNS listing and `ss_dns_alignment` read the per-type fields (MX `preference`, CNAME `cname`, ...), and alignment pages by the number of items returned (max 100).
- Async operation and transfer status are no longer cached; domain writes (including async 202 responses) invalidate the domain list.
- API validation errors include the per-field details.
- A `failed` async operation is returned as an error.

### Added
- `attributes` (contact attribute IDs) on `ss_domain_register` and `ss_domain_transfer`.
- MCP annotations on every tool.
- `SPACESHIP_BASE_URL` env var, node:test suite, `npm run check:contract`.
- Requires Node 22+; MCP SDK 1.32, zod 4, TypeScript 7.

## [2.0.0] - 2026-03-14
- Complete rewrite with improved architecture
- 36 tools for Spaceship domain management
- Docker support
- Response caching with TTL
