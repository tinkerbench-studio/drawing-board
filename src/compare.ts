// The comparison of a board with the story that shows it (advisory, never a gate): where they disagree about fixed
// wording and structure. Values are ignored by design: `isValue` leaves out an item with a digit, an @, a currency
// sign, a double quotation mark, a {{ placeholder or over 90 characters, so a difference in such an item is not
// listed. Plain words (a city, a status) are wording and are listed. The project supplies each story's markup: how it
// draws a story (a Storybook run, its own renderer) is its own.
import { outline, type OutlineItem } from './html.ts'
import type { BoardMap } from './snapshot.ts'

export type PageComparison = { board: string; story: string; status: string; onlyOnBoard: OutlineItem[]; onlyInStory: OutlineItem[]; decided: OutlineItem[]; shared: number }

/** What an item says; the same words as a label on a board and a list item in the build are the same wording. */
const key = (item: OutlineItem) => item.text.toLowerCase()

/**
 * Wording and structure each side has that the other lacks. Case is ignored and an item that appears twice counts
 * once. A difference named in `decided` (`"kind: text"`, from the board's map entry) was decided to stay: it is
 * listed apart, not as open.
 */
export const comparePage = (board: string, story: string, status: string, boardHtml: string, storyHtml: string, decided: readonly string[] = []): PageComparison => {
  const dedupe = (items: OutlineItem[]) => [...new Map(items.map(item => [key(item), item])).values()]
  const onBoard = dedupe(outline(boardHtml))
  const inStory = dedupe(outline(storyHtml))
  const storyKeys = new Set(inStory.map(key))
  const boardKeys = new Set(onBoard.map(key))
  const decidedKeys = new Set(decided.map(d => d.toLowerCase()))
  const isDecided = (item: OutlineItem) => decidedKeys.has(`${item.kind}: ${key(item)}`)
  const onlyOnBoard = onBoard.filter(i => !storyKeys.has(key(i)))
  const onlyInStory = inStory.filter(i => !boardKeys.has(key(i)))
  return { board, story, status, onlyOnBoard: onlyOnBoard.filter(i => !isDecided(i)), onlyInStory: onlyInStory.filter(i => !isDecided(i)), decided: [...onlyOnBoard, ...onlyInStory].filter(isDecided), shared: onBoard.filter(i => storyKeys.has(key(i))).length }
}

/** Every mapped board whose story the project could draw (`stories`: story title → its markup), compared with that story. */
export const comparePages = (map: BoardMap, boardHtml: (file: string) => string, stories: Record<string, string>): PageComparison[] =>
  Object.entries(map)
    .filter(([, entry]) => entry.story !== undefined && stories[entry.story] !== undefined)
    .map(([file, entry]) => comparePage(file, entry.story!, entry.status ?? 'not classified', boardHtml(file), stories[entry.story!]!, Array.isArray(entry.decided) ? entry.decided.filter((d): d is string => typeof d === 'string') : []))

const list = (items: OutlineItem[]) => (items.length === 0 ? '_none_' : items.map(i => `- ${i.kind}: ${i.text}`).join('\n'))

/** The comparisons as a Markdown report, with any component differences the project found at the end. */
export const comparisonReport = (pages: readonly PageComparison[], componentDifferences: readonly string[] = []): string =>
  [
    '# Design canvas against Storybook',
    '',
    'Advisory: where each board and its story disagree about fixed wording and structure (headings, buttons, links, field labels, column heads, list items). Values (anything with a digit, an address, a currency sign or a placeholder) are left out.',
    '',
    ...pages.flatMap(p => [`## ${p.board} ↔ ${p.story} (${p.status})`, '', `${p.shared} items in both.`, '', '**Only on the board** (designed, not built, or worded differently):', list(p.onlyOnBoard), '', '**Only in the story** (built, not designed):', list(p.onlyInStory), '', ...(p.decided.length ? ['**Decided to stay different** (`decided` in its map entry):', list(p.decided), ''] : [])]),
    '## Components',
    '',
    componentDifferences.length === 0 ? 'Every built component draws the markup its board marks.' : componentDifferences.map(d => `- ${d}`).join('\n'),
    '',
  ].join('\n')
