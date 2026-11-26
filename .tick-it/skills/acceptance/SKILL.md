---
name: acceptance
base: acceptance
---

- Files this repository expects to change together, which are not a finding: `package.json` with `package-lock.json` (the version), a command or hook change with its test, `README.md` and `plugin/skills/*` wording for it, and `dist/` is never committed.
- A pull request that changes the package raises `version` in `package.json` (the release job tags it after the merge); a missing or already-released version is a finding.

- Fetch the base branch (`origin/main`) before judging the diff. A defect another reviewer owns is raised once, by that reviewer.

- Accepted findings are not raised again. When your prompt lists findings of the ticket a person decided accepted (with their ids), do not raise one again, not as BLOCKING or OPTIONAL and not with a verdict of open: Tick-it drops a verdict of open on an accepted finding when the run is recorded and leaves it out of your blocking count. A new finding with different text is still raised.
