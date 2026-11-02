// The picture a UX change carries: the design canvas board and its story side by side, each under a banner saying
// where it came from, every difference boxed on both sides with the same number in a colour of its own, and a table
// beside the picture. This file decides and writes (the differences, the colours, the banners, where each number
// sits, the joined page, the table); board-shot-run.ts drives the browser. Ported from Nookivia's
// design-canvas:annotate, the style chosen for every project.
import { comparePage } from './compare.ts'
import type { OutlineItem } from './html.ts'

export class BoardShotError extends Error {}

/** One colour per difference, so a difference can be followed by colour alone. None is near the banners' blue or orange. */
export const DIFFERENCE_COLOURS = [
  { name: 'Red', hex: '#d62828' },
  { name: 'Green', hex: '#1b8a3a' },
  { name: 'Magenta', hex: '#c026d3' },
  { name: 'Teal', hex: '#0f8b8d' },
  { name: 'Gold', hex: '#a16207' },
  { name: 'Purple', hex: '#6d28d9' },
  { name: 'Lime', hex: '#4d7c0f' },
  { name: 'Brown', hex: '#78350f' },
] as const

export type Colour = (typeof DIFFERENCE_COLOURS)[number]

export const BANNER_COLOURS = { design: '#1d4ed8', storybook: '#ea580c' } as const

export type Banner = { kind: keyof typeof BANNER_COLOURS; title: string; lines: string[] }

/** Where a difference is on one side: a CSS selector, or a heading, button, link, label or list item by its words. */
export type Locator = { selector: string } | OutlineItem

export type Difference = { title: string; detail: string; board: Locator | null; story: Locator | null }

/** A board's differences, from its file or from the comparison, with what was ruled out and which data was lined up. */
export type DifferenceList = { differences: Difference[]; notDifferences: string[]; aligned: string[]; notAligned: string[]; fixture: string | null; seeded: boolean; left: number; hidden?: number; all?: Difference[] }

/** `Ticket.dc.html` is listed in `differences/Ticket.json`, under the snapshot folder. */
export const differencesFile = (board: string): string => `differences/${board.replace(/\.dc\.html$/, '')}.json`

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown, where: string): string => {
  if (typeof value !== 'string' || value.trim() === '') throw new BoardShotError(`${where} must be a non-empty string.`)
  return value
}

const strings = (value: unknown, where: string): string[] => {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new BoardShotError(`${where} must be a list of strings.`)
  return value.map((item, i) => text(item, `${where}[${i}]`))
}

/**
 * A board's differences file, checked: `{ "fixture"?, "differences": [{ "title", "detail", "board", "story" }],
 * "notDifferences"?, "aligned"?, "notAligned"? }`, where `board` and `story` are a CSS selector or null. Throws,
 * naming the field, on anything it does not know; more differences than there are colours is refused.
 */
export const parseDifferences = (source: string, board: string): DifferenceList => {
  const file = differencesFile(board)
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    throw new BoardShotError(`${file} is not JSON.`)
  }
  if (!isRecord(parsed)) throw new BoardShotError(`${file} must be an object.`)
  if (!Array.isArray(parsed.differences)) throw new BoardShotError(`${file}: differences must be a list (it may be empty).`)
  const differences = parsed.differences.map((entry: unknown, i): Difference => {
    const where = `${file}: differences[${i}]`
    if (!isRecord(entry)) throw new BoardShotError(`${where} must be an object.`)
    const side = (value: unknown, name: string): Locator | null => (value === null || value === undefined ? null : { selector: text(value, `${where}.${name}`) })
    const difference = { title: text(entry.title, `${where}.title`), detail: text(entry.detail, `${where}.detail`), board: side(entry.board, 'board'), story: side(entry.story, 'story') }
    if (difference.board === null && difference.story === null) throw new BoardShotError(`${where} ("${difference.title}") names a selector on neither side, so there is nothing to box.`)
    return difference
  })
  if (differences.length > DIFFERENCE_COLOURS.length) throw new BoardShotError(`${file}: ${differences.length} differences, but a picture has colours for ${DIFFERENCE_COLOURS.length}. Keep the ones that matter, or split the screen.`)
  return { differences, notDifferences: strings(parsed.notDifferences, `${file}: notDifferences`), aligned: strings(parsed.aligned, `${file}: aligned`), notAligned: strings(parsed.notAligned, `${file}: notAligned`), fixture: parsed.fixture === undefined ? null : text(parsed.fixture, `${file}: fixture`), seeded: false, left: 0 }
}

/**
 * The differences of a board with no differences file, from the comparison of its wording with its story's: each
 * heading, button, link, label or list item on only one side, in the board's order then the story's. A difference
 * kept by `decided` in the map entry is not one. Only as many as there are colours are numbered; `left` counts the rest.
 */
