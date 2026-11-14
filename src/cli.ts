#!/usr/bin/env node
// drawing-board <snapshot|check|index|report|status|find> [--config <file>] [--canvas <id>]: the committed snapshot of a design canvas.
// drawing-board <story-shot|compare-pictures> …: pictures for a UX change, with no config.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { CONFIG_FILE, LEGACY_CONFIG_FILE, loadConfig, snapshotConfigs, type Config } from './config.ts'
import { findBoards } from './find.ts'
import { compareOptions, storyShotOptions } from './pictures.ts'
import { loadHooks } from './hooks.ts'
import { boardNameProblems, canvasFileCount, canvasFiles, checkProblems, checkWarnings, project, storyTitles } from './project.ts'
import { SnapshotError } from './sample.ts'
import { ARTIFACT_RECORD, boardsOf, buildSnapshot, designSystemsOf, metaPath, recordText, refreshedNames, screensOf, snapshotOptions, STORY_INDEX, storyIndexOf, unrecordedBoards } from './snapshot.ts'
import { canvasStatus } from './status.ts'

const flag = (argv: readonly string[], name: string) => {
  const at = argv.indexOf(`--${name}`)
  return at === -1 ? undefined : argv[at + 1]
}

/** The text of a path under `<from>/project`, or undefined when the folder does not hold it. */
const reader = (from: string) => (path: string) => (existsSync(join(from, 'project', path)) ? readFileSync(join(from, 'project', path), 'utf8') : undefined)

