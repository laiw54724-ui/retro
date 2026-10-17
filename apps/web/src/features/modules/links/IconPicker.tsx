import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { normalizeImageUrl } from "@retrodesk/shared";
import { api, type AssetRecord } from "../../../lib/api";
import { BUILTIN_ICON_KEYS, isImageIcon } from "../../../lib/icons";
import { ICON_LIBRARY_SETS } from "../../../lib/iconLibrary/ids.generated";
import { hasLibraryIdShape, libraryNameOf, resolveLibraryIcon } from "../../../lib/iconLibrary/library";
import { Icon } from "../../../components/Icon";
import { ModalDialog } from "../../../components/ModalDialog";
import { CURATED_WINDOWS_ICON_KEYS, WINDOWS_ICON_RECORDS, WINDOWS_ICON_SOURCE } from "../../../lib/windowsIconManifest";
import { hasWindowsIconPack, WINDOWS_ICON_PACK_INSTALL_COMMAND } from "../../../lib/optionalIconPack";
import { FilePick, MiniBtn } from "../ui";
import { UploadTaskList, useMediaQueue } from "../../media/editorMedia";
import { useEditorStore } from "../../editor/store";
import { iconTargetKey, observeIconSelection, type IconMediaTarget } from "../../media/iconSelectionSession";

type Upload = (file: File, kind?: "image" | "icon" | "audio") => Promise<string | null>;

type CommonProps = {
  siteId?: string;
  /** Currently saved icon. The picker only calls onChange when the user presses 「套用」. */
  value: string;
  onChange: (value: string) => void;
  upload?: Upload;
  /** Icon used by 「恢復預設」. */
  defaultValue?: string;
  /** Builtin key previewed while the value is empty (default glyph). */
  defaultPreview?: string;
  /** Text shown under the preview, usually the window or link title. */
  label?: string;
  /** Stable identity used to discard async upload results after the target changes. */
  mediaTarget?: IconMediaTarget;
};

type Catalog = typeof import("../../../lib/iconLibrary/catalog.generated");
type Category = "all" | "retro" | "pixel" | "mono" | "mine" | "windows";

const BUILTIN_NAMES: Record<string, string> = { doc: "文件", folder: "資料夾", photo: "照片", link: "連結", user: "人物", heart: "愛心", star: "星星", mail: "信件", music: "音樂", computer: "電腦", palette: "調色盤", camera: "相機", trash: "垃圾桶" };

const CATEGORIES: Array<{ id: Category; label: string }> = [
  { id: "all", label: "全部" },
  { id: "retro", label: "彩色復古" },
  { id: "pixel", label: "彩色像素" },
  { id: "mono", label: "單色像素" },
  { id: "mine", label: "我的上傳" },
];

/** Readable name for a stored icon value without loading the catalog. */
export function describeIcon(value: string): string {
  if (BUILTIN_ICON_KEYS.includes(value)) return `${BUILTIN_NAMES[value] ?? value}（內建）`;
  if (hasLibraryIdShape(value)) {
    const icon = resolveLibraryIcon(value);
    const set = value.split(":")[0] as keyof typeof ICON_LIBRARY_SETS;
    return icon ? `${ICON_LIBRARY_SETS[set].label} · ${libraryNameOf(value)}` : "圖示已移除，改用預設圖示";
  }
  if (isImageIcon(value)) return "自訂圖片";
  return "預設圖示";
}

/** Close the dialog and return focus to its trigger even when applying re-rendered (and remounted) the trigger. */
function useDialogTrigger() {
  const [open, setOpen] = useState(false);
  const token = useId();
  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => {
      const active = globalThis.document.activeElement;
      if (!active || active === globalThis.document.body) globalThis.document.querySelector<HTMLElement>(`[data-icon-trigger="${token}"]`)?.focus();
    });
  }, [token]);
  return { open, show: () => setOpen(true), close, token };
}

/** The control that lives in a panel: current icon, its name, and a button that opens the library. */
export function IconPicker({ size = 28, ...props }: CommonProps & { size?: number }) {
  const { open, show, close, token } = useDialogTrigger();
  return (
    <div className="icon-picker">
      <div className="icon-current">
        <span className="icon-current-box"><Icon name={props.value || props.defaultPreview} size={size + 8} /></span>
        <span className="icon-current-text"><strong>目前圖示</strong><span data-testid="icon-current-name">{describeIcon(props.value)}</span></span>
      </div>
      <button type="button" className="w98-btn block" aria-haspopup="dialog" data-icon-trigger={token} onClick={show}>更換圖示…</button>
      {open ? <IconLibraryDialog {...props} onClose={close} /> : null}
    </div>
  );
}

