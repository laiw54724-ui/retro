import { reservedUsernames } from "@retrodesk/shared";

/** Match the shared username contract while explaining the first actionable rule. */
export function usernameIssue(value: string): "tooShort" | "tooLong" | "characters" | "edges" | "reserved" | null {
  if (value.length < 3) return "tooShort";
  if (value.length > 20) return "tooLong";
  if (!/^[a-z0-9-]+$/.test(value)) return "characters";
  if (value.startsWith("-") || value.endsWith("-")) return "edges";
  if (reservedUsernames.has(value)) return "reserved";
  return null;
}
