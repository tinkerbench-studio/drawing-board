---
name: tests
base: tests
---

Run the checks CI runs: `npm ci`, `npm run typecheck`, `npm test` (vitest; the picture tests drive Chrome, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` where one is installed) and `npm run build`.

- Where a test belongs: beside its module as `src/<name>.test.ts`. Browser-driven tests skip themselves without Chrome; say so when a criterion's only test is skipped.
- BLOCKING: a new option or setting whose default-off output is not asserted unchanged by a test.

- What this reviewer owns beyond its base: whether each criterion has a test that fails without the change. Design and style are the principal reviewer's.

- Fetch the base branch (`origin/main`) before judging the diff. Accepted findings are not raised again. When your prompt lists findings of the ticket a person decided accepted (with their ids), do not raise one again, not as BLOCKING or OPTIONAL and not with a verdict of open: Tick-it drops a verdict of open on an accepted finding when the run is recorded and leaves it out of your blocking count. A new finding with different text is still raised.
