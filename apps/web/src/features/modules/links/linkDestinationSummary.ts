import type { LinkItem } from "@retrodesk/shared";
import { safeHref } from "../types";

type Destination = Pick<LinkItem, "target" | "url" | "windowId">;

export type LinkDestinationSummary = {
  state: "ready" | "empty" | "invalid" | "missing";
  summary: string;
  hint: string;
};

/** Describes the existing URL/window contract without inventing a new destination type. */
export function linkDestinationSummary(link: Destination, windows: readonly { id: string; title: string }[]): LinkDestinationSummary {
  if (link.target === "window") {
    if (!link.windowId) return { state: "empty", summary: "尚未選擇站內視窗", hint: "選擇按下按鈕後要開啟的視窗。" };
    const target = windows.find((candidate) => candidate.id === link.windowId);
    if (!target) return { state: "missing", summary: "目標視窗已不存在", hint: "請重新選擇視窗，這個按鈕目前無法開啟目標。" };
    return { state: "ready", summary: `開啟視窗：${target.title || "未命名視窗"}`, hint: "訪客會在桌面開啟這個視窗。" };
  }

  const raw = link.url.trim();
  if (!raw || /^(?:https?:\/\/|mailto:)$/i.test(raw)) {
    return { state: "empty", summary: "尚未設定完整網址", hint: "貼上網站或 mailto: 電子郵件連結。" };
  }
  if (safeHref(raw) === "#") {
    return { state: "invalid", summary: "網址格式無法開啟", hint: "請使用完整的 http://、https:// 或 mailto: 網址。" };
  }

  const parsed = new URL(raw);
  return {
    state: "ready",
    summary: parsed.protocol === "mailto:" ? `電子郵件：${parsed.pathname || raw}` : `網址：${parsed.href}`,
    hint: parsed.protocol === "mailto:" ? "使用訪客的電子郵件程式開啟。" : "在新分頁開啟。",
  };
}
