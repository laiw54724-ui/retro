import { Fragment } from "react";
import type { ProfileEntityV2 } from "@retrodesk/shared";
import styles from "./ocEditor.module.css";

/** The caller supplies the permitted active profile; this component only presents it. */
export function ProfileDetails({ profile }: { profile?: ProfileEntityV2 }) {
  const pronouns = profile?.pronouns.trim() ?? "";
  const worldTags = profile?.worldTags.filter((tag) => tag.trim()) ?? [];
  const customFields = profile?.customFields.filter((field) => field.key.trim() || field.value.trim()) ?? [];
  if (!pronouns && !worldTags.length && !customFields.length) return null;

  return <details className={styles.profileDetails}>
    <summary>角色資料</summary>
    {worldTags.length ? <ul className={styles.worldTags} aria-label="世界標籤">
      {worldTags.map((tag, index) => <li key={`${index}:${tag}`}>{tag}</li>)}
    </ul> : null}
    {pronouns || customFields.length ? <dl>
      {pronouns ? <><dt>代名詞</dt><dd>{pronouns}</dd></> : null}
      {customFields.map((field, index) => <Fragment key={`${index}:${field.key}`}>
        <dt>{field.key}</dt>
        <dd>{field.value}</dd>
      </Fragment>)}
    </dl> : null}
  </details>;
}
