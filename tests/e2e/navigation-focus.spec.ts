import { expect, test, type Page } from "@playwright/test";
import { makeWindow, migrateSiteDocumentV2, projectPublicSiteDocument } from "@retrodesk/shared";
import { igDocument } from "./ig-fixture";

const auth = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
function fixture() {
  const loaded = migrateSiteDocumentV2(igDocument(), { siteId: "site-1" });
  if (!loaded.ok) throw new Error("fixture");
  const doc = loaded.document;
  const first = makeWindow("explorer"), next = makeWindow("explorer", 1);
  if (first.type !== "explorer" || next.type !== "explorer") throw new Error("fixture");
  first.id = "first"; first.title = "First.exe";
  next.id = "next"; next.title = "Next.exe";
  const postTarget = { siteId: "site-1", kind: "post" as const, id: doc.entities.posts[0].id };
  first.content.shortcuts = [
    { id: "post", label: "Open post", parentId: null, order: 0, visibility: "published", target: postTarget },
    { id: "next", label: "Open next", parentId: null, order: 1, visibility: "published", target: { siteId: "site-1", kind: "window", id: next.id } }
  ];
  next.content.shortcuts = [{ id: "post", label: "Open post", parentId: null, order: 0, visibility: "published", target: postTarget }];
  doc.windows = [first, next];
  return doc;
}

async function openSource(page: Page, source: "preview" | "public") {
  const doc = fixture(); let writes = 0;
  await page.setViewportSize({ width: 390, height: 844 });
  if (source === "preview") {
    await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), auth);
    await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "Focus", draft_document: doc, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-19T00:00:00Z", access_role: "owner" } } }));
    await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
    await page.route("**/api/sites/site-1/draft", (route) => { writes++; return route.fulfill({ json: { version: 2, updatedAt: "2026-10-19T00:01:00Z" } }); });
    await page.goto("/editor/site-1");
    // Keep the author source mounted behind preview, with identical focus keys.
    await page.locator(".m-icon").getByText("First.exe", { exact: true }).click();
    // The direct owner editor has different markup from the visitor. Keep the
    // deliberate duplicate-key negative fixture on its real shortcut button.
    await page.locator('.folder-tree-editor .explorer-open[data-item-id="post"]').evaluate(node=>node.setAttribute('data-navigation-focus','explorer:first:shortcut:post'));
    await page.getByRole("button", { name: /訪客預覽/ }).first().click();
  } else {
    const projection = projectPublicSiteDocument(doc, "site-1");
    if (!projection.ok) throw new Error("projection");
    await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: "Focus", published_document: projection.document, published_version: 1, published_at: "2026-10-19T00:00:00Z" } } }));
    await page.goto("/@demo");
  }
  const scope = page.locator(source === "preview" ? ".preview-overlay" : ".visitor-page");
  await scope.locator(".m-icon").getByText("First.exe", { exact: true }).click();
  return { scope, writes: () => writes };
}

test("preview Back restores its trigger despite an earlier inert editor duplicate", async ({ page }) => {
  const { scope, writes } = await openSource(page, "preview");
  const key = '[data-navigation-focus="explorer:first:shortcut:post"]';
  await expect(page.locator(key)).toHaveCount(2);
  await expect(page.locator("#root")).toHaveAttribute("inert", "");
  const trigger = scope.getByRole("button", { name: "Open post", exact: true });
  await trigger.focus(); await page.keyboard.press("Enter");
  await expect(scope.locator(".ig-card")).toContainText("caption p1");
  await scope.locator(".m-back").click();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Space"); await expect(scope.locator(".ig-card")).toContainText("caption p1");
  await page.keyboard.press("Escape"); await expect(trigger).toBeFocused();
  await scope.getByRole("button", { name: /回到編輯器/ }).click();
  await expect(page.locator("#root").getByRole("dialog", { name: "First.exe", exact: true })).toBeVisible();
  await page.waitForTimeout(1200); expect(writes()).toBe(0);
});

for (const source of ["preview", "public"] as const) {
  test(`${source} nested keyboard returns restore each local trigger`, async ({ page }) => {
    const { scope, writes } = await openSource(page, source);
    const firstTrigger = scope.getByRole("button", { name: "Open next", exact: true });
    await firstTrigger.focus(); await page.keyboard.press("Enter");
    const postTrigger = scope.getByRole("button", { name: "Open post", exact: true });
    await postTrigger.focus(); await page.keyboard.press("Space");
    await expect(scope.locator(".ig-card")).toContainText("caption p1");
    await page.keyboard.press("Escape"); await expect(postTrigger).toBeFocused();
    await page.keyboard.press("Escape"); await expect(firstTrigger).toBeFocused();
    await page.waitForTimeout(1200); expect(writes()).toBe(0);
  });
}