/** Text button trigger, used in action bars. */
export function IconPickerAction({ text = "更換圖示…", ...props }: CommonProps & { text?: string }) {
  const { open, show, close, token } = useDialogTrigger();
  return (
    <>
      <button type="button" className="w98-btn" aria-haspopup="dialog" data-icon-trigger={token} onClick={show}>{text}</button>
      {open ? <IconLibraryDialog {...props} onClose={close} /> : null}
    </>
  );
}

/** Icon-only trigger used inside the Links editor tiles. */
export function IconPickerButton({ size = 24, ...props }: CommonProps & { size?: number }) {
  const { open, show, close, token } = useDialogTrigger();
  return (
    <>
      <button type="button" className="link-icon btn" aria-label="選擇圖示" aria-haspopup="dialog" title="選擇圖示" data-icon-trigger={token} onClick={show}><Icon name={props.value} size={size} /></button>
      {open ? <IconLibraryDialog {...props} onClose={close} /> : null}
    </>
  );
}

function Tile({ value, name, selected, current, tabbable, onSelect, onRemove, pixel }: { value: string; name: string; selected: boolean; current: boolean; tabbable: boolean; onSelect: () => void; onRemove?: () => void; pixel?: boolean }) {
  return (
    <li className="ilib-cell">
      <button type="button" className={"ilib-tile" + (selected ? " on" : "")} aria-pressed={selected} tabIndex={tabbable ? 0 : -1} aria-label={`${name}${current ? "（目前使用）" : ""}`} data-icon={value} onClick={onSelect}>
        <Icon name={value} size={32} style={pixel ? { imageRendering: "pixelated" } : undefined} />
        <span className="ilib-name">{name}</span>
        {current ? <span className="ilib-badge">目前</span> : null}
      </button>
      {onRemove ? <button type="button" className="icon-del" aria-label={`刪除圖示 ${name}`} onClick={onRemove}>×</button> : null}
    </li>
  );
}

