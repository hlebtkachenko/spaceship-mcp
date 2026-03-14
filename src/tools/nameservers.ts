import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpaceshipClient } from "../spaceship-client.js";
import { textResult, errorResult } from "../utils.js";

interface PersonalNs {
  host: string;
  ips: string[];
}

export function registerNameserverTools(server: McpServer, ss: SpaceshipClient) {
  server.tool(
    "ss_personal_ns_list",
    "List personal (vanity/glue) nameservers for a domain",
    { domain: z.string().min(4).describe("Domain name") },
    async ({ domain }) => {
      try {
        const data = await ss.get<{ records: PersonalNs[] }>(
          `/v1/domains/${encodeURIComponent(domain)}/personal-nameservers`,
        );
        if (!data?.records?.length) {
          return textResult(`No personal nameservers for ${domain}.`);
        }
        const lines = [`# Personal Nameservers for ${domain}`, ""];
        for (const ns of data.records) {
          lines.push(`- **${ns.host}.${domain}** → ${ns.ips.join(", ")}`);
        }
        return textResult(lines.join("\n"));
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.tool(
    "ss_personal_ns_get",
    "Get IP addresses for a specific personal nameserver host",
    {
      domain: z.string().min(4).describe("Domain name"),
      host: z.string().min(1).describe("Host name (e.g. ns1)"),
    },
    async ({ domain, host }) => {
      try {
        const data = await ss.get<{ ips: string[] }>(
          `/v1/domains/${encodeURIComponent(domain)}/personal-nameservers/${encodeURIComponent(host)}`,
        );
        return textResult(`**${host}.${domain}** → ${data.ips?.join(", ") || "no IPs"}`);
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.tool(
    "ss_personal_ns_update",
    "Create or update a personal nameserver (glue record)",
    {
      domain: z.string().min(4).describe("Domain name"),
      currentHost: z.string().min(1).describe("Current host name to update (e.g. ns1)"),
      host: z.string().min(1).describe("New host name (same as current to keep)"),
      ips: z.array(z.string()).min(1).max(16).describe("IP addresses for this nameserver"),
    },
    async ({ domain, currentHost, host, ips }) => {
      try {
        await ss.put(
          `/v1/domains/${encodeURIComponent(domain)}/personal-nameservers/${encodeURIComponent(currentHost)}`,
          { host, ips },
        );
        return textResult(`Personal nameserver updated: ${host}.${domain} → ${ips.join(", ")}`);
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.tool(
    "ss_personal_ns_delete",
    "Delete a personal nameserver from a domain",
    {
      domain: z.string().min(4).describe("Domain name"),
      host: z.string().min(1).describe("Host name to delete (e.g. ns1)"),
    },
    async ({ domain, host }) => {
      try {
        await ss.del(
          `/v1/domains/${encodeURIComponent(domain)}/personal-nameservers/${encodeURIComponent(host)}`,
        );
        return textResult(`Deleted personal nameserver ${host}.${domain}.`);
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );
}
