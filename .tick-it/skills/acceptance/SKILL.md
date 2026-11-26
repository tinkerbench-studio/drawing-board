---
name: acceptance
base: acceptance
---

- Files this repository expects to change together, which are not a finding: `package.json` with `package-lock.json` (the version), a behaviour change with its test in `src/*.test.ts` and the README section that documents it.
- A change to a command, setting or exported function is met only when the README (the commands table, the settings table, its section) says it too. The version in `package.json` is raised by the pull request; the release job tags it after merge.
- What this reviewer owns beyond its base: that the diff answers the ticket's criteria and nothing else. Code quality is the principal reviewer's, test strength the tests reviewer's.

- Fetch the base branch (`origin/main`) before judging the diff. Accepted findings are not raised again. When your prompt lists findings of the ticket a person decided accepted (with their ids), do not raise one again, not as BLOCKING or OPTIONAL and not with a verdict of open: Tick-it drops a verdict of open on an accepted finding when the run is recorded and leaves it out of your blocking count. A new finding with different text is still raised.
