import type { TFunction } from "i18next";
import type { resources } from "./resources";

type ErrorCode = keyof typeof resources.en.errors.codes;
const ERROR_KEYS = {
  unauthorized: "codes.unauthorized",
  forbidden: "codes.forbidden",
  not_found: "codes.not_found",
  version_conflict: "codes.version_conflict",
  request_failed: "codes.request_failed",
  internal_error: "codes.internal_error",
  export_failed: "codes.export_failed",
  db_error: "codes.db_error",
  rate_limited: "codes.rate_limited",
  invalid_draft: "codes.invalid_draft",
  not_published: "codes.not_published"
} as const satisfies Record<ErrorCode, `codes.${ErrorCode}`>;

/** Whitelist codes at the view boundary; never surface an API's raw message/details. */
export function translateError(error: unknown, t: TFunction<"errors">, fallback?: string): string {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  if (typeof code === "string" && Object.hasOwn(ERROR_KEYS, code)) {
    return t(ERROR_KEYS[code as ErrorCode]);
  }
  return fallback ?? t("generic");
}
