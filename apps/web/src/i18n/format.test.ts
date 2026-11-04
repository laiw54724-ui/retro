import { describe, expect, it } from "vitest";
import { formatDate, formatNumber, formatTime, INTL_LOCALES } from "./format";
import { SUPPORTED_LOCALES } from "./locale";

const instant = new Date("2026-10-17T09:07:00.000Z");

describe("locale-aware UI formatting", () => {
  it.each(SUPPORTED_LOCALES)("formats dates, times and numbers with Intl for %s", (locale) => {
    expect(formatDate(instant, locale, { dateStyle: "full", timeZone: "UTC" })).toBe(
      new Intl.DateTimeFormat(INTL_LOCALES[locale], { dateStyle: "full", timeZone: "UTC" }).format(instant)
    );
    expect(formatTime(instant, locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" })).toBe(
      new Intl.DateTimeFormat(INTL_LOCALES[locale], { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(instant)
    );
    expect(formatNumber(12345.67, locale)).toBe("12,345.67");
    expect(formatNumber(1234567n, locale)).toBe("1,234,567");
  });

  it("uses different date conventions and caller-specified numeric options", () => {
    expect(formatDate(instant, "en", { dateStyle: "full", timeZone: "UTC" })).toBe("Saturday, October 17, 2026");
    expect(formatDate(instant, "ja", { dateStyle: "full", timeZone: "UTC" })).toBe("2026年10月17日土曜日");
    expect(formatDate(instant, "ko", { dateStyle: "full", timeZone: "UTC" })).toBe("2026년 10월 17일 토요일");
    expect(formatNumber(0.25, "en", { style: "percent" })).toBe("25%");
    expect(formatTime(instant, "zh-Hant", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" })).toBe("09:07");
  });
});
