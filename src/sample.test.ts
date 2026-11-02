import { describe, expect, it } from 'vitest'

import { extractSamples, sampleProblems } from './sample.ts'

describe('extractSamples', () => {
  it('reads the text of a marked leaf, with tags removed and whitespace collapsed, and an input by its value', () => {
    const html = '<h1 data-sample="page.title">Persist  <b>checkout</b>\n step</h1><input data-sample="page.field" value="a &amp; b"/>'
    expect(extractSamples('B.dc.html', html)).toEqual({ 'page.title': 'Persist checkout step', 'page.field': 'a & b' })
  })

  it.each([
    ['a key that is not group.name', '<p data-sample="title">x</p>'],
    ['a key used twice', '<p data-sample="a.b">x</p><p data-sample="a.b">y</p>'],
    ['an empty value', '<p data-sample="a.b"> </p>'],
    ['a {{hole}}', '<p data-sample="a.b">{{x}}</p>'],
    ['an element never closed', '<p data-sample="a.b">x'],
    ['an element holding its own kind', '<div data-sample="a.b"><div>x</div></div>'],
    ['an entity it does not know', '<p data-sample="a.b">&bogus;</p>'],
  ])('refuses %s', (_, html) => {
    expect(() => extractSamples('B.dc.html', html)).toThrow(/B\.dc\.html/)
  })
})

describe('sampleProblems', () => {
  it('names a board whose values drifted from the committed ones, and values for a board that is not copied', () => {
    const problems = sampleProblems({ 'A.dc.html': { 'a.b': 'old' }, 'Gone.dc.html': { 'a.b': 'x' } }, { 'A.dc.html': { 'a.b': 'new' } })
    expect(problems).toHaveLength(2)
    expect(problems[0]).toMatch(/A\.dc\.html.*refresh/)
    expect(problems[1]).toMatch(/Gone\.dc\.html/)
  })

  it('accepts a board that marks nothing', () => {
    expect(sampleProblems({ 'A.dc.html': {} }, { 'A.dc.html': {} })).toEqual([])
  })
})
