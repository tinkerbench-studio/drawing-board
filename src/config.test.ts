import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { CONFIG_FILE, DEFAULTS, findConfig, parseConfig } from './config.ts'
import { TICKET_PAGE } from './snapshot.ts'

const root = resolve('/project')

describe('parseConfig', () => {
  it('gives every setting its convention when there is no file', () => {
    expect(parseConfig('', root)).toEqual({
      artifact: null,
      snapshot: resolve(root, DEFAULTS.snapshot),
      stories: DEFAULTS.stories,
      tokens: 'tokens.json',
      prototypePages: TICKET_PAGE,
      storybook: resolve(root, 'storybook-static'),
      out: resolve(root, 'reports/design-canvas'),
      themes: [],
      root,
    })
  })

  it('takes only what the file names, and leaves the rest to convention', () => {
    const config = parseConfig(JSON.stringify({ snapshot: 'fixtures/design-canvas', tokens: 'ds/nookivia/tokens.json', prototypePages: '^prototypes\\b' }), root)
    expect(config.snapshot).toBe(resolve(root, 'fixtures/design-canvas'))
    expect(config.tokens).toBe('ds/nookivia/tokens.json')
    expect(config.prototypePages.test('Prototypes page')).toBe(true)
    expect(config.storybook).toBe(resolve(root, 'storybook-static'))
    expect(config.stories).toEqual(DEFAULTS.stories)
  })

  it('reads the canvas link the last snapshot recorded when the file does not set one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-board-config-'))
    mkdirSync(join(dir, 'design/canvas'), { recursive: true })
    writeFileSync(join(dir, 'design/canvas/artifact.json'), JSON.stringify({ artifact: 'https://claude.ai/artifact/recorded' }))
    expect(parseConfig('', dir).artifact).toBe('https://claude.ai/artifact/recorded')
    expect(parseConfig(JSON.stringify({ artifact: 'https://claude.ai/artifact/set' }), dir).artifact).toBe('https://claude.ai/artifact/set')
  })

  it.each([
    ['{', /not JSON/],
    ['[]', /not a JSON object/],
    [JSON.stringify({ snapshots: 'x' }), /"snapshots" is not a setting/],
    [JSON.stringify({ artifact: '' }), /"artifact" must be/],
    [JSON.stringify({ stories: [] }), /"stories" must be a list/],
    [JSON.stringify({ prototypePages: '(' }), /not a regular expression/],
    [JSON.stringify({ themes: 'dark' }), /"themes" must be a list of theme names/],
  ])('refuses %s', (text, message) => {
    expect(() => parseConfig(text, root)).toThrow(message)
  })
})

describe('findConfig', () => {
  it(`finds the nearest ${CONFIG_FILE} at or above a folder, or none`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-board-find-'))
    mkdirSync(join(dir, 'a/b'), { recursive: true })
    expect(findConfig(join(dir, 'a/b'))).toBeUndefined()
    writeFileSync(join(dir, CONFIG_FILE), '{}')
    expect(findConfig(join(dir, 'a/b'))).toBe(join(dir, CONFIG_FILE))
  })
})
