import { describe, expect, it } from 'vitest'

import { componentProblems, coverageProblems, designSystemWarnings, duplicateBoardProblems, filesInUse, metaCountBound, missingBoardWarnings, noneWarnings, pageProblems, publishedProblems, recordProblems, snapshotProblems, storyIndexProblems, tagWarnings, unreadBound, tokenBoardProblems, tokenEntries, unmarkedSampleWarnings } from './check.ts'
import { copyHash, indexOf, storyIndexOf, type BoardMap, type BoardMeta } from './snapshot.ts'

const meta = (file: string, source?: string): BoardMeta => ({ file, title: null, page: null, w: 1, h: 1, ...(source === undefined ? {} : { copy: { hash: copyHash(source), version: 'v1' } }) })

describe('tokenEntries', () => {
  it("finds every token whatever the file's shape", () => {
    const tickit = { color: { tokens: [{ name: 'bg', values: { dark: '#000', light: '#fff' } }] }, type: { families: { sans: 'Inter' } }, elevation: { tokens: [{ name: 'e1', value: '0 1px' }] } }
    expect(tokenEntries(tickit)).toEqual([
      ['bg', ['#000', '#fff']],
      ['sans', ['Inter']],
      ['e1', ['0 1px']],
    ])
    const nookivia = { color: { tokens: [{ name: 'paper', value: '#fffdf9' }] }, shadow: [{ name: 'card', value: '0 2px' }] }
    expect(tokenEntries(nookivia)).toEqual([
      ['paper', ['#fffdf9']],
      ['card', ['0 2px']],
    ])
  })
})

describe('tokenBoardProblems', () => {
  const tokens = { color: { tokens: [{ name: 'paper', value: '#FFFDF9' }] } }
  it('passes a board that shows each token by name and value, whatever the case', () => {
    expect(tokenBoardProblems(tokens, '<td>--paper</td><td>#fffdf9</td>')).toEqual([])
  })
  it("names a token the board does not show, and does not count the board's own stylesheet", () => {
    expect(tokenBoardProblems(tokens, '<style>:root{--paper:#fffdf9}</style><td>nothing</td>')).toEqual(['token --paper is in tokens.json but the tokens board does not show it.', 'token --paper is #FFFDF9 in tokens.json but the tokens board does not show that value.'])
  })
})

describe('coverageProblems', () => {
  const index = indexOf([meta('A.dc.html', 'a'), meta('B.dc.html'), meta('C.dc.html')])
  const map: BoardMap = { 'A.dc.html': { story: 'L/A' }, 'B.dc.html': { none: 'a spec' }, 'C.dc.html': { story: 'L/C' } }
  it('passes when every board is mapped, every story exists and every mapped board has a copy', () => {
    expect(coverageProblems(index, map, ['L/A', 'L/C'], ['A.dc.html', 'C.dc.html'])).toEqual([])
  })
  it('names an unmapped board, a missing story, a missing copy, a stale entry and a stray copy', () => {
    const problems = coverageProblems(indexOf([meta('A.dc.html'), meta('B.dc.html'), meta('C.dc.html'), meta('D.dc.html')]), { ...map, 'B.dc.html': {}, 'Z.dc.html': { none: 'gone' } }, ['L/A'], ['A.dc.html', 'B.dc.html'])
    expect(problems).toEqual([
      'B.dc.html: its map entry names no story and gives no reason.',
      'C.dc.html: the story "L/C" does not exist.',
      'D.dc.html is on the canvas but has no map entry: add boards/D.map.json to map it to a story, or say why there is none.',
      'Z.dc.html has a map entry (boards/Z.map.json) but is no longer on the canvas.',
      'boards/B.dc.html is a copy of a board no story shows.',
    ])
  })
})

describe('a board mapped to a story with no copy', () => {
  it('fails, naming the board', () => {
    const index = indexOf([meta('A.dc.html')])
    expect(coverageProblems(index, { 'A.dc.html': { story: 'L/A' } }, ['L/A'], [])).toEqual(['A.dc.html: has a story but no copy in boards/: refresh the snapshot.'])
  })
})

