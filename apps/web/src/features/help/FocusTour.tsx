import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { currentOpener } from "../../lib/openerFocus";
import type { HelpTopic } from "./helpTopics";
import { placeCard, resolveTarget, type Box, type TargetResult } from "./tourTargets";

type Props = { topic: HelpTopic; onClose: () => void; /** Where focus goes when the tour ends (the Help button); falls back to whatever opened the tour. */ returnFocusTo?: HTMLElement | null };

/**
 * Optional, skippable, replayable walkthrough. It is a non-modal card plus a ring around the real control: the page
 * stays usable, nothing is clicked or written for the person, and Skip is always visible. Escape closes it, closing
 * returns focus to the control that opened it. A step whose control is missing, hidden or disabled explains why and
 * lets the person go back or leave; it never points at nothing and never opens a feature to make the step work.
 */
export function FocusTour({ topic, onClose, returnFocusTo }: Props) {
  const { t } = useTranslation("editor");
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState<TargetResult>({ status: "missing", element: null });
  const [box, setBox] = useState<Box | null>(null);
  const [cardBox, setCardBox] = useState<Box | null>(null);
  const [paused, setPaused] = useState(false);
  const bodyId = useId();
  const card = useRef<HTMLDivElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const latestClose = useRef(onClose);
  latestClose.current = onClose;
  const step = topic.steps[index];
  const last = index === topic.steps.length - 1;

  useEffect(() => {
    opener.current ??= returnFocusTo ?? currentOpener();
    return () => { if (opener.current?.isConnected) opener.current.focus(); };
  }, []);

  // Keep the ring and the card attached to the real control through scrolling, resizing and re-renders.
  const measure = useCallback(() => {
    if (!step) return;
    // A modal dialog owns the screen: pause (hide) the tour until it closes instead of floating above it.
    setPaused((was) => { const now = !!globalThis.document.querySelector('[aria-modal="true"]'); return was === now ? was : now; });
    const resolved = resolveTarget(step.target);
    setTarget((was) => (was.status === resolved.status && was.element === resolved.element ? was : resolved));
    if (resolved.status === "ok" && resolved.element) {
      const rect = resolved.element.getBoundingClientRect();
      // Only a real change re-renders: this also runs on a timer.
      setBox((was) => was && Math.abs(was.left - rect.left) < 0.5 && Math.abs(was.top - rect.top) < 0.5 && Math.abs(was.width - rect.width) < 0.5 && Math.abs(was.height - rect.height) < 0.5 ? was : { left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    } else setBox((was) => (was === null ? was : null));
  }, [step]);

  useLayoutEffect(() => {
    measure();
    const resolved = step ? resolveTarget(step.target) : null;
    resolved?.element?.scrollIntoView({ block: "center", inline: "nearest" });
    measure();
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    globalThis.addEventListener("scroll", schedule, true);
    globalThis.addEventListener("resize", schedule);
    const interval = globalThis.setInterval(measure, 400); // the person may open the tab/panel the step is waiting for
    return () => { cancelAnimationFrame(frame); globalThis.removeEventListener("scroll", schedule, true); globalThis.removeEventListener("resize", schedule); globalThis.clearInterval(interval); };
  }, [step, measure]);

  useLayoutEffect(() => {
    const element = card.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const viewport = { width: globalThis.innerWidth, height: globalThis.innerHeight };
    const anchor = box ?? { left: viewport.width / 2, top: viewport.height / 2, width: 0, height: 0 };
    // Other controls in the top bar and the phone toolbar stay usable: the card is placed clear of them too.
    const obstacles = Array.from(globalThis.document.querySelectorAll<HTMLElement>(".editor-topbar button, .editor-topbar a, .editor-topbar select, .m-toolbar button"))
      .filter((control) => control !== target.element && !control.closest("[hidden]"))
      .map((control) => { const r = control.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; })
      .filter((r) => r.width > 0 && r.height > 0);
    const placed = placeCard(anchor, { width: Math.min(360, viewport.width - 16), height: rect.height }, viewport, 8, 12, obstacles);
    setCardBox((was) => was && Math.abs(was.left - placed.left) < 0.5 && Math.abs(was.top - placed.top) < 0.5 && Math.abs(was.width - placed.width) < 0.5 ? was : { left: placed.left, top: placed.top, width: placed.width, height: placed.height });
  }, [box, index, target.status]);

  // Move focus to the card on each step so a keyboard or screen reader follows the tour; the person can still Tab out to the page.
  // (Only once the card is placed: a visibility:hidden element cannot take focus.)
  const placed = cardBox !== null;
  // The menu that started the tour restores focus to its opener while it unmounts; claim focus again if that lands after us.
  useEffect(() => {
    if (!placed) return;
    const focusPrimary = () => {
      const element = card.current;
      if (!element || element.contains(globalThis.document.activeElement)) return;
      const active = globalThis.document.activeElement;
      if (active && active !== globalThis.document.body && active !== opener.current) return; // the person moved on: leave it
      element.querySelector<HTMLElement>("[data-tour-primary]")?.focus();
    };
    focusPrimary();
    const timers = [globalThis.setTimeout(focusPrimary, 60), globalThis.setTimeout(focusPrimary, 250)];
    return () => timers.forEach((timer) => globalThis.clearTimeout(timer));
  }, [index, placed]);

  // Escape ends the tour — it is the topmost thing on screen — unless a modal dialog is open: that dialog owns the key.
  // Capture phase, so it is not first consumed by a phone app's own "Escape leaves the app".
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (globalThis.document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      latestClose.current();
    };
    globalThis.addEventListener("keydown", onKey, true);
    return () => globalThis.removeEventListener("keydown", onKey, true);
  }, []);

  if (!step) return null;
  const ok = target.status === "ok" && !paused;
  const reason = ok ? null : t(target.status === "disabled" ? "help.missing.disabled" : step.missingKey as never);

  return createPortal(
    <>
      {ok && box && !paused ? <div className="tour-ring" aria-hidden="true" style={{ left: box.left - 4, top: box.top - 4, width: box.width + 8, height: box.height + 8 }} /> : null}
      <div
        ref={card}
        className="tour-card w98-window"
        role="dialog"
        aria-modal="false"
        aria-label={t("help.tourLabel", { topic: t(topic.titleKey as never) })}
        data-tour-step={step.id}
        data-tour-status={target.status}
        style={cardBox && !paused ? { left: cardBox.left, top: cardBox.top, width: cardBox.width } : { left: 8, top: 8, visibility: "hidden" }}
      >
        <div className="tour-progress" aria-live="polite">{t("help.step", { current: index + 1, total: topic.steps.length })}</div>
        <strong className="tour-title">{t(step.titleKey as never)}</strong>
        <p className="tour-body" id={bodyId}>{reason ?? t(step.bodyKey as never)}</p>
        <div className="tour-actions">
          <button type="button" className="w98-btn" onClick={onClose}>{t("help.skip")}</button>
          <span className="tour-spacer" />
          <button type="button" className="w98-btn" disabled={index === 0} onClick={() => setIndex(index - 1)}>{t("help.back")}</button>
          {last
            ? <button type="button" className="w98-btn primary" data-tour-primary aria-describedby={bodyId} onClick={onClose}>{t("help.done")}</button>
            : <button type="button" className="w98-btn primary" data-tour-primary aria-describedby={bodyId} onClick={() => setIndex(index + 1)}>{t("help.next")}</button>}
        </div>
      </div>
    </>,
    globalThis.document.body
  );
}
