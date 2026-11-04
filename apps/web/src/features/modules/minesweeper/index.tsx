import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { ModuleProps } from "../types";
import { freshGame, reveal, toggleFlag } from "./game";
import { commitNumericDraft } from "./numericDraft";

const difficulties = [
  { id: "beginner", rows: 5, columns: 5, mines: 3 },
  { id: "intermediate", rows: 8, columns: 8, mines: 10 },
  { id: "advanced", rows: 12, columns: 12, mines: 25 }
] as const;

function NumericDraftInput({ value, min, max, onCommit }: { value: number; min: number; max: number; onCommit: (value: number) => void }) {
  const [state, setState] = useState({ base: value, text: String(value) });
  const composing = useRef(false);
  const blurredDuringComposition = useRef(false);
  const cancelBlur = useRef(false);
  // Canonical changes (including undo or a smaller board) supersede old drafts.
  const draft = state.base === value ? state.text : String(value);
  if (state.base !== value) setState({ base: value, text: String(value) });
  const commit = (raw: string) => {
    const next = commitNumericDraft(raw, value, min, max);
    setState({ base: next, text: String(next) });
    if (next !== value) onCommit(next);
  };
  return <input type="number" inputMode="numeric" min={min} max={max} step={1} value={draft}
    onChange={(event) => setState({ base: value, text: event.target.value })}
    onCompositionStart={() => { composing.current = true; }}
    onCompositionEnd={(event) => {
      composing.current = false;
      if (blurredDuringComposition.current) {
        blurredDuringComposition.current = false;
        commit(event.currentTarget.value);
      }
    }}
    onBlur={(event) => {
      if (cancelBlur.current) { cancelBlur.current = false; return; }
      if (composing.current) { blurredDuringComposition.current = true; return; }
      commit(event.currentTarget.value);
    }}
    onKeyDown={(event) => {
      if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancelBlur.current = true;
        setState({ base: value, text: String(value) });
        event.currentTarget.blur();
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.blur();
      }
    }} />;
}

