import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/** Public help links name their destination and disclose opening a new tab. */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  const { t } = useTranslation("common");
  return <a href={href} target="_blank" rel="noopener noreferrer" className="public-external-link">{children} <span className="external-link-note">{t("actions.opensNewTab")}</span></a>;
}
