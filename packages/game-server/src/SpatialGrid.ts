import type { Vector } from "@lobcash/common";

// Spatial hash grid for efficient collision detection
export class SpatialGrid {
  private cells: Map<string, Set<number>> = new Map();

  constructor(private cellSize: number) {}

  private key(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  clear(): void {
    this.cells.clear();
  }

  insert(id: number, pos: Vector, radius: number): void {
    const minCX = Math.floor((pos.x - radius) / this.cellSize);
    const maxCX = Math.floor((pos.x + radius) / this.cellSize);
    const minCY = Math.floor((pos.y - radius) / this.cellSize);
    const maxCY = Math.floor((pos.y + radius) / this.cellSize);

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const k = this.key(cx, cy);
        let cell = this.cells.get(k);
        if (!cell) {
          cell = new Set();
          this.cells.set(k, cell);
        }
        cell.add(id);
      }
    }
  }

  query(pos: Vector, radius: number): Set<number> {
    const result = new Set<number>();
    const minCX = Math.floor((pos.x - radius) / this.cellSize);
    const maxCX = Math.floor((pos.x + radius) / this.cellSize);
    const minCY = Math.floor((pos.y - radius) / this.cellSize);
    const maxCY = Math.floor((pos.y + radius) / this.cellSize);

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const cell = this.cells.get(this.key(cx, cy));
        if (cell) {
          for (const id of cell) result.add(id);
        }
      }
    }
    return result;
  }
}
