import { useTranslation } from "react-i18next";
import type { PaintLabels } from "./operationLabels";
export function usePaintLabels(): PaintLabels {
  const { t } = useTranslation("modules");
  return {
    ...t("paint.workspace", { returnObjects: true }),
    swatch: (color) => t("paint.swatch", { color }),
    picked: (color) => t("paint.picked", { color }),
    cursor: (x, y) => t("paint.cursor", { x, y })
  };
}
