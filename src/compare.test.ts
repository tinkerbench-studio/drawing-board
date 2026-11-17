import { describe, expect, it } from 'vitest'

import { comparePage, comparePages, comparisonReport } from './compare.ts'
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
