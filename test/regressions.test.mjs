// One regression test per review finding (numbers match the review), plus error-surfacing checks.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fakeApi, startMcp, CONTACT, text } from "./helpers.mjs";
import { SpaceshipClient } from "../dist/spaceship-client.js";

let api;
let mcp;
let cached;
before(async () => {
  api = await fakeApi();
  mcp = await startMcp(api);
  cached = await startMcp(api, { SPACESHIP_CACHE_TTL: "120" });
});
after(async () => {
  await mcp?.close();
  await cached?.close();
  api?.close();
});

const D = "example.com";
const contacts = { registrant: CONTACT, admin: CONTACT, tech: CONTACT, billing: CONTACT };

test("1: dns save and delete send per-type record fields", async () => {
  api.reset();
  const records = [
    { type: "MX", name: "@", exchange: "mail.example.com", preference: 10 },
    { type: "CNAME", name: "www", cname: "example.net" },
    { type: "SRV", name: "@", service: "_sip", protocol: "_tcp", priority: 10, weight: 5, port: 5060, target: "sip.example.com" },
    { type: "CAA", name: "@", flag: 0, tag: "issue", value: "ca.example.net" },
  ];
  let r = await mcp.call("ss_dns_save", { domain: D, records });
  assert.ok(!r.isError, text(r));
  assert.deepEqual(api.requests[0].body.items, records.map((x) => ({ ...x, ttl: 3600 })));

  api.reset();
  r = await mcp.call("ss_dns_delete", { domain: D, records, confirm: true });
  assert.ok(!r.isError, text(r));
  assert.deepEqual(api.requests[0].body, records);

  api.reset();
  r = await mcp.call("ss_dns_save", { domain: D, records: [{ type: "MX", name: "@", address: "mail.example.com" }] });
  assert.ok(r.isError, "MX without exchange/preference must be rejected");
  assert.equal(api.requests.length, 0);
});

test("2: POST timeout is not retried and reports an unknown outcome", async () => {
  api.reset();
  api.handler = () => "hang";
  const client = new SpaceshipClient({ apiKey: "k", apiSecret: "s", baseUrl: api.url, timeoutMs: 150, maxRetries: 2, cacheTtl: 0 });
  await assert.rejects(client.post(`/v1/domains/${D}`, { years: 1 }), /outcome unknown/i);
  assert.equal(api.requests.filter((q) => q.method === "POST").length, 1);

  api.reset();
  api.handler = () => "hang";
  await assert.rejects(client.get(`/v1/domains/${D}`));
  assert.equal(api.requests.filter((q) => q.method === "GET").length, 3, "GET timeouts are retried");
});

test("2: an error whose text contains 429 is not retried", async () => {
  api.reset();
  api.handler = () => ({ status: 400, body: { detail: "Invalid port 429" } });
  const client = new SpaceshipClient({ apiKey: "k", apiSecret: "s", baseUrl: api.url, maxRetries: 2, cacheTtl: 0 });
  await assert.rejects(client.put(`/v1/domains/${D}/autorenew`, { isEnabled: true }), /400/);
  assert.equal(api.requests.length, 1);
});

const typedRecords = [
  { type: "MX", name: "@", exchange: "mail.example.com", preference: 10, group: { type: "custom" } },
  { type: "CNAME", name: "www", cname: "example.net", group: { type: "custom" } },
  { type: "TXT", name: "@", value: "v=spf1 -all", group: { type: "custom" } },
];

test("3: dns listing formats each record type with its own fields", async () => {
  api.reset();
  api.handler = () => ({ body: { items: typedRecords, total: 3 } });
  const r = await mcp.call("ss_dns_records", { domain: D });
  const out = text(r);
  assert.match(out, /MX\*\* @ → 10 mail\.example\.com/);
  assert.match(out, /CNAME\*\* www → example\.net/);
  assert.match(out, /TXT\*\* @ → v=spf1 -all/);
});

test("4: alignment reads per-type values and pages by returned item count", async () => {
  api.reset();
  const many = Array.from({ length: 150 }, (_, i) => ({ type: "A", name: `h${i}`, address: "192.0.2.1", group: { type: "custom" } }));
  const all = [...typedRecords, ...many];
  api.handler = (req) => {
    const skip = Number(req.query.skip);
    return { body: { items: all.slice(skip, skip + 100), total: all.length } };
  };
  const r = await mcp.call("ss_dns_alignment", {
    domain: D,
    expected: [
      { type: "MX", name: "@", value: "10 mail.example.com" },
      { type: "CNAME", name: "www", value: "example.net" },
      { type: "A", name: "h149", value: "192.0.2.1" },
    ],
  });
  const out = text(r);
  assert.match(out, /Matched \(3\)/, out);
  assert.doesNotMatch(out, /Missing|Unexpected/);
  assert.deepEqual(api.requests.map((q) => q.query.skip), ["0", "100"]);
});

test("5: async operation and transfer status are never served from cache", async () => {
  api.reset();
  await cached.call("ss_async_status", { operationId: "op1" });
  await cached.call("ss_async_status", { operationId: "op1" });
  await cached.call("ss_domain_transfer_details", { domain: "example.net" });
  await cached.call("ss_domain_transfer_details", { domain: "example.net" });
  assert.equal(api.requests.length, 4);
});

