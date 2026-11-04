import { Link } from "react-router-dom";
import { i18n } from "../../i18n";
import { useTranslation } from "react-i18next";
import { RetroButton } from "../../components/RetroButton";
import { useLocaleFormatting } from "../../i18n/format";
import type { SiteListRecord } from "../../lib/api";


function publishState(site: SiteListRecord) {
  if (site.published_version == null) return i18n.t("common:desktopHub.notPublished");
  if (site.draft_version > site.published_version) return i18n.t("common:desktopHub.publishedVHasUnpublishedChanges", { published_version: site.published_version });
  return i18n.t("common:desktopHub.publishedV", { published_version: site.published_version });
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
  const { t: tr } = useTranslation("common");
  const ROLE_LABEL = { owner: tr("desktopHub.owner"), editor: tr("desktopHub.canEdit"), viewer: tr("desktopHub.viewOnly") } as const;
  const ACTION_LABEL = { owner: tr("desktopHub.edit"), editor: tr("desktopHub.collaborativeEditing"), viewer: tr("desktopHub.viewPrivateDraft") } as const;
  const { formatDate } = useLocaleFormatting();
  return (
    <div className="desktop-hub-body">
      <div className="desktop-hub-heading">
        <div>
          <h1>{tr("auth.myDesktops")}</h1>
          <p>{email} · {loading ? tr("desktopHub.loading") : tr("desktopHub.desktops", { length: sites.length })}</p>
        </div>
        <Link className="retro-link desktop-hub-add" to="/onboarding">{tr("desktopHub.newDesktop")}</Link>
      </div>

      {notice ? <p className="info-box" role="status">{notice}</p> : null}
      {error ? <div className="desktop-hub-error error-box" role="alert"><span>{error}</span><RetroButton onClick={onRetry}>{tr("desktopHub.retry")}</RetroButton></div> : null}

      {loading ? (
        <p className="desktop-hub-empty" role="status">{tr("desktopHub.loadingYourDesktops")}</p>
      ) : !error && sites.length === 0 ? (
        <div className="desktop-hub-empty">
          <strong>{tr("desktopHub.noDesktopsYet")}</strong>
          <p>{tr("desktopHub.createYourFirstDesktopOr")}</p>
          <Link className="retro-link primary" to="/onboarding">{tr("desktopHub.createYourFirstDesktop")}</Link>
        </div>
      ) : !error ? (
        <ul className="desktop-hub-list" aria-label={tr("desktopHub.desktopList")}>
          {sites.map((site) => {
            const role = site.access_role;
            const action = ACTION_LABEL[role];
            return <li key={site.id} className="desktop-hub-card">
              <div className="desktop-hub-card-title">
                <div><strong title={site.site_name}>{site.site_name}</strong><span title={`@${site.username}`}>@{site.username}</span></div>
                <span className={`desktop-role-badge ${role}`}>{ROLE_LABEL[role]}</span>
              </div>
              <dl>
                <div><dt>{tr("desktopHub.status")}</dt><dd>{publishState(site)}</dd></div>
                <div><dt>{tr("desktopHub.update")}</dt><dd>{formatDate(new Date(site.updated_at), { dateStyle: "medium", timeStyle: "short" })}</dd></div>
              </dl>
              {role === "editor" ? <p className="desktop-role-help">{tr("desktopHub.youCanEditTheDraft")}</p> : null}
              {role === "viewer" ? <p className="desktop-role-help">{tr("desktopHub.youCanOnlyViewThe")}</p> : null}
              <Link className="retro-link primary desktop-hub-open" to={`/editor/${site.id}`} aria-label={`${action} ${site.site_name}`}>{action}</Link>
            </li>;
          })}
        </ul>
      ) : null}

      <footer className="desktop-hub-footer">
        <Link className="retro-link" to="/">{tr("desktopHub.publicHomePage")}</Link>
        <RetroButton onClick={onSignOut}>{tr("desktopHub.signOut")}</RetroButton>
      </footer>
    </div>
  );
}
