import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { CONFIG_FILE, DEFAULTS, findConfig, LEGACY_CONFIG_FILE, loadConfig, parseConfig } from './config.ts'
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
      differences: resolve(root, DEFAULTS.snapshot, 'differences'),
      checks: {},
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

  it('keeps the differences lists in the snapshot unless told where else, and follows a moved snapshot', () => {
    expect(parseConfig(JSON.stringify({ snapshot: 'fixtures/dc' }), root).differences).toBe(resolve(root, 'fixtures/dc/differences'))
    expect(parseConfig(JSON.stringify({ snapshot: 'fixtures/dc', differences: 'fixtures/diffs' }), root).differences).toBe(resolve(root, 'fixtures/diffs'))
    expect(() => parseConfig(JSON.stringify({ differences: '' }), root)).toThrow(/"differences" must be a non-empty string/)
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
    [JSON.stringify({ checks: [] }), /"checks" must be an object/],
    [JSON.stringify({ checks: { outline: true } }), /"checks.outline" is not a check/],
    [JSON.stringify({ checks: { tokenThemes: 'yes' } }), /"checks.tokenThemes" must be true or false/],
    [JSON.stringify({ checks: { tokensCss: [] } }), /"checks.tokensCss" must be a list/],
    [JSON.stringify({ themes: 'dark' }), /"themes" must be a list of theme names/],
  ])('refuses %s', (text, message) => {
    expect(() => parseConfig(text, root)).toThrow(message)
  })
})

describe('checks', () => {
  it('are all off unless named, and a false flag is off', () => {
    expect(parseConfig('{}', root).checks).toEqual({})
    expect(parseConfig(JSON.stringify({ checks: { repeatedSampleKeys: false } }), root).checks).toEqual({})
  })
  it('turns on the flags named and keeps the stylesheet globs', () => {
    const checks = { repeatedSampleKeys: true, outlineSelectors: true, passedSamples: true, tokenThemes: true, tokensCss: ['src/**/*.css'] }
    expect(parseConfig(JSON.stringify({ checks }), root).checks).toEqual(checks)
  })
  it('names the file it read in a refusal', () => {
    expect(() => parseConfig('{"x":1}', root, LEGACY_CONFIG_FILE)).toThrow(/^\.drawing-board: "x" is not a setting/)
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

  it('reads the legacy name when it is the only one, and prefers the new name when both are there', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-board-names-'))
    writeFileSync(join(dir, LEGACY_CONFIG_FILE), '{"snapshot":"old"}')
    expect(findConfig(dir)).toBe(join(dir, LEGACY_CONFIG_FILE))
    writeFileSync(join(dir, CONFIG_FILE), '{"snapshot":"new"}')
    expect(findConfig(dir)).toBe(join(dir, CONFIG_FILE))
  })
  it('prefers a nearer legacy file to a farther preferred one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-board-near-'))
    mkdirSync(join(dir, 'a'))
    writeFileSync(join(dir, CONFIG_FILE), '{}')
    writeFileSync(join(dir, 'a', LEGACY_CONFIG_FILE), '{}')
    expect(findConfig(join(dir, 'a'))).toBe(join(dir, 'a', LEGACY_CONFIG_FILE))
  })
  it('loadConfig reads either name from --config and reports the legacy name in its errors', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-board-load-'))
    writeFileSync(join(dir, LEGACY_CONFIG_FILE), '{"snapshot":"old"}')
    expect(loadConfig(join(dir, LEGACY_CONFIG_FILE)).snapshot).toBe(join(dir, 'old'))
    writeFileSync(join(dir, CONFIG_FILE), '{"snapshot":"new"}')
    expect(loadConfig(join(dir, CONFIG_FILE)).snapshot).toBe(join(dir, 'new'))
    writeFileSync(join(dir, LEGACY_CONFIG_FILE), '{"bad":1}')
    expect(() => loadConfig(join(dir, LEGACY_CONFIG_FILE))).toThrow(/^\.drawing-board: "bad"/)
  })
})
