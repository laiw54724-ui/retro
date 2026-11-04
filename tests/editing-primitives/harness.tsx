import React from "/node_modules/.vite/deps/react.js";
const { useRef, useState } = React;
import ReactDOM from "/node_modules/.vite/deps/react-dom_client.js";
const { createRoot } = ReactDOM;
import { initI18n } from "../../apps/web/src/i18n";
import ReactDOMPortal from "/node_modules/.vite/deps/react-dom.js";
const { createPortal } = ReactDOMPortal;
import { ContextMenu, DestinationChip, EditorStatusBar, FileDropZone, FloatingSelectionBar, InlineErrorBanner, InlineTextArea, InlineTextField, PopoverPanel, SortableList, UrlPasteBar } from "../../apps/web/src/components/editing";
function Harness() {
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), menuTrigger = useRef<HTMLButtonElement>(null), nestedTrigger = useRef<HTMLButtonElement>(null);
  const [portal, setPortal] = useState(false), [nested, setNested] = useState(false);
  const [items, setItems] = useState([{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }, { id: "c", name: "Gamma" }]);
  const [name, setName] = useState("Name"), [note, setNote] = useState("First\nSecond"), [entered, setEntered] = useState(0), [open, setOpen] = useState(false), [draft, setDraft] = useState("Unsubmitted"), [paste, setPaste] = useState(""), [added, setAdded] = useState(0), [error, setError] = useState(""), [received, setReceived] = useState(""), [menu, setMenu] = useState<{ x: number; y: number } | null>(null), [action, setAction] = useState(""), [selected, setSelected] = useState(true);
  return <div ref={root} data-testid="host" style={{ position: "relative", width: "min(100%,600px)", height: 700, border: "1px solid black", boxSizing: "border-box", fontFamily: "sans-serif", display: "flex", flexDirection: "column" }}>
    <UrlPasteBar label="Paste URL" placeholder="https://" value={paste} onChange={setPaste} classify={raw => raw ? { ok: raw.startsWith("https://"), title: raw.startsWith("https://") ? "Link" : "Invalid", hint: "URL preview", icon: "↗" } : null} onAdd={guess => { if (guess.ok) { setAdded(n => n + 1); setPaste(""); } else setError("Invalid URL"); }} />
    <output data-testid="added">{added}</output>
    <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <InlineTextField aria-label="Name" value={name} onValueChange={setName} onEnter={() => setEntered(n => n + 1)} />
      <InlineTextArea aria-label="Note" value={note} onValueChange={setNote} />
      <output data-testid="entered">{entered}</output>
      <SortableList items={items} label="Items" rowClassName="harness-row" onMove={(id, to) => setItems(list => { const copy = [...list], from = copy.findIndex(x => x.id === id), [item] = copy.splice(from, 1); copy.splice(to, 0, item); return copy; })} renderItem={(item, handle) => <div style={{ display: "flex", padding: 5 }}>{handle}<InlineTextField aria-label={item.name} defaultValue={item.name} /></div>} endSlot={<button type="button">End</button>} />
      <button type="button" ref={trigger} aria-expanded={open} onClick={() => setOpen(!open)}>Source</button>
      <PopoverPanel open={open} onClose={() => setOpen(false)} triggerRef={trigger} scopeRef={root} label="Source settings"><input aria-label="Draft" value={draft} onChange={e => setDraft(e.target.value)} /><button type="button" onClick={() => setPortal(true)}>Open portal</button><button type="button" ref={nestedTrigger} aria-expanded={nested} onClick={() => setNested(true)}>Nested</button><PopoverPanel open={nested} onClose={() => setNested(false)} triggerRef={nestedTrigger} label="Nested settings"><input aria-label="Nested draft" /></PopoverPanel></PopoverPanel>
      {portal && createPortal(<div role="dialog" aria-modal="true" aria-label="Portal picker" style={{ position: "fixed", inset: 80, zIndex: 100, background: "white", border: "1px solid black" }} onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setPortal(false); } }}><input autoFocus aria-label="Portal input" /><button type="button" onClick={() => setPortal(false)}>Close portal</button></div>, document.body)}
      <DestinationChip text={`https://example.test/${"long/".repeat(40)}`} missing expanded={open} onClick={() => setOpen(!open)} />
      <FileDropZone accept="image" maxBytes={8} multiple onFiles={(files, point) => setReceived(`${files.map(f => f.name).join(",")}@${point.x},${point.y}`)} onError={setError} overlayText="Drop images" data-testid="drop" style={{ padding: 30, border: "1px solid gray" }}><span data-testid="drop-child">Drop area</span></FileDropZone>
      <output data-testid="received">{received}</output>
      <button type="button" ref={menuTrigger} onClick={() => setMenu({ x: 590, y: 690 })} onContextMenu={e => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }} onKeyDown={e => { if (e.key === "ContextMenu" || e.shiftKey && e.key === "F10") { e.preventDefault(); setMenu({ x: 590, y: 690 }); } }}>Actions</button>
      <button type="button" onClick={() => setError("Upload failed")}>Fail upload</button>
      <button type="button" onClick={() => setSelected(!selected)}>Toggle selection</button>
      <div style={{ height: 600 }} data-testid="blank">Blank area</div>
    </div>
    {menu && <ContextMenu items={[{ id: "open", label: "Open", onSelect: () => setAction("Opened"), primary: true }, { id: "disabled", label: "Disabled", onSelect: () => {}, disabled: true }, { id: "delete", label: "Delete", onSelect: () => setAction("Deleted"), danger: true }]} position={menu} containerRef={root} returnFocusRef={menuTrigger} onClose={() => setMenu(null)} label="Actions menu" />}
    <FloatingSelectionBar label="Selection tools" rect={{ x: 580, y: 0, width: 20, height: 20 }} containerRef={root} hidden={!selected}><button type="button" onClick={() => setAction("Copied")}>Copy</button><button type="button" onClick={() => setAction("Locked")}>Lock</button></FloatingSelectionBar>
    <InlineErrorBanner message={error} onClose={() => setError("")} />
    <EditorStatusBar message={action || "Ready"} count="3" temporaryMessage={received ? "Received" : undefined} />
  </div>;
}
void initI18n().then(() => createRoot(document.getElementById("root")!).render(<Harness />));
