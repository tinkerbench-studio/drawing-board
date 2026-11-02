// A project's drawing-board.config.json: what differs between projects that keep a canvas snapshot.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { SnapshotError } from './sample.ts'
import { TICKET_PAGE } from './snapshot.ts'

export const CONFIG_FILE = 'drawing-board.config.json'

export type Config = {
  /** The canvas artifact's link, recorded in the snapshot's artifact.json. */
  artifact: string
  /** The snapshot folder (holding boards/, tokens.json, story-index.json), resolved from the config file's folder. */
  snapshot: string
  /** Globs of the story files, from the config file's folder; a story's title is its `title: '…'`. */
  stories: string[]
  /** The tokens file inside the folder a refresh reads, under project/. */
  tokens: string
  /** Matched against a page's id and name: boards on a matching page are prototypes, left out of the snapshot. */
  prototypePages: RegExp
  /** A board that shows every token, checked against tokens.json; none when left out. */
  tokensBoard?: string
  /** The project folder: where the config file is. */
  root: string
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The config from its text, with paths resolved from `root`. Refuses a missing or mistyped field, naming it. */
export const parseConfig = (text: string, root: string): Config => {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new SnapshotError(`${CONFIG_FILE} is not JSON.`)
  }
  if (!isRecord(raw)) throw new SnapshotError(`${CONFIG_FILE} is not a JSON object.`)
  const field = (name: string, optional = false): string | undefined => {
    const value = raw[name]
    if (value === undefined && optional) return undefined
    if (typeof value !== 'string' || value === '') throw new SnapshotError(`${CONFIG_FILE}: "${name}" must be a non-empty string.`)
    return value
  }
  const stories = raw.stories
  if (!Array.isArray(stories) || stories.length === 0 || !stories.every(s => typeof s === 'string' && s !== '')) throw new SnapshotError(`${CONFIG_FILE}: "stories" must be a list of globs.`)
  const pages = field('prototypePages', true)
  let prototypePages = TICKET_PAGE
  if (pages !== undefined) {
    try {
      prototypePages = new RegExp(pages, 'i')
    } catch {
      throw new SnapshotError(`${CONFIG_FILE}: "prototypePages" is not a regular expression.`)
    }
  }
  const tokensBoard = field('tokensBoard', true)
  return { artifact: field('artifact')!, snapshot: resolve(root, field('snapshot')!), stories, tokens: field('tokens', true) ?? 'tokens.json', prototypePages, ...(tokensBoard === undefined ? {} : { tokensBoard }), root }
}

/** The config at `path`, or the drawing-board.config.json in the working folder. */
export const loadConfig = (path?: string): Config => {
  const file = resolve(path ?? CONFIG_FILE)
  if (!existsSync(file)) throw new SnapshotError(`${file} was not found: add a ${CONFIG_FILE} to the project (see the drawing-board README), or pass --config <file>.`)
  return parseConfig(readFileSync(file, 'utf8'), dirname(file))
}