function Minesweeper({ window, editing, update }: ModuleProps<"minesweeper"> & { editing: boolean }) {
  const { t: tr } = useTranslation("modules");
  const config = window.content;
  const [game, setGame] = useState(() => freshGame(config.rows, config.columns, config.mines));
  const [elapsed, setElapsed] = useState(0);
  const [flagMode, setFlagMode] = useState(false);
  useEffect(() => { setGame(freshGame(config.rows, config.columns, config.mines)); setElapsed(0); }, [config.rows, config.columns, config.mines]);
  useEffect(() => {
    if (game.phase !== "playing") return;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [game.phase]);
  const restart = () => { if (game.phase === "playing" && !globalThis.confirm(tr("minesweeper.restartThisMinesweeperGame"))) return; setGame(freshGame(config.rows, config.columns, config.mines)); setElapsed(0); };
  const activate = (index: number, flag = flagMode) => setGame((current) => flag ? toggleFlag(current, index) : reveal(current, index));
  const key = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const row = Math.floor(index / config.columns), column = index % config.columns;
    const next = event.key === "ArrowLeft" ? [row, column - 1] : event.key === "ArrowRight" ? [row, column + 1] : event.key === "ArrowUp" ? [row - 1, column] : event.key === "ArrowDown" ? [row + 1, column] : null;
    if (next && next[0] >= 0 && next[0] < config.rows && next[1] >= 0 && next[1] < config.columns) {
      event.preventDefault();
      // Public pages render desktop and mobile trees together; IDs may appear in
      // both. Stay within the grid that received the keyboard event.
      const cell = event.currentTarget.parentElement?.children.item(next[0] * config.columns + next[1]) as HTMLButtonElement | null;
      cell?.focus();
      cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    if (event.key.toLowerCase() === "f") { event.preventDefault(); activate(index, true); }
  };
  const configure = (field: "rows" | "columns" | "mines", raw: number) => update((current) => {
    const next = { ...current.content };
    if (field === "mines") next.mines = Math.max(1, Math.min(40, next.rows * next.columns - 1, raw));
    else {
      next[field] = Math.max(5, Math.min(12, raw));
      next.mines = Math.min(next.mines, next.rows * next.columns - 1);
    }
    if (next.rows === current.content.rows && next.columns === current.content.columns && next.mines === current.content.mines) return current;
    return { ...current, content: next };
  });
  const chooseDifficulty = (choice: typeof difficulties[number]) => update((current) => ({ ...current, content: { rows: choice.rows, columns: choice.columns, mines: choice.mines } }));
  return <div className="minesweeper-app">
    <div className="minesweeper-status"><strong>{game.phase === "won" ? tr("minesweeper.cleared") : game.phase === "lost" ? tr("minesweeper.boom") : tr("minesweeper.minesweeper")}</strong><span>{String(elapsed).padStart(3, "0")}</span><button type="button" className="w98-btn" onClick={restart}>{tr("minesweeper.restart")}</button></div>
    <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{game.phase === "won" ? tr("minesweeper.wonAnnouncement") : game.phase === "lost" ? tr("minesweeper.lostAnnouncement") : ""}</p>
    <button type="button" className="w98-btn minesweeper-flag-mode" aria-pressed={flagMode} onClick={() => setFlagMode(!flagMode)}>{tr("minesweeper.mobileFlagMode")}</button>
    <div className="minesweeper-board-scroll" aria-label={tr("minesweeper.minesweeperBoardScrollArea")}>
      <div className="minesweeper-grid" role="grid" aria-label={tr("minesweeper.minesweeperBoard")} style={{ gridTemplateColumns: `repeat(${config.columns}, minmax(30px, 1fr))` }}>{game.cells.map((cell, index) => <button id={`${window.id}-mine-${index}`} role="gridcell" key={index} type="button" className={`mine-cell${cell.revealed ? " revealed" : ""}`} aria-label={tr("minesweeper.cellPosition", { row: Math.floor(index / config.columns) + 1, column: index % config.columns + 1, state: cell.flagged ? tr("minesweeper.stateFlagged") : cell.revealed ? cell.mine ? tr("minesweeper.stateMine") : tr("minesweeper.stateAdjacent", { count: cell.adjacent }) : tr("minesweeper.stateUnopened") })} onClick={() => activate(index)} onContextMenu={(event) => { event.preventDefault(); activate(index, true); }} onKeyDown={(event) => key(event, index)}>{cell.revealed ? cell.mine ? "💣" : cell.adjacent || "" : cell.flagged ? "🚩" : ""}</button>)}</div>
    </div>
    {config.columns >= 10 ? <small className="minesweeper-scroll-hint">{tr("minesweeper.swipeTheBoardSidewaysTo")}</small> : null}
    {editing ? <fieldset className="minesweeper-settings"><legend>{tr("minesweeper.gameSettings")}</legend><div className="button-row" style={{ gridColumn: "1 / -1" }} role="group" aria-label={tr("minesweeper.difficulties")}>{difficulties.map((choice) => <button key={choice.id} type="button" className="w98-btn small" aria-pressed={config.rows === choice.rows && config.columns === choice.columns && config.mines === choice.mines} onClick={() => chooseDifficulty(choice)}>{tr(`minesweeper.${choice.id}`)}</button>)}</div>{(["rows", "columns", "mines"] as const).map((field) => <label key={field}>{field === "rows" ? tr("minesweeper.row") : field === "columns" ? tr("minesweeper.column") : tr("minesweeper.mines")}<NumericDraftInput min={field === "mines" ? 1 : 5} max={field === "mines" ? Math.min(40, config.rows * config.columns - 1) : 12} value={config[field]} onCommit={(value) => configure(field, value)} /></label>)}</fieldset> : null}
  </div>;
}

export function MinesweeperView(props: ModuleProps<"minesweeper">) { return <Minesweeper {...props} editing={false} />; }
export function MinesweeperInlineEditor(props: ModuleProps<"minesweeper">) { return <Minesweeper {...props} editing />; }
