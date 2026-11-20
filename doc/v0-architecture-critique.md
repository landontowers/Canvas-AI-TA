# AI Tutor v0: architecture critique and decisions

_2026-11-19. This repo is a fork of a college-era prototype. v0 is a new build by a new team, based on the prototype's principles rather than iterating on its code. This document records what to keep from the prototype, what to change, the deployment plan, and the decisions made so far. It is not an implementation plan. The current goal is a functional demo hosted locally; production comes after (§4). The phased build is in [v0-implementation-plan.md](v0-implementation-plan.md)._

## Context

**The prototype** ran without institutional Canvas API access. A browser extension running on `*.instructure.com` read each student's Canvas data and pushed it to a FastAPI + MongoDB backend. A Streamlit UI (and a Svelte beta) talked to GPT models that had a few read-only tools.

**v0** keeps the core concept: Socratic, course-specific, student-centric tutoring built on Canvas, with code execution available to the model. It is a quick-response helper in a Canvas sidebar that answers and asks short questions. It is not a deep-research tool; students can go elsewhere for that. v0 serves one college, Sonoran Desert Institute (SDI), on its Canvas instance at `classroom.sdi.edu`. Support for other colleges comes later; v0 keeps the seams (adapters, configuration, theme tokens) so that adding one is configuration work, not a rewrite. The stack is TypeScript end to end: Instructure UI (React) for the interface and Node.js for the backend. It runs as two tutors on one engine, a student tutor and an instructor tutor, separated in both access and instruction harness (§3.14).

**Current phase: a demo.** The team is working toward a functional demo to show SDI; production implementation isn't the goal yet.

- Anything that can run locally does.
- SDI can't provide a domain yet, so the demo is shared through a tunnel on a personal domain (§4).
- The production plan (§5) applies after the demo.

Two requirements apply across the whole system:

- **Modularity.** Every external dependency, starting with the AI provider, sits behind an interchangeable adapter that carries that dependency's specific constraints (§3.12).
- **Interface.** The UI matches SDI's design language and Canvas's look and feel, and can be re-themed for another college through configuration, not code changes (§3.13).

This review comes from a direct read of the prototype's code. File references are evidence for each point, not a to-do list. The prototype's code now lives only at the `prototype-final` tag, and file references link there (§6).

---

## 1. The lesson from the prototype's Canvas integration

The prototype treated its extension as a way past a Canvas protection. It wasn't a Canvas vulnerability. A content script runs on the Canvas origin, so `fetch('/api/v1/...')` is a same-origin request that carries the student's session cookie. That's exactly how Canvas's own web UI calls its API. No CORS was bypassed. The extension simply held the student's full Canvas authority (and a teacher's or TA's full authority, since instructors used it too).

The real weakness was on the prototype's side: **the client told the server who the user was, and the server never checked.**