test("6: userConsent is a required parameter passed through as given", async () => {
  api.reset();
  const base = { domain: D, years: 1, autoRenew: false, privacyLevel: "high", ...contacts, confirm: true };
  const missing = await mcp.call("ss_domain_register", base);
  assert.ok(missing.isError);
  assert.equal(api.requests.length, 0);
  const r = await mcp.call("ss_domain_register", { ...base, userConsent: false });
  assert.ok(!r.isError, text(r));
  assert.equal(api.requests[0].body.privacyProtection.userConsent, false);

  api.reset();
  assert.ok((await mcp.call("ss_domain_privacy", { domain: D, level: "public" })).isError);
  await mcp.call("ss_domain_privacy", { domain: D, level: "public", userConsent: false });
  assert.equal(api.requests[0].body.userConsent, false);
});

test("7: contact attributes are modelled per type and passed to register", async () => {
  api.reset();
  let r = await mcp.call("ss_contact_attr_save", { attributes: { type: "us", appPurpose: "P1", nexusCategory: "C11" } });
  assert.ok(!r.isError, text(r));
  assert.deepEqual(api.requests[0].body, { type: "us", appPurpose: "P1", nexusCategory: "C11" });
  r = await mcp.call("ss_contact_attr_save", { attributes: { type: "ca", agreementValue: true, language: "EN" } });
  assert.ok(r.isError, "ca without registrantCiraCategory must be rejected");
  r = await mcp.call("ss_contact_attr_save", { attributes: { type: "ca", agreementValue: true, language: "EN", registrantCiraCategory: "XYZ" } });
  assert.ok(r.isError, "unknown CIRA category must be rejected");
});

test("8: tools carry annotations and spend/delete tools require confirm", async () => {
  const { tools } = await mcp.client.listTools();
  for (const t of tools) assert.ok(t.annotations && Object.keys(t.annotations).length, `${t.name} has no annotations`);
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
  for (const n of ["ss_domain_register", "ss_domain_renew", "ss_domain_transfer", "ss_domain_restore", "ss_dns_delete", "ss_personal_ns_delete", "ss_sellerhub_delete"]) {
    assert.ok(byName[n].inputSchema.required.includes("confirm"), `${n} requires confirm`);
    assert.equal(byName[n].annotations.destructiveHint, true, n);
  }
  for (const n of ["ss_domain_nameservers", "ss_domain_transfer_lock", "ss_sellerhub_create", "ss_sellerhub_update"]) {
    assert.ok("destructiveHint" in byName[n].annotations, n);
  }
  assert.equal(byName.ss_domains.annotations.readOnlyHint, true);
  assert.match(byName.ss_domain_auth_code.description, /transcript/i);
  api.reset();
  const r = await mcp.call("ss_domain_restore", { domain: D });
  assert.ok(r.isError);
  assert.equal(api.requests.length, 0);
});

test("9: validation error field details reach the model", async () => {
  api.reset();
  api.handler = () => ({ status: 422, body: { detail: "Validation failed", data: [{ field: "items[0].exchange", details: "is required" }] } });
  const r = await mcp.call("ss_domain_autorenew", { domain: D, enabled: true });
  assert.ok(r.isError);
  assert.match(text(r), /items\[0\]\.exchange: is required/);
});

test("10: domain writes (including 202 responses) invalidate domain info and the domain list", async () => {
  api.reset();
  await cached.call("ss_domains", {});
  await cached.call("ss_domain_info", { domain: D });
  await cached.call("ss_domain_register", { domain: D, years: 1, autoRenew: false, privacyLevel: "high", userConsent: true, ...contacts, confirm: true });
  await cached.call("ss_domain_info", { domain: D });
  await cached.call("ss_domain_autorenew", { domain: "example.org", enabled: true });
  await cached.call("ss_domains", {});
  assert.equal(api.requests.filter((q) => q.method === "GET").length, 4);
});

test("11: TTL is capped at 3600 and currency is USD only", async () => {
  api.reset();
  const ttl = await mcp.call("ss_dns_save", { domain: D, records: [{ type: "A", name: "@", address: "192.0.2.1", ttl: 7200 }] });
  assert.ok(ttl.isError);
  const cur = await mcp.call("ss_sellerhub_create", { name: D, binAmount: "10", binCurrency: "EUR" });
  assert.ok(cur.isError);
  assert.equal(api.requests.length, 0);
});

test("12: README tool tables and counts match the registered tools", async () => {
  const names = (await mcp.client.listTools()).tools.map((t) => t.name).sort();
  const readme = fs.readFileSync("README.md", "utf8");
  const listed = [...readme.matchAll(/^\| `(ss_[a-z_]+)` \|/gm)].map((m) => m[1]).sort();
  assert.deepEqual(listed, names);
  const sections = [...readme.matchAll(/^### .+ \((\d+) tools?\)$/gm)].map((m) => Number(m[1]));
  const [, total, categories] = readme.match(/(\d+) tools across (\d+) categories/);
  assert.equal(Number(total), names.length);
  assert.equal(Number(categories), sections.length);
  assert.equal(sections.reduce((a, b) => a + b, 0), names.length);
});

test("failed async operation is reported as an error", async () => {
  api.reset();
  api.handler = () => ({ body: { status: "failed", type: "domains_Create", createdAt: "2026-01-15T00:00:00Z", details: { reason: "synthetic" } } });
  const r = await mcp.call("ss_async_status", { operationId: "op1" });
  assert.ok(r.isError);
});