export const seedDifferences = (boardHtml: string, storyHtml: string, decided: readonly string[] = []): DifferenceList => {
  const c = comparePage('', '', '', boardHtml, storyHtml, decided)
  const found: Difference[] = [...c.onlyOnBoard.map(item => ({ title: `${item.kind}: ${item.text}`, detail: 'On the board only: the story does not draw this wording.', board: item, story: null })), ...c.onlyInStory.map(item => ({ title: `${item.kind}: ${item.text}`, detail: 'In the story only: the board does not draw this wording.', board: null, story: item }))]
  const differences = found.slice(0, DIFFERENCE_COLOURS.length)
  return { differences, notDifferences: [], aligned: [], notAligned: [], fixture: null, seeded: true, left: found.length - differences.length, all: found }
}

/**
 * A seeded list cut down to what the picture can show: the differences seen on their side (`seen`, one per candidate
 * in `list.all`), numbered while there are colours. `hidden` counts those left out because nobody can see them (in a
 * closed menu or panel), `left` those left out for want of a colour.
 */
export const visibleDifferences = (list: DifferenceList, seen: readonly boolean[]): DifferenceList => {
  const visible = (list.all ?? list.differences).filter((_, i) => seen[i])
  const differences = visible.slice(0, DIFFERENCE_COLOURS.length)
  return { ...list, differences, left: visible.length - differences.length, hidden: (list.all ?? list.differences).length - visible.length }
}

// ---- Banners ----

export const designBanner = (input: { board: string; artifact: string | null; version: string | null; story: string | null }): Banner => ({
  kind: 'design',
  title: 'DESIGN CANVAS',
  lines: [`Board: ${input.board}`, `Canvas: ${input.artifact ?? 'link not recorded'}${input.version ? ` · copy read at version ${input.version}` : ''}`, 'Shot from the committed snapshot, not read live', input.story ? `Maps to story: ${input.story}` : 'Maps to no story'],
})

export const storybookBanner = (input: { title: string; name: string; id: string; fixture: string | null; commit: string | null; theme: string | null }): Banner => ({
  kind: 'storybook',
  title: 'STORYBOOK',
  lines: [`Story: ${input.title} › ${input.name} (${input.id})`, ...(input.fixture ? [`Fixture: ${input.fixture}`] : []), `Shot from a built Storybook${input.commit ? ` at commit ${input.commit}` : ''}, its scripts run${input.theme ? ` · theme ${input.theme}` : ''}`],
})

// ---- Boxes and badges ----

export type Rect = { x: number; y: number; width: number; height: number }
export type Corner = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'

/** The badge's side, in CSS pixels: a large digit in a white circle with a coloured ring. */
export const BADGE = 44
// Right-hand corners first: text starts at the left, so a badge there is likelier to hide it.
const CORNERS: Corner[] = ['top-right', 'bottom-right', 'top-left', 'bottom-left']

export type Placed = { number: number; rect: Rect; corner: Corner; badge: { x: number; y: number } }

const badgeAt = (rect: Rect, corner: Corner, sideWidth: number) => {
  const x = (corner.endsWith('right') ? rect.x + rect.width : rect.x) - BADGE / 2
  const y = (corner.startsWith('top') ? rect.y : rect.y + rect.height) - BADGE / 2
  // Kept inside the picture, so a box at an edge does not lose its number.
  return { x: Math.min(Math.max(0, x), Math.max(0, sideWidth - BADGE)), y: Math.max(0, y) }
}

const overlaps = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) < BADGE && Math.abs(a.y - b.y) < BADGE

/** Puts each number at its box's top-right corner, or at another corner where that would sit on a badge already placed. */
export const placeBadges = (drawn: readonly { number: number; rect: Rect }[], sideWidth: number): Placed[] => {
  const placed: Placed[] = []
  for (const { number, rect } of drawn) {
    const options = CORNERS.map(corner => ({ corner, badge: badgeAt(rect, corner, sideWidth) }))
    placed.push({ number, rect, ...(options.find(option => !placed.some(other => overlaps(other.badge, option.badge))) ?? options[0]!) })
  }
  return placed
}

// ---- The joined picture ----

export const escapeHtml = (value: string): string => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

export type Side = { banner: Banner; image: string; height: number; boxes: Placed[] }

export const SIDE_GAP = 32
/** The box is drawn this far outside the element, so its border does not run through the element's text. */
export const BOX_OUTSET = 4

