// layout end to end, on a stand-in project: a board and a story that agree on the header, differ in the card's height and
// add a footer. Needs a Chromium (PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH); without one it is skipped.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseConfig } from './config.ts'
import { layout, layoutOptions } from './layout-run.ts'

const write = (dir: string, path: string, text: string) => {
  mkdirSync(join(dir, path, '..'), { recursive: true })
  writeFileSync(join(dir, path), text)
}

const body = (card: number, extra = '') => `<main style="margin:0"><header data-landmark="header" style="height:50px;background:#ccd">Trips</header><section data-landmark="card" style="height:${card}px;background:#cdc">Card</section>${extra}</main>`

const project = (settings: object = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'drawing-board-layout-'))
  write(dir, '.drawing-board', JSON.stringify(settings))
  write(dir, 'design/canvas/boards/Ticket.dc.html', `<!doctype html><body style="margin:0">${body(80)}</body>`)
  write(dir, 'design/canvas/boards/Ticket.map.json', '{"story":"Pages/Ticket"}')
  write(dir, 'design/canvas/boards/Ticket.meta.json', JSON.stringify({ file: 'Ticket.dc.html', title: null, page: null, w: 600, h: 300, copy: { hash: 'x', version: 'v7' } }))
  write(dir, 'design/canvas/boards/Plain.dc.html', '<!doctype html><body><p>No landmarks</p></body>')
  write(dir, 'design/canvas/boards/Plain.map.json', '{"story":"Pages/Plain"}')
  write(dir, 'design/canvas/boards/Plain.meta.json', JSON.stringify({ file: 'Plain.dc.html', title: null, page: null, w: 600, h: 300, copy: { hash: 'y', version: 'v7' } }))
  write(dir, 'storybook-static/index.json', JSON.stringify({ entries: { a: { id: 'pages-ticket--default', title: 'Pages/Ticket', name: 'Default', type: 'story' }, b: { id: 'pages-plain--default', title: 'Pages/Plain', name: 'Default', type: 'story' } } }))
  // One iframe for every story, as Storybook has: what it draws depends on the id in the address.
  write(dir, 'storybook-static/iframe.html', `<!doctype html><body style="margin:0"><div id="storybook-root"></div><script>const id = new URLSearchParams(location.search).get('id'); document.getElementById('storybook-root').innerHTML = id === 'pages-plain--default' ? '<p>No landmarks</p>' : ${JSON.stringify(body(120, '<footer data-landmark="footer" style="height:30px">Footer</footer>'))}</script></body>`)
  return { dir, config: parseConfig(JSON.stringify(settings), dir) }
}

describe('layoutOptions', () => {
  it('reads the flags and refuses a bad one', () => {
    expect(layoutOptions(['--board', 'A.dc.html', '--width', '390', '--tolerance', '0', '--attr', 'data-zone', '--origin', '#root'])).toEqual({ board: 'A.dc.html', width: 390, tolerance: 0, attr: 'data-zone', origin: '#root' })
    expect(() => layoutOptions(['--board', 'A'])).toThrow(/names a board file/)
    expect(() => layoutOptions(['--width', '10'])).toThrow(/--width is a number, 200 or more/)
    expect(() => layoutOptions(['--tolerance', '-1'])).toThrow(/--tolerance/)
    expect(() => layoutOptions(['--attr'])).toThrow(/--attr needs a value/)
  })
})

describe.skipIf(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH === undefined)('layout in Chromium', () => {
  it('reports each landmark moved, resized or on one side only, with the pictures of a screen that differs', { timeout: 60000 }, async () => {
    const { config } = project()
    const { report, results } = await layout(config)
    const ticket = results.find(r => r.board === 'Ticket.dc.html')!
    expect(ticket.status).toBe('differs')
    expect(ticket.differences.map(d => [d.name, d.status])).toEqual([['header', 'same'], ['card', 'resized'], ['footer', 'missing-on-board']])
    expect(ticket.differences[1]!.delta).toMatchObject({ height: 40 })
    expect(report).toContain('| `card` | 0, 50 · 600×80 | 0, 50 · 600×120 | h +40 | **resized** |')
    expect(report).toContain('| `footer` | — | 0, 170 · 600×30 | — | **not on the board** |')
    expect(report).toContain('[board](Ticket-board.png) · [story](Ticket-story.png)')
    expect(existsSync(join(config.out, 'layout/Ticket-board.png'))).toBe(true)
    expect(existsSync(join(config.out, 'layout/Ticket-story.png'))).toBe(true)
    expect(readFileSync(join(config.out, 'layout/layout.md'), 'utf8')).toBe(report)
    const plain = results.find(r => r.board === 'Plain.dc.html')!
    expect(plain.status).toBe('nothing-marked')
    expect(report).toContain('## Nothing marked (1)')
  })

  it('takes the tolerance and the width from the flags, and one board only', { timeout: 60000 }, async () => {
    const { config } = project()
    const { results } = await layout(config, { board: 'Ticket.dc.html', tolerance: 50, width: 400, attr: 'data-landmark' })
    expect(results).toHaveLength(1)
    // The 40 px the card grew is inside a 50 px tolerance; the footer is still only in the story.
    expect(results[0]!.differences.map(d => [d.name, d.status])).toEqual([['header', 'same'], ['card', 'same'], ['footer', 'missing-on-board']])
  })

  it('lists a board whose story is not in the build as not measured, and refuses it when asked for by name', { timeout: 60000 }, async () => {
    const { dir, config } = project()
    write(dir, 'design/canvas/boards/Lost.dc.html', '<!doctype html><body>x</body>')
    write(dir, 'design/canvas/boards/Lost.map.json', '{"story":"Pages/Lost"}')
    write(dir, 'design/canvas/boards/Lost.meta.json', JSON.stringify({ file: 'Lost.dc.html', title: null, page: null, w: 600, h: 300, copy: { hash: 'z', version: 'v7' } }))
    const { results } = await layout(config)
    expect(results.find(r => r.board === 'Lost.dc.html')).toMatchObject({ status: 'not-measured', note: expect.stringMatching(/No story titled "Pages\/Lost"/) })
    await expect(layout(config, { board: 'Lost.dc.html' })).rejects.toThrow(/No story titled "Pages\/Lost"/)
  })

  it('draws the story from the project’s storyPage() hook instead of a built Storybook', { timeout: 60000 }, async () => {
    const { dir, config } = project({ hooks: 'hooks.mjs' })
    write(dir, 'assets/story.css', 'footer { background: #fdd }')
    write(dir, 'hooks.mjs', `export const storyPage = ({ board, story }) => ({ html: '<!doctype html><link rel="stylesheet" href="/story.css"><body style="margin:0">' + ${JSON.stringify(body(80))} + '</body>', assets: ${JSON.stringify(join(dir, 'assets'))} })`)
    const { results } = await layout({ ...config, storybook: join(dir, 'no-such-storybook') }, { board: 'Ticket.dc.html' })
    expect(results[0]).toMatchObject({ status: 'within', state: 'the project’s storyPage() hook' })
  })
})
