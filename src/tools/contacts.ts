import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpaceshipClient } from "../spaceship-client.js";

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
      const data = await ss.put<{ contactId: string }>("/v1/contacts", params);
      return {
        content: [{
          type: "text",
          text: `Contact saved. ID: **${data.contactId}**\nUse this ID when registering or updating domains.`,
        }],
      };
    },
  );

  server.tool(
    "ss_contact_get",
    "Read contact details by contact ID",
    { contactId: z.string().min(27).max(32).describe("Contact ID") },
    async ({ contactId }) => {
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
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );
}
