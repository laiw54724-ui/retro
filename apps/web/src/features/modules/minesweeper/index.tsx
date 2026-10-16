import { useEffect, useState, type KeyboardEvent } from "react";
import type { ModuleProps } from "../types";
import { freshGame, reveal, toggleFlag } from "./game";

function Minesweeper({ window, editing, update }: ModuleProps<"minesweeper"> & { editing: boolean }) {
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
  const restart = () => { if (game.phase === "playing" && !globalThis.confirm("重新開始這局掃雷？")) return; setGame(freshGame(config.rows, config.columns, config.mines)); setElapsed(0); };
  const activate = (index: number, flag = flagMode) => setGame((current) => flag ? toggleFlag(current, index) : reveal(current, index));
  const key = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const row = Math.floor(index / config.columns), column = index % config.columns;
    const next = event.key === "ArrowLeft" ? [row, column - 1] : event.key === "ArrowRight" ? [row, column + 1] : event.key === "ArrowUp" ? [row - 1, column] : event.key === "ArrowDown" ? [row + 1, column] : null;
    if (next && next[0] >= 0 && next[0] < config.rows && next[1] >= 0 && next[1] < config.columns) { event.preventDefault(); document.getElementById(`${window.id}-mine-${next[0] * config.columns + next[1]}`)?.focus(); }
    if (event.key.toLowerCase() === "f") { event.preventDefault(); activate(index, true); }
  };
  const configure = (field: "rows" | "columns" | "mines", raw: number) => update((current) => {
    const next = { ...current.content };
    if (field === "mines") next.mines = Math.max(1, Math.min(40, next.rows * next.columns - 1, raw || 1));
    else {
      next[field] = Math.max(5, Math.min(12, raw || 5));
      next.mines = Math.min(next.mines, next.rows * next.columns - 1);
    }
    return { ...current, content: next };
  });
  return <div className="minesweeper-app">
    <div className="minesweeper-status"><strong>{game.phase === "won" ? "🎉 完成" : game.phase === "lost" ? "💥 踩雷" : "🙂 掃雷"}</strong><span>{String(elapsed).padStart(3, "0")}</span><button type="button" className="w98-btn" onClick={restart}>重新開始</button></div>
    <button type="button" className="w98-btn minesweeper-flag-mode" aria-pressed={flagMode} onClick={() => setFlagMode(!flagMode)}>🚩 手機標記模式</button>
    <div className="minesweeper-grid" role="grid" aria-label="掃雷棋盤" style={{ gridTemplateColumns: `repeat(${config.columns}, minmax(30px, 1fr))` }}>{game.cells.map((cell, index) => <button id={`${window.id}-mine-${index}`} role="gridcell" key={index} type="button" className={`mine-cell${cell.revealed ? " revealed" : ""}`} aria-label={`第 ${Math.floor(index / config.columns) + 1} 列第 ${index % config.columns + 1} 格${cell.flagged ? "，已標記" : cell.revealed ? cell.mine ? "，地雷" : `，周圍 ${cell.adjacent} 顆地雷` : "，未開啟"}`} onClick={() => activate(index)} onContextMenu={(event) => { event.preventDefault(); activate(index, true); }} onKeyDown={(event) => key(event, index)}>{cell.revealed ? cell.mine ? "💣" : cell.adjacent || "" : cell.flagged ? "🚩" : ""}</button>)}</div>
    {editing ? <fieldset className="minesweeper-settings"><legend>遊戲設定</legend>{(["rows", "columns", "mines"] as const).map((field) => <label key={field}>{field === "rows" ? "列" : field === "columns" ? "欄" : "地雷"}<input type="number" min={field === "mines" ? 1 : 5} max={field === "mines" ? Math.min(40, config.rows * config.columns - 1) : 12} value={config[field]} onChange={(event) => configure(field, Number(event.target.value))} /></label>)}</fieldset> : null}
  </div>;
}

export function MinesweeperView(props: ModuleProps<"minesweeper">) { return <Minesweeper {...props} editing={false} />; }
export function MinesweeperInlineEditor(props: ModuleProps<"minesweeper">) { return <Minesweeper {...props} editing />; }