function IconLibraryDialog({ siteId, value, onChange, upload, defaultValue, defaultPreview, label, mediaTarget, onClose }: CommonProps & { onClose: () => void }) {
  const [draft, setDraft] = useState(value);
  const [category, setCategory] = useState<Category>("all");
  const [purpose, setPurpose] = useState("");
  const [search, setSearch] = useState("");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [mine, setMine] = useState<AssetRecord[]>([]);
  const [status, setStatus] = useState("");
  const [url, setUrl] = useState("");
  const [packState, setPackState] = useState<"checking" | "available" | "missing">("checking");
  const { queue, tasks } = useMediaQueue();
  const dialogId = useId();
  const scope = `icons:${siteId ?? "unsaved"}:${iconTargetKey(mediaTarget)}:${dialogId}`;
  const original = useRef({ siteId, targetKey: iconTargetKey(mediaTarget), value, target: mediaTarget ? { ...mediaTarget } : undefined });
  const guard = useRef<ReturnType<typeof observeIconSelection> | null>(null);
  const ownTasks = tasks.filter((task) => task.scope === scope);
  const completed = ownTasks.filter((task) => task.status === "completed").length;
  const requestGeneration = useRef(0);
  const selectionGeneration = useRef(0);
  const active = useRef(true);
  const grid = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    const initial = original.current;
    if (!initial.siteId || !initial.target) return;
    const selection = observeIconSelection(useEditorStore, initial.siteId, initial.target, initial.value);
    guard.current = selection;
    return () => { selection.dispose(); guard.current = null; };
  }, []);

  const loadCatalog = useCallback(() => {
    setCatalogError(false);
    import("../../../lib/iconLibrary/catalog.generated").then(setCatalog, () => setCatalogError(true));
  }, []);
  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  const refreshMine = useCallback(async () => {
    if (!siteId) return;
    const generation = ++requestGeneration.current;
    try {
      const result = await api.listAssets(siteId, "icon");
      if (active.current && requestGeneration.current === generation) setMine(result.assets);
    } catch {
      if (active.current && requestGeneration.current === generation) setStatus("無法讀取我的上傳圖示。");
    }
  }, [siteId]);
  useEffect(() => { void refreshMine(); }, [refreshMine, completed]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      requestGeneration.current += 1;
      queue?.invalidate("已關閉圖示選擇器，未套用尚未完成的上傳。", (entry) => entry.options.scope === scope);
      for (const task of queue?.getSnapshot() ?? []) {
        if (task.scope === scope && (task.status === "completed" || task.status === "failed")) queue?.dismiss(task.id);
      }
    };
  }, [queue, scope]);
  useEffect(() => {
    let active = true;
    void hasWindowsIconPack().then((available) => { if (active) setPackState(available ? "available" : "missing"); });
    return () => { active = false; };
  }, []);

  const terms = useMemo(() => search.trim().toLowerCase().split(/\s+/).filter(Boolean), [search]);
  const categories = packState === "available" ? [...CATEGORIES, { id: "windows" as Category, label: "Windows（本機）" }] : CATEGORIES;

  type Entry = { value: string; name: string; pixel?: boolean };
  const entries: Entry[] = useMemo(() => {
    const result: Entry[] = [];
    const matches = (haystack: string) => terms.every((term) => haystack.includes(term));
    if (category !== "mine" && category !== "windows" && catalog) {
      for (const item of catalog.ICON_CATALOG) {
        const meta = ICON_LIBRARY_SETS[item.set as keyof typeof ICON_LIBRARY_SETS];
        if (category !== "all" && meta.category !== category) continue;
        if (purpose && !item.purposes.includes(purpose)) continue;
        if (!matches(`${item.keywords} ${item.id}`)) continue;
        result.push({ value: item.id, name: item.name });
      }
    }
    if ((category === "all" || category === "mine") && !purpose) {
      if (category === "all") for (const key of BUILTIN_ICON_KEYS) if (matches(`${BUILTIN_NAMES[key] ?? key} ${key} builtin 內建`.toLowerCase())) result.push({ value: key, name: `${BUILTIN_NAMES[key] ?? key}（內建）` });
      for (const asset of mine) if (matches(`${asset.name} 上傳 我的`.toLowerCase())) result.push({ value: asset.url, name: asset.name || "我的圖示" });
    }
    if (category === "windows") {
      const pool = terms.length ? WINDOWS_ICON_RECORDS : WINDOWS_ICON_RECORDS.filter((record) => CURATED_WINDOWS_ICON_KEYS.includes(record.key)).slice(0, 48);
      for (const record of pool) {
        if (matches(`${record.key} ${record.label} ${record.upstreamPath}`.toLowerCase())) result.push({ value: record.path, name: record.label });
        if (result.length >= 100) break;
      }
    }
    return result;
  }, [catalog, category, purpose, terms, mine]);

  const isTargetCurrent = useCallback(() => {
    if (!active.current || original.current.siteId !== siteId || original.current.targetKey !== iconTargetKey(mediaTarget)) return false;
    if (!siteId) return !mediaTarget;
    return guard.current?.isCurrent() ?? false;
  }, [mediaTarget, siteId]);

  const selectDraft = useCallback((next: string) => {
    selectionGeneration.current += 1;
    queue?.invalidate("已選擇其他圖示，這次上傳不再套用。", (entry) =>
      entry.options.scope === scope && entry.options.slot === "single");
    setDraft(next);
  }, [queue, scope]);

  function addFiles(files: File[], pickFirst: boolean) {
    if (!upload || !queue || !siteId) return;
    setStatus("");
    files.forEach((file, index) => {
      const shouldPick = pickFirst && index === 0;
      const generation = selectionGeneration.current;
      queue.enqueue({
        file,
        scope,
        slot: shouldPick ? "single" : undefined,
        kind: "icon",
        upload,
        isCurrent: () => isTargetCurrent() && (!shouldPick || selectionGeneration.current === generation),
        apply: (stored) => {
          if (!active.current || !isTargetCurrent() || (shouldPick && selectionGeneration.current !== generation)) return false;
          if (shouldPick) {
            setDraft(stored);
            setStatus("已上傳並選取圖示，按「套用」後生效");
          } else {
            setStatus("圖示已加入「我的上傳」。");
          }
          return true;
        }
      });
    });
  }

  async function remove(asset: AssetRecord) {
    if (!siteId) return;
    const generation = requestGeneration.current;
    try {
      await api.deleteAsset(siteId, asset.id);
      if (!active.current || requestGeneration.current !== generation) return;
      setMine((list) => list.filter((item) => item.id !== asset.id));
      if (draft === asset.url) selectDraft(defaultValue ?? "link");
      // The API rejects assets referenced by a saved draft or published site.
      // Library deletion must never write through a captured inspector callback.
    } catch {
      if (active.current && requestGeneration.current === generation) setStatus("刪除失敗。使用中的圖示需先從草稿及公開網站移除。");
    }
  }

  function useUrl() {
    const result = normalizeImageUrl(url);
    if (!result.ok) { setStatus(result.reason); return; }
    selectDraft(result.url);
    setUrl("");
    setStatus("已選取網址圖示，按「套用」後生效");
  }

  function gridKey(event: KeyboardEvent<HTMLUListElement>) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const tiles = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button.ilib-tile"));
    const index = tiles.indexOf(globalThis.document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    const columns = Math.max(1, tiles.filter((tile) => tile.offsetTop === tiles[0].offsetTop).length);
    const target = { ArrowLeft: index - 1, ArrowRight: index + 1, ArrowUp: index - columns, ArrowDown: index + columns, Home: 0, End: tiles.length - 1 }[event.key] ?? index;
    event.preventDefault();
    tiles[Math.min(tiles.length - 1, Math.max(0, target))]?.focus();
  }

  const changed = draft !== value;
  const draftIcon = resolveLibraryIcon(draft);
  const draftEntry = catalog?.ICON_CATALOG.find((item) => item.id === draftIcon?.id);
  const draftSet = draftIcon ? ICON_LIBRARY_SETS[draftIcon.set] : null;
  const shown = draft || defaultPreview || "doc";
  const previewLabel = label?.trim() || "圖示";
  const tabbableIndex = Math.max(0, entries.findIndex((entry) => entry.value === draft));
  const apply = () => {
    if (!isTargetCurrent()) { setStatus("目標已變更或移除，請重新開啟圖示選擇器。"); return; }
    if (changed) onChange(draft);
    onClose();
  };

  const actions: ReactNode = (
    <>
      <button type="button" className="w98-btn" disabled={defaultValue === undefined || draft === defaultValue} onClick={() => selectDraft(defaultValue ?? "")}>恢復預設</button>
      <span className="grow" />
      <button type="button" className="w98-btn" onClick={onClose}>取消</button>
      <button type="button" className="w98-btn primary" disabled={!changed} onClick={apply}>套用</button>
    </>
  );

  return (
    <ModalDialog title="選擇圖示" width={760} onClose={onClose} actions={actions} dismissOnBackdrop={false}>
      <div className="ilib">
        <div className="ilib-main">
          <label className="icon-search"><span className="visually-hidden">搜尋圖示</span><input data-autofocus className="w98-input" type="search" value={search} placeholder="搜尋名稱或關鍵字，例如：資料夾、music、信" aria-label="搜尋圖示" onChange={(event) => setSearch(event.target.value)} /></label>
          <div role="tablist" aria-label="圖示分類" className="ilib-tabs">
            {categories.map((item) => <button key={item.id} type="button" role="tab" aria-selected={category === item.id} className={"ilib-tab" + (category === item.id ? " on" : "")} onClick={() => setCategory(item.id)}>{item.label}</button>)}
          </div>
          {catalog && category !== "mine" && category !== "windows" ? (
            <div className="ilib-chips" role="group" aria-label="用途篩選">
              <button type="button" aria-pressed={!purpose} className={"ilib-chip" + (!purpose ? " on" : "")} onClick={() => setPurpose("")}>全部用途</button>
              {Object.entries(catalog.ICON_PURPOSES).map(([id, name]) => <button key={id} type="button" aria-pressed={purpose === id} className={"ilib-chip" + (purpose === id ? " on" : "")} onClick={() => setPurpose(purpose === id ? "" : id)}>{name}</button>)}
            </div>
          ) : null}
          <div role="status" className="w98-hint ilib-count">{catalogError ? "" : !catalog && category !== "mine" ? "載入圖庫中…" : `共 ${entries.length} 個圖示`}</div>
          {catalogError ? <div className="ilib-error">圖庫載入失敗。<button type="button" className="w98-btn" onClick={loadCatalog}>重試</button></div> : null}
          <div className="ilib-scroll" tabIndex={-1}>
            {entries.length ? (
              <ul ref={grid} className="ilib-grid" aria-label="圖示清單" onKeyDown={gridKey}>
                {entries.map((entry, index) => {
                  const asset = category !== "windows" ? mine.find((item) => item.url === entry.value) : undefined;
                  return <Tile key={entry.value} value={entry.value} name={entry.name} pixel={entry.pixel} selected={draft === entry.value} current={value === entry.value} tabbable={index === tabbableIndex} onSelect={() => selectDraft(entry.value)} onRemove={asset ? () => void remove(asset) : undefined} />;
                })}
              </ul>
            ) : catalog || category === "mine" ? <div className="empty-module">{category === "mine" ? "還沒有上傳過圖示。上傳後會留在這裡，之後每個視窗都能選。" : "找不到符合的圖示。試試別的關鍵字，或切換分類與用途。"}</div> : null}
          </div>
          {category === "mine" || category === "all" ? (
            <div className="ilib-upload">
              {!siteId ? <span className="w98-hint">儲存桌面後才能上傳並使用「我的上傳」。</span> : null}
              <div className="ie-row">
                {upload && queue && siteId ? <FilePick onFiles={(files) => addFiles(files.slice(0, 1), true)}>上傳單張…</FilePick> : null}
                {upload && queue && siteId ? <FilePick multiple onFiles={(files) => addFiles(files, false)}>上傳圖示包…</FilePick> : null}
              </div>
              <div className="ie-row">
                <input className="ie small grow" value={url} placeholder="或貼上圖示網址 https://" aria-label="圖示網址" onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); useUrl(); } }} />
                <MiniBtn label="使用網址" className="mini-btn wide" onClick={useUrl}>使用</MiniBtn>
              </div>
            </div>
          ) : null}
          {category === "windows" ? <span className="w98-hint icon-attribution">來源：<a href={WINDOWS_ICON_SOURCE}>{WINDOWS_ICON_SOURCE.replace("https://github.com/", "")}</a>。圖示權利屬各原權利人。</span> : null}
          <UploadTaskList tasks={ownTasks} onRetry={(id) => queue?.retry(id)} onDismiss={(id) => queue?.dismiss(id)} />
          <span role="status" className="w98-hint">{status}</span>
        </div>

        <aside className="ilib-side" aria-label="預覽">
          <strong>預覽</strong>
          <div className="ilib-preview" data-testid="icon-preview">
            <div className="ilib-shortcut"><Icon name={shown} size={48} /><span>{previewLabel}</span></div>
            <div className="ilib-taskbar"><Icon name={shown} size={16} /><span>{previewLabel}</span></div>
          </div>
          <div className="ilib-meta">
            <strong data-testid="icon-preview-name">{draftEntry?.name ?? (draftIcon ? libraryNameOf(draftIcon.id) : draft ? describeIcon(draft) : "預設圖示")}</strong>
            {draftEntry ? <span>{draftEntry.nameEn}</span> : null}
            {draftSet ? <span>{draftSet.label} · {draftSet.license}</span> : null}
            <span>{changed ? "尚未套用" : "目前使用中"}</span>
          </div>
        </aside>
      </div>
      <details className="icon-help">
        <summary>{packState === "available" ? "Windows 圖示包說明" : packState === "missing" ? "未安裝 Windows 可選圖示包 · 說明" : "Windows 可選圖示包 · 說明"}</summary>
        <div className="icon-help-body">
          <p>Windows 圖示是<strong>可選</strong>的：沒有安裝時，圖庫與你自己上傳的圖示都能正常使用，不影響任何功能。</p>
          {packState === "missing" ? <p>目前這個環境<strong>沒有</strong>安裝 Windows 圖示包。自架者確認上游權利狀態後，才可以在自己的環境執行：<code>{WINDOWS_ICON_PACK_INSTALL_COMMAND}</code></p> : null}
          <p>安裝指令只是把圖示檔放進你自己的環境，<strong>不代表取得公開使用權</strong>。上游未宣告授權，圖示權利屬各原權利人，不隨 Retro 發行，Retro 也不會自動下載或安裝。公開網站請優先使用原創或授權明確的圖示。</p>
          <p>上游專案：<a href={WINDOWS_ICON_SOURCE}>{WINDOWS_ICON_SOURCE.replace("https://github.com/", "")}</a></p>
        </div>
      </details>
    </ModalDialog>
  );
}
