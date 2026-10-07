import { z } from "zod";

export function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true as const };
}

/** Required on tools that spend money or delete: the model must pass it explicitly. */
export const CONFIRM = z
  .literal(true)
  .describe("Must be true. Set it only after the user has explicitly approved this action.");
