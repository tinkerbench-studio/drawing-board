import { describe, expect, it } from 'vitest'

import { BADGE, designBanner, DIFFERENCE_COLOURS, differencesFile, legendMarkdown, parseDifferences, placeBadges, seedDifferences, storybookBanner, visibleDifferences } from './board-shot.ts'
import { boardShotOptions, pickStory } from './board-shot-run.ts'

describe('the differences file', () => {
  it('lives beside the snapshot under differences/, by board', () => {
    expect(differencesFile('Ticket.dc.html')).toBe('differences/Ticket.json')
  })

  it('reads titles, details and a selector on each side, with what was ruled out and lined up', () => {
    const list = parseDifferences(JSON.stringify({ fixture: 'fixtures/a.json', differences: [{ title: 'Save', detail: 'Reads Keep.', board: '#save', story: null }], notDifferences: ['A time zone'], aligned: ['Names'] }), 'Ticket.dc.html')
    expect(list).toEqual({ differences: [{ title: 'Save', detail: 'Reads Keep.', board: { selector: '#save' }, story: null }], notDifferences: ['A time zone'], aligned: ['Names'], notAligned: [], fixture: 'fixtures/a.json', seeded: false, left: 0 })
  })

  it.each([
    ['{', /not JSON/],
    ['{}', /differences must be a list/],
    [JSON.stringify({ differences: [{ title: 'x', detail: 'y', board: null, story: null }] }), /names a selector on neither side/],
    [JSON.stringify({ differences: [{ title: '', detail: 'y', board: '#a' }] }), /title must be a non-empty string/],
    [JSON.stringify({ differences: Array.from({ length: 9 }, () => ({ title: 't', detail: 'd', board: '#a' })) }), /9 differences, but a picture has colours for 8/],
  ])('refuses %s', (source, message) => {
    expect(() => parseDifferences(source, 'Ticket.dc.html')).toThrow(message)
  })
})

describe('seedDifferences', () => {
  it('numbers the wording on only one side, the board first, leaving out what was decided', () => {
    const list = seedDifferences('<h1>Trips</h1><button>Save</button><button>Export</button>', '<h1>Trips</h1><button>Keep</button>', ['button: export'])
    expect(list.seeded).toBe(true)
    expect(list.differences.map(d => [d.title, d.board === null, d.story === null])).toEqual([
      ['button: Save', false, true],
      ['button: Keep', true, false],
    ])
  })

  it('numbers only as many as there are colours, and counts the rest', () => {
    const many = Array.from({ length: 11 }, (_, i) => `<button>Only ${String.fromCharCode(97 + i)}</button>`).join('')
    const list = seedDifferences(many, '')
    expect(list.differences).toHaveLength(DIFFERENCE_COLOURS.length)
    expect(list.left).toBe(3)
  })
})

describe('visibleDifferences', () => {
  it('numbers only what is seen, renumbering past the hidden ones, and counts each kind left out', () => {
    const many = Array.from({ length: 10 }, (_, i) => `<button>Only ${String.fromCharCode(97 + i)}</button>`).join('')
    const seen = Array.from({ length: 10 }, (_, i) => i !== 0)
    const list = visibleDifferences(seedDifferences(many, ''), seen)
    expect(list.differences[0]!.title).toBe('button: Only b')
    expect(list.differences).toHaveLength(8)
    expect([list.hidden, list.left]).toEqual([1, 1])
  })
})

describe('placeBadges', () => {
  it('puts a number at its box top right, kept inside the picture', () => {
    expect(placeBadges([{ number: 1, rect: { x: 100, y: 100, width: 50, height: 20 } }], 400)[0]).toMatchObject({ corner: 'top-right', badge: { x: 150 - BADGE / 2, y: 100 - BADGE / 2 } })
    expect(placeBadges([{ number: 1, rect: { x: 380, y: 0, width: 20, height: 20 } }], 400)[0]!.badge).toEqual({ x: 400 - BADGE, y: 0 })
  })

  it('moves a number to another corner rather than cover one already placed', () => {
    const rect = { x: 100, y: 100, width: 50, height: 20 }
    const [first, second] = placeBadges([
      { number: 1, rect },
      { number: 2, rect },
    ], 400)
    expect(first!.corner).toBe('top-right')
    expect(second!.corner).not.toBe('top-right')
  })
})

