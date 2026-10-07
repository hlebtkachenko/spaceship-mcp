// Validates every request the tools send (and the fake API's canned responses) against Spaceship's OpenAPI spec.
// Calls each tool with sample arguments (all fields, required fields only, one call per union branch)
// against a fake API, then checks method + path exist and that path/query params and the JSON body
// validate against the operation's schemas.
// Usage: npm run check:contract   (the spec is extracted from https://docs.spaceship.dev/ into .spec-cache/)
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { fakeApi, startMcp, CONTACT } from "../test/helpers.mjs";

const addFormats = addFormatsModule.default ?? addFormatsModule;
const CACHE = path.resolve(".spec-cache");
const SPEC_FILE = path.join(CACHE, "spaceship-openapi.json");

async function loadSpec() {
  if (!fs.existsSync(SPEC_FILE)) {
    const resp = await fetch("https://docs.spaceship.dev/");
    if (!resp.ok) throw new Error(`Cannot download docs.spaceship.dev: HTTP ${resp.status}`);
    const html = await resp.text();
    const marker = "__redoc_state = ";
    const start = html.indexOf(marker);
    if (start < 0) throw new Error("docs.spaceship.dev no longer embeds __redoc_state; update loadSpec()");
    // The state is a JSON object followed by ";": find its end by bracket matching outside strings.
    let depth = 0, inStr = false, i = start + marker.length;
    for (; i < html.length; i++) {
      const c = html[i];
      if (inStr) { if (c === "\\") i++; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) break;
    }
    const state = JSON.parse(html.slice(start + marker.length, i + 1));
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(SPEC_FILE, JSON.stringify(state.spec.data));
  }
  return JSON.parse(fs.readFileSync(SPEC_FILE, "utf8"));
}

// The spec models polymorphism with a discriminator on the base schema and allOf back to the base
// in each child, which JSON Schema validators ignore. Rewrite every reference to such a base
// (outside the children) into oneOf the mapped children, so per-type fields are checked.
function expandDiscriminators(spec) {
  const schemas = spec.components.schemas;
  const bases = {};
  for (const [name, s] of Object.entries(schemas)) {
    if (s.discriminator?.mapping) {
      bases[`#/components/schemas/${name}`] = Object.values(s.discriminator.mapping);
      delete s.discriminator;
    }
  }
  const children = new Set(Object.values(bases).flat().map((r) => r.split("/").pop()));
  const walk = (node, inChildAllOf) => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, inChildAllOf));
    if (!node || typeof node !== "object") return;
    if (node.$ref && bases[node.$ref] && !inChildAllOf) {
      node.oneOf = bases[node.$ref].map(($ref) => ({ $ref }));
      delete node.$ref;
    }
    for (const [k, v] of Object.entries(node)) walk(v, false);
  };
  for (const [name, s] of Object.entries(schemas)) {
    if (children.has(name)) {
      for (const [k, v] of Object.entries(s)) walk(v, k === "allOf");
    } else walk(s, false);
  }
  walk(spec.paths, false);
}

// OpenAPI 3.0 allows `nullable` next to allOf/$ref without `type`; ajv does not.
function normalizeNullable(node) {
  if (Array.isArray(node)) return node.forEach(normalizeNullable);
  if (!node || typeof node !== "object") return;
  for (const v of Object.values(node)) normalizeNullable(v);
  if (node.nullable && !node.type) {
    const rest = { ...node };
    delete rest.nullable;
    for (const k of Object.keys(node)) delete node[k];
    node.anyOf = [rest, { type: "null" }];
  }
}

const spec = await loadSpec();
expandDiscriminators(spec);
normalizeNullable(spec);

const ajv = new Ajv({ strict: false, unicodeRegExp: false, allErrors: true, validateSchema: false });
addFormats(ajv);
ajv.addFormat("domain", /^(?=.{4,255}$)([a-z0-9-]+\.)+[a-z0-9-]{2,}$/i);
ajv.addFormat("ip", (v) => net.isIP(v) !== 0);
for (const f of ["uint16", "taxNumber", "decimal"]) ajv.addFormat(f, true);
ajv.addSchema(spec, "spec.json");
const prefixRefs = (s) => JSON.parse(JSON.stringify(s).replaceAll('"$ref":"#/', '"$ref":"spec.json#/'));

