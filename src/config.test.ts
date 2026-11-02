import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseConfig } from './config.ts'
import { TICKET_PAGE } from './snapshot.ts'

const root = resolve('/project')
const base = { artifact: 'https://claude.ai/artifact/x', snapshot: 'design/canvas', stories: ['stories/**/*.stories.tsx'] }

describe('parseConfig', () => {
  it('resolves the snapshot from the config folder and fills the defaults', () => {
    expect(parseConfig(JSON.stringify(base), root)).toEqual({ artifact: base.artifact, snapshot: resolve(root, 'design/canvas'), stories: base.stories, tokens: 'tokens.json', prototypePages: TICKET_PAGE, root })
  })

  it('reads the optional fields, prototypePages as a case-blind expression', () => {
    const config = parseConfig(JSON.stringify({ ...base, tokens: 'ds/nookivia/tokens.json', prototypePages: '^prototypes\\b', tokensBoard: 'Tokens.dc.html' }), root)
    expect(config.tokens).toBe('ds/nookivia/tokens.json')
    expect(config.tokensBoard).toBe('Tokens.dc.html')
    expect(config.prototypePages.test('Prototypes page')).toBe(true)
  })

  it.each([
    ['{', /not JSON/],
    ['[]', /not a JSON object/],
    [JSON.stringify({ ...base, artifact: '' }), /"artifact" must be/],
    [JSON.stringify({ ...base, snapshot: undefined }), /"snapshot" must be/],
    [JSON.stringify({ ...base, stories: [] }), /"stories" must be a list/],
    [JSON.stringify({ ...base, prototypePages: '(' }), /not a regular expression/],
  ])('refuses %s', (text, message) => {
    expect(() => parseConfig(text, root)).toThrow(message)
  })
})
