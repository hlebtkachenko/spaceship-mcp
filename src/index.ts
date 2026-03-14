import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SpaceshipClient } from "./spaceship-client.js";
import { registerDomainTools } from "./tools/domains.js";
import { registerDnsTools } from "./tools/dns.js";
import { registerContactTools } from "./tools/contacts.js";
import { registerTransferTools } from "./tools/transfer.js";
import { registerSellerHubTools } from "./tools/sellerhub.js";
import { registerAsyncTools } from "./tools/async.js";

function required(name: string): string {
  const val = process.env[name];
  if (!val) {
    process.stderr.write(`Missing required env var: ${name}\n`);
    process.exit(1);
  }
  return val;
}

const client = new SpaceshipClient({
  apiKey: required("SPACESHIP_API_KEY"),
  apiSecret: required("SPACESHIP_API_SECRET"),
});

const server = new McpServer({ name: "spaceship", version: "1.0.0" });

registerDomainTools(server, client);
registerDnsTools(server, client);
registerContactTools(server, client);
registerTransferTools(server, client);
registerSellerHubTools(server, client);
registerAsyncTools(server, client);

await server.connect(new StdioServerTransport());
