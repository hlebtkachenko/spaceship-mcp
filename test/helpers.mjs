// Shared test harness: a fake Spaceship API over HTTP and an MCP client running dist/index.js against it.
// All data is synthetic (example.com, 192.0.2.x, placeholder contact IDs).
import http from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export const CONTACT = "ContactIdPlaceholder0000000001";
export const CONTACT2 = "ContactIdPlaceholder0000000002";

// Canned responses follow the spec's response schemas (npm run check:contract validates them).
const DATE = "2026-01-15T00:00:00Z";
const DOMAIN = {
  name: "example.com", unicodeName: "example.com", isPremium: false, autoRenew: true,
  registrationDate: DATE, expirationDate: "2027-01-15T00:00:00Z", lifecycleStatus: "registered",
  verificationStatus: "success", eppStatuses: ["clientTransferProhibited"], suspensions: [],
  privacyProtection: { contactForm: true, level: "high" },
  nameservers: { provider: "basic", hosts: ["ns1.example.net", "ns2.example.net"] },
  contacts: { registrant: CONTACT, admin: CONTACT, tech: CONTACT, billing: CONTACT, attributes: [] },
};
const LISTING = { name: "example.com", unicodeName: "example.com", status: "onSale" };

function defaultResponse({ method, path, body }) {
  if (method === "GET") {
    if (path === "/v1/domains") return { body: { items: [DOMAIN], total: 1 } };
    if (/^\/v1\/domains\/[^/]+\/available$/.test(path)) return { body: { domain: "example.com", result: "available", premiumPricing: [] } };
    if (/\/personal-nameservers$/.test(path)) return { body: { records: [{ host: "ns1", ips: ["192.0.2.1"] }] } };
    if (/\/personal-nameservers\//.test(path)) return { body: { host: "ns1", ips: ["192.0.2.1"] } };
    if (/\/transfer\/auth-code$/.test(path)) return { body: { authCode: "SyntheticCode1", expires: "2027-01-15T00:00:00Z" } };
    if (/\/transfer$/.test(path)) return { body: { direction: "in", status: "pending", startedAt: DATE } };
    if (/^\/v1\/domains\/[^/]+$/.test(path)) return { body: DOMAIN };
    if (path.startsWith("/v1/dns/records/")) return { body: { items: [], total: 0 } };
    if (path.startsWith("/v1/contacts/attributes/")) return { body: { type: "us", appPurpose: "P1", nexusCategory: "C11" } };
    if (path.startsWith("/v1/contacts/")) return { body: { firstName: "Jane", lastName: "Doe", email: "jane@example.com", phone: "+1.5555555555", address1: "1 Main St", city: "Springfield", country: "US" } };
    if (path.startsWith("/v1/async-operations/")) return { body: { status: "pending", type: "domains_Create", createdAt: DATE } };
    if (path === "/v1/sellerhub/domains") return { body: { items: [LISTING], total: 1 } };
    if (path === "/v1/sellerhub/verification-records") return { body: { options: [{ records: [{ type: "TXT", name: "@", value: "synthetic-verification" }] }] } };
    if (path.startsWith("/v1/sellerhub/domains/")) return { body: LISTING };
    return { body: {} };
  }
  if (method === "POST") {
    if (path === "/v1/domains/available") return { body: { domains: [] } };
    if (/^\/v1\/domains\/[^/]+(\/renew|\/transfer|\/restore)?$/.test(path)) {
      return { status: 202, headers: { "spaceship-async-operationid": "op123" } };
    }
    if (path === "/v1/sellerhub/checkout-links") return { body: { url: "https://example.com/checkout", validTill: "2027-01-15T00:00:00Z" } };
    if (path === "/v1/sellerhub/domains") return { status: 201, body: LISTING };
  }
  if (method === "PATCH") return { body: LISTING };
  if (method === "PUT") {
    if (path.startsWith("/v1/contacts")) return { body: { contactId: CONTACT } };
    if (/\/(autorenew|transfer\/lock|personal-nameservers\/[^/]+)$/.test(path)) return { body };
    if (path.endsWith("/contacts")) return { body: { verificationStatus: null } };
    if (path.endsWith("/nameservers")) return { body: { provider: "custom", hosts: ["ns1.example.net", "ns2.example.net"] } };
  }
  return { status: 204 };
}

export async function fakeApi() {
  const api = { requests: [], handler: null };
  api.server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const u = new URL(req.url, "http://localhost");
      // Ignore anything that is not an API call (e.g. local port probes sending HEAD /).
      if (!u.pathname.startsWith("/api/")) return res.writeHead(404).end();
      const text = Buffer.concat(chunks).toString();
      const r = {
        method: req.method,
        path: u.pathname.replace(/^\/api/, ""),
        query: Object.fromEntries(u.searchParams),
        body: text ? JSON.parse(text) : undefined,
      };
      api.requests.push(r);
      const out = api.handler?.(r) ?? defaultResponse(r);
      if (out === "hang") return;
      if (out === "drop") return req.socket.destroy();
      r.response = out;
      res.writeHead(out.status ?? 200, { "Content-Type": "application/json", ...(out.headers ?? {}) });
      res.end(out.body === undefined ? "" : JSON.stringify(out.body));
    });
  });
  await new Promise((r) => api.server.listen(0, "127.0.0.1", r));
  api.url = `http://127.0.0.1:${api.server.address().port}/api`;
  api.close = () => {
    api.server.closeAllConnections();
    api.server.close();
  };
  api.reset = () => {
    api.requests.length = 0;
    api.handler = null;
  };
  return api;
}

export async function startMcp(api, env = {}) {
  const client = new Client({ name: "test", version: "0" });
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    env: {
      SPACESHIP_API_KEY: "test-key",
      SPACESHIP_API_SECRET: "test-secret",
      SPACESHIP_BASE_URL: api.url,
      SPACESHIP_CACHE_TTL: "0",
      SPACESHIP_MAX_RETRIES: "1",
      ...env,
    },
  }));
  return {
    client,
    call: (name, args = {}) => client.callTool({ name, arguments: args }),
    close: () => client.close(),
  };
}

export const text = (r) => r.content.map((c) => c.text).join("\n");
