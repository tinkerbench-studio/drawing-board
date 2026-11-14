// The small generic checks a project turns on in `.drawing-board`'s `checks` setting (all off by default): each takes
// the committed copies or tokens and returns problem lines, so `drawing-board check` prints them with its own.
import { parse } from 'parse5'

import { SnapshotError } from './sample.ts'
import type { BoardMap } from './snapshot.ts'

type Node = { nodeName: string; tagName?: string; attrs?: { name: string; value: string }[]; childNodes?: Node[] }

const elementsOf = (node: Node): Node[] => (node.childNodes ?? []).flatMap(child => [child, ...elementsOf(child)]).filter(child => child.tagName !== undefined)
const attr = (node: Node, name: string) => node.attrs?.find(a => a.name === name)?.value

// ---- repeatedSampleKeys: a data-sample key marks one value, so a key used twice is refused by the snapshot; this finds it first.

const MARK = /<([a-z][a-z0-9]*)\b([^>]*?)\bdata-sample="([^"]*)"([^>]*)>/g

/** The data-sample keys a board uses more than once, in the order they first repeat. Read as the snapshot reads a board: comments are skipped. */
export const repeatedSampleKeys = (html: string): string[] => {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  const source = html.replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '')
  for (const match of source.matchAll(MARK)) {
    const key = match[3] ?? ''
    if (seen.has(key)) repeated.add(key)
    seen.add(key)
  }
  return [...repeated]
}

/** One line per repeated key, naming the board file, the key and how to fix it. */
export const sampleKeyProblems = (boards: Record<string, string>): string[] => Object.entries(boards).flatMap(([file, html]) => repeatedSampleKeys(html).map(key => `${file}: data-sample "${key}" is used more than once. A key marks one value: give each further place a numbered key ("${key}2", "${key}3"), so the snapshot can lift every value.`))

// ---- outlineSelectors: a map entry's `outline` selectors against the board's copy.

