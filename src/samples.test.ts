import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { viteJsonGlob } from './glob-plugin.ts'
import { createCanvasSamples } from './samples.ts'
import type { BoardMeta } from './snapshot.ts'

const meta = (file: string, extra: Partial<BoardMeta> = {}): BoardMeta => ({ file, title: null, page: null, w: 1, h: 1, ...extra })
const COPY = { hash: 'h', version: 'v1' }

describe('createCanvasSamples', () => {
  const { canvasSample, canvasHas, canvasKeys } = createCanvasSamples({
    './a.meta.json': meta('A.dc.html', { copy: COPY, samples: { 'page.title': 'Hello', 'page.sub': 'World' } }),
    './b.meta.json': meta('B.dc.html', { copy: COPY }),
    './c.meta.json': meta('C.dc.html', { samples: { 'x.y': 'not copied' } }),
  })

  it('reads a value the board marks', () => expect(canvasSample('A.dc.html', 'page.title')).toBe('Hello'))
  it('names the board and key when the snapshot lacks it', () => expect(() => canvasSample('A.dc.html', 'page.nope')).toThrow(/page\.nope.*A\.dc\.html.*refresh/))
  it('ignores a board whose copy was never read', () => expect(canvasHas('C.dc.html', 'x.y')).toBe(false))
  it('says whether a key is marked, and lists keys in order; none for a board that marks nothing', () => {
    expect(canvasHas('A.dc.html', 'page.sub')).toBe(true)
    expect(canvasHas('A.dc.html', 'page.nope')).toBe(false)
    expect(canvasKeys('A.dc.html')).toEqual(['page.title', 'page.sub'])
    expect(canvasKeys('B.dc.html')).toEqual([])
    expect(canvasKeys('Missing.dc.html')).toEqual([])
  })
})

describe('viteJsonGlob', () => {
  it("bundles a board's meta file, read from disk through the glob, into canvasSample", async () => {
    const esbuild = await import('esbuild')
    const dir = mkdtempSync(join(tmpdir(), 'db-samples-'))
    mkdirSync(join(dir, 'boards'))
    writeFileSync(join(dir, 'boards', 'Home.meta.json'), JSON.stringify(meta('Home.dc.html', { copy: COPY, samples: { 'page.title': 'From disk' } })))
    writeFileSync(join(dir, 'boards', 'Other.txt'), 'not json')
    const entry = join(dir, 'read.ts')
    writeFileSync(
      entry,
      `import { createCanvasSamples } from ${JSON.stringify(join(import.meta.dirname, 'samples.ts'))}
export const { canvasSample } = createCanvasSamples(import.meta.glob<any>('./boards/*.meta.json', { eager: true, import: 'default' }))
export const untouched = import.meta.glob('./boards/*.txt')
`,
    )
    const out = join(dir, 'out.mjs')
    await esbuild.build({ entryPoints: [entry], outfile: out, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent', plugins: [viteJsonGlob()] })
    expect(readFileSync(out, 'utf8')).toContain('import.meta.glob(') // the non-JSON glob is left for the project to handle
    const { canvasSample } = (await import(out)) as { canvasSample: (b: string, k: string) => string }
    expect(canvasSample('Home.dc.html', 'page.title')).toBe('From disk')
  })
})
