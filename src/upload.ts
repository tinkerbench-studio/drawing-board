// Uploading a ticket's before/after pictures to the tracker's storage instead of committing them:
//   1. `drawing-board upload plan <dir>` prints the { name, type } of each picture in <dir>: the arguments of the presign call.
//   2. The session calls the presign tool for each and saves the answers (each one's url and headers, with the name it passed) as a JSON array.
//   3. `drawing-board upload put <dir> <presigned.json>` PUTs each file to its url with exactly the headers given, and prints the { name } of those accepted.
//   4. The session calls the confirm tool for each one printed: only then is the picture confirmed.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

export const TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }

export const typeOf = (name: string): string | undefined => TYPES[name.slice(name.lastIndexOf('.')).toLowerCase()]

/** The picture files directly in a folder, as the { name, type } a presign call takes. */
export const plan = (dir: string): { name: string; type: string }[] =>
  readdirSync(dir)
    .filter(name => typeOf(name) !== undefined && statSync(join(dir, name)).isFile())
    .sort()
    .map(name => ({ name, type: typeOf(name)! }))

export type Presigned = { name: unknown; url?: unknown; headers?: Record<string, string> }

/** PUTs each presigned upload with the file of that name in `dir`. `put` is fetch, injectable for tests. */
export const upload = async (dir: string, presigned: readonly Presigned[], put: typeof fetch = fetch): Promise<{ confirm: { name: string }[]; failed: { name: string; reason: string }[] }> => {
  const confirm: { name: string }[] = []
  const failed: { name: string; reason: string }[] = []
  for (const { name, url, headers } of presigned) {
    if (typeof name !== 'string' || name !== basename(name) || typeOf(name) === undefined || typeof url !== 'string') {
      failed.push({ name: String(name), reason: 'not a picture file name with a url' })
      continue
    }
    try {
      const response = await put(url, { method: 'PUT', headers: headers ?? {}, body: readFileSync(join(dir, name)) })
      if (response.ok) confirm.push({ name })
      else failed.push({ name, reason: `PUT answered ${response.status}` })
    } catch (error) {
      failed.push({ name, reason: error instanceof Error ? error.message : String(error) })
    }
  }
  return { confirm, failed }
}

/** Runs `upload plan|put`; returns the exit code: 0 when done, 1 when a PUT failed, 2 on a wrong call. */
export const uploadCommand = async (argv: readonly string[], log: Pick<Console, 'log' | 'error'> = console): Promise<number> => {
  const [action, dir, file] = argv
  if (action === 'plan' && dir !== undefined) {
    log.log(JSON.stringify(plan(dir), null, 2))
    return 0
  }
  if (action === 'put' && dir !== undefined && file !== undefined) {
    const { confirm, failed } = await upload(dir, JSON.parse(readFileSync(file, 'utf8')) as Presigned[])
    log.log(JSON.stringify({ confirm }, null, 2))
    for (const f of failed) log.error(`${f.name}: ${f.reason}`)
    return failed.length === 0 ? 0 : 1
  }
  log.error('Usage: drawing-board upload plan <dir> | upload put <dir> <presigned.json>')
  return 2
}
