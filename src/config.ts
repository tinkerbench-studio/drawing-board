// A project's `.drawing-board` file: convention over configuration. Every field has a default, so a project laid out
// the conventional way needs no file; the file names only what differs. Found by walking up from the working folder.
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

import { SnapshotError } from './sample.ts'
import { TICKET_PAGE } from './snapshot.ts'

/** The preferred name of a project's config file. */
export const CONFIG_FILE = 'drawing-board.config.json'
/** The earlier name, still read for compatibility: used when the preferred file is not in the same folder. */
export const LEGACY_CONFIG_FILE = '.drawing-board'
/** Both names, preferred first. */
export const CONFIG_FILES = [CONFIG_FILE, LEGACY_CONFIG_FILE] as const

/** The optional generic checks `drawing-board check` runs when a project turns them on; every one is off by default. */
export const CHECK_FLAGS = ['repeatedSampleKeys', 'outlineSelectors', 'passedSamples', 'tokenThemes'] as const
export type Checks = { [flag in (typeof CHECK_FLAGS)[number]]?: true } & {
  /** Globs (from the project folder) of the stylesheets the canvas's tokens are held to; none turns the check off. */
  tokensCss?: string[]
}

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
  /** The optional generic checks turned on (the `checks` setting); none by default. */
  checks: Checks
  /** The themes `page-shots` draws each page in, set as `data-theme` on `<html>`; none draws the page as it is. */
  themes: string[]
  /** The project's hook module, absolute, when set; else found by convention in the snapshot folder (hooks.ts). */
  hooks?: string
  /** The project folder: where `.drawing-board` is, or the working folder when there is none. */
  root: string
}

const KNOWN = new Set(['artifact', 'snapshot', 'stories', 'tokens', 'prototypePages', 'tokensBoard', 'storybook', 'out', 'differences', 'themes', 'hooks', 'checks'])

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The artifact the last snapshot recorded, if any. */
const recordedArtifact = (snapshot: string): string | null => {
  const file = join(snapshot, 'artifact.json')
  if (!existsSync(file)) return null
  const artifact = (JSON.parse(readFileSync(file, 'utf8')) as { artifact?: unknown }).artifact
  return typeof artifact === 'string' ? artifact : null
}

const parseChecks = (value: unknown, name: string): Checks => {
  if (value === undefined) return {}
  if (!isRecord(value)) throw new SnapshotError(`${name}: "checks" must be an object naming the checks to run (${[...CHECK_FLAGS, 'tokensCss'].join(', ')}).`)
  const checks: Checks = {}
  for (const [key, flag] of Object.entries(value)) {
    if (key === 'tokensCss') {
      if (!Array.isArray(flag) || flag.length === 0 || !flag.every(g => typeof g === 'string' && g !== '')) throw new SnapshotError(`${name}: "checks.tokensCss" must be a list of stylesheet globs.`)
      checks.tokensCss = flag as string[]
    } else if ((CHECK_FLAGS as readonly string[]).includes(key)) {
      if (typeof flag !== 'boolean') throw new SnapshotError(`${name}: "checks.${key}" must be true or false.`)
      if (flag) (checks as Record<string, true>)[key] = true
    } else throw new SnapshotError(`${name}: "checks.${key}" is not a check (${[...CHECK_FLAGS, 'tokensCss'].join(', ')}).`)
  }
  return checks
}

/** The config from the file's text (empty for no file), every field defaulted, paths resolved from `root`. Refuses a field it does not know or one of the wrong type, naming it. */
export const parseConfig = (text: string, root: string, name: string = CONFIG_FILE): Config => {
  let raw: unknown = {}
  if (text.trim() !== '') {
    try {
      raw = JSON.parse(text)
    } catch {
      throw new SnapshotError(`${name} is not JSON.`)
    }
  }
  if (!isRecord(raw)) throw new SnapshotError(`${name} is not a JSON object.`)
  for (const key of Object.keys(raw)) if (!KNOWN.has(key)) throw new SnapshotError(`${name}: "${key}" is not a setting (${[...KNOWN].join(', ')}).`)
  const field = (name: string): string | undefined => {
    const value = raw[name]
    if (value === undefined) return undefined
    if (typeof value !== 'string' || value === '') throw new SnapshotError(`${name}: "${name}" must be a non-empty string.`)
    return value
  }
  const stories = raw.stories ?? DEFAULTS.stories
  if (!Array.isArray(stories) || stories.length === 0 || !stories.every(s => typeof s === 'string' && s !== '')) throw new SnapshotError(`${name}: "stories" must be a list of globs.`)
  const pages = field('prototypePages')
  let prototypePages = TICKET_PAGE
  if (pages !== undefined) {
    try {
      prototypePages = new RegExp(pages, 'i')
    } catch {
      throw new SnapshotError(`${name}: "prototypePages" is not a regular expression.`)
    }
  }
  const themes = raw.themes ?? []
  if (!Array.isArray(themes) || !themes.every(s => typeof s === 'string' && /^[a-z][a-z0-9-]*$/.test(s))) throw new SnapshotError(`${name}: "themes" must be a list of theme names, such as ["dark", "light"].`)
  const checks = parseChecks(raw.checks, name)
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
    checks,
    themes: themes as string[],
    ...(hooks === undefined ? {} : { hooks: resolve(root, hooks) }),
    root,
  }
}

/** The nearest config file at or above `from`, or undefined. In one folder the preferred name wins over the legacy one. */
export const findConfig = (from: string): string | undefined => {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    for (const name of CONFIG_FILES) if (existsSync(join(dir, name))) return join(dir, name)
    if (dirname(dir) === dir) return undefined
  }
}

/** The config at `path`; else the nearest config file above the working folder; else every default, from the working folder. */
export const loadConfig = (path?: string): Config => {
  if (path !== undefined && !existsSync(path)) throw new SnapshotError(`${resolve(path)} was not found.`)
  const file = path === undefined ? findConfig(process.cwd()) : resolve(path)
  return file === undefined ? parseConfig('', process.cwd()) : parseConfig(readFileSync(file, 'utf8'), dirname(file), basename(file))
}
