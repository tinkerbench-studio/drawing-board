import { describe, expect, it } from 'vitest'

import { SnapshotError } from './sample.ts'
import { copyHash, TICKET_PAGE, type BoardMeta } from './snapshot.ts'
import { canvasStatus } from './status.ts'

const limits = { files: 512, headroom: 16 }
const meta = (file: string, page: string | null, source?: string): BoardMeta => ({ file, title: null, page, w: 1, h: 1, ...(source === undefined ? {} : { copy: { hash: copyHash(source), version: 'v1' } }) })
const canvas = (boards: Record<string, string | null>, designSystems: object[] = []) => JSON.stringify({ pages: [{ id: 'main' }, { id: 'p', name: 'TCK-9' }], designSystems, boards: Object.fromEntries(Object.entries(boards).map(([file, page]) => [file, { w: 1, h: 1, page }])) })
const folder = (files: Record<string, string>) => (path: string) => files[path]
const status = (files: Record<string, string>, metas: BoardMeta[], more: object = {}) => canvasStatus({ from: 'read', read: folder(files), paths: Object.keys(files), tokens: 'tokens.json', metas, prototype: TICKET_PAGE, limits, record: {}, ...more })

describe('canvasStatus', () => {
  it('says the snapshot is in step, counting every board canvas.json lists (prototypes too), when nothing differs', () => {
    const found = status({ 'canvas.json': canvas({ 'A.dc.html': 'main', 'Proto.dc.html': 'p' }), 'A.dc.html': '<p>a</p>' }, [meta('A.dc.html', 'main', '<p>a</p>')])
    expect(found.lines).toEqual(['The snapshot is in step with the canvas read.'])
    expect(found.files).toEqual({ line: 'Canvas files: 4 of 512 in use, 508 free.', warning: false })
  })

  it('names a board with no meta file and a meta file of a board no longer there, never a prototype', () => {
    const found = status({ 'canvas.json': canvas({ 'A.dc.html': 'main', 'New.dc.html': 'main', 'Proto.dc.html': 'p' }) }, [meta('A.dc.html', 'main'), meta('Gone.dc.html', 'main')])
    expect(found.added).toEqual(['New.dc.html'])
    expect(found.removed).toEqual(['Gone.dc.html'])
    expect(found.lines).toEqual(['On the canvas with no meta file: New.dc.html. A full refresh adds them, or name them with --boards.', 'In the snapshot but no longer on the canvas: Gone.dc.html. A full refresh removes them.'])
  })

  it('names a board on another page, a copy changed on the canvas, and a copy the folder does not hold', () => {
    expect(status({ 'canvas.json': canvas({ 'Z.dc.html': 'b', 'Y.dc.html': 'b' }) }, [meta('Z.dc.html', 'a'), meta('Y.dc.html', 'a')]).moved.map(m => m.file)).toEqual(['Y.dc.html', 'Z.dc.html'])
    const found = status({ 'canvas.json': canvas({ 'A.dc.html': 'admin', 'B.dc.html': 'main', 'C.dc.html': 'main' }), 'B.dc.html': '<p>new</p>' }, [meta('A.dc.html', 'main'), meta('B.dc.html', 'main', '<p>old</p>'), meta('C.dc.html', 'main', '<p>c</p>')])
    expect(found.moved).toEqual([{ file: 'A.dc.html', snapshot: 'main', canvas: 'admin' }])
    expect(found.changed).toEqual(['B.dc.html'])
    expect(found.unread).toEqual(['C.dc.html'])
    expect(found.lines).toEqual(['A.dc.html is on the page admin on the canvas, main in the snapshot.', "Changed on the canvas since the snapshot's copy: B.dc.html.", 'Not in the folder, so not compared: C.dc.html.'])
  })

  it("counts the design system's files read, and warns when few files are free", () => {
    const installed = [{ namespace: 'acme', version: '3' }]
    const files = { 'canvas.json': canvas({ 'A.dc.html': 'main' }, installed), 'tokens.json': '{}', ...Object.fromEntries(Array.from({ length: 499 }, (_, n) => [`ds/acme/f${n}.js`, ''])) }
    const found = status(files, [meta('A.dc.html', 'main')], { record: { designSystems: { acme: '3' } } })
    expect(found.files.warning).toBe(true)
    expect(found.files.line).toMatch(/^Canvas files: 502 of 512 in use, 10 free\. Fewer than 16/)
  })

  it("says the count is a lower bound when the read holds none of an installed design system's files", () => {
    const found = status({ 'canvas.json': canvas({ 'A.dc.html': 'main' }, [{ namespace: 'acme', version: '3' }]) }, [meta('A.dc.html', 'main')], { record: { designSystems: { acme: '3' } } })
    expect(found.files.line).toBe('Canvas files: at least 3 of 512 in use, at most 509 free: the folder holds no files of the design system acme under project/ds/, so they were not read and not counted.')
  })

  it('compares the design systems installed with the record and with the setting', () => {
    const installed = [{ title: 'Acme', namespace: 'acme', version: '4' }, { namespace: 'icons', version: '1' }]
    const found = status({ 'canvas.json': canvas({ 'A.dc.html': 'main' }, installed) }, [meta('A.dc.html', 'main')], { record: { designSystems: { acme: '3', icons: '1', old: '2' } }, expected: { acme: '5', icons: '1', fonts: '1' } })
    expect(found.designSystems).toEqual([
      'design system "acme": 4 on the canvas, 3 in artifact.json: refresh to record it.',
      'design system "old": none on the canvas, 2 in artifact.json: refresh to record it.',
      'design system "acme": installed 4, expected 5: install it again on the canvas, then refresh.',
      'design system "fonts": not installed, expected 1: install it on the canvas, then refresh.',
    ])
  })

  it('refuses a folder with no canvas.json, naming the path', () => {
    expect(() => status({}, [])).toThrow(SnapshotError)
    expect(() => status({}, [])).toThrow('read/project/canvas.json was not found')
  })
})
