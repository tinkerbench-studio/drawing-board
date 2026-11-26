// The comparison of a board with the story that shows it (advisory, never a gate): where they disagree about fixed
// wording and structure. Values are ignored by design: `isValue` leaves out an item with a digit, an @, a currency
// sign, a double quotation mark, a {{ placeholder or over 90 characters, so a difference in such an item is not
// listed. Plain words (a city, a status) are wording and are listed. The project supplies each story's markup: how it
// draws a story (a Storybook run, its own renderer) is its own.
import { outline, type OutlineItem } from './html.ts'
import type { BoardMap } from './snapshot.ts'

/** The settings that add to the comparison (the `compare` setting); each is off unless named, and with both off the report is the one the set difference gives. */
export type CompareVerdicts = { order?: boolean; closestState?: boolean }

/** Below this share of the board's items found in a story state, the pair is reported as unrelated (`closestState`). */
export const UNRELATED_BELOW = 0.25
/** A side with fewer items than this is not judged: too little wording to say anything about its order or its mapping. */
export const MIN_ITEMS = 3

/** `same`: the shared texts come in one order; `reordered`: some do not (`outOfOrder` says how many); `not-judged`: a side has fewer than `MIN_ITEMS` items. */
export type OrderVerdict = { verdict: 'same' | 'reordered' | 'not-judged'; outOfOrder: number }

export type PageComparison = {
  board: string
  story: string
  status: string
  onlyOnBoard: OutlineItem[]
  onlyInStory: OutlineItem[]
  decided: OutlineItem[]
  shared: number
  /** With the `order` option: whether the shared texts come in the same order on both sides. */
  order?: OrderVerdict
  /** With the `closestState` option and a story of several states: the state the board was compared with. */
  closestState?: string
  /** With the `closestState` option: the pair shares less than `UNRELATED_BELOW` of the board's items, so the mapping is doubted. */
  unrelated?: boolean
}

/** What an item says; the same words as a label on a board and a list item in the build are the same wording. */
const key = (item: OutlineItem) => item.text.toLowerCase()

/**
 * Wording and structure each side has that the other lacks. Case is ignored and an item that appears twice counts
 * once. A difference named in `decided` (`"kind: text"`, from the board's map entry) was decided to stay: it is
 * listed apart, not as open.
 */
export const comparePage = (board: string, story: string, status: string, boardHtml: string, storyHtml: string, decided: readonly string[] = [], options: CompareVerdicts = {}): PageComparison => {
  const dedupe = (items: OutlineItem[]) => [...new Map(items.map(item => [key(item), item])).values()]
  const onBoard = dedupe(outline(boardHtml))
  const inStory = dedupe(outline(storyHtml))
  const storyKeys = new Set(inStory.map(key))
  const boardKeys = new Set(onBoard.map(key))
  const decidedKeys = new Set(decided.map(d => d.toLowerCase()))
  const isDecided = (item: OutlineItem) => decidedKeys.has(`${item.kind}: ${key(item)}`)
  const onlyOnBoard = onBoard.filter(i => !storyKeys.has(key(i)))
  const onlyInStory = inStory.filter(i => !boardKeys.has(key(i)))
  const shared = onBoard.filter(i => storyKeys.has(key(i))).length
  const result: PageComparison = { board, story, status, onlyOnBoard: onlyOnBoard.filter(i => !isDecided(i)), onlyInStory: onlyInStory.filter(i => !isDecided(i)), decided: [...onlyOnBoard, ...onlyInStory].filter(isDecided), shared }
  if (options.order) result.order = orderVerdict(onBoard.map(key), inStory.map(key))
  if (options.closestState && onBoard.length >= MIN_ITEMS && shared / onBoard.length < UNRELATED_BELOW) result.unrelated = true
  return result
}

/** Length of the longest common subsequence of two lists of distinct texts. */
const lcsLength = (a: readonly string[], b: readonly string[]): number => {
  let previous = new Array<number>(b.length + 1).fill(0)
  for (const x of a) {
    const current = new Array<number>(b.length + 1).fill(0)
    for (let j = 1; j <= b.length; j++) current[j] = x === b[j - 1] ? previous[j - 1]! + 1 : Math.max(previous[j]!, current[j - 1]!)
    previous = current
  }
  return previous[b.length]!
}

