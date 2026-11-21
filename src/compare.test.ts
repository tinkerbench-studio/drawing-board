import { describe, expect, it } from 'vitest'

import { comparePage, comparePages, compareStates, comparisonReport } from './compare.ts'
import { outline } from './html.ts'

describe('outline', () => {
  it('reads headings, buttons, links, labels, column heads and list items, in order, leaving values out', () => {
    const html = '<h1>Your trips</h1><a class="button">Add a trip</a><a href="/x">Help</a><label>Name</label><table><th>Date</th></table><ul><li>Paris</li><li>3 nights</li></ul><p>Not structure</p><button>£40</button>'
    expect(outline(html)).toEqual([
      { kind: 'heading', text: 'Your trips' },
      { kind: 'button', text: 'Add a trip' },
      { kind: 'link', text: 'Help' },
      { kind: 'label', text: 'Name' },
      { kind: 'label', text: 'Date' },
      { kind: 'item', text: 'Paris' },
    ])
  })

  it('joins an element\'s parts with a space, but none where a slash meets the join', () => {
    const html = '<button><span class="owner">acme</span>/web-app</button><a href="/r"><span>acme</span><span>/api</span></a><a href="/s"><span>acme/</span><span>tools</span></a><button><span>Build</span><span>skipped</span></button><a href="/b">tick<span>·</span>it</a><a href="/c"><span>a</span> / <span>b</span></a>'
    expect(outline(html)).toEqual([
      { kind: 'button', text: 'acme/web-app' },
      { kind: 'link', text: 'acme/api' },
      { kind: 'link', text: 'acme/tools' },
      { kind: 'button', text: 'Build skipped' },
      { kind: 'link', text: 'tick · it' },
      { kind: 'link', text: 'a / b' },
    ])
  })
})

describe('comparePage', () => {
  it('lists wording only on each side, ignoring case and repeats, and counts what both share', () => {
    const c = comparePage('A.dc.html', 'Pages/A', 'implemented', '<h1>Trips</h1><button>Save</button><button>Save</button>', '<h1>TRIPS</h1><button>Cancel</button>')
    expect(c.onlyOnBoard).toEqual([{ kind: 'button', text: 'Save' }])
    expect(c.onlyInStory).toEqual([{ kind: 'button', text: 'Cancel' }])
    expect(c.shared).toBe(1)
  })

  it('lists a decided difference apart from the open ones, whatever its case', () => {
    const c = comparePage('A.dc.html', 'Pages/A', 'partial', '<button>Save</button>', '<button>Keep</button>', ['button: SAVE'])
    expect(c.onlyOnBoard).toEqual([])
    expect(c.decided).toEqual([{ kind: 'button', text: 'Save' }])
    expect(c.onlyInStory).toEqual([{ kind: 'button', text: 'Keep' }])
  })
})

describe('comparePages and the report', () => {
  const map = { 'A.dc.html': { story: 'Pages/A', decided: ['button: save', 3] }, 'B.dc.html': { story: 'Pages/B' }, 'C.dc.html': { none: 'a spec' } }
  const pages = comparePages(map, () => '<button>Save</button>', { 'Pages/A': '<p></p>' })

  it('compares only the boards whose story the project drew, reading decided from the map entry', () => {
    expect(pages.map(p => [p.board, p.status, p.decided.length])).toEqual([['A.dc.html', 'not classified', 1]])
  })

  it('writes the decided section only when something is decided, and the components the project passes', () => {
    expect(comparisonReport(pages)).toMatch(/Decided to stay different/)
    expect(comparisonReport(comparePages({ 'B.dc.html': { story: 'Pages/B' } }, () => '', { 'Pages/B': '' }))).not.toMatch(/Decided/)
    expect(comparisonReport([], ['Tile differs from the board.'])).toMatch(/- Tile differs from the board\./)
    expect(comparisonReport([])).toMatch(/Every built component draws the markup its board marks/)
  })
})

// Ported from Nookivia's compare tests (packages/design-canvas/compare.test.ts, #2202), now over markup.
const page = (...texts: string[]) => texts.map(t => (t.startsWith('b:') ? `<button>${t.slice(2)}</button>` : t.startsWith('a:') ? `<a href="/x">${t.slice(2)}</a>` : `<h2>${t}</h2>`)).join('')
const boardHtml = page('Your account', 'Your details', 'b:Edit', 'a:Manage')

