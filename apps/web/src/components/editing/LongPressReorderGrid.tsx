import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from "react";
import { useEditingText } from "./common";
import "./mobile-editing.css";

type Item = { id: string };
type Gesture = { id: string; pointerId: number; node: HTMLElement; x: number; y: number; active: boolean; order: string[] };
export function LongPressReorderGrid<T extends Item>({ items, columns, arranging, revision, onArrangeStart, onReorder, onOpen, renderCell, renderGhost, cellRef, label }: { items: T[]; columns: number; arranging: boolean; revision?: unknown; onArrangeStart(): void; onReorder(ids: string[]): void; onOpen(id: string): void; renderCell(item: T, state: { dragging: boolean; arranging: boolean }): ReactNode; renderGhost(item: T): ReactNode; cellRef?(id: string, node: HTMLElement | null): void; label: string }) {
  const t = useEditingText();
  const grid = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), cells = useRef(new Map<string, HTMLElement>());
  const [draft, setDraft] = useState<string[] | null>(null), [ghost, setGhost] = useState<{ id: string; x: number; y: number } | null>(null), [announcement, setAnnouncement] = useState("");
  const suppressClick = useRef(false);
  const cancel = () => { clearTimeout(timer.current); const p=gesture.current; gesture.current=null; setDraft(null); setGhost(null); if (p?.node.hasPointerCapture(p.pointerId)) p.node.releasePointerCapture(p.pointerId); };
  useEffect(() => { if(!arranging)cancel(); }, [arranging]);
  const signature = items.map(item=>item.id).join("|");
  useEffect(() => { cancel(); return cancel; }, [signature, revision]);
  const move = (e: Pick<PointerEvent, "pointerId" | "clientX" | "clientY">) => {
    const p=gesture.current; if (!p || e.pointerId !== p.pointerId) return;
    if (!p.active && !arranging) { if (Math.hypot(e.clientX-p.x,e.clientY-p.y)>8) cancel(); return; }
    if (!p.active && Math.hypot(e.clientX-p.x,e.clientY-p.y)<6) return;
    p.active=true; setGhost({id:p.id,x:e.clientX,y:e.clientY});
    const hit=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-reorder-id]');
    if (!hit || !grid.current?.contains(hit)) return;
    const to=p.order.indexOf(hit.dataset.reorderId!), from=p.order.indexOf(p.id);
    if (to<0 || from===to) return;
    const order=[...p.order], [id]=order.splice(from,1);order.splice(to,0,id);p.order=order;setDraft(order);
  };
  const release = (e: Pick<PointerEvent, "pointerId">) => {
    const p=gesture.current; if (!p || p.pointerId !== e.pointerId) return;
    const order=p.order, dragged=p.active;
    suppressClick.current=true; queueMicrotask(()=>{ suppressClick.current=false; });
    cancel();
    if (dragged) {
      if (order.join("|")!==signature) onReorder(order);
      setAnnouncement(t("moved",{position:order.indexOf(p.id)+1}));
      requestAnimationFrame(()=>cells.current.get(p.id)?.focus({preventScroll:true}));
    } else onOpen(p.id);
  };
  const handlers = useRef({ move, release, cancel }); handlers.current = { move, release, cancel };
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => { if(event.key === "Escape" && !event.isComposing && gesture.current)handlers.current.cancel(); };
    const onMove = (event: globalThis.PointerEvent) => handlers.current.move(event), onUp = (event: globalThis.PointerEvent) => handlers.current.release(event), onCancel = () => handlers.current.cancel();
    globalThis.addEventListener("keydown", onKey, true); globalThis.addEventListener("pointermove", onMove); globalThis.addEventListener("pointerup", onUp); globalThis.addEventListener("pointercancel", onCancel); globalThis.addEventListener("blur", onCancel);
    return () => { globalThis.removeEventListener("keydown", onKey, true); globalThis.removeEventListener("pointermove", onMove); globalThis.removeEventListener("pointerup", onUp); globalThis.removeEventListener("pointercancel", onCancel); globalThis.removeEventListener("blur", onCancel); };
  }, []);
  const ordered=(draft??items.map(x=>x.id)).map(id=>items.find(item=>item.id===id)).filter((x):x is T=>!!x);
  const ghostItem=items.find(item=>item.id===ghost?.id);
  return <>
    <div ref={grid} className="mobile-icons m-grid editing-reorder-grid" role="group" aria-label={label} data-arranging={arranging || undefined} style={{gridTemplateColumns:`repeat(${columns}, minmax(0, 1fr))`}}>
      {ordered.map((item,index)=><div key={item.id} role="button" tabIndex={0} ref={node=>{if(node)cells.current.set(item.id,node);else cells.current.delete(item.id);cellRef?.(item.id,node);}} className="m-icon" data-reorder-id={item.id} data-dragging={ghost?.id===item.id || undefined} onContextMenu={e=>e.preventDefault()}
        onPointerDown={e=>{ if(e.button>0 || e.target!==e.currentTarget && (e.target as HTMLElement).closest('input,button'))return;cancel();e.currentTarget.setPointerCapture(e.pointerId);gesture.current={id:item.id,pointerId:e.pointerId,node:e.currentTarget,x:e.clientX,y:e.clientY,active:false,order:items.map(x=>x.id)};if(!arranging)timer.current=setTimeout(()=>{const p=gesture.current;if(!p)return;p.active=true;suppressClick.current=true;onArrangeStart();navigator.vibrate?.(10);setGhost({id:p.id,x:p.x,y:p.y});},450);}}

        onClick={e=>{if(e.target!==e.currentTarget && (e.target as HTMLElement).closest('input,button'))return;if(e.detail===0 && !suppressClick.current)onOpen(item.id);}}
        onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.altKey && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const order=items.map(x=>x.id),to=Math.max(0,Math.min(items.length-1,index+(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1)));const [id]=order.splice(index,1);order.splice(to,0,id);if(to!==index)onReorder(order);setAnnouncement(t('moved',{position:to+1}));requestAnimationFrame(()=>cells.current.get(item.id)?.focus());}else if(e.key==='Enter'||e.key===' '){e.preventDefault();onOpen(item.id);}}}>
        {renderCell(item,{dragging:ghost?.id===item.id,arranging})}
      </div>)}
    </div>
    {ghost && ghostItem ? <div className="editing-reorder-ghost" aria-hidden="true" style={{left:ghost.x-28,top:ghost.y-40}}>{renderGhost(ghostItem)}</div>:null}
    <span className="visually-hidden" role="status" aria-live="polite">{announcement}</span>
  </>;
}
