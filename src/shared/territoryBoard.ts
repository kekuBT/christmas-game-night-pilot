/**
 * Stage 12.12 (docs/stage12/stage1212.md §2; D-S1212-01): Territory's board, shared by the server and the screens.
 *
 * A hexagon of 19 hex cells (radius 2), in axial coordinates (q, r), numbered row by row from the top. Pointy-top: a
 * cell's centre is at x = √3·(q + r/2), y = 1.5·r (in cell sizes). Each team starts on a home corner, spread evenly:
 * 2 teams on opposite corners, 3 on alternate corners, 4 on two pairs of top and bottom corners.
 */
export interface HexCell { id: number; q: number; r: number }

export const TERRITORY_RADIUS = 2;

export const TERRITORY_CELLS: readonly HexCell[] = (() => {
  const out: HexCell[] = [];
  for (let r = -TERRITORY_RADIUS; r <= TERRITORY_RADIUS; r++) {
    for (let q = Math.max(-TERRITORY_RADIUS, -r - TERRITORY_RADIUS); q <= Math.min(TERRITORY_RADIUS, -r + TERRITORY_RADIUS); q++) out.push({ id: out.length, q, r });
  }
  return out;
})();

/** The centre cell (0, 0). */
export const TERRITORY_CENTRE = TERRITORY_CELLS.findIndex((c) => c.q === 0 && c.r === 0);

const at = (q: number, r: number) => TERRITORY_CELLS.findIndex((c) => c.q === q && c.r === r);

/** Home corners by number of teams, in the teams' own order. */
export const TERRITORY_HOMES: Readonly<Record<2 | 3 | 4, readonly number[]>> = {
  2: [at(-2, 0), at(2, 0)],
  3: [at(0, -2), at(2, 0), at(-2, 2)],
  4: [at(0, -2), at(2, -2), at(0, 2), at(-2, 2)],
};

export function hexDistance(a: number, b: number): number {
  const x = TERRITORY_CELLS[a]!, y = TERRITORY_CELLS[b]!;
  const dq = x.q - y.q, dr = x.r - y.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]] as const;

/** The cells next to a cell (2–6 of them). */
export function hexNeighbours(id: number): number[] {
  const c = TERRITORY_CELLS[id];
  if (!c) return [];
  return DIRS.map(([dq, dr]) => at(c.q + dq, c.r + dr)).filter((n) => n >= 0);
}

/** A cell's centre, for a board drawn with cells of the given size (centre cell at 0, 0). */
export function hexCentre(id: number, size: number): { x: number; y: number } {
  const c = TERRITORY_CELLS[id]!;
  return { x: size * Math.sqrt(3) * (c.q + c.r / 2), y: size * 1.5 * c.r };
}

/** The biggest group of joined cells one owner holds. */
export function largestRegion(owner: readonly (string | null)[], teamId: string): number {
  const seen = new Set<number>();
  let best = 0;
  for (let i = 0; i < owner.length; i++) {
    if (owner[i] !== teamId || seen.has(i)) continue;
    let size = 0;
    const stack = [i];
    seen.add(i);
    while (stack.length) {
      const c = stack.pop()!;
      size++;
      for (const n of hexNeighbours(c)) if (owner[n] === teamId && !seen.has(n)) { seen.add(n); stack.push(n); }
    }
    best = Math.max(best, size);
  }
  return best;
}

/** A cell's name for people: its row (A–E, top to bottom) and its place in the row (1 = leftmost), e.g. "C3". */
export function cellName(id: number): string {
  const c = TERRITORY_CELLS[id];
  if (!c) return "?";
  const row = TERRITORY_CELLS.filter((x) => x.r === c.r);
  return `${String.fromCharCode(65 + c.r + TERRITORY_RADIUS)}${row.findIndex((x) => x.id === id) + 1}`;
}
