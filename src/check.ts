// The checks of a committed snapshot against itself and the project's stories. Pure; the CLI runs them, and a
// project can import them for checks of its own (components against what it builds, say).
import type { Limits } from './config.ts'
import { sampleProblems, type SampleData } from './sample.ts'
import { ARTIFACT_RECORD, copyHash, mapPath, PAGES_FILE, screensOf, STORY_INDEX, storyIndexOf, type ArtifactRecord, type Board, type BoardIndex, type BoardMap, type BoardMeta, type ComponentData, type Pages } from './snapshot.ts'

const REFRESH = 'publish the board to the canvas and refresh the snapshot (drawing-board snapshot)'

/** Whitespace and case do not make two values different. */
const normal = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim()

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Every token in a tokens file, whatever its shape: each object with a string `name` and a string `value` or a
 * record of `values` (one per theme), and each entry of a `families` record.
 */
export const tokenEntries = (tokens: unknown): [string, string[]][] => {
  const found: [string, string[]][] = []
  const walk = (node: unknown, key?: string) => {
    if (Array.isArray(node)) return node.forEach(item => walk(item))
    if (!isRecord(node)) return
    if (key === 'families') for (const [name, value] of Object.entries(node)) if (typeof value === 'string') found.push([name, [value]])
    if (typeof node.name === 'string' && typeof node.value === 'string') found.push([node.name, [node.value]])
    if (typeof node.name === 'string' && isRecord(node.values)) found.push([node.name, Object.values(node.values).filter((v): v is string => typeof v === 'string')])
    for (const [k, v] of Object.entries(node)) if (k !== 'values') walk(v, k)
  }
  walk(tokens)
  return found
}

/** The tokens board must show every token, by name (`--name`) and value, so the board a person reads is the one the build uses. */
export const tokenBoardProblems = (tokens: unknown, boardSource: string): string[] => {
  // What a reader sees: not the board's own stylesheet, which declares every token and would make this pass.
  const text = normal(boardSource.replace(/<(style|script)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]*>/g, ' '))
  const problems: string[] = []
  for (const [name, values] of tokenEntries(tokens)) {
    if (!text.includes(`--${name.toLowerCase()}`)) problems.push(`token --${name} is in tokens.json but the tokens board does not show it.`)
    for (const value of values) if (!text.includes(normal(value))) problems.push(`token --${name} is ${value} in tokens.json but the tokens board does not show that value.`)
  }
  return problems
}

/**
 * Every board has an entry in the map; a story it names exists; an entry is for a board still on the canvas; a
 * board with a story has a copy in the snapshot, and a copy is of a board a story shows.
 */
