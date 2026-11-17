// The package entry stays free of the optional peers; the runner is reached from the /pictures subpath.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import * as entry from './index.ts'
import * as pictures from './browser.ts'

/** Every file the entry reaches through relative imports. */
const reached = (file: string, seen = new Set<string>()): Set<string> => {
  if (seen.has(file)) return seen
  seen.add(file)
  const source = readFileSync(join(import.meta.dirname, file), 'utf8')
  for (const m of source.matchAll(/^(?:import|export)\s(?!type\s)[^'"]*from '\.\/([^']+)'/gm)) reached(m[1]!, seen)
  return seen
}

describe('the package entry and /pictures', () => {
  it('exports the runner from /pictures', () => {
    for (const name of ['boardShots', 'boardShotOptions', 'boardShot']) expect(pictures).toHaveProperty(name)
  })

  it('leaves the runner out of the entry', () => {
    for (const name of ['boardShots', 'boardShotOptions', 'boardShot']) expect(entry).not.toHaveProperty(name)
  })

  it('reaches no file that imports playwright-core or esbuild at load time', () => {
    for (const file of reached('index.ts')) {
      expect(readFileSync(join(import.meta.dirname, file), 'utf8'), file).not.toMatch(/^import\s(?!type\s)[^\n]*from '(playwright-core|esbuild)'/m)
    }
  })
})
