// board-shot and compare end to end, on a stand-in project: a snapshot with one board and a built Storybook whose one
// story differs from it. Needs a Chromium (PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH); without one it is skipped.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { boardShot, boardShots, compareStories } from './board-shot-run.ts'
import { parseConfig } from './config.ts'

const write = (dir: string, path: string, text: string) => {
  mkdirSync(join(dir, path, '..'), { recursive: true })
  writeFileSync(join(dir, path), text)
}

/** A project whose Ticket board has Save and Export, and whose story has Save and Keep. */
const project = () => {
  const dir = mkdtempSync(join(tmpdir(), 'drawing-board-shot-'))
  const page = (buttons: string) => `<main style="padding:20px"><h1>Trips</h1>${buttons}</main>`
  write(dir, 'design/canvas/boards/Ticket.dc.html', `<!doctype html><body>${page('<button id="save">Save</button> <button>Export</button>')}</body>`)
  write(dir, 'design/canvas/boards/Ticket.map.json', '{"story":"Pages/Ticket"}')
  write(dir, 'design/canvas/boards/Ticket.meta.json', JSON.stringify({ file: 'Ticket.dc.html', title: null, page: null, w: 600, h: 300, copy: { hash: 'x', version: 'v7' } }))
  write(dir, 'design/canvas/artifact.json', '{"artifact":"https://claude.ai/artifact/x"}')
  write(dir, 'storybook-static/index.json', JSON.stringify({ entries: { a: { id: 'pages-ticket--default', title: 'Pages/Ticket', name: 'Default', type: 'story' } } }))
  write(dir, 'storybook-static/iframe.html', `<!doctype html><body><div id="storybook-root">${page('<button id="save">Save</button> <button>Keep</button> <details><summary>More</summary><button>Hidden</button></details>')}</div></body>`)
  return { dir, config: parseConfig('', dir) }
}

