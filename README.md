# AI Tutor

A Socratic AI tutor that lives inside Canvas, starting with Sonoran Desert Institute (SDI).

- **Students** get a quick-response helper in Canvas's sidebar. It knows their courses, deadlines, and grades, and it guides them through course material with questions instead of handing over answers.
- **Instructors** get their own assistant in the same sidebar, for questions about their course and for drafting.

## Status

This is v0, a new build. The current goal is a functional demo hosted locally, so it isn't ready for real students. The original college prototype is preserved at the [`prototype-final`](https://github.com/landontowers/ai-tutor/tree/prototype-final) tag.

## Docs

- [Developer guide: setup and usage](doc/developer-guide.md): how to configure, run, and interact with the local demo.
- [Demo walk-through script](doc/demo-walkthrough.md): the 5-step script for stakeholder presentations, secrets hygiene, and operations.
- [Architecture critique and decisions](doc/v0-architecture-critique.md): what v0 keeps from the prototype, what it changes, and why.
- [Implementation plan](doc/v0-implementation-plan.md): the phased plan, from cleanup to production.
- [GEMINI.md](GEMINI.md): project context and rules for AI coding assistants.

## Running it

Prerequisites: Docker, Docker Compose, Node.js (>= 22), pnpm, and just.

1. **Configure environment:**
   Copy `template.env` to `.env`:
   ```bash
   cp template.env .env
   ```
   `.env` is gitignored; never commit it.

2. **Run verification checks:**
   ```bash
   just check
   ```
   This runs strict TypeScript typechecks across all packages and apps, ESLint, dependency-cruiser boundary checks (ensuring `packages/core` never imports adapters or vendor SDKs), and Vitest contract test suites.

3. **Start the local stack:**
   ```bash
   just dev
   ```
   This starts PostgreSQL, the Fastify API (port 3001), and the React web app (port 5173) in Docker Compose. The web client connects to `http://localhost:5173` and proxies to the API.

4. **Stop the local stack:**
   ```bash
   just dev-down
   ```

5. **Reset demo state:**
   ```bash
   just demo-reset
   ```
   Clears conversation history and restores default course settings to full.

## License and credit

Copyright 2026 Landon Towers ([@landontowers](https://github.com/landontowers)). Licensed under the [Apache License 2.0](LICENSE).

- **Redistributing:** if you redistribute this project or a modified version, Apache 2.0 requires you to keep the attributions in the [NOTICE](NOTICE) file.
- **Deploying:** a credit line such as "Built on AI Tutor by Landon Towers" is appreciated, though not required.
- **Citing:** use GitHub's "Cite this repository" button, which reads [CITATION.cff](CITATION.cff).

AI Tutor grew out of an earlier college prototype led by Spencer Thompson ([@spencer-thompson](https://github.com/spencer-thompson)). The prototype is preserved at the [`prototype-final`](https://github.com/landontowers/ai-tutor/tree/prototype-final) tag.
