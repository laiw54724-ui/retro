export type Cell = { mine: boolean; adjacent: number; revealed: boolean; flagged: boolean };
export type Game = { phase: "ready" | "playing" | "won" | "lost"; rows: number; columns: number; mines: number; cells: Cell[] };

export const freshGame = (rows: number, columns: number, mines: number): Game => ({ phase: "ready", rows, columns, mines, cells: Array.from({ length: rows * columns }, () => ({ mine: false, adjacent: 0, revealed: false, flagged: false })) });

const neighbors = (index: number, rows: number, columns: number) => {
  const row = Math.floor(index / columns), column = index % columns, result: number[] = [];
  for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) {
    const r = row + dr, c = column + dc;
    if ((dr || dc) && r >= 0 && r < rows && c >= 0 && c < columns) result.push(r * columns + c);
  }
  return result;
};

export function seededGame(game: Game, safeIndex: number, random = Math.random): Game {
  const choices = game.cells.map((_, index) => index).filter((index) => index !== safeIndex);
  const mines = new Set<number>();
  while (mines.size < game.mines && choices.length) {
    const pick = Math.floor(random() * choices.length);
    mines.add(choices.splice(pick, 1)[0]);
  }
  const cells = game.cells.map((cell, index) => ({ ...cell, mine: mines.has(index), adjacent: neighbors(index, game.rows, game.columns).filter((neighbor) => mines.has(neighbor)).length }));
  return { ...game, phase: "playing", cells };
}

export function reveal(game: Game, index: number, random = Math.random): Game {
  if (game.phase === "won" || game.phase === "lost" || game.cells[index]?.flagged) return game;
  const started = game.phase === "ready" ? seededGame(game, index, random) : game;
  if (started.cells[index]?.mine) return { ...started, phase: "lost", cells: started.cells.map((cell) => cell.mine ? { ...cell, revealed: true } : cell) };
  const cells = started.cells.map((cell) => ({ ...cell }));
  const queue = [index], seen = new Set<number>();
  while (queue.length) {
    const current = queue.shift()!;
    if (seen.has(current) || cells[current].flagged) continue;
    seen.add(current); cells[current].revealed = true;
    if (cells[current].adjacent === 0) queue.push(...neighbors(current, started.rows, started.columns));
  }
  const won = cells.every((cell) => cell.mine || cell.revealed);
  return { ...started, phase: won ? "won" : "playing", cells };
}

export function toggleFlag(game: Game, index: number): Game {
  if (game.phase === "won" || game.phase === "lost" || game.cells[index]?.revealed) return game;
  return { ...game, cells: game.cells.map((cell, cellIndex) => cellIndex === index ? { ...cell, flagged: !cell.flagged } : cell) };
}
