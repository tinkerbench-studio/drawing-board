// `drawing-board layout`: renders each mapped board's committed copy and its story at one width in one font, measures the
// landmarks on both sides (landmarks.ts decides) and writes `<out>/layout.md`, with a picture of each side for every
// screen a person should look at. Needs playwright-core (an optional peer dependency) and a Chromium.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { BoardShotError } from './board-shot.ts'
import { SAME_FONT_CSS } from './board-shot-run.ts'
import type { Config } from './config.ts'
import { loadHooks } from './hooks.ts'
import { collectLandmarks, compareLandmarks, DEFAULT_TOLERANCE, keepsScreenshots, LANDMARK_ATTR, layoutMarkdown, screenshotNames, statusOf, type RawLandmark, type ScreenResult } from './landmarks.ts'
import { launch, serve } from './pictures-run.ts'
import { project } from './project.ts'
import { openStorySide } from './story-side.ts'

export type LayoutOptions = { board?: string; storybook?: string; storyId?: string; width?: number; tolerance?: number; attr?: string; origin?: string; out?: string; boardsDir?: string }

const USAGE = 'Usage: drawing-board layout [--board <Board>.dc.html] [--storybook <dir>] [--story-id <id>] [--width N] [--tolerance N] [--attr <attribute>] [--origin <selector>] [--out <dir>] [--boards-dir <dir>]'

/** The options of `layout`. */
export const layoutOptions = (argv: readonly string[]): LayoutOptions => {
  const flags: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--config') i++
    else if (a.startsWith('--')) flags[a.slice(2)] = argv[++i] ?? ''
  }
  for (const [name, value] of Object.entries(flags)) if (value === '' ) throw new BoardShotError(`--${name} needs a value. ${USAGE}`)
  const number = (name: string, min: number) => {
    if (flags[name] === undefined) return undefined
    const n = Number(flags[name])
    if (!Number.isFinite(n) || n < min) throw new BoardShotError(`--${name} is a number, ${min} or more.`)
    return n
  }
  if (flags.board !== undefined && !flags.board.endsWith('.dc.html')) throw new BoardShotError(`--board names a board file, such as Ticket.dc.html, not "${flags.board}".`)
  const width = number('width', 200)
  const tolerance = number('tolerance', 0)
  return {
    ...(flags.board ? { board: flags.board } : {}),
    ...(flags.storybook ? { storybook: flags.storybook } : {}),
    ...(flags['story-id'] ? { storyId: flags['story-id'] } : {}),
    ...(width === undefined ? {} : { width }),
    ...(tolerance === undefined ? {} : { tolerance }),
    ...(flags.attr ? { attr: flags.attr } : {}),
    ...(flags.origin ? { origin: flags.origin } : {}),
    ...(flags.out ? { out: flags.out } : {}),
    ...(flags['boards-dir'] ? { boardsDir: flags['boards-dir'] } : {}),
  }
}

type Browser = Awaited<ReturnType<typeof launch>>

/** Opens one side at `width` in one font and measures its landmarks and a full-page picture clipped to the width. */
const measure = async (browser: Browser, url: string, width: number, attr: string, origin: string | undefined, ready?: string) => {
  const page = await browser.newPage({ viewport: { width, height: 800 } })
  try {
    await page.goto(url, { waitUntil: 'networkidle' })
    if (ready) await page.waitForSelector(ready, { timeout: 15000 })
    await page.addStyleTag({ content: SAME_FONT_CSS })
    await page.evaluate(() => document.fonts.ready)
    const measured = await page.evaluate(
      ({ attr, origin }) => {
        const entries = [...document.querySelectorAll(`[${attr}]`)].map(el => {
          const r = el.getBoundingClientRect()
          return { name: el.getAttribute(attr), rect: { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height } }
        })
        const corner = origin ? document.querySelector(origin)?.getBoundingClientRect() : null
        return { entries, origin: corner ? { x: corner.x + window.scrollX, y: corner.y + window.scrollY } : { x: 0, y: 0 }, missingOrigin: Boolean(origin) && !corner, height: document.documentElement.scrollHeight, scrollWidth: document.documentElement.scrollWidth }
      },
      { attr, origin },
    )
    if (measured.missingOrigin) throw new BoardShotError(`${url}: nothing matches the origin selector "${origin}".`)
    const { boxes, duplicates } = collectLandmarks(measured.entries as RawLandmark[], measured.origin)
    const screenshot = await page.screenshot({ fullPage: true, type: 'png', clip: { x: 0, y: 0, width, height: measured.height } })
    return { boxes, duplicates, screenshot, overflows: measured.scrollWidth > width }
  } finally {
    await page.close()
  }
}

