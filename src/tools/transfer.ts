import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpaceshipClient } from "../spaceship-client.js";
import { textResult, errorResult, CONFIRM } from "../utils.js";

interface TransferDetails {
  startedAt?: string;
  finishedAt?: string;
  direction?: string;
  status?: string;
}

export function registerTransferTools(server: McpServer, ss: SpaceshipClient) {
  server.tool(
    "ss_domain_transfer",
    "Transfer a domain into Spaceship. CHARGES the account's default payment method. Async operation: track it with ss_async_status. Ask the user to approve the purchase first.",
    {
      domain: z.string().min(4).describe("Domain to transfer"),
      autoRenew: z.boolean().describe("Enable auto-renewal after transfer"),
      privacyLevel: z.enum(["public", "high"]).default("high").describe("Privacy level"),
      userConsent: z.boolean().describe(
        'User consent to the privacy setting. Must be true when privacyLevel is "public" (the user agrees to publish their contact details in WHOIS). Ask the user; do not assume.',
      ),
      registrant: z.string().describe("Registrant contact ID"),
      admin: z.string().optional().describe("Admin contact ID"),
      tech: z.string().optional().describe("Tech contact ID"),
      billing: z.string().optional().describe("Billing contact ID"),
      attributes: z.array(z.string().min(27).max(32)).max(5).optional().describe("Contact attribute IDs from ss_contact_attr_save (TLDs such as .us and .ca need them)"),
      authCode: z.string().min(1).max(50).optional().describe("EPP/auth code (required for most TLDs)"),
      confirm: CONFIRM,
    },
    { destructiveHint: true, idempotentHint: false },
    async ({ domain, autoRenew, privacyLevel, userConsent, registrant, admin, tech, billing, attributes, authCode }) => {
      try {
        const body: Record<string, unknown> = {
          autoRenew,
          privacyProtection: { level: privacyLevel, userConsent },
          contacts: { registrant, ...(admin && { admin }), ...(tech && { tech }), ...(billing && { billing }), ...(attributes?.length ? { attributes } : {}) },
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
    { readOnlyHint: true },
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
    "Get the EPP/auth code for a domain (needed for outbound transfers). The code is returned in the conversation transcript, so anyone with the transcript can use it to transfer the domain away.",
    { domain: z.string().min(4).describe("Domain name") },
    { readOnlyHint: true },
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
    "Restore a deleted/expired domain. CHARGES the account's default payment method (redemption fee). Async operation: track it with ss_async_status. Ask the user to approve the purchase first.",
    { domain: z.string().min(4).describe("Domain to restore"), confirm: CONFIRM },
    { destructiveHint: true, idempotentHint: false },
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
