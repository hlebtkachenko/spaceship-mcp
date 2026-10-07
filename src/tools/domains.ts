import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpaceshipClient } from "../spaceship-client.js";
import { textResult, errorResult, CONFIRM } from "../utils.js";

interface DomainItem {
  name: string;
  unicodeName?: string;
  autoRenew: boolean;
  registrationDate?: string;
  expirationDate?: string;
  lifecycleStatus?: string;
  verificationStatus?: string;
  nameservers?: { provider: string; hosts?: string[] };
  privacyProtection?: { contactForm: boolean; level: string };
}

interface DomainList {
  items: DomainItem[];
  total: number;
}

interface AvailabilityResult {
  domain: string;
  result: string;
  premiumPricing?: { operation: string; price: number; currency: string }[];
}

function fmtDate(d?: string): string {
  if (!d) return "";
  return d.slice(0, 10);
}

export function registerDomainTools(server: McpServer, ss: SpaceshipClient) {
  server.tool(
    "ss_domains",
    "List all domains in your Spaceship account (paginated)",
    {
      take: z.number().int().min(1).max(100).default(50).describe("Items per page (1-100)"),
      skip: z.number().int().min(0).default(0).describe("Items to skip"),
    },
    { readOnlyHint: true },
    async ({ take, skip }) => {
      try {
        const data = await ss.get<DomainList>("/v1/domains", {
          take: String(take),
          skip: String(skip),
        });

        if (!data?.items?.length) {
          return textResult("No domains found.");
        }

        const lines = [`# Domains (${data.items.length} of ${data.total})`, ""];
        for (const d of data.items) {
          const name = d.unicodeName || d.name;
          const status = d.lifecycleStatus || "unknown";
          const exp = fmtDate(d.expirationDate);
          const ar = d.autoRenew ? "auto-renew" : "manual";
          const ns = d.nameservers?.provider || "";
          lines.push(`- **${name}** [${status}] expires: ${exp} (${ar}, ns: ${ns})`);
        }
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
    "ss_domain_info",
    "Get detailed info for a specific domain",
    { domain: z.string().min(4).describe("Domain name (e.g. example.com)") },
    { readOnlyHint: true },
    async ({ domain }) => {
      try {
        const d = await ss.get<DomainItem>(`/v1/domains/${encodeURIComponent(domain)}`);
        const lines = [
          `# ${d.unicodeName || d.name}`,
          `- Status: ${d.lifecycleStatus || "unknown"}`,
          `- Registered: ${fmtDate(d.registrationDate)}`,
          `- Expires: ${fmtDate(d.expirationDate)}`,
          `- Auto-renew: ${d.autoRenew}`,
          `- Verification: ${d.verificationStatus || "n/a"}`,
        ];
        if (d.nameservers) {
          lines.push(`- Nameservers: ${d.nameservers.provider} ${d.nameservers.hosts?.join(", ") || ""}`);
        }
        if (d.privacyProtection) {
          lines.push(`- Privacy: ${d.privacyProtection.level} (contact form: ${d.privacyProtection.contactForm})`);
        }
        return textResult(lines.join("\n"));
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.tool(
    "ss_domain_check",
    "Check if a single domain is available for registration",
    { domain: z.string().min(4).describe("Domain to check (e.g. example.com)") },
    { readOnlyHint: true },
    async ({ domain }) => {
      try {
        const data = await ss.get<AvailabilityResult>(
          `/v1/domains/${encodeURIComponent(domain)}/available`,
        );
        const lines = [`# ${data.domain}`, `- Result: **${data.result}**`];
        if (data.premiumPricing?.length) {
          for (const p of data.premiumPricing) {
            lines.push(`- ${p.operation}: ${p.price} ${p.currency}`);
          }
        }
        return textResult(lines.join("\n"));
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.tool(
    "ss_domains_check",
    "Check availability for multiple domains at once (up to 20)",
    {
      domains: z.array(z.string().min(4)).min(1).max(20).describe("Domains to check"),
    },
    { readOnlyHint: true },
    async ({ domains }) => {
      try {
        const data = await ss.post<{ domains: AvailabilityResult[] }>(
          "/v1/domains/available",
          { domains },
        );
        const lines = [`# Availability Check (${data.domains.length} domains)`, ""];
        for (const d of data.domains) {
          let extra = "";
          if (d.premiumPricing?.length) {
            extra = ` — ${d.premiumPricing.map((p) => `${p.operation}: ${p.price} ${p.currency}`).join(", ")}`;
          }
          lines.push(`- **${d.domain}**: ${d.result}${extra}`);
        }
        return textResult(lines.join("\n"));
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.tool(
    "ss_domain_register",
    "Register a domain. CHARGES the account's default payment method. Async operation: track it with ss_async_status. Ask the user to approve the purchase first.",
    {
      domain: z.string().min(4).describe("Domain to register"),
      years: z.number().int().min(1).max(10).describe("Registration years"),
      autoRenew: z.boolean().describe("Enable auto-renewal"),
      privacyLevel: z.enum(["public", "high"]).default("high").describe("WHOIS privacy level"),
      userConsent: z.boolean().describe(
        'User consent to the privacy setting. Must be true when privacyLevel is "public" (the user agrees to publish their contact details in WHOIS). Ask the user; do not assume.',
      ),
      registrant: z.string().describe("Registrant contact ID"),
      admin: z.string().describe("Admin contact ID"),
      tech: z.string().describe("Tech contact ID"),
      billing: z.string().describe("Billing contact ID"),
      attributes: z.array(z.string().min(27).max(32)).max(5).optional().describe("Contact attribute IDs from ss_contact_attr_save (TLDs such as .us and .ca need them)"),
      confirm: CONFIRM,
    },
    { destructiveHint: true, idempotentHint: false },
    async ({ domain, years, autoRenew, privacyLevel, userConsent, registrant, admin, tech, billing, attributes }) => {
      try {
        const result = await ss.post<{ asyncOperationId?: string }>(
          `/v1/domains/${encodeURIComponent(domain)}`,
          {
            autoRenew,
            years,
            privacyProtection: { level: privacyLevel, userConsent },
            contacts: { registrant, admin, tech, billing, ...(attributes?.length ? { attributes } : {}) },
          },
        );
        const opId = result?.asyncOperationId;
        return textResult(
          opId
            ? `Domain registration initiated. Operation ID: ${opId}\nUse ss_async_status to track progress.`
            : `Domain registration request sent for ${domain}.`,
        );
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.tool(
    "ss_domain_renew",
    "Renew a domain. CHARGES the account's default payment method. Async operation: track it with ss_async_status. Ask the user to approve the purchase first.",
    {
      domain: z.string().min(4).describe("Domain to renew"),
      years: z.number().int().min(1).max(10).describe("Renewal years"),
      currentExpirationDate: z.string().describe("Current expiration date as ISO 8601 date-time, e.g. 2027-01-15T00:00:00Z"),
      confirm: CONFIRM,
    },
    { destructiveHint: true, idempotentHint: false },
    async ({ domain, years, currentExpirationDate }) => {
      try {
        const result = await ss.post<{ asyncOperationId?: string }>(
          `/v1/domains/${encodeURIComponent(domain)}/renew`,
          { years, currentExpirationDate },
        );
        const opId = result?.asyncOperationId;
        return textResult(
          opId
            ? `Renewal initiated. Operation ID: ${opId}`
            : `Renewal request sent for ${domain}.`,
        );
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.tool(
    "ss_domain_autorenew",
    "Enable or disable auto-renewal for a domain",
    {
      domain: z.string().min(4).describe("Domain name"),
      enabled: z.boolean().describe("true to enable, false to disable"),
    },
    { destructiveHint: true, idempotentHint: true },
    async ({ domain, enabled }) => {
      try {
        await ss.put(`/v1/domains/${encodeURIComponent(domain)}/autorenew`, {
          isEnabled: enabled,
        });
        return textResult(`Auto-renewal ${enabled ? "enabled" : "disabled"} for ${domain}.`);
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.tool(
    "ss_domain_nameservers",
    "Replace the nameservers of a domain. Wrong nameservers take the domain's website and email offline.",
    {
      domain: z.string().min(4).describe("Domain name"),
      provider: z.enum(["basic", "custom"]).describe('"basic" for Spaceship NS, "custom" for your own'),
      hosts: z.array(z.string()).min(2).max(12).optional().describe("Nameserver hostnames (required for custom)"),
    },
    { destructiveHint: true, idempotentHint: true },
    async ({ domain, provider, hosts }) => {
      try {
        const body: Record<string, unknown> = { provider };
        if (provider === "custom" && hosts) body.hosts = hosts;
        await ss.put(`/v1/domains/${encodeURIComponent(domain)}/nameservers`, body);
        return textResult(`Nameservers updated for ${domain}: ${provider}${hosts ? " → " + hosts.join(", ") : ""}`);
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.tool(
    "ss_domain_contacts",
    "Update contacts for a domain",
    {
      domain: z.string().min(4).describe("Domain name"),
      registrant: z.string().describe("Registrant contact ID"),
      admin: z.string().optional().describe("Admin contact ID"),
      tech: z.string().optional().describe("Tech contact ID"),
      billing: z.string().optional().describe("Billing contact ID"),
    },
    { destructiveHint: true, idempotentHint: true },
    async ({ domain, registrant, admin, tech, billing }) => {
      try {
        const body: Record<string, string> = { registrant };
        if (admin) body.admin = admin;
        if (tech) body.tech = tech;
        if (billing) body.billing = billing;
        await ss.put(`/v1/domains/${encodeURIComponent(domain)}/contacts`, body);
        return textResult(`Contacts updated for ${domain}.`);
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.tool(
    "ss_domain_privacy",
    "Update WHOIS privacy preference for a domain",
    {
      domain: z.string().min(4).describe("Domain name"),
      level: z.enum(["public", "high"]).describe("Privacy level"),
      userConsent: z.boolean().describe(
        "User consent to the privacy change. The API applies the change only if this is true. Ask the user; do not assume.",
      ),
    },
    { destructiveHint: true, idempotentHint: true },
    async ({ domain, level, userConsent }) => {
      try {
        await ss.put(`/v1/domains/${encodeURIComponent(domain)}/privacy/preference`, {
          privacyLevel: level,
          userConsent,
        });
        return textResult(`Privacy set to "${level}" for ${domain}.`);
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.tool(
    "ss_domain_transfer_lock",
    "Lock or unlock domain transfers. Unlocking lets the domain be transferred away to another registrar.",
    {
      domain: z.string().min(4).describe("Domain name"),
      locked: z.boolean().describe("true to lock, false to unlock"),
    },
    { destructiveHint: true, idempotentHint: true },
    async ({ domain, locked }) => {
      try {
        await ss.put(`/v1/domains/${encodeURIComponent(domain)}/transfer/lock`, {
          isLocked: locked,
        });
        return textResult(`Transfer ${locked ? "locked" : "unlocked"} for ${domain}.`);
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );
}

export function registerDomainExtraTools(server: McpServer, ss: SpaceshipClient) {
  server.tool(
    "ss_domain_email_protection",
    "Toggle email protection (contact form link in WHOIS) for a domain",
    {
      domain: z.string().min(4).describe("Domain name"),
      contactForm: z.boolean().describe("true to show contact form, false to hide"),
    },
    { destructiveHint: true, idempotentHint: true },
    async ({ domain, contactForm }) => {
      try {
        await ss.put(
          `/v1/domains/${encodeURIComponent(domain)}/privacy/email-protection-preference`,
          { contactForm },
        );
        return textResult(`Email protection updated for ${domain}: contact form ${contactForm ? "visible" : "hidden"}.`);
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );
}
