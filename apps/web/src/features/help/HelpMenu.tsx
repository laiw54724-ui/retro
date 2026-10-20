import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalDialog } from "../../components/ModalDialog";
import { RetroButton } from "../../components/RetroButton";
import { FocusTour } from "./FocusTour";
import { HELP_TOPICS, type HelpTopic } from "./helpTopics";

/**
 * Help entry in the editor top bar. The list shows every topic's one-sentence explanation (useful without any tour);
 * topics with a tour offer "Start tour" (or "Replay" after one) — only when the person chooses it.
 */
export function HelpMenu() {
  const { t } = useTranslation("editor");
  const [open, setOpen] = useState(false);
  const [tour, setTour] = useState<HelpTopic | null>(null);
  const [seen, setSeen] = useState<Record<string, boolean>>({});
  const available = (topic: HelpTopic) => !topic.requires || !!globalThis.document.querySelector(topic.requires.selector);

  return (
    <>
      <RetroButton data-help="help-button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>{t("help.button")}</RetroButton>
      {open ? (
        <ModalDialog title={t("help.title")} onClose={() => setOpen(false)} width={520} actions={<RetroButton className="primary" onClick={() => setOpen(false)}>{t("help.close")}</RetroButton>}>
          <p className="w98-hint">{t("help.intro")}</p>
          <ul className="help-topics">
            {HELP_TOPICS.map((topic) => {
              const ready = available(topic);
              return (
                <li key={topic.id} className="help-topic" data-help-topic={topic.id}>
                  <strong>{t(topic.titleKey as never)}</strong>
                  <p>{t(topic.helpKey as never)}</p>
                  {topic.steps.length ? (
                    ready
                      ? <RetroButton className="small" onClick={() => { setOpen(false); setSeen((current) => ({ ...current, [topic.id]: true })); setTour(topic); }}>{t(seen[topic.id] ? "help.replay" : "help.start")}</RetroButton>
                      : <p className="w98-hint" role="note">{t(topic.requires!.reasonKey as never)}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </ModalDialog>
      ) : null}
      {tour ? <FocusTour key={tour.id} topic={tour} onClose={() => setTour(null)} /> : null}
    </>
  );
}
