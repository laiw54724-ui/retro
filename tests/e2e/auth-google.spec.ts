import { expect, test } from "@playwright/test";

test("Google sign-in button starts the Supabase OAuth redirect", async ({ page }) => {
  let authorizeUrl = "";
  await page.route("**/auth/v1/authorize**", async (route) => {
    authorizeUrl = route.request().url();
    await route.fulfill({ status: 200, contentType: "text/html", body: "<html>ok</html>" });
  });

  await page.goto("/auth");
  await page.getByRole("button", { name: "使用 Google 繼續" }).click();
  await expect.poll(() => authorizeUrl).not.toBe("");

  const url = new URL(authorizeUrl);
  expect(url.searchParams.get("provider")).toBe("google");
  expect(url.searchParams.get("redirect_to")).toBe(`http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? 5173}/auth`);
});

test("OAuth errors returned to /auth are shown to the user", async ({ page }) => {
  await page.goto("/auth?error=server_error&error_description=Unable+to+exchange+external+code");
  await expect(page.getByText("登入失敗：Unable to exchange external code")).toBeVisible();
});
