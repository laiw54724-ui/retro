import { i18n, initI18n } from "../i18n";

// UI text that non-React helpers produce is localized when it is created. Unit tests assert the original
// Traditional Chinese wording, so pin the runtime to it (the language detector would otherwise follow the host).
await initI18n();
await i18n.changeLanguage("zh-Hant");
