#!/usr/bin/env node
// drawing-board <snapshot|check|index|report> [--config <file>]: the committed snapshot of a design canvas.
// drawing-board <story-shot|compare-pictures> …: pictures for a UX change, with no config.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { CONFIG_FILE, LEGACY_CONFIG_FILE, loadConfig, type Config } from './config.ts'
import { compareOptions, storyShotOptions } from './pictures.ts'
import { loadHooks } from './hooks.ts'
import { checkProblems, checkWarnings, project, storyTitles } from './project.ts'
import { SnapshotError } from './sample.ts'
import { buildSnapshot, metaPath, notCopiedNotes, refreshedNames, screensOf, snapshotOptions, STORY_INDEX, storyIndexOf } from './snapshot.ts'

const flag = (argv: readonly string[], name: string) => {
  const at = argv.indexOf(`--${name}`)
  return at === -1 ? undefined : argv[at + 1]
}

const snapshot = (config: Config, argv: readonly string[]) => {
  const { from, version, only, tokens } = snapshotOptions(argv)
  if (config.artifact === null) throw new SnapshotError(`No canvas link yet: set "artifact" in ${CONFIG_FILE} (or ${LEGACY_CONFIG_FILE}) for the first snapshot (later ones read it from artifact.json).`)
  const p = project(config)
  const map = p.map()
  const read = (path: string) => (existsSync(join(from, 'project', path)) ? readFileSync(join(from, 'project', path), 'utf8') : undefined)
  const canvasText = read('canvas.json')
  if (canvasText === undefined) throw new SnapshotError(`${from}/project/canvas.json was not read.`)
  const tokensText = read(config.tokens)
  if (tokensText === undefined) throw new SnapshotError(`${from}/project/${config.tokens} was not read.`)
  for (const note of notCopiedNotes(only ?? [], map)) console.warn(`warning: ${note}`)
  const before = new Map(p.metas().map(m => [m.file, m]))
  const snap = buildSnapshot({ canvas: JSON.parse(canvasText), tokensText, version, map, read, previous: f => before.get(f), only, tokens, existing: [...before.values()], prototype: config.prototypePages })
  const runtime = join(from, 'artifact-type/dc-runtime.js')
  if (only === undefined && !existsSync(runtime)) throw new SnapshotError(`${runtime} was not read: boards render offline only with the canvas runtime.`)
  // The snapshot is only touched once everything above has been read, so a refusal there leaves the old one.
  // The map entries are kept by hand, not read from the canvas: the refresh leaves them.
  // A partial refresh clears only the named boards' files; every other board's files are left byte for byte.
  const stale = (only ?? []).flatMap(f => [f, metaPath(f).replace(/^boards\//, '')])
  const boards = existsSync(p.file('boards')) ? readdirSync(p.file('boards')) : []
  for (const name of only === undefined ? refreshedNames(boards) : stale) rmSync(p.file(`boards/${name}`), { recursive: true, force: true })
  mkdirSync(p.file('boards'), { recursive: true })
  for (const [path, text] of Object.entries({ ...snap.files, 'artifact.json': JSON.stringify({ artifact: config.artifact }, null, 2) + '\n', [STORY_INDEX]: JSON.stringify(storyIndexOf(map), null, 2) + '\n' })) {
    mkdirSync(dirname(p.file(path)), { recursive: true })
    writeFileSync(p.file(path), text)
  }
  if (only === undefined) writeFileSync(p.file('boards/support.js'), readFileSync(runtime))
  const moved = snap.metas.filter(m => m.copy !== undefined && before.get(m.file)?.copy?.hash !== m.copy.hash).length
  if (only !== undefined) console.log(`Partial snapshot of ${config.artifact} version ${version}: ${only.length} named boards rewritten, ${moved} of them changed (and now at ${version}); every other board left as committed.`)
  else console.log(`Snapshot of ${config.artifact} version ${version}: ${snap.boards.boards.length} boards, ${screensOf(map).length} copied, ${moved} of them changed (and now at ${version}).`)
}

/** The package's checks, then the project's own from its `checks()` hook. */
const check = async (config: Config) => {
  const hooks = await loadHooks(config)
  const problems = [...checkProblems(config), ...((await hooks.checks?.({ config, canvas: project(config) })) ?? [])]
  for (const warning of checkWarnings(config)) console.warn(`warning: ${warning}`)
  if (problems.length > 0) {
    console.error(problems.map(problem => `- ${problem}`).join('\n'))
    process.exitCode = 1
  } else console.log('The design canvas snapshot is in step.')
}

/** Rewrites story-index.json from the map files alone (no canvas needed), after a map file is edited or a merge touched them. */
const storyIndex = (config: Config) => {
  const p = project(config)
  writeFileSync(p.file(STORY_INDEX), JSON.stringify(storyIndexOf(p.map()), null, 2) + '\n')
  console.log(`Wrote ${STORY_INDEX} from the boards/*.map.json files.`)
}

const report = (config: Config) => {
  const map = project(config).map()
  const shown = new Set(Object.values(map).map(e => e.story))
  const without = Object.entries(map).filter(([, e]) => e.story === undefined)
  const unshown = storyTitles(config).filter(t => !shown.has(t))
  console.log(['# Boards with no story', '', ...(without.length ? without.map(([f, e]) => `- ${f}: ${String(e.none)}`) : ['_none_']), '', '# Stories no board points at', '', ...(unshown.length ? unshown.map(t => `- ${t}`) : ['_none_']), ''].join('\n'))
}

const USAGE = `Usage: drawing-board <snapshot|check|index|report> [--config <file>]
       drawing-board annotate [--board <Board>.dc.html] [--storybook <dir>] [--story-id <id>] [--width N] [--theme light|dark] [--out <dir>]
       (board-shot is the same command under its earlier name)
       drawing-board layout [--board <Board>.dc.html] [--storybook <dir>] [--story-id <id>] [--width N] [--tolerance N] [--attr <attribute>] [--origin <selector>] [--out <dir>]
       drawing-board compare [--storybook <dir>]
       drawing-board page-shots [--out <dir>] [--theme <theme>] [--only page,page] [--mark <selector>]
       drawing-board story-shot <storybook-static-dir> <story-id> <out.png> [--width N] [--theme light|dark] | --list
       drawing-board compare-pictures <before-dir> <after-dir> <out-dir> [--from-x N] [--left BEFORE] [--right AFTER]
Settings come from the nearest ${CONFIG_FILE} (or ${LEGACY_CONFIG_FILE}), every one defaulted (see the README).`

/** The browser commands load the browser code only when they run, so the snapshot commands never need playwright-core. */
const browserCommand = async (command: string, argv: readonly string[], config: () => Config) => {
  if (command === 'story-shot') return (await import('./pictures-run.ts')).storyShot(storyShotOptions(argv))
  if (command === 'compare-pictures') return void (await (await import('./pictures-run.ts')).comparePictures(compareOptions(argv)))
  if (command === 'layout') {
    const run = await import('./layout-run.ts')
    return void console.log((await run.layout(config(), run.layoutOptions(argv))).report)
  }
  const run = await import('./board-shot-run.ts')
  if (command === 'compare') return void console.log(await run.compareStories(config(), flag(argv, 'storybook')))
  if (command === 'page-shots') return void (await run.pageShots(config(), run.pageShotsOptions(argv)))
  const { made, failed } = await run.boardShots(config(), run.boardShotOptions(argv))
  console.log(made.join('\n'))
  if (failed.length > 0) throw new Error(`Not made:\n${failed.map(f => `- ${f}`).join('\n')}`)
}

const BROWSER_COMMANDS = new Set(['story-shot', 'compare-pictures', 'annotate', 'board-shot', 'layout', 'compare', 'page-shots'])

const main = async (argv: readonly string[]) => {
  const [command = '', ...rest] = argv
  const config = () => loadConfig(flag(argv, 'config'))
  if (BROWSER_COMMANDS.has(command)) {
    try {
      return await browserCommand(command, rest, config)
    } catch (error) {
      console.error((error as Error).message)
      process.exitCode = 1
      return
    }
  }
  if (command === 'snapshot') return snapshot(config(), argv)
  if (command === 'check') return await check(config())
  if (command === 'index') return storyIndex(config())
  if (command === 'report') return report(config())
  console.error(USAGE)
  process.exitCode = 2
}

try {
  await main(process.argv.slice(2))
} catch (error) {
  if (!(error instanceof SnapshotError)) throw error
  console.error(error.message)
  process.exitCode = 1
}
