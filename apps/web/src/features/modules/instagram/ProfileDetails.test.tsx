import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createStarterDocument, migrateSiteDocumentV2, ProfileEntityV2Schema, type ProfileEntityV2 } from "@retrodesk/shared";
import { ProfileDetails } from "./ProfileDetails";

function profileFixture(patch: Partial<ProfileEntityV2> = {}): ProfileEntityV2 {
  const migrated = migrateSiteDocumentV2(createStarterDocument("Profile details", "classic98", "instagram"), { siteId: "site-details" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture migration failed");
  return ProfileEntityV2Schema.parse({ ...migrated.document.entities.profiles[0], ...patch });
}

describe("ProfileDetails", () => {
  it("omits empty details for a missing profile or a profile without additional information", () => {
    expect(renderToStaticMarkup(<ProfileDetails />)).toBe("");
    expect(renderToStaticMarkup(<ProfileDetails profile={profileFixture({ pronouns: " \n ", worldTags: [], customFields: [] })} />)).toBe("");
  });

  it("groups supplied draft-preview information in a native disclosure with named tags and definition terms", () => {
    const html = renderToStaticMarkup(<ProfileDetails profile={profileFixture({
      visibility: "draft",
      pronouns: "they / them",
      worldTags: ["雪國", "平行宇宙"],
      customFields: [{ key: "職業", value: "旅行者" }],
    })} />);

    expect(html).toMatch(/^<details\b[^>]*><summary>角色資料<\/summary>/);
    expect(html).not.toMatch(/<details\b[^>]*\bopen=/);
    expect(html).toContain('aria-label="世界標籤"');
    expect(html).toContain("<li>雪國</li><li>平行宇宙</li>");
    expect(html).toContain("<dt>代名詞</dt><dd>they / them</dd>");
    expect(html).toContain("<dt>職業</dt><dd>旅行者</dd>");
    expect(html).toContain("<dl>");
  });

  it("preserves long multiline field text while escaping markup in every displayed text channel", () => {
    const longLine = "長".repeat(420);
    const html = renderToStaticMarkup(<ProfileDetails profile={profileFixture({
      pronouns: "<b>they</b>",
      worldTags: ["<svg/onload=alert(1)>"],
      customFields: [{ key: "<img src=x onerror=alert(1)>", value: `第一行 <script>alert("unsafe")</script>\n${longLine}` }],
    })} />);

    expect(html).toContain("&lt;b&gt;they&lt;/b&gt;");
    expect(html).toContain("&lt;svg/onload=alert(1)&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain(`第一行 &lt;script&gt;alert(&quot;unsafe&quot;)&lt;/script&gt;\n${longLine}`);
    expect(html).not.toMatch(/<(?:script|img|svg|b)\b/);
  });
});
