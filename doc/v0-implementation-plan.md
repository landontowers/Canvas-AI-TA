# AI Tutor v0: phased implementation plan

_2026-11-19. Companion to [v0-architecture-critique.md](v0-architecture-critique.md), which holds the reasoning and the decisions; "critique §" references point there. The near-term goal is a functional demo hosted locally (critique §4). Phases 0–5 build the demo, Phase 6 is a stretch goal, and Phases 7–8 come after the demo and are only outlined._

## Overview

| Phase | Goal | Done when |
| --- | --- | --- |
| 0 | Clear out the prototype (destructive) | Only the v0 docs, the license, and clean scaffolding remain, and the prototype is preserved under a tag |
| 1 | Foundation | One command starts an empty API, web app, and database, and checks run on every change |
| 2 | Canvas integration | Tools return the right data as the demo student and the demo instructor |
| 3 | Tutor engine | Both tutors stream answers, the course setting is enforced, and the eval suite runs |
| 4 | Interface | The SDI-themed sidebar works at 320px, with persona switching and course settings |
| 5 | Demo hosting | Invited viewers can use the demo safely through the tunnel |
| 6 (stretch) | Inside Canvas | The tutor launches in Canvas's own sidebar through LTI 1.3 |
| 7 (after the demo) | Pilot readiness | Real students can opt in under SDI-approved terms |
| 8 (after the demo) | Production on Azure | Deploys to Azure are automated, with no downtime |

Phases run in order. One exception: Phase 4 can start alongside Phase 3, once Phase 1 has defined the stream-event types.

---

## Phase 0: Clear out the prototype (destructive)

_Status, 2026-11-19: Phase 0 is complete. The prototype is tagged `prototype-final`, the cleanup is merged into `main`, and the license is decided (0.6)._

Everything in this phase removes or rewrites existing material. Land it as its own pull request, so the deletion is easy to review and, if ever needed, to revert. Nothing in v0 depends on prototype code; its lessons are captured in the critique.

### 0.1 Preserve the prototype first

- **Tag the last prototype commit** before any deletion lands: `git tag prototype-final b1bddf8`, then push the tag. Anyone can browse the prototype at that tag afterward.
- **Remove local prototype containers.** Anyone who ran the prototype locally should run `docker compose -f develop.yaml down -v` before `develop.yaml` is deleted. No leftover prototype volumes were found on the main development machine as of 2026-11-19.

### 0.2 Commit the cleanup already done

These changes are already made in the working tree but aren't committed yet (critique §6, "Removed"):

- **Deleted:** the browser extension, experiments and scratch scripts, UVU's catalog data, the shared-key tooling, the pasted user record, and `CODEOWNERS`.
- **Deleted:** the prototype's deployment tooling: the compose and deploy files, Plausible, `setup/` (Hetzner Terraform), `send_files.sh`, and `dev.env`.
- **Deleted:** school deliverables and empty stubs in `doc/`.
- **Edited:** `template.env` (Canvas and Gemini variables added) and the `Justfile` (deploy recipe removed). Both get rewritten again in 0.4.

### 0.3 Delete the remaining prototype code and materials

| Delete | What it was |
| --- | --- |
| `backend/` | The Python FastAPI backend |
| `python_sandbox/` | The unsafe code runner |
| `streamlit/` | The prototype's production UI |
| `svelte/`, `svelte_dev.yaml` | The unfinished Svelte UI; v0 uses Instructure UI (React) |
| `mongo/` | The dev seed script, with hardcoded credentials and the old API key |
| `tests/` | Tests that ran against the live prototype API |
| `develop.yaml` | The prototype's local stack |
| `pyrightconfig.json` | Python type-checker settings |
| `images/`, `doc/ai-tutor-2-diagram-light.png` | Prototype screenshot and architecture diagram |
| `doc/backend-api.md` | Prototype API notes |
| `doc/privacy-policy.md` | The UVU-era privacy policy; v0 writes a new one before the pilot (Phase 7) |

Keep `LICENSE`, the generic `.github/ISSUE_TEMPLATE/`, and the two v0 docs.

### 0.4 Reset the repo scaffolding

These files stay, but get rewritten:

- **`README.md`:** a short v0 README covering what the project is, the current phase (the demo), links to the two docs, and how to run it (filled in during Phase 1).
- **`.gitignore`:** a Node and TypeScript version. Drop the Flutter and school sections, including the `*.lock` rule. Keep `.env` ignored.
- **`template.env`:** v0 variables only. That means `CANVAS_BASE_URL`, `CANVAS_ACCESS_TOKEN`, and `GEMINI_API_KEY`, plus the database URL and demo persona IDs (added in Phases 1–2). Remove the shared-key, Mongo, OpenAI, Anthropic, Plausible, and prototype domain variables.
- **`.env`** (local, not in git): prune the same stale variables, keeping the Canvas token and the Gemini key.
- **`Justfile`:** remove the prototype `develop` recipe; Phase 1 adds v0 recipes.
- **`doc/README.md`:** an index of the v0 docs.

### 0.5 Fix the critique's links

The critique links to prototype files that 0.3 deletes, for example `../backend/main.py#L323-L330`. Rewrite those links to point at the `prototype-final` tag on GitHub. Then update critique §6 to say the prototype now lives only at that tag.

### 0.6 Decide on the license

**Decided:** Apache 2.0, copyright Landon Towers. `LICENSE` keeps the standard text.

- **`NOTICE`** carries the attribution that redistributors must keep, and acknowledges the original prototype, which was led by Spencer Thompson.
- **`CITATION.cff`** turns on GitHub's "Cite this repository" button.

**Ownership:** v0 is a personal open-source project. The core is built on personal time and resources; only the SDI integration is done on company time.

- **Get SDI's agreement in writing before publishing.** It should say that SDI's integration contributions are released under Apache 2.0.
- **Keep SDI-specific pieces separate from the core.** That covers the SDI config and theme, and the Canvas setup. The modular design (critique §3.12) already does this.

### Exit criteria

- The `prototype-final` tag exists on the remote.
- The working tree contains only `.github/`, `.gitignore`, `Justfile`, `LICENSE`, `README.md`, `template.env`, and `doc/` (README, critique, and plan), plus the gitignored `.env`.
- No link in `doc/` points at a deleted file.
- No tracked file contains prototype secrets or the old shared API key. (Git history still has them; see critique §1.)

---

## Phase 1: Foundation

_Status, 2026-11-19: Phase 1 is complete. Monorepo scaffolded with pnpm workspaces, `packages/core` defines ports and domain types with no vendor SDKs, `packages/adapters` implements fakes passing shared contract tests, Fastify API serves `/health`, React web app renders the SDI 320px sidebar drawer, and Docker Compose local stack passes end-to-end verification._

**Goal:** an empty but correctly shaped TypeScript project that runs with one command.

**Work:**

- **Monorepo** (pnpm workspaces):
  - `packages/core`: domain types, ports (interfaces), harness profiles, and policy. No vendor SDKs.
  - `packages/adapters`: one folder per adapter, such as Canvas, Gemini, the fake LLM, and Postgres.
  - `apps/api`: the Node.js HTTP server, which assembles the core and adapters from configuration.
  - `apps/web`: React with Instructure UI.
  - Shared API and stream-event schemas live in `core` (zod), and both apps use them.