const ops = [];
for (const [p, item] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(item)) {
    if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
    const names = [...p.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    const re = new RegExp("^" + p.replace(/\{\w+\}/g, "([^/]+)") + "$");
    ops.push({ method: method.toUpperCase(), path: p, re, names, op });
  }
}

function findOp(req) {
  return ops
    .filter((o) => o.method === req.method && o.re.test(req.path))
    .sort((a, b) => a.names.length - b.names.length)[0];
}

function checkRequest(req) {
  const o = findOp(req);
  if (!o) return [`no operation ${req.method} ${req.path} in the spec`];
  const errors = [];
  const values = { path: {}, query: req.query };
  const m = req.path.match(o.re);
  o.names.forEach((n, i) => { values.path[n] = decodeURIComponent(m[i + 1]); });
  for (const p of o.op.parameters ?? []) {
    if (!p.in || !(p.in in values)) continue;
    let v = values[p.in][p.name];
    if (v === undefined) {
      if (p.required) errors.push(`missing ${p.in} parameter ${p.name}`);
      continue;
    }
    if (["integer", "number"].includes(p.schema?.type)) v = Number(v);
    const validate = ajv.compile(prefixRefs(p.schema ?? {}));
    if (!validate(v)) errors.push(`${p.in} ${p.name}=${v}: ${ajv.errorsText(validate.errors)}`);
  }
  for (const k of Object.keys(req.query)) {
    if (!(o.op.parameters ?? []).some((p) => p.in === "query" && p.name === k)) errors.push(`unknown query parameter ${k}`);
  }
  const bodySchema = o.op.requestBody?.content?.["application/json"]?.schema;
  if (bodySchema) {
    const validate = ajv.compile(prefixRefs(bodySchema));
    if (req.body === undefined) {
      if (o.op.requestBody.required !== false) errors.push("missing request body");
    } else if (!validate(req.body)) {
      errors.push(...validate.errors.map((e) => `body${e.instancePath} ${e.message}`));
    }
  } else if (req.body !== undefined) {
    errors.push("operation takes no request body");
  }
  // The fake API's canned response must match the spec too, so tests cannot rely on made-up shapes.
  if (req.response) {
    const status = String(req.response.status ?? 200);
    const spec = o.op.responses?.[status];
    if (!spec) errors.push(`fake response status ${status} is not documented`);
    else {
      const schema = spec.content?.["application/json"]?.schema;
      if (schema && req.response.body !== undefined) {
        const validate = ajv.compile(prefixRefs(schema));
        if (!validate(req.response.body)) errors.push(...validate.errors.map((e) => `fake response${e.instancePath} ${e.message}`));
      } else if (schema) errors.push(`fake response ${status} has no body`);
      for (const [h, d] of Object.entries(spec.headers ?? {})) {
        if (d.required && !(h in (req.response.headers ?? {}))) errors.push(`fake response lacks header ${h}`);
      }
    }
  }
  return errors.length ? errors.map((e) => `${o.method} ${o.path}: ${e}`) : [];
}

// Synthetic sample values by property name; type-dependent ones get the record type.
const FIXTURES = {
  domain: "example.com", name: "example.com", displayName: "example.com", domains: "example.com",
  registrant: CONTACT, admin: CONTACT, tech: CONTACT, billing: CONTACT, contactId: CONTACT, attributes: CONTACT,
  cname: "host.example.com", aliasName: "host.example.com", nameserver: "ns1.example.net", pointer: "host.example.com",
  exchange: "mail.example.com", target: "sip.example.com", targetName: ".", svcParams: "alpn=h2",
  service: "_sip", protocol: "_tcp", associationData: "ab".repeat(32), value: "v=spf1 -all",
  email: "jane@example.com", phone: "+1.5555555555", firstName: "Jane", lastName: "Doe",
  address1: "1 Main St", address2: "Suite 2", city: "Springfield", country: "US", stateProvince: "Illinois",
  postalCode: "12345", organization: "Example Inc", currentExpirationDate: "2027-01-15T00:00:00Z",
  amount: "100.00", binAmount: "100.00", minAmount: "100.00", authCode: "SyntheticCode1", operationId: "op123",
  host: "ns1", currentHost: "ns1", ips: "192.0.2.1", hosts: "ns1.example.net", description: "Synthetic listing",
  scheme: "_https",
};

