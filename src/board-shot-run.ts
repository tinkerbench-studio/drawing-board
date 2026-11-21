// `drawing-board board-shot`: shoots a board's committed copy and its story from a built Storybook at one width,
// finds each difference on both sides, and joins them into the numbered picture with its table. What is decided is
// in board-shot.ts; this drives the browser (playwright-core, an optional peer dependency).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { BoardShotError, composeHtml, designBanner, differencesFile, legendMarkdown, parseDifferences, placeBadges, seedDifferences, SIDE_GAP, storybookBanner, visibleDifferences, type Locator, type Rect } from './board-shot.ts'
import { comparePage, comparisonReport, type PageComparison } from './compare.ts'
import type { Config } from './config.ts'
import { HOOK_NAMES, loadHooks } from './hooks.ts'
import { launch, launchOptions, serve } from './pictures-run.ts'
import { storyUrl } from './pictures.ts'
import { project } from './project.ts'
import { openStorySide, pickStory, storybookEntries, type IndexEntry } from './story-side.ts'

/** Fonts from the canvas do not load offline, so both sides are drawn in one family: their text is then the same width. */
export const SAME_FONT_CSS = '*, *::before, *::after { font-family: Arial, Helvetica, sans-serif !important; }'

export type BoardShotOptions = { board?: string; storybook?: string; storyId?: string; width?: number; theme?: 'light' | 'dark'; out?: string; boardsDir?: string }

const USAGE = 'Usage: drawing-board board-shot [--board <Board>.dc.html] [--storybook <storybook-static-dir>] [--story-id <id>] [--width N] [--theme light|dark] [--out <dir>] [--boards-dir <dir>]'

/** The options of `board-shot`. */
export const boardShotOptions = (argv: readonly string[]): BoardShotOptions => {
  const flags: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a.startsWith('--') && a !== '--config') flags[a.slice(2)] = argv[++i] ?? ''
    else if (a === '--config') i++
  }
  const { board } = flags
  if (flags.board === '') throw new BoardShotError(USAGE)
  if (board !== undefined && !board.endsWith('.dc.html')) throw new BoardShotError(`--board names a board file, such as Ticket.dc.html, not "${board}".`)
  const width = flags.width === undefined ? undefined : Number(flags.width)
  if (width !== undefined && (!Number.isInteger(width) || width < 200)) throw new BoardShotError('--width is a number of pixels, 200 or more')
  if (flags.theme !== undefined && flags.theme !== 'light' && flags.theme !== 'dark') throw new BoardShotError('--theme is light or dark')
  return { ...(board === undefined ? {} : { board }), ...(flags.storybook ? { storybook: flags.storybook } : {}), ...(flags['story-id'] ? { storyId: flags['story-id'] } : {}), ...(width === undefined ? {} : { width }), ...(flags.theme ? { theme: flags.theme as 'light' | 'dark' } : {}), ...(flags.out ? { out: flags.out } : {}), ...(flags['boards-dir'] ? { boardsDir: flags['boards-dir'] } : {}) }
}

export { pickStory }

type Page = Awaited<ReturnType<Awaited<ReturnType<typeof launch>>['newPage']>>

/** Runs in the browser: the box of each locator (page coordinates), 'missing' when nothing matches, 'empty' when it has no size. */
const locate = (locators: (Locator | null)[]) => {
  const words = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  const kindOf = (el: Element) => {
    const tag = el.tagName.toLowerCase()
    if (/^h[1-6]$/.test(tag)) return 'heading'
    if (tag === 'button' || (tag === 'a' && (el.classList.contains('button') || el.classList.contains('btn')))) return 'button'
    if (tag === 'a') return 'link'
    if (tag === 'label' || tag === 'th') return 'label'
    if (tag === 'li') return 'item'
    return undefined
  }
  // Seen in the picture: a size, and not hidden by CSS, opacity, a closed <details> or a closed dialog.
  const sized = (el: Element) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.closest('details:not([open]) > :not(summary), dialog:not([open])') === null
  }
  return locators.map(locator => {
    if (locator === null) return null
    const matches = 'selector' in locator ? [...document.querySelectorAll(locator.selector)] : [...document.querySelectorAll('*')].filter(el => kindOf(el) === locator.kind && words(el) === locator.text.toLowerCase())
    if (matches.length === 0) return 'missing'
    const el = matches.find(sized)
    if (!el) return 'empty'
    const r = el.getBoundingClientRect()
    return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height }
  })
}

