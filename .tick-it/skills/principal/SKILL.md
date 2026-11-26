---
name: principal
base: principal
---

- BLOCKING: a break with this repository's conventions: shared behaviour is configured in `drawing-board.config.json` through `src/config.ts` (new settings are read and defaulted there), commands live in `src/*.ts` with their tests beside them, and the package has one runtime dependency (`parse5`) with `esbuild` and `playwright-core` as optional peers, so a new dependency needs a reason. Cite the code it breaks.
- This is a published package that other projects pin: a changed setting, command, output format or export is a change to its public interface. Check the README and the exported names (`src/index.ts`, the package `exports`) move with it, and that a breaking change is a major version.
- Output that people or CI diff (reports, snapshot files) must not change unless a setting asks for it.

- What this reviewer owns beyond its base: correctness and design. Test strength is the tests reviewer's, security areas the security reviewer's.

- Fetch the base branch (`origin/main`) before judging the diff. Accepted findings are not raised again. When your prompt lists findings of the ticket a person decided accepted (with their ids), do not raise one again, not as BLOCKING or OPTIONAL and not with a verdict of open: Tick-it drops a verdict of open on an accepted finding when the run is recorded and leaves it out of your blocking count. A new finding with different text is still raised.