describe('noneWarnings', () => {
  const map: BoardMap = { 'Card.dc.html': { none: 'not in the snapshot yet' }, 'Spec.dc.html': { none: 'a spec' }, 'Done.dc.html': { none: 'built in NOK-1' }, 'Late.dc.html': { none: 'not built yet' }, 'A.dc.html': { story: 'L/A' } }
  it('warns when a story names a none board, by file or by name', () => {
    expect(noneWarnings({ 'Card.dc.html': map['Card.dc.html']! }, { 'card.stories.tsx': "// Card.dc.html\ntitle: 'L/Card'" })).toEqual(['Card.dc.html is mapped none, but card.stories.tsx names it: map it to its story in boards/Card.map.json and refresh the snapshot, or its markup is never committed. If `none` is right as it is, add "keepNone": "why" to that map file.'])
    expect(noneWarnings({ 'Card.dc.html': { none: 'x' } }, { 's.tsx': 'the Card board' })).toHaveLength(1)
  })
  it('does not match a longer name, so BigCard is not Card', () => {
    expect(noneWarnings({ 'Card.dc.html': { none: 'x' } }, { 's.tsx': 'BigCard Card-2 cards' })).toEqual([])
  })
  it('warns when the note says the board is built, but not "not built yet"', () => {
    expect(noneWarnings(map, {})).toEqual(['Done.dc.html is mapped none, but its note says it is built ("built in NOK-1"): map it to its story in boards/Done.map.json and refresh the snapshot, or its markup is never committed. If `none` is right as it is, add "keepNone": "why" to that map file.'])
  })
  it('does not read a bare name in prose as naming the board', () => {
    expect(noneWarnings({ 'States.dc.html': { none: 'x' } }, { 's.tsx': "label: 'United States'" })).toEqual([])
    expect(noneWarnings({ 'States.dc.html': { none: 'x' } }, { 's.tsx': '// the States board' })).toHaveLength(1)
    expect(noneWarnings({ 'States.dc.html': { none: 'x' } }, { 's.tsx': '// board States' })).toHaveLength(1)
  })
  it('leaves alone a note that opens with "not" or "no", whatever else it says', () => {
    expect(noneWarnings({ 'A.dc.html': { none: 'Not built: the flow is built later.' }, 'B.dc.html': { none: 'No story yet, built in NOK-1.' } }, {})).toEqual([])
    expect(noneWarnings({ 'A.dc.html': { none: 'A reference, built in NOK-1.' } }, {})).toHaveLength(1)
  })
  it('leaves alone a board with a keepNone reason, and warns again when it is empty', () => {
    const stories = { 's.tsx': 'A.dc.html' }
    expect(noneWarnings({ 'A.dc.html': { none: 'built in NOK-1', keepNone: 'the dark twin has no story' } }, stories)).toEqual([])
    expect(noneWarnings({ 'A.dc.html': { none: 'x', keepNone: ' ' } }, stories)).toHaveLength(1)
  })
  it('leaves a mapped board alone, and an honest none a story does not name', () => {
    expect(noneWarnings({ 'Spec.dc.html': { none: 'a spec' }, 'A.dc.html': { story: 'L/A' } }, { 's.tsx': 'A.dc.html' })).toEqual([])
  })
})

describe('publishedProblems', () => {
  const map: BoardMap = { 'A.dc.html': { story: 'L/A' } }
  it('passes a copy whose hash is the one the refresh recorded, whatever its line endings', () => {
    expect(publishedProblems(indexOf([meta('A.dc.html', '<p>a</p>')]), map, () => '<p>a</p>')).toEqual([])
    expect(publishedProblems(indexOf([meta('A.dc.html', '<p>\na</p>\n')]), map, () => '<p>\r\na</p>\r\n')).toEqual([])
  })
  it('fails a copy with no record and a copy edited by hand', () => {
    expect(publishedProblems(indexOf([meta('A.dc.html')]), map, () => '<p>a</p>').join('\n')).toMatch(/no record that it was read from the canvas/)
    expect(publishedProblems(indexOf([meta('A.dc.html', '<p>a</p>')]), map, () => '<p>edited</p>').join('\n')).toMatch(/edited by hand/)
  })
  it('lets a known unpublished board through, and fails the entry once the board is published or unshown', () => {
    expect(publishedProblems(indexOf([meta('A.dc.html')]), map, () => '<p>a</p>', { 'A.dc.html': 'not yet' })).toEqual([])
    expect(publishedProblems(indexOf([meta('A.dc.html', '<p>a</p>')]), map, () => '<p>a</p>', { 'A.dc.html': 'not yet' })).toEqual(['A.dc.html is listed in unpublished-known.json but is published: remove the entry.'])
    expect(publishedProblems(indexOf([meta('A.dc.html', '<p>a</p>')]), map, () => '<p>a</p>', { 'Q.dc.html': 'x' })).toEqual(['unpublished-known.json lists Q.dc.html, which no story shows: remove the entry.'])
  })
})

describe('storyIndexProblems', () => {
  const map: BoardMap = { 'B.dc.html': { story: 'S' }, 'A.dc.html': { story: 'S' }, 'C.dc.html': { none: 'x' } }
  it('passes the index built from the map, sorted', () => {
    expect(storyIndexOf(map)).toEqual({ S: ['A.dc.html', 'B.dc.html'] })
    expect(storyIndexProblems(JSON.stringify(storyIndexOf(map)), map)).toEqual([])
  })
  it('fails a missing, broken, stale or extra index', () => {
    expect(storyIndexProblems(undefined, map).join()).toMatch(/is missing/)
    expect(storyIndexProblems('{', map).join()).toMatch(/is not JSON/)
    expect(storyIndexProblems('{"S":["A.dc.html"]}', map).join()).toMatch(/the story "S" lists/)
    expect(storyIndexProblems('{"S":["A.dc.html","B.dc.html"],"T":[]}', map).join()).toMatch(/lists the story "T", which no/)
  })
})

