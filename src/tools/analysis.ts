import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpaceshipClient } from "../spaceship-client.js";

interface DnsRecord {
  type: string;
  name: string;
  address?: string;
  value?: string;
  target?: string;
  priority?: number;
}

interface DnsRecordList {
  items: DnsRecord[];
  total: number;
}

function recordKey(type: string, name: string, value: string): string {
  return `${type}:${name}:${value}`.toLowerCase();
}

function recordValue(r: DnsRecord): string {
  return (r.address || r.value || r.target || "").toLowerCase();
}

export function registerAnalysisTools(server: McpServer, ss: SpaceshipClient) {
  server.tool(
    "ss_dns_alignment",
    "Compare expected DNS records against actual records to detect missing or unexpected entries",
    {
      domain: z.string().min(4).describe("Domain name"),
      expected: z.array(z.object({
        type: z.string().describe("Record type (A, CNAME, MX, TXT, etc.)"),
        name: z.string().describe("Record name (@ for apex)"),
        value: z.string().describe("Expected value"),
      })).min(1).describe("Expected DNS records"),
    },
    async ({ domain, expected }) => {
      let allRecords: DnsRecord[] = [];
      let skip = 0;
      const take = 500;

      while (true) {
        const page = await ss.get<DnsRecordList>(
          `/v1/dns/records/${encodeURIComponent(domain)}`,
          { take: String(take), skip: String(skip) },
        );
        if (!page?.items?.length) break;
        allRecords = allRecords.concat(page.items);
        if (allRecords.length >= page.total) break;
        skip += take;
      }

      const actualKeys = new Set(
        allRecords.map((r) => recordKey(r.type, r.name, recordValue(r))),
      );
      const expectedKeys = new Set(
        expected.map((r) => recordKey(r.type, r.name, r.value)),
      );

      const missing = expected.filter(
        (r) => !actualKeys.has(recordKey(r.type, r.name, r.value)),
      );
      const unexpected = allRecords.filter(
        (r) => {
          const val = recordValue(r);
          for (const e of expected) {
            if (e.type.toLowerCase() === r.type.toLowerCase() && e.name.toLowerCase() === r.name.toLowerCase()) {
              if (!expectedKeys.has(recordKey(r.type, r.name, val))) return true;
              return false;
            }
          }
          return false;
        },
      );
      const matched = expected.filter(
        (r) => actualKeys.has(recordKey(r.type, r.name, r.value)),
      );

      const lines = [`# DNS Alignment: ${domain}`, ""];

      if (matched.length) {
        lines.push(`## Matched (${matched.length})`);
        for (const r of matched) lines.push(`- ${r.type} ${r.name} → ${r.value}`);
        lines.push("");
      }

      if (missing.length) {
        lines.push(`## Missing (${missing.length})`);
        for (const r of missing) lines.push(`- ${r.type} ${r.name} → ${r.value}`);
        lines.push("");
      }

      if (unexpected.length) {
        lines.push(`## Unexpected (${unexpected.length})`);
        for (const r of unexpected) {
          lines.push(`- ${r.type} ${r.name} → ${recordValue(r)}`);
        }
        lines.push("");
      }

      if (!missing.length && !unexpected.length) {
        lines.push("All expected records are present and aligned.");
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );
}
