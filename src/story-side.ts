// The story half of `annotate` and `layout`: where a board's story is drawn from. By default the story is the one in
// the built Storybook its map entry names; a project that draws stories another way (from saved markup, say) returns the
// page from its `storyPage()` hook. Both come back as a URL to open, with what the banner needs to name it.
import { existsSync, readFileSync } from 'node:fs'
import type { Server } from 'node:http'
import { join, resolve } from 'node:path'

import { BoardShotError } from './board-shot.ts'
import type { Config } from './config.ts'
import type { Hooks } from './hooks.ts'
import { serve } from './pictures-run.ts'
import { storyUrl } from './pictures.ts'
import { project } from './project.ts'

export type IndexEntry = { id: string; title: string; name: string; type?: string }

/** The story a board's picture shows: `--story-id`, else its map entry's full-page export (`page`), else the first story with its title. */
export const pickStory = (entries: readonly IndexEntry[], story: string, page?: string, id?: string): IndexEntry => {
  const stories = entries.filter(e => e.type !== 'docs')
  if (id !== undefined) {
    const found = stories.find(e => e.id === id)
    if (!found) throw new BoardShotError(`No story "${id}" in the built Storybook: list the ids with drawing-board story-shot <dir> --list.`)
    return found
  }
  const titled = stories.filter(e => e.title === story)
  const kebab = page?.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
  const found = kebab === undefined ? titled[0] : titled.find(e => e.id.endsWith(`--${kebab}`))
  if (!found) throw new BoardShotError(`No story titled "${story}"${page ? ` with the export ${page}` : ''} in the built Storybook: build Storybook from this branch, or pass --story-id.`)
  return found
}

/** The entries of a built Storybook's index.json. */
export const storybookEntries = (storybook: string): IndexEntry[] => {
  if (!existsSync(join(storybook, 'index.json'))) throw new BoardShotError(`${storybook} is not a built Storybook (no index.json): build Storybook first.`)
  const index = JSON.parse(readFileSync(join(storybook, 'index.json'), 'utf8')) as { entries?: Record<string, IndexEntry>; stories?: Record<string, IndexEntry> }
  return Object.values(index.entries ?? index.stories ?? {})
}

/** A story ready to open: its URL, what to wait for, how the banner names it, and the servers to close afterwards. */
export type StorySide = { url: string; ready: string; title: string; name: string; id: string; hooked: boolean; close: () => void }

export type StorySideOptions = { storybook?: string; storyId?: string; theme?: string }

/** The story a mapped board is drawn beside: the `storyPage()` hook's page when the project has one and it returns one, else the built Storybook's. */
export const openStorySide = async (config: Config, hooks: Hooks, board: string, options: StorySideOptions = {}): Promise<StorySide> => {
  const canvas = project(config)
  const entry = canvas.map()[board]
  if (entry?.story === undefined) throw new BoardShotError(`${board} maps to no story, so there is nothing to put beside it.`)
  const page = typeof entry.page === 'string' ? entry.page : undefined
  const hooked = options.storyId === undefined ? await hooks.storyPage?.({ config, canvas, board, story: entry.story, ...(page === undefined ? {} : { page }) }) : undefined
  if (hooked !== undefined) {
    const served = await serve(resolve(hooked.assets ?? config.root), { '/story.html': hooked.html })
    return { url: `${served.base}/story.html`, ready: hooked.ready ?? 'body > *', title: entry.story, name: 'the project’s storyPage() hook', id: 'storyPage', hooked: true, close: () => closeAll(served.server) }
  }
  const storybook = resolve(options.storybook ?? config.storybook)
  const story = pickStory(storybookEntries(storybook), entry.story, page, options.storyId)
  const built = await serve(storybook)
  return { url: storyUrl(built.base, story.id, options.theme), ready: '#storybook-root > *, #root > *', title: story.title, name: story.name, id: story.id, hooked: false, close: () => closeAll(built.server) }
}

const closeAll = (server: Server) => void server.close()
