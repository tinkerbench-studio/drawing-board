import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { boardsOf, buildSnapshot, copyHash, isMapFile, mapPath, notCopiedNotes, parseMap, parseTokens, refreshedNames, screensOf, snapshotOptions, type BoardMap } from './snapshot.ts'
import { SnapshotError } from './sample.ts'

const tokens = readFileSync(new URL('./fixtures/tokens.json', import.meta.url), 'utf8')
const canvas = { boards: { 'B.dc.html': { w: 100, h: 50, title: 'B', page: 'p' }, 'A.dc.html': { w: 10, h: 20 } } }

describe('boardsOf', () => {
  it('lists the boards sorted by file, without their positions', () => {
    expect(boardsOf({ boards: { ...canvas.boards, 'A.dc.html': { w: 10, h: 20, x: 5, y: 9 } } })).toEqual([
      { file: 'A.dc.html', title: null, page: null, w: 10, h: 20 },
      { file: 'B.dc.html', title: 'B', page: 'p', w: 100, h: 50 },
    ])
  })

  it('leaves out the boards of a ticket prototype page', () => {
    const withPrototypes = {
      pages: [
        { id: 'p', name: 'Web app' },
        { id: 'x1', name: 'TCK-200' },
      ],
      boards: { ...canvas.boards, 'Ticket.TCK-200.dc.html': { w: 1, h: 1, page: 'x1' }, 'Old.dc.html': { w: 1, h: 1, page: 'proto-tck-153' } },
    }
    expect(boardsOf(withPrototypes).map(b => b.file)).toEqual(['A.dc.html', 'B.dc.html'])
    expect(() => boardsOf({ pages: withPrototypes.pages, boards: { 'T.dc.html': { w: 1, h: 1, page: 'x1' } } })).toThrow(/outside prototype pages/)
  })

  it('takes another test for prototype pages', () => {
    const shared = { pages: [{ id: 'prototypes', name: 'Prototypes' }], boards: { ...canvas.boards, 'NOK12Case.dc.html': { w: 1, h: 1, page: 'prototypes' } } }
    expect(boardsOf(shared).map(b => b.file)).toEqual(['A.dc.html', 'B.dc.html', 'NOK12Case.dc.html'])
    expect(boardsOf(shared, /^prototypes\b/i).map(b => b.file)).toEqual(['A.dc.html', 'B.dc.html'])
  })

  it.each([[{}], [{ boards: {} }], [{ boards: { 'x.html': { w: 1, h: 1 } } }], [{ boards: { 'A.dc.html': {} } }]])('refuses a shape it does not know: %j', canvasShape => {
    expect(() => boardsOf(canvasShape)).toThrow(SnapshotError)
  })
})

describe('parseTokens', () => {
  it('keeps any JSON object as it is, and refuses what is not one', () => {
    expect(parseTokens(tokens)).toEqual(JSON.parse(tokens))
    expect(() => parseTokens('[1]')).toThrow(/not a JSON object/)
    expect(() => parseTokens('{')).toThrow(/not JSON/)
  })
})

