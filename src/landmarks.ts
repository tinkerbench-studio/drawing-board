// Where the named landmarks (header, cards, columns) sit on a board and on its story: the decision behind
// `drawing-board layout`. A landmark is an element marked `data-landmark="name"` on the board and on the component the
// story draws. Pure: `collectLandmarks` takes what the page reported and `compareLandmarks` sets two lists of boxes
// beside each other; layout-run.ts drives the browser. Ported from Nookivia's design-canvas:layout.

export const LANDMARK_ATTR = 'data-landmark'

/** A landmark's position and size in CSS pixels, from the top left of the screen. */
export type Box = { x: number; y: number; width: number; height: number }

export type Boxes = Readonly<Record<string, Box>>

/** One marked element as the page reports it: its name and its rectangle on the page. */
export type RawLandmark = { name: string | null; rect: Box }

/**
 * The boxes of the marked elements, relative to `origin` (the top left of the element the screen is drawn in, so a
 * board and a story that sit at different offsets on their page are measured from their own corner). A name used on
 * more than one element keeps the first and is listed in `duplicates`; an unnamed mark is ignored.
 */
export const collectLandmarks = (entries: readonly RawLandmark[], origin: { x: number; y: number }): { boxes: Record<string, Box>; duplicates: string[] } => {
  const boxes: Record<string, Box> = {}
  const duplicates: string[] = []
  for (const { name: raw, rect } of entries) {
    const name = (raw ?? '').trim()
    if (name === '') continue
    if (name in boxes) {
      if (!duplicates.includes(name)) duplicates.push(name)
      continue
    }
    boxes[name] = { x: rect.x - origin.x, y: rect.y - origin.y, width: rect.width, height: rect.height }
  }
  return { boxes, duplicates }
}

export type LandmarkStatus =
  | 'same'
  /** Same size, a different position. */
  | 'moved'
  /** A different size (and perhaps a different position too). */
  | 'resized'
  | 'missing-on-board'
  | 'missing-in-story'

export type LandmarkDifference = { name: string; status: LandmarkStatus; board?: Box; story?: Box; /** story minus board, where both have the landmark. */ delta?: Box }

/** A box within this many pixels of the other is the same: sub-pixel and rounding noise. */
export const DEFAULT_TOLERANCE = 2

const differs = (a: number, b: number, tolerance: number) => Math.abs(a - b) > tolerance

/** The board's landmarks set beside the story's, in the board's order and then the story-only ones. A landmark on one side only is reported, never skipped. */
export const compareLandmarks = (board: Boxes, story: Boxes, tolerance = DEFAULT_TOLERANCE): LandmarkDifference[] => {
  const result: LandmarkDifference[] = []
  for (const [name, boardBox] of Object.entries(board)) {
    const storyBox = story[name]
    if (storyBox === undefined) {
      result.push({ name, status: 'missing-in-story', board: boardBox })
      continue
    }
    const delta = { x: storyBox.x - boardBox.x, y: storyBox.y - boardBox.y, width: storyBox.width - boardBox.width, height: storyBox.height - boardBox.height }
    const resized = differs(storyBox.width, boardBox.width, tolerance) || differs(storyBox.height, boardBox.height, tolerance)
    const moved = differs(storyBox.x, boardBox.x, tolerance) || differs(storyBox.y, boardBox.y, tolerance)
    result.push({ name, status: resized ? 'resized' : moved ? 'moved' : 'same', board: boardBox, story: storyBox, delta })
  }
  for (const [name, storyBox] of Object.entries(story)) if (!(name in board)) result.push({ name, status: 'missing-on-board', story: storyBox })
  return result
}

/** True when any landmark differs or is missing on a side. */
export const hasDifference = (differences: readonly LandmarkDifference[]) => differences.some(d => d.status !== 'same')

export type ScreenStatus =
  /** Every landmark is in both and within the tolerance. */
  | 'within'
  /** A landmark moved, was resized or is on one side only. */
  | 'differs'
  /** Neither side marks a landmark, so there is nothing to compare. */
  | 'nothing-marked'
  /** The board's story could not be drawn, so the screen was not measured. */
  | 'not-measured'

export type ScreenResult = {
  /** The board's file, `Main.dc.html`. */
  board: string
  /** The story title the board is mapped to. */
  story: string
  /** The story drawn beside the board, as its name. */
  state: string | null
  status: ScreenStatus
  note?: string
  differences: LandmarkDifference[]
  boardLandmarks: number
  storyLandmarks: number
  /** A side wider than the viewport, so its picture is clipped. */
  overflows: { board: boolean; story: boolean }
  /** File names under the report's folder, kept for a screen a person should look at. */
  screenshots?: { board: string; story: string }
}

