import { describe, expect, it } from 'vitest'

import { outlineProblems, passedSampleProblems, passedSamples, repeatedSampleKeys, sampleKeyProblems, selectorMatches, themeValueProblems, tokenCssProblems } from './extra-checks.ts'
import { SnapshotError } from './sample.ts'

describe('repeatedSampleKeys', () => {
  it('finds a key used twice, and ignores commented-out and single-quoted marks', () => {
    expect(repeatedSampleKeys('<b data-sample="a.b">1</b><i data-sample="a.c">2</i><b data-sample="a.b">1</b>')).toEqual(['a.b'])
    expect(repeatedSampleKeys('<b data-sample="a.b">1</b><!-- <b data-sample="a.b">1</b> --><b data-sample=\'a.b\'>1</b>')).toEqual([])
    expect(repeatedSampleKeys('<b data-sample="a.b">1</b><b data-sample="a.b2">1</b>')).toEqual([])
  })
  it('names the board, the key and the fix', () => {
    const problems = sampleKeyProblems({ 'A.dc.html': '<b data-sample="k">1</b><b data-sample="k">1</b>', 'B.dc.html': '<b data-sample="k">1</b>' })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/^A\.dc\.html: data-sample "k" is used more than once.*"k2"/)
  })
})

describe('outlineProblems', () => {
  const html = '<div class="card"><button id="go" data-x="1">Go</button></div>'
  const one = (outline: unknown, story: string | null = 'S/A') => outlineProblems({ 'A.dc.html': { ...(story === null ? { none: 'x' } : { story }), outline } }, () => html)
  it('reads compound selectors, descendants and attributes', () => {
    expect(selectorMatches(html, '.card button#go[data-x="1"]')).toBe(1)
    expect(selectorMatches(html, '.card .missing')).toBe(0)
    expect(() => selectorMatches(html, 'a > b')).toThrow(/not a selector this tool reads/)
  })
  it('passes selectors that name something, and entries with no outline', () => {
    expect(one({ board: ['.card button'], story: ['button'] })).toEqual([])
    expect(outlineProblems({ 'A.dc.html': { story: 'S/A' } }, () => html)).toEqual([])
  })
  it('names a selector that finds nothing on the board', () => {
    expect(one({ board: ['.nope'] })).toEqual(['A.dc.html: outline ".nope" names nothing on the board.'])
  })
  it('refuses an outline on a board with no story, a wrong shape and an unreadable selector', () => {
    expect(one({ board: ['.card'] }, null)).toEqual(['A.dc.html: "outline" is for a board with a story.'])
    for (const bad of [[], 'x', { other: [] }, { board: 'x' }, { story: [1] }]) expect(one(bad)).toEqual(['A.dc.html: "outline" is { "board": [selectors], "story": [selectors] }.'])
    expect(one({ board: ['a > b'] })[0]).toMatch(/^A\.dc\.html: ">" is not a selector/)
    expect(one({ story: ['a > b'] })[0]).toMatch(/not a selector/)
  })
  it('says when the board has no copy', () => {
    expect(outlineProblems({ 'A.dc.html': { story: 'S/A', outline: { board: ['.card'] } } }, () => undefined)).toEqual(['A.dc.html: no copy of the board to hold ".card" to.'])
  })
})

