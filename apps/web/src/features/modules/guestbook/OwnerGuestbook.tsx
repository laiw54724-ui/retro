import {useEffect,useId,useRef,useState,type KeyboardEvent} from 'react';
import {useTranslation} from 'react-i18next';
import {useLocaleFormatting} from '../../../i18n/format';
import {api,ApiError,type GuestbookEntry} from '../../../lib/api';
import {EditorStatusBar,InlineTextArea,InlineErrorBanner,UndoToast} from '../../../components/editing';
import type {ModuleProps} from '../types';
import './owner.css';
type Filter='pending'|'reported'|'approved'|'rejected'|'all';
type Action='approved'|'rejected'|'resolve';
type Pending={siteId:string;kind:'delete'|'status';rows:GuestbookEntry[]};
const filters:Filter[]=['pending','reported','approved','rejected','all'];

/** Owner-only API queue. Moderation is never written into the site document. */
export function OwnerGuestbook({window,ctx,update}:ModuleProps<'guestbook'>){
 const {t:tr,i18n}=useTranslation('modules');const {formatDate}=useLocaleFormatting();const listId=useId();
 const root=useRef<HTMLDivElement>(null),rowNodes=useRef(new Map<string,HTMLElement>()),tabs=useRef(new Map<Filter,HTMLButtonElement>());
 const [loaded,setLoaded]=useState<GuestbookEntry[]>([]),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[error,setError]=useState(''),[reload,setReload]=useState(0);
 const [filter,setFilter]=useState<Filter>('pending'),[checked,setChecked]=useState<string[]>([]),[focused,setFocused]=useState<string|null>(null),[busy,setBusy]=useState<Set<string>>(new Set()),[hidden,setHidden]=useState<string[]>([]);
 const [toast,setToast]=useState<{id:number;message:string;undo:boolean}|null>(null);
 const filterRef=useRef(filter);filterRef.current=filter;
 const pending=useRef<Pending|null>(null),locks=useRef(new Set<string>()),epoch=useRef(0),mounted=useRef(false),scope=useRef(ctx.siteId),toastId=useRef(0);
 scope.current=ctx.siteId;
 const valid=(siteId:string)=>mounted.current&&scope.current===siteId;
 const showError=(siteId:string)=>{if(valid(siteId))setError(tr('guestbook.theModerationActionFailedPlease'));};
 const patch=(change:Partial<typeof window.content>,key?:string)=>update(current=>({...current,content:{...current.content,...change}}),key);
 const focus=(id:string|null,allowed?:()=>boolean)=>requestAnimationFrame(()=>{if(!mounted.current||allowed&&!allowed())return;(id?rowNodes.current.get(id):tabs.current.get(filter))?.focus({preventScroll:false});});
 const request=async(siteId:string,row:GuestbookEntry,action:Action|'delete')=>{
   const key=`${siteId}:${row.id}`;if(locks.current.has(key))return false;
   locks.current.add(key);epoch.current++;if(valid(siteId)){setLoading(false);setBusy(new Set(locks.current));}
   try{
     if(action==='delete')await api.deleteGuestbookEntry(siteId,row.id);
     else if(action==='resolve')await api.resolveGuestbookReports(siteId,row.id);
     else await api.moderateGuestbookEntry(siteId,row.id,action);
     if(valid(siteId))setLoaded(current=>current.flatMap(entry=>entry.id!==row.id?[entry]:action==='delete'?[]:[{...entry,status:action==='resolve'?entry.status:action,openReportCount:action==='resolve'?0:entry.openReportCount}]));
     return true;
   }catch{showError(siteId);return false;}
   finally{locks.current.delete(key);if(valid(siteId))setBusy(new Set(locks.current));}
 };
 const flush=()=>{
   const p=pending.current;pending.current=null;
   if(p?.kind==='delete')void(async()=>{for(const row of p.rows){await request(p.siteId,row,'delete');if(valid(p.siteId))setHidden(ids=>ids.filter(id=>id!==row.id));}})();
 };
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;epoch.current++;flush();};},[]);
 useEffect(()=>{
   const siteId=ctx.siteId;if(!siteId){setLoading(false);return;}
   const version=++epoch.current;setLoading(true);setLoadError('');
   void api.listGuestbookEntries(siteId).then(({entries})=>{if(valid(siteId)&&epoch.current===version)setLoaded(entries);}).catch(reason=>{if(valid(siteId)&&epoch.current===version)setLoadError(reason instanceof ApiError&&reason.status===403?tr('guestbook.onlyTheDesktopOwnerCan'):tr('guestbook.couldntLoadTheModerationList'));}).finally(()=>{if(valid(siteId)&&epoch.current===version)setLoading(false);});
   return()=>{epoch.current++;};
 },[ctx.siteId,reload,tr]);
 const all=loaded.filter(row=>!hidden.includes(row.id));
 const matches=(row:GuestbookEntry,choice:Filter)=>choice==='all'||(choice==='reported'?(row.openReportCount??0)>0:row.status===choice);
 const rows=all.filter(row=>matches(row,filter)).sort((a,b)=>filter==='pending'?a.createdAt.localeCompare(b.createdAt):b.createdAt.localeCompare(a.createdAt));
 const ids=rows.map(row=>row.id),selected=checked.filter(id=>ids.includes(id));
 const nextFocus=(removed:string[])=>{const index=rows.findIndex(row=>removed.includes(row.id)),rest=rows.filter(row=>!removed.includes(row.id));return(rest[index]??rest[index-1])?.id??null;};
 const moderate=async(selectedRows:GuestbookEntry[],action:Action)=>{
   const siteId=ctx.siteId;if(!siteId)return;const activeBefore=globalThis.document.activeElement,startingFilter=filter;const retainFocus=()=>filterRef.current===startingFilter&&(globalThis.document.activeElement===activeBefore||globalThis.document.activeElement===globalThis.document.body&&!activeBefore?.isConnected);flush();setToast(null);setError('');
   const actionable=selectedRows.filter(row=>!locks.current.has(`${siteId}:${row.id}`)&&(action==='resolve'?(row.openReportCount??0)>0:row.status!==action));
   const changed:GuestbookEntry[]=[];const next=nextFocus(actionable.map(row=>row.id));
   for(const row of actionable){if(await request(siteId,row,action))changed.push(row);}
   if(!valid(siteId)||!changed.length)return;
   setChecked(current=>current.filter(id=>!changed.some(row=>row.id===id)));
   const undo=action!=='resolve'&&changed.every(row=>row.status==='approved'||row.status==='rejected');
   pending.current=undo?{siteId,kind:'status',rows:changed}:null;
   setToast({id:++toastId.current,message:tr(action==='approved'?'guestbook.queue.published':action==='rejected'?'guestbook.queue.hidden':'guestbook.queue.resolved',{count:changed.length}),undo});
   if(filter!=='all'&&filter!==action){setFocused(next);focus(next,retainFocus);}
 };
 const remove=(selectedRows:GuestbookEntry[])=>{
   const siteId=ctx.siteId;if(!siteId)return;
   const eligible=selectedRows.filter(row=>!locks.current.has(`${siteId}:${row.id}`)&&!hidden.includes(row.id));if(!eligible.length)return;
   flush();const ids=eligible.map(row=>row.id),next=nextFocus(ids);pending.current={siteId,kind:'delete',rows:eligible};
   epoch.current++;setLoading(false);setHidden(current=>[...current,...ids]);setChecked(current=>current.filter(id=>!ids.includes(id)));setFocused(next);focus(next);
   setToast({id:++toastId.current,message:tr('guestbook.queue.deleted',{count:ids.length}),undo:true});
 };
 const undo=async()=>{
   const p=pending.current;if(!p)return;pending.current=null;setToast(null);
   if(p.kind==='delete'){setHidden(current=>current.filter(id=>!p.rows.some(row=>row.id===id)));focus(p.rows[0]?.id??null);return;}
   for(const row of p.rows){if(row.status==='approved'||row.status==='rejected')await request(p.siteId,row,row.status);}
   if(valid(p.siteId))focus(p.rows[0]?.id??null);
 };
 const rowKey=(event:KeyboardEvent<HTMLElement>,entry:GuestbookEntry)=>{
   if(event.target!==event.currentTarget||event.ctrlKey||event.metaKey||event.altKey||event.nativeEvent.isComposing||locks.current.has(`${ctx.siteId}:${entry.id}`))return;
   const key=event.key.toLowerCase(),index=ids.indexOf(entry.id);
   if(['arrowdown','j','arrowup','k'].includes(key)){event.preventDefault();const next=ids[index+(['arrowdown','j'].includes(key)?1:-1)];if(next)focus(next);}
   else if(key===' '){event.preventDefault();setChecked(current=>current.includes(entry.id)?current.filter(id=>id!==entry.id):[...current,entry.id]);}
   else if(key==='a'||key==='h'||key==='r'){event.preventDefault();void moderate([entry],key==='a'?'approved':key==='h'?'rejected':'resolve');}
   else if(key==='delete'){event.preventDefault();remove([entry]);}
 };
 const ago=(createdAt:string)=>{const delta=(Date.now()-new Date(createdAt).getTime())/60000;const unit=delta<60?'minute':delta<1440?'hour':'day';return new Intl.RelativeTimeFormat(i18n.resolvedLanguage??'en',{numeric:'auto'}).format(-Math.max(0,Math.floor(delta/(unit==='day'?1440:unit==='hour'?60:1))),unit);};
 const name=(choice:Filter)=>tr(`guestbook.${choice==='approved'?'public':choice}`);
 return <div ref={root} className="guestbook-app owner guestbook-queue-v2" onKeyDown={event=>{if((event.ctrlKey||event.metaKey)&&!event.shiftKey&&event.key.toLowerCase()==='z'&&pending.current&&!(event.target as HTMLElement).closest('input,textarea,select,[contenteditable=true]')){event.preventDefault();event.stopPropagation();void undo();}}}>
   <div className="guestbook-settings"><label className="check-row"><input type="checkbox" checked={window.content.enabled} onChange={event=>patch({enabled:event.target.checked})}/>{tr('guestbook.allowVisitorsToSubmitMessages')}<span className="guestbook-open-chip">{tr(window.content.enabled?'guestbook.queue.open':'guestbook.queue.closed')}</span></label><InlineTextArea value={window.content.intro} aria-label={tr('guestbook.note')} placeholder={tr('guestbook.queue.introPlaceholder')} maxLength={1000} onValueChange={intro=>patch({intro},`guestbook-intro-${window.id}`)}/>{!window.content.enabled?<p className="guestbook-note">{tr('guestbook.whenOffTheServerRejects')}</p>:null}</div>
   <section className="guestbook-moderation" aria-label={tr('guestbook.messageModerationList')}>
     <div className="guestbook-tabs" role="tablist" aria-label={tr('guestbook.messageModerationList')}>{filters.map(choice=><button key={choice} ref={node=>{if(node)tabs.current.set(choice,node);else tabs.current.delete(choice);}} type="button" role="tab" aria-selected={filter===choice} aria-controls={listId} tabIndex={filter===choice?0:-1} className="w98-btn small" onClick={()=>{setFilter(choice);setChecked([]);setFocused(null);}} onKeyDown={event=>{let index=filters.indexOf(choice);if(event.key==='ArrowRight')index=(index+1)%filters.length;else if(event.key==='ArrowLeft')index=(index-1+filters.length)%filters.length;else if(event.key==='Home')index=0;else if(event.key==='End')index=filters.length-1;else return;event.preventDefault();setFilter(filters[index]);setChecked([]);tabs.current.get(filters[index])?.focus();}}>{name(choice)}{all.filter(row=>matches(row,choice)).length>0?<span className="guestbook-count-chip">{all.filter(row=>matches(row,choice)).length}</span>:null}</button>)}</div>
     {rows.length?<div className="guestbook-bulk"><label><input type="checkbox" checked={selected.length===ids.length} aria-label={tr('guestbook.queue.selectAll')} onChange={e=>setChecked(e.target.checked?ids:[])}/>{tr('guestbook.queue.selectAll')}</label>{selected.length?<><span>{tr('guestbook.queue.selected',{count:selected.length})}</span><button type="button" className="w98-btn" disabled={busy.size>0} onClick={()=>void moderate(rows.filter(row=>selected.includes(row.id)),'approved')}>{tr('guestbook.queue.publishAll')}</button><button type="button" className="w98-btn" disabled={busy.size>0} onClick={()=>void moderate(rows.filter(row=>selected.includes(row.id)),'rejected')}>{tr('guestbook.queue.hideAll')}</button><button type="button" className="w98-btn danger" disabled={busy.size>0} onClick={()=>remove(rows.filter(row=>selected.includes(row.id)))}>{tr('links.delete')}</button></>:null}</div>:null}
     {loadError?<InlineErrorBanner message={<>{loadError}<button type="button" className="w98-btn" onClick={()=>setReload(v=>v+1)}>{tr('guestbook.retry')}</button></>} onClose={()=>setLoadError('')} tv={ctx.tv} mobile={ctx.mobile}/>:null}
     <div id={listId} className="guestbook-queue-list" role="list" aria-label={name(filter)}>
       {loading?<p role="status">{tr('guestbook.loading')}</p>:null}
       {!loading&&!loadError&&!rows.length?<div className="guestbook-empty"><strong>{tr(filter==='pending'?'guestbook.queue.pendingEmpty':filter==='reported'?'guestbook.queue.reportedEmpty':'guestbook.noMatchingMessages')}</strong><p>{tr(filter==='pending'?'guestbook.queue.pendingHint':'guestbook.noMessagesYet')}</p></div>:null}
       {rows.map(entry=>{const processing=busy.has(`${ctx.siteId}:${entry.id}`);return <article key={entry.id} ref={node=>{if(node)rowNodes.current.set(entry.id,node);else rowNodes.current.delete(entry.id);}} role="listitem" tabIndex={0} data-entry-id={entry.id} data-focused={focused===entry.id||undefined} aria-busy={processing||undefined} aria-keyshortcuts="A H R Delete ArrowUp ArrowDown J K Space" className={entry.status==='pending'?'guestbook-pending-card':undefined} onFocus={()=>setFocused(entry.id)} onKeyDown={event=>rowKey(event,entry)}>
         <input type="checkbox" disabled={processing} checked={checked.includes(entry.id)} aria-label={tr('guestbook.queue.selectEntry',{name:entry.displayName})} onChange={event=>setChecked(current=>event.target.checked?[...current,entry.id]:current.filter(id=>id!==entry.id))}/>
         <div className="guestbook-card-content"><header><strong>{entry.displayName}</strong><time dateTime={entry.createdAt} title={formatDate(new Date(entry.createdAt),{dateStyle:'full',timeStyle:'short'})}>{ago(entry.createdAt)}</time><span className="guestbook-status-chip">{name(entry.status)}</span>{(entry.openReportCount??0)>0?<span className="guestbook-report-chip">{tr('guestbook.reports',{count:entry.openReportCount??0})}</span>:null}</header><p>{entry.body}</p><div className="button-row">
           <button type="button" className="w98-btn small primary" disabled={processing||entry.status==='approved'} onClick={()=>void moderate([entry],'approved')}>{tr('guestbook.approve')}</button><button type="button" className="w98-btn small" disabled={processing||entry.status==='rejected'} onClick={()=>void moderate([entry],'rejected')}>{tr('guestbook.hide')}</button>{(entry.openReportCount??0)>0?<button type="button" className="w98-btn small" disabled={processing} onClick={()=>void moderate([entry],'resolve')}>{tr('guestbook.reportHandled')}</button>:null}<button type="button" className="w98-btn small danger" disabled={processing} onClick={()=>remove([entry])}>{tr('links.delete')}</button>
         </div></div>
       </article>;})}
     </div>
   </section>
   <EditorStatusBar message={tr('guestbook.queue.keyboardHint')} count={tr('guestbook.queue.total',{count:all.length})} tv={ctx.tv} mobile={ctx.mobile}/>
   {toast?<UndoToast key={toast.id} message={toast.message} onUndo={toast.undo?()=>void undo():undefined} onExpire={()=>{flush();setToast(null);}}/>:null}
   <InlineErrorBanner message={error} onClose={()=>setError('')} tv={ctx.tv} mobile={ctx.mobile}/>
 </div>;
}
