import { describe, expect, it } from "vitest";
import { freshGame, reveal, seededGame, toggleFlag } from "./game";

describe("minesweeper rules", () => {
  it("keeps the first revealed cell safe and places the requested mines", () => {
    const game = reveal(freshGame(5, 5, 5), 12, () => 0);
    expect(game.cells[12].mine).toBe(false);
    expect(game.cells.filter((cell) => cell.mine)).toHaveLength(5);
    expect(game.cells[12].revealed).toBe(true);
  });

  it("supports explicit flags and win/loss states", () => {
    const base = seededGame(freshGame(5, 5, 1), 0, () => 0);
    const mine = base.cells.findIndex((cell) => cell.mine);
    expect(toggleFlag(base, mine).cells[mine].flagged).toBe(true);
    expect(reveal(base, mine).phase).toBe("lost");
    let game = base;
    base.cells.forEach((cell, index) => { if (!cell.mine) game = reveal(game, index); });
    expect(game.phase).toBe("won");
  });
});
