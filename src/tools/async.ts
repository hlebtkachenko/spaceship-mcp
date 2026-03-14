import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpaceshipClient } from "../spaceship-client.js";

interface AsyncOperation {
  status: string;
  type?: string;
  details?: Record<string, unknown>;
  createdAt?: string;
  modifiedAt?: string;
}

export function registerAsyncTools(server: McpServer, ss: SpaceshipClient) {
  server.tool(
    "ss_async_status",
    "Check the status of an async operation (registration, renewal, transfer, restore)",
    {
      operationId: z.string().max(36).describe("Operation ID from the async response header"),
    },
    async ({ operationId }) => {
      const op = await ss.get<AsyncOperation>(
        `/v1/async-operations/${encodeURIComponent(operationId)}`,
      );
      const lines = [
        `# Async Operation ${operationId}`,
        `- Status: **${op.status}**`,
        `- Type: ${op.type || "n/a"}`,
        `- Created: ${op.createdAt?.slice(0, 19) || "n/a"}`,
        `- Modified: ${op.modifiedAt?.slice(0, 19) || "n/a"}`,
      ];
      if (op.details && Object.keys(op.details).length) {
        lines.push(`- Details: ${JSON.stringify(op.details)}`);
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );
}