const snapshot = (config: Config, argv: readonly string[]) => {
  const { from, version, only, tokens } = snapshotOptions(argv)
  if (config.artifact === null) throw new SnapshotError(`No canvas link yet: set "artifact" in ${CONFIG_FILE} (or ${LEGACY_CONFIG_FILE}) for the first snapshot (later ones read it from artifact.json).`)
  const p = project(config)
  const map = p.map()
  const read = reader(from)
  const canvasText = read('canvas.json')
  if (canvasText === undefined) throw new SnapshotError(`${from}/project/canvas.json was not read.`)
  const tokensText = read(config.tokens)
  if (tokensText === undefined) throw new SnapshotError(`${from}/project/${config.tokens} was not read.`)
  const canvas: unknown = JSON.parse(canvasText)
  const before = new Map(p.metas().map(m => [m.file, m]))
  const snap = buildSnapshot({ canvas, tokensText, version, map, read, previous: f => before.get(f), only, tokens, existing: [...before.values()], prototype: config.prototypePages })
  const onCanvas = boardsOf(canvas, config.prototypePages).map(b => b.file)
  const record = recordText({ canvas: config.canvas.id, artifact: config.artifact, version, full: only === undefined, previous: p.record(), files: canvasFileCount(from), boards: onCanvas, designSystems: designSystemsOf(canvas) })
  const runtime = join(from, 'artifact-type/dc-runtime.js')
  if (only === undefined && !existsSync(runtime)) throw new SnapshotError(`${runtime} was not read: boards render offline only with the canvas runtime.`)
  // The snapshot is only touched once everything above has been read, so a refusal there leaves the old one.
  // The map entries are kept by hand, not read from the canvas: the refresh leaves them.
  // A partial refresh clears only the named boards' files; every other board's files are left byte for byte.
  const stale = (only ?? []).flatMap(f => [f, metaPath(f).replace(/^boards\//, '')])
  const boards = existsSync(p.file('boards')) ? readdirSync(p.file('boards')) : []
  for (const name of only === undefined ? refreshedNames(boards) : stale) rmSync(p.file(`boards/${name}`), { recursive: true, force: true })
  mkdirSync(p.file('boards'), { recursive: true })
  for (const [path, text] of Object.entries({ ...snap.files, [ARTIFACT_RECORD]: record, [STORY_INDEX]: JSON.stringify(storyIndexOf(map), null, 2) + '\n' })) {
    mkdirSync(dirname(p.file(path)), { recursive: true })
    writeFileSync(p.file(path), text)
  }
  if (only === undefined) writeFileSync(p.file('boards/support.js'), readFileSync(runtime))
  const moved = snap.metas.filter(m => m.copy !== undefined && before.get(m.file)?.copy?.hash !== m.copy.hash).length
  if (only !== undefined) {
    console.log(`Partial snapshot of ${config.artifact} version ${version}: ${only.length} named boards rewritten, ${moved} of them changed (and now at ${version}); every other board left as committed.`)
    const missing = unrecordedBoards(onCanvas, snap.metas.map(m => m.file), only)
    if (missing.length > 0) console.log(`On the canvas but not in the snapshot, and not named: ${missing.join(', ')}. A full refresh adds them.`)
  } else console.log(`Snapshot of ${config.artifact} version ${version}: ${snap.boards.boards.length} boards, ${screensOf(map).length} copied, ${moved} of them changed (and now at ${version}).`)
}

/** The configs a command reads: the canvas named with --canvas, else every canvas that has a snapshot. */
const chosenConfigs = (path: string | undefined, canvasId: string | undefined): Config[] => (canvasId === undefined ? snapshotConfigs(loadConfig(path)) : [loadConfig(path, canvasId)])

/**
 * The package's checks on each canvas (its id before each line when there are several), board names across them,
 * then the project's own from its `checks()` hook, once, with the main canvas's config. Then the canvas files and
 * the warnings, which never change the exit code.
 */
const check = async (path: string | undefined, canvasId: string | undefined) => {
  const main = loadConfig(path)
  const configs = chosenConfigs(path, canvasId)
  const tag = (config: Config) => (line: string) => (configs.length > 1 ? `[${config.canvas.id}] ${line}` : line)
  const hooks = await loadHooks(main)
  const problems = [...configs.flatMap(c => checkProblems(c).map(tag(c))), ...boardNameProblems(main), ...((await hooks.checks?.({ config: main, canvas: project(main) })) ?? [])]
  if (problems.length > 0) {
    console.error(problems.map(problem => `- ${problem}`).join('\n'))
    process.exitCode = 1
  } else console.log('The design canvas snapshot is in step.')
  for (const config of configs) {
    const files = canvasFiles(config)
    if (!files.warning) console.log(tag(config)(files.line))
  }
  for (const config of configs) for (const warning of checkWarnings(config)) console.warn(`warning: ${tag(config)(warning)}`)
}

/** A folder read from the canvas against the snapshot: what a refresh would change. Writes nothing. */
const status = (config: Config, argv: readonly string[]) => {
  const from = flag(argv, 'from')
  if (from === undefined || from.startsWith('--')) throw new SnapshotError('Usage: drawing-board status --from <folder read from the canvas> [--canvas <id>]')
  const p = project(config)
  const found = canvasStatus({ from, read: reader(from), files: canvasFileCount(from), metas: p.metas(), prototype: config.prototypePages, limits: config.limits, record: p.record(), ...(config.designSystems === undefined ? {} : { expected: config.designSystems }) })
  console.log([`The canvas "${config.canvas.id}" read in ${from}, against its snapshot:`, ...found.lines.map(line => `- ${line}`)].join('\n'))
  if (found.files.warning) console.warn(`warning: ${found.files.line}`)
  else console.log(found.files.line)
}

/** The words of `find`: its arguments, leaving out each flag and its value. */
const words = (argv: readonly string[]) => argv.filter((arg, at) => !arg.startsWith('--') && !(argv[at - 1] ?? '').startsWith('--'))

/** The boards of every snapshot (or the canvas named) that match the words, best first. */
const find = (argv: readonly string[]) => {
  const query = words(argv)
  if (query.length === 0) throw new SnapshotError('Usage: drawing-board find <words…> [--canvas <id>]')
  const canvases = chosenConfigs(flag(argv, 'config'), flag(argv, 'canvas')).map(config => {
    const p = project(config)
    const pages = p.pages()
    return { id: config.canvas.id, metas: p.metas(), map: p.map(), ...(pages === undefined ? {} : { pages }) }
  })
  const found = findBoards(canvases, query)
  if (found.length === 0) return void console.log(`No board matches "${query.join(' ')}".`)
  console.log(found.map(b => [b.canvas, b.page ?? 'no page', b.file, b.story ?? 'no story'].join('  ')).join('\n'))
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

const USAGE = `Usage: drawing-board <snapshot|check|index|report> [--config <file>] [--canvas <id>]
       drawing-board status --from <folder> [--canvas <id>]
       drawing-board find <words…> [--canvas <id>]
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
  const config = () => loadConfig(flag(argv, 'config'), flag(argv, 'canvas'))
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
  if (command === 'check') return await check(flag(argv, 'config'), flag(argv, 'canvas'))
  if (command === 'status') return status(config(), argv)
  if (command === 'find') return find(rest)
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
