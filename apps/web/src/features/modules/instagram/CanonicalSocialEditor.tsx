import { useMemo, useState } from "react";
import { addFollow, removeFollow, setProfileExtraCounts, type SiteDocumentV2Input } from "@retrodesk/shared";
import type { ModuleProps } from "../types";

type Props = { props: ModuleProps<"instagram"> };

export function CanonicalSocialEditor({ props }: Props) {
  const { ctx } = props;
  const profile = ctx.profiles?.find((item) => item.id === ctx.profileId);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const candidates = useMemo(() => (ctx.profiles ?? []).filter((item) => item.id !== profile?.id && `${item.displayName ?? item.name} ${item.handle ?? item.username}`.toLowerCase().includes(query.trim().toLowerCase())), [ctx.profiles, profile?.id, query]);
  if (!profile || !ctx.siteId || !ctx.updateContent) return null;

  const mutate = (recipe: (document: SiteDocumentV2Input) => ReturnType<typeof addFollow>, historyKey?: string) => ctx.updateContent?.((document) => {
    const result = recipe(document);
    if (!result.ok) { setError(result.diagnostics[0]?.message ?? "角色互動資料無效。"); return document; }
    setError("");
    return result.document;
  }, historyKey);

  const toggle = (otherId: string, direction: "followers" | "following", checked: boolean) => mutate((document) => {
    const fromProfileId = direction === "followers" ? otherId : profile.id;
    const toProfileId = direction === "followers" ? profile.id : otherId;
    const edge = (document.entities.followEdges ?? []).find((item) => item.fromProfileId === fromProfileId && item.toProfileId === toProfileId);
    return checked
      ? addFollow(document, { fromProfileId, toProfileId }, { siteId: ctx.siteId!, id: `follow:${crypto.randomUUID()}` })
      : edge
        ? removeFollow(document, edge.id, { siteId: ctx.siteId! })
        : { ok: true as const, document };
  });

  const setCount = (field: "otherFollowerCount" | "otherFollowingCount", value: number | null) => mutate((document) => setProfileExtraCounts(document, profile.id, { [field]: value }, { siteId: ctx.siteId! }), `social-count-${profile.id}-${field}`);
  const currentEdges = (ctx.socialDocument?.entities.followEdges ?? []);

  const list = (direction: "followers" | "following") => <div className="ig-social-checks">
    {candidates.map((candidate) => {
      const checked = currentEdges.some((edge) => direction === "followers" ? edge.fromProfileId === candidate.id && edge.toProfileId === profile.id : edge.fromProfileId === profile.id && edge.toProfileId === candidate.id);
      return <label key={`${direction}-${candidate.id}`} className="check-row"><input type="checkbox" checked={checked} onChange={(event) => toggle(candidate.id, direction, event.target.checked)} /><span><strong>{candidate.displayName ?? candidate.name}</strong> <small>@{candidate.handle ?? candidate.username}</small></span></label>;
    })}
    {candidates.length === 0 ? <span className="w98-hint">沒有符合的其他角色。</span> : null}
  </div>;

  return <fieldset className="w98-fieldset ig-social-editor"><legend>角色互動</legend>
    <p className="w98-hint">角色世界觀內容；訪客按讚或追蹤只限當次瀏覽，不會改動這裡。</p>
    {error ? <p role="alert" className="ie-error">{error}</p> : null}
    <input className="w98-input compact" aria-label="搜尋互動角色" placeholder="搜尋角色…" value={query} onChange={(event) => setQuery(event.target.value)} />
    <div className="ig-social-columns">
      <section><strong>粉絲名單</strong>{list("followers")}</section>
      <section><strong>追蹤中名單</strong>{list("following")}</section>
    </div>
    <div className="ig-social-counts">
      {([[
        "otherFollowerCount", "其他粉絲數", profile.legacyFollowersLabel ?? profile.followers
      ], [
        "otherFollowingCount", "其他追蹤數", profile.legacyFollowingLabel ?? profile.following
      ]] as const).map(([field, label, legacy]) => <label key={field} className="w98-field"><span>{label}</span>{profile[field] === null || profile[field] === undefined ? <span className="ie-row"><span className="w98-hint">舊顯示：{legacy || "（空白）"}</span><button type="button" className="w98-btn small" onClick={() => setCount(field, 0)}>改用結構化人數</button></span> : <span className="ie-row"><input className="w98-input compact" type="number" min={0} max={1_000_000_000} aria-label={label} value={profile[field] ?? 0} onChange={(event) => setCount(field, Math.max(0, Number(event.target.value) || 0))} /><button type="button" className="w98-btn small" onClick={() => setCount(field, null)}>恢復舊顯示</button></span>}</label>)}
    </div>
  </fieldset>;
}