describe('buildSnapshot', () => {
  const map: BoardMap = { 'A.dc.html': { story: 'Library/A' }, 'B.dc.html': { none: 'later' } }
  const read = (file: string) => (file === 'A.dc.html' ? '<div data-component="Tile"><b data-sample="a.b">1</b></div>' : undefined)

  it('writes the tokens, a copy of each screen and one metadata file per board', () => {
    const snap = buildSnapshot({ canvas, tokensText: tokens, version: 'v1', map, read })
    expect(screensOf(map)).toEqual(['A.dc.html'])
    expect(Object.keys(snap.files).sort()).toEqual(['boards/A.dc.html', 'boards/A.meta.json', 'boards/B.meta.json', 'tokens.json'])
    expect(snap.boards.copies).toEqual({ 'A.dc.html': copyHash(read('A.dc.html')!) })
    expect(snap.boards.versions).toEqual({ 'A.dc.html': 'v1' })
    expect(JSON.parse(snap.files['boards/A.meta.json']!)).toEqual({ file: 'A.dc.html', title: null, page: null, w: 10, h: 20, copy: { hash: copyHash(read('A.dc.html')!), version: 'v1' }, samples: { 'a.b': '1' }, components: { Tile: '<b>1</b>' } })
    expect(JSON.parse(snap.files['boards/B.meta.json']!)).toEqual({ file: 'B.dc.html', title: 'B', page: 'p', w: 100, h: 50 })
    expect(snap.samples).toEqual({ 'A.dc.html': { 'a.b': '1' } })
    expect(snap.components).toEqual({ 'A.dc.html': { Tile: '<b>1</b>' } })
  })

  it("keeps a copy's version while its hash is unchanged, and moves it when the copy changes", () => {
    const first = buildSnapshot({ canvas, tokensText: tokens, version: 'v1', map, read })
    const previous = (file: string) => first.metas.find(m => m.file === file)
    const same = buildSnapshot({ canvas, tokensText: tokens, version: 'v2', map, read, previous })
    expect(same.files).toEqual(first.files)
    const edited = buildSnapshot({ canvas, tokensText: tokens, version: 'v2', map, read: file => (file === 'A.dc.html' ? '<p>edited</p>' : undefined), previous })
    expect(edited.boards.versions).toEqual({ 'A.dc.html': 'v2' })
    expect(edited.files['boards/B.meta.json']).toBe(first.files['boards/B.meta.json'])
  })

  it('refuses, writing nothing, a screen the canvas lacks or a screen that was not read', () => {
    expect(() => buildSnapshot({ canvas, tokensText: tokens, version: 'v', map: { 'Z.dc.html': { story: 's' } }, read })).toThrow(/not on the canvas/)
    expect(() => buildSnapshot({ canvas, tokensText: tokens, version: 'v', map: { 'B.dc.html': { story: 's' } }, read })).toThrow(/was not read/)
  })
})

describe('buildSnapshot with only', () => {
  const two = { boards: { 'A.dc.html': { w: 10, h: 20 }, 'B.dc.html': { w: 30, h: 40 }, 'C.dc.html': { w: 5, h: 5 } } }
  const map: BoardMap = { 'A.dc.html': { story: 'L/A' }, 'B.dc.html': { story: 'L/B' }, 'C.dc.html': { none: 'later' } }
  const old = (file: string) => `<b data-sample="${file[0]!.toLowerCase()}.v">old</b>`
  const first = buildSnapshot({ canvas: two, tokensText: tokens, version: 'v1', map, read: old })
  const existing = first.metas
  // The canvas has moved on: B and C changed size, and B's copy changed, after the committed snapshot.
  const moved = { boards: { 'A.dc.html': { w: 11, h: 21 }, 'B.dc.html': { w: 99, h: 99 }, 'C.dc.html': { w: 1, h: 1 } } }
  const read = (file: string) => (file === 'A.dc.html' ? '<b data-sample="a.v">new</b>' : '<b data-sample="b.v">moved on</b>')
  const partial = (only: string[], more: object = {}) => buildSnapshot({ canvas: moved, tokensText: tokens, version: 'v2', map, read, previous: f => existing.find(m => m.file === f), existing, only, ...more })

  it('writes only the named boards and keeps the others as committed', () => {
    const snap = partial(['A.dc.html'])
    expect(Object.keys(snap.files).sort()).toEqual(['boards/A.dc.html', 'boards/A.meta.json'])
    expect(snap.boards.boards).toEqual([{ file: 'A.dc.html', title: null, page: null, w: 11, h: 21 }, first.boards.boards[1], first.boards.boards[2]])
    expect(snap.boards.versions).toEqual({ 'A.dc.html': 'v2', 'B.dc.html': 'v1' })
    expect(snap.boards.copies['B.dc.html']).toBe(first.boards.copies['B.dc.html'])
    expect(snap.samples['B.dc.html']).toEqual(first.samples['B.dc.html'])
  })

  it('writes the tokens only when asked, and the metadata of a named board with no story', () => {
    expect(Object.keys(partial(['C.dc.html']).files)).toEqual(['boards/C.meta.json'])
    expect(Object.keys(partial(['C.dc.html'], { tokens: true }).files).sort()).toEqual(['boards/C.meta.json', 'tokens.json'])
  })

  it('still refuses a named board the canvas lacks, or a named screen that was not read', () => {
    expect(() => partial(['Z.dc.html'])).toThrow(/not on the canvas/)
    expect(() => buildSnapshot({ canvas: moved, tokensText: tokens, version: 'v2', map, read: () => undefined, existing, only: ['B.dc.html'] })).toThrow(/was not read/)
  })
})