- **Tooling:**
  - TypeScript in strict mode, ESLint, Prettier, and Vitest.
  - A dependency rule (dependency-cruiser or ESLint's `no-restricted-imports`) that keeps `core` from importing adapters or vendor SDKs (critique §3.12).
- **Local stack:** Docker Compose with Postgres, the API, and the web app. `just dev` starts it; `just check` runs lint, type checks, and tests.
- **Configuration:** one zod-validated config, loaded at startup from env plus an SDI config file. It covers model roles, theme, persona copy, crisis resources, the default course setting (`full`), and the demo personas. Invalid config stops startup.
- **Ports with fakes:** define the interfaces for LLM, LMS, identity, course content, calculator and code execution, moderation, persistence, and telemetry, each with a fake. Build the shared contract-test harness that every adapter runs.
- **Database:** pick a migrations tool and create the first schema (critique §3.6): colleges (seeded with SDI), users, courses, course settings, conversations, and messages.
- **Mandatory CI & Comprehensive Test Suite:** a GitHub Actions workflow that enforces building packages, running lint and strict type checks, verifying architecture boundaries (`dep-check`), running the full Vitest suite with `@vitest/coverage-v8` alongside a live `postgres:16-alpine` service container for DDL migration and `DrizzlePersistenceAdapter` contract tests, and requiring statement and line code coverage thresholds. Coverage reports are archived as build artifacts.

**Suggested defaults.** The team can change these during this phase, but shouldn't later:

- pnpm workspaces;
- Fastify or Hono for the API;
- Vite for the web app;
- Drizzle or Kysely for queries and migrations;
- zod for schemas.

**Exit criteria:**

- `just dev` brings up the stack on a fresh machine with Docker and Node installed, and the web app reaches the API's health endpoint.
- `just check` passes, and the dependency rule catches a deliberate violation.
- Every port has a fake that passes its contract tests.

---

## Phase 2: Canvas integration

_Status, 2026-11-19: Phase 2 is complete. Typed Canvas REST adapter with rate-limit and Link-header pagination, HTML-to-Markdown conversion, demo masquerading identity adapter, role-based tool execution registry with strict boundary checks, and offline sandbox course fixtures implemented and passing._

**Goal:** read-only Canvas access that behaves exactly like the demo personas.

**Work:**

- **Sandbox course** (a Canvas admin task, critique §4.4). Create it on the Canvas instance the personal token belongs to. If you use SDI's test or beta instance instead, check that the token works there or generate one there. The course needs:
  - a test student, a test teacher, and a test TA (to exercise mixed roles);
  - a syllabus, modules, pages, assignments with and without due dates, a locked module, an unpublished page, and an announcement;
  - a graded submission with feedback for the test student.

  Confirm the token's account has the "Become other users" permission.
- **Canvas adapter** (critique §3.2): a typed client with zod schemas for every endpoint used, `Link`-header pagination, rate-limit handling, a short-TTL cache, and HTML-to-Markdown conversion for content.
- **Demo identity adapter** (critique §4.4): the personal access token plus `as_user_id`, restricted to an allowlist of persona IDs from config. Viewers choose a persona, and the server supplies the ID.
- **Role resolution** (critique §3.14): derive each persona's role per course from Canvas enrollments, applying the mixed-role rule. Phase 6 replaces this source with the LTI roles claim.
- **Tools.** Each tool declares the roles and scopes it requires.
  - **Student tutor:**
    - the student's own grades;
    - upcoming assignments and assignment details;
    - the syllabus and announcements;
    - course modules and pages (gated by the course setting in Phase 3);
    - a calculator with units (mathjs) and date math.
  - **Instructor tutor:**
    - course structure lookups, such as assignments without due dates;
    - submission status summaries, with counts first and names only when asked;
    - a gradebook summary.
- **Fixtures:** record sanitized responses from the sandbox course into the fake LMS adapter, so tests run without Canvas.

**Exit criteria:**

- Each tool returns correct data as the demo student and as the demo instructor.
- The student persona can't see the locked module or the unpublished page.
- The core rejects an instructor tool called in a student session.
- Tests pass offline against the fixtures.

---

## Phase 3: Tutor engine

_Status, 2026-11-20: Phase 3 is complete. TutorEngine coordinates Socratic guidance, GeminiAdapter provides @google/genai streaming and tool-calling, question classifier enforces full vs logistics_only course setting on the server, SSE streaming API tested for both personas, PrivacyTelemetryAdapter implements de-identified telemetry (FERPA § 99.31(b)), CrisisAlertPort dispatches emergency notifications (FERPA § 99.36), and the 60-case eval suite baseline is recorded._

**Goal:** both tutors answer correctly, the student tutor stays Socratic on course material, and the course setting is enforced.

**Work:**

- **Gemini adapter** (critique §3.9): Flash for both tutors and Flash-Lite for the classifier. It translates messages, tool calls, and stream events into the core's types, and publishes a capability descriptor. Use the free tier or billing covered by subscription credits, with test data only.
- **Harness profiles** (critique §3.14): system prompts, tool allowlists, policies, model roles, and output limits for the student and instructor tutors, loaded as data. The resolved role picks the profile.
- **Classifier and course setting** (critique §3.3–3.4):
  - Label each student question as logistics or course material before the main call.
  - Under `logistics_only`, decline course-material questions and fetch no course content.
  - The default is `full`.
- **Socratic behavior:** course-material answers guide rather than solve. Track attempts within a conversation and step up through a hint ladder.
- **Agent loop:** the classifier, then one main call with tools, a bounded number of tool rounds, and time limits.
- **Safety** (critique §3.8):
  - Gemini's safety settings.
  - Crisis routing with SDI's resources, 988 Lifeline UI integration, and `CrisisAlertPort` emergency webhook dispatch under FERPA 34 CFR § 99.36.
  - De-identified operational telemetry via `PrivacyTelemetryAdapter` with HMAC-SHA256 salted pseudonymization under FERPA 34 CFR § 99.31(b).
  - All Canvas and tool content treated as untrusted input.
- **Streaming:** SSE with typed events: text delta, tool status, citation, done, and error.
- **Persistence:** conversations and messages tagged with persona, role, and course, plus a "clear my data" endpoint.
- **Eval suite, first version:** 50–100 cases per tutor. It runs with one command and saves results, so changes can be compared.
  - **Student tutor:**
    - "just give me the answer" pressure, pasted assignment prompts, and role-play jailbreaks;
    - grey-zone questions between logistics and course material;
    - refusals under `logistics_only`;
    - tool selection.
  - **Instructor tutor:**
    - factual accuracy about the sandbox course;
    - drafting quality;
    - never exposing student conversations;
    - keeping student data in answers to the minimum.

**Exit criteria:**

- The API streams answers for both personas against the sandbox course.
- Under `logistics_only`, course-material questions are declined and no course-content tool runs.
- A student session is never offered instructor tools, and a forced call to one is rejected.
- The eval suite runs, and its baseline results are recorded.

---

## Phase 4: Interface

_Status, 2026-11-19: Phase 4 is complete. The 320px Canvas sidebar drawer interface is implemented with SDI design tokens and WCAG 2.1 AA automated contrast checks. Demo shell supports allowlisted personas, course selection, and simulated page content; chat interface renders streaming SSE answers with Markdown, KaTeX math, tool indicators, citations, and stop controls. Instructor course settings and student data clearing views are functional, with full keyboard navigation and aria-live announcements._

**Goal:** the Canvas-native, SDI-themed sidebar.

**Work:**

- **Theme** (critique §3.13):
  - SDI's token file (colors, type, tone), mapped onto Instructure UI's theming.
  - Fallback fonts: Lato for body text, plus a fallback for the display face, because SDI's Adobe Fonts kit won't load on the demo domain.
- **Demo shell** (critique §4.5): a standalone page with a 320px frame styled like Canvas's drawer. It includes:
  - a persona switcher limited to the allowlist;
  - a course picker;
  - a "current page" picker that simulates `lti.getPageContent`.
- **Chat UI:**
  - streaming answers;
  - Markdown and math rendering (KaTeX);
  - tool-status indicators;
  - citations that link to the Canvas page;
  - a stop button.
- **Instructor views:** the instructor tutor in the same sidebar, and a course settings page with the `full` / `logistics_only` setting.
- **Student settings:** "clear my data".
- **Accessibility:**
  - theme contrast checks in `just check`;
  - `aria-live` announcements for streamed text;
  - full keyboard use;
  - high-contrast mode.

**Exit criteria:**

- Every demo flow works at 320px wide.
- The theme passes WCAG 2.1 AA contrast checks.
- The flows work with the keyboard alone, and a screen reader announces answers.

---

## Phase 5: Demo hosting and hardening

_Status, 2026-11-20: Phase 5 is complete. Cloudflare Tunnel compose profile and ingress templates are in place; in-app authentication gate and Cloudflare Access header support protect the demo; Fastify logger is configured with Pino secrets redaction (scrubbing tokens, passwords, and message bodies); PrivacyTelemetryAdapter provides HMAC-SHA256 pseudonymized telemetry with full free-text scrubbing (FERPA § 99.31(b)); WebhookCrisisAlertAdapter provides emergency incident alerting (FERPA § 99.36); AzureBlobLogStorageAdapter enables optional export of de-identified telemetry and audit logs to Azure Blob Storage; a 5-step written demo walk-through script is documented in `doc/demo-walkthrough.md`; and one-command state reset (`just demo-reset` and `POST /api/demo/reset`) clears conversations and restores course settings to full._

**Goal:** invited viewers can use the demo safely over the internet.

**Work:**

- **Tunnel** (critique §4.3): a named tunnel, Cloudflare Tunnel by default, from the local stack to a dedicated subdomain on the personal domain.
- **Sign-in:** Cloudflare Access with an invited-email allowlist, or authentication in the app.
- **Secrets hygiene:** the Canvas token and the Gemini key stay on the server. Scrub tokens and message bodies from logs.
- **Demo script:** a written walk-through.
  1. A student asks a logistics question.
  2. A student is stuck on a problem, and the tutor stays Socratic.
  3. The instructor switches the course to `logistics_only`, and the student's next course-material question is declined.
  4. The instructor asks about missing submissions and drafts an announcement.
  5. Theme and accessibility highlights.
- **Reset:** one command that clears conversations and restores the default course setting.
- **Rate limits:** check Gemini's limits against the expected number of viewers. If the free tier is too tight, turn on billing covered by subscription credits (critique §3.9).

**Exit criteria:**

- The demo checks in critique §8 pass.
- A dry run with someone outside the team works end to end.

---

## Phase 6 (stretch): Inside Canvas

**Goal:** the tutor launches in Canvas's own sidebar.

**Work:**

- **LTI identity adapter** (critique §3.1), for example with ltijs. It handles OIDC login and launch validation, reads roles from the LTI roles claim, and keeps launch state in platform storage.
- **Registration** (critique §4.5): an LTI 1.3 developer key in SDI's Canvas test or beta instance, pointing at the tunnel hostname. Turn on `top_navigation_placement`, and install the tool only for the sandbox course.
- **Placements:** `top_navigation` for the tutors, and `course_navigation` (staff only) for course settings.
- **Page context:** `lti.getPageContent` for the page the user is on, and `lti.getPageSettings` for theme inheritance and high contrast.
- **Canvas data:** still read through the personal token with masquerading. The server masquerades as the launched user only if that user is on the test-account allowlist. OAuth comes in Phase 7.

**Exit criteria:**

- The test student and the test teacher each get the right tutor in Canvas's drawer.
- Roles come only from the signed launch.

---

## Phase 7 (after the demo): Pilot readiness

This is an outline only; plan it in detail once the demo has done its job.

- **Approval:** SDI IT signs off on Azure-hosted models and student data (critique §3.7).
- **Opt-in** (critique §3.1): an OAuth2 developer key and the student opt-in flow. Per-user tokens are stored encrypted, and opting out revokes the token and deletes the user's data.
- **Model switch** (critique §3.9): move the model adapter to Azure OpenAI (`gpt-5.4-mini` and `gpt-5.4-nano`, Data Zone Standard US) and add Azure AI Content Safety. Re-run the eval suite and retune.
- **Production Canvas** (critique §7): an SDI hostname and a registration in production Canvas.
- **Data practices** (critique §3.7): a privacy policy, retention windows, audit logging, and per-user rate and cost limits.
- **Targets** (critique §8): speed and cost targets agreed.

## Phase 8 (after the demo): Production on Azure

This is an outline only; see critique §5.

- **Terraform for Central US:** Container Apps, PostgreSQL Flexible Server, Key Vault, Container Registry, App Configuration, monitoring, and networking.
- **Pipeline:** GitHub Actions signing in to Azure with OpenID Connect. Images are built once and deployed to dev automatically. Production deploys need an approval, and rollback works by revision.
- **Environments:** dev, then production in its own subscription before the pilot, then staging later.
- **Observability:** Application Insights through OpenTelemetry, with PII scrubbing.

## Later

Critique §7's "Logged for later" list covers what comes after:

- the model bake-off;
- multi-college support;
- more instructor options, including write actions;
- a code-execution sandbox;
- better course-material retrieval;
- Canvas Live Events.
