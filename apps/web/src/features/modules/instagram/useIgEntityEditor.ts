import { useLayoutEffect, useRef } from "react";
import { useIgEditorState } from "./useIgEditorState";

/** List/detail navigation is UI-only. Visited bodies stay mounted to retain field drafts. */
export function useIgEntityEditor(scope: string, ids: string[]) {
  const [selected, setSelected] = useIgEditorState<string | null>(scope, null);
  const [visited, setVisited] = useIgEditorState<string[]>(scope, []);
  const root = useRef<HTMLFieldSetElement>(null);
  const returnTo = useRef(new Map<string, { id: string; scroll: number }>());
  const focusField = useRef(false);
  const previous = useRef<{ scope: string; id: string | null }>({ scope, id: null });
  const openId = selected && ids.includes(selected) ? selected : null;
  const setOpenId = (id: string | null, options?: { focusField?: boolean }) => {
    focusField.current = !!options?.focusField;
    if (id) {
      const scroll = root.current?.closest<HTMLElement>(".ig-edit-scroll");
      returnTo.current.set(scope, { id, scroll: scroll?.scrollTop ?? 0 });
      setVisited((current) => current.includes(id) ? current : [...current, id]);
    }
    setSelected(id);
  };
  useLayoutEffect(() => {
    const last = previous.current;
    previous.current = { scope, id: openId };
    if (last.scope !== scope || last.id === openId || !root.current || root.current.closest("[hidden]")) return;
    const scroll = root.current.closest<HTMLElement>(".ig-edit-scroll");
    if (openId) {
      if (scroll) scroll.scrollTop = 0;
      const target = focusField.current
        ? root.current.querySelector<HTMLInputElement>("article:not([hidden]) [data-ig-initial-focus]")
        : root.current.querySelector<HTMLButtonElement>("[data-ig-back]");
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "nearest" });
      focusField.current = false;
    } else {
      const saved = returnTo.current.get(scope);
      if (scroll) scroll.scrollTop = saved?.scroll ?? 0;
      const button = Array.from(root.current.querySelectorAll<HTMLButtonElement>("[data-ig-edit]")).find((item) => item.dataset.igEdit === saved?.id);
      (button ?? root.current.querySelector<HTMLButtonElement>("button"))?.focus({ preventScroll: true });
    }
  }, [scope, openId]);
  return { root, openId, setOpenId, wasOpened: (id: string) => id === openId || visited.includes(id) };
}
