import { z } from "zod";
import type { DnsRecord } from "./types.js";

// Per-type record fields, as in the Spaceship API (*ResourceRecordCreateOrUpdateItem / *DeleteItem).
const host = (what: string) => z.string().min(1).max(253).describe(what);
const u16 = (what: string) => z.number().int().min(0).max(65535).describe(what);
const port = z.string().regex(/^(\*|_\d{1,5})$/).describe('Port: "*" or "_" + number, e.g. "_443"');
const proto = z.string().regex(/^_[a-zA-Z0-9-]+$/).describe('Protocol, e.g. "_tcp"');
const svcb = {
  svcPriority: u16("0 = AliasMode, otherwise ServiceMode priority"),
  targetName: z.string().max(253).describe('Target FQDN, or "." for the owner name'),
  svcParams: z.string().max(65535).default("").describe('Space-separated SvcParams, e.g. "alpn=h2,h3"'),
  port: port.optional(),
};

const TYPES = {
  A: { address: z.string().max(15).describe("IPv4 address") },
  AAAA: { address: z.string().max(45).describe("IPv6 address") },
  ALIAS: { aliasName: host("Alias target hostname") },
  CAA: {
    flag: z.union([z.literal(0), z.literal(128)]).describe("0, or 128 for the critical bit"),
    tag: z.enum(["issue", "issuewild", "iodef"]),
    value: z.string().max(256).describe('CA identifier, e.g. "ca.example.net"'),
  },
  CNAME: { cname: host("Canonical hostname") },
  HTTPS: { ...svcb, scheme: z.literal("_https").optional().describe('Required when port is set: "_https"') },
  MX: { exchange: host("Mail server hostname"), preference: u16("Preference (lower wins)") },
  NS: { nameserver: host("Nameserver hostname") },
  PTR: { pointer: host("Pointer target hostname") },
  SRV: {
    service: z.string().regex(/^_[a-zA-Z0-9-]+$/).describe('Service, e.g. "_sip"'),
    protocol: proto,
    priority: u16("Priority"),
    weight: u16("Weight"),
    port: z.number().int().min(1).max(65535).describe("Target port"),
    target: host("Target hostname"),
  },
  SVCB: { ...svcb, scheme: z.string().regex(/^_[a-zA-Z0-9-]+$/).optional().describe("Scheme, required when port is set") },
  TLSA: {
    port,
    protocol: proto,
    usage: z.number().int().min(0).max(255),
    selector: z.number().int().min(0).max(255),
    matching: z.number().int().min(0).max(255),
    associationData: z.string().regex(/^[0-9a-f]{2}(\s?[0-9a-f]{2})+$/).min(64).describe("Lowercase hex certificate association data"),
  },
  TXT: { value: z.string().min(1).max(65535).describe("Text value") },
} as const;

type RecordType = keyof typeof TYPES;

function union(withTtl: boolean) {
  const variants = (Object.keys(TYPES) as RecordType[]).map((type) =>
    z.object({
      type: z.literal(type),
      name: host('Record name ("@" for apex, "www", "*")'),
      ...(withTtl ? { ttl: z.number().int().min(60).max(3600).default(3600).describe("TTL in seconds (60-3600)") } : {}),
      ...TYPES[type],
    }),
  );
  return z.discriminatedUnion("type", variants as unknown as [typeof variants[0], ...typeof variants]);
}

export const saveRecordSchema = union(true);
export const deleteRecordSchema = union(false);

const s = (v: unknown) => (v == null ? "" : String(v));

/** Record value in zone-file order, e.g. MX "10 mail.example.com". */
export function recordValue(r: DnsRecord): string {
  switch (r.type) {
    case "A":
    case "AAAA": return s(r.address);
    case "ALIAS": return s(r.aliasName);
    case "CNAME": return s(r.cname);
    case "NS": return s(r.nameserver);
    case "PTR": return s(r.pointer);
    case "TXT": return s(r.value);
    case "MX": return `${s(r.preference)} ${s(r.exchange)}`;
    case "SRV": return `${s(r.priority)} ${s(r.weight)} ${s(r.port)} ${s(r.target)}`;
    case "CAA": return `${s(r.flag)} ${s(r.tag)} ${s(r.value)}`;
    case "HTTPS":
    case "SVCB": return `${s(r.svcPriority)} ${s(r.targetName)} ${s(r.svcParams)}`.trim();
    case "TLSA": return `${s(r.usage)} ${s(r.selector)} ${s(r.matching)} ${s(r.associationData)}`;
    default: return s(r.address ?? r.value);
  }
}

/** Owner name with SRV/TLSA/HTTPS/SVCB prefixes, e.g. "_sip._tcp.@". */
export function ownerName(r: DnsRecord): string {
  const prefix =
    r.type === "SRV" ? `${s(r.service)}.${s(r.protocol)}.`
    : r.type === "TLSA" ? `${s(r.port)}.${s(r.protocol)}.`
    : (r.type === "HTTPS" || r.type === "SVCB") && r.port ? `${s(r.port)}.${s(r.scheme)}.`
    : "";
  return prefix + r.name;
}
