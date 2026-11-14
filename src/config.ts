// A project's `.drawing-board` file: convention over configuration. Every field has a default, so a project laid out
// the conventional way needs no file; the file names only what differs. Found by walking up from the working folder.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { SnapshotError } from './sample.ts'
import { TICKET_PAGE } from './snapshot.ts'

export const CONFIG_FILE = '.drawing-board'

/** The conventions: what a project gets for each field it leaves out. */
export const DEFAULTS = {
  snapshot: 'design/canvas',
  stories: ['**/*.stories.{ts,tsx,js,jsx,mdx}'],
  tokens: 'tokens.json',
  storybook: 'storybook-static',
  out: 'reports/design-canvas',
} as const

export type Config = {
  /** The canvas artifact's link: the file's, else the one the last snapshot recorded in `artifact.json`; null before the first snapshot. */
  artifact: string | null
  /** The snapshot folder (boards/, tokens.json, story-index.json, differences/), absolute. */
  snapshot: string
  /** Globs of the story files, from the project folder (node_modules is never searched); a story's title is its `title: '…'`. */
  stories: string[]
  /** The tokens file under project/ in the folder a refresh reads. */
  tokens: string
  /** Matched against a page's id and name: boards on a matching page are prototypes, left out of the snapshot. */
  prototypePages: RegExp
  /** A board that shows every token, checked against tokens.json; none when left out. */
  tokensBoard?: string
  /** The built Storybook the picture and comparison commands read, absolute. */
  storybook: string
  /** Where the picture and comparison commands write, absolute. */
  out: string
  /** Where each board's differences file (`<Board>.json`) lives, absolute; the snapshot's `differences/` folder unless set. */
  differences: string
  /** The themes `page-shots` draws each page in, set as `data-theme` on `<html>`; none draws the page as it is. */
  themes: string[]
  /** The project's hook module, absolute, when set; else found by convention in the snapshot folder (hooks.ts). */
  hooks?: string
  /** The project folder: where `.drawing-board` is, or the working folder when there is none. */
  root: string
}

const KNOWN = new Set(['artifact', 'snapshot', 'stories', 'tokens', 'prototypePages', 'tokensBoard', 'storybook', 'out', 'differences', 'themes', 'hooks'])

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The artifact the last snapshot recorded, if any. */
const recordedArtifact = (snapshot: string): string | null => {
  const file = join(snapshot, 'artifact.json')
  if (!existsSync(file)) return null
  const artifact = (JSON.parse(readFileSync(file, 'utf8')) as { artifact?: unknown }).artifact
  return typeof artifact === 'string' ? artifact : null
}

/** The config from the file's text (empty for no file), every field defaulted, paths resolved from `root`. Refuses a field it does not know or one of the wrong type, naming it. */
export const parseConfig = (text: string, root: string): Config => {
  let raw: unknown = {}
  if (text.trim() !== '') {
    try {
      raw = JSON.parse(text)
    } catch {
      throw new SnapshotError(`${CONFIG_FILE} is not JSON.`)
    }
  }
  if (!isRecord(raw)) throw new SnapshotError(`${CONFIG_FILE} is not a JSON object.`)
  for (const key of Object.keys(raw)) if (!KNOWN.has(key)) throw new SnapshotError(`${CONFIG_FILE}: "${key}" is not a setting (${[...KNOWN].join(', ')}).`)
  const field = (name: string): string | undefined => {
    const value = raw[name]
    if (value === undefined) return undefined
    if (typeof value !== 'string' || value === '') throw new SnapshotError(`${CONFIG_FILE}: "${name}" must be a non-empty string.`)
    return value
  }
  const stories = raw.stories ?? DEFAULTS.stories
  if (!Array.isArray(stories) || stories.length === 0 || !stories.every(s => typeof s === 'string' && s !== '')) throw new SnapshotError(`${CONFIG_FILE}: "stories" must be a list of globs.`)
  const pages = field('prototypePages')
  let prototypePages = TICKET_PAGE
  if (pages !== undefined) {
    try {
      prototypePages = new RegExp(pages, 'i')
    } catch {
      throw new SnapshotError(`${CONFIG_FILE}: "prototypePages" is not a regular expression.`)
    }
  }
  const themes = raw.themes ?? []
  if (!Array.isArray(themes) || !themes.every(s => typeof s === 'string' && /^[a-z][a-z0-9-]*$/.test(s))) throw new SnapshotError(`${CONFIG_FILE}: "themes" must be a list of theme names, such as ["dark", "light"].`)
  const snapshot = resolve(root, field('snapshot') ?? DEFAULTS.snapshot)
  const tokensBoard = field('tokensBoard')
  const hooks = field('hooks')
  return {
    artifact: field('artifact') ?? recordedArtifact(snapshot),
    snapshot,
    stories: stories as string[],
    tokens: field('tokens') ?? DEFAULTS.tokens,
    prototypePages,
    ...(tokensBoard === undefined ? {} : { tokensBoard }),
    storybook: resolve(root, field('storybook') ?? DEFAULTS.storybook),
    out: resolve(root, field('out') ?? DEFAULTS.out),
    differences: resolve(root, field('differences') ?? join(snapshot, 'differences')),
    themes: themes as string[],
    ...(hooks === undefined ? {} : { hooks: resolve(root, hooks) }),
    root,
  }
}

/** The nearest `.drawing-board` at or above `from`, or undefined. */
export const findConfig = (from: string): string | undefined => {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    if (existsSync(join(dir, CONFIG_FILE))) return join(dir, CONFIG_FILE)
    if (dirname(dir) === dir) return undefined
  }
}

/** The config at `path`; else the nearest `.drawing-board` above the working folder; else every default, from the working folder. */
export const loadConfig = (path?: string): Config => {
  if (path !== undefined && !existsSync(path)) throw new SnapshotError(`${resolve(path)} was not found.`)
  const file = path === undefined ? findConfig(process.cwd()) : resolve(path)
  return file === undefined ? parseConfig('', process.cwd()) : parseConfig(readFileSync(file, 'utf8'), dirname(file))
}
