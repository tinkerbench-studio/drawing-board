// The browser half of the pictures: `drawing-board story-shot` and `drawing-board compare-pictures`. They need
// playwright-core (an optional peer dependency) and a Chromium, from PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH when set.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, extname, join, resolve, sep } from 'node:path'

import { changeNote, compareFile, CONTENT_TYPES, pairPictures, storyIds, storyUrl, storyVariants, type CompareOptions, type StoryShotOptions } from './pictures.ts'

export const launch = async () => {
  let playwright: typeof import('playwright-core')
  try {
    playwright = await import('playwright-core')
  } catch {
    throw new Error('Pictures need playwright-core: npm install --save-dev playwright-core, and a Chromium (PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH).')
  }
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  return playwright.chromium.launch(executablePath === undefined ? {} : { executablePath })
}

/** Serves a folder on a free local port, refusing any path outside it. */
export const serve = (root: string): Promise<{ server: Server; base: string }> => {
  const server = createServer((req, res) => {
    const path = resolve(join(root, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)))
    if (path !== root && !path.startsWith(root + sep)) return void res.writeHead(403).end()
    if (!existsSync(path) || !statSync(path).isFile()) return void res.writeHead(404).end()
    res.writeHead(200, { 'content-type': CONTENT_TYPES[extname(path)] ?? 'application/octet-stream' }).end(readFileSync(path))
  })
  return new Promise(done => server.listen(0, '127.0.0.1', () => done({ server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` })))
}

/** Pictures of one story from a built Storybook, in each variant; or, with --list, the story ids. */
export const storyShot = async (options: StoryShotOptions): Promise<void> => {
  const dir = resolve(options.dir)
  if (!existsSync(join(dir, 'iframe.html'))) throw new Error(`${dir} is not a built Storybook (no iframe.html): build Storybook first`)
  if (options.list) return void console.log(storyIds(JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))).join('\n'))
  const { server, base } = await serve(dir)
  const browser = await launch()
  try {
    for (const v of storyVariants(options, resolve(options.out!))) {
      const page = await browser.newPage({ viewport: { width: v.width, height: 800 } })
      await page.goto(storyUrl(base, options.id!, v.theme), { waitUntil: 'networkidle' })
      await page.waitForSelector('#storybook-root > *, #root > *, .sb-errordisplay:visible', { timeout: 15000 }).catch(() => {
        throw new Error(`story ${options.id} drew nothing in 15 s: is the id in the build? (--list)`)
      })
      if (await page.locator('.sb-errordisplay:visible').count()) throw new Error(`Storybook shows an error for ${options.id}: ${(await page.locator('.sb-errordisplay').first().innerText()).slice(0, 300)}`)
      await page.evaluate(() => document.fonts.ready)
      mkdirSync(dirname(v.out), { recursive: true })
      await page.screenshot({ path: v.out, fullPage: true })
      await page.close()
      console.log(`${options.id} -> ${v.out}`)
    }
  } finally {
    await browser.close()
    server.close()
  }
}

/**
 * Runs in the browser: the two pictures with what changed outlined in red, and how many regions on each side. The
 * rows are lined up first (the longest common run of identical rows), so a change that pushes the rest of a page down
 * outlines only the change, not everything below it; then each band of unmatched rows is outlined over the content it
 * holds. Columns left of `fromX` (a sidebar that is the same on both sides) are left out.
 */
const outlineChanges = async ([beforeUrl, afterUrl, fromX]: [string, string, number]) => {
  const load = (url: string) => new Promise<HTMLImageElement>(done => Object.assign(new Image(), { onload: (e: Event) => done(e.target as HTMLImageElement), src: url }))
  const draw = (img: HTMLImageElement) => {
    const canvas = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height })
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    return { canvas, ctx, data: ctx.getImageData(0, 0, img.width, img.height) }
  }
  type Side = ReturnType<typeof draw>
  const a = draw(await load(beforeUrl))
  const b = draw(await load(afterUrl))
  const rowHashes = ({ data }: Side) => {
    const px = new Uint32Array(data.data.buffer)
    return Array.from({ length: data.height }, (_, y) => {
      let h = 2166136261
      for (let x = fromX; x < data.width; x++) h = Math.imul(h ^ px[y * data.width + x]!, 16777619)
      return h >>> 0
    })
  }
  const ha = rowHashes(a)
  const hb = rowHashes(b)
  const n = ha.length
  const m = hb.length
  const table = new Uint16Array((n + 1) * (m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) table[i * (m + 1) + j] = ha[i] === hb[j] ? table[(i + 1) * (m + 1) + j + 1]! + 1 : Math.max(table[(i + 1) * (m + 1) + j]!, table[i * (m + 1) + j + 1]!)
  const changedA = new Array<boolean>(n).fill(true)
  const changedB = new Array<boolean>(m).fill(true)
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (ha[i] === hb[j]) {
      changedA[i] = changedB[j] = false
      i++
      j++
    } else if (table[(i + 1) * (m + 1) + j]! >= table[i * (m + 1) + j + 1]!) i++
    else j++
  }
  const outline = (side: Side, changed: boolean[]) => {
    const px = new Uint32Array(side.data.data.buffer)
    const { width, height } = side.data
    const regions: [number, number, number, number][] = []
    for (let y = 0; y < height; ) {
      if (!changed[y]) {
        y++
        continue
      }
      let end = y
      let gap = 0
      for (let k = y; k < height && gap <= 8; k++) {
        if (changed[k]) {
          end = k
          gap = 0
        } else gap++
      }
      // Over the band's rows, the columns that hold anything but the row's own background (its right-hand edge).
      let left = width
      let right = -1
      for (let r = y; r <= end; r++)
        for (let x = fromX; x < width; x++)
          if (px[r * width + x] !== px[r * width + width - 1]) {
            left = Math.min(left, x)
            right = Math.max(right, x)
          }
      if (right >= left) regions.push([Math.max(0, left - 4), Math.max(0, y - 4), Math.min(width, right + 5), Math.min(height, end + 5)])
      y = end + 1
    }
    side.ctx.lineWidth = 2
    for (const [x0, y0, x1, y1] of regions) {
      side.ctx.fillStyle = 'rgba(255,40,40,0.10)'
      side.ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
      side.ctx.strokeStyle = '#ff2828'
      side.ctx.strokeRect(x0, y0, x1 - x0, y1 - y0)
    }
    return regions.length
  }
  const regionsBefore = outline(a, changedA)
  const regionsAfter = outline(b, changedB)
  return { before: a.canvas.toDataURL(), after: b.canvas.toDataURL(), regionsBefore, regionsAfter }
}

/** Each picture in both folders, before beside after under banners, with what changed outlined; returns the regions found per picture. */
export const comparePictures = async (options: CompareOptions): Promise<Record<string, number>> => {
  const [before, after, out] = [options.before, options.after, options.out].map(p => resolve(p)) as [string, string, string]
  const image = (path: string) => `data:image/png;base64,${readFileSync(path).toString('base64')}`
  const banner = (colour: string, text: string) => `<div style="background:${colour};color:#fff;font:600 13px system-ui;padding:6px 10px">${text}</div>`
  const column = (colour: string, text: string, url: string) => `<div style="width:1100px;flex:none">${banner(colour, text)}<img style="max-width:100%;display:block;border:1px solid #ccc" src="${url}"></div>`
  mkdirSync(out, { recursive: true })
  const found: Record<string, number> = {}
  const browser = await launch()
  try {
    for (const name of pairPictures(readdirSync(before), readdirSync(after))) {
      const picture = name.replace(/\.png$/, '')
      const tab = await browser.newPage({ viewport: { width: 2250, height: 700 } })
      await tab.setContent('<body></body>')
      const marked = await tab.evaluate(outlineChanges, [image(join(before, name)), image(join(after, name)), options.fromX] as [string, string, number])
      await tab.setContent(`<body style="margin:0;background:#fff"><div style="display:flex;gap:16px;padding:8px;align-items:flex-start">${column('#8a8f98', `${options.left} · ${picture}`, marked.before)}${column('#1f7a4d', `${options.right} · ${picture} · ${changeNote(marked.regionsAfter)}`, marked.after)}</div></body>`)
      await tab.screenshot({ path: join(out, compareFile(name)), fullPage: true })
      await tab.close()
      found[name] = marked.regionsBefore + marked.regionsAfter
      console.log(`${compareFile(name)}: ${changeNote(marked.regionsBefore + marked.regionsAfter)}`)
    }
  } finally {
    await browser.close()
  }
  return found
}
