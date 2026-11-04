import { createInstance, type i18n as I18n } from "i18next";
import { initReactI18next } from "react-i18next";
import {
  DEFAULT_LOCALE, ENABLED_LOCALES, browserLanguages, browserStorage,
  detectLocale, normalizeLocale, readLocalePreference, saveLocalePreference,
  type Locale, type StorageAccessor
} from "./locale";
import { NAMESPACES, resources } from "./resources";

type ControllerOptions = {
  instance?: I18n;
  available?: readonly Locale[];
  getStorage?: StorageAccessor;
  getBrowserLanguages?: () => readonly string[];
  getDocumentElement?: () => Pick<HTMLElement, "lang" | "dir"> | undefined;
};

/** Independently testable, browser-local UI state. No editor store/document imports. */
export function createLocaleController({
  instance = createInstance(),
  available = ENABLED_LOCALES,
  getStorage = browserStorage,
  getBrowserLanguages = browserLanguages,
  getDocumentElement = () => typeof document === "undefined" ? undefined : document.documentElement
}: ControllerOptions = {}) {
  let initialization: Promise<void> | undefined;
  let changeQueue: Promise<unknown> = Promise.resolve();

  function updateDocumentLanguage(language: string) {
    const root = getDocumentElement();
    if (!root) return;
    root.lang = normalizeLocale(language) ?? DEFAULT_LOCALE;
    root.dir = "ltr";
  }

  function init(): Promise<void> {
    initialization ??= (async () => {
      const locale = detectLocale({
        storedLocale: readLocalePreference(getStorage),
        browserLanguages: getBrowserLanguages(),
        available
      });
      await instance.use(initReactI18next).init({
        resources: structuredClone(resources),
        lng: locale,
        supportedLngs: [...available],
        fallbackLng: ["en", "zh-Hant"],
        load: "currentOnly",
        ns: [...NAMESPACES],
        defaultNS: "common",
        initAsync: false,
        returnNull: false,
        returnEmptyString: false,
        saveMissing: false,
        interpolation: { escapeValue: false }, // React escapes text nodes.
        react: { useSuspense: false, bindI18n: "languageChanged" },
        // Never display an internal key/raw API error when every locale is missing it.
        parseMissingKeyHandler: (_key, _defaultValue, options) => {
          const language = normalizeLocale(options?.lng) ?? normalizeLocale(instance.language) ?? DEFAULT_LOCALE;
          return resources[language].errors.generic;
        },
        returnedObjectHandler: () => resources[normalizeLocale(instance.language) ?? DEFAULT_LOCALE].errors.generic
      });
      updateDocumentLanguage(instance.language);
      instance.on("languageChanged", updateDocumentLanguage);
      // Detection is not a manual preference: only an explicit switch is persisted.
    })();
    return initialization;
  }

  function changeLocale(locale: Locale): Promise<boolean> {
    if (!available.includes(locale)) return Promise.resolve(false);
    // More than one shell may expose a select (editor + visitor preview).
    // Serialize requests so a slow earlier selection cannot overwrite the last one.
    const change = changeQueue.then(async () => {
      await init();
      const previous = normalizeLocale(instance.language) ?? DEFAULT_LOCALE;
      try {
        await instance.changeLanguage(locale);
        saveLocalePreference(locale, getStorage);
        return true;
      } catch {
        // Resources are bundled, but keep this contract safe for a future loader.
        if (instance.language !== previous) await instance.changeLanguage(previous);
        return false;
      }
    }).catch(() => false);
    changeQueue = change;
    return change;
  }

  return { i18n: instance, init, changeLocale };
}

const controller = createLocaleController();
export const i18n = controller.i18n;
export const initI18n = controller.init;
export const changeLocale = controller.changeLocale;
