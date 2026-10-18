import { useMemo, useRef, useState } from "react";
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
  return <section className="ig-profile-switcher" aria-label="角色切換器">
    <div className={styles.currentRole}>
      <span className="ig-thumb round ph" aria-hidden="true">{current?.avatar ? <AvatarImage src={current.avatar} crop={current.avatarCrop} alt="" /> : null}</span>
      <label className="w98-field grow"><span>目前編輯角色</span>
        <select ref={select} className="w98-input compact" value={current?.id ?? ""} onChange={(event) => choose(event.target.value)}>
          {!current ? <option value="">選擇角色</option> : null}
          {profiles.map((profile) => <option key={profile.id} value={profile.id}>{(profile.displayName ?? profile.name) || "未命名角色"} @{profile.handle ?? profile.username}{profile.visibility === "draft" ? "（草稿）" : ""}</option>)}
        </select>
      </label>
      <button type="button" className="w98-btn small" onClick={() => { setExpanded(false); onAdd(); }}>＋ 新增角色</button>
    </div>
    <p className={styles.roleHint}><strong>{current?.visibility === "draft" ? "尚未發布" : "可發布"}</strong> · 切換會設定此視窗的入口角色，各角色內容會保留。</p>
    <details className={styles.directory} open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>尋找與管理角色（{profiles.length}）</summary>
      <div className="ie-row">
        <input type="search" className="w98-input compact grow" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋名稱、帳號或世界標籤" aria-label="搜尋角色" />
        <select aria-label="角色狀態篩選" className="w98-input compact" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">全部狀態</option><option value="draft">草稿角色</option><option value="published">可發布角色</option>
        </select>
      </div>
      <div className="ie-row"><span className="w98-hint" aria-live="polite">找到 {visible.length} / {profiles.length} 位角色</span>
        {query || status !== "all" ? <button type="button" className="w98-btn small" onClick={() => { setQuery(""); setStatus("all"); }}>清除角色篩選</button> : null}
      </div>
      <ul className={styles.roleList} aria-label="角色清單">
        {visible.map((profile) => <li key={profile.id} className={`ig-profile-option${profile.id === currentId ? " current" : ""}`}>
          <button type="button" className="grow profile-option-button" aria-pressed={profile.id === currentId} onClick={() => choose(profile.id)}>
            <strong>{(profile.displayName ?? profile.name) || "未命名角色"}</strong><small>@{profile.handle ?? profile.username}</small>
            {profile.id === currentId ? <em>正在編輯</em> : null}{profile.visibility === "draft" ? <em>尚未發布</em> : null}
          </button>
          <button type="button" className="w98-btn small" onClick={() => { setExpanded(false); onDuplicate(profile.id); select.current?.focus(); }} aria-label={`複製 ${profile.displayName ?? profile.name}`}>複製</button>
        </li>)}
      </ul>
      {!visible.length ? <p className="w98-hint">找不到角色，試試其他名稱或清除篩選。</p> : null}
    </details>
  </section>;
}
