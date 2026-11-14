import { describe, expect, it } from 'vitest'

import { findBoards, nameWords, queryWords, searchText, type FindCanvas } from './find.ts'
import type { BoardMeta } from './snapshot.ts'

const meta = (file: string, page: string | null, more: Partial<BoardMeta> = {}): BoardMeta => ({ file, title: null, page, w: 1, h: 1, ...more })

describe('searchText', () => {
  it('splits a board name into words, and holds the title, page, flow, keywords, map entry, components and samples', () => {
    expect(nameWords('MergeQueueCard.dc.html')).toBe('MergeQueueCard.dc.html Merge Queue Card')
    expect(nameWords('PRList2Phone.dc.html')).toContain('PR List2 Phone')
    const text = searchText(meta('MergeQueue.dc.html', 'queue', { title: 'The queue', components: { StatusChip: '<i></i>' }, samples: { 'pr.title': 'x' } }), { story: 'Pages/Queue', tags: ['ci'], none: 'later' }, { queue: { flow: 'Land a pull request', keywords: ['merge train'] } })
    for (const part of ['merge queue', 'the queue', 'queue', 'land a pull request', 'merge train', 'pages/queue', 'ci', 'later', 'statuschip', 'pr.title']) expect(text, part).toContain(part)
  })
  it('splits the query into words, lowercased, once each', () => {
    expect(queryWords(['Merge  queue', 'merge'])).toEqual(['merge', 'queue'])
  })
})

describe('findBoards', () => {
  const canvases: FindCanvas[] = [
    {
      id: 'main',
      metas: [meta('MergeQueue.dc.html', 'queue'), meta('Settings.dc.html', 'admin', { samples: { 'queue.limit': '3' } }), meta('Billing.dc.html', 'admin')],
      map: { 'MergeQueue.dc.html': { story: 'Pages/Queue' }, 'Settings.dc.html': { none: 'a spec' } },
      pages: { queue: { flow: 'Merge a pull request', keywords: ['merge train'] }, admin: { flow: 'Run the studio' } },
    },
    { id: 'reference', metas: [meta('QueueArchitecture.dc.html', 'arch')], map: { 'QueueArchitecture.dc.html': { none: 'architecture', tags: ['merge'] } } },
  ]

  it('ranks by the words matched, then by canvas and file, with the story or none', () => {
    expect(findBoards(canvases, ['merge', 'queue'])).toEqual([
      { canvas: 'main', page: 'queue', file: 'MergeQueue.dc.html', story: 'Pages/Queue', score: 2 },
      { canvas: 'reference', page: 'arch', file: 'QueueArchitecture.dc.html', story: null, score: 2 },
      { canvas: 'main', page: 'admin', file: 'Settings.dc.html', story: null, score: 1 },
    ])
  })

  it('matches a part of a word, whatever its case, and finds nothing for words no board has', () => {
    expect(findBoards(canvases, ['STUDIO']).map(b => b.file)).toEqual(['Billing.dc.html', 'Settings.dc.html'])
    expect(findBoards(canvases, ['archi']).map(b => b.file)).toEqual(['QueueArchitecture.dc.html'])
    expect(findBoards(canvases, ['nothing'])).toEqual([])
  })
})