// Returns one sample per union branch (at least one).
function samples(schema, key, mode, recordType) {
  if (schema.const !== undefined) return [schema.const];
  const branches = schema.oneOf ?? schema.anyOf;
  if (branches) return branches.flatMap((b) => samples(b, key, mode, recordType));
  // Every value of a "type" enum, since it usually selects different fields; the first otherwise.
  if (schema.enum) return key === "type" ? schema.enum : [schema.enum[0]];
  switch (schema.type) {
    case "object": {
      const type = schema.properties?.type?.const;
      const keys = Object.keys(schema.properties ?? {}).filter((k) => mode === "full" || schema.required?.includes(k));
      const per = keys.map((k) => samples(schema.properties[k], k, mode, type));
      const n = Math.max(1, ...per.map((s) => s.length));
      return Array.from({ length: n }, (_, i) => Object.fromEntries(keys.map((k, j) => [k, per[j][i % per[j].length]])));
    }
    case "array": {
      const items = samples(schema.items ?? {}, key, mode, recordType);
      const min = Math.max(1, schema.minItems ?? 1);
      return items.map((it) => Array.from({ length: min }, (_, i) => (key === "hosts" ? `ns${i + 1}.example.net` : it)));
    }
    case "string":
      if (key === "address") return [recordType === "AAAA" ? "2001:db8::1" : "192.0.2.1"];
      if (key === "port") return ["_443"];
      if (key === "value" && recordType === "CAA") return ["ca.example.net"];
      return [FIXTURES[key] ?? "X1"];
    case "integer":
    case "number":
      if (key === "port") return [5060];
      return [Math.max(1, schema.minimum ?? 1)];
    case "boolean":
      return [true];
    default:
      return [FIXTURES[key] ?? "X1"];
  }
}

// Self-test: the discriminator expansion must reject an MX record without exchange/preference.
if (!checkRequest({ method: "PUT", path: "/v1/dns/records/example.com", query: {}, body: { items: [{ type: "MX", name: "@", address: "mail.example.com" }] } }).length) {
  throw new Error("contract check self-test failed: per-type record fields are not validated");
}
if (!checkRequest({ method: "GET", path: "/v1/domains/example.com", query: {}, response: { body: { name: "example.com" } } }).length) {
  throw new Error("contract check self-test failed: fake responses are not validated");
}

const api = await fakeApi();
const mcp = await startMcp(api);
let failed = 0;
const { tools } = await mcp.client.listTools();
for (const tool of tools) {
  for (const mode of ["full", "required"]) {
    for (const args of samples(tool.inputSchema, "", mode)) {
      const label = `${tool.name} (${mode}${args.records ? ` ${args.records[0].type}` : ""}${args.attributes?.type ? ` ${args.attributes.type}` : ""})`;
      api.reset();
      const r = await mcp.call(tool.name, args);
      if (!api.requests.length) {
        failed++;
        console.log(`FAIL ${label}: no request sent: ${r.content?.[0]?.text}`);
        continue;
      }
      const errors = api.requests.flatMap(checkRequest);
      if (errors.length) {
        failed++;
        console.log(`FAIL ${label}\n     ${errors.join("\n     ")}`);
      } else console.log(`ok   ${label}`);
    }
  }
}

await mcp.close();
api.close();
console.log(failed ? `\n${failed} call(s) send requests that do not match the spec.` : "\nAll tools send spec-valid requests.");
process.exit(failed ? 1 : 0);
