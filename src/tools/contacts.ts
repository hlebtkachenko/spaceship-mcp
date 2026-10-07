import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpaceshipClient } from "../spaceship-client.js";
import { textResult, errorResult } from "../utils.js";

interface ContactDetails {
  firstName: string;
  lastName: string;
  organization?: string;
  email: string;
  address1: string;
  address2?: string;
  city: string;
  country: string;
  stateProvince?: string;
  postalCode?: string;
  phone: string;
}

export function registerContactTools(server: McpServer, ss: SpaceshipClient) {
  server.tool(
    "ss_contact_save",
    "Create or update a contact and get a contact ID (used for domain registration/transfers)",
    {
      firstName: z.string().min(1).max(125).describe("First name"),
      lastName: z.string().min(1).max(125).describe("Last name"),
      email: z.string().email().describe("Email address"),
      phone: z.string().min(7).max(17).describe("Phone number (+1.123456789 format)"),
      address1: z.string().max(255).describe("Street address line 1"),
      city: z.string().max(255).describe("City"),
      country: z.string().length(2).describe("Country code (ISO 3166-1 alpha-2, e.g. US, CZ, UA)"),
      organization: z.string().max(255).optional().describe("Organization name"),
      address2: z.string().max(255).optional().describe("Address line 2"),
      stateProvince: z.string().max(255).optional().describe("State/province"),
      postalCode: z.string().max(16).optional().describe("Postal code"),
    },
    { destructiveHint: false, idempotentHint: true },
    async (params) => {
      try {
        const data = await ss.put<{ contactId: string }>("/v1/contacts", params);
        return textResult(`Contact saved. ID: **${data.contactId}**\nUse this ID when registering or updating domains.`);
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.tool(
    "ss_contact_get",
    "Read contact details by contact ID",
    { contactId: z.string().min(27).max(32).describe("Contact ID") },
    { readOnlyHint: true },
    async ({ contactId }) => {
      try {
        const c = await ss.get<ContactDetails>(`/v1/contacts/${encodeURIComponent(contactId)}`);
        const lines = [
          `# Contact ${contactId}`,
          `- Name: ${c.firstName} ${c.lastName}`,
          `- Email: ${c.email}`,
          `- Phone: ${c.phone}`,
          `- Address: ${c.address1}${c.address2 ? ", " + c.address2 : ""}`,
          `- City: ${c.city}`,
          `- Country: ${c.country}`,
        ];
        if (c.organization) lines.push(`- Organization: ${c.organization}`);
        if (c.stateProvince) lines.push(`- State: ${c.stateProvince}`);
        if (c.postalCode) lines.push(`- Postal code: ${c.postalCode}`);
        return textResult(lines.join("\n"));
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );
}

export function registerContactAttributeTools(server: McpServer, ss: SpaceshipClient) {
  server.tool(
    "ss_contact_attr_save",
    "Save TLD-specific contact attributes (.ca: language, agreement and CIRA category; .us: application purpose and nexus category). Returns an attribute contact ID to pass as `attributes` when registering or transferring.",
    {
      attributes: z.discriminatedUnion("type", [
        z.object({
          type: z.literal("ca"),
          agreementValue: z.boolean().describe("Agree to the .ca registry rules"),
          language: z.enum(["EN", "FR"]).describe("Language code"),
          registrantCiraCategory: z.enum([
            "CCO", "CCT", "RES", "GOV", "EDU", "ASS", "HOP", "PRT", "TDM",
            "TRD", "PLT", "LAM", "TRS", "ABO", "INB", "LGR", "OMK", "MAJ",
          ]).describe("CIRA registrant category, e.g. CCO (Canadian corporation), CCT (Canadian citizen), RES (permanent resident)"),
        }),
        z.object({
          type: z.literal("us"),
          appPurpose: z.enum(["P1", "P2", "P3", "P4", "P5"]).describe("Application purpose: P1 business for profit, P2 non-profit, P3 personal, P4 educational, P5 government"),
          nexusCategory: z.enum(["C11", "C12", "C21", "C31", "C32"]).describe("Nexus: C11 US citizen, C12 permanent resident, C21 US organization, C31 foreign entity doing business in the US, C32 foreign entity with a US office"),
        }),
      ]).describe("Attributes for one TLD"),
    },
    { destructiveHint: false, idempotentHint: true },
    async ({ attributes }) => {
      try {
        const data = await ss.put<{ contactId: string }>("/v1/contacts/attributes", attributes);
        return textResult(`Contact attributes saved. ID: **${data.contactId}**`);
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.tool(
    "ss_contact_attr_get",
    "Read TLD-specific contact attributes by contact ID",
    { contactId: z.string().min(27).max(32).describe("Contact ID") },
    { readOnlyHint: true },
    async ({ contactId }) => {
      try {
        const data = await ss.get<Record<string, unknown>>(
          `/v1/contacts/attributes/${encodeURIComponent(contactId)}`,
        );
        const lines = [`# Contact Attributes ${contactId}`, ""];
        for (const [k, v] of Object.entries(data)) {
          lines.push(`- ${k}: ${v}`);
        }
        return textResult(lines.join("\n"));
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );
}