/** Measures every mapped board with a copy (or `options.board`), writes `<out>/layout.md` and the pictures it links, and returns the results. A board whose story cannot be drawn is listed as not measured. */
export const layout = async (config: Config, options: LayoutOptions = {}): Promise<{ report: string; results: ScreenResult[] }> => {
  const canvas = project(config)
  const boardsDir = resolve(options.boardsDir ?? canvas.file('boards'))
  const map = canvas.map()
  const boards = options.board !== undefined ? [options.board] : Object.entries(map).filter(([board, e]) => e.story !== undefined && canvas.copy(board) !== undefined).map(([board]) => board)
  if (options.board !== undefined && !existsSync(join(boardsDir, options.board))) throw new BoardShotError(`${options.board} has no copy in ${boardsDir}: map it to a story and refresh the snapshot, or pass --boards-dir.`)
  const hooks = await loadHooks(config)
  const out = resolve(options.out ?? join(config.out, 'layout'))
  const attr = options.attr ?? LANDMARK_ATTR
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE
  const served = await serve(boardsDir)
  const browser = await launch()
  const results: ScreenResult[] = []
  try {
    for (const board of boards) {
      const title = map[board]?.story ?? ''
      let side
      try {
        side = await openStorySide(config, hooks, board, options)
      } catch (error) {
        if (options.board !== undefined) throw error
        results.push({ board, story: title, state: null, status: 'not-measured', note: (error as Error).message, differences: [], boardLandmarks: 0, storyLandmarks: 0, overflows: { board: false, story: false } })
        continue
      }
      try {
        const width = options.width ?? Math.min(canvas.metas().find(m => m.file === board)?.w ?? 1280, 1440)
        const onBoard = await measure(browser, `${served.base}/${board}`, width, attr, options.origin)
        const inStory = await measure(browser, side.url, width, attr, options.origin, side.ready)
        const differences = compareLandmarks(onBoard.boxes, inStory.boxes, tolerance)
        const [boardLandmarks, storyLandmarks] = [Object.keys(onBoard.boxes).length, Object.keys(inStory.boxes).length]
        const status = statusOf(differences, boardLandmarks, storyLandmarks)
        const duplicates = [...onBoard.duplicates, ...inStory.duplicates]
        const notes = [duplicates.length > 0 ? `Marked on more than one element, so only the first is measured: ${duplicates.map(d => `\`${d}\``).join(', ')}.` : '', status === 'nothing-marked' ? `No element on either side carries \`${attr}\`.` : ''].filter(Boolean)
        const result: ScreenResult = { board, story: title, state: side.name, status, differences, boardLandmarks, storyLandmarks, overflows: { board: onBoard.overflows, story: inStory.overflows }, ...(notes.length > 0 ? { note: notes.join(' ') } : {}) }
        if (keepsScreenshots(status)) {
          const names = screenshotNames(board)
          mkdirSync(out, { recursive: true })
          writeFileSync(join(out, names.board), onBoard.screenshot)
          writeFileSync(join(out, names.story), inStory.screenshot)
          result.screenshots = names
        }
        results.push(result)
      } finally {
        side.close()
      }
    }
  } finally {
    await browser.close()
    served.server.close()
  }
  const report = layoutMarkdown(results, tolerance, attr)
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'layout.md'), report)
  return { report, results }
}
