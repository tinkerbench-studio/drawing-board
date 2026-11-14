import { describe, expect, it } from 'vitest'

import { componentProblems, coverageProblems, noneWarnings, publishedProblems, snapshotProblems, storyIndexProblems, tokenBoardProblems, tokenEntries } from './check.ts'
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
    expect(noneWarnings({ 'Card.dc.html': map['Card.dc.html']! }, { 'card.stories.tsx': "// Card.dc.html\ntitle: 'L/Card'" })).toEqual(['Card.dc.html is mapped none, but card.stories.tsx names it: map it to its story in boards/Card.map.json and refresh the snapshot, or its markup is never committed.'])
    expect(noneWarnings({ 'Card.dc.html': { none: 'x' } }, { 's.tsx': 'the Card board' })).toHaveLength(1)
  })
  it('does not match a longer name, so BigCard is not Card', () => {
    expect(noneWarnings({ 'Card.dc.html': { none: 'x' } }, { 's.tsx': 'BigCard Card-2 cards' })).toEqual([])
  })
  it('warns when the note says the board is built, but not "not built yet"', () => {
    expect(noneWarnings(map, {})).toEqual(['Done.dc.html is mapped none, but its note says it is built ("built in NOK-1"): map it to its story in boards/Done.map.json and refresh the snapshot, or its markup is never committed.'])
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
