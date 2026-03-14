import { readFileSync } from "fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SpaceshipClient } from "./spaceship-client.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));
import { registerDomainTools, registerDomainExtraTools } from "./tools/domains.js";
import { registerDnsTools } from "./tools/dns.js";
import { registerContactTools, registerContactAttributeTools } from "./tools/contacts.js";
import { registerTransferTools } from "./tools/transfer.js";
import { registerSellerHubTools } from "./tools/sellerhub.js";
import { registerAsyncTools } from "./tools/async.js";
import { registerNameserverTools } from "./tools/nameservers.js";
import { registerAnalysisTools } from "./tools/analysis.js";

function required(name: string): string {
  const val = process.env[name];
  if (!val) {
    process.stderr.write(`Missing required env var: ${name}\n`);
    process.exit(1);
  }
  return val;
}

function optInt(name: string, fallback: number): number {
  const val = process.env[name];
  if (!val) return fallback;
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? fallback : n;
}

const client = new SpaceshipClient({
  apiKey: required("SPACESHIP_API_KEY"),
  apiSecret: required("SPACESHIP_API_SECRET"),
  cacheTtl: optInt("SPACESHIP_CACHE_TTL", 120),
  maxRetries: optInt("SPACESHIP_MAX_RETRIES", 3),
});

const server = new McpServer({ name: "spaceship", version: pkg.version });

registerDomainTools(server, client);
registerDomainExtraTools(server, client);
registerDnsTools(server, client);
registerContactTools(server, client);
registerContactAttributeTools(server, client);
registerTransferTools(server, client);
registerSellerHubTools(server, client);
registerAsyncTools(server, client);
registerNameserverTools(server, client);
registerAnalysisTools(server, client);

await server.connect(new StdioServerTransport());