describe('the order verdict (order option)', () => {
  const verdict = (story: string, html = boardHtml) => comparePage('B', 'S', 'implemented', html, story, [], { order: true }).order

  it('is same when the shared texts come in the same order, whatever only one side has', () => {
    expect(verdict(page('Your account', 'Your details', 'b:Edit', 'a:Manage', 'b:Delete'))).toEqual({ verdict: 'same', outOfOrder: 0 })
  })

  it('is reordered when the shared texts come in another order, counting how many', () => {
    expect(verdict(page('b:Edit', 'Your account', 'Your details', 'a:Manage'))).toEqual({ verdict: 'reordered', outOfOrder: 1 })
  })

  it('reads order over the texts both have, so a missing text is not a reordering', () => {
    expect(verdict(page('Your account', 'Your details', 'a:Manage'))).toEqual({ verdict: 'same', outOfOrder: 0 })
  })

  it('does not judge a side with fewer than three items', () => {
    expect(verdict(boardHtml, page('Your account', 'b:Edit'))).toEqual({ verdict: 'not-judged', outOfOrder: 0 })
    expect(verdict(page('Your account', 'b:Edit'))).toEqual({ verdict: 'not-judged', outOfOrder: 0 })
  })

  it('counts a repeated text once', () => {
    expect(verdict(boardHtml, boardHtml + boardHtml)).toEqual({ verdict: 'same', outOfOrder: 0 })
  })
})

describe('the closest state and unrelated verdict (closestState option)', () => {
  const states = { Far: page('a:Manage'), Near: page('Your account', 'Your details', 'b:Edit', 'a:Manage', 'a:More') }

  it('compares with every state and reads the lists against the one that keeps most of the board in order', () => {
    const c = compareStates('B', 'Pages/B', 'implemented', boardHtml, states, [], { order: true })
    expect(c.closestState).toBe('Near')
    expect(c.story).toBe('Pages/B › Near')
    expect(c.onlyInStory).toEqual([{ kind: 'link', text: 'More' }])
    expect(c.unrelated).toBeUndefined()
    expect(c.order).toEqual({ verdict: 'same', outOfOrder: 0 })
  })

  it('takes the first state when two keep the same share', () => {
    expect(compareStates('B', 'Pages/B', 'implemented', boardHtml, { First: boardHtml, Second: boardHtml }).closestState).toBe('First')
  })

  it('names the only state of a one-state story too', () => {
    expect(compareStates('B', 'Pages/B', 'implemented', boardHtml, { Default: boardHtml }).closestState).toBe('Default')
  })

  it('is unrelated under a quarter of the board\'s items, and not at exactly a quarter', () => {
    const wide = page(...Array.from({ length: 8 }, (_, i) => `Heading ${'abcdefgh'[i]}`))
    const unrelated = (...texts: string[]) => compareStates('B', 'S', 'x', wide, { A: page(...texts) }).unrelated
    expect(unrelated('Heading a')).toBe(true)
    expect(unrelated('Heading a', 'Heading b')).toBeUndefined()
  })

  it('does not judge the mapping of a board with fewer than three items', () => {
    expect(compareStates('B', 'S', 'x', page('One', 'Two'), { A: page('Zed') }).unrelated).toBeUndefined()
  })

  it('writes the closest state, the unrelated note and the order into the report', () => {
    const report = comparisonReport([compareStates('B', 'Pages/B', 'implemented', boardHtml, { Far: page('Elsewhere'), Near: page('b:Edit', 'Your account', 'Your details', 'a:Manage') }, [], { order: true })])
    expect(report).toContain('Closest story state: Near.')
    expect(report).toContain('Order: 1 shared item come in a different order.')
    expect(comparisonReport([compareStates('B', 'S', 'x', boardHtml, { A: page('Elsewhere') })])).toContain('**Unrelated**')
    expect(comparisonReport([comparePage('B', 'S', 'x', page('One', 'Two'), page('One', 'Two'), [], { order: true })])).toContain('Order: not judged')
  })
})

describe('with the new options off', () => {
  const map = { 'A.dc.html': { story: 'Pages/A', decided: ['button: export'] } }
  const board = '<h1>Trips</h1><button>Save</button><button>Export</button><a href="/h">Help</a>'
  const story = '<h1>Trips</h1><a href="/h">Help</a><button>Keep</button><button>Save</button>'

  it('writes the report it wrote before, byte for byte, whether the options are omitted, empty or false', () => {
    const expected = [
      '# Design canvas against Storybook',
      '',
      'Advisory: where each board and its story disagree about fixed wording and structure (headings, buttons, links, field labels, column heads, list items). Values (anything with a digit, an address, a currency sign or a placeholder) are left out.',
      '',
      '## A.dc.html ↔ Pages/A (not classified)',
      '',
      '3 items in both.',
      '',
      '**Only on the board** (designed, not built, or worded differently):',
      '_none_',
      '',
      '**Only in the story** (built, not designed):',
      '- button: Keep',
      '',
      '**Decided to stay different** (`decided` in its map entry):',
      '- button: Export',
      '',
      '## Components',
      '',
      'Every built component draws the markup its board marks.',
      '',
    ].join('\n')
    const report = (options?: Parameters<typeof comparePages>[3]) => comparisonReport(comparePages(map, () => board, { 'Pages/A': story }, options))
    expect(report()).toBe(expected)
    expect(report({})).toBe(expected)
    expect(report({ order: false, closestState: false })).toBe(expected)
    expect(Object.keys(comparePage('A', 'S', 'x', board, story, [], {}))).toEqual(['board', 'story', 'status', 'onlyOnBoard', 'onlyInStory', 'decided', 'shared'])
  })
})
