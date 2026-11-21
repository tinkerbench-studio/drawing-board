// The browser half end to end. It needs a Chromium: PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH (CI sets it to the runner's
// Chrome); without one these tests are skipped.
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { fallbackChromium, thisMachine } from './chromium.ts'
import { comparePictures, launch, serve, storyShot, whichChromium } from './pictures-run.ts'

const chromium = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH

/** Draws each page's markup to a PNG named after it, in a new folder. */
const pictures = async (pages: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), 'drawing-board-pictures-'))
  const { chromium: browser } = await import('playwright-core')
  const b = await browser.launch({ executablePath: chromium! })
  try {
    for (const [name, html] of Object.entries(pages)) {
      const page = await b.newPage({ viewport: { width: 400, height: 300 } })
      await page.setContent(`<body style="margin:0;background:#fff;font:16px sans-serif">${html}</body>`)
      await page.screenshot({ path: join(dir, name) })
      await page.close()
    }
  } finally {
    await b.close()
  }
  return dir
}

// With no variable and no setting, a machine whose playwright-core build is missing (a Claude Code cloud session
// pins its own) still starts a Chromium from a known place. Skipped on a machine with none.
const unset = { ...thisMachine(), env: { ...process.env, PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: undefined } }
describe.skipIf(fallbackChromium(unset) === undefined)('launch with nothing named', () => {
  it('starts a Chromium: playwright-core\'s own, else a known place', { timeout: 60000 }, async () => {
    const chosen = await whichChromium({ machine: unset })
    expect(['playwright-core', 'known place']).toContain(chosen.source)
    const browser = await launch({ machine: unset })
    try {
      const page = await browser.newPage()
      await page.setContent('<h1>Trips</h1>')
      expect(await page.textContent('h1')).toBe('Trips')
    } finally {
      await browser.close()
    }
  })
})

describe.skipIf(chromium === undefined)('compare-pictures in Chromium', () => {
  it('outlines what changed, sees nothing in a picture that did not, and skips one with no pair', { timeout: 60000 }, async () => {
    const top = '<h1 style="margin:20px">Trips</h1>'
    const before = await pictures({ 'same.png': top, 'page.png': `${top}<p style="margin:20px">Paris</p>`, 'gone.png': top })
    const after = await pictures({ 'same.png': top, 'page.png': `${top}<p style="margin:20px">Lisbon, for three nights</p>` })
    const out = join(mkdtempSync(join(tmpdir(), 'drawing-board-out-')), 'compared')
    const found = await comparePictures({ before, after, out, fromX: 0, left: 'BEFORE', right: 'AFTER' })
    expect(found['same.png']).toBe(0)
    expect(found['page.png']).toBeGreaterThan(0)
    expect(readdirSync(out).sort()).toEqual(['page-before-after.png', 'same-before-after.png'])
  })
})

describe('story-shot', () => {
  it('lists the story ids of a built Storybook with no browser, and refuses a folder that is not one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-board-storybook-'))
    mkdirSync(dir, { recursive: true })
    await expect(storyShot({ dir, list: true })).rejects.toThrow(/not a built Storybook/)
    writeFileSync(join(dir, 'iframe.html'), '<html></html>')
    writeFileSync(join(dir, 'index.json'), JSON.stringify({ entries: { a: { id: 'pages-a--one' }, d: { id: 'pages-a--docs', type: 'docs' } } }))
    const logged: string[] = []
    const log = console.log
    console.log = (line: string) => void logged.push(line)
    try {
      await storyShot({ dir, list: true })
    } finally {
      console.log = log
    }
    expect(logged).toEqual(['pages-a--one'])
  })
})

describe('serve', () => {
  it('serves a Storybook built under a path both there and at the root, and nothing outside its folder', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-board-serve-'))
    mkdirSync(join(dir, 'assets'))
    writeFileSync(join(dir, 'iframe.html'), '<script type="module" src="/storybook/assets/iframe.js"></script>')
    writeFileSync(join(dir, 'assets/iframe.js'), 'export {}')
    const { server, base } = await serve(dir)
    try {
      const status = async (path: string) => (await fetch(`${base}${path}`)).status
      expect(await status('/storybook/assets/iframe.js')).toBe(200)
      expect(await status('/assets/iframe.js')).toBe(200)
      expect(await status('/storybook/iframe.html')).toBe(200)
      expect(await status('/storybook/../../etc/passwd')).not.toBe(200)
      expect(await status('/storybook/assets/missing.js')).toBe(404)
    } finally {
      server.close()
    }
  })
})
