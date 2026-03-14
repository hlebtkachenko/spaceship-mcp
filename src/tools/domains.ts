import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpaceshipClient } from "../spaceship-client.js";

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
    async ({ take, skip }) => {
      const data = await ss.get<DomainList>("/v1/domains", {
        take: String(take),
        skip: String(skip),
      });

      if (!data?.items?.length) {
        return { content: [{ type: "text", text: "No domains found." }] };
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
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  server.tool(
    "ss_domain_info",
    "Get detailed info for a specific domain",
    { domain: z.string().min(4).describe("Domain name (e.g. example.com)") },
    async ({ domain }) => {
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
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  server.tool(
    "ss_domain_check",
    "Check if a single domain is available for registration",
    { domain: z.string().min(4).describe("Domain to check (e.g. example.com)") },
    async ({ domain }) => {
      const data = await ss.get<AvailabilityResult>(
        `/v1/domains/${encodeURIComponent(domain)}/available`,
      );
      const lines = [`# ${data.domain}`, `- Result: **${data.result}**`];
      if (data.premiumPricing?.length) {
        for (const p of data.premiumPricing) {
          lines.push(`- ${p.operation}: ${p.price} ${p.currency}`);
        }
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  server.tool(
    "ss_domains_check",
    "Check availability for multiple domains at once (up to 20)",
    {
      domains: z.array(z.string().min(4)).min(1).max(20).describe("Domains to check"),
    },
    async ({ domains }) => {
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
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  server.tool(
    "ss_domain_register",
    "Register a domain (async operation — use ss_async_status to track)",
    {
      domain: z.string().min(4).describe("Domain to register"),
      years: z.number().int().min(1).max(10).describe("Registration years"),
      autoRenew: z.boolean().describe("Enable auto-renewal"),
      privacyLevel: z.enum(["public", "high"]).default("high").describe("WHOIS privacy level"),
      registrant: z.string().describe("Registrant contact ID"),
      admin: z.string().describe("Admin contact ID"),
      tech: z.string().describe("Tech contact ID"),
      billing: z.string().describe("Billing contact ID"),
    },
    async ({ domain, years, autoRenew, privacyLevel, registrant, admin, tech, billing }) => {
      const result = await ss.post<{ asyncOperationId?: string }>(
        `/v1/domains/${encodeURIComponent(domain)}`,
        {
          autoRenew,
          years,
          privacyProtection: { level: privacyLevel, userConsent: true },
          contacts: { registrant, admin, tech, billing },
        },
      );
      const opId = result?.asyncOperationId;
      return {
        content: [{
          type: "text",
          text: opId
            ? `Domain registration initiated. Operation ID: ${opId}\nUse ss_async_status to track progress.`
            : `Domain registration request sent for ${domain}.`,
        }],
      };
    },
  );

  server.tool(
    "ss_domain_renew",
    "Renew a domain (async operation)",
    {
      domain: z.string().min(4).describe("Domain to renew"),
      years: z.number().int().min(1).max(10).describe("Renewal years"),
      currentExpirationDate: z.string().describe("Current expiration date (ISO format)"),
    },
    async ({ domain, years, currentExpirationDate }) => {
      const result = await ss.post<{ asyncOperationId?: string }>(
        `/v1/domains/${encodeURIComponent(domain)}/renew`,
        { years, currentExpirationDate },
      );
      const opId = result?.asyncOperationId;
      return {
        content: [{
          type: "text",
          text: opId
            ? `Renewal initiated. Operation ID: ${opId}`
            : `Renewal request sent for ${domain}.`,
        }],
      };
    },
  );

  server.tool(
    "ss_domain_autorenew",
    "Enable or disable auto-renewal for a domain",
    {
      domain: z.string().min(4).describe("Domain name"),
      enabled: z.boolean().describe("true to enable, false to disable"),
    },
    async ({ domain, enabled }) => {
      await ss.put(`/v1/domains/${encodeURIComponent(domain)}/autorenew`, {
        isEnabled: enabled,
      });
      return {
        content: [{ type: "text", text: `Auto-renewal ${enabled ? "enabled" : "disabled"} for ${domain}.` }],
      };
    },
  );

  server.tool(
    "ss_domain_nameservers",
    "Update nameservers for a domain",
    {
      domain: z.string().min(4).describe("Domain name"),
      provider: z.enum(["basic", "custom"]).describe('"basic" for Spaceship NS, "custom" for your own'),
      hosts: z.array(z.string()).min(2).max(12).optional().describe("Nameserver hostnames (required for custom)"),
    },
    async ({ domain, provider, hosts }) => {
      const body: Record<string, unknown> = { provider };
      if (provider === "custom" && hosts) body.hosts = hosts;
      await ss.put(`/v1/domains/${encodeURIComponent(domain)}/nameservers`, body);
      return {
        content: [{
          type: "text",
          text: `Nameservers updated for ${domain}: ${provider}${hosts ? " → " + hosts.join(", ") : ""}`,
        }],
      };
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
    async ({ domain, registrant, admin, tech, billing }) => {
      const body: Record<string, string> = { registrant };
      if (admin) body.admin = admin;
      if (tech) body.tech = tech;
      if (billing) body.billing = billing;
      await ss.put(`/v1/domains/${encodeURIComponent(domain)}/contacts`, body);
      return { content: [{ type: "text", text: `Contacts updated for ${domain}.` }] };
    },
  );

  server.tool(
    "ss_domain_privacy",
    "Update WHOIS privacy preference for a domain",
    {
      domain: z.string().min(4).describe("Domain name"),
      level: z.enum(["public", "high"]).describe("Privacy level"),
    },
    async ({ domain, level }) => {
      await ss.put(`/v1/domains/${encodeURIComponent(domain)}/privacy/preference`, {
        privacyLevel: level,
        userConsent: true,
      });
      return { content: [{ type: "text", text: `Privacy set to "${level}" for ${domain}.` }] };
    },
  );

  server.tool(
    "ss_domain_transfer_lock",
    "Lock or unlock domain transfers",
    {
      domain: z.string().min(4).describe("Domain name"),
      locked: z.boolean().describe("true to lock, false to unlock"),
    },
    async ({ domain, locked }) => {
      await ss.put(`/v1/domains/${encodeURIComponent(domain)}/transfer/lock`, {
        isLocked: locked,
      });
      return {
        content: [{ type: "text", text: `Transfer ${locked ? "locked" : "unlocked"} for ${domain}.` }],
      };
    },
  );
}
