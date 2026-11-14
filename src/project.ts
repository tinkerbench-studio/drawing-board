// One project's snapshot on disk, read through its config: the files, the story titles and the checks.
import { existsSync, globSync, readdirSync, readFileSync, type Dirent } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'

import { coverageProblems, designSystemWarnings, duplicateBoardProblems, filesInUse, metaCountBound, missingBoardWarnings, unreadBound, noneWarnings, pageProblems, publishedProblems, recordProblems, snapshotProblems, storyIndexProblems, tagWarnings, tokenBoardProblems, UNPUBLISHED_KNOWN, type UnpublishedKnown } from './check.ts'
import { snapshotConfigs, type Config } from './config.ts'
import { outlineProblems, passedSampleProblems, sampleKeyProblems, themeValueProblems, tokenCssProblems } from './extra-checks.ts'
import { componentMarkup } from './html.ts'
import { sampleData } from './sample.ts'
import { ARTIFACT_RECORD, componentsOf, indexOf, isMapFile, isMetaFile, PAGES_FILE, parseMap, parseMeta, parsePages, parseRecord, parseTokens, samplesOf, screensOf, STORY_INDEX, type ArtifactRecord, type BoardMap, type BoardMeta, type Pages } from './snapshot.ts'

/** The files of one project's snapshot, read and written through its config. */
export const project = (config: Config) => {
  const file = (path: string) => join(config.snapshot, path)
  const read = (path: string) => readFileSync(file(path), 'utf8')
  const boardNames = () => (existsSync(file('boards')) ? readdirSync(file('boards')) : [])
  const map = (): BoardMap => parseMap(Object.fromEntries(boardNames().filter(isMapFile).map(n => [n, read(`boards/${n}`)])))
  const metas = (): BoardMeta[] =>
    boardNames()
      .filter(isMetaFile)
      .sort()
      .map(n => parseMeta(read(`boards/${n}`), `boards/${n}`))
  const copies = () => boardNames().filter(n => n.endsWith('.dc.html'))
  const copy = (board: string) => (copies().includes(board) ? read(`boards/${board}`) : undefined)
  /** The snapshot's record of its canvas (`artifact.json`); empty before the first refresh. */
  const record = (): ArtifactRecord => (existsSync(file(ARTIFACT_RECORD)) ? parseRecord(read(ARTIFACT_RECORD)) : {})
  /** The hand-kept pages (`pages.json`), or undefined when the project keeps none. */
  const pages = (): Pages | undefined => (existsSync(file(PAGES_FILE)) ? parsePages(read(PAGES_FILE)) : undefined)
  return { file, read, map, metas, copies, copy, record, pages }
}

