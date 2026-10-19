import { createRoot } from "react-dom/client";
import { PaintWorkspace } from "./PaintWorkspace";
import type { PaintEngine } from "./engine";

const fixture: { engine: PaintEngine | null } = { engine: null };
Object.assign(window, { paintOperation: fixture });
createRoot(document.getElementById("paint-operation-root")!).render(
  <main style={{ maxWidth: 1120, margin: "16px auto", padding: 8 }}>
    <h1 style={{ font: "bold 21px system-ui" }}>Paint operation fixture</h1>
    <PaintWorkspace onEngineReady={(engine) => { fixture.engine = engine; }} />
  </main>
);
