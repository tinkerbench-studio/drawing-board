// A project's `.drawing-board` file: convention over configuration. Every field has a default, so a project laid out
// the conventional way needs no file; the file names only what differs. Found by walking up from the working folder.
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

import { SnapshotError } from './sample.ts'
import { DEFAULT_PICTURE_FOLDERS, DEFAULT_UI_PATHS } from './evidence.ts'
import { ARTIFACT_RECORD, parseRecord, TICKET_PAGE } from './snapshot.ts'

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

/** What a canvas holds: the designs that are built (`main`), designs under way (`prototypes`), or boards that are not app screens (`reference`). */
export const CANVAS_ROLES = ['main', 'prototypes', 'reference'] as const
export type CanvasRole = (typeof CANVAS_ROLES)[number]

/**
 * One canvas of the project, resolved: its id, role, link (the setting, else the one its snapshot recorded), its
 * snapshot folder (absolute; a `prototypes` canvas has none) and its test for prototype pages.
 */
export type Canvas = { id: string; role: CanvasRole; artifact: string | null; snapshot?: string; prototypePages: RegExp }

/** How many files a canvas may hold (`project/*`, recursively), and how few free ones are worth a warning. */
export type Limits = { files: number; headroom: number }
/** A Design canvas refuses a publish over 512 files of its own; a warning comes when fewer than 16 are free. */
export const DEFAULT_LIMITS: Limits = { files: 512, headroom: 16 }

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
  /** Regular expression sources for the paths a person sees; `evidence-check` asks for pictures when a change touches one (the `uiPaths` setting). */
  uiPaths: string[]
  /** Folders (from the project folder, ending in `/`) where a committed picture is refused: pictures are uploaded (the `pictureFolders` setting). */
  pictureFolders: string[]
  /** The project's hook module, absolute, when set; else found by convention in the snapshot folder (hooks.ts). */
  hooks?: string
  /** The project folder: where `.drawing-board` is, or the working folder when there is none. */
  root: string
  /** The canvas this config is for: `artifact`, `snapshot` and `prototypePages` are its own. */
  canvas: { id: string; role: CanvasRole }
  /** Every canvas of the project, resolved; one `main` canvas when the file has no `canvases`. */
  canvases: Canvas[]
  /** The design systems every canvas should have installed, namespace → version (the `designSystems` setting). */
  designSystems?: Record<string, string>
  /** The canvas's file limit and the free files below which `check` warns (the `limits` setting). */
  limits: Limits
}

const KNOWN = new Set(['artifact', 'snapshot', 'stories', 'tokens', 'prototypePages', 'tokensBoard', 'storybook', 'out', 'differences', 'themes', 'hooks', 'checks', 'canvases', 'designSystems', 'limits', 'uiPaths', 'pictureFolders'])
const CANVAS_FIELDS = new Set(['id', 'role', 'artifact', 'snapshot', 'prototypePages'])

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The artifact the last snapshot recorded, if any. */
const recordedArtifact = (snapshot: string): string | null => {
  const file = join(snapshot, ARTIFACT_RECORD)
  if (!existsSync(file)) return null
  return parseRecord(readFileSync(file, 'utf8')).artifact ?? null
}

const pattern = (value: string | undefined, where: string): RegExp | undefined => {
  if (value === undefined) return undefined
  try {
    return new RegExp(value, 'i')
  } catch {
    throw new SnapshotError(`${where}: "prototypePages" is not a regular expression.`)
  }
}

/** A canvas as the file states it, before its paths and link are resolved. */
type CanvasSetting = { id: string; role: CanvasRole; artifact?: string; snapshot?: string; prototypePages?: string }

const parseCanvases = (value: unknown, name: string): CanvasSetting[] => {
  const shape = '{ "id", "role" (main, prototypes or reference), "artifact", "snapshot"?, "prototypePages"? }'
  if (!Array.isArray(value) || value.length === 0) throw new SnapshotError(`${name}: "canvases" must be a list of canvases, each ${shape}.`)
  const canvases = value.map((entry, at): CanvasSetting => {
    const where = `${name}: canvases[${at}]`
    if (!isRecord(entry)) throw new SnapshotError(`${where} is not an object: each canvas is ${shape}.`)
    for (const key of Object.keys(entry)) if (!CANVAS_FIELDS.has(key)) throw new SnapshotError(`${where}: "${key}" is not a canvas setting (${[...CANVAS_FIELDS].join(', ')}).`)
    const { id, role } = entry
    if (typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id)) throw new SnapshotError(`${where}: "id" must be a lowercase name, such as "main" or "reference".`)
    if (typeof role !== 'string' || !(CANVAS_ROLES as readonly string[]).includes(role)) throw new SnapshotError(`${where} ("${id}"): "role" must be one of ${CANVAS_ROLES.join(', ')}.`)
    const text = (key: string, required: boolean): string | undefined => {
      const field = entry[key]
      if (field === undefined && !required) return undefined
      if (typeof field !== 'string' || field === '') throw new SnapshotError(`${where} ("${id}"): "${key}" must be a non-empty string.`)
      return field
    }
    const artifact = text('artifact', true)
    const snapshot = text('snapshot', false)
    const prototypePages = text('prototypePages', false)
    if (role === 'prototypes' && snapshot !== undefined) throw new SnapshotError(`${where} ("${id}"): a prototypes canvas has no snapshot, since prototypes are never read into one: remove "snapshot".`)
    return { id, role: role as CanvasRole, artifact, ...(snapshot === undefined ? {} : { snapshot }), ...(prototypePages === undefined ? {} : { prototypePages }) }
  })
  const ids = canvases.map(c => c.id)
  const repeated = ids.find((id, at) => ids.indexOf(id) !== at)
  if (repeated !== undefined) throw new SnapshotError(`${name}: the canvas id "${repeated}" is used twice; each canvas has its own.`)
  const count = (role: CanvasRole) => canvases.filter(c => c.role === role).length
  if (count('main') !== 1) throw new SnapshotError(`${name}: "canvases" must have exactly one canvas with the role main (it has ${count('main')}).`)
  if (count('prototypes') > 1) throw new SnapshotError(`${name}: "canvases" may have at most one canvas with the role prototypes (it has ${count('prototypes')}).`)
  return canvases
}

