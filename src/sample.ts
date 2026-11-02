// The sample values a board shows, lifted so a story can show the same ones. The canvas owns the data: a
// designer marks a value on a board with `data-sample="group.name"`, and the snapshot copies its text (an
// input's `value`) into the board's boards/<Board>.meta.json. Stories and the catalogue read those files. docs/design-system.md.

/** Board file → sample key → the text the board shows. */
export type SampleData = Record<string, Record<string, string>>

export class SnapshotError extends Error {}

const KEY = /^[a-z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*$/

const NAMED: Record<string, string> = { nbsp: ' ', lt: '<', gt: '>', quot: '"', amp: '&', middot: '·', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', times: '×' }

/** The entities a board is written with; one it does not know is refused, not passed through. */
const decode = (file: string, key: string, text: string) =>
  text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (entity, name: string) => {
    if (name.startsWith('#')) return String.fromCodePoint(name[1] === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10))
    const known = NAMED[name]
    if (known === undefined) throw new SnapshotError(`${file}: data-sample="${key}" has the entity ${entity}, which is not read.`)
    return known
  })

/**
 * The marked values of one board's source. A marked element is a leaf: its text with any tags removed and
 * whitespace collapsed, or for an `<input>` its `value`. Refuses a key that is badly formed or used twice, an
 * element that holds another of its own name, an entity it does not know, and a value that is empty or a
 * `{{hole}}`, since each would give a story something other than what the board shows.
 */
export const extractSamples = (file: string, source: string): Record<string, string> => {
  const html = source.replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '')
  const samples: Record<string, string> = {}
  for (const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*?)\bdata-sample="([^"]*)"([^>]*)>/g)) {
    const [whole, tag, before, key, after] = match as unknown as [string, string, string, string, string]
    if (!KEY.test(key)) throw new SnapshotError(`${file}: data-sample="${key}" is not group.name (camelCase).`)
    if (key in samples) throw new SnapshotError(`${file}: data-sample="${key}" is used twice.`)
    let value: string
    if (tag === 'input') {
      const attr = /\bvalue="([^"]*)"/.exec(before + after)
      value = attr ? decode(file, key, attr[1]!) : ''
    } else {
      const from = match.index + whole.length
      const end = html.indexOf(`</${tag}>`, from)
      if (end === -1) throw new SnapshotError(`${file}: data-sample="${key}" is never closed.`)
      const inner = html.slice(from, end)
      if (new RegExp(`<${tag}[\\s>]`).test(inner)) throw new SnapshotError(`${file}: data-sample="${key}" holds another <${tag}>: mark a leaf.`)
      value = decode(file, key, inner.replace(/<[^>]*>/g, ''))
    }
    value = value.replace(/\s+/g, ' ').trim()
    if (value === '') throw new SnapshotError(`${file}: data-sample="${key}" is empty.`)
    if (value.includes('{{')) throw new SnapshotError(`${file}: data-sample="${key}" is a {{hole}}, not a value.`)
    samples[key] = value
  }
  return samples
}

/** The marked values of each listed screen, as `board file → key → text`, in the order listed. */
export const sampleData = (screens: readonly string[], read: (file: string) => string): SampleData => Object.fromEntries(screens.map(file => [file, extractSamples(file, read(file))]))

/**
 * What is wrong with the committed values: values that no longer match the committed copy of the board, or values
 * for a board the snapshot does not copy. A screen that marks nothing is allowed: its story keeps its own data. `fresh` is `sampleData`'s reading of the copies.
 */
export const sampleProblems = (committed: SampleData, fresh: SampleData): string[] => {
  const problems: string[] = []
  for (const [file, values] of Object.entries(fresh)) {
    if (JSON.stringify(committed[file] ?? {}) !== JSON.stringify(values)) problems.push(`The samples in the metadata of ${file} differ from the data-sample values in boards/${file}: refresh the snapshot.`)
  }
  for (const file of Object.keys(committed)) if (!(file in fresh)) problems.push(`The snapshot has samples for "${file}", which is not a screen it copies.`)
  return problems
}