/** One compound selector (tag, .class, #id, [attr] or [attr=value], in any mix) as a test on an element. */
const compound = (text: string): ((node: Node) => boolean) => {
  const parts = [...text.matchAll(/^[a-z][a-z0-9-]*|\.(?:-?[a-z_]|--)[\w-]*|#(?:-?[a-z_]|--)[\w-]*|\[(?:-?[a-z_]|--)[\w-]*(?:=(?:"[^"]*"|(?:-?[a-z_]|--)[\w-]*))?\]/gi)].map(m => m[0])
  if (parts.length === 0 || parts.join('') !== text) throw new Error(`"${text}" is not a selector this tool reads: tags, .classes, #ids, [attributes] and spaces between them.`)
  const tests = parts.map((part): ((node: Node) => boolean) => {
    if (part.startsWith('.')) return node => (attr(node, 'class') ?? '').split(/\s+/).includes(part.slice(1))
    if (part.startsWith('#')) return node => attr(node, 'id') === part.slice(1)
    if (part.startsWith('[')) {
      const [name, ...value] = part.slice(1, -1).split('=')
      return node => (value.length === 0 ? attr(node, name!) !== undefined : attr(node, name!) === value.join('=').replace(/^"|"$/g, ''))
    }
    return node => node.tagName === part.toLowerCase()
  })
  return node => tests.every(test => test(node))
}

/** How many elements of a board's markup a selector names (compound selectors, a space for "inside"). It throws on a selector it cannot read, so the browser, which runs the same selector, reads it the same way. */
export const selectorMatches = (source: string, selector: string): number => {
  const steps = selector.trim().split(/\s+/).map(compound)
  const found = (scope: Node[], at: number): Node[] => {
    const hits = scope.filter(steps[at]!)
    return at === steps.length - 1 ? hits : hits.flatMap(hit => found(elementsOf(hit), at + 1))
  }
  return new Set(found(elementsOf(parse(source) as unknown as Node), 0)).size
}

/** What is wrong with the `outline` entries of a board map: one on a board with no story, a shape other than `{ "board": [selectors], "story": [selectors] }`, an unreadable selector, or a board selector that names nothing in the board's copy. */
export const outlineProblems = (map: BoardMap, boardHtml: (file: string) => string | undefined): string[] =>
  Object.entries(map).flatMap(([file, entry]) => {
    if (entry.outline === undefined) return []
    if (entry.story === undefined) return [`${file}: "outline" is for a board with a story.`]
    const shape = `${file}: "outline" is { "board": [selectors], "story": [selectors] }.`
    const outline = entry.outline
    if (typeof outline !== 'object' || outline === null || Array.isArray(outline)) return [shape]
    const sides = outline as Record<string, unknown>
    if (Object.keys(sides).some(k => k !== 'board' && k !== 'story')) return [shape]
    const list = (side: 'board' | 'story') => sides[side]
    if ((['board', 'story'] as const).some(side => list(side) !== undefined && !(Array.isArray(list(side)) && (list(side) as unknown[]).every(s => typeof s === 'string')))) return [shape]
    const html = boardHtml(file)
    return (['board', 'story'] as const).flatMap(side =>
      ((list(side) as string[] | undefined) ?? []).flatMap(selector => {
        try {
          if (side === 'story') {
            selectorMatches('', selector)
            return []
          }
          if (html === undefined) return [`${file}: no copy of the board to hold "${selector}" to.`]
          return selectorMatches(html, selector) > 0 ? [] : [`${file}: outline "${selector}" names nothing on the board.`]
        } catch (error) {
          return [`${file}: ${(error as Error).message}`]
        }
      }),
    )
  })

// ---- passedSamples: `data-sample-<prop>` on a `<dc-import>`, the value a board passes to an imported board as a prop.

const PASSED_KEY = /^[a-z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*$/
const NAMED: Record<string, string> = { nbsp: ' ', lt: '<', gt: '>', quot: '"', amp: '&', middot: '·', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', times: '×' }

const decodePassed = (file: string, key: string, text: string) =>
  text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (entity, name: string) => {
    if (name.startsWith('#')) {
      const code = name[1] === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
      if (code > 0x10ffff) throw new SnapshotError(`${file}: data-sample="${key}" has the entity ${entity}, which is not a character.`)
      return String.fromCodePoint(code)
    }
    const known = NAMED[name]
    if (known === undefined) throw new SnapshotError(`${file}: data-sample="${key}" has the entity ${entity}, which is not read.`)
    return known
  })

/**
 * The values one board's source passes to an import as a literal prop (`<dc-import count="2" data-sample-count="header.count">`).
 * `extractSamples` reads only leaf marks, so these are not in the snapshot's samples. The prop is taken as written, entities
 * read and nothing collapsed. Refuses a badly formed key, one used twice, one naming a prop the import does not pass, and a
 * value that is empty or still a `{{hole}}`.
 */
export const passedSamples = (file: string, source: string): Record<string, string> => {
  const html = source.replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '')
  const samples: Record<string, string> = {}
  for (const tag of html.matchAll(/<dc-import\b((?:"[^"]*"|[^>"])*)>/g)) {
    const attrs = new Map<string, string>()
    for (const a of tag[1]!.matchAll(/([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g)) attrs.set(a[1]!, a[2]!)
    for (const [name, key] of attrs) {
      if (!name.startsWith('data-sample-')) continue
      const prop = name.slice('data-sample-'.length)
      const raw = attrs.get(prop)
      if (raw === undefined) throw new SnapshotError(`${file}: data-sample="${key}" names the prop "${prop}", and the import passes no "${prop}".`)
      if (!PASSED_KEY.test(key)) throw new SnapshotError(`${file}: data-sample="${key}" is not group.name (camelCase).`)
      if (key in samples) throw new SnapshotError(`${file}: data-sample="${key}" is used twice.`)
      const value = decodePassed(file, key, raw).trim()
      if (value === '') throw new SnapshotError(`${file}: data-sample="${key}" is empty.`)
      if (value.includes('{{')) throw new SnapshotError(`${file}: data-sample="${key}" is a {{hole}}, not a value.`)
      samples[key] = value
    }
  }
  return samples
}

/** The refusals of {@link passedSamples} over every copy, as lines. */
export const passedSampleProblems = (boards: Record<string, string>): string[] =>
  Object.entries(boards).flatMap(([file, html]) => {
    try {
      passedSamples(file, html)
      return []
    } catch (error) {
      if (error instanceof SnapshotError) return [error.message]
      throw error
    }
  })

// ---- tokenThemes: every colour has a value for every theme the tokens list.

type Theme = { id: string }
type Colour = { name: string; values?: Record<string, unknown> }

/** Each colour token with no string value for a theme the tokens list, by name and theme. Tokens with no `color.themes` list have nothing to check. */
export const themeValueProblems = (tokens: { color?: { themes?: Theme[]; tokens?: Colour[] } }): string[] => {
  const themes = (tokens.color?.themes ?? []).map(theme => theme.id)
  return (tokens.color?.tokens ?? []).flatMap(token => themes.filter(id => typeof token.values?.[id] !== 'string').map(id => `tokens.json: colour "${token.name}" has no ${id} value.`))
}

// ---- tokensCss: the canvas's tokens against the stylesheets the project ships.

export type CanvasTokens = {
  color?: { tokens?: { name: string; value: string }[] }
  type?: { families?: Record<string, string> }
  radius?: { tokens?: { name: string; value: string }[] }
  shadow?: { tokens?: { name: string; value: string }[] }
}

const normal = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ',')
    .replace(/\(\s+|\s+\)/g, m => m.trim())
    .replace(/"/g, "'")
    .trim()

const uncommented = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Every `--name: value;` declared, each with all the distinct values it is given. */
export const customProperties = (css: string): Map<string, string[]> => {
  const declared = new Map<string, string[]>()
  for (const match of uncommented(css).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/gi)) {
    const values = declared.get(match[1]!) ?? []
    const value = normal(match[2]!)
    if (!values.includes(value)) values.push(value)
    declared.set(match[1]!, values)
  }
  return declared
}

const declarationValues = (css: string, property: string) => {
  const values = new Set<string>()
  for (const match of uncommented(css).matchAll(new RegExp(`(?<![\\w-])${property}\\s*:\\s*([^;}]+)`, 'gi'))) values.add(normal(match[1]!))
  return values
}

const propertyProblem = (declared: Map<string, string[]>, kind: string, name: string, property: string, value: string): string | null => {
  const shipped = declared.get(property)
  if (shipped === undefined) return `${kind} "${name}" (${value}) is on the canvas but no stylesheet declares ${property}.`
  if (shipped.length > 1) return `${kind} "${name}": ${property} is declared with different values (${shipped.join(' and ')}); the check cannot say which one ships.`
  if (shipped[0] !== normal(value)) return `${kind} "${name}" is ${value} on the canvas but ${property} is ${shipped[0]} in the CSS.`
  return null
}

/** The canvas's colours and font families must be declared under the same name with the same value, and each radius and shadow used somewhere. A section the tokens do not have is skipped. */
export const tokenCssProblems = (tokens: CanvasTokens, css: string): string[] => {
  const declared = customProperties(css)
  const problems = [...(tokens.color?.tokens ?? []).map(({ name, value }) => propertyProblem(declared, 'colour', name, `--${name}`, value)), ...Object.entries(tokens.type?.families ?? {}).map(([family, value]) => propertyProblem(declared, 'font family', family, `--${family}`, value))].filter((p): p is string => p !== null)
  const radii = declarationValues(css, 'border-radius')
  for (const { name, value } of tokens.radius?.tokens ?? []) if (!radii.has(normal(value))) problems.push(`radius "${name}" (${value}) is on the canvas but no stylesheet uses border-radius: ${value}.`)
  const shadows = declarationValues(css, 'box-shadow')
  for (const { name, value } of tokens.shadow?.tokens ?? []) if (!shadows.has(normal(value))) problems.push(`shadow "${name}" (${value}) is on the canvas but no stylesheet uses box-shadow: ${value}.`)
  return problems
}
