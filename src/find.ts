// `drawing-board find`: the boards of every snapshot that match a few words, from what the snapshot already knows
// of each (its name, title, page, map entry, components and samples) and the hand-kept pages.json. Pure.
import type { BoardMap, BoardMeta, Pages } from './snapshot.ts'

/** One canvas's snapshot as `find` reads it: its id, the meta files, the map entries and the pages, when it keeps them. */
export type FindCanvas = { id: string; metas: readonly BoardMeta[]; map: BoardMap; pages?: Pages }
/** A board that matched: where it is, the story that shows it (null for none), and how many of the words it matched. */
export type FoundBoard = { canvas: string; page: string | null; file: string; story: string | null; score: number }

/** A board file's name as words: `MergeQueueCard.dc.html` is also `Merge Queue Card`. */
export const nameWords = (file: string): string => {
  const name = file.replace(/\.dc\.html$/, '')
  return `${file} ${name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')}`
}

/** Everything a board is found by, lowercased: its name (in words too), title, page and that page's flow and keywords, its map entry's story, tags and reason for no story, and its component and sample names. */
export const searchText = (meta: BoardMeta, entry: BoardMap[string] | undefined, pages: Pages | undefined): string => {
  const page = meta.page === null ? undefined : pages?.[meta.page]
  const tags = Array.isArray(entry?.tags) ? entry.tags : []
  return [nameWords(meta.file), meta.title, meta.page, page?.flow, ...(page?.keywords ?? []), entry?.story, ...tags, entry?.none, ...Object.keys(meta.components ?? {}), ...Object.keys(meta.samples ?? {})]
    .filter((part): part is string => typeof part === 'string')
    .join('\n')
    .toLowerCase()
}

/** The query's words, lowercased and once each; each argument may hold several. */
export const queryWords = (args: readonly string[]): string[] => [...new Set(args.flatMap(a => a.toLowerCase().split(/\s+/)).filter(w => w !== ''))]

/** The boards that match at least one word (a case-blind part of their text), most words first, then by canvas and file. */
export const findBoards = (canvases: readonly FindCanvas[], words: readonly string[]): FoundBoard[] => {
  const query = queryWords(words)
  const found: FoundBoard[] = []
  for (const canvas of canvases)
    for (const meta of canvas.metas) {
      const entry = canvas.map[meta.file]
      const text = searchText(meta, entry, canvas.pages)
      const score = query.filter(word => text.includes(word)).length
      if (score > 0) found.push({ canvas: canvas.id, page: meta.page, file: meta.file, story: typeof entry?.story === 'string' ? entry.story : null, score })
    }
  const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  return found.sort((a, b) => b.score - a.score || order(a.canvas, b.canvas) || order(a.file, b.file))
}
