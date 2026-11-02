import { describe, expect, it } from 'vitest'

import { changeNote, compareFile, compareOptions, pairPictures, storyIds, storyShotOptions, storyUrl, storyVariants } from './pictures.ts'

describe('story-shot', () => {
  it("addresses a story's own page, with the theme as a Storybook global", () => {
    expect(storyUrl('http://h', 'pages-ticket--pickup')).toBe('http://h/iframe.html?id=pages-ticket--pickup&viewMode=story')
    expect(storyUrl('http://h', 'pages-ticket--pickup', 'light')).toBe('http://h/iframe.html?id=pages-ticket--pickup&viewMode=story&globals=theme:light')
    expect(() => storyUrl('http://h', 'Pages/Ticket')).toThrow(/not a story id/)
  })

  it('lists the stories of an index, not its docs pages, sorted', () => {
    expect(storyIds({ entries: { b: { id: 'b--two' }, d: { id: 'b--docs', type: 'docs' }, a: { id: 'a--one', type: 'story' } } })).toEqual(['a--one', 'b--two'])
    expect(storyIds({ stories: { a: { id: 'a--one' } } })).toEqual(['a--one'])
  })

  it('takes dark, light and phone by default, or only the variant asked for', () => {
    expect(storyVariants({}, 'shots/x.png')).toEqual([
      { theme: 'dark', width: 1100, out: 'shots/x-dark.png' },
      { theme: 'light', width: 1100, out: 'shots/x-light.png' },
      { theme: 'dark', width: 390, out: 'shots/x-phone.png' },
    ])
    expect(storyVariants({ theme: 'light' }, 'x.png')).toEqual([{ theme: 'light', width: 1100, out: 'x.png' }])
    expect(storyVariants({ width: 390 }, 'x.png')).toEqual([{ width: 390, out: 'x.png' }])
  })

  it('reads its arguments, or --list, and refuses what it cannot use', () => {
    expect(storyShotOptions(['sb', 'a--b', 'o.png', '--width', '800', '--theme', 'dark'])).toEqual({ dir: 'sb', id: 'a--b', out: 'o.png', width: 800, theme: 'dark', list: false })
    expect(storyShotOptions(['sb', '--list'])).toEqual({ dir: 'sb', list: true })
    expect(() => storyShotOptions(['sb', 'a--b'])).toThrow(/Usage/)
    expect(() => storyShotOptions(['sb', 'a--b', 'o.png', '--width', '100'])).toThrow(/--width/)
    expect(() => storyShotOptions(['sb', 'a--b', 'o.png', '--theme', 'blue'])).toThrow(/--theme/)
  })
})

describe('compare-pictures', () => {
  it('pairs the pictures in both folders by name, skipping the rest', () => {
    expect(pairPictures(['b.png', 'a.png', 'only-before.png', 'notes.txt'], ['a.png', 'b.png', 'only-after.png'])).toEqual(['a.png', 'b.png'])
    expect(compareFile('page-dark.png')).toBe('page-dark-before-after.png')
  })

  it('reads its folders, the columns to leave out and the banner labels', () => {
    expect(compareOptions(['a', 'b', 'out'])).toEqual({ before: 'a', after: 'b', out: 'out', fromX: 0, left: 'BEFORE', right: 'AFTER' })
    expect(compareOptions(['a', 'b', 'out', '--from-x', '240', '--left', 'BOARD', '--right', 'STORY'])).toEqual({ before: 'a', after: 'b', out: 'out', fromX: 240, left: 'BOARD', right: 'STORY' })
    expect(() => compareOptions(['a', 'b'])).toThrow(/Usage/)
    expect(() => compareOptions(['a', 'b', 'out', '--from-x', '-1'])).toThrow(/--from-x/)
  })

  it('says no visible change, or how many regions changed', () => {
    expect([changeNote(0), changeNote(1), changeNote(3)]).toEqual(['no visible change', '1 region changed, outlined in red', '3 regions changed, outlined in red'])
  })
})
