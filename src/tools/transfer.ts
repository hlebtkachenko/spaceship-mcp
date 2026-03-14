import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpaceshipClient } from "../spaceship-client.js";
import { textResult, errorResult } from "../utils.js";

interface TransferDetails {
  startedAt?: string;
  finishedAt?: string;
  direction?: string;
  status?: string;
}

export function registerTransferTools(server: McpServer, ss: SpaceshipClient) {
  server.tool(
    "ss_domain_transfer",
    "Initiate a domain transfer into Spaceship (async operation)",
    {
      domain: z.string().min(4).describe("Domain to transfer"),
      autoRenew: z.boolean().describe("Enable auto-renewal after transfer"),
      privacyLevel: z.enum(["public", "high"]).default("high").describe("Privacy level"),
      registrant: z.string().describe("Registrant contact ID"),
      admin: z.string().describe("Admin contact ID"),
      tech: z.string().describe("Tech contact ID"),
      billing: z.string().describe("Billing contact ID"),
      authCode: z.string().optional().describe("EPP/auth code (required for most TLDs)"),
    },
    async ({ domain, autoRenew, privacyLevel, registrant, admin, tech, billing, authCode }) => {
      try {
        const body: Record<string, unknown> = {
          autoRenew,
          privacyProtection: { level: privacyLevel, userConsent: true },
          contacts: { registrant, admin, tech, billing },
        };
        if (authCode) body.authCode = authCode;

        const result = await ss.post<{ asyncOperationId?: string }>(
          `/v1/domains/${encodeURIComponent(domain)}/transfer`,
          body,
        );
        const opId = result?.asyncOperationId;
        return textResult(
          opId
            ? `Transfer initiated for ${domain}. Operation ID: ${opId}`
            : `Transfer request sent for ${domain}.`,
        );
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.tool(
    "ss_domain_transfer_details",
    "Get the status of an ongoing domain transfer",
    { domain: z.string().min(4).describe("Domain name") },
    async ({ domain }) => {
      try {
        const t = await ss.get<TransferDetails>(
          `/v1/domains/${encodeURIComponent(domain)}/transfer`,
        );
        const lines = [
          `# Transfer: ${domain}`,
          `- Direction: ${t.direction || "n/a"}`,
          `- Status: **${t.status || "unknown"}**`,
          `- Started: ${t.startedAt?.slice(0, 19) || "n/a"}`,
          `- Finished: ${t.finishedAt?.slice(0, 19) || "n/a"}`,
        ];
        return textResult(lines.join("\n"));
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.tool(
    "ss_domain_auth_code",
    "Get the EPP/auth code for a domain (needed for outbound transfers)",
    { domain: z.string().min(4).describe("Domain name") },
    async ({ domain }) => {
      try {
        const data = await ss.get<{ authCode: string; expires: string }>(
          `/v1/domains/${encodeURIComponent(domain)}/transfer/auth-code`,
        );
        return textResult(`Auth code for ${domain}: **${data.authCode}**\nExpires: ${data.expires?.slice(0, 19) || "n/a"}`);
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.tool(
    "ss_domain_restore",
    "Restore a deleted/expired domain (async operation)",
    { domain: z.string().min(4).describe("Domain to restore") },
    async ({ domain }) => {
      try {
        const result = await ss.post<{ asyncOperationId?: string }>(
          `/v1/domains/${encodeURIComponent(domain)}/restore`,
        );
        const opId = result?.asyncOperationId;
        return textResult(
          opId
            ? `Restore initiated for ${domain}. Operation ID: ${opId}`
            : `Restore request sent for ${domain}.`,
        );
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );
}
