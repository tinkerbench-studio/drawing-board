import { describe, expect, it } from 'vitest'

import { checkEvidence, DEFAULT_PICTURE_FOLDERS, DEFAULT_UI_PATHS, isTicketKey, isUiPath, touchesUi } from './evidence.ts'

const rules = { uiPaths: [...DEFAULT_UI_PATHS, '^components/'], pictureFolders: [...DEFAULT_PICTURE_FOLDERS] }

describe('isUiPath', () => {
  it('counts stylesheets, tokens, Storybook config and the project’s own folders', () => {
    for (const path of ['assets/site.css', 'ds/tokens.json', '.storybook/preview.ts', 'components/Card.tsx', 'a/b.scss']) expect(isUiPath(path, rules)).toBe(true)
  })
  it('leaves out docs, even a stylesheet in docs, and code that draws nothing', () => {
    for (const path of ['docs/design/site.css', 'packages/worker/app.ts', 'README.md']) expect(isUiPath(path, rules)).toBe(false)
  })
})

describe('checkEvidence', () => {
  it('passes a change that touches no UI path, whatever it adds', () => {
    expect(checkEvidence({ changed: ['packages/a.ts'], added: ['docs/change-screenshots/a.png'] }, rules)).toEqual([])
  })
  it('refuses a committed picture on a UI change, naming the file', () => {
    const problems = checkEvidence({ changed: ['components/a.tsx'], added: ['docs/change-screenshots/a.png', 'docs/change-screenshots/notes.md'] }, rules)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('docs/change-screenshots/a.png is committed')
  })
  it('passes a UI change with no committed picture', () => {
    expect(checkEvidence({ changed: ['components/a.tsx'], added: ['components/b.tsx'] }, rules)).toEqual([])
    expect(touchesUi(['components/a.tsx'], rules)).toBe(true)
  })
})

describe('isTicketKey', () => {
  it('takes a key with a number from 1 and refuses the rest', () => {
    expect([isTicketKey('NOK-702'), isTicketKey('TCK-1'), isTicketKey('NOK-0'), isTicketKey('702'), isTicketKey(undefined)]).toEqual([true, true, false, false, false])
  })
})
