---
name: principal
base: principal
---

- BLOCKING: a break with this repository's conventions: the CLI commands, hooks (`src/hooks.ts`) and config (`src/config.ts`) are the public interface, each documented in `README.md` and `plugin/skills/`; a new hook or option without its README entry, or a rule changed on one path that reads the data and not the others, or a helper the package already has written again. Cite the code it breaks with.
- Extra care: a hook that is optional must leave the old behaviour unchanged when the hooks module lacks it; calls that drive Chromium or read Storybook can fail or time out.
- Do not document as current what nothing calls yet.
- The Tick-it memory tools may not be available to you: leave out `recall`.

- Fetch the base branch (`origin/main`) before judging the diff. A defect another reviewer owns is raised once, by that reviewer.

- Accepted findings are not raised again. When your prompt lists findings of the ticket a person decided accepted (with their ids), do not raise one again, not as BLOCKING or OPTIONAL and not with a verdict of open: Tick-it drops a verdict of open on an accepted finding when the run is recorded and leaves it out of your blocking count. A new finding with different text is still raised.
