// The committed snapshot of a design canvas. The canvas is a private claude.ai artifact, so CI cannot read it; the
// checks compare this copy. Everything here is pure: cli.ts reads and writes.
//
// The snapshot is one set of files per board under `boards/`, so two pull requests conflict only when they change
// the same board: `<Board>.meta.json` (written by a refresh), `<Board>.map.json` (kept by hand) and, for a board a
// story shows, `<Board>.dc.html` (the copy a refresh read).
import { createHash } from 'node:crypto'

import { componentMarkup } from './html.ts'
import { sampleData, SnapshotError, type SampleData } from './sample.ts'

export type Board = { file: string; title: string | null; page: string | null; w: number; h: number }
/** A board copy a refresh read from the canvas: the SHA-256 of its text (CI cannot read the canvas, so a copy with no record, or a changed one, was not put there by a refresh) and the canvas version it was read at, which moves only when the hash does. */
export type Copy = { hash: string; version: string }
/** What the snapshot keeps of one board, in `boards/<Board>.meta.json`: its place on the canvas and, for a board a story shows, its copy's record, sample values and component markup. */
export type BoardMeta = Board & { copy?: Copy; samples?: Record<string, string>; components?: Record<string, string> }
/** The metadata files read together: the boards, the copy hash and the version of each copy. */
export type BoardIndex = { boards: Board[]; copies: Record<string, string>; versions: Record<string, string> }

/** The metadata file of a board, under the snapshot folder. */
export const metaPath = (file: string): string => `boards/${file.replace(/\.dc\.html$/, '')}.meta.json`
export const isMetaFile = (name: string): boolean => name.endsWith('.meta.json')
/** The map entry of a board, under the snapshot folder: kept by hand, so a refresh leaves it. */
export const mapPath = (file: string): string => `boards/${file.replace(/\.dc\.html$/, '')}.map.json`
export const isMapFile = (name: string): boolean => name.endsWith('.map.json')

/** The SHA-256 of a copy with its line endings as LF, so a checkout that writes CRLF (Windows, `core.autocrlf`) holds the same copy. */
export const copyHash = (source: string): string => createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex')
/** How a board relates to Storybook: the story that shows it, how far it is built, or why there is none. Projects may add fields of their own; they are kept as written. */
export type MapEntry = { story?: string; status?: 'implemented' | 'partial' | 'not built'; none?: string; [field: string]: unknown }
export type BoardMap = Record<string, MapEntry>

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The default test for a prototype page: its id or name holds a ticket key (`proto-tck-153`, `Prototype · NOK-12`). */
export const TICKET_PAGE = /\b[a-z]{2,6}-\d+\b/i

/**
 * The artboards of a `project/canvas.json`, sorted by file so two snapshots of one canvas are identical. Positions
 * are not kept, so moving a board is not a change. Boards on a prototype page (`prototype` matches the page's id and
 * name) are not part of the snapshot until they are folded into a main page.
 */
export const boardsOf = (canvas: unknown, prototype: RegExp = TICKET_PAGE): Board[] => {
  if (!isRecord(canvas) || !isRecord(canvas.boards)) throw new SnapshotError('canvas.json has no "boards" object.')
  const boards = Object.entries(canvas.boards).map(([file, entry]) => {
    if (!/\.dc\.html$/.test(file)) throw new SnapshotError(`Board "${file}" is not a .dc.html file.`)
    if (!isRecord(entry) || typeof entry.w !== 'number' || typeof entry.h !== 'number') throw new SnapshotError(`Board "${file}" has no numeric w and h.`)
    return { file, title: typeof entry.title === 'string' ? entry.title : null, page: typeof entry.page === 'string' ? entry.page : null, w: entry.w, h: entry.h }
  })
  if (boards.length === 0) throw new SnapshotError('canvas.json lists no boards.')
  const pages = Array.isArray(canvas.pages) ? canvas.pages.filter(isRecord) : []
  const isPrototype = (id: string | null) => id !== null && prototype.test(`${id} ${String(pages.find(p => p.id === id)?.name ?? '')}`)
  const main = boards.filter(b => !isPrototype(b.page))
  if (main.length === 0) throw new SnapshotError('canvas.json lists no boards outside prototype pages.')
  return main.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
}