describe('snapshotProblems and componentProblems', () => {
  it('fails samples or components that differ from the copies', () => {
    const fresh = { samples: { 'A.dc.html': { 'a.b': '1' } }, components: {} }
    expect(snapshotProblems(fresh, fresh)).toEqual([])
    expect(snapshotProblems({ samples: { 'A.dc.html': { 'a.b': '2' } }, components: {} }, fresh).join()).toMatch(/samples in the metadata of A\.dc\.html differ/)
    expect(snapshotProblems({ samples: fresh.samples, components: { 'A.dc.html': { X: '<i></i>' } } }, fresh).join()).toMatch(/components .* differ/)
  })
  it('names a component that differs, is only built, or is only on the board', () => {
    expect(componentProblems({ A: '<b></b>', B: '<i></i>' }, { A: '<b>x</b>', C: '<p></p>' })).toEqual(['A differs from the board.\n    board: <b></b>\n    built: <b>x</b>', 'C is built but the components board marks no data-component="C".', 'The board marks data-component="B", which is not built.'])
  })
})

describe('filesInUse', () => {
  const limits = { files: 512, headroom: 16 }
  it('says the files in use and free, as information, when there is room', () => {
    expect(filesInUse({ used: 300, limits, version: '41' })).toEqual({ line: 'Canvas files: 300 of 512 in use, 212 free (canvas version 41).', warning: false })
  })
  it('warns when fewer than the headroom are free, and says what a design costs', () => {
    const low = filesInUse({ used: 500, limits, version: '41' })
    expect(low.warning).toBe(true)
    expect(low.line).toMatch(/^Canvas files: 500 of 512 in use, 12 free \(canvas version 41\)\. Fewer than 16 are free: a design adds about four files/)
    expect(filesInUse({ used: 496, limits }).warning).toBe(false)
  })
  it('warns that a full canvas refuses a publish, and never counts below none free', () => {
    const full = filesInUse({ used: 520, limits })
    expect(full.warning).toBe(true)
    expect(full.line).toMatch(/^Canvas files: 520 of 512 in use, 0 free\. The canvas is full: a publish that adds a file is refused/)
    expect(filesInUse({ used: 512, limits: { files: 512, headroom: 0 } }).warning).toBe(true)
  })
  it('says a count from the meta files is a lower bound, and whether there is a record yet', () => {
    expect(filesInUse({ used: 102, limits, bound: metaCountBound(true) })).toEqual({ line: 'Canvas files: at least 102 of 512 in use, at most 410 free: artifact.json records no file count, so this is the meta files plus 2, and a refresh records the count.', warning: false })
    expect(filesInUse({ used: 102, limits, bound: metaCountBound(false) }).line).toBe('Canvas files: at least 102 of 512 in use, at most 410 free: there is no artifact.json yet, so this is the meta files plus 2, and a refresh records the count.')
    expect(filesInUse({ used: 500, limits, bound: metaCountBound(true) }).warning).toBe(true)
  })
  it("says a count from a read without a design system's files is a lower bound", () => {
    expect(filesInUse({ used: 40, limits, bound: unreadBound(['acme']) }).line).toBe('Canvas files: at least 40 of 512 in use, at most 472 free: no files of the design system acme under project/ds/ were read, so they are not counted.')
    expect(unreadBound(['a', 'b'])).toMatch(/design systems a, b/)
  })
})

describe('recordProblems', () => {
  const canvas = { id: 'main', artifact: 'https://claude.ai/artifact/m' }
  it('passes a record of this canvas, an old record with only the link, and an empty one', () => {
    expect(recordProblems({ canvas: 'main', artifact: canvas.artifact }, canvas)).toEqual([])
    expect(recordProblems({ artifact: canvas.artifact }, canvas)).toEqual([])
    expect(recordProblems({}, { id: 'main', artifact: null })).toEqual([])
  })
  it('fails a record of another canvas or another link', () => {
    expect(recordProblems({ canvas: 'reference', artifact: 'https://claude.ai/artifact/r' }, canvas)).toEqual([
      'artifact.json is the record of the canvas "reference", but this snapshot is the canvas "main": refresh it from its own canvas, or put it in that canvas\'s snapshot folder.',
      'artifact.json records the canvas https://claude.ai/artifact/r, but the config names https://claude.ai/artifact/m: refresh the snapshot from the canvas the config names, or correct the link.',
    ])
  })
})