describe.skipIf(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH === undefined)('board-shot and compare in Chromium', () => {
  it('numbers the differences the comparison finds, with no differences file', { timeout: 60000 }, async () => {
    const { config } = project()
    const { image, legend } = await boardShot(config, { board: 'Ticket.dc.html' })
    expect(existsSync(image)).toBe(true)
    const md = readFileSync(legend, 'utf8')
    expect(md).toMatch(/\| 1 \| Red \| \*\*button: Export\*\*: On the board only/)
    expect(md).toMatch(/\| 2 \| Green \| \*\*button: Keep\*\*: In the story only/)
    expect(md).toMatch(/button “Export” \(\d+×\d+ at \d+, \d+\) \| Not drawn/)
    expect(md).toContain('copy read at version v7')
    expect(md).not.toMatch(/Hidden/)
    expect(md).toMatch(/1 is left out because it is not visible in the picture/)
    expect(md).toContain('Story: Pages/Ticket › Default (pages-ticket--default)')
    expect(image.replaceAll('\\', '/')).toMatch(/reports\/design-canvas\/shots\/Ticket-side-by-side\.png$/)
  })

  it('shoots every board a story shows when no board is named', { timeout: 60000 }, async () => {
    const { config } = project()
    const { made, failed } = await boardShots(config, {})
    expect(failed).toEqual([])
    expect(made.map(f => f.split(/[\\/]/).at(-1))).toEqual(['Ticket-side-by-side.png'])
  })

  it('draws each configured theme when no --theme is given, and one picture for --theme', { timeout: 90000 }, async () => {
    const { dir } = project()
    const themed = parseConfig(JSON.stringify({ themes: ['dark', 'light'] }), dir)
    const names = (made: string[]) => made.map(f => f.split(/[\\/]/).at(-1))
    expect(names((await boardShots(themed, {})).made)).toEqual(['Ticket-side-by-side-dark.png', 'Ticket-side-by-side-light.png'])
    expect(names((await boardShots(themed, { theme: 'light' })).made)).toEqual(['Ticket-side-by-side.png'])
  })

  it('draws the differences file instead, and refuses a selector that has drifted', { timeout: 60000 }, async () => {
    const { dir, config } = project()
    write(dir, 'design/canvas/differences/Ticket.json', JSON.stringify({ differences: [{ title: 'Save button', detail: 'Same words, checked by hand.', board: '#save', story: '#save' }] }))
    const md = readFileSync((await boardShot(config, { board: 'Ticket.dc.html' })).legend, 'utf8')
    expect(md).toMatch(/\| 1 \| Red \| \*\*Save button\*\*: Same words, checked by hand\. \| `#save` \(/)
    expect(md).not.toMatch(/found by comparing/)
    write(dir, 'design/canvas/differences/Ticket.json', JSON.stringify({ differences: [{ title: 'Gone', detail: 'x', board: '#gone', story: null }] }))
    await expect(boardShot(config, { board: 'Ticket.dc.html' })).rejects.toThrow(/nothing matches "#gone"/)
  })

  it('reads the differences list from the folder the differences setting names', { timeout: 60000 }, async () => {
    const { dir } = project()
    write(dir, 'elsewhere/Ticket.json', JSON.stringify({ differences: [{ title: 'Save button', detail: 'Kept in another folder.', board: '#save', story: '#save' }] }))
    const md = readFileSync((await boardShot(parseConfig(JSON.stringify({ differences: 'elsewhere' }), dir), { board: 'Ticket.dc.html' })).legend, 'utf8')
    expect(md).toMatch(/\| 1 \| Red \| \*\*Save button\*\*: Kept in another folder\./)
  })

  it('draws the story the project’s storyPage() hook returns, with no built Storybook, and names it in the banner', { timeout: 60000 }, async () => {
    const { dir } = project()
    rmSync(join(dir, 'storybook-static'), { recursive: true })
    write(dir, 'hooks.mjs', `export const storyPage = ({ board, story }) => ({ html: '<main style="padding:20px"><h1>Trips</h1><button id="save">Save</button> <button>Keep</button></main>' })`)
    const { image, legend } = await boardShot(parseConfig(JSON.stringify({ hooks: 'hooks.mjs' }), dir), { board: 'Ticket.dc.html' })
    expect(existsSync(image)).toBe(true)
    const md = readFileSync(legend, 'utf8')
    expect(md).toContain('Story: Pages/Ticket › the project’s storyPage() hook (storyPage)')
    expect(md).toMatch(/\*\*button: Export\*\*: On the board only/)
    expect(md).toMatch(/\*\*button: Keep\*\*: In the story only/)
  })

  it('compares every mapped board with its story, writing the report', { timeout: 60000 }, async () => {
    const { config } = project()
    const report = await compareStories(config)
    expect(report).toMatch(/## Ticket\.dc\.html ↔ Pages\/Ticket › Default/)
    expect(report).toMatch(/Only on the board[^\n]*\n- button: Export/)
    expect(report).toMatch(/Only in the story[^\n]*\n- button: Keep/)
    expect(readFileSync(join(config.out, 'compare.md'), 'utf8')).toBe(report)
  })

  it('takes a story’s markup from the storyMarkup() hook, with no built Storybook', { timeout: 60000 }, async () => {
    const { dir } = project()
    rmSync(join(dir, 'storybook-static'), { recursive: true })
    write(dir, 'hooks.mjs', `export const storyMarkup = ({ story }) => '<main><h1>Trips</h1><button>Save</button> <button>Keep</button></main>'`)
    const report = await compareStories(parseConfig(JSON.stringify({ hooks: 'hooks.mjs' }), dir))
    expect(report).toMatch(/## Ticket\.dc\.html ↔ Pages\/Ticket › the project’s storyMarkup\(\) hook/)
    expect(report).toMatch(/Only on the board[^\n]*\n- button: Export/)
    expect(report).toMatch(/Only in the story[^\n]*\n- button: Keep/)
  })

  it('falls back to the built Storybook when the hook returns nothing for a story', { timeout: 60000 }, async () => {
    const { dir } = project()
    write(dir, 'hooks.mjs', 'export const storyMarkup = () => undefined')
    expect(await compareStories(parseConfig(JSON.stringify({ hooks: 'hooks.mjs' }), dir))).toMatch(/## Ticket\.dc\.html ↔ Pages\/Ticket › Default/)
  })

  it('with the compare options on, names the closest state of a story with several and the order', { timeout: 60000 }, async () => {
    const { dir } = project()
    write(dir, 'storybook-static/index.json', JSON.stringify({ entries: { a: { id: 'pages-ticket--default', title: 'Pages/Ticket', name: 'Default', type: 'story' }, b: { id: 'pages-ticket--empty', title: 'Pages/Ticket', name: 'Empty', type: 'story' } } }))
    const iframe = readFileSync(join(dir, 'storybook-static/iframe.html'), 'utf8')
    write(dir, 'storybook-static/iframe.html', iframe)
    const report = await compareStories(parseConfig(JSON.stringify({ compare: { order: true, closestState: true } }), dir))
    expect(report).toMatch(/## Ticket\.dc\.html ↔ Pages\/Ticket › (Default|Empty)/)
    expect(report).toMatch(/Closest story state: (Default|Empty)\./)
    expect(report).toMatch(/Order: /)
  })
})