const parseDesignSystems = (value: unknown, name: string): Record<string, string> | undefined => {
  if (value === undefined) return undefined
  if (!isRecord(value) || !Object.entries(value).every(([k, v]) => k !== '' && typeof v === 'string' && v !== '')) throw new SnapshotError(`${name}: "designSystems" must be an object of design system namespace to version, such as { "acme": "3" }.`)
  return Object.fromEntries(Object.entries(value as Record<string, string>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

const parseLimits = (value: unknown, name: string): Limits => {
  if (value === undefined) return { ...DEFAULT_LIMITS }
  if (!isRecord(value)) throw new SnapshotError(`${name}: "limits" must be an object, such as { "files": 512, "headroom": 16 }.`)
  const limits = { ...DEFAULT_LIMITS }
  for (const [key, number] of Object.entries(value)) {
    if (key !== 'files' && key !== 'headroom') throw new SnapshotError(`${name}: "limits.${key}" is not a limit (files, headroom).`)
    if (typeof number !== 'number' || !Number.isInteger(number) || number < (key === 'files' ? 1 : 0)) throw new SnapshotError(`${name}: "limits.${key}" must be a whole number${key === 'files' ? ' above 0' : ', 0 or more'}.`)
    limits[key] = number
  }
  return limits
}

/** A list of non-empty strings, or the default when the setting is left out. */
const stringList = (value: unknown, fallback: readonly string[], setting: string, name: string): string[] => {
  if (value === undefined) return [...fallback]
  if (!Array.isArray(value) || value.length === 0 || !value.every(v => typeof v === 'string' && v !== '')) throw new SnapshotError(`${name}: "${setting}" must be a non-empty list of strings.`)
  return value as string[]
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

/**
 * The config from the file's text (empty for no file), every field defaulted, paths resolved from `root`, for the
 * canvas `canvasId` (the main one when left out). Refuses a field it does not know or one of the wrong type, naming
 * it, an unknown canvas, naming the ones there are, and a canvas with no snapshot.
 */
export const parseConfig = (text: string, root: string, name: string = CONFIG_FILE, canvasId?: string): Config => {
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
  const prototypePages = pattern(field('prototypePages'), name) ?? TICKET_PAGE
  const themes = raw.themes ?? []
  if (!Array.isArray(themes) || !themes.every(s => typeof s === 'string' && /^[a-z][a-z0-9-]*$/.test(s))) throw new SnapshotError(`${name}: "themes" must be a list of theme names, such as ["dark", "light"].`)
  const checks = parseChecks(raw.checks, name)
  if (raw.canvases !== undefined) for (const key of ['artifact', 'snapshot']) if (raw[key] !== undefined) throw new SnapshotError(`${name}: "${key}" goes on each canvas in "canvases", not at the top level: move it into the canvas it belongs to.`)
  const settings: CanvasSetting[] =
    raw.canvases === undefined
      ? [{ id: 'main', role: 'main', ...(raw.artifact === undefined ? {} : { artifact: field('artifact')! }), snapshot: field('snapshot') ?? DEFAULTS.snapshot }]
      : parseCanvases(raw.canvases, name)
  const canvases: Canvas[] = settings.map(c => {
    const snapshot = c.role === 'main' ? resolve(root, c.snapshot ?? DEFAULTS.snapshot) : c.snapshot === undefined ? undefined : resolve(root, c.snapshot)
    return {
      id: c.id,
      role: c.role,
      artifact: c.artifact ?? (snapshot === undefined ? null : recordedArtifact(snapshot)),
      ...(snapshot === undefined ? {} : { snapshot }),
      prototypePages: pattern(c.prototypePages, `${name}: the canvas "${c.id}"`) ?? prototypePages,
    }
  })
  const main = canvases.find(c => c.role === 'main')!
  const snapshot = main.snapshot!
  const tokensBoard = field('tokensBoard')
  const hooks = field('hooks')
  const designSystems = parseDesignSystems(raw.designSystems, name)
  const uiPaths = stringList(raw.uiPaths, DEFAULT_UI_PATHS, 'uiPaths', name)
  for (const source of uiPaths) {
    try {
      new RegExp(source)
    } catch {
      throw new SnapshotError(`${name}: "uiPaths" holds "${source}", which is not a regular expression.`)
    }
  }
  const pictureFolders = stringList(raw.pictureFolders, DEFAULT_PICTURE_FOLDERS, 'pictureFolders', name)
  const config = {
    artifact: main.artifact,
    snapshot,
    stories: stories as string[],
    tokens: field('tokens') ?? DEFAULTS.tokens,
    prototypePages: main.prototypePages,
    ...(tokensBoard === undefined ? {} : { tokensBoard }),
    storybook: resolve(root, field('storybook') ?? DEFAULTS.storybook),
    out: resolve(root, field('out') ?? DEFAULTS.out),
    differences: resolve(root, field('differences') ?? join(snapshot, 'differences')),
    checks,
    themes: themes as string[],
    uiPaths,
    pictureFolders,
    ...(hooks === undefined ? {} : { hooks: resolve(root, hooks) }),
    ...(designSystems === undefined ? {} : { designSystems }),
    root,
  }
  const loaded = withFields(config, main, canvases, parseLimits(raw.limits, name))
  return canvasId === undefined ? loaded : withCanvas(loaded, canvasId)
}

/** The nearest config file at or above `from`, or undefined. In one folder the preferred name wins over the legacy one. */
export const findConfig = (from: string): string | undefined => {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    for (const name of CONFIG_FILES) if (existsSync(join(dir, name))) return join(dir, name)
    if (dirname(dir) === dir) return undefined
  }
}

/** The config at `path`; else the nearest config file above the working folder; else every default, from the working folder. For the canvas `canvasId`, the main one when left out. */
export const loadConfig = (path?: string, canvasId?: string): Config => {
  if (path !== undefined && !existsSync(path)) throw new SnapshotError(`${resolve(path)} was not found.`)
  const file = path === undefined ? findConfig(process.cwd()) : resolve(path)
  return file === undefined ? parseConfig('', process.cwd(), CONFIG_FILE, canvasId) : parseConfig(readFileSync(file, 'utf8'), dirname(file), basename(file), canvasId)
}

/** A config for each canvas that has a snapshot, main first, the others in the order the file lists them. */
export const snapshotConfigs = (config: Config): Config[] => [config.canvases.find(c => c.role === 'main')!, ...config.canvases.filter(c => c.role !== 'main')].filter(c => c.snapshot !== undefined).map(c => withCanvas(config, c.id))

/** A config with its chosen canvas, every canvas and the limits, as ordinary fields. */
const withFields = (fields: Omit<Config, 'canvas' | 'canvases' | 'limits'>, chosen: Canvas, canvases: Canvas[], limits: Limits): Config => ({ ...fields, canvas: { id: chosen.id, role: chosen.role }, canvases, limits })

/** The same config for another of its canvases: its link, snapshot and prototype pages, and `differences` when that follows the snapshot. */
export const withCanvas = (config: Config, canvasId: string): Config => {
  const chosen = config.canvases.find(c => c.id === canvasId)
  if (chosen === undefined) throw new SnapshotError(`There is no canvas "${canvasId}": the canvases are ${config.canvases.map(c => c.id).join(', ')}.`)
  if (chosen.snapshot === undefined) throw new SnapshotError(`The canvas "${chosen.id}" (${chosen.role}) has no snapshot${chosen.role === 'prototypes' ? ': prototypes are never read into one' : ': set its "snapshot" to keep one'}.`)
  const followed = config.differences === join(config.snapshot, 'differences')
  const next = { ...config, artifact: chosen.artifact, snapshot: chosen.snapshot, prototypePages: chosen.prototypePages, differences: followed ? join(chosen.snapshot, 'differences') : config.differences }
  return withFields(next, chosen, config.canvases, config.limits)
}

/**
 * The canvas `--canvas <id>` names in a command's argv, or undefined when there is none. Refuses `--canvas` with no id,
 * one followed by another flag, and the `--canvas=<id>` form, so a typo cannot fall back to the main canvas (a full
 * refresh would then write another canvas's read over the main snapshot).
 */
export const canvasOption = (argv: readonly string[]): string | undefined => {
  if (argv.some(a => a.startsWith('--canvas='))) throw new SnapshotError('Write --canvas <id>, with a space: --canvas=<id> is not read.')
  const at = argv.indexOf('--canvas')
  if (at === -1) return undefined
  const id = argv[at + 1]
  if (id === undefined || id.startsWith('--')) throw new SnapshotError('--canvas names no canvas: put its id after it, as --canvas reference.')
  return id
}