describe('passedSamples', () => {
  const imp = (attrs: string) => `<dc-import ${attrs}>`
  it('reads the prop a data-sample-<prop> attribute marks, with entities decoded', () => {
    expect(passedSamples('A', imp('count="2" data-sample-count="header.count" label="A&amp;B&nbsp;C" data-sample-label="header.label"'))).toEqual({ 'header.count': '2', 'header.label': 'A&B C' })
  })
  it('ignores an import with no data-sample-<prop> and a commented-out one', () => {
    expect(passedSamples('A', `${imp('count="2"')}<!-- ${imp('count="3" data-sample-count="a.b"')} -->`)).toEqual({})
  })
  it.each([
    ['data-sample-count="a.b"', /names the prop "count", and the import passes no "count"/],
    ['count="1" data-sample-count="Bad"', /is not group.name/],
    ['count=" " data-sample-count="a.b"', /is empty/],
    ['count="{{n}}" data-sample-count="a.b"', /is a \{\{hole\}\}/],
    ['count="&bogus;" data-sample-count="a.b"', /entity &bogus; , which is not read|which is not read/],
    ['count="&#x110000;" data-sample-count="a.b"', /which is not a character/],
  ])('refuses %s', (attrs, message) => {
    expect(() => passedSamples('A', imp(attrs))).toThrow(message)
  })
  it('refuses a key used twice', () => {
    expect(() => passedSamples('A', `${imp('n="1" data-sample-n="a.b"')}${imp('n="2" data-sample-n="a.b"')}`)).toThrow(SnapshotError)
  })
  it('turns refusals into lines, by board', () => {
    expect(passedSampleProblems({ 'A.dc.html': imp('n="1" data-sample-n="a.b"'), 'B.dc.html': imp('data-sample-n="a.b"') })).toEqual(['B.dc.html: data-sample="a.b" names the prop "n", and the import passes no "n".'])
  })
})

describe('themeValueProblems', () => {
  const tokens = { color: { themes: [{ id: 'dark' }, { id: 'light' }], tokens: [{ name: 'bg', values: { dark: '#000', light: '#fff' } }, { name: 'ink', values: { dark: '#fff' } }] } }
  it('names a colour with no value for a theme', () => {
    expect(themeValueProblems(tokens)).toEqual(['tokens.json: colour "ink" has no light value.'])
  })
  it('passes tokens with every value, and tokens with no theme list', () => {
    expect(themeValueProblems({ color: { themes: tokens.color.themes, tokens: [tokens.color.tokens[0]!] } })).toEqual([])
    expect(themeValueProblems({ color: { tokens: [{ name: 'x' }] } })).toEqual([])
  })
})

describe('tokenCssProblems', () => {
  const tokens = { color: { tokens: [{ name: 'paper', value: '#FFFDF9' }] }, type: { families: { body: "Inter, 'x'" } }, radius: { tokens: [{ name: 'md', value: '8px' }] }, shadow: { tokens: [{ name: 'card', value: '0 1px 2px #000' }] } }
  const css = ':root{--paper:#fffdf9;--body:Inter,"x"} .a{border-radius:8px;box-shadow:0 1px 2px #000}'
  it('passes tokens the CSS ships, whatever the case and spacing', () => {
    expect(tokenCssProblems(tokens, css)).toEqual([])
  })
  it('names a missing, differing and ambiguous custom property, an unused radius and an unused shadow', () => {
    expect(tokenCssProblems(tokens, '.a{border-radius:4px;box-shadow:none}')).toEqual(['colour "paper" (#FFFDF9) is on the canvas but no stylesheet declares --paper.', 'font family "body" (Inter, \'x\') is on the canvas but no stylesheet declares --body.', 'radius "md" (8px) is on the canvas but no stylesheet uses border-radius: 8px.', 'shadow "card" (0 1px 2px #000) is on the canvas but no stylesheet uses box-shadow: 0 1px 2px #000.'])
    expect(tokenCssProblems({ color: { tokens: [{ name: 'paper', value: '#fff' }] } }, ':root{--paper:#000}')).toEqual(['colour "paper" is #fff on the canvas but --paper is #000 in the CSS.'])
    expect(tokenCssProblems({ color: { tokens: [{ name: 'paper', value: '#fff' }] } }, ':root{--paper:#fff} .dark{--paper:#000}')[0]).toMatch(/declared with different values \(#fff and #000\)/)
  })
  it('skips a section the tokens do not have, and ignores comments', () => {
    expect(tokenCssProblems({}, '')).toEqual([])
    expect(tokenCssProblems({ color: { tokens: [{ name: 'a', value: '#111' }] } }, '/* --a:#111 */')).toHaveLength(1)
  })
})
