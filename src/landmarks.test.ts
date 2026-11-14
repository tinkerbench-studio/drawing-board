import { describe, expect, it } from 'vitest'

import { collectLandmarks, compareLandmarks, keepsScreenshots, layoutMarkdown, screenshotNames, statusOf, type ScreenResult } from './landmarks.ts'

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })

describe('collectLandmarks', () => {
  it('measures from the origin, keeps the first of a repeated name and ignores unnamed marks', () => {
    const got = collectLandmarks([{ name: 'header', rect: box(110, 220, 300, 50) }, { name: 'header', rect: box(0, 0, 1, 1) }, { name: ' ', rect: box(0, 0, 1, 1) }, { name: null, rect: box(0, 0, 1, 1) }, { name: 'card', rect: box(110, 300, 100, 80) }], { x: 100, y: 200 })
    expect(got.boxes).toEqual({ header: box(10, 20, 300, 50), card: box(10, 100, 100, 80) })
    expect(got.duplicates).toEqual(['header'])
  })
})

describe('compareLandmarks', () => {
  const board = { header: box(0, 0, 300, 50), card: box(0, 60, 100, 80), side: box(0, 0, 10, 10) }
  it('calls a box within the tolerance the same, a shifted one moved, a different size resized', () => {
    const story = { header: box(2, 2, 302, 48), card: box(0, 70, 100, 90), extra: box(0, 0, 5, 5) }
    const got = compareLandmarks(board, story)
    expect(got.map(d => [d.name, d.status])).toEqual([['header', 'same'], ['card', 'resized'], ['side', 'missing-in-story'], ['extra', 'missing-on-board']])
    expect(compareLandmarks({ a: box(0, 0, 10, 10) }, { a: box(0, 5, 10, 10) })[0]).toMatchObject({ status: 'moved', delta: box(0, 5, 0, 0) })
  })
  it('takes the tolerance as a number of pixels', () => {
    expect(compareLandmarks({ a: box(0, 0, 10, 10) }, { a: box(5, 0, 10, 10) }, 5)[0]!.status).toBe('same')
    expect(compareLandmarks({ a: box(0, 0, 10, 10) }, { a: box(6, 0, 10, 10) }, 5)[0]!.status).toBe('moved')
  })
})

describe('the report', () => {
  const result = (status: ScreenResult['status'], extra: Partial<ScreenResult> = {}): ScreenResult => ({ board: 'Main.dc.html', story: 'Pages/Main', state: 'Default', status, differences: [], boardLandmarks: 1, storyLandmarks: 1, overflows: { board: false, story: false }, ...extra })
  it('decides a screen from its boxes, and keeps pictures only for one to look at', () => {
    expect(statusOf([], 0, 0)).toBe('nothing-marked')
    expect(statusOf(compareLandmarks({ a: box(0, 0, 1, 1) }, { a: box(0, 0, 1, 1) }), 1, 1)).toBe('within')
    expect(statusOf(compareLandmarks({ a: box(0, 0, 1, 1) }, {}), 1, 0)).toBe('differs')
    expect([keepsScreenshots('differs'), keepsScreenshots('nothing-marked'), keepsScreenshots('within'), keepsScreenshots('not-measured')]).toEqual([true, true, false, false])
    expect(screenshotNames('Main.dc.html')).toEqual({ board: 'Main-board.png', story: 'Main-story.png' })
  })
  it('lists each landmark with its boxes, the difference and a verdict, and links the pictures', () => {
    const differences = compareLandmarks({ header: box(0, 0, 300, 50), gone: box(0, 0, 1, 1) }, { header: box(0, 12, 300, 50) })
    const md = layoutMarkdown([result('differs', { differences, screenshots: screenshotNames('Main.dc.html') })])
    expect(md).toContain('1 outside tolerance, 0 within')
    expect(md).toContain('| `header` | 0, 0 · 300×50 | 0, 12 · 300×50 | y +12 | **moved** |')
    expect(md).toContain('| `gone` | 0, 0 · 1×1 | — | — | **not in the story** |')
    expect(md).toContain('[board](Main-board.png) · [story](Main-story.png)')
    expect(md).toContain('Advisory')
  })
  it('says plainly when nothing was compared, and names the attribute it looked for', () => {
    const md = layoutMarkdown([result('nothing-marked', { boardLandmarks: 0, storyLandmarks: 0 })], 2, 'data-zone')
    expect(md).toContain('**No layout has been compared:**')
    expect(md).toContain('`data-zone="name"`')
  })
})
