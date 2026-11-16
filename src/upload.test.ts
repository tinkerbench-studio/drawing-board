import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { plan, typeOf, upload, uploadCommand } from './upload.ts'

const folder = () => {
  const dir = mkdtempSync(join(tmpdir(), 'upload-'))
  for (const name of ['b-light.png', 'a-dark.PNG', 'notes.md']) writeFileSync(join(dir, name), 'x')
  return dir
}

describe('plan', () => {
  it('lists only the picture files, sorted, with their types', () => {
    expect(plan(folder())).toEqual([
      { name: 'a-dark.PNG', type: 'image/png' },
      { name: 'b-light.png', type: 'image/png' },
    ])
    expect(typeOf('x.svg')).toBeUndefined()
  })
})

describe('upload', () => {
  it('confirms the files whose PUT was accepted, and names why another failed', async () => {
    const dir = folder()
    const put = (async (url: string) => ({ ok: url.includes('good'), status: 403 })) as unknown as typeof fetch
    const result = await upload(dir, [{ name: 'a-dark.PNG', url: 'https://x/good' }, { name: 'b-light.png', url: 'https://x/bad' }, { name: '../evil.png', url: 'https://x/good' }, { name: 'notes.md', url: 'https://x/good' }], put)
    expect(result.confirm).toEqual([{ name: 'a-dark.PNG' }])
    expect(result.failed).toEqual([
      { name: 'b-light.png', reason: 'PUT answered 403' },
      { name: '../evil.png', reason: 'not a picture file name with a url' },
      { name: 'notes.md', reason: 'not a picture file name with a url' },
    ])
  })
})

describe('uploadCommand', () => {
  it('exits 2 on a wrong call and prints the plan otherwise', async () => {
    const lines: string[] = []
    const log = { log: (m: string) => void lines.push(m), error: (m: string) => void lines.push(m) }
    expect(await uploadCommand([], log)).toBe(2)
    expect(await uploadCommand(['plan', folder()], log)).toBe(0)
    expect(lines.join('\n')).toContain('"image/png"')
  })
})
