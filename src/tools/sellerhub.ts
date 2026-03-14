import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpaceshipClient } from "../spaceship-client.js";
import { textResult, errorResult } from "../utils.js";

interface Price {
  amount: string;
  currency: string;
}

interface SellerDomain {
  name: string;
  unicodeName?: string;
  displayName?: string;
  description?: string;
  status?: string;
  minPrice?: Price;
  binPrice?: Price;
  binPriceEnabled?: boolean;
  minPriceEnabled?: boolean;
}

interface SellerList {
  items: SellerDomain[];
  total: number;
}

function fmtPrice(p?: Price): string {
  return p ? `${p.amount} ${p.currency}` : "n/a";
}

export function registerSellerHubTools(server: McpServer, ss: SpaceshipClient) {
  server.tool(
    "ss_sellerhub_list",
    "List domains in SellerHub marketplace (paginated)",
    {
      take: z.number().int().min(1).max(100).default(50).describe("Items per page"),
      skip: z.number().int().min(0).default(0).describe("Items to skip"),
    },
    async ({ take, skip }) => {
      try {
        const data = await ss.get<SellerList>("/v1/sellerhub/domains", {
          take: String(take),
          skip: String(skip),
        });

        if (!data?.items?.length) {
          return textResult("No SellerHub listings.");
        }

        const lines = [`# SellerHub Listings (${data.items.length} of ${data.total})`, ""];
        for (const d of data.items) {
          const name = d.displayName || d.unicodeName || d.name;
          const bin = d.binPriceEnabled ? `BIN: ${fmtPrice(d.binPrice)}` : "";
          const min = d.minPriceEnabled ? `min offer: ${fmtPrice(d.minPrice)}` : "";
          const prices = [bin, min].filter(Boolean).join(", ");
          lines.push(`- **${name}** [${d.status || "?"}]${prices ? " — " + prices : ""}`);
        }
        return textResult(lines.join("\n"));
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.tool(
    "ss_sellerhub_get",
    "Get details for a specific SellerHub listing",
    { domain: z.string().min(4).describe("Domain name") },
    async ({ domain }) => {
      try {
        const d = await ss.get<SellerDomain>(`/v1/sellerhub/domains/${encodeURIComponent(domain)}`);
        const lines = [
          `# ${d.displayName || d.unicodeName || d.name}`,
          `- Status: ${d.status || "?"}`,
          `- Description: ${d.description || "none"}`,
          `- BIN: ${d.binPriceEnabled ? fmtPrice(d.binPrice) : "disabled"}`,
          `- Min offer: ${d.minPriceEnabled ? fmtPrice(d.minPrice) : "disabled"}`,
        ];
        return textResult(lines.join("\n"));
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.tool(
    "ss_sellerhub_create",
    "List a domain for sale in SellerHub",
    {
      name: z.string().min(4).describe("Domain name to list"),
      displayName: z.string().optional().describe("Display name"),
      description: z.string().max(5000).optional().describe("Domain description"),
      binPriceEnabled: z.boolean().optional().describe("Enable Buy It Now"),
      binAmount: z.string().optional().describe("BIN price amount (e.g. '999.99')"),
      binCurrency: z.string().default("USD").describe("BIN price currency"),
      minPriceEnabled: z.boolean().optional().describe("Enable minimum offer"),
      minAmount: z.string().optional().describe("Min offer amount"),
      minCurrency: z.string().default("USD").describe("Min offer currency"),
    },
    async ({ name, displayName, description, binPriceEnabled, binAmount, binCurrency, minPriceEnabled, minAmount, minCurrency }) => {
      try {
        const body: Record<string, unknown> = { name };
        if (displayName) body.displayName = displayName;
        if (description) body.description = description;
        if (binPriceEnabled != null) body.binPriceEnabled = binPriceEnabled;
        if (binAmount) body.binPrice = { amount: binAmount, currency: binCurrency };
        if (minPriceEnabled != null) body.minPriceEnabled = minPriceEnabled;
        if (minAmount) body.minPrice = { amount: minAmount, currency: minCurrency };

        await ss.post("/v1/sellerhub/domains", body);
        return textResult(`Listed ${name} in SellerHub.`);
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.tool(
    "ss_sellerhub_update",
    "Update a SellerHub listing",
    {
      domain: z.string().min(4).describe("Domain name"),
      displayName: z.string().optional().describe("Display name"),
      description: z.string().max(5000).optional().describe("Description"),
      binPriceEnabled: z.boolean().optional().describe("Enable Buy It Now"),
      binAmount: z.string().optional().describe("BIN price amount"),
      binCurrency: z.string().default("USD").describe("BIN price currency"),
      minPriceEnabled: z.boolean().optional().describe("Enable minimum offer"),
      minAmount: z.string().optional().describe("Min offer amount"),
      minCurrency: z.string().default("USD").describe("Min offer currency"),
    },
    async ({ domain, displayName, description, binPriceEnabled, binAmount, binCurrency, minPriceEnabled, minAmount, minCurrency }) => {
      try {
        const body: Record<string, unknown> = {};
        if (displayName != null) body.displayName = displayName;
        if (description != null) body.description = description;
        if (binPriceEnabled != null) body.binPriceEnabled = binPriceEnabled;
        if (binAmount) body.binPrice = { amount: binAmount, currency: binCurrency };
        if (minPriceEnabled != null) body.minPriceEnabled = minPriceEnabled;
        if (minAmount) body.minPrice = { amount: minAmount, currency: minCurrency };

        await ss.patch(`/v1/sellerhub/domains/${encodeURIComponent(domain)}`, body);
        return textResult(`Updated SellerHub listing for ${domain}.`);
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.tool(
    "ss_sellerhub_delete",
    "Remove a domain from SellerHub",
    { domain: z.string().min(4).describe("Domain to remove") },
    async ({ domain }) => {
      try {
        await ss.del(`/v1/sellerhub/domains/${encodeURIComponent(domain)}`);
        return textResult(`Removed ${domain} from SellerHub.`);
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.tool(
    "ss_sellerhub_checkout",
    "Create a Buy Now checkout link for a SellerHub domain",
    {
      domain: z.string().min(4).describe("Domain name (must be listed in SellerHub)"),
      amount: z.string().optional().describe("Override price amount"),
      currency: z.string().default("USD").describe("Price currency"),
    },
    async ({ domain, amount, currency }) => {
      try {
        const body: Record<string, unknown> = {
          type: "buyNow",
          domainName: domain,
        };
        if (amount) body.basePrice = { amount, currency };

        const result = await ss.post<{ url: string; validTill: string }>(
          "/v1/sellerhub/checkout-links",
          body,
        );
        return textResult(`Checkout link for ${domain}:\n${result.url}\nValid until: ${result.validTill?.slice(0, 19) || "n/a"}`);
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.tool(
    "ss_sellerhub_verify",
    "Get DNS verification records for SellerHub domain ownership",
    {},
    async () => {
      try {
        const data = await ss.get<{
          options: { records: { type: string; name: string; value: string }[] }[];
        }>("/v1/sellerhub/verification-records");

        if (!data?.options?.length) {
          return textResult("No verification options.");
        }

        const lines = [`# SellerHub Verification Options`, ""];
        for (let i = 0; i < data.options.length; i++) {
          lines.push(`## Option ${i + 1}`);
          for (const r of data.options[i].records) {
            lines.push(`- **${r.type}** ${r.name} → ${r.value}`);
          }
          lines.push("");
        }
        lines.push("Choose ONE option and create ALL its records on your domain.");
        return textResult(lines.join("\n"));
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );
}