- The extension posted `{sub: canvas_id, uni}` to `POST /token`, and the backend minted a JWT for whatever ID it received, as long as the caller sent the API key ([backend/main.py:323-330](https://github.com/landontowers/ai-tutor/blob/prototype-final/backend/main.py#L323-L330)).
- That API key was compiled into the shipped extension bundle, so it was public. The Svelte server `load` also handed its private `API_KEY` to the browser ([svelte/src/routes/+layout.server.ts](https://github.com/landontowers/ai-tutor/blob/prototype-final/svelte/src/routes/+layout.server.ts)).
- No key had scoped permissions. `check_api_key` looks up the key's value, but no endpoint checks it ([backend/main.py:155-166](https://github.com/landontowers/ai-tutor/blob/prototype-final/backend/main.py#L155-L166)). So one public key could:
  - mint a token for any student and read their grades, activity, and chat history (`GET /user`);
  - overwrite any student's stored Canvas data (`POST /user`, `/course`), which also changed the context the model saw for that student;
  - dump all users (`GET /analytics_data`);
  - use `/v1/chat` as a free LLM proxy.

The lesson for v0: **identity must come from something Canvas signs, and nothing that ships to a browser is secret.**

## 2. What to keep

- **The product thesis.** A tutor that knows _this_ student: their courses, deadlines, grades, and recent feedback, across every class. That's the differentiator, and API access makes it stronger.
- **Tools instead of context-stuffing.** The model fetched grades, assignments, and updates through tools rather than getting everything up front ([backend/responses.py](https://github.com/landontowers/ai-tutor/blob/prototype-final/backend/responses.py)). That's the right shape; v0's tools pull live data.
- **The in-context UX.** Users loved the side panel. v0 keeps the sidebar, natively inside Canvas (§3.1).
- **Code execution as a separate boundary.** The instinct was right; the implementation wasn't (§3.5).
- **Catalog enrichment.** Official course descriptions and prerequisites are a cheap, trustworthy grounding source; v0 uses SDI's catalog.
- **HTML→Markdown normalization** of Canvas content before it reaches the model.
- **Crisis routing.** Pointing students to health resources when self-harm signals appear is the right instinct; v0 redoes the execution (§3.8).
- **Student-controlled deletion** and a published privacy policy.
- **Lean infrastructure.** A local stack for the demo (§4), then managed Azure services sized for a pilot, not Kubernetes (§5).

## 3. What to change

### 3.1 Identity, integration, and student opt-in

**Student opt-in doesn't need a browser plugin.** Canvas can host the whole experience:

- **An admin installs the tool once** at the account level (LTI 1.3). It then appears for every student; nothing gets installed in a browser.
- **The sidebar is Canvas's `top_navigation` placement.** Per Canvas's docs, it "launches in a drawer which allows the tool to be displayed alongside Canvas content." The drawer is a fixed 320px wide and lives in the Top Navigation tool menu; up to two tools can be pinned per account. It sits behind the `top_navigation_placement` feature flag, which SDI's admins need to turn on.
- **The tutor can see the page the student is on.** The `lti.getPageContent` postMessage (scope `https://canvas.instructure.com/lti/page_content/show`) currently returns the content of Assignments and Wiki Pages, so "help me with this" works without copy and paste.
- **Opt-in happens at first launch.** Each user, student or instructor, sees what the tutor can read and authorizes it on Canvas's OAuth consent screen. Opting out revokes the token and deletes their data. A student settings page can live in the `user_navigation` placement (Canvas's Account tray).
- **Instructor settings** live in a `course_navigation` placement visible only to course staff (`visibility: admins`). The instructor tutor itself appears in the same sidebar as the student tutor; which one loads depends on the user's role in the course (§3.14).
- **A browser extension would bring back the prototype's problems:** an identity Canvas doesn't vouch for, separate builds and store reviews per browser, and nothing in Canvas's mobile apps.

**Keys by stage:**

- **Now, for development and the demo: a personal access token** in the gitignored `.env`. It acts with the full authority of its creator, an admin who sees everything. To see what a student sees, add `as_user_id=<test student id>` to each request. That's Canvas's masquerading: it requires the "Become other users" permission, and Canvas logs both users on every call. Wrap this in a dev-only identity adapter, so the rest of the system already behaves as a student. In the demo, the server masquerades only as an allowlist of test accounts (§4.4).
- **Before any student uses it:** an LTI 1.3 developer key (signed launches carrying user, course, and roles, plus the placements above) and an API developer key for OAuth2 (each student's delegated, read-only token, stored encrypted).

**Principles at every stage:**

- The server never trusts a user ID, course ID, or role sent by the client. Roles come from the signed LTI launch (§3.14).
- Request the minimum scopes, read-only. The model never touches a token that can write.
- Tools always act **as the student who is asking**, never with an instructor's or admin's authority. In development that means masquerading.
- Never put tokens in URLs or in JavaScript-readable cookies. Inside Canvas the tool runs in an iframe, where browsers increasingly block third-party cookies. Use LTI Platform Storage (`lti.put_data` / `lti.get_data`) for launch state, and hold a short-lived session token in memory.
- Personal access tokens never leave local development.

### 3.2 Canvas data: fetch on demand

The prototype refreshed data only when a student happened to load Canvas with the extension installed. It stored one large snapshot per user and read only the first page of each paginated endpoint.

- **Treat Canvas as the source of truth.** Fetch server-side with the student's token when they ask, behind a short-TTL cache. Don't replicate Canvas into our own database.
- **Handle Canvas's per-token rate limits and `Link`-header pagination from day one.**
- **Put a typed client at the Canvas boundary.** The prototype's biggest pain point was unexpected `NULL`s from Canvas. Validate every response once, at the boundary, with runtime schemas (for example, zod); TypeScript types alone don't check what the API actually returns. For example, the prototype's `get_assignments` crashes on any assignment without a due date.
- **Canvas Live Events can help with freshness at scale.** Look at them later, not first.

### 3.3 Course help: logistics always, course material when the instructor allows it

In the prototype, "course-specific" meant a course code plus the catalog description in the system prompt. The syllabus and rubrics were stored but never reached the model, and modules, pages, and files were never read.

v0 splits questions into two kinds:

- **Higher-level questions are always allowed:** grades, deadlines, assignments and what they require, the syllabus, announcements, and other course logistics.
- **Course-material questions** (the subject matter itself) depend on a per-course instructor setting (§3.4). When it's off, the tutor still handles logistics, declines subject-matter questions, and points the student to the instructor.

When course material is allowed, **fetch it live with the student's own token**: the syllabus, module structure, pages, assignment descriptions, and the current page through `lti.getPageContent`. Canvas then enforces visibility for free: locked modules, unlock dates, sections, and unpublished content stay hidden from students who can't see them in Canvas. There's no index to build or secure. In development, masquerade as a test student so the admin token doesn't expose material students can't see.

If live fetching turns out too slow or too shallow, the next steps are a per-course search index with visibility filtering, or a corpus the instructor curates. Both are bigger projects, so v0 starts without them.

### 3.4 The Socratic method and instructor policy

In the prototype, the Socratic prompt applied only when an LLM router picked "Tutor" ([backend/responses.py:420-451](https://github.com/landontowers/ai-tutor/blob/prototype-final/backend/responses.py#L420-L451)). The "Assistant" and "Friend" routes answered directly, and a client could send `role: "Quick"` to skip routing entirely. Sending `role: "Tutor"` or `"General"` explicitly crashed, because neither branch defines the prompt. The Socratic instruction itself was four lines.

What v0 builds:

- **In the student tutor, Socratic guidance is the only mode for course material,** and students can't opt out. Logistics get direct answers. The instructor tutor works differently (§3.14).
- **One instructor setting per course, stored as a value rather than a boolean.** v0 has two values: `full` (logistics and course material) and `logistics_only`. Later options are new values, not schema changes; examples are `off` for a course that opts out entirely, or stricter rules during exam windows. New courses default to `full`; the default lives in configuration.
- **Enforce the setting on the server, not only in the prompt.** A classifier labels each question as logistics or course material before the main call. Under `logistics_only`, the course-material path never runs and no course content is fetched.
- **Plan for the grey zone.** "What does assignment 3 ask for?" is logistics. "How do I solve question 2 of assignment 3?" is course material. The eval set has to cover these edges.
- **Tutoring state within a conversation.** Track what the student has tried and where they're stuck, and step up through a hint ladder instead of starting over every turn.
- **Evals as a first-class artifact.** Build a test set of "just give me the answer" pressure, pasted assignment prompts, role-play jailbreaks, and course-setting edge cases. Measure answer leakage, helpfulness, and classifier accuracy on every prompt or model change.

### 3.5 Code execution: does v0 need a sandbox?

The prototype's runner ([python_sandbox/main.py](https://github.com/landontowers/ai-tutor/blob/prototype-final/python_sandbox/main.py)) wasn't a sandbox:

- It used one process-wide `InteractiveShell` singleton, so every student's variables were visible to every other student.
- It had no timeout and no CPU or memory limits.
- It had network access on the same Docker network as the database.
- It returned only the value of the last expression, not stdout.
- It wasn't wired into the active tool list ([backend/responses.py:330](https://github.com/landontowers/ai-tutor/blob/prototype-final/backend/responses.py#L330)), even though the UI advertised it.

The general goal is a private, throwaway shell the model can use behind the scenes for calculations, running student code, or small scripts that help it answer.

**Is it still necessary with modern models? Partly.**

- **Models now handle** everyday arithmetic, explaining code by reading it, and simple conversions well, especially with reasoning turned on.
- **They still slip on** exact multi-step or large-number arithmetic, statistics over data, date math, and knowing what a program actually prints. A confident wrong number does more harm in a tutor than in a general chatbot.
- **v0's design raises the risk.** A fast sidebar uses small models with little or no reasoning (§3.9), and those are the most error-prone at exact computation. A sandbox also costs speed: each run adds a tool round trip plus session startup.

**Recommendation:**

- **v0 ships deterministic tools that run in-process:** a safe expression and unit calculator (a real math parser such as mathjs, which handles units; never `eval`) and date math. They need no isolation, add almost no latency, and cover likely SDI needs such as conversions, measurements, and grade math.
- **Define the code-execution port now** (§3.12), so a sandbox can be added without touching the core.
- **Add the sandbox when a college needs it.** One example is programming courses, where the tutor runs a student's code to _see_ the failure and then asks guiding questions. On Azure, the natural adapter is Container Apps dynamic sessions: Hyper-V-isolated sessions designed for untrusted, LLM-generated code. Provider-hosted code tools are the no-ops alternative, but they tie the feature to one provider and run student data in that provider's environment.
- **Any runner** is ephemeral and has no network access by default. It enforces hard limits on time, memory, and CPU, returns stdout, stderr, and files, and treats all output as untrusted input to the model.

### 3.6 Data model

The prototype's own retrospective pointed toward a relational database, and the code backs that up. The catalog "join" in `get_user_from_token` pairs two independently ordered query results by position ([backend/main.py:223-233](https://github.com/landontowers/ai-tutor/blob/prototype-final/backend/main.py#L223-L233)), so it only merges correctly when the orders happen to line up. Chat history was a single array per user that each save overwrote.

- **Use a relational core** for colleges, users, courses, course settings, conversations, messages, and audit. Add JSON columns for cached Canvas payloads. Postgres can also hold vectors later, if a search index is ever needed (§3.3).
- **Keep the re-fetchable Canvas cache separate from first-party data** (conversations, settings, policies). The two need different retention, backup, and deletion rules.
- **Make conversations first-class:** many threads per student, scoped to a course, with timestamps and a retention policy.
- **Use migrations from day one.** In the prototype, adding fields routinely broke older users' records.

### 3.7 Privacy, compliance, and research

FERPA applies to student records, and an official integration will likely face a vendor or security review. These prototype practices wouldn't pass:

- Student names and Canvas IDs were sent to Plausible as event properties ([streamlit/app.py:256-268](https://github.com/landontowers/ai-tutor/blob/prototype-final/streamlit/app.py#L256-L268)).
- Names were logged when moderation flagged a message, and Streamlit logged every request body, chats included, at INFO.
- The LLM `safety_identifier` was a hardcoded constant rather than a hash of each user's ID.
- `/analytics_data` returned every user's record.

**Institutional constraints on AI vendors.** Before student data reaches a model, a college's IT or compliance office usually needs to settle four things:

- which vendors may process student records (FERPA's "school official" exception requires a contract that limits how the vendor uses them);
- whether the vendor may keep or train on that data;
- where the data is processed;
- whether a security questionnaire is required (the HECVAT is common in higher education).

**Decision:** once real student data is involved, v0 uses only models Azure sells directly, under Microsoft's terms and in a US data zone (§3.9). That keeps everything inside the Azure agreement already in use, the easiest path. Development and the demo use Gemini on a personal Google account, with test data only (§3.9). Partner models such as Claude in Foundry come under separate terms and are left for later. Before the pilot, confirm with SDI's IT office that this setup is approved (§7).

**Research is out of scope for v0.** "Research" here means a study of whether the tutor improves outcomes: comparing grades, completion, or retention between students who use it and students who don't. That links tutor usage to student records, so it typically needs IRB review, informed consent, and de-identified data handling, all designed before launch. Product analytics is different: usage counts, latency, thumbs up or down, and which tools get called. That's normal operation and needs privacy care, not an IRB. v0 collects product analytics only, with pseudonymous IDs and no chat text.

**3-tier logging architecture:**

To resolve the tension between deep observability and educational privacy regulations (FERPA), v0 separates logging into three distinct tiers:

1. **Tier 1: Zero-PII operational telemetry (`PrivacyTelemetryAdapter`).**
   - Implements `TelemetryPort`. Captures operational metrics: turn latency, prompt/response character counts, tool call counts, citation counts, and routing decisions.
   - Automatically de-identified under FERPA 34 CFR § 99.31(b): student identifiers are salted and hashed via HMAC-SHA256 (`TELEMETRY_SALT`) into irreversible `anon_<16-hex>` handles.
   - Raw free-text keys (`message`, `prompt`, `content`, `body`, `email`) are scrubbed before emission. Safe for export to standard observability infrastructure (Azure Monitor, Application Insights, or Datadog) without creating external FERPA education records.
   - Optional Azure Blob Storage export: when configured, `AzureBlobLogStorageAdapter` (implementing `LogStoragePort`) buffers and streams de-identified `.jsonl` batches directly to an Azure Storage Account container via SAS URL or connection string, providing durable cloud log archiving.
2. **Tier 2: Course-scoped ephemeral conversation storage.**
   - Conversations and messages reside strictly in first-party persistence (`PersistencePort`), scoped by student, course, and persona.
   - Never exported to shared telemetry sinks.
   - Students have self-service data erasure via the "clear my data" control (`DELETE /api/conversations`).
3. **Tier 3: Administrative and security audit logging.**
   - Secure server-side logs recording administrative setting changes, developer masquerading events, and emergency incident disclosures.

**Crisis incidents and safety escalation (FERPA 34 CFR § 99.36):**

When a student conversation expresses thoughts of self-harm, suicide, or imminent physical violence, typical anonymization and silent refusal are insufficient. Under FERPA's Health and Safety Emergency Exception (34 CFR § 99.36), an educational institution may disclose personally identifiable information from education records to appropriate parties (school officials, crisis counselors, campus safety) in connection with an emergency if knowledge of the information is necessary to protect the health or safety of the student or other individuals.

- **In-flight crisis detection:** The moderation layer intercepts self-harm or violence triggers before the LLM generates a response.
- **Isolated incident persistence:** `TutorEngine` logs a structured `CrisisIncident` via `PersistencePort.saveCrisisIncident` to an isolated database table (`crisis_incidents`), retaining the user identifier, course, timestamp, and a masked trigger snippet.
- **Urgent alert dispatch:** `TutorEngine` dispatches the incident to a dedicated institution webhook or escalation service via `CrisisAlertPort` (`WebhookCrisisAlertAdapter`).
- **Immediate student support:** The tutor halts normal generation and delivers a prominent, accessible crisis action card featuring the 988 Suicide & Crisis Lifeline with click-to-call (`tel:988`), click-to-text (`sms:988`), and live chat (`https://988lifeline.org`) links.

**Other rules:**

- **Basics:** classify and minimize data, set retention windows, and keep audit logs of who accessed what.
- **Instructors see no individual student conversations in v0,** including through the instructor tutor (§3.14). Showing transcripts changes what students are willing to ask. Aggregate insights ("40% of the class is stuck on recursion") can come later as a deliberate, disclosed feature.
- **Per-user rate and cost limits.**

### 3.8 AI layer

- **Put the provider behind an adapter.** The prototype switched providers under pressure twice, and dead code for both sat side by side (`ai.py` and `responses.py`). Model names belong in config, not code (§3.12).
- **Treat everything fed into the context as untrusted.** Announcements, other students' discussion posts, course pages, fetched web pages, and the student's own bio all reach the model, so assume any of them can carry prompt injection. Keep tools read-only and scoped to the student asking. The prototype's `read_webpages` fetched arbitrary URLs from inside the Docker network, which made it an SSRF path to internal services. Any URL fetching in v0 needs an egress policy.
- **Keep the loop short.** The prototype ran an extra router call before every answer and allowed only one round of tool calls. For a quick helper, make one small classifier call (§3.4), then one main call with tools. Measure whether the classifier is worth its latency.
- **Replace the streaming protocol.** The prototype's server wrote JSON objects back to back with no delimiter, and the client had to guess where each one ended. Use typed events over SSE (text delta, tool status, citation, done, error). Do LaTeX-delimiter normalization in the renderer.
- **Rewrite moderation and crisis copy.** It should come from configuration (SDI's crisis resources in v0), look at more than the last message, and sound humane. "That is not cool bro" won't survive a college's review. In v0, in-flight self-harm or violence triggers halt LLM generation, store an isolated incident record, alert a dedicated webhook under FERPA § 99.36 via `CrisisAlertPort`, and present an immediate accessible crisis assistance card linking directly to 988 Lifeline (call, text, and chat).

### 3.9 Model choice: fast, cheap, accurate enough

The tutor answers and asks short questions in a 320px sidebar. That puts latency and cost first, as long as answers stay accurate and Socratic. Small models with reasoning off or minimal fit that job.

**Once real student data is involved, v0 uses only models Azure sells directly** (§3.7), deployed as **Data Zone Standard (US)** so processing stays inside the US. Avoid Global Standard for student data; it can process in any Azure region. Model names come from Microsoft's Foundry documentation, checked 2026-11-19 (see References).

| Role | Pilot and production model | Why |
| --- | --- | --- |
| Student and instructor tutors (§3.14) | `gpt-5.4-mini` | The newest small GPT model Azure sells (March 2026). It's fast and cheap, and with reasoning off or minimal it's capable enough for short Socratic answers and tool calls. The two tutors use separate model roles, so the instructor tutor can move to a stronger model or more reasoning later without affecting students. |
| Question classifier (§3.4) | `gpt-5.4-nano` | The cheapest tier, for one short structured call. |
| Moderation and jailbreak checks | Azure AI Content Safety, plus built-in content filters | Azure-native. |

Microsoft's docs didn't confirm the small GPT models in Central US as of 2026-11-19, so check when provisioning. Data Zone Standard (US) deployments can process anywhere in the US data zone, so the resource's region matters less.

**Development and the demo: Gemini on a personal Google account.** So that building the demo doesn't bill SDI, the model adapter points at Google's Gemini API, on the developer's own Google account. A consumer Gemini subscription (Google AI Pro) doesn't itself include API usage; the API is billed separately through Google AI Studio and Google Cloud. There are two ways to keep it free or close to free:

- **Free tier.** An AI Studio API key works without billing, within rate limits. Google may use free-tier prompts and responses to improve its products, and human reviewers may read them. Send only test data and sample content, never real student data or SDI's own course materials.
- **Subscription credits (preferred).** Google's Developer Program says linking a Google AI Pro plan gives monthly Google Cloud credits. Attach a Cloud Billing account to the API project and apply the credits. Once billing is on, all Gemini API use counts as paid service, and Google doesn't use paid-tier prompts or responses to improve its products. Confirm in the billing console that the credits cover Gemini API charges, and set a budget alert so usage beyond the credits doesn't land on a personal card.

Either way:

- **Use the current Flash or Flash-Lite model.** They're fast and cheap, which fits the sidebar.
- **Gemini isn't approved for student data.** It's for development and the demo only; the pilot moves to Azure (§3.7).
- **Check rate limits before a live demo.** Free-tier limits may be too tight for several viewers at once.
- **Expect to retune.** Prompts tuned on Gemini may need adjusting for `gpt-5.4-mini`. The eval suite (§3.4) shows the difference, and the switch itself is a config change (§3.12).
- **Keep keys personal.** Each developer uses their own key in their own `.env`; don't share a personal key with the team.

Speed levers that apply to any model:

- Keep reasoning off or minimal.
- Cap output length.
- Stream tokens.
- Cache the stable system prompt where the provider supports it.
- Avoid extra round trips.

**Logged for later: a model bake-off.** Once the eval suite exists (§3.4), run 100–200 SDI-style prompts through each candidate: logistics, course material, "just give me the answer" pressure, and course-setting edge cases. Measure:

- time to first token, and time to finish a typical answer;
- cost per 1,000 conversations, from real token counts;
- Socratic adherence and answer leakage;
- tool-call accuracy (picking the right Canvas tool);
- classifier accuracy for the course-material setting.

Candidates:

- **`claude-haiku-5-5` in Foundry.** Its hosted-on-Azure version is listed for Central US under Data Zone Standard (US). It's a partner model under separate terms, Anthropic manages its retention independently, and it requires a pay-as-you-go subscription.
- **Other models in the Foundry catalog,** such as `grok-4.1-fast-non-reasoning`, `DeepSeek-V4-Flash`, `Mistral-small-2503`, and `Phi-4-mini-instruct`.
- **Outside Azure:** Google's Gemini Flash and Flash-Lite, which regularly rank among the fastest and cheapest in independent latency tests; the providers' own APIs; and speed-focused hosts for open models, such as Groq or Cerebras. Each adds a vendor and a data agreement.

Because providers are adapters (§3.12), switching the default is a config change.

### 3.10 Clients

- **One UI, built with Instructure UI (React),** rendered inside Canvas through LTI. For the demo, the same UI can also run as a standalone page that mimics the drawer (§4.5).
- **One TypeScript codebase.** The React UI and the Node.js backend share types for messages, tools, and stream events, for example in one pnpm workspace.
- **Three surfaces:**
  - the sidebar (`top_navigation` drawer), which shows the student or instructor tutor based on the user's role in the course (§3.14);
  - instructor course settings (`course_navigation`, staff only);
  - student settings for opt-out and data deletion (`user_navigation`).
- **Mobile:** check which of these placements Canvas's mobile apps support before promising mobile access. Never use tokens in URLs.

### 3.11 Ops

- **Never ship secrets to clients.** Use one secrets mechanism per environment (Key Vault, §5).
- **Don't publish ports for internal services, and segment the network** (§5.6).
- **Automate deployment** (§5).
- **Add observability without PII:** latency, tool errors, and model cost per course and per user.
- **Build v0 as a fresh tree in this repo.** Phase 0 of the implementation plan tags the prototype and removes it up front (§6).

### 3.12 Modularity: swappable adapters throughout

The prototype wired every external dependency directly into the code that used it:

- Vendor SDK calls sat inside the request handlers.
- Tool schemas were written twice, once per OpenAI API format (`ai.py` and `responses.py`).
- Model quirks were handled with commented-out `if model != "o1"` branches.
- The college was parsed from the Canvas hostname. The extension took the first label of the hostname, which for SDI's `classroom.sdi.edu` would have yielded `"classroom"`.

v0 is a core with ports and adapters (hexagonal architecture):

- **The core owns the domain:** tutoring policy, the student and instructor harness profiles (§3.14), course settings, conversation state, tool orchestration, and permission checks. It defines the interfaces (ports) and never imports a vendor SDK.
- **Adapters implement the ports:** one class per vendor or technology, chosen through configuration.

| Port | What varies behind it | Adapters (v0 first) |
| --- | --- | --- |
| LLM provider | Message and tool-call formats, streaming events, reasoning controls, context window, supported sampling parameters, prompt caching, rate limits, pricing, data terms | Gemini API (development and demo); Azure OpenAI (pilot and production: `gpt-5.4-mini`, `gpt-5.4-nano`); a scripted fake; later, Claude in Foundry or other providers (§3.9) |
| Identity / launch | How a verified user arrives | Personal token with masquerading (development); LTI 1.3 + OAuth2, for example through ltijs |
| LMS | API shape, pagination, rate limits | Canvas REST; a fake LMS with fixture data |
| Course content | How material is found | Live fetch with the student's token (v0); a search index later |
| Code execution | Isolation, languages, limits | In-process calculator and date tools (v0); Container Apps dynamic sessions; provider-hosted code tools |
| Moderation / safety | Classifier and categories | Azure AI Content Safety; a fake |
| Persistence | Storage engine | Postgres; in-memory for tests |
| Telemetry | Destination, PII handling | Application Insights through OpenTelemetry; no-op |
| Theme / branding | Tokens, assets, copy | Per-college theme files (§3.13) |
| Tools | Schema, required scopes, handler | Grades, assignments, syllabus, course pages, calculator |

Design rules:

- **Capabilities, not the lowest common denominator.** Each adapter publishes what it supports: streaming, parallel tool calls, reasoning control, maximum context, structured output, prompt caching, and which sampling parameters it accepts. For example, `claude-haiku-5-5` in Foundry doesn't accept `temperature` or `top_k`. The core checks capabilities and degrades gracefully, and no `if provider == ...` branches leak into it.
- **Normalized internal schemas.** The core has its own types for messages, tools, and stream events (§3.8). Adapters translate in both directions, and each tool is defined once.
- **Models are chosen by role, not name.** Config maps each role (student tutor, instructor tutor, classifier, moderation) to a provider, model, and parameters.
- **Configuration selects the adapters:** provider and models, code-execution backend, theme, persona copy, crisis resources, and the default course setting. v0 has one configuration, SDI's. Giving each college its own comes later and needs no core changes. Validate it at startup and fail fast.
- **Every port gets a fake and a contract test suite** that all its adapters must pass. Design each interface against at least two real implementations, so it isn't one vendor's API under a new name.
- **Enforce the dependency direction in CI,** for example with dependency-cruiser or ESLint's `no-restricted-imports`, so the core never imports a vendor SDK.
- **Keep ports small and stable.** Don't wrap things that aren't expected to change, such as the web framework.

### 3.13 Interface: Canvas-native, SDI-branded, themeable per college

The UI lives inside Canvas, so it should feel like part of Canvas first and carry the college's brand second:

- **Canvas layer (structure).** Layout, spacing, density, focus states, component behavior, and body type (Lato) follow Canvas. **Instructure UI (React)** is the component foundation. It's what Canvas is built on, so it matches the native look and accessibility, and its theming system takes the college's tokens.
- **College layer (brand).** Color, logo, display type, the tutor's name and avatar, and voice come from a theme file: SDI's in v0, and one per college later.

**SDI's design language,** read from sdi.edu's stylesheets and SDI's Canvas theme on 2026-11-19. These are enough to build from; v0 needs no separate brand sign-off.

- **Brand red:** `#D50032`, the most-used color in the site theme (Elementor's global primary is the close `#D51F35`). SDI's Canvas already uses the red for its global navigation.
- **Darker reds:** `#A50027`, `#80001E`, `#580015`.
- **Ink and grays:** `#101820`, `#313B44`, `#4F5962`.
- **Light neutrals:** `#CACFD5`, `#EAEAEA`, and a warm off-white `#EDEAE6`.
- **Accent:** light blue `#AFE5F6`.
- **Type:** `proxima-nova` for body text and `prohibition` (a condensed display face) for headings, with frequent uppercase. Both come from Adobe Fonts.
- **Tone:** formal and mission-focused ("We are honored to serve you.").

How to keep it modular:

- **Design tokens are the single source.** Components reference semantic tokens (`color.action.primary`, `color.surface`, `font.display`), never raw hex values. A college theme is a token file plus assets and copy (tutor name, greeting, crisis resources). Adding a college means adding a theme, not editing components.
- **Inherit from Canvas, then override.** Canvas's `lti.getPageSettings` postMessage returns `active_brand_config_json_url` (the college's live Canvas theme), `use_high_contrast`, `locale`, and `time_zone`. Precedence runs: base tokens, then the college's Canvas theme, then its theme file, then the student's preferences.
- **Design for 320px.** The sidebar drawer is a fixed 320px wide, so that's the primary layout. Wider placements, such as the settings pages, come second.
- **Accessibility is a gate.** Run automated WCAG 2.1 AA contrast checks on every theme in CI.
  - SDI red `#D50032` is 5.42:1 on white, which passes for body text.
  - On the off-white `#EDEAE6` it's 4.52:1, which just passes.
  - On `#101820` it's 3.30:1, which passes for large text and icons only.

  Honor Canvas's high-contrast setting. Announce streamed answers to screen readers without interrupting, using `lti.screenReaderAlert` or an `aria-live` region. Support full keyboard use.
- **Font licenses are per domain.** SDI's Adobe Fonts kit only loads on the domains it lists, so `proxima-nova` and `prohibition` won't load on the tutor's domain unless the kit is extended. Body text uses Lato from the Canvas layer anyway. Give headings a fallback stack, so a missing display font degrades cleanly.

### 3.14 Two tutors: student and instructor

v0 runs two tutors on one engine. They share the UI, the adapters, and the infrastructure. They differ in **access**, meaning which data and tools they can reach. They also differ in **instruction harness**: the system prompt, tools, policies, and model settings that shape how each behaves.

**The role comes from Canvas, per course.** The signed LTI launch carries the user's roles in the current course (the LTI roles claim): for example, Learner, Instructor, or Teaching Assistant.

- **The server picks the tutor from that claim,** never from anything the client sends.
- **The choice is per course, not per person.** The same person can be a student in one course and a TA in another.
- **A fixed rule settles mixed roles.** When Canvas reports more than one role in a course, the rule decides (for example, staff roles win only for Teacher and TA) and the choice is logged.
- **In development, masquerade** as a test student or a test teacher to exercise each tutor (§3.1).

| | Student tutor | Instructor tutor |
| --- | --- | --- |
| Who | Learners in the course | Course staff: teachers and TAs, plus designers if SDI wants |
| Canvas token | The student's own | The instructor's own |
| Data it can reach | The student's own grades, submissions, and feedback, and course content the student can see | Whatever Canvas lets that instructor or TA see in the course: assignments, the gradebook, submissions, and the roster |
| Tools | Own grades, assignments, syllabus, announcements, course pages (when the course setting allows), calculator | Course structure lookups, gradebook and submission summaries, content drafting, calculator |
| Pedagogy | Socratic for course material, direct answers for logistics, course setting enforced (§3.4) | Direct and efficient. It's a teaching assistant, not a tutor, so the Socratic rule and the course setting don't apply. |
| Typical asks | "When is the next quiz?" "I'm stuck on this problem." | "Which assignments have no due date?" "Draft an announcement about the deadline change." "How many students haven't submitted lab 3?" |
| Model role (§3.9) | `tutor.student` | `tutor.instructor`, which can use a stronger model or more reasoning, since instructors may value depth over speed |

**Harness profiles are data, not separate code paths.** Each tutor is a profile the core loads: its system prompt, allowed tools, policies, model role, and output limits.

- **The core only offers the model the tools in the current profile,** and each tool declares which roles and Canvas scopes it requires.
- **Injection can't cross the line.** A prompt injection in a student session can't reach instructor tools: those tools are never offered, and the core rejects any call to them anyway.
- **New profiles are configuration.** Adding a role-specific profile later, such as one for course designers, needs no new code paths.

**Rules that keep the line clear:**

- **Instructors can't read student conversations,** through the instructor tutor or anywhere else in v0 (§3.7). The instructor tutor's tools have no access to the student tutor's conversation store.
- **The instructor tutor is read-only in v0.** It drafts announcements, rubrics, or quiz questions for the instructor to post. It doesn't post, grade, or change anything in Canvas. Write actions are logged for later (§7), and would need explicit confirmation and write scopes.
- **Minimize student data sent to the model, even for instructors.** Instructors have a legitimate interest in their students' records, but the model doesn't need the whole roster. Tools return counts and summaries where they can, and individual names only when the question needs them.
- **Conversations are tagged with role and course,** so a TA's staff conversations stay separate from their own student conversations in another course.
- **Each tutor has its own eval suite.**
  - The student tutor's measures answer leakage and Socratic adherence.
  - The instructor tutor's measures accuracy, and checks that it never reveals student conversations or more student data than the question needs.

**Surfaces.** The same `top_navigation` sidebar renders whichever tutor matches the user's role in the current course. The course settings page (`course_navigation`, staff only) stays separate from the instructor tutor, so the course-material setting is changed deliberately, not through chat.

## 4. The demo: local hosting

The current goal is a functional demo to show SDI, not a production implementation. Production hosting (§5) comes after the demo has done its job. Until then:

- Anything that can run locally does.
- No SDI domain is available yet.
- The demo is shared through a tunnel on a personal domain.

The architecture doesn't change for the demo. It runs on the same core and adapters (§3.12), so moving to production means swapping adapters and hosting, not rewriting.

### 4.1 What the demo should show

- **Both tutors against real Canvas structure** (§3.14). The student tutor answers logistics and guides Socratically on course material. The instructor tutor answers course questions and drafts content.
- **The course-material setting** changing what the student tutor will do (§3.4).
- **The UI in SDI's theme** at sidebar width (§3.13).
- **Optionally, the tutor inside Canvas's own sidebar** (§4.5).

### 4.2 What runs where

| Component | Demo | After the demo (§5) |
| --- | --- | --- |
| UI and API (TypeScript) | Local, in Docker Compose | Azure Container Apps |
| Database | Postgres in a local container | Azure Database for PostgreSQL |
| Models | Gemini API on a personal Google account (§3.9), the only cloud dependency | Azure OpenAI (`gpt-5.4-mini`, `gpt-5.4-nano`) |
| Moderation | Gemini's built-in safety settings | Azure OpenAI's content filters plus Azure AI Content Safety |
| Canvas access | The personal access token with masquerading, server-side only | LTI 1.3 and OAuth2 |
| Secrets | The gitignored `.env` | Key Vault |
| Public access | A tunnel to a hostname on a personal domain (§4.3) | A hostname SDI provides |
| Telemetry | Local logs | Application Insights |
| CI/CD | Not needed | GitHub Actions (§5.4) |

**The model stays a cloud API.** A model running on a laptop would make the demo slower and weaker. The demo needs only a Gemini API key on a personal Google account (§3.9), so building it doesn't bill SDI. Azure OpenAI takes over for the pilot. Because the model is an adapter, a local model (for example, through Ollama) can stand in for offline development if that's ever useful.

### 4.3 Sharing the demo through a personal domain

- **Use a tunnel, not port forwarding.** A tunnel connects the local stack to a hostname on the personal domain over an outbound connection, and it handles HTTPS. Cloudflare Tunnel is a good default if the domain's DNS is on Cloudflare; ngrok and Tailscale Funnel are alternatives.
- **Put a sign-in in front of it.** The server holds an admin-level Canvas token, so the public URL must not be open to anyone who finds it. With Cloudflare Tunnel, Cloudflare Access can require viewers to sign in with an invited email address. Otherwise, add authentication in the app.
- **Use a dedicated subdomain,** such as `tutor-demo.` on the personal domain. That way it can be turned off or moved without touching anything else.
- **The demo is up only while the host machine is.** That's fine for scheduled demos. Needing always-on access is the signal to move to Azure (§5).
- **LTI needs a stable HTTPS URL,** and a named tunnel provides one. Registering the demo in Canvas (§4.5) against this hostname is fine; it moves to an SDI hostname later.

### 4.4 Canvas data in the demo

The demo reads SDI's Canvas through the personal access token, which carries admin authority. That makes the data rules stricter, not looser:

- **Demo only with test data.** Create a sandbox course with sample content, plus test student and test teacher accounts. Canvas's beta and test instances are periodic copies of production, so they still hold real student records. The safety comes from the sandbox course and test accounts, not from the instance.
- **Masquerade only as an allowlist of test accounts.** The server picks from a fixed list of demo personas, such as "Demo student" and "Demo instructor", and adds `as_user_id` itself. Viewers can switch personas, but they can't supply a user ID.
- **The token stays on the server.** It never reaches the browser, logs, or the repo.
- **Clean up.** Clear stored conversations after demos. The current token expires January 1, so generate a new one if the demo phase runs past then, and revoke it when the phase ends.

### 4.5 Two ways to show it

- **Standalone page (start here).** The UI runs at the demo hostname, inside a 320px frame styled like Canvas's drawer, with a persona switcher. It needs no Canvas registration. "The page the student is on" is simulated by picking an assignment or page from the sandbox course.
- **Inside Canvas (stretch goal).** Register an LTI 1.3 developer key against the demo hostname, preferably in SDI's Canvas test or beta instance, and turn on the `top_navigation_placement` flag there. Install the tool only where the sandbox course lives: in the course itself if Canvas allows that placement at course level, otherwise in a sub-account holding only the sandbox course. This exercises the real launch, roles, drawer, and `lti.getPageContent`. It needs the LTI identity adapter (§3.12) earlier than the production plan would.

### 4.6 What the demo skips

- **OAuth opt-in and per-user tokens.** Masquerading stands in for them.
- **Cloud infrastructure:** Key Vault, CI/CD, Terraform, and cloud environments (§5).
- **Azure AI Content Safety** beyond the built-in filters.
- **Production-grade retention, audit, and backups.** The demo holds no real student data, so these can wait.

## 5. Production deployment (Azure, after the demo)

The demo needs none of this (§4.2). This section is the plan for the pilot and beyond.

### 5.1 Starting point

The prototype had no automated deployment:

- There was no CI.
- Deploys were an rsync from a developer's laptop, including the local `.env`, with downtime and no rollback.
- Builds didn't reproduce from a clean clone, because `.gitignore` ignored `uv.lock`.
- Environment files drifted apart.
- Tests ran only against production.

Its deployment tooling has been removed (§6), so v0 starts from this plan.

### 5.2 Target services

Each service maps onto a port from §3.12, so any one of them can be swapped later.

| Concern | Azure service | Why |
| --- | --- | --- |
| Web UI and API | Azure Container Apps | Revisions with traffic splitting give zero-downtime deploys and one-step rollback. HTTPS ingress, custom domains, managed certificates, and autoscaling are built in. App Service is a simpler alternative; AKS is more than this scale needs. |
| Database | Azure Database for PostgreSQL (Flexible Server) | Automated backups with point-in-time restore, private networking, and Microsoft Entra sign-in, so apps use managed identity instead of passwords. Supports pgvector if a search index is ever added. |
| Models | Azure OpenAI and Foundry models, in Data Zone Standard (US) | §3.9 |
| Moderation | Azure AI Content Safety | §3.9 |
| Secrets | Azure Key Vault with managed identities | Secrets (LTI keys, the OAuth client secret, model keys) live here, read through managed identity. No secrets in images, env files, or client bundles. |
| Configuration | Azure App Configuration, or the database | SDI's settings and feature flags (§3.12) change without a redeploy. Validate and version them. |
| Images | Azure Container Registry | One image per commit, tagged with the git SHA and promoted unchanged through environments. |
| Observability | Azure Monitor and Application Insights, through OpenTelemetry | Scrub PII before export (§3.7). Track model cost per course as a custom metric. |
| Log storage (optional) | Azure Blob Storage | Low-cost, durable long-term storage and archiving for de-identified operational telemetry batches and security audit logs, via `AzureBlobLogStorageAdapter` (§3.7). |
| Cache (optional) | Azure Managed Redis | Canvas response cache and per-user limits, if load needs it. |
| Code execution (later) | Azure Container Apps dynamic sessions | Only when a college needs it (§3.5). |

### 5.3 Region and environments

**Region: Central US.** Before committing, check each service's region table, because Foundry model availability varies by region and deployment type. Microsoft's docs list `claude-haiku-5-5` for Central US. Central US support for the small GPT models wasn't confirmed as of 2026-11-19. Data Zone Standard (US) deployments process anywhere inside the US data zone, so the resource region matters less for models.

**Environments, phased to match the team's stage:**

- **First, after the demo: one `dev` environment.** It uses one subscription and resource group, and the default Container Apps domain. Until then, development and the demo run locally (§4).
- **Before the first student pilot: `prod` in its own subscription,** for separate access control, billing, and policy.
- **Add `staging` when real users make release risk worth it.** It goes in the non-production subscription, pointed at Canvas's test environment.

Each environment has its own Key Vault, database, and Canvas registration, pointing at its own URLs.

### 5.4 Pipeline (GitHub Actions to Azure)

1. **Every pull request** runs:
   - lint, type checks, and unit tests;
   - the port contract tests and the import-direction check (§3.12);
   - secret scanning and a dependency audit;
   - theme contrast checks (§3.13);
   - the eval suite, when prompts or model config change (§3.4, §3.9).
2. **Merging to main** builds images once, tags them with the commit SHA, pushes them to Container Registry, and deploys to dev automatically.
3. **Staging** (once it exists) gets the same images, plus smoke tests and an LTI launch test against Canvas's test environment.
4. **Production** needs an approval (GitHub environment protection rules). Each release goes out as a new Container Apps revision at 0% traffic, passes health checks, and then takes traffic. Rolling back means shifting traffic to the previous revision.

Across all stages:

- **GitHub signs in to Azure with OpenID Connect** (workload identity federation), so no long-lived Azure credentials are stored in GitHub.
- **Database migrations run as their own step** before the new revision takes traffic. Write them expand-then-contract, so the old and new revisions can both run against the same schema.
- **Prompts, model choices, and tutoring policies ship like code.** Version them, run evals on them, and roll them back the same way.

### 5.5 Infrastructure as code: Terraform

- **Define everything in Terraform** (the `azurerm` provider) and apply it from the pipeline, not by hand in the portal. That covers resource groups, the Container Apps environment, the database, Key Vault, the registry, monitoring, networking, and role assignments.
- **Keep remote state in an Azure Storage account** with state locking, and keep one state per environment.
- **Parameterize by environment.** How multiple colleges get deployed is a later decision (§7).

### 5.6 Networking

- **The Container Apps environment sits in a virtual network.** Postgres and Key Vault are reachable only through private endpoints.
- **Any future code sandbox gets no route to the database** and no general internet access.
- **Only the UI and API ingress are public.**

### 5.7 Operations

- **Cost:** Azure budgets and alerts, alongside per-user model limits (§3.7).
- **Backups:** rely on Postgres point-in-time restore, set recovery targets, and test a restore before the pilot.
- **Local development keeps the demo's Docker Compose stack** (§4.2), with fake adapters for Canvas and the model alongside the real ones.

## 6. Repository status (cleanup, 2026-11-19)

The full prototype is preserved at the [`prototype-final`](https://github.com/landontowers/ai-tutor/tree/prototype-final) tag (commit `b1bddf8`). Phase 0 of the [implementation plan](v0-implementation-plan.md) removed everything else from the working tree.

**Removed:**

| Path | Why |
| --- | --- |
| `extension/` | Scraped Canvas with the student's session and carried the shared API key. Replaced by LTI and OAuth2 (§3.1). |
| `deploy.yaml`, `stage.yaml`, `compose/`, `plausible/`, `send_files.sh`, `setup/`, `dev.env`, `backend/compose.yaml`, `streamlit/compose.yaml`, `python_sandbox/compose.yaml`, the `deploy` recipe in the `Justfile` | The prototype's deployment tooling: Hetzner servers, self-hosted analytics, and Terraform for a staging VPS. Out of scope for this fork; replaced by §5. |
| `markdown_svelte/`, `explore/`, `tests/keys.py` | Experiments and scratch scripts. |
| `data/` | UVU's course catalog. Catalog enrichment returns as a per-college source. |
| `dev/` | Key generator and placeholder for the retired shared-key scheme. |
| `mongo/compose.yaml`, `mongo/example_user.jsonc` | A legacy compose file that mounted a missing file, and a real user's database record pasted in as an example. |
| `.github/CODEOWNERS` | Assigned reviews to former team members. |
| `doc/course_schema.jsonc`, `doc/user_schema.jsonc` | Empty or one-line stubs. |
| School deliverables in `doc/` (sprint reports, meeting logs, course reports, surveys) | Not product documentation. |
| `backend/`, `python_sandbox/`, `streamlit/`, `svelte/`, `mongo/`, `tests/`, `develop.yaml`, `svelte_dev.yaml`, `pyrightconfig.json`, `images/`, and the prototype diagram, API notes, and privacy policy in `doc/` | The rest of the prototype, removed in Phase 0. The table below records the lessons. |

**Rewritten in Phase 0:**

- `README.md`;
- `.gitignore`, without the Flutter and school sections or the `*.lock` rule;
- `template.env`, with v0 variables only;
- the `Justfile`, to which Phase 1 adds recipes;
- `doc/README.md`.

**Prototype components, archived.** v0 doesn't build on these. They're browsable at the tag, and the table records what each was useful for and what not to repeat:

| Component (at `prototype-final`) | Useful for | Problems not to repeat | See |
| --- | --- | --- | --- |
| `backend/` | Canvas data shaping, tool definitions, the moderation flow | Client-asserted identity and a shared key; endpoints that only served the extension; CORS for extension origins; an open `/v1/chat` proxy; dead files (`ai.py`, which `main.py` still imports, plus `database.py`, `config.py`, `requirements.txt`) | §1, §3.1, §3.8, §3.12 |
| `python_sandbox/` | Nothing to reuse | Shared state, no limits, network access | §3.5 |
| `streamlit/` | Chat UX, settings, and tips copy | Student names sent to analytics, chat bodies logged, login through the removed extension | §3.7, §3.10 |
| `svelte/` | Markdown and KaTeX rendering | Private API key handed to the browser, hardcoded `api.aitutor.live`, leftover experiment routes. v0 uses Instructure UI (React) instead. | §3.13 |
| `mongo/mongo-dev-init.js` | Nothing; replaced by Postgres migrations and seed data | Hardcoded `user`/`pass` credentials and the extension's API key | §3.6 |
| `tests/test_api.py` | Nothing | Ran against the live API with a real student's Canvas ID | §3.12, §8 |
| `doc/privacy-policy.md` | Nothing | A prototype-era policy; v0 writes a new one before the pilot | §3.7 |

## 7. Decisions

**Resolved:**

1. **Scope.** v0 serves SDI only. Support for other colleges comes later, and the seams for it stay in place (§3.12, §3.13).
2. **Canvas access.** A personal access token with masquerading for development (§3.1). LTI 1.3 and OAuth2 developer keys come before any student uses it.
3. **Adoption.** An admin installs the tool once, and students opt in at first launch inside Canvas. No browser plugin (§3.1).
4. **Instructor control.** One per-course setting: `full`, the default, or `logistics_only`. Logistics are always allowed. In v0, instructors don't see student conversations or curate material (§3.3, §3.4, §3.7).
5. **Code execution.** Deterministic in-process tools in v0, with the code-execution port in place (§3.5).
6. **AI vendor.** Once real student data is involved, only models Azure sells directly, under Microsoft's terms, in a US data zone (§3.7).
7. **Models.** For the pilot and production: `gpt-5.4-mini` for answers, `gpt-5.4-nano` for the classifier, and Azure AI Content Safety for moderation. For development and the demo: Gemini's Flash or Flash-Lite on a personal Google account, with test data only, so SDI isn't billed (§3.9).
8. **Research.** None; product analytics only (§3.7).
9. **Stack.** TypeScript throughout: Instructure UI (React) for the UI (§3.13), and Node.js for the backend with an LTI library such as ltijs.
10. **Theme source.** sdi.edu and SDI's Canvas theme, with no separate sign-off (§3.13).
11. **Azure, after the demo.** Central US and Terraform. Environments are phased: dev, then prod before the pilot, then staging (§5.3, §5.5).
12. **Prototype deployments.** Out of scope for this fork.
13. **Two tutors.** A student tutor and an instructor tutor on one engine, separated in access and instruction harness. The instructor tutor gives direct, read-only help (§3.14).
14. **Current phase.** A functional demo, not a production implementation. It runs locally in Docker Compose, uses Gemini on a personal Google account for the model, and is shared through a tunnel on a personal domain until SDI can provide one (§4).
15. **License and ownership.** Apache 2.0, copyright Landon Towers, with a `NOTICE` that acknowledges the original prototype led by Spencer Thompson. v0 is a personal open-source project, and only the SDI integration happens on company time (implementation plan, step 0.6).
16. **Privacy telemetry and crisis escalation.** Operational telemetry is de-identified under FERPA 34 CFR § 99.31(b) using HMAC-SHA256 pseudonymized identifiers and strict free-text scrubbing (`PrivacyTelemetryAdapter`). In-flight crisis detection (self-harm, suicide, imminent violence) invokes the FERPA 34 CFR § 99.36 Health & Safety Emergency Exception, storing isolated incident records and dispatching alerts to student welfare webhooks via `CrisisAlertPort` while presenting immediate 988 Lifeline resources in the UI (§3.7, §3.8).
17. **Optional Azure log storage.** De-identified operational telemetry and audit logs can be optionally exported directly to Azure Blob Storage via `AzureBlobLogStorageAdapter` (`LogStoragePort`) using SAS URL or connection string configuration, with automated batching and graceful flush on shutdown (§3.7, §5.2).

**Before the student pilot:**

- **Approval.** Confirm with SDI's IT or compliance office that Azure-sold models in the US data zone are approved for student data, and ask whether a security questionnaire is required (§3.7).
- **Hostname.** Pick the hostname the tutor is served from. Canvas's registration records the LTI launch, login, redirect, and public-key (JWKS) URLs on it, so changing it later means updating that registration. While v0 serves only SDI, an `sdi.edu` subdomain is simplest, and SDI can add it to its Adobe Fonts kit (§3.13). Until then, the demo uses a tunnel hostname on a personal domain (§4.3).
- **Canvas registration.** Register the LTI 1.3 and OAuth2 developer keys against that hostname, and turn on the `top_navigation_placement` feature flag (§3.1).
- **Production environment.** Create the production subscription and environment (§5.3).
- **Model switch.** Move the model adapter from Gemini to Azure OpenAI, and re-run the eval suite (§3.9).
- **Targets.** Agree on speed and cost targets (§8).

**Logged for later:**

- **Model bake-off.** Candidates and measurements are in §3.9.
- **Multi-college support:**
  - per-college configuration, themes, and secrets;
  - identifying the college from the LTI issuer and client ID, never from the hostname;
  - a neutral product domain instead of an `sdi.edu` subdomain;
  - whether colleges share one deployment or each get their own.
- **More instructor options:** a full course opt-out (`off`), exam-window rules, and aggregate insights.
- **Instructor write actions,** such as posting announcements or entering grades, with explicit confirmation and write scopes (§3.14).
- **A code-execution sandbox** (Container Apps dynamic sessions), when a course needs student code run (§3.5).
- **Better course-material retrieval:** a search index or instructor-curated material, if live fetching falls short (§3.3).
- **Canvas Live Events,** for data freshness at scale (§3.2).

## 8. Verification: what v0 must be able to prove

Use these as acceptance criteria when writing the implementation plan:

- **Isolation:** Student A can't reach student B's data through any endpoint, tool, cache, or sandbox state. An automated test proves this, not a code review.
- **Role separation:** A student session is never offered instructor tools, and a forced call to one is rejected. Roles come only from the signed launch. The instructor tutor can't read student conversations, and its eval suite checks that it reveals no more student data than a question needs.
- **Visibility:** The tutor never shows course content the asking student can't see in Canvas. Development tests run as a masqueraded test student.
- **Course setting:** Under `logistics_only`, course-material questions are declined and no course content is fetched, while logistics questions, including grey-zone cases, still get answers.
- **Pedagogy:** The eval suite reports answer leakage, helpfulness, and classifier accuracy, tracked across every prompt or model change.
- **Speed and cost:** Targets are agreed before the pilot (for example, first token under one second at p95), and cost per conversation is tracked.
- **Calculations:** The deterministic tools have exact-answer tests. If a sandbox is added, it gets escape tests for network, filesystem, fork bombs, infinite loops, and memory.
- **Secrets:** A CI check scans every built client artifact and finds no secrets. No deployed environment uses a personal access token.
- **Privacy:** Logs and analytics contain no names, emails, or chat text. Opting out revokes the Canvas token and deletes the student's data.
- **Modularity:** Every adapter passes its port's contract tests. Switching model providers is a config change with no core edits, and CI fails if the core imports a vendor SDK.
- **Theming:** Swapping SDI's theme file for another needs no component changes. Every theme passes WCAG 2.1 AA contrast checks and renders correctly at 320px, with Canvas's high-contrast setting, and without its brand font.
- **Deployment:** A clean clone reaches a fresh Azure environment through the pipeline with no manual steps. Production deploys cause no downtime, rollback is a single action, and no secret lives outside Key Vault.
- **Demo:**
  - It starts with one command on a fresh machine.
  - The public URL requires sign-in.
  - Only allowlisted test personas can be selected, and the Canvas token never reaches the browser.
  - Both tutors work end to end against the sandbox course.
  - No real student data or SDI course material reaches the development model provider.

## References

- Canvas: [Navigation tools, including the `top_navigation` drawer](https://canvas.instructure.com/doc/api/file.navigation_tools.html), [Window postMessage API (`lti.getPageContent`, `lti.getPageSettings`, platform storage)](https://canvas.instructure.com/doc/api/file.lti_window_post_message.html), [Masquerading](https://canvas.instructure.com/doc/api/file.masquerading.html)
- Microsoft Foundry: [Models sold directly by Azure](https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/concepts/models-sold-directly-by-azure), [Deployment types](https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/concepts/deployment-types), [Models from partners](https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/concepts/models-from-partners), [Claude in Foundry](https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/how-to/use-foundry-models-claude)
- Azure Container Apps: [Dynamic sessions](https://learn.microsoft.com/en-us/azure/container-apps/sessions)
- Google: [Gemini API terms](https://ai.google.dev/terms), [Gemini API data logging and sharing](https://ai.google.dev/gemini-api/docs/logs-policy), [Google Developer Program (AI Pro plan credits)](https://developers.google.com/program)
