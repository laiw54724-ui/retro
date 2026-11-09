import { describe, expect, it } from "vitest";
import { UsernameSchema } from "@retrodesk/shared";
import { usernameIssue } from "./usernameIssue";

describe("URL rule feedback", () => {
  it.each([["ab", "tooShort"], ["a".repeat(21), "tooLong"], ["bad_name", "characters"], ["-name", "edges"], ["name-", "edges"], ["admin", "reserved"], ["good-name", null], ["abc", null]])("explains %s", (value, issue) => {
    expect(usernameIssue(value!)).toBe(issue);
    expect(UsernameSchema.safeParse(value).success).toBe(issue === null);
  });
});
