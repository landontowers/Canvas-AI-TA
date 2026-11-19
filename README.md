# AI Tutor

A Socratic AI tutor that lives inside Canvas, starting with Sonoran Desert Institute (SDI).

- **Students** get a quick-response helper in Canvas's sidebar. It knows their courses, deadlines, and grades, and it guides them through course material with questions instead of handing over answers.
- **Instructors** get their own assistant in the same sidebar, for questions about their course and for drafting.

## Status

This is v0, a new build. The current goal is a functional demo hosted locally, so it isn't ready for real students. The original college prototype is preserved at the [`prototype-final`](https://github.com/landontowers/ai-tutor/tree/prototype-final) tag.

## Docs

- [Architecture critique and decisions](doc/v0-architecture-critique.md): what v0 keeps from the prototype, what it changes, and why.
- [Implementation plan](doc/v0-implementation-plan.md): the phased plan, from cleanup to production.
- [GEMINI.md](GEMINI.md): project context and rules for AI coding assistants.

## Running it

There's nothing to run yet; Phase 1 of the implementation plan adds the local stack and fills in this section.

To get ready, copy `template.env` to `.env` and fill in your own values. `.env` is gitignored; never commit it.

## License and credit

Copyright 2026 Landon Towers ([@landontowers](https://github.com/landontowers)). Licensed under the [Apache License 2.0](LICENSE).

- **Redistributing:** if you redistribute this project or a modified version, Apache 2.0 requires you to keep the attributions in the [NOTICE](NOTICE) file.
- **Deploying:** a credit line such as "Built on AI Tutor by Landon Towers" is appreciated, though not required.
- **Citing:** use GitHub's "Cite this repository" button, which reads [CITATION.cff](CITATION.cff).

AI Tutor grew out of an earlier college prototype led by Spencer Thompson ([@spencer-thompson](https://github.com/spencer-thompson)). The prototype is preserved at the [`prototype-final`](https://github.com/landontowers/ai-tutor/tree/prototype-final) tag.
