import type { Page } from "@playwright/test";

export async function mockWindowsIconPack(page: Page) {
  await page.route("**/windows-icons/.retro-icon-pack.json", (route) => route.fulfill({
    json: {
      schemaVersion: 1,
      source: "https://github.com/trapd00r/win95-winxp_icons",
      commit: "728a866ad59a54fd4082dbe000e1e62e50bd90e9",
      fileCount: 1193,
      license: "NOASSERTION",
    },
  }));
}

export const documentFixture = {
  schemaVersion: 1,
  siteName: "Demo Desk",
  theme: {
    id: "classic98",
    name: "經典 98",
    wall: "#008080",
    pattern: "none",
    patternColor: "#0a8f8f",
    face: "#c0c0c0",
    light: "#dfdfdf",
    shadow: "#808080",
    dark: "#0a0a0a",
    text: "#111111",
    titleFrom: "#000080",
    titleTo: "#1084d0",
    taskbar: "#c0c0c0",
    accent: "#000080",
    font: "noto",
    iconStyle: "classic"
  },
  windows: [
    {
      id: "about",
      type: "about",
      title: "About.exe",
      icon: "user",
      defaultOpen: true,
      layout: {
        desktop: { x: 140, y: 40, w: 340, h: 360, z: 1, iconX: 16, iconY: 18 },
        mobile: { order: 0 }
      },
      content: {
        avatar: null,
        nickname: "Demo User",
        bio: "Hello from Retro Desktop.",
        banner: "ABOUT ME",
        quote: "",
        fields: [{ id: "field-1", key: "Role", value: "Creator" }],
        socials: []
      }
    },
    {
      id: "links",
      type: "links",
      title: "Links.exe",
      icon: "link",
      defaultOpen: false,
      layout: {
        desktop: { x: 500, y: 90, w: 300, h: 260, z: 2, iconX: 16, iconY: 96 },
        mobile: { order: 1 }
      },
      content: {
        links: [{ id: "link-1", label: "Example", icon: "link", color: "#000080", target: "url", url: "https://example.com", windowId: "" }]
      }
    }
  ],
  mobileColumns: 4
};