export const coverageProblems = (index: BoardIndex, map: BoardMap, storyTitles: readonly string[], copies: readonly string[]): string[] => {
  const problems: string[] = []
  const boards = index.boards.map(b => b.file)
  for (const file of boards) {
    const entry = map[file]
    if (entry === undefined) problems.push(`${file} is on the canvas but has no map entry: add ${mapPath(file)} to map it to a story, or say why there is none.`)
    else if (entry.story === undefined && !entry.none) problems.push(`${file}: its map entry names no story and gives no reason.`)
    else if (entry.story !== undefined && !storyTitles.includes(entry.story)) problems.push(`${file}: the story "${entry.story}" does not exist.`)
    else if (entry.story !== undefined && !copies.includes(file)) problems.push(`${file}: has a story but no copy in boards/: refresh the snapshot.`)
  }
  for (const file of Object.keys(map)) if (!boards.includes(file)) problems.push(`${file} has a map entry (${mapPath(file)}) but is no longer on the canvas.`)
  for (const file of copies) if (!screensOf(map).includes(file)) problems.push(`boards/${file} is a copy of a board no story shows.`)
  return problems
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** A note that says the board is built: "built", "implemented", but not "not built yet". */
const SAYS_BUILT = /\b(?<!not )(?<!not yet )(built|implemented)\b/i
/** A note that opens by denying it ("Not built: …", "Not yet compared", "No story"): the board is honestly `none`, whatever else the sentence says. */
const OPENS_WITH_NO = /^\s*(not|no)\b/i

/**
 * Warnings, not failures: a board mapped `none` that looks built. A story's text names the board (its file, or its
 * name next to the word "board": a bare name such as `States` is ordinary prose in "United States"), or the board's
 * own note says it is built, unless the note opens with "not" or "no". A `none` board has no copy in the snapshot, so
 * its markup is never committed and nothing can be compared with it: map it to the story and refresh it.
 * A board whose map entry holds a non-empty `keepNone` (the reason) is left alone: it looks built, and `none` is right.
 * `stories` is each story file's text by path.
 */
export const noneWarnings = (map: BoardMap, stories: Record<string, string>): string[] => {
  const warnings: string[] = []
  for (const [file, entry] of Object.entries(map)) {
    if (entry.story !== undefined || !entry.none) continue
    if (typeof entry.keepNone === 'string' && entry.keepNone.trim() !== '') continue
    const stem = file.replace(/\.dc\.html$/, '')
    const name = new RegExp(`(?<![\\w-])${escape(file)}(?![\\w-])|(?<![\\w-])${escape(stem)}\\s+board\\b|\\bboard\\s+${escape(stem)}(?![\\w-])`, 'i')
    const named = Object.entries(stories).find(([, text]) => name.test(text))?.[0]
    const reason = named !== undefined ? `${named} names it` : !OPENS_WITH_NO.test(entry.none) && SAYS_BUILT.test(entry.none) ? `its note says it is built ("${entry.none}")` : undefined
    if (reason !== undefined) warnings.push(`${file} is mapped none, but ${reason}: map it to its story in ${mapPath(file)} and refresh the snapshot, or its markup is never committed. If \`none\` is right as it is, add "keepNone": "why" to that map file.`)
  }
  return warnings
}

/**
 * Warnings, not failures: a board mapped to a story whose copy was read but marks no `data-sample` value. The values
 * a board shows are meant to be marked so its story reads them instead of retyping them, and nothing else notices a
 * board that marks none (a story may legitimately keep its own data, so this never fails). A board mapped `not built`
 * is left alone, as is one with no copy (a refresh has not read it).
 */
export const unmarkedSampleWarnings = (metas: readonly BoardMeta[], map: BoardMap): string[] =>
  metas
    .filter(m => m.copy !== undefined && map[m.file]?.story !== undefined && map[m.file]?.status !== 'not built' && Object.keys(m.samples ?? {}).length === 0)
    .map(m => `${m.file} is mapped to ${map[m.file]!.story} but marks no data-sample value: mark each value it shows (a name, a figure, a date) on a leaf element as data-sample="group.name" and refresh the snapshot, so its story reads them instead of retyping them. If the story really keeps its own data, ignore this.`)

/** The snapshot's samples and components must be what its committed copies hold. */
export const snapshotProblems = (committed: { samples: SampleData; components: ComponentData }, fresh: { samples: SampleData; components: ComponentData }): string[] => [...sampleProblems(committed.samples, fresh.samples), ...(JSON.stringify(committed.components) !== JSON.stringify(fresh.components) ? ['the components in the boards/*.meta.json files differ from the data-component markup in boards/: refresh the snapshot.'] : [])]

/** Where a built component differs from the board's: by name, the board's markup and the built one. */
export const componentProblems = (board: Record<string, string>, built: Record<string, string>): string[] => {
  const problems: string[] = []
  for (const [name, markup] of Object.entries(built)) {
    if (!(name in board)) problems.push(`${name} is built but the components board marks no data-component="${name}".`)
    else if (board[name] !== markup) problems.push(`${name} differs from the board.\n    board: ${board[name]}\n    built: ${markup}`)
  }
  for (const name of Object.keys(board)) if (!(name in built)) problems.push(`The board marks data-component="${name}", which is not built.`)
  return problems
}

/** Known exceptions to {@link publishedProblems}: boards a story shows that are not on the canvas yet, each with its reason. Never add to it; publish the board and refresh the snapshot, then remove the entry (a stale entry fails). */
export type UnpublishedKnown = Record<string, string>
export const UNPUBLISHED_KNOWN = 'unpublished-known.json'

/**
 * A board a story shows must be one a refresh read from the canvas: its copy has the hash that refresh recorded in
 * the board's metadata. A hand-added copy has none, a hand-edited one differs. Boards on a prototype page are not
 * in the index, so they are not checked.
 */
export const publishedProblems = (index: BoardIndex, map: BoardMap, read: (file: string) => string | undefined, known: UnpublishedKnown = {}): string[] => {
  const problems: string[] = []
  const onCanvas = new Set(index.boards.map(b => b.file))
  for (const file of screensOf(map)) {
    if (!onCanvas.has(file)) continue
    const recorded = index.copies[file]
    const source = read(file)
    const problem = recorded === undefined ? `${file}: a story shows it, but the snapshot has no record that it was read from the canvas: ${REFRESH}.` : source !== undefined && copyHash(source) !== recorded ? `${file}: boards/${file} differs from the copy the last refresh recorded, so it was edited by hand: ${REFRESH}.` : undefined
    if (file in known) {
      if (problem === undefined) problems.push(`${file} is listed in ${UNPUBLISHED_KNOWN} but is published: remove the entry.`)
    } else if (problem !== undefined) problems.push(problem)
  }
  for (const file of Object.keys(known)) if (!screensOf(map).includes(file)) problems.push(`${UNPUBLISHED_KNOWN} lists ${file}, which no story shows: remove the entry.`)
  return problems
}

/** The committed story-to-board index (its text, undefined when the file is missing) must be what the boards' map files give. */
export const storyIndexProblems = (committed: string | undefined, map: BoardMap): string[] => {
  const fix = 'run drawing-board index to write it again from the boards/*.map.json files (no canvas needed).'
  if (committed === undefined) return [`${STORY_INDEX} is missing: ${fix}`]
  let found: unknown
  try {
    found = JSON.parse(committed)
  } catch {
    return [`${STORY_INDEX} is not JSON: ${fix}`]
  }
  const fresh = storyIndexOf(map)
  const problems: string[] = []
  const have = isRecord(found) ? found : {}
  if (have !== found) problems.push(`${STORY_INDEX} is not an object of story titles: ${fix}`)
  for (const [story, files] of Object.entries(fresh)) if (JSON.stringify(have[story]) !== JSON.stringify(files)) problems.push(`${STORY_INDEX}: the story "${story}" lists ${JSON.stringify(have[story] ?? null)} but the map files give ${JSON.stringify(files)}: ${fix}`)
  for (const story of Object.keys(have)) if (!Object.hasOwn(fresh, story)) problems.push(`${STORY_INDEX} lists the story "${story}", which no boards/*.map.json names: ${fix}`)
  return problems
}

/**
 * The line about a canvas's files against its limit: how many are in use and how many are free, and whether that
 * is a warning (fewer than `headroom` free, or none). With `bound`, the count is a lower bound and `bound` says why
 * (the meta files counted in place of a recorded count, say), so the free files are at most what it says.
 */
export const filesInUse = (input: { used: number; limits: Limits; version?: string; bound?: string }): { line: string; warning: boolean } => {
  const { used, limits, bound } = input
  const free = Math.max(0, limits.files - used)
  const at = input.version === undefined ? '' : ` (canvas version ${input.version})`
  const count = bound === undefined ? `${used} of ${limits.files} in use, ${free} free${at}.` : `at least ${used} of ${limits.files} in use, at most ${free} free${at}: ${bound}.`
  const warning = free === 0 || free < limits.headroom
  const advice = free === 0 ? ' The canvas is full: a publish that adds a file is refused. Delete only deprecated designs, or move boards to another canvas.' : warning ? ` Fewer than ${limits.headroom} are free: a design adds about four files (dark, light and a 390 px view of each), so check before you publish.` : ''
  return { line: `Canvas files: ${count}${advice}`, warning }
}

/** Why a count from the meta files is a lower bound: there is no record yet, or the record has no count. */
export const metaCountBound = (hasRecord: boolean): string => `${hasRecord ? `${ARTIFACT_RECORD} records no file count` : `there is no ${ARTIFACT_RECORD} yet`}, so this is the meta files plus 2, and a refresh records the count`

/** Why a count from a read is a lower bound: no files of these installed design systems were read. */
export const unreadBound = (namespaces: readonly string[]): string => `no files of the design system${namespaces.length === 1 ? '' : 's'} ${namespaces.join(', ')} under project/ds/ were read, so they are not counted`

/**
 * What a count from a read assumes: canvas.json names the design systems but not their files, so a read holding any
 * of a namespace's files is taken to hold all of them. Said wherever a count is made from a read.
 */
export const DS_ASSUMPTION = 'The count assumes every file under project/ds/<namespace>/ was read when any of it was; a partial refresh keeps the last full count of those files as a floor.'

/** The snapshot's record must be of the canvas the config names: its id and its link, where both are known. */
export const recordProblems = (record: ArtifactRecord, canvas: { id: string; artifact: string | null }): string[] => {
  const problems: string[] = []
  if (record.canvas !== undefined && record.canvas !== canvas.id) problems.push(`${ARTIFACT_RECORD} is the record of the canvas "${record.canvas}", but this snapshot is the canvas "${canvas.id}": refresh it from its own canvas, or put it in that canvas's snapshot folder.`)
  if (record.artifact !== undefined && canvas.artifact !== null && record.artifact !== canvas.artifact) problems.push(`${ARTIFACT_RECORD} records the canvas ${record.artifact}, but the config names ${canvas.artifact}: refresh the snapshot from the canvas the config names, or correct the link.`)
  return problems
}

/** The boards the record lists as on the canvas that have no meta file: a partial refresh does not add them. */
export const missingBoardWarnings = (record: ArtifactRecord, metaFiles: readonly string[]): string[] => {
  const have = new Set(metaFiles)
  const missing = (record.boards ?? []).filter(file => !have.has(file))
  return missing.length === 0 ? [] : [`${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} on the canvas (${ARTIFACT_RECORD}) but ${missing.length === 1 ? 'has' : 'have'} no meta file: a full refresh adds ${missing.length === 1 ? 'it' : 'them'}.`]
}

/** Each design system the project expects, against the version the canvas was recorded with. */
export const designSystemWarnings = (expected: Record<string, string>, recorded: Record<string, string> | undefined): string[] =>
  Object.entries(expected).flatMap(([namespace, version]) => {
    const installed = recorded?.[namespace]
    if (installed === version) return []
    return [installed === undefined ? `design system "${namespace}": not recorded as installed on the canvas, expected ${version}: install it on the canvas, then refresh.` : `design system "${namespace}": installed ${installed}, expected ${version}: install it again on the canvas, then refresh.`]
  })

/** Each board is on a page `pages.json` lists, and its name starts with one of that page's prefixes when it lists any. */
export const pageProblems = (boards: readonly Board[], pages: Pages): string[] =>
  boards.flatMap(({ file, page }) => {
    if (page === null) return [`${file} is on no page: put it on the page of its flow (${PAGES_FILE} lists them), then refresh.`]
    const entry = pages[page]
    if (entry === undefined) return [`${file} is on the page "${page}", which ${PAGES_FILE} does not list: add the page to ${PAGES_FILE}, or move the board to a page it lists.`]
    const prefixes = entry.prefixes ?? []
    if (prefixes.length > 0 && !prefixes.some(prefix => file.startsWith(prefix))) return [`${file} is on the page "${page}" but starts with none of its prefixes (${prefixes.join(', ')}): rename the board, or move it to the page it belongs to.`]
    return []
  })

/** A map entry's `tags`, where it has them, is a list of non-empty strings. Warnings, not failures: a map entry may hold a project's own fields, so a `tags` it already had must not fail its check. */
export const tagWarnings = (map: BoardMap): string[] =>
  Object.entries(map).flatMap(([file, entry]) => (entry.tags === undefined || (Array.isArray(entry.tags) && entry.tags.every(t => typeof t === 'string' && t.trim() !== '')) ? [] : [`${file}: "tags" in ${mapPath(file)} is not a list of non-empty strings, such as ["merge queue"], so find does not read it.`]))

/** A board's name is unique across every snapshot: a board file with a meta file in two snapshots, naming both canvases. */
export const duplicateBoardProblems = (metaFilesByCanvas: Record<string, readonly string[]>): string[] => {
  const found = new Map<string, string[]>()
  for (const [canvas, files] of Object.entries(metaFilesByCanvas)) for (const file of files) found.set(file, [...(found.get(file) ?? []), canvas])
  return [...found.entries()]
    .filter(([, canvases]) => canvases.length > 1)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([file, canvases]) => `${file} has a meta file in the snapshots of the canvases ${canvases.join(' and ')}: a board name is unique across canvases, so keep the board on one canvas (or rename one) and refresh both.`)
}
