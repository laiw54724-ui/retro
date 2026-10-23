import { i18n } from "../../../i18n";
import { useTranslation } from "react-i18next";
import type { MoodboardElement } from "@retrodesk/shared";
import { FallbackImage } from "../ui";
import type { ModuleProps } from "../types";
import { orderedElements } from "./editing";
import "./moodboard.css";

const label = (element: MoodboardElement) => element.kind === "text" ? i18n.t("modules:moodboard.textLabel", { content: element.content || i18n.t("modules:moodboard.blank") }) : element.kind === "image" ? i18n.t("modules:moodboard.imageLabel", { alt: element.alt || i18n.t("modules:moodboard.untitled") }) : i18n.t("modules:moodboard.colorBlock", { color: element.color });

function ElementContent({ element }: { element: MoodboardElement }) {
  const { t: tr } = useTranslation("modules");
  if (element.kind === "image") return element.src ? <FallbackImage src={element.src} alt={element.alt} className="moodboard-image" /> : <span className="moodboard-placeholder">{tr("moodboard.image")}</span>;
  if (element.kind === "color") return <span className="sr-only">{label(element)}</span>;
  return <span className="moodboard-text" style={{ color: element.color, fontSize: `${element.fontSize}px`, textAlign: element.align }}>{element.content}</span>;
}

function geometry(element: MoodboardElement, width: number, height: number) {
  return {
    left: `${element.x / width * 100}%`, top: `${element.y / height * 100}%`,
    width: `${element.width / width * 100}%`, height: `${element.height / height * 100}%`,
    zIndex: element.zOrder, background: element.kind === "color" ? element.color : undefined
  };
}

export function MoodboardView({ window }: ModuleProps<"moodboard">) {
  const { t: tr } = useTranslation("modules");
  const { width, height, background, elements } = window.content;
  return (
    <div className="moodboard-view">
      <div className="moodboard-stage" style={{ aspectRatio: `${width}/${height}`, background }} aria-label={tr("moodboard.moodboardCanvas")}>
        {orderedElements(elements).map((element) => <div key={element.id} data-moodboard-id={element.id} className={`moodboard-element ${element.kind}`} style={geometry(element, width, height)}><ElementContent element={element} /></div>)}
      </div>
      <ul className="sr-only" aria-label={tr("moodboard.moodboardContent")}>{elements.map((element) => <li key={element.id}>{label(element)}</li>)}</ul>
    </div>
  );
}

export { FreeformBoardEditor, FreeformBoardEditor as MoodboardInlineEditor } from "./FreeformBoardEditor";
