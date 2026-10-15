import type { SiteDocument } from "@retrodesk/shared";
import { MobileScreen } from "../site/MobileScreen";

export function MobilePreview({ document }: { document: SiteDocument }) {
  return <MobileScreen document={document} mode="visitor" framed />;
}
