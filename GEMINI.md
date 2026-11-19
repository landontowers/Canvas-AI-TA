# Project context for AI assistants

This file gives an AI coding assistant the context it needs to work in this repo; Gemini CLI loads `GEMINI.md` automatically. It's plain Markdown, so other tools can use it too, for example as a copy named `AGENTS.md`.

## What this is

AI Tutor v0 is a Socratic AI tutor that runs inside the Canvas LMS. One engine serves two tutors, one for students and one for instructors. The first college is Sonoran Desert Institute (SDI). It's a personal open-source project: Apache 2.0, copyright Landon Towers (see `NOTICE`).

## Read these first

- `doc/v0-architecture-critique.md`: the decisions and the reasoning behind them. §7 is the decision list.
- `doc/v0-implementation-plan.md`: the phases and their exit criteria.

## Where things stand (2026-11-19)

- **Phase 0 (cleanup), Phase 1 (foundation), Phase 2 (Canvas integration), and Phase 3 (tutor engine) are complete.** Next up is Phase 4, interface.
- **The current goal is a functional demo hosted locally** (critique §4), not production.
- **The old prototype is preserved at the `prototype-final` tag.** It's reference only: don't copy its code back in, and link to it only at the tag.

## Decisions to respect

- **Stack:** TypeScript end to end, with pnpm workspaces, React with Instructure UI, a Node.js API, Postgres, and zod for schemas.
- **Architecture:** a core with ports and adapters. `packages/core` never imports a vendor SDK. Every external service is an adapter, with a fake and contract tests (critique §3.12).
- **Two tutors** (critique §3.14). The role comes from Canvas, never from the client.
  - The student tutor is Socratic for course material and answers logistics directly. The course setting is `full` (the default) or `logistics_only`, enforced on the server.
  - The instructor tutor is direct and read-only.
- **Models** (critique §3.9):
  - Development and the demo: Gemini (Flash or Flash-Lite) on a personal Google account.
  - Pilot and production: Azure OpenAI `gpt-5.4-mini` and `gpt-5.4-nano`.
- **Canvas in development:** a personal access token with `as_user_id` masquerading, limited to an allowlist of test accounts (critique §3.1, §4.4).
- **Hosting:** the demo runs locally in Docker Compose and is shared through a tunnel with sign-in (critique §4). Azure (Central US, Terraform) comes after the demo (critique §5).

## Rules

- **Never commit or print secrets.** They live only in the gitignored `.env`; `template.env` holds placeholders.
- **Send only test data and sample content to the model provider.** No real student data, and no SDI course material.
- **Keep SDI-specific pieces out of the core.** The SDI config and theme, and the Canvas setup, live in config and adapters. The core is a personal project; SDI integration work happens on company time.
- **Use SDI's Canvas only for integration work.** For core work, use the fake LMS adapter and fixtures, or a personal Canvas test account.
- **Keep the docs current.** When a decision changes, update critique §7. When a phase's status changes, update the plan.
- **Doc style:**
  - sentence-case headings and short bullets;
  - § references to the critique;
  - `_underscore_` emphasis;
  - tables with `| --- |` separators.
- **Git:** work on a branch, then fast-forward `main`. Write commit subjects in the imperative, with a bulleted body for anything non-trivial.
- **This repo is a fork of `spencer-thompson/ai-tutor`.** Pull requests must target `landontowers/ai-tutor`, not the upstream repo.

## Open items

- **SDI's written agreement** on the integration work (plan step 0.6).
- **The Canvas personal access token** expires 2027-01-01.
