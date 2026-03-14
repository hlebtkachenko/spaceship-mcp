import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpaceshipClient } from "../spaceship-client.js";
import type { DnsRecord, DnsRecordList } from "../types.js";
import { textResult, errorResult } from "../utils.js";

const RECORD_TYPE = z.enum([
  "A", "AAAA", "ALIAS", "CAA", "CNAME", "HTTPS", "MX", "NS", "PTR", "SRV", "SVCB", "TLSA", "TXT",
]);

function fmtRecord(r: DnsRecord): string {
  const val = r.address || r.value || r.target || "";
  const extra: string[] = [];
  if (r.ttl != null) extra.push(`ttl=${r.ttl}`);
  if (r.priority != null) extra.push(`prio=${r.priority}`);
  if (r.weight != null) extra.push(`weight=${r.weight}`);
  if (r.port != null) extra.push(`port=${r.port}`);
  const suffix = extra.length ? ` (${extra.join(", ")})` : "";
  return `- **${r.type}** ${r.name} → ${val}${suffix}`;
}

export function registerDnsTools(server: McpServer, ss: SpaceshipClient) {
  server.tool(
    "ss_dns_records",
    "List DNS records for a domain (paginated)",
    {
      domain: z.string().min(4).describe("Domain name"),
      take: z.number().int().min(1).max(500).default(100).describe("Items per page"),
      skip: z.number().int().min(0).default(0).describe("Items to skip"),
    },
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
        if (data.total > skip + take) {
          lines.push("", `Use skip=${skip + take} to see more.`);
        }
        return textResult(lines.join("\n"));
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.tool(
    "ss_dns_save",
    "Add or update DNS records for a domain (up to 500 records per call)",
    {
      domain: z.string().min(4).describe("Domain name"),
      records: z.array(z.object({
        type: RECORD_TYPE.describe("Record type"),
        name: z.string().describe("Record name (@ for apex, www, mail, etc.)"),
        address: z.string().describe("Record value (IP, hostname, text)"),
        ttl: z.number().int().min(60).default(3600).describe("TTL in seconds"),
        priority: z.number().int().optional().describe("Priority (MX, SRV)"),
      })).min(1).max(500).describe("Records to save"),
      force: z.boolean().default(false).describe("Force update (skip conflict check)"),
    },
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
    "Delete DNS records from a domain",
    {
      domain: z.string().min(4).describe("Domain name"),
      records: z.array(z.object({
        type: RECORD_TYPE.describe("Record type"),
        name: z.string().describe("Record name"),
        address: z.string().describe("Record value to match"),
      })).min(1).max(500).describe("Records to delete (must match exactly)"),
    },
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
