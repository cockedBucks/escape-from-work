/**
 * Uniform grid over the XZ plane for fast "what is near this point" lookups.
 * Items are stored by integer id in every cell their bounding box touches.
 * Queries return ids sorted ascending, so results never depend on insertion order.
 */
export class SpatialGrid {
  private readonly cells = new Map<number, number[]>();

  constructor(readonly cellSize: number) {
    if (!(cellSize > 0)) throw new Error('SpatialGrid cellSize must be > 0');
  }

  private cell(v: number): number {
    return Math.floor(v / this.cellSize);
  }

  /** Cells are keyed by one number; fine for tracks up to ~500 km across. */
  private static key(cx: number, cz: number): number {
    return (cx + 32768) * 65536 + (cz + 32768);
  }

  insert(id: number, minX: number, minZ: number, maxX: number, maxZ: number): void {
    for (let cx = this.cell(minX); cx <= this.cell(maxX); cx++) {
      for (let cz = this.cell(minZ); cz <= this.cell(maxZ); cz++) {
        const k = SpatialGrid.key(cx, cz);
        const list = this.cells.get(k);
        if (list) list.push(id);
        else this.cells.set(k, [id]);
      }
    }
  }

  /** Ids in every cell the box touches, unique and sorted. */
  queryBox(minX: number, minZ: number, maxX: number, maxZ: number): number[] {
    const found = new Set<number>();
    for (let cx = this.cell(minX); cx <= this.cell(maxX); cx++) {
      for (let cz = this.cell(minZ); cz <= this.cell(maxZ); cz++) {
        const list = this.cells.get(SpatialGrid.key(cx, cz));
        if (list) for (const id of list) found.add(id);
      }
    }
    return [...found].sort((a, b) => a - b);
  }

  queryPoint(x: number, z: number): number[] {
    return this.queryBox(x, z, x, z);
  }
}