/** Opens a side at `width` in one font, ready to read and shoot. */
const open = async (browser: Awaited<ReturnType<typeof launch>>, url: string, width: number, ready?: string): Promise<Page> => {
  const page = await browser.newPage({ viewport: { width, height: 800 } })
  await page.goto(url, { waitUntil: 'networkidle' })
  if (ready) await page.waitForSelector(ready, { timeout: 15000 })
  await page.addStyleTag({ content: SAME_FONT_CSS })
  await page.evaluate(() => document.fonts.ready)
  return page
}

/**
 * The boxes of one side. A selector from a differences file that matches nothing fails, so a list that has drifted
 * from the screen is noticed; a seeded item it cannot find (in a closed menu, say) is left not drawn.
 */
const boxes = async (page: Page, locators: (Locator | null)[], seeded: boolean, what: string): Promise<(Rect | null)[]> => {
  const found = await page.evaluate(locate, locators)
  return found.map((entry, i) => {
    if (entry === 'missing' || entry === 'empty') {
      if (seeded) return null
      const locator = locators[i] as { selector: string }
      throw new BoardShotError(entry === 'missing' ? `${what}: nothing matches "${locator.selector}". Update the differences file or the screen.` : `${what}: "${locator.selector}" matches an element with no size (hidden?), so there is nothing to box.`)
    }
    return entry
  })
}

const commit = (): string | null => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

