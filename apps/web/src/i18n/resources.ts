import zhCommon from "./locales/zh-Hant/common.json";
import zhEditor from "./locales/zh-Hant/editor.json";
import zhInstagram from "./locales/zh-Hant/instagram.json";
import zhMusic from "./locales/zh-Hant/music.json";
import zhErrors from "./locales/zh-Hant/errors.json";
import enCommon from "./locales/en/common.json";
import enEditor from "./locales/en/editor.json";
import enInstagram from "./locales/en/instagram.json";
import enMusic from "./locales/en/music.json";
import enErrors from "./locales/en/errors.json";
import jaCommon from "./locales/ja/common.json";
import jaEditor from "./locales/ja/editor.json";
import jaInstagram from "./locales/ja/instagram.json";
import jaMusic from "./locales/ja/music.json";
import jaErrors from "./locales/ja/errors.json";
import koCommon from "./locales/ko/common.json";
import koEditor from "./locales/ko/editor.json";
import koInstagram from "./locales/ko/instagram.json";
import koMusic from "./locales/ko/music.json";
import koErrors from "./locales/ko/errors.json";

export const NAMESPACES = ["common", "editor", "instagram", "music", "errors"] as const;
export type Namespace = typeof NAMESPACES[number];

// This small foundation is bundled: switching has no fetch/chunk-loading dependency.
// #33 can introduce a loader once catalog size warrants it, without remounting App.
export const resources = {
  "zh-Hant": { common: zhCommon, editor: zhEditor, instagram: zhInstagram, music: zhMusic, errors: zhErrors },
  en: { common: enCommon, editor: enEditor, instagram: enInstagram, music: enMusic, errors: enErrors },
  ja: { common: jaCommon, editor: jaEditor, instagram: jaInstagram, music: jaMusic, errors: jaErrors },
  ko: { common: koCommon, editor: koEditor, instagram: koInstagram, music: koMusic, errors: koErrors }
};
