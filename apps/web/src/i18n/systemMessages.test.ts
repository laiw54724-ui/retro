import { beforeAll, describe, expect, it } from "vitest";
import { buildPublishChecks, createStarterDocument, makeLink, normalizeImageUrl, type SiteDocument } from "@retrodesk/shared";
import { i18n, initI18n } from "./index";
import { resources } from "./resources";
import { SUPPORTED_LOCALES } from "./locale";
import { SYSTEM_MESSAGE_KEYS, translateSystemMessage } from "./systemMessages";

const HAN = /[㐀-鿿]/;
beforeAll(async () => { await initI18n(); });

function messagesFromShared(): string[] {
  const document = createStarterDocument("Messages", "classic98", "oc") as SiteDocument;
  const links = document.windows.find((window) => window.type === "links");
  if (links && links.type === "links") links.content.links = [makeLink({ label: "x", url: "https://" })];
  const empty = { ...document, windows: [] } as SiteDocument;
  const checks = [...buildPublishChecks(document), ...buildPublishChecks(empty)].map((check) => check.text);
  const reasons = ["", "x".repeat(3000), "not a url", "http://example.com/a.png", "https://drive.google.com/drive/folders/abc", "https://drive.google.com/file/d//view"]
    .map((raw) => normalizeImageUrl(raw)).flatMap((result) => result.ok ? [] : [result.reason]);
  return [...checks, ...reasons];
}

describe("shared-package messages are translated at the view boundary", () => {
  it("has every message key in every locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of SYSTEM_MESSAGE_KEYS) {
        const node = key.split(".").reduce<unknown>((current, part) => (current as Record<string, unknown> | undefined)?.[part], resources[locale].common.systemMessages);
        const present = node !== undefined || key.split(".").reduce<unknown>((current, part, index, all) => (current as Record<string, unknown> | undefined)?.[index === all.length - 1 ? `${part}_other` : part], resources[locale].common.systemMessages) !== undefined;
        expect(present, `${locale} systemMessages.${key}`).toBe(true);
      }
    }
  });

  it.each(["en", "ja", "ko"] as const)("renders every real publish check and image-link error without Chinese in %s", async (locale) => {
    await i18n.changeLanguage(locale);
    for (const text of messagesFromShared()) {
      const translated = translateSystemMessage(text);
      expect(HAN.test(text), "the fixture should exercise Chinese wording").toBe(true);
      expect(translated, `${locale}: ${text}`).not.toMatch(/[㐀-鿿]/);
      expect(translated.trim().length).toBeGreaterThan(0);
    }
    await i18n.changeLanguage("zh-Hant");
  });

  it("keeps Traditional Chinese exactly as authored and leaves unknown text untouched", async () => {
    await i18n.changeLanguage("zh-Hant");
    for (const text of messagesFromShared()) expect(translateSystemMessage(text)).toBe(text);
    expect(translateSystemMessage("Some schema message")).toBe("Some schema message");
  });
});
