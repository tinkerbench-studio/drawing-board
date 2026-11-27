---
name: tests
base: tests
---

Run the checks CI runs: `npm run typecheck` and `npm test` (vitest; the picture tests need a Chromium, so set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` where one is installed), and `npm run build`.

- Where a test belongs: beside its module as `src/<module>.test.ts`.
- A test that needs a browser it cannot find is skipped, not failed: say in an OPTIONAL line that it could not run; do not raise it as BLOCKING.

- Fetch the base branch (`origin/main`) before judging the diff. A defect another reviewer owns is raised once, by that reviewer.

- Accepted findings are not raised again. When your prompt lists findings of the ticket a person decided accepted (with their ids), do not raise one again, not as BLOCKING or OPTIONAL and not with a verdict of open: Tick-it drops a verdict of open on an accepted finding when the run is recorded and leaves it out of your blocking count. A new finding with different text is still raised.