test("focus helper ignores unavailable duplicates, stays in its surface, and uses a local fallback", async ({ page }) => {
  await openSource(page, "public");
  const result = await page.evaluate(async () => {
    const path = "/src/features/navigation/useVisitorNavigation.ts";
    const { restoreNavigationFocus } = await import(path);
    const host = document.createElement("div");
    document.body.append(host);
    // A visible duplicate outside the requested surface must not win either.
    const outside = document.createElement("button"); outside.dataset.navigationFocus = "same";
    outside.textContent = "outside"; host.append(outside);
    const surface = document.createElement("section"); surface.tabIndex = -1; host.append(surface);
    const add = (state: string) => {
      const wrapper = document.createElement("div"), button = document.createElement("button");
      button.textContent = state; button.dataset.navigationFocus = "same";
      wrapper.append(button); surface.append(wrapper);
      if (state === "inert") wrapper.inert = true;
      if (state === "hidden") wrapper.hidden = true;
      if (state === "aria-hidden") wrapper.setAttribute("aria-hidden", "true");
      if (state === "display") wrapper.style.display = "none";
      if (state === "visibility") wrapper.style.visibility = "hidden";
      if (state === "transparent") wrapper.style.opacity = "0";
      if (state === "disabled") button.disabled = true;
      if (state === "aria-disabled") button.setAttribute("aria-disabled", "true");
      if (state === "detached") wrapper.remove();
      return button;
    };
    for (const state of ["inert", "hidden", "aria-hidden", "display", "visibility", "transparent", "disabled", "aria-disabled", "detached"]) add(state);
    surface.style.maxHeight = "100px"; surface.style.overflow = "auto";
    const spacer = document.createElement("div"); spacer.style.height = "300px"; surface.append(spacer);
    const valid = add("valid");
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    outside.focus(); restoreNavigationFocus("same", surface); await frame();
    const selectedLocal = document.activeElement === valid;
    const scrolledToTarget = surface.scrollTop > 0;
    valid.disabled = true;
    restoreNavigationFocus("same", surface); await frame();
    const disabledFallback = document.activeElement === surface;
    outside.focus(); restoreNavigationFocus("missing", surface); await frame();
    const missingFallback = document.activeElement === surface;
    outside.focus(); restoreNavigationFocus(null, surface); await frame();
    const nullFallback = document.activeElement === surface;
    outside.focus(); restoreNavigationFocus("same", surface); surface.remove(); await frame();
    const detachedNoSteal = document.activeElement === outside;
    host.append(surface); surface.inert = true;
    restoreNavigationFocus("same", surface); await frame();
    const inertNoSteal = document.activeElement === outside;
    restoreNavigationFocus("same", null); await frame();
    const nullScopeNoSteal = document.activeElement === outside;
    host.remove();
    return { selectedLocal, scrolledToTarget, disabledFallback, missingFallback, nullFallback, detachedNoSteal, inertNoSteal, nullScopeNoSteal };
  });
  expect(result).toEqual({ selectedLocal: true, scrolledToTarget: true, disabledFallback: true, missingFallback: true, nullFallback: true, detachedNoSteal: true, inertNoSteal: true, nullScopeNoSteal: true });
});

test("legacy helper call scopes to its active surface and does not steal focus from a newer modal", async ({ page }) => {
  await openSource(page, "public");
  const result = await page.evaluate(async () => {
    const path = "/src/features/navigation/useVisitorNavigation.ts";
    const { restoreNavigationFocus } = await import(path);
    const host = document.createElement("div"); document.body.append(host);
    const outside = document.createElement("button"); outside.dataset.navigationFocus = "same"; outside.textContent = "outside"; host.append(outside);
    const surface = document.createElement("section"); surface.className = "visitor-mobile"; surface.tabIndex = -1; host.append(surface);
    const inside = document.createElement("button"); inside.dataset.navigationFocus = "same"; inside.textContent = "inside"; surface.append(inside);
    const active = document.createElement("button"); active.textContent = "active"; surface.append(active); active.focus();
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    restoreNavigationFocus("same"); await frame();
    const legacyLocal = document.activeElement === inside;
    restoreNavigationFocus("same", surface);
    const modal = document.createElement("div"); modal.setAttribute("aria-modal", "true");
    const modalButton = document.createElement("button"); modalButton.textContent = "new modal"; modal.append(modalButton); host.append(modal); modalButton.focus();
    await frame();
    const modalKeepsFocus = document.activeElement === modalButton;
    host.remove(); return { legacyLocal, modalKeepsFocus };
  });
  expect(result).toEqual({ legacyLocal: true, modalKeepsFocus: true });
});
