import type { SiteDocument } from "@retrodesk/shared";
import { MobileScreen } from "../site/MobileScreen";

/** `framed` draws the simulated phone bezel and status bar; real phones render the plain mobile layout. */
export function MobilePreview({ document, framed = true }: { document: SiteDocument; framed?: boolean }) {
  return <MobileScreen document={document} mode="visitor" framed={framed} />;
}
