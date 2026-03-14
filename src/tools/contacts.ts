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
    "Save TLD-specific contact attributes (e.g. .ca requires language and CIRA category)",
    {
      type: z.string().min(2).max(32).describe("Attribute type (e.g. 'ca' for .ca domains)"),
      agreementValue: z.boolean().describe("Agree to registry rules"),
      language: z.enum(["EN", "FR"]).describe("Language code"),
      registrantCiraCategory: z.string().optional().describe("CIRA registrant category (for .ca)"),
    },
    async (params) => {
      try {
        const data = await ss.put<{ contactId: string }>("/v1/contacts/attributes", params);
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
