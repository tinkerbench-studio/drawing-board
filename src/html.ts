// Reading a board's markup: the exact markup of a component it marks with `data-component="Name"`, as canonical
// text, so a board's version of a component and the built one can be compared; and the fixed wording and structure
// of a screen, so a board and its story can be.
import { parse, parseFragment } from 'parse5'

type Node = { nodeName: string; tagName?: string; attrs?: { name: string; value: string }[]; childNodes?: Node[]; value?: string }

const elementsOf = (node: Node): Node[] => (node.childNodes ?? []).flatMap(child => [child, ...elementsOf(child)]).filter(child => child.tagName !== undefined)

const attr = (node: Node, name: string) => node.attrs?.find(a => a.name === name)?.value

/** Attributes only a design carries: they are not part of what a component draws. */
const DESIGN_ONLY = /^data-(sample|component)/

/** A style attribute with its declarations sorted, so their order is not a difference. */
const style = (value: string) =>
  value
    .split(';')
    .map(part =>
      part
        .split(':')
        .map(piece => piece.trim().replace(/\s+/g, ' '))
        .join(':'),
    )
    .filter(Boolean)
    .sort()
    .join(';')

/** One node as canonical text: attributes sorted, whitespace collapsed, whitespace-only text dropped, design-only attributes left out. */
const canonicalNode = (node: Node): string => {
  if (node.nodeName === '#text') return (node.value ?? '').replace(/\s+/g, ' ').trim()
  if (node.tagName === undefined) return ''
  const attrs = (node.attrs ?? [])
    .filter(a => !DESIGN_ONLY.test(a.name))
    .map(a => `${a.name}="${a.name === 'style' ? style(a.value) : a.value}"`)
    .sort()
  const inner = (node.childNodes ?? []).map(canonicalNode).filter(Boolean).join('')
  return `<${node.tagName}${attrs.length ? ' ' + attrs.join(' ') : ''}>${inner}</${node.tagName}>`
}

/** Markup as canonical text, so a board's version of a component and the built one can be compared. */
export const canonical = (html: string): string => (parseFragment(html) as unknown as Node).childNodes!.map(canonicalNode).filter(Boolean).join('')

/** The canonical markup inside each element a board marks `data-component="Name"`, by name. A name marked twice is the first. */
export const componentMarkup = (source: string): Record<string, string> => {
  const result: Record<string, string> = {}
  for (const element of elementsOf(parse(source) as unknown as Node)) {
    const name = attr(element, 'data-component')
    if (name !== undefined && !(name in result)) result[name] = (element.childNodes ?? []).map(canonicalNode).filter(Boolean).join('')
  }
  return result
}

export type OutlineItem = { kind: 'heading' | 'button' | 'link' | 'label' | 'item'; text: string }

/** Text that is a value, not wording: a digit, an address, a currency sign, a placeholder, a quotation, or a paragraph. */
export const isValue = (text: string): boolean => /[\d@£$€"“”]|\{\{/.test(text) || text.length > 90

const textOf = (node: Node): string => ((node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(textOf).join(' ')) ?? '').replace(/\s+/g, ' ').trim()

/** The fixed wording and structure of a screen, in document order: headings, buttons, links, field labels, column heads and list items, leaving values out. */
export const outline = (html: string): OutlineItem[] => {
  const items: OutlineItem[] = []
  for (const element of elementsOf(parse(html) as unknown as Node)) {
    const tag = element.tagName!
    const classes = (attr(element, 'class') ?? '').split(/\s+/)
    let kind: OutlineItem['kind'] | undefined
    if (/^h[1-6]$/.test(tag)) kind = 'heading'
    else if (tag === 'button' || (tag === 'a' && (classes.includes('button') || classes.includes('btn')))) kind = 'button'
    else if (tag === 'a') kind = 'link'
    else if (tag === 'label' || tag === 'th') kind = 'label'
    else if (tag === 'li') kind = 'item'
    if (kind === undefined) continue
    const text = textOf(element)
    if (text !== '' && !isValue(text)) items.push({ kind, text })
  }
  return items
}
