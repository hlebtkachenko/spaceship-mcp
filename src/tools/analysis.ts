import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpaceshipClient } from "../spaceship-client.js";
import type { DnsRecord, DnsRecordList } from "../types.js";
import { textResult, errorResult } from "../utils.js";
import { recordValue, ownerName } from "../records.js";

function recordKey(type: string, name: string, value: string): string {
  return `${type}:${name}:${value}`.toLowerCase();
}


export function registerAnalysisTools(server: McpServer, ss: SpaceshipClient) {
  server.tool(
    "ss_dns_alignment",
    "Compare expected DNS records against actual records to detect missing or unexpected entries. " +
      'Values use zone-file order: A/AAAA "192.0.2.1", CNAME/ALIAS/NS/PTR "host.example.com", TXT "v=spf1 -all", ' +
      'MX "10 mail.example.com", SRV "priority weight port target", CAA "0 issue ca.example.net", ' +
      'HTTPS/SVCB "svcPriority targetName svcParams", TLSA "usage selector matching data". ' +
      'SRV/TLSA names include their prefix, e.g. "_sip._tcp.@".',
    {
      domain: z.string().min(4).describe("Domain name"),
      expected: z.array(z.object({
        type: z.string().describe("Record type (A, CNAME, MX, TXT, etc.)"),
        name: z.string().describe("Record name (@ for apex)"),
        value: z.string().describe("Expected value, in the format given in the tool description"),
      })).min(1).describe("Expected DNS records"),
    },
    { readOnlyHint: true },
    async ({ domain, expected }) => {
      try {
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
          // The API returns at most 100 items per page whatever `take` is.
          skip += page.items.length;
        }

        const actualKeys = new Set(
          allRecords.map((r) => recordKey(r.type, ownerName(r), recordValue(r))),
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
            const name = ownerName(r);
            for (const e of expected) {
              if (e.type.toLowerCase() === r.type.toLowerCase() && e.name.toLowerCase() === name.toLowerCase()) {
                if (!expectedKeys.has(recordKey(r.type, name, val))) return true;
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
            lines.push(`- ${r.type} ${ownerName(r)} → ${recordValue(r)}`);
          }
          lines.push("");
        }

        if (!missing.length && !unexpected.length) {
          lines.push("All expected records are present and aligned.");
        }

        return textResult(lines.join("\n"));
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );
}
