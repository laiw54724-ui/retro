import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProfileEntityV2 } from "@retrodesk/shared";
import { AvatarImage } from "../../../components/AvatarImage";
import styles from "./ocEditor.module.css";

type Props = {
  profiles: ProfileEntityV2[];
  currentId?: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDuplicate: (id: string) => void;
};

/** Site-level role assignment with a compact native picker and searchable management list. */
export function ProfileSwitcher({ profiles, currentId, onSelect, onAdd, onDuplicate }: Props) {
  const { t: tr } = useTranslation("instagram");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const select = useRef<HTMLSelectElement>(null);
  const current = profiles.find((profile) => profile.id === currentId);
  const visible = useMemo(() => {
    const normalized = query.normalize("NFKC").trim().toLowerCase();
    return profiles.filter((profile) => (status === "all" || profile.visibility === status) &&
      `${profile.handle ?? profile.username} ${profile.displayName ?? profile.name} ${profile.worldTags.join(" ")}`.normalize("NFKC").toLowerCase().includes(normalized));
  }, [profiles, query, status]);
  const choose = (id: string) => {
    if (id !== currentId) onSelect(id);
    setExpanded(false);
    select.current?.focus();
  };
  return <section className="ig-profile-switcher" aria-label={tr("profileSwitcher.characterSwitcher")}>
    <div className={styles.currentRole}>
      <span className="ig-thumb round ph" aria-hidden="true">{current?.avatar ? <AvatarImage src={current.avatar} crop={current.avatarCrop} alt="" /> : null}</span>
      <label className="w98-field grow"><span>{tr("profileSwitcher.characterBeingEdited")}</span>
        <select ref={select} className="w98-input compact" value={current?.id ?? ""} onChange={(event) => choose(event.target.value)}>
          {!current ? <option value="">{tr("profileSwitcher.chooseACharacter")}</option> : null}
          {profiles.map((profile) => <option key={profile.id} value={profile.id}>{(profile.displayName ?? profile.name) || tr("profileSwitcher.unnamedCharacter")} @{profile.handle ?? profile.username}{profile.visibility === "draft" ? tr("profileSwitcher.draft") : ""}</option>)}
        </select>
      </label>
      <button type="button" className="w98-btn small" onClick={() => { setExpanded(false); onAdd(); }}>{tr("profileSwitcher.addCharacter")}</button>
    </div>
    <p className={styles.roleHint}><strong>{current?.visibility === "draft" ? tr("profileSwitcher.notPublished") : tr("profileEditor.publishable")}</strong> {tr("profileSwitcher.switchingSetsThisWindowsEntry")}</p>
    <details className={styles.directory} open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>{tr("ig.findManage", { count: profiles.length })}</summary>
      <div className="ie-row">
        <input type="search" className="w98-input compact grow" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("profileSwitcher.searchByNameHandleOr")} aria-label={tr("profileSwitcher.searchCharacters")} />
        <select aria-label={tr("profileSwitcher.characterStatusFilter")} className="w98-input compact" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">{tr("canonicalPostEditor.allStatuses")}</option><option value="draft">{tr("profileSwitcher.draftCharacters")}</option><option value="published">{tr("profileSwitcher.publishableCharacters")}</option>
        </select>
      </div>
      <div className="ie-row"><span className="w98-hint" aria-live="polite">{tr("ig.foundCharacters", { shown: visible.length, total: profiles.length })}</span>
        {query || status !== "all" ? <button type="button" className="w98-btn small" onClick={() => { setQuery(""); setStatus("all"); }}>{tr("profileSwitcher.clearCharacterFilters")}</button> : null}
      </div>
      <ul className={styles.roleList} aria-label={tr("profileSwitcher.characterList")}>
        {visible.map((profile) => <li key={profile.id} className={`ig-profile-option${profile.id === currentId ? " current" : ""}`}>
          <button type="button" className="grow profile-option-button" aria-pressed={profile.id === currentId} onClick={() => choose(profile.id)}>
            <strong>{(profile.displayName ?? profile.name) || tr("profileSwitcher.unnamedCharacter")}</strong><small>@{profile.handle ?? profile.username}</small>
            {profile.id === currentId ? <em>{tr("profileSwitcher.editing")}</em> : null}{profile.visibility === "draft" ? <em>{tr("profileSwitcher.notPublished")}</em> : null}
          </button>
          <button type="button" className="w98-btn small" onClick={() => { setExpanded(false); onDuplicate(profile.id); select.current?.focus(); }} aria-label={tr("profileSwitcher.duplicate", { v1: profile.displayName ?? profile.name })}>{tr("profileSwitcher.duplicate2")}</button>
        </li>)}
      </ul>
      {!visible.length ? <p className="w98-hint">{tr("profileSwitcher.noCharactersFoundTryAnother")}</p> : null}
    </details>
  </section>;
}
