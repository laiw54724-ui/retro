import { Link } from "react-router-dom";
import { RetroButton } from "../../components/RetroButton";
import type { SiteListRecord } from "../../lib/api";

const ROLE_LABEL = { owner: "擁有者", editor: "可編輯", viewer: "只能查看" } as const;
const ACTION_LABEL = { owner: "編輯", editor: "協作編輯", viewer: "查看私人草稿" } as const;
const dateTime = new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short" });

function publishState(site: SiteListRecord) {
  if (site.published_version == null) return "尚未發布";
  if (site.draft_version > site.published_version) return `已發布 v${site.published_version} · 有未發布變更`;
  return `已發布 v${site.published_version}`;
}

export function DesktopHub({ email, sites, loading, error, notice, onRetry, onSignOut }: {
  email: string;
  sites: SiteListRecord[];
  loading: boolean;
  error: string;
  notice: string;
  onRetry: () => void;
  onSignOut: () => void | Promise<void>;
}) {
  return (
    <div className="desktop-hub-body">
      <div className="desktop-hub-heading">
        <div>
          <h1>我的桌面</h1>
          <p>{email} · {loading ? "正在讀取…" : `${sites.length} 個桌面`}</p>
        </div>
        <Link className="retro-link desktop-hub-add" to="/onboarding">新增桌面</Link>
      </div>

      {notice ? <p className="info-box" role="status">{notice}</p> : null}
      {error ? <div className="desktop-hub-error error-box" role="alert"><span>{error}</span><RetroButton onClick={onRetry}>重試</RetroButton></div> : null}

      {loading ? (
        <p className="desktop-hub-empty" role="status">正在載入你的桌面…</p>
      ) : !error && sites.length === 0 ? (
        <div className="desktop-hub-empty">
          <strong>還沒有桌面</strong>
          <p>建立第一個桌面，或使用綁定這個 Google 帳號的協作邀請。</p>
          <Link className="retro-link primary" to="/onboarding">建立第一個桌面</Link>
        </div>
      ) : !error ? (
        <ul className="desktop-hub-list" aria-label="桌面清單">
          {sites.map((site) => {
            const role = site.access_role;
            const action = ACTION_LABEL[role];
            return <li key={site.id} className="desktop-hub-card">
              <div className="desktop-hub-card-title">
                <div><strong title={site.site_name}>{site.site_name}</strong><span title={`@${site.username}`}>@{site.username}</span></div>
                <span className={`desktop-role-badge ${role}`}>{ROLE_LABEL[role]}</span>
              </div>
              <dl>
                <div><dt>狀態</dt><dd>{publishState(site)}</dd></div>
                <div><dt>更新</dt><dd>{dateTime.format(new Date(site.updated_at))}</dd></div>
              </dl>
              {role === "editor" ? <p className="desktop-role-help">可以編輯草稿；發布與成員管理由擁有者負責。</p> : null}
              {role === "viewer" ? <p className="desktop-role-help">只能查看私人草稿，不會產生儲存或發布變更。</p> : null}
              <Link className="retro-link primary desktop-hub-open" to={`/editor/${site.id}`} aria-label={`${action} ${site.site_name}`}>{action}</Link>
            </li>;
          })}
        </ul>
      ) : null}

      <footer className="desktop-hub-footer">
        <Link className="retro-link" to="/">公開首頁</Link>
        <RetroButton onClick={onSignOut}>登出</RetroButton>
      </footer>
    </div>
  );
}