/** Whether the texts both sides have come in the same order: the shared texts less their longest common subsequence are out of order. Each list holds distinct texts. */
const orderVerdict = (board: readonly string[], story: readonly string[]): OrderVerdict => {
  if (board.length < MIN_ITEMS || story.length < MIN_ITEMS) return { verdict: 'not-judged', outOfOrder: 0 }
  const inStory = new Set(story)
  const outOfOrder = board.filter(k => inStory.has(k)).length - lcsLength(board, story)
  return { verdict: outOfOrder === 0 ? 'same' : 'reordered', outOfOrder }
}

/**
 * A board compared with each state of its story (`states`: state name → its markup): the closest is the state that
 * keeps most of the board's texts in the board's order, and the comparison is read against it. A board that shares
 * less than `UNRELATED_BELOW` of its items with even that state is reported as unrelated.
 */
export const compareStates = (board: string, story: string, status: string, boardHtml: string, states: Record<string, string>, decided: readonly string[] = [], options: CompareVerdicts = {}): PageComparison => {
  const names = Object.keys(states)
  const wanted = dedupeKeys(outline(boardHtml))
  let closest = names[0]!
  let best = -1
  for (const name of names) {
    const score = lcsLength(wanted, dedupeKeys(outline(states[name]!)))
    if (score > best) [best, closest] = [score, name]
  }
  const compared = comparePage(board, `${story} › ${closest}`, status, boardHtml, states[closest]!, decided, { ...options, closestState: true })
  return { ...compared, closestState: closest }
}

const dedupeKeys = (items: OutlineItem[]) => [...new Set(items.map(key))]

/** Every mapped board whose story the project could draw (`stories`: story title → its markup), compared with that story. */
export const comparePages = (map: BoardMap, boardHtml: (file: string) => string, stories: Record<string, string>, options: CompareVerdicts = {}): PageComparison[] =>
  Object.entries(map)
    .filter(([, entry]) => entry.story !== undefined && stories[entry.story] !== undefined)
    .map(([file, entry]) => comparePage(file, entry.story!, entry.status ?? 'not classified', boardHtml(file), stories[entry.story!]!, Array.isArray(entry.decided) ? entry.decided.filter((d): d is string => typeof d === 'string') : [], options))

const list = (items: OutlineItem[]) => (items.length === 0 ? '_none_' : items.map(i => `- ${i.kind}: ${i.text}`).join('\n'))

/** The lines the order and closest-state options add under a page's heading; none with both off. */
const verdictLines = (p: PageComparison): string[] => [
  ...(p.closestState === undefined ? [] : [`Closest story state: ${p.closestState}.`, '']),
  ...(p.unrelated ? [`**Unrelated**: the board shares less than ${UNRELATED_BELOW * 100}% of its items with the story, so the mapping is probably wrong.`, ''] : []),
  ...(p.order === undefined ? [] : [p.order.verdict === 'same' ? 'Order: the shared items come in the same order.' : p.order.verdict === 'reordered' ? `Order: ${p.order.outOfOrder} shared item${p.order.outOfOrder === 1 ? '' : 's'} come in a different order.` : `Order: not judged, a side has fewer than ${MIN_ITEMS} items.`, '']),
]

/** The comparisons as a Markdown report, with any component differences the project found at the end. */
export const comparisonReport = (pages: readonly PageComparison[], componentDifferences: readonly string[] = []): string =>
  [
    '# Design canvas against Storybook',
    '',
    'Advisory: where each board and its story disagree about fixed wording and structure (headings, buttons, links, field labels, column heads, list items). Values (anything with a digit, an address, a currency sign or a placeholder) are left out.',
    '',
    ...pages.flatMap(p => [`## ${p.board} ↔ ${p.story} (${p.status})`, '', `${p.shared} items in both.`, '', ...verdictLines(p), '**Only on the board** (designed, not built, or worded differently):', list(p.onlyOnBoard), '', '**Only in the story** (built, not designed):', list(p.onlyInStory), '', ...(p.decided.length ? ['**Decided to stay different** (`decided` in its map entry):', list(p.decided), ''] : [])]),
    '## Components',
    '',
    componentDifferences.length === 0 ? 'Every built component draws the markup its board marks.' : componentDifferences.map(d => `- ${d}`).join('\n'),
    '',
  ].join('\n')