/** The title of every story the config's globs find, never looking in node_modules or the built Storybook. */
export const storyTitles = (config: Config): string[] => {
  const titles = new Set<string>()
  const skipped = new Set(['node_modules', '.git', basename(config.storybook)])
  for (const pattern of config.stories)
    for (const path of globSync(pattern, { cwd: config.root, exclude: (name: string) => skipped.has(basename(name)) })) {
      const title = /\btitle:\s*(['"`])(.+?)\1/.exec(readFileSync(join(config.root, path), 'utf8'))?.[2]
      if (title !== undefined) titles.add(title)
    }
  return [...titles].sort()
}

/** The text of every story file the config's globs find, by path. */
const storyTexts = (config: Config): Record<string, string> => {
  const stories: Record<string, string> = {}
  const skipped = new Set(['node_modules', '.git', basename(config.storybook)])
  for (const pattern of config.stories) for (const path of globSync(pattern, { cwd: config.root, exclude: (name: string) => skipped.has(basename(name)) })) stories[path] = readFileSync(join(config.root, path), 'utf8')
  return stories
}

/** The canvas's tokens against the stylesheets the globs find, from the project folder (never node_modules). A glob that finds nothing is a problem, so a moved stylesheet is noticed. */
const tokensCssProblems = (config: Config, tokensText: string, globs: readonly string[]): string[] => {
  const files = globs.flatMap(pattern => globSync(pattern, { cwd: config.root, exclude: (name: string) => name === 'node_modules' }))
  if (files.length === 0) return [`checks.tokensCss: ${globs.join(', ')} found no stylesheet.`]
  return tokenCssProblems(JSON.parse(tokensText), files.map(f => readFileSync(join(config.root, f), 'utf8')).join('\n'))
}

/** Every problem with the committed snapshot, as lines; empty when it is in step. */
export const checkProblems = (config: Config): string[] => {
  const p = project(config)
  const map = p.map()
  const all = p.metas()
  const screens = screensOf(map)
  const known = existsSync(p.file(UNPUBLISHED_KNOWN)) ? (JSON.parse(p.read(UNPUBLISHED_KNOWN)) as UnpublishedKnown) : {}
  // The tokens, and the settings that hold the canvas to them, are the main canvas's: another canvas is not held to them.
  const main = config.canvas.role === 'main'
  const tokensBoard = !main || config.tokensBoard === undefined ? [] : p.copy(config.tokensBoard) === undefined ? [`${config.tokensBoard} is the tokens board but has no copy in boards/: map it to its story and refresh.`] : tokenBoardProblems(parseTokens(p.read('tokens.json')), p.copy(config.tokensBoard)!)
  const copyTexts = () => Object.fromEntries(p.copies().map(f => [f, p.read(`boards/${f}`)]))
  const pages = p.pages()
  const own = [...recordProblems(p.record(), { id: config.canvas.id, artifact: config.artifact }), ...(pages === undefined ? [] : pageProblems(all, pages))]
  const { checks } = config
  const repeated = checks.repeatedSampleKeys ? sampleKeyProblems(copyTexts()) : []
  const extra = [
    ...repeated,
    ...(checks.outlineSelectors ? outlineProblems(map, p.copy) : []),
    ...(checks.passedSamples ? passedSampleProblems(copyTexts()) : []),
    ...(main && checks.tokenThemes ? themeValueProblems(JSON.parse(p.read('tokens.json'))) : []),
    ...(main && checks.tokensCss ? tokensCssProblems(config, p.read('tokens.json'), checks.tokensCss) : []),
  ]
  // A repeated key would stop the snapshot comparison below with a plainer refusal, so say it, and the rest, on its own.
  if (repeated.length > 0) return [...own, ...extra]
  return [
    ...own,
    ...tokensBoard,
    ...extra,
    ...storyIndexProblems(existsSync(p.file(STORY_INDEX)) ? p.read(STORY_INDEX) : undefined, map),
    ...coverageProblems(indexOf(all), map, storyTitles(config), p.copies()),
    ...publishedProblems(indexOf(all), map, p.copy, known),
    ...snapshotProblems(
      { samples: samplesOf(all), components: componentsOf(all) },
      {
        samples: sampleData(
          screens.filter(f => p.copy(f) !== undefined),
          f => p.copy(f)!,
        ),
        components: Object.fromEntries(screens.flatMap(f => (p.copy(f) === undefined ? [] : [[f, componentMarkup(p.copy(f)!)] as const])).filter(([, m]) => Object.keys(m).length > 0)),
      },
    ),
  ]
}


/**
 * The canvas's files against its limit, as `check` says it: the count the last refresh recorded in artifact.json (a
 * lower bound when the record names design systems whose files were not read), else a lower bound from the meta
 * files (plus canvas.json and the tokens).
 */
export const canvasFiles = (config: Config): { line: string; warning: boolean } => {
  const p = project(config)
  const record = p.record()
  const { limits } = config
  const version = record.version === undefined ? {} : { version: record.version }
  return filesInUse(record.files === undefined ? { used: p.metas().length + 2, limits, ...version, bound: metaCountBound(existsSync(p.file(ARTIFACT_RECORD))) } : { used: record.files, limits, ...version, ...(record.unread === undefined ? {} : { bound: unreadBound(record.unread) }) })
}

/**
 * What `check` warns about without failing: few or no free files on the canvas, boards the canvas has that the
 * snapshot does not, design systems not at the version the project expects, a board mapped none that looks built,
 * and `tags` of the wrong shape. Empty when there is nothing to say.
 */
export const checkWarnings = (config: Config): string[] => {
  const p = project(config)
  const record = p.record()
  const map = p.map()
  const files = canvasFiles(config)
  return [...(files.warning ? [files.line] : []), ...missingBoardWarnings(record, p.metas().map(m => m.file)), ...designSystemWarnings(config.designSystems ?? {}, record.designSystems), ...noneWarnings(map, storyTexts(config)), ...tagWarnings(map)]
}

/** A board file with a meta file in the snapshots of two canvases, across every canvas that has a snapshot. */
export const boardNameProblems = (config: Config): string[] => duplicateBoardProblems(Object.fromEntries(snapshotConfigs(config).map(c => [c.canvas.id, project(c).metas().map(m => m.file)])))

/** Every regular file under `<from>/project`, recursively, as a path relative to it with `/` between folders: what a read of the canvas holds. */
export const readFiles = (from: string): string[] => {
  const dir = join(from, 'project')
  if (!existsSync(dir)) return []
  return (readdirSync(dir, { recursive: true, withFileTypes: true }) as Dirent[])
    .filter(entry => entry.isFile())
    .map(entry => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort()
}