/** The canvas's tokens, as committed: any JSON object, written as 2-space JSON. The shape is the project's. */
export const parseTokens = (text: string): Record<string, unknown> => {
  let tokens: unknown
  try {
    tokens = JSON.parse(text)
  } catch {
    throw new SnapshotError('tokens.json is not JSON.')
  }
  if (!isRecord(tokens)) throw new SnapshotError('tokens.json is not a JSON object.')
  return tokens
}

/** Board file → component name → canonical markup, for the boards that mark components. */
export type ComponentData = Record<string, Record<string, string>>

/** The names in boards/ a full refresh deletes and writes again: everything but the hand-kept map entries. */
export const refreshedNames = (names: readonly string[]): string[] => names.filter(n => !isMapFile(n))

/** The board map from the text of each `boards/<Board>.map.json`, by file name. */
export const parseMap = (texts: Record<string, string>): BoardMap =>
  Object.fromEntries(
    Object.entries(texts)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([name, text]) => {
        let entry: unknown
        try {
          entry = JSON.parse(text)
        } catch {
          throw new SnapshotError(`${name} is not JSON.`)
        }
        if (!isRecord(entry)) throw new SnapshotError(`${name} is not a map entry object.`)
        return [
          name
            .split('/')
            .at(-1)!
            .replace(/\.map\.json$/, '.dc.html'),
          entry as MapEntry,
        ]
      }),
  )

/** The boards a story shows: the ones whose copy the snapshot keeps. */
export const screensOf = (map: BoardMap): string[] =>
  Object.entries(map)
    .filter(([, entry]) => entry.story !== undefined)
    .map(([file]) => file)
    .sort()

/** The story-to-board index: story title → the board files it shows, so a reader finds the boards of a changed story without reading every map file. Written from the map files and checked against them. */
export const STORY_INDEX = 'story-index.json'
export type StoryIndex = Record<string, string[]>

/** The story-to-board index of a board map, sorted by story and board so two builds of one map are identical. */
export const storyIndexOf = (map: BoardMap): StoryIndex => {
  const found: StoryIndex = {}
  for (const [file, entry] of Object.entries(map)) if (typeof entry.story === 'string' && entry.story !== '') (found[entry.story] ??= []).push(file)
  return Object.fromEntries(
    Object.entries(found)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([story, files]) => [story, files.sort()]),
  )
}

export type Snapshot = { files: Record<string, string>; metas: BoardMeta[]; boards: BoardIndex; samples: SampleData; components: ComponentData }

export const parseMeta = (text: string, name = 'a metadata file'): BoardMeta => {
  const meta = JSON.parse(text) as unknown
  if (!isRecord(meta) || typeof meta.file !== 'string' || typeof meta.w !== 'number' || typeof meta.h !== 'number') throw new SnapshotError(`${name} has no file, w and h.`)
  if (meta.copy !== undefined && (!isRecord(meta.copy) || typeof meta.copy.hash !== 'string' || typeof meta.copy.version !== 'string')) throw new SnapshotError(`${name}: copy has no hash and version.`)
  return meta as BoardMeta
}

/** The boards, copy hashes and copy versions of the metadata files, sorted by board file. */
export const indexOf = (metas: readonly BoardMeta[]): BoardIndex => {
  const sorted = [...metas].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
  const copied = sorted.filter(m => m.copy !== undefined)
  return {
    boards: sorted.map(({ file, title, page, w, h }) => ({ file, title, page, w, h })),
    copies: Object.fromEntries(copied.map(m => [m.file, m.copy!.hash])),
    versions: Object.fromEntries(copied.map(m => [m.file, m.copy!.version])),
  }
}

/** Board file → sample values, and board file → component markup, of the boards that keep a copy (components only where the board marks some). */
export const samplesOf = (metas: readonly BoardMeta[]): SampleData => Object.fromEntries(metas.filter(m => m.copy !== undefined).map(m => [m.file, m.samples ?? {}]))
export const componentsOf = (metas: readonly BoardMeta[]): ComponentData => Object.fromEntries(metas.filter(m => m.components !== undefined && Object.keys(m.components).length > 0).map(m => [m.file, m.components!]))

