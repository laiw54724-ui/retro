import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import type { ProfileEntityV2 } from "@retrodesk/shared";
import styles from "./ocEditor.module.css";

/** The caller supplies the permitted active profile; this component only presents it. */
export function ProfileDetails({ profile }: { profile?: ProfileEntityV2 }) {
  const { t: tr } = useTranslation("instagram");
  const pronouns = profile?.pronouns.trim() ?? "";
  const worldTags = profile?.worldTags.filter((tag) => tag.trim()) ?? [];
  const customFields = profile?.customFields.filter((field) => field.key.trim() || field.value.trim()) ?? [];
  if (!pronouns && !worldTags.length && !customFields.length) return null;

  return <details className={styles.profileDetails}>
    <summary>{tr("profileDetails.characterInfo")}</summary>
    {worldTags.length ? <ul className={styles.worldTags} aria-label={tr("profileDetails.worldTags")}>
      {worldTags.map((tag, index) => <li key={`${index}:${tag}`}>{tag}</li>)}
    </ul> : null}
    {pronouns || customFields.length ? <dl>
      {pronouns ? <><dt>{tr("profileDetails.pronouns")}</dt><dd>{pronouns}</dd></> : null}
      {customFields.map((field, index) => <Fragment key={`${index}:${field.key}`}>
        <dt>{field.key}</dt>
        <dd>{field.value}</dd>
      </Fragment>)}
    </dl> : null}
  </details>;
}
