import type { SiteDocument } from "@retrodesk/shared";
import { MobileScreen } from "../site/MobileScreen";
import type { PreviewNavigation } from "../site/previewNavigation";

/** `framed` draws the simulated phone bezel and status bar; real phones render the plain mobile layout. */
export function MobilePreview({ document, framed = true, navigation }: { document: SiteDocument; framed?: boolean; navigation?: PreviewNavigation }) {
  return <MobileScreen document={document} mode="visitor" framed={framed} navigation={navigation} />;
}
