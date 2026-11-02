/** Escapes user input so it can be embedded safely in a MongoDB $regex. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
