// Pure layout helpers for Memory Book exports, so long-content behaviour
// is unit-testable without a browser (review 5769121221 #5).

/** Split text blocks across pages: a block starts on a new page if it does
 *  not fit in the remaining space. Returns pages of block indexes. */
export function paginateBlocks(blockHeights: number[], pageHeight: number, startY: number): number[][] {
  const pages: number[][] = [[]];
  let y = startY;
  for (let i = 0; i < blockHeights.length; i++) {
    const h = blockHeights[i]!;
    if (y + h > pageHeight && pages[pages.length - 1]!.length > 0) {
      pages.push([]);
      y = startY;
    }
    pages[pages.length - 1]!.push(i);
    y += h;
  }
  return pages;
}

/** Share-image selection: at most `limit` entries, with the overflow count
 *  surfaced to the user instead of silently clipped. */
export function selectShareEntries<T>(approved: T[], limit = 8): { shown: T[]; overflow: number } {
  return { shown: approved.slice(0, limit), overflow: Math.max(0, approved.length - limit) };
}
