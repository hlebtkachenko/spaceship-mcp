// Every tool, run through the built server against the fake API: asserts the exact request it sends.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fakeApi, startMcp, CONTACT, CONTACT2, text } from "./helpers.mjs";

let api;
let mcp;
before(async () => {
  api = await fakeApi();
  mcp = await startMcp(api);
});
after(async () => {
  await mcp?.close();
  api?.close();
});

const D = "example.com";
const contacts = { registrant: CONTACT, admin: CONTACT, tech: CONTACT, billing: CONTACT };

const CASES = [
  ["ss_domains", { take: 10, skip: 5 }, { method: "GET", path: "/v1/domains", query: { take: "10", skip: "5" } }],
  ["ss_domain_info", { domain: D }, { method: "GET", path: `/v1/domains/${D}` }],
  ["ss_domain_check", { domain: D }, { method: "GET", path: `/v1/domains/${D}/available` }],
  ["ss_domains_check", { domains: [D, "example.org"] }, { method: "POST", path: "/v1/domains/available", body: { domains: [D, "example.org"] } }],
  ["ss_domain_register",
    { domain: D, years: 1, autoRenew: false, privacyLevel: "public", userConsent: true, ...contacts, attributes: [CONTACT2], confirm: true },
    { method: "POST", path: `/v1/domains/${D}`, body: { autoRenew: false, years: 1, privacyProtection: { level: "public", userConsent: true }, contacts: { ...contacts, attributes: [CONTACT2] } } }],
  ["ss_domain_renew", { domain: D, years: 2, currentExpirationDate: "2027-01-15T00:00:00Z", confirm: true },
    { method: "POST", path: `/v1/domains/${D}/renew`, body: { years: 2, currentExpirationDate: "2027-01-15T00:00:00Z" } }],
  ["ss_domain_autorenew", { domain: D, enabled: true }, { method: "PUT", path: `/v1/domains/${D}/autorenew`, body: { isEnabled: true } }],
  ["ss_domain_nameservers", { domain: D, provider: "custom", hosts: ["ns1.example.net", "ns2.example.net"] },
    { method: "PUT", path: `/v1/domains/${D}/nameservers`, body: { provider: "custom", hosts: ["ns1.example.net", "ns2.example.net"] } }],
  ["ss_domain_contacts", { domain: D, registrant: CONTACT, tech: CONTACT2 },
    { method: "PUT", path: `/v1/domains/${D}/contacts`, body: { registrant: CONTACT, tech: CONTACT2 } }],
  ["ss_domain_privacy", { domain: D, level: "high", userConsent: true },
    { method: "PUT", path: `/v1/domains/${D}/privacy/preference`, body: { privacyLevel: "high", userConsent: true } }],
  ["ss_domain_transfer_lock", { domain: D, locked: true }, { method: "PUT", path: `/v1/domains/${D}/transfer/lock`, body: { isLocked: true } }],
  ["ss_domain_email_protection", { domain: D, contactForm: false },
    { method: "PUT", path: `/v1/domains/${D}/privacy/email-protection-preference`, body: { contactForm: false } }],
  ["ss_dns_records", { domain: D, take: 50, skip: 0 }, { method: "GET", path: `/v1/dns/records/${D}`, query: { take: "50", skip: "0" } }],
  ["ss_dns_save", { domain: D, records: [{ type: "A", name: "@", address: "192.0.2.1", ttl: 600 }] },
    { method: "PUT", path: `/v1/dns/records/${D}`, body: { force: false, items: [{ type: "A", name: "@", address: "192.0.2.1", ttl: 600 }] } }],
  ["ss_dns_delete", { domain: D, records: [{ type: "TXT", name: "@", value: "v=spf1 -all" }], confirm: true },
    { method: "DELETE", path: `/v1/dns/records/${D}`, body: [{ type: "TXT", name: "@", value: "v=spf1 -all" }] }],
  ["ss_dns_alignment", { domain: D, expected: [{ type: "A", name: "@", value: "192.0.2.1" }] },
    { method: "GET", path: `/v1/dns/records/${D}`, query: { take: "500", skip: "0" } }],
  ["ss_contact_save",
    { firstName: "Jane", lastName: "Doe", email: "jane@example.com", phone: "+1.5555555555", address1: "1 Main St", city: "Springfield", country: "US", postalCode: "12345" },
    { method: "PUT", path: "/v1/contacts", body: { firstName: "Jane", lastName: "Doe", email: "jane@example.com", phone: "+1.5555555555", address1: "1 Main St", city: "Springfield", country: "US", postalCode: "12345" } }],
  ["ss_contact_get", { contactId: CONTACT }, { method: "GET", path: `/v1/contacts/${CONTACT}` }],
  ["ss_contact_attr_save", { attributes: { type: "ca", agreementValue: true, language: "EN", registrantCiraCategory: "CCO" } },
    { method: "PUT", path: "/v1/contacts/attributes", body: { type: "ca", agreementValue: true, language: "EN", registrantCiraCategory: "CCO" } }],
  ["ss_contact_attr_get", { contactId: CONTACT }, { method: "GET", path: `/v1/contacts/attributes/${CONTACT}` }],
  ["ss_domain_transfer",
    { domain: D, autoRenew: true, privacyLevel: "high", userConsent: false, ...contacts, authCode: "SyntheticCode1", confirm: true },
    { method: "POST", path: `/v1/domains/${D}/transfer`, body: { autoRenew: true, privacyProtection: { level: "high", userConsent: false }, contacts, authCode: "SyntheticCode1" } }],
  ["ss_domain_transfer_details", { domain: D }, { method: "GET", path: `/v1/domains/${D}/transfer` }],
  ["ss_domain_auth_code", { domain: D }, { method: "GET", path: `/v1/domains/${D}/transfer/auth-code` }],
  ["ss_domain_restore", { domain: D, confirm: true }, { method: "POST", path: `/v1/domains/${D}/restore` }],
  ["ss_sellerhub_list", { take: 20, skip: 0 }, { method: "GET", path: "/v1/sellerhub/domains", query: { take: "20", skip: "0" } }],
  ["ss_sellerhub_get", { domain: D }, { method: "GET", path: `/v1/sellerhub/domains/${D}` }],
  ["ss_sellerhub_create", { name: D, displayName: D, description: "Synthetic", binPriceEnabled: true, binAmount: "999.99", minPriceEnabled: true, minAmount: "100" },
    { method: "POST", path: "/v1/sellerhub/domains", body: { name: D, displayName: D, description: "Synthetic", binPriceEnabled: true, binPrice: { amount: "999.99", currency: "USD" }, minPriceEnabled: true, minPrice: { amount: "100", currency: "USD" } } }],
  ["ss_sellerhub_update", { domain: D, binPriceEnabled: false, minAmount: "50" },
    { method: "PATCH", path: `/v1/sellerhub/domains/${D}`, body: { binPriceEnabled: false, minPrice: { amount: "50", currency: "USD" } } }],
  ["ss_sellerhub_delete", { domain: D, confirm: true }, { method: "DELETE", path: `/v1/sellerhub/domains/${D}` }],
  ["ss_sellerhub_checkout", { domain: D, amount: "500.00" },
    { method: "POST", path: "/v1/sellerhub/checkout-links", body: { type: "buyNow", domainName: D, basePrice: { amount: "500.00", currency: "USD" } } }],
  ["ss_sellerhub_verify", {}, { method: "GET", path: "/v1/sellerhub/verification-records" }],
  ["ss_async_status", { operationId: "op123" }, { method: "GET", path: "/v1/async-operations/op123" }],
  ["ss_personal_ns_list", { domain: D }, { method: "GET", path: `/v1/domains/${D}/personal-nameservers` }],
  ["ss_personal_ns_get", { domain: D, host: "ns1" }, { method: "GET", path: `/v1/domains/${D}/personal-nameservers/ns1` }],
  ["ss_personal_ns_update", { domain: D, currentHost: "ns1", host: "ns2", ips: ["192.0.2.2"] },
    { method: "PUT", path: `/v1/domains/${D}/personal-nameservers/ns1`, body: { host: "ns2", ips: ["192.0.2.2"] } }],
  ["ss_personal_ns_delete", { domain: D, host: "ns1", confirm: true }, { method: "DELETE", path: `/v1/domains/${D}/personal-nameservers/ns1` }],
];

test("every registered tool has a request test", async () => {
  const names = (await mcp.client.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(names, CASES.map(([n]) => n).sort());
});

for (const [name, args, expected] of CASES) {
  test(`${name} sends the expected request`, async () => {
    api.reset();
    const r = await mcp.call(name, args);
    assert.ok(!r.isError, text(r));
    assert.equal(api.requests.length, 1, JSON.stringify(api.requests));
    const [req] = api.requests;
    assert.equal(req.method, expected.method);
    assert.equal(req.path, expected.path);
    assert.deepEqual(req.query, expected.query ?? {});
    assert.deepEqual(req.body, expected.body);
  });
}