/**
 * What a refresh writes, as path (under the snapshot folder) → text: the tokens, a copy of each screen and one
 * metadata file per board. A copy's version is the canvas version it was read at: kept from `previous` while its
 * hash is unchanged, so a refresh leaves the file of a board that did not change as it was. Refuses, writing
 * nothing, a screen the canvas lacks.
 *
 * With `only` (board files) the refresh is partial: it writes just those boards' copies and metadata, and the tokens
 * only when `tokens` is true, so every other board keeps the files and record it has in `existing`, even where the
 * canvas copy has moved on (a pull request that did not change it must not carry another's design). A named board
 * the canvas lacks, or a named screen that was not read, is refused as in a full refresh.
 */
export const buildSnapshot = (input: { canvas: unknown; tokensText: string; version: string; map: BoardMap; read: (file: string) => string | undefined; previous?: (file: string) => BoardMeta | undefined; only?: readonly string[]; tokens?: boolean; existing?: readonly BoardMeta[]; prototype?: RegExp }): Snapshot => {
  const boards = boardsOf(input.canvas, input.prototype)
  const only = input.only === undefined ? undefined : new Set(input.only)
  for (const file of only ?? []) if (!boards.some(b => b.file === file)) throw new SnapshotError(`${file} is named to refresh but is not on the canvas.`)
  const refreshed = only === undefined ? boards : boards.filter(b => only.has(b.file))
  const screens = screensOf(input.map).filter(s => only === undefined || only.has(s))
  const files: Record<string, string> = only === undefined || input.tokens === true ? { 'tokens.json': JSON.stringify(parseTokens(input.tokensText), null, 2) + '\n' } : {}
  const sources: Record<string, string> = {}
  for (const screen of screens) {
    if (!boards.some(b => b.file === screen)) throw new SnapshotError(`${screen} is mapped to a story but is not on the canvas.`)
    const source = input.read(screen)
    if (source === undefined) throw new SnapshotError(`${screen} is mapped to a story but was not read from the canvas: read project/${screen}.`)
    sources[screen] = source
    files[`boards/${screen}`] = source
  }
  const read = (file: string) => sources[file]!
  const samples = sampleData(screens, read)
  const metas: BoardMeta[] = refreshed.map(board => {
    if (sources[board.file] === undefined) return board
    const hash = copyHash(sources[board.file]!)
    const before = input.previous?.(board.file)?.copy
    const meta: BoardMeta = { ...board, copy: { hash, version: before?.hash === hash ? before.version : input.version }, samples: samples[board.file] ?? {} }
    const found = componentMarkup(sources[board.file]!)
    if (Object.keys(found).length > 0) meta.components = found
    return meta
  })
  for (const meta of metas) files[metaPath(meta.file)] = JSON.stringify(meta, null, 2) + '\n'
  const all = only === undefined ? metas : [...(input.existing ?? []).filter(m => !only.has(m.file)), ...metas]
  return { files, metas: all, boards: indexOf(all), samples: samplesOf(all), components: componentsOf(all) }
}

/** The options of `snapshot` from its argv: the folder read and its version, and, for a partial refresh, the named boards (once each) and whether to write the tokens. A `--boards` with no list (or written `--boards=...`) is refused, so it cannot fall through to a full refresh. */
export const snapshotOptions = (argv: readonly string[]): { from: string; version: string; only?: string[]; tokens: boolean } => {
  const flag = (name: string) => {
    const at = argv.indexOf(`--${name}`)
    return at === -1 ? undefined : argv[at + 1]
  }
  const from = flag('from')
  const version = flag('version')
  if (from === undefined || version === undefined) throw new SnapshotError('Usage: drawing-board snapshot --from <folder with project/ and artifact-type/> --version <published version> [--boards A.dc.html,B.dc.html [--tokens]]')
  const asked = argv.some(a => a === '--boards' || a.startsWith('--boards='))
  const named = flag('boards')
  if (asked && (named === undefined || named.startsWith('--'))) throw new SnapshotError('--boards names no board: list the board files after it, as --boards A.dc.html,B.dc.html.')
  const only =
    named === undefined
      ? undefined
      : [
          ...new Set(
            named
              .split(',')
              .map(n => n.trim())
              .filter(n => n !== ''),
          ),
        ]
  if (only?.length === 0) throw new SnapshotError('--boards names no board.')
  const tokens = argv.includes('--tokens')
  if (only === undefined && tokens) throw new SnapshotError('--tokens goes with --boards; a full refresh writes the tokens anyway.')
  return { from, version, ...(only === undefined ? {} : { only }), tokens }
}