const sideHtml = (side: Side, width: number, column: 1 | 2): string => {
  const lines = side.banner.lines.map(line => `<div>${escapeHtml(line)}</div>`).join('')
  const boxes = side.boxes
    .map(({ number, rect, badge }) => {
      const hex = DIFFERENCE_COLOURS[number - 1]!.hex
      return `<div class="box" data-difference="${number}" style="left:${rect.x - BOX_OUTSET}px;top:${rect.y - BOX_OUTSET}px;width:${rect.width + 2 * BOX_OUTSET}px;height:${rect.height + 2 * BOX_OUTSET}px;border-color:${hex}"></div><div class="badge" data-difference="${number}" style="left:${badge.x}px;top:${badge.y}px;border-color:${hex};color:${hex}">${number}</div>`
    })
    .join('')
  return `<section class="side" data-side="${side.banner.kind}"><header class="banner" style="grid-column:${column};grid-row:1;background:${BANNER_COLOURS[side.banner.kind]}"><b>${escapeHtml(side.banner.title)}</b>${lines}</header><div class="shot" style="grid-column:${column};grid-row:2;width:${width}px;height:${side.height}px"><img src="${side.image}" width="${width}" height="${side.height}" alt="">${boxes}</div></section>`
}

/** The page the two shots are joined in: the board on the left and the story on the right at one width, each under its banner, the boxes and badges over them. */
export const composeHtml = (board: Side, story: Side, width: number): string => `<!doctype html>
<html><head><meta charset="utf-8"><style>
body { margin: 0; background: #fff; font-family: Arial, Helvetica, sans-serif; }
.pair { display: grid; grid-template-columns: ${width}px ${width}px; column-gap: ${SIDE_GAP}px; }
.side { display: contents; }
.banner { color: #fff; padding: 12px 16px; font-size: 15px; line-height: 1.45; box-sizing: border-box; }
.banner b { display: block; font-size: 26px; letter-spacing: 0.04em; margin-bottom: 4px; }
.shot { position: relative; overflow: hidden; align-self: start; }
.shot img { display: block; }
.box { position: absolute; box-sizing: border-box; border: 4px solid; }
.badge { position: absolute; box-sizing: border-box; width: ${BADGE}px; height: ${BADGE}px; border-radius: 50%;
  background: #fff; border: 4px solid; font: 700 26px/${BADGE - 8}px Arial, Helvetica, sans-serif; text-align: center; }
</style></head><body><div class="pair">${sideHtml(board, width, 1)}${sideHtml(story, width, 2)}</div></body></html>
`

// ---- The table beside the picture ----

const cell = (value: string) => value.replaceAll('|', '\\|').replaceAll('\n', ' ')

const where = (rect: Rect | null, locator: Locator | null) => (rect && locator ? `${'selector' in locator ? `\`${locator.selector}\`` : `${locator.kind} “${locator.text}”`} (${Math.round(rect.width)}×${Math.round(rect.height)} at ${Math.round(rect.x)}, ${Math.round(rect.y)})` : 'Not drawn')

/**
 * The table: what each number is, in its colour, where it is on each side, what was ruled out and which data was
 * lined up, and where each side came from. The number cell names the colour, since Markdown cannot colour a cell.
 */
export const legendMarkdown = (input: { board: string; list: DifferenceList; drawn: readonly { board: Rect | null; story: Rect | null }[]; banners: { board: Banner; story: Banner }; image: string }): string => {
  const { list, drawn } = input
  const out = [`## ${input.board}: design canvas against Storybook`, '', `Picture: \`${input.image}\``, '']
  for (const banner of [input.banners.board, input.banners.story]) out.push(`**${banner.title}**`, ...banner.lines.map(line => `- ${line}`), '')
  if (list.seeded) out.push(`The differences were found by comparing the two sides' wording (headings, buttons, links, labels, list items), not written for this board: add \`${differencesFile(input.board)}\` to title them, box blocks, or rule some out.${list.left > 0 ? ` ${list.left} more ${list.left === 1 ? 'was' : 'were'} found than the picture has colours for, and ${list.left === 1 ? 'is' : 'are'} not numbered.` : ''}${list.hidden ? ` ${list.hidden} ${list.hidden === 1 ? 'is' : 'are'} left out because ${list.hidden === 1 ? 'it is' : 'they are'} not visible in the picture (in a closed menu, panel or dialog).` : ''}`, '')
  if (list.differences.length === 0) out.push('No differences are listed for this board.', '')
  else {
    out.push('| # | Colour | Difference | On the board | In the story |', '| --- | --- | --- | --- | --- |')
    list.differences.forEach((d, i) => out.push(`| ${i + 1} | ${DIFFERENCE_COLOURS[i]!.name} | **${cell(d.title)}**: ${cell(d.detail)} | ${cell(where(drawn[i]!.board, d.board))} | ${cell(where(drawn[i]!.story, d.story))} |`))
    out.push('')
  }
  const section = (heading: string, items: readonly string[]) => {
    if (items.length > 0) out.push(`**${heading}**`, ...items.map(item => `- ${item}`), '')
  }
  section('Not a difference (the fixture or the browser, not the design)', ['Both sides are drawn in one stand-in font (the canvas fonts do not load offline), so type is not compared.', ...list.notDifferences])
  section('Data aligned between the two sides', list.aligned)
  section('Data not aligned', list.notAligned)
  return out.join('\n')
}
