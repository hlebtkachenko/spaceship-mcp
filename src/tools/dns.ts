import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpaceshipClient } from "../spaceship-client.js";
import type { DnsRecord, DnsRecordList } from "../types.js";
import { textResult, errorResult, CONFIRM } from "../utils.js";
import { saveRecordSchema, deleteRecordSchema, recordValue, ownerName } from "../records.js";

function fmtRecord(r: DnsRecord): string {
  const ttl = r.ttl != null ? ` (ttl=${r.ttl})` : "";
  return `- **${r.type}** ${ownerName(r)} → ${recordValue(r)}${ttl}`;
}

export function registerDnsTools(server: McpServer, ss: SpaceshipClient) {
  server.tool(
    "ss_dns_records",
    "List DNS records for a domain (paginated; the API returns at most 100 records per page)",
    {
      domain: z.string().min(4).describe("Domain name"),
      take: z.number().int().min(1).max(500).default(100).describe("Items per page"),
      skip: z.number().int().min(0).default(0).describe("Items to skip"),
    },
    { readOnlyHint: true },
    async ({ domain, take, skip }) => {
      try {
        const data = await ss.get<DnsRecordList>(
          `/v1/dns/records/${encodeURIComponent(domain)}`,
          { take: String(take), skip: String(skip) },
        );

        if (!data?.items?.length) {
          return textResult(`No DNS records for ${domain}.`);
        }

        const lines = [`# DNS Records for ${domain} (${data.items.length} of ${data.total})`, ""];
        for (const r of data.items) lines.push(fmtRecord(r));
        const next = skip + data.items.length;
        if (data.total > next) {
          lines.push("", `Use skip=${next} to see more.`);
        }
        return textResult(lines.join("\n"));
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.tool(
    "ss_dns_save",
    "Add or update DNS records for a domain (up to 500 records per call). Each record carries the fields of its type: A/AAAA address, CNAME cname, MX exchange+preference, TXT value, ALIAS aliasName, NS nameserver, PTR pointer, CAA flag+tag+value, SRV service+protocol+priority+weight+port+target, HTTPS/SVCB svcPriority+targetName+svcParams, TLSA port+protocol+usage+selector+matching+associationData.",
    {
      domain: z.string().min(4).describe("Domain name"),
      records: z.array(saveRecordSchema).min(1).max(500).describe("Records to save"),
      force: z.boolean().default(false).describe("Overwrite conflicting records (e.g. replace an existing CNAME)"),
    },
    { destructiveHint: true, idempotentHint: true },
    async ({ domain, records, force }) => {
      try {
        await ss.put(`/v1/dns/records/${encodeURIComponent(domain)}`, {
          force,
          items: records,
        });
        return textResult(`Saved ${records.length} DNS record(s) for ${domain}.`);
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.tool(
    "ss_dns_delete",
    "Delete DNS records from a domain. Each record must match an existing one exactly, with the same per-type fields as ss_dns_save (no ttl).",
    {
      domain: z.string().min(4).describe("Domain name"),
      records: z.array(deleteRecordSchema).min(1).max(500).describe("Records to delete (must match exactly)"),
      confirm: CONFIRM,
    },
    { destructiveHint: true, idempotentHint: true },
    async ({ domain, records }) => {
      try {
        await ss.del(`/v1/dns/records/${encodeURIComponent(domain)}`, records);
        return textResult(`Deleted ${records.length} DNS record(s) from ${domain}.`);
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );
}
