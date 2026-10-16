import { useMemo, useState } from "react";
import type { ProfileEntityV2 } from "@retrodesk/shared";

type Props = {
  profiles: ProfileEntityV2[];
  currentId?: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDuplicate: (id: string) => void;
};

/** Compact site-level OC selector shared by desktop and phone authoring surfaces. */
export function ProfileSwitcher({ profiles, currentId, onSelect, onAdd, onDuplicate }: Props) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return profiles.filter((profile) => !normalized || `${profile.handle ?? profile.username} ${profile.displayName ?? profile.name}`.toLowerCase().includes(normalized));
  }, [profiles, query]);
  return (
    <section className="ig-profile-switcher" aria-label="角色切換器">
      <div className="ie-row">
        <input className="w98-input compact grow" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋角色…" aria-label="搜尋角色" />
        <button type="button" className="w98-btn small" onClick={onAdd}>＋ 新增角色</button>
      </div>
      <div role="listbox" aria-label="角色清單">
        {visible.map((profile) => (
          <div key={profile.id} role="option" aria-selected={profile.id === currentId} className={`ig-profile-option${profile.id === currentId ? " current" : ""}`}>
            <button type="button" className="grow profile-option-button" onClick={() => onSelect(profile.id)}>
              <strong>{(profile.displayName ?? profile.name) || "未命名角色"}</strong><small>@{profile.handle ?? profile.username}</small>
              {profile.visibility === "draft" ? <em>尚未發布</em> : null}
            </button>
            <button type="button" className="w98-btn small" onClick={() => onDuplicate(profile.id)} aria-label={`複製 ${profile.displayName ?? profile.name}`}>複製</button>
          </div>
        ))}
        {!visible.length ? <p className="w98-hint">找不到角色。</p> : null}
      </div>
    </section>
  );
}