describe('the table', () => {
  const banners = { board: designBanner({ board: 'Ticket.dc.html', artifact: 'https://claude.ai/artifact/x', version: 'v9', story: 'Pages/Ticket' }), story: storybookBanner({ title: 'Pages/Ticket', name: 'Default', id: 'pages-ticket--default', fixture: null, commit: 'abc1234', theme: null }) }

  it('gives each number its colour, its words and where it is on each side, and names both sources', () => {
    const list = parseDifferences(JSON.stringify({ differences: [{ title: 'Save', detail: 'Reads Keep.', board: '#save', story: null }] }), 'Ticket.dc.html')
    const md = legendMarkdown({ board: 'Ticket.dc.html', list, drawn: [{ board: { x: 10, y: 20, width: 30, height: 40 }, story: null }], banners, image: 'Ticket-annotated.png' })
    expect(md).toContain('| 1 | Red | **Save**: Reads Keep. | `#save` (30×40 at 10, 20) | Not drawn |')
    expect(md).toContain('Canvas: https://claude.ai/artifact/x · copy read at version v9')
    expect(md).toContain('Story: Pages/Ticket › Default (pages-ticket--default)')
    expect(md).not.toContain('found by comparing')
  })

  it('says when the differences were found by the comparison, and how many were left unnumbered', () => {
    const list = { ...seedDifferences('<button>A</button>', ''), left: 2 }
    const md = legendMarkdown({ board: 'Ticket.dc.html', list, drawn: [{ board: null, story: null }], banners, image: 'x.png' })
    expect(md).toMatch(/found by comparing the two sides' wording/)
    expect(md).toMatch(/add `differences\/Ticket.json`/)
    expect(md).toMatch(/2 more were found than the picture has colours for/)
    expect(md).toContain('| 1 | Red | **button: A**')
  })
})

describe('board-shot options and the story', () => {
  const entries = [
    { id: 'pages-ticket--default', title: 'Pages/Ticket', name: 'Default' },
    { id: 'pages-ticket--all-parts', title: 'Pages/Ticket', name: 'All parts' },
    { id: 'pages-ticket--docs', title: 'Pages/Ticket', name: 'Docs', type: 'docs' },
  ]

  it("takes --story-id, else the map entry's page export, else the first story with the title", () => {
    expect(pickStory(entries, 'Pages/Ticket').id).toBe('pages-ticket--default')
    expect(pickStory(entries, 'Pages/Ticket', 'AllParts').id).toBe('pages-ticket--all-parts')
    expect(pickStory(entries, 'Pages/Other', undefined, 'pages-ticket--all-parts').id).toBe('pages-ticket--all-parts')
    expect(() => pickStory(entries, 'Pages/Other')).toThrow(/No story titled "Pages\/Other"/)
    expect(() => pickStory(entries, 'Pages/Ticket', undefined, 'pages-ticket--docs')).toThrow(/No story "pages-ticket--docs"/)
  })

  it('takes one board or, with no --board, every board a story shows, and leaves the folders to the config', () => {
    expect(boardShotOptions(['--board', 'Ticket.dc.html'])).toEqual({ board: 'Ticket.dc.html' })
    expect(boardShotOptions([])).toEqual({})
    expect(boardShotOptions(['--board', 'T.dc.html', '--storybook', 'sb', '--width', '800', '--theme', 'light', '--out', 'o'])).toEqual({ board: 'T.dc.html', storybook: 'sb', width: 800, theme: 'light', out: 'o' })
    expect(() => boardShotOptions(['--board', ''])).toThrow(/Usage/)
    expect(() => boardShotOptions(['--board', 'Ticket'])).toThrow(/names a board file/)
  })
})
