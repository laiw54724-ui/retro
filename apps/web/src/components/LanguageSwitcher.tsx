import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { changeLocale } from "../i18n";
import { DEFAULT_LOCALE, ENABLED_LOCALES, LOCALE_NAMES, fontStackForLocale, normalizeLocale } from "../i18n/locale";
import styles from "./LanguageSwitcher.module.css";

type Props = {
  compact?: boolean;
  className?: string;
};

/** Interface preference only: changing language never updates a site document. */
export function LanguageSwitcher({ compact = false, className = "" }: Props) {
  const { t, i18n } = useTranslation("common");
  const { t: errorText } = useTranslation("errors");
  const id = useId();
  const [changing, setChanging] = useState(false);
  const [failed, setFailed] = useState(false);
  const locale = normalizeLocale(i18n.resolvedLanguage ?? i18n.language) ?? DEFAULT_LOCALE;
  const hint = [
    t("language.partialNote"),
    ENABLED_LOCALES.some((option) => option === "ja" || option === "ko") ? t("language.betaNote") : "",
    t("language.zhHansNote")
  ].filter(Boolean).join(" ");

  async function selectLanguage(value: string) {
    const next = normalizeLocale(value);
    if (!next || changing) return;
    setChanging(true);
    setFailed(false);
    try {
      setFailed(!(await changeLocale(next)));
    } catch {
      setFailed(true);
    } finally {
      setChanging(false);
    }
  }

  return (
    <div
      className={[styles.root, compact ? styles.compact : "", className].filter(Boolean).join(" ")}
      style={{ fontFamily: fontStackForLocale(locale) }}
      aria-busy={changing}
    >
      <label className={compact ? styles.visuallyHidden : styles.label} htmlFor={id}>{t("language.label")}</label>
      <select
        id={id}
        data-testid="language-switcher"
        className={styles.select}
        value={locale}
        aria-describedby={`${id}-hint`}
        title={`${t("language.label")}. ${hint}`}
        aria-disabled={changing}
        onChange={(event) => void selectLanguage(event.target.value)}
      >
        {ENABLED_LOCALES.map((option) => (
          <option key={option} value={option} lang={option} style={{ fontFamily: fontStackForLocale(option) }}>
            {LOCALE_NAMES[option]}{option === "ja" || option === "ko" ? ` (${t("language.beta")})` : ""}
          </option>
        ))}
      </select>
      <p id={`${id}-hint`} className={compact ? styles.visuallyHidden : styles.hint}>{hint}</p>
      {changing ? <span className={styles.feedback} role="status">{t("language.changing")}</span> : null}
      {failed ? <p className={styles.error} role="alert">{errorText("languageChangeFailed")}</p> : null}
    </div>
  );
}
