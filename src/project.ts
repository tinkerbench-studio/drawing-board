// One project's snapshot on disk, read through its config: the files, the story titles and the checks.
import { existsSync, globSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { coverageProblems, publishedProblems, snapshotProblems, storyIndexProblems, tokenBoardProblems, UNPUBLISHED_KNOWN, type UnpublishedKnown } from './check.ts'
import type { Config } from './config.ts'
import { componentMarkup } from './html.ts'
import { sampleData } from './sample.ts'
import { componentsOf, indexOf, isMapFile, isMetaFile, parseMap, parseMeta, parseTokens, samplesOf, screensOf, STORY_INDEX, type BoardMap, type BoardMeta } from './snapshot.ts'

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
  return { file, read, map, metas, copies, copy }
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

/** Every problem with the committed snapshot, as lines; empty when it is in step. */
export const checkProblems = (config: Config): string[] => {
  const p = project(config)
  const map = p.map()
  const all = p.metas()
  const screens = screensOf(map)
  const known = existsSync(p.file(UNPUBLISHED_KNOWN)) ? (JSON.parse(p.read(UNPUBLISHED_KNOWN)) as UnpublishedKnown) : {}
  const tokensBoard = config.tokensBoard === undefined ? [] : p.copy(config.tokensBoard) === undefined ? [`${config.tokensBoard} is the tokens board but has no copy in boards/: map it to its story and refresh.`] : tokenBoardProblems(parseTokens(p.read('tokens.json')), p.copy(config.tokensBoard)!)
  return [
    ...tokensBoard,
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

