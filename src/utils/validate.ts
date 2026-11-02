import type { ZodType } from "zod";

/** Parses untrusted input; a ZodError is translated to a 400 by the error handler. */
export function parse<T>(schema: ZodType<T>, input: unknown): T {
  return schema.parse(input);
}