/** Makes `<out>/shots/<Board>-side-by-side.png` and its table `<Board>-side-by-side.md`, the names Tick-it reads a repository's design pictures by; returns their paths. */
export const boardShot = async (config: Config, options: BoardShotOptions & { board: string }): Promise<{ image: string; legend: string }> => {
  const canvas = project(config)
  const boardsDir = resolve(options.boardsDir ?? canvas.file('boards'))
  const { board } = options
  if (!existsSync(join(boardsDir, board))) throw new BoardShotError(`${board} has no copy in ${boardsDir}: map it to a story and refresh the snapshot, or pass --boards-dir.`)
  const entry = canvas.map()[board]
  if (entry?.story === undefined) throw new BoardShotError(`${board} maps to no story, so there is nothing to put beside it.`)
  const hooks = await loadHooks(config)
  const meta = canvas.metas().find(m => m.file === board)
  const width = options.width ?? Math.min(meta?.w ?? 1280, 1440)
  const listFile = join(config.differences, differencesFile(board).replace(/^differences\//, ''))

  const boards = await serve(boardsDir)
  const story = await openStorySide(config, hooks, board, options)
  const browser = await launch(launchOptions(config))
  try {
    const boardPage = await open(browser, `${boards.base}/${board}`, width)
    const storyPage = await open(browser, story.url, width, story.ready)
    const decided = Array.isArray(entry.decided) ? entry.decided.filter((d): d is string => typeof d === 'string') : []
    let list = existsSync(listFile) ? parseDifferences(readFileSync(listFile, 'utf8'), board) : seedDifferences(await boardPage.content(), await storyPage.evaluate(() => (document.querySelector('#storybook-root') ?? document.body).innerHTML), decided)
    if (list.seeded) {
      // Number only what the picture shows: each candidate must be seen on the side that draws it.
      const candidates = list.all ?? list.differences
      const onBoard = await boardPage.evaluate(locate, candidates.map(d => d.board))
      const inStory = await storyPage.evaluate(locate, candidates.map(d => d.story))
      list = visibleDifferences(list, candidates.map((_, i) => typeof (onBoard[i] ?? inStory[i]) === 'object' && (onBoard[i] ?? inStory[i]) !== null))
    }
    const boardRects = await boxes(boardPage, list.differences.map(d => d.board), list.seeded, board)
    const storyRects = await boxes(storyPage, list.differences.map(d => d.story), list.seeded, story.id)
    const shoot = async (page: Page, rects: (Rect | null)[], banner: ReturnType<typeof designBanner>) => {
      const height = await page.evaluate(() => document.documentElement.scrollHeight)
      const png = await page.screenshot({ fullPage: true, type: 'png', clip: { x: 0, y: 0, width, height } })
      return { banner, image: `data:image/png;base64,${png.toString('base64')}`, height, boxes: placeBadges(rects.flatMap((rect, i) => (rect ? [{ number: i + 1, rect }] : [])), width) }
    }
    const banners = {
      board: designBanner({ board, artifact: config.artifact, version: meta?.copy?.version ?? null, story: entry.story }),
      story: storybookBanner({ title: story.title, name: story.name, id: story.id, fixture: list.fixture, commit: commit(), theme: options.theme ?? null }),
    }
    const html = composeHtml(await shoot(boardPage, boardRects, banners.board), await shoot(storyPage, storyRects, banners.story), width)
    const out = resolve(options.out ?? join(config.out, 'shots'))
    mkdirSync(out, { recursive: true })
    const stem = board.replace(/\.dc\.html$/, '')
    const image = join(out, `${stem}-side-by-side.png`)
    const joined = await browser.newPage({ viewport: { width: width * 2 + SIDE_GAP, height: 1 } })
    await joined.setContent(html)
    await joined.screenshot({ path: image, fullPage: true, type: 'png' })
    const legend = join(out, `${stem}-side-by-side.md`)
    writeFileSync(legend, legendMarkdown({ board, list, drawn: list.differences.map((_, i) => ({ board: boardRects[i] ?? null, story: storyRects[i] ?? null })), banners, image: `${stem}-side-by-side.png` }))
    return { image, legend }
  } finally {
    await browser.close()
    boards.server.close()
    story.close()
  }
}

/**
 * `drawing-board compare`: every board a story shows, beside that story drawn by the built Storybook, compared by
 * wording (comparePage). Writes `<out>/compare.md` and returns the report. A board whose story the build lacks is
 * listed as not compared.
 */
export const compareStories = async (config: Config, storybookDir = config.storybook): Promise<string> => {
  const canvas = project(config)
  const storybook = resolve(storybookDir)
  const entries = storybookEntries(storybook)
  const map = canvas.map()
  const boards = await serve(canvas.file('boards'))
  const built = await serve(storybook)
  const browser = await launch(launchOptions(config))
  const pages: PageComparison[] = []
  const missing: string[] = []
  try {
    for (const [board, entry] of Object.entries(map)) {
      if (entry.story === undefined || canvas.copy(board) === undefined) continue
      let story: IndexEntry
      try {
        story = pickStory(entries, entry.story, typeof entry.page === 'string' ? entry.page : undefined)
      } catch {
        missing.push(`${board} (${entry.story})`)
        continue
      }
      const width = Math.min(canvas.metas().find(m => m.file === board)?.w ?? 1280, 1440)
      const boardPage = await open(browser, `${boards.base}/${board}`, width)
      const storyPage = await open(browser, storyUrl(built.base, story.id), width, '#storybook-root > *, #root > *')
      const decided = Array.isArray(entry.decided) ? entry.decided.filter((d): d is string => typeof d === 'string') : []
      pages.push(comparePage(board, `${story.title} › ${story.name}`, entry.status ?? 'not classified', await boardPage.content(), await storyPage.evaluate(() => (document.querySelector('#storybook-root') ?? document.body).innerHTML), decided))
      await boardPage.close()
      await storyPage.close()
    }
  } finally {
    await browser.close()
    boards.server.close()
    built.server.close()
  }
  const report = comparisonReport(pages) + (missing.length ? `\n## Not compared\n\nThe built Storybook has no story for:\n\n${missing.map(m => `- ${m}`).join('\n')}\n` : '')
  mkdirSync(config.out, { recursive: true })
  writeFileSync(join(config.out, 'compare.md'), report)
  return report
}

/** `drawing-board board-shot` with no `--board`: every board a story shows that has a copy. Goes on past a board that fails, and names each failure at the end. */
export const boardShots = async (config: Config, options: BoardShotOptions): Promise<{ made: string[]; failed: string[] }> => {
  const canvas = project(config)
  const boards = options.board !== undefined ? [options.board] : Object.entries(canvas.map()).filter(([board, entry]) => entry.story !== undefined && canvas.copy(board) !== undefined).map(([board]) => board)
  const made: string[] = []
  const failed: string[] = []
  for (const board of boards) {
    try {
      made.push((await boardShot(config, { ...options, board })).image)
    } catch (error) {
      if (options.board !== undefined) throw error
      failed.push(`${board}: ${(error as Error).message}`)
    }
  }
  return { made, failed }
}

export type PageShotsOptions = { out?: string; theme?: string; only?: string[]; mark?: string }

/** The options of `page-shots`: `--out`, one `--theme`, `--only` some pages (comma-separated), and `--mark` a selector to outline. */
export const pageShotsOptions = (argv: readonly string[]): PageShotsOptions => {
  const flag = (name: string) => {
    const at = argv.indexOf(`--${name}`)
    return at === -1 ? undefined : argv[at + 1]
  }
  const only = flag('only')
  return { ...(flag('out') ? { out: flag('out')! } : {}), ...(flag('theme') ? { theme: flag('theme')! } : {}), ...(only ? { only: only.split(',').map(s => s.trim()).filter(Boolean) } : {}), ...(flag('mark') ? { mark: flag('mark')! } : {}) }
}

/**
 * The pictures to take of each page: one per theme, then a 390 px phone in the first theme; or, with no themes, the
 * page as it is and its phone. `only` (a theme) draws that theme and the phone in it.
 */
export const pageVariants = (themes: readonly string[], only?: string): { name: string; theme: string | null; phone: boolean }[] => {
  if (only !== undefined && themes.length > 0 && !themes.includes(only)) throw new BoardShotError(`--theme ${only} is not one of the themes (${themes.join(', ')}).`)
  const drawn = only !== undefined ? [only] : themes
  if (drawn.length === 0) return [{ name: 'desktop', theme: null, phone: false }, { name: 'phone', theme: null, phone: true }]
  return [...drawn.map(theme => ({ name: theme, theme, phone: false })), { name: 'phone', theme: drawn[0]!, phone: true }]
}

/** `drawing-board page-shots`: each page the project's `pages()` hook returns, in each variant, as `<out>/<page>-<variant>.png`. */
export const pageShots = async (config: Config, options: PageShotsOptions): Promise<string[]> => {
  const hooks = await loadHooks(config)
  if (hooks.pages === undefined) throw new BoardShotError(`No pages() hook: export one from ${HOOK_NAMES[0]} in the snapshot folder (or the "hooks" setting), returning each page's HTML by name.`)
  const pages = Object.entries(await hooks.pages({ config, canvas: project(config) })).filter(([name]) => options.only === undefined || options.only.includes(name))
  const out = resolve(options.out ?? join(config.out, 'pages'))
  mkdirSync(out, { recursive: true })
  const written: string[] = []
  const browser = await launch(launchOptions(config))
  try {
    for (const [name, shot] of pages) {
      const page = typeof shot === 'string' ? { html: shot } : shot
      for (const variant of pageVariants(config.themes, options.theme)) {
        const tab = await browser.newPage({ viewport: { width: variant.phone ? 390 : (page.width ?? 1280), height: 700 } })
        await tab.setContent(page.html, { waitUntil: 'load' })
        if (variant.theme !== null) await tab.evaluate(theme => (document.documentElement.dataset.theme = theme), variant.theme)
        if (page.css) await tab.addStyleTag({ content: page.css })
        if (options.mark) await tab.addStyleTag({ content: `${options.mark}{outline:3px solid #e11;outline-offset:2px}` })
        const file = join(out, `${name}-${variant.name}.png`)
        await tab.screenshot({ path: file, fullPage: true })
        await tab.close()
        written.push(file)
        console.log(`${name}-${variant.name}.png`)
      }
    }
  } finally {
    await browser.close()
  }
  return written
}
