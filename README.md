# drawing-board

A Claude Code plugin with the design workflows for any project that keeps its designs on a design
canvas (a claude.ai Design artifact) and builds them in Storybook. It holds the process; each
project keeps what is particular to it in one short file.

| Skill | What it covers |
| --- | --- |
| `design-change` | A design is worked out on a prototype page named after the ticket, folded into the canvas on the owner's go-ahead, and only then built |
| `canvas-sync` | Who owns what, publishing and refreshing in the same change, refreshing only the boards you changed, snapshot conflicts, a board and its story that disagree |
| `flow-pages` | One canvas page per user flow, and where a new board goes |
| `ux-picture` | The board-beside-story picture a UX bug or fix carries, and getting it onto the ticket |

## Using it in a project

1. Add the marketplace and turn the plugin on in the project's `.claude/settings.json`:

   ```json
   {
     "extraKnownMarketplaces": {
       "drawing-board": { "source": { "source": "github", "repo": "tinkerbench-studio/drawing-board" } }
     },
     "enabledPlugins": { "drawing-board@drawing-board": true }
   }
   ```

2. For cloud sessions, install it in the environment's setup script as well:

   ```bash
   claude plugin marketplace add tinkerbench-studio/drawing-board
   claude plugin install drawing-board@drawing-board
   ```

   The cloud environment's GitHub access must cover this repository if it is private.

3. Copy [`plugin/templates/drawing-board.md`](plugin/templates/drawing-board.md) to
   `.claude/drawing-board.md` in the project and fill it in: the canvas link, the snapshot folder,
   the commands for each step, the flow pages and the ticket key for prototype pages.

4. Slim the project's own canvas skills down to what the template does not cover, and point them
   at these.

## The commands a project provides

The skills name steps, and `.claude/drawing-board.md` maps each step to the project's command:
refresh the boards you changed (`--boards`, `--tokens`), full refresh, check, rebuild the story
index, compare a board with its story, make the picture, upload the picture. A project that lacks a
step says so in that file.