describe('the warnings', () => {
  it('name the boards the record lists that have no meta file', () => {
    expect(missingBoardWarnings({ boards: ['A.dc.html', 'B.dc.html', 'C.dc.html'] }, ['A.dc.html'])).toEqual(['B.dc.html, C.dc.html are on the canvas (artifact.json) but have no meta file: a full refresh adds them.'])
    expect(missingBoardWarnings({ boards: ['A.dc.html'] }, ['A.dc.html'])).toEqual([])
    expect(missingBoardWarnings({}, [])).toEqual([])
  })
  it('name a design system at another version, or missing, from the record', () => {
    expect(designSystemWarnings({ acme: '3', other: '1', same: '2' }, { acme: '2', same: '2' })).toEqual(['design system "acme": installed 2, expected 3: install it again on the canvas, then refresh.', 'design system "other": not recorded as installed on the canvas, expected 1: install it on the canvas, then refresh.'])
    expect(designSystemWarnings({ acme: '3' }, undefined)).toHaveLength(1)
    expect(designSystemWarnings({}, { acme: '3' })).toEqual([])
  })
})

describe('pageProblems', () => {
  const board = (file: string, page: string | null) => ({ file, title: null, page, w: 1, h: 1 })
  const pages = { queue: { flow: 'Merge', prefixes: ['Queue', 'Merge'] }, admin: { flow: 'Run' } }
  it('passes a board on a listed page whose name has its prefix, or on a page with none', () => {
    expect(pageProblems([board('QueueList.dc.html', 'queue'), board('MergeDone.dc.html', 'queue'), board('Anything.dc.html', 'admin')], pages)).toEqual([])
  })
  it('names a board on no page, on an unlisted page, and one with none of its page\'s prefixes', () => {
    expect(pageProblems([board('A.dc.html', null), board('B.dc.html', 'gone'), board('Settings.dc.html', 'queue')], pages)).toEqual([
      'A.dc.html is on no page: put it on the page of its flow (pages.json lists them), then refresh.',
      'B.dc.html is on the page "gone", which pages.json does not list: add the page to pages.json, or move the board to a page it lists.',
      'Settings.dc.html is on the page "queue" but starts with none of its prefixes (Queue, Merge): rename the board, or move it to the page it belongs to.',
    ])
  })
})

describe('tagWarnings', () => {
  it('passes tags that are a list of non-empty strings, and entries with none', () => {
    expect(tagWarnings({ 'A.dc.html': { story: 'S', tags: ['merge queue'] }, 'B.dc.html': { none: 'x' } })).toEqual([])
  })
  it.each([['merge queue'], [['ok', '']], [[1]], [{ a: 'b' }]])('warns about tags of %j', tags => {
    expect(tagWarnings({ 'A.dc.html': { story: 'S', tags } as BoardMap[string] })).toEqual(['A.dc.html: "tags" in boards/A.map.json is not a list of non-empty strings, such as ["merge queue"], so find does not read it.'])
  })
})

describe('duplicateBoardProblems', () => {
  it('names a board file with a meta file in two snapshots, and both canvases', () => {
    expect(duplicateBoardProblems({ main: ['A.dc.html', 'B.dc.html'], reference: ['B.dc.html', 'C.dc.html'] })).toEqual(['B.dc.html has a meta file in the snapshots of the canvases main and reference: a board name is unique across canvases, so keep the board on one canvas (or rename one) and refresh both.'])
    expect(duplicateBoardProblems({ main: ['A.dc.html'] })).toEqual([])
  })
})

describe('unmarkedSampleWarnings', () => {
  const marked = (file: string, samples?: Record<string, string>): BoardMeta => ({ ...meta(file, '<p>a</p>'), ...(samples === undefined ? {} : { samples }) })
  const map: BoardMap = { 'A.dc.html': { story: 'L/A' }, 'B.dc.html': { story: 'L/B' }, 'C.dc.html': { story: 'L/C', status: 'not built' }, 'D.dc.html': { none: 'a spec' } }
  it('warns about a mapped board with a copy that marks no value, naming the board and its story', () => {
    const [warning, ...rest] = unmarkedSampleWarnings([marked('A.dc.html'), marked('B.dc.html', { 'a.b': 'x' })], map)
    expect(warning).toMatch(/^A\.dc\.html is mapped to L\/A but marks no data-sample value/)
    expect(rest).toEqual([])
  })
  it('treats an empty samples record as marking nothing', () => {
    expect(unmarkedSampleWarnings([marked('A.dc.html', {})], map)).toHaveLength(1)
  })
  it('leaves alone a board with no copy, a not built board, a none board and an unmapped board', () => {
    expect(unmarkedSampleWarnings([meta('A.dc.html'), marked('C.dc.html'), marked('D.dc.html'), marked('E.dc.html')], map)).toEqual([])
  })
})