export const statusOf = (differences: readonly LandmarkDifference[], boardLandmarks: number, storyLandmarks: number): ScreenStatus => (boardLandmarks === 0 && storyLandmarks === 0 ? 'nothing-marked' : hasDifference(differences) ? 'differs' : 'within')

/** The picture files for a screen, `Main-board.png` and `Main-story.png`. */
export const screenshotNames = (board: string) => {
  const screen = board.replace(/\.dc\.html$/, '')
  return { board: `${screen}-board.png`, story: `${screen}-story.png` }
}

/** Whether a screen's pictures are kept: every screen a person should look at. */
export const keepsScreenshots = (status: ScreenStatus) => status === 'differs' || status === 'nothing-marked'

const round = (n: number) => String(Math.round(n * 10) / 10)
const signed = (n: number) => `${n > 0 ? '+' : ''}${round(n)}`
const boxText = (box: Box | undefined) => (box ? `${round(box.x)}, ${round(box.y)} · ${round(box.width)}×${round(box.height)}` : '—')

const deltaText = ({ delta }: LandmarkDifference) => {
  if (!delta) return '—'
  const shown = ([['x', delta.x], ['y', delta.y], ['w', delta.width], ['h', delta.height]] as const).filter(([, n]) => n !== 0).map(([label, n]) => `${label} ${signed(n)}`)
  return shown.length > 0 ? shown.join(', ') : '0'
}

const VERDICTS: Record<LandmarkStatus, string> = { same: 'within tolerance', moved: '**moved**', resized: '**resized**', 'missing-on-board': '**not on the board**', 'missing-in-story': '**not in the story**' }
const HEADINGS: Record<ScreenStatus, string> = { differs: 'Outside tolerance', within: 'Within tolerance', 'nothing-marked': 'Nothing marked', 'not-measured': 'Not measured' }
const ORDER: ScreenStatus[] = ['differs', 'nothing-marked', 'not-measured', 'within']

const section = (r: ScreenResult): string[] => {
  const lines = [`### ${r.board} → ${r.story}${r.state ? ` (“${r.state}”)` : ''}`, '']
  if (r.note) lines.push(r.note, '')
  if (r.overflows.board || r.overflows.story) lines.push(`The ${[r.overflows.board && 'board', r.overflows.story && 'story'].filter(Boolean).join(' and ')} is wider than the viewport, so its picture is clipped to the viewport's width.`, '')
  if (r.differences.length > 0) {
    lines.push('| Landmark | Board (x, y · w×h) | Story (x, y · w×h) | Difference (story − board) | |', '| --- | --- | --- | --- | --- |')
    for (const d of r.differences) lines.push(`| \`${d.name}\` | ${boxText(d.board)} | ${boxText(d.story)} | ${deltaText(d)} | ${VERDICTS[d.status]} |`)
    lines.push('')
  }
  if (r.screenshots) lines.push(`Pictures to compare: [board](${r.screenshots.board}) · [story](${r.screenshots.story})`, '')
  return lines
}

/** The report `drawing-board layout` writes. Advisory: a line is a thing to look at, never an exit code. */
export const layoutMarkdown = (results: readonly ScreenResult[], tolerance = DEFAULT_TOLERANCE, attr = LANDMARK_ATTR): string => {
  const count = (status: ScreenStatus) => results.filter(r => r.status === status).length
  const lines = [
    '# Design canvas boards against their stories: layout',
    '',
    `Where the marked landmarks sit on ${results.length} ${results.length === 1 ? 'board' : 'boards'} and in their stories, in CSS pixels from the top left of the screen, at one viewport width and one font on both sides. Two boxes within ${tolerance}px are the same. Advisory: a line here is a thing to look at, not a failure. The pictures are for a person to compare; the decision comes from the boxes, not from the pixels. Screens within tolerance keep no pictures.`,
    '',
    `${count('differs')} outside tolerance, ${count('within')} within, ${count('nothing-marked')} with nothing marked, ${count('not-measured')} not measured.`,
    '',
  ]
  if (count('differs') + count('within') === 0) lines.push(`**No layout has been compared:** no screen has landmarks on both sides yet (a landmark is an element marked \`${attr}="name"\` on the board and on the component the story draws).`, '')
  for (const status of ORDER) {
    const group = results.filter(r => r.status === status)
    if (group.length === 0) continue
    lines.push(`## ${HEADINGS[status]} (${group.length})`, '')
    for (const r of group) lines.push(...section(r))
  }
  return `${lines.join('\n').trimEnd()}\n`
}