describe('the per-board map entries', () => {
  it('keys each entry by its board file, sorted by file', () => {
    expect(parseMap({ 'B.map.json': '{"none":"x"}', 'A.map.json': '{"story":"S"}', '../x/C.map.json': '{}' })).toEqual({ 'A.dc.html': { story: 'S' }, 'B.dc.html': { none: 'x' }, 'C.dc.html': {} })
    expect(Object.keys(parseMap({ 'B.map.json': '{}', 'A.map.json': '{}' }))).toEqual(['A.dc.html', 'B.dc.html'])
  })

  it('names the file that is not an object or not JSON', () => {
    expect(() => parseMap({ 'A.map.json': '[]' })).toThrow(/A\.map\.json is not a map entry object/)
    expect(() => parseMap({ 'A.map.json': '{' })).toThrow(/A\.map\.json is not JSON/)
  })

  it('has a path for a board and knows its files', () => {
    expect(mapPath('Ticket.dc.html')).toBe('boards/Ticket.map.json')
    expect(isMapFile('Ticket.map.json')).toBe(true)
    expect(isMapFile('Ticket.meta.json')).toBe(false)
  })

  it('leaves the map entries when a refresh clears boards/', () => {
    expect(refreshedNames(['A.dc.html', 'A.meta.json', 'A.map.json', 'support.js'])).toEqual(['A.dc.html', 'A.meta.json', 'support.js'])
  })
})

describe('notCopiedNotes', () => {
  const map: BoardMap = { 'A.dc.html': { story: 'L/A' }, 'B.dc.html': { none: 'not in the snapshot yet' } }
  it('says why a named none board, and one with no map entry, was not copied', () => {
    expect(notCopiedNotes(['A.dc.html', 'B.dc.html', 'C.dc.html'], map)).toEqual([
      'B.dc.html is mapped none (not in the snapshot yet), so its markup was not copied: map it to a story in boards/B.map.json, then refresh it again.',
      'C.dc.html has no map entry (boards/C.map.json), so its markup was not copied: map it to a story in boards/C.map.json, then refresh it again.',
    ])
  })
  it('says nothing for a board a story shows, or for a full refresh', () => {
    expect(notCopiedNotes(['A.dc.html'], map)).toEqual([])
    expect(notCopiedNotes([], map)).toEqual([])
  })
})

describe('snapshotOptions', () => {
  const base = ['--from', 'in', '--version', 'v9']
  it('is a full refresh without --boards, and a partial one with the boards named once each', () => {
    expect(snapshotOptions(base)).toEqual({ from: 'in', version: 'v9', tokens: false })
    expect(snapshotOptions([...base, '--boards', 'A.dc.html, B.dc.html,A.dc.html', '--tokens'])).toEqual({ from: 'in', version: 'v9', only: ['A.dc.html', 'B.dc.html'], tokens: true })
  })

  it.each([[['--boards']], [['--boards=A.dc.html']], [['--boards', '--tokens']], [['--boards', ' , ']], [['--tokens']]])('refuses %j rather than refresh everything', extra => {
    expect(() => snapshotOptions([...base, ...extra])).toThrow(SnapshotError)
  })

  it('needs --from and --version', () => {
    expect(() => snapshotOptions(['--boards', 'A.dc.html'])).toThrow(/Usage/)
  })
})
