# Demo walk-through script and operations guide

This document provides the complete, step-by-step walk-through script for presenting Virtual TA v0 to stakeholders at Sonoran Desert Institute (SDI), along with operational procedures for demo hosting, authentication, secrets hygiene, rate limits, and state reset (critique §4, plan Phase 5).

---

## 1. Demo prerequisites and startup

The demo runs locally in Docker Compose (critique §4.2) and can be presented locally at `http://localhost:5173` or shared remotely over a secure Cloudflare Tunnel (critique §4.3).

### Starting the local stack

1. Copy `template.env` to `.env` (gitignored):
   ```sh
   cp template.env .env
   ```
2. In `.env`, ensure test credentials and model provider are configured:
   - For offline evaluation: `MODEL_PROVIDER=fake`
   - For live AI generation: `MODEL_PROVIDER=gemini` and set `GEMINI_API_KEY=<your-personal-key>`
   - To enable sign-in protection: `DEMO_AUTH_ENABLED=true` and `DEMO_PASSWORD=sdi-demo-2026`
3. Launch the stack:
   ```sh
   just dev
   ```
   Or:
   ```sh
   docker compose up --build
   ```
4. Access the web interface at `http://localhost:5173`.

---

## 2. Remote sharing via Cloudflare Tunnel

For invited remote viewers on a personal domain (critique §4.3):

1. **Option A: Named Tunnel with Cloudflare Access (recommended):**
   - Create a named tunnel in the Cloudflare Zero Trust dashboard pointing to `http://localhost:5173`.
   - Set `CLOUDFLARE_TUNNEL_TOKEN` in `.env`.
   - Start the stack with the tunnel profile:
     ```sh
     docker compose --profile tunnel up
     ```
   - In Cloudflare Access, restrict the subdomain (`virtual-ta-demo.yourdomain.com`) to invited email addresses. The app automatically trusts the `Cf-Access-Authenticated-User-Email` header.
2. **Option B: In-app password gate:**
   - Set `DEMO_AUTH_ENABLED=true` and `DEMO_PASSWORD=<chosen-passcode>` in `.env`.
   - Run a quick tunnel:
     ```sh
     cloudflared tunnel --url http://localhost:5173
     ```
   - Viewers are prompted by the SDI-branded sign-in modal before entering the demo drawer.

---

## 3. Five-step demo presentation script

Follow this script during the demonstration. Each step highlights a core architectural capability.

### Step 1: Student logistics query (direct answers)

* **Persona:** Alex Chen (`demo_student`).
* **Active course:** FTT 101: Firearms Industry Fundamentals.
* **Current page:** Assignment: Safety Lab 1.
* **User action:** Click the suggestion chip or type:
  > _"When is Safety Lab 1 due?"_
* **Expected behavior:**
  - Virtual TA displays an animated tool status pill: `Calling: Checking upcoming assignments...` then `Checked: Checking upcoming assignments`.
  - Virtual TA responds directly with the exact deadline (e.g., Friday, December 5, 2026 at 11:59 PM MST).
  - A Canvas citation badge `[Assignment: Safety Lab 1]` appears below the message, linking to the Canvas assignment.
* **Talking points for SDI:**
  - Logistics questions (due dates, syllabus policies, office hours) receive fast, direct answers.
  - The model queries Canvas structure through typed adapters and never hallucinates deadlines.

### Step 2: Student course-material query (Socratic guidance)

* **Persona:** Alex Chen (`demo_student`).
* **Course setting:** `full` (default).
* **User action:** Click the suggestion chip or type:
  > _"I am stuck on firearm nomenclature and barrel twist. Can you just tell me the answer for question 2?"_
* **Expected behavior:**
  - The question classifier labels the input as course material.
  - The Virtual TA declines to hand over the direct solution. Instead, it offers a first-rung hint:
    > _"I can help you work through it! To understand how barrel twist rate affects projectile stability, think about what happens to a spinning top as it spins faster or slower. What role does rotational velocity play when a bullet leaves the rifled barrel?"_
* **Talking points for SDI:**
  - Socratic scaffolding prevents answer leakage while encouraging active student learning.
  - The student Virtual TA tracks conversation attempts and steps up hints incrementally.

### Step 3: Instructor changes course setting to `logistics_only`

* **User action:**
  1. In the top bar, switch the Persona to **Prof. Elena Martinez (Instructor)**.
  2. Click the gear icon (`⚙️`) in the drawer header to open **Course Settings (Staff)**.
  3. Notice the role badge confirms staff authorization (`course_navigation` placement).
  4. Select the radio option **Logistics Only**.
  5. The feedback banner confirms: `Course setting updated to Logistics Only.`
  6. Click `← Back to Drawer`, switch Persona back to **Alex Chen (Student)**, and ask:
     > _"Can you explain bullet kinetic energy?"_
* **Expected behavior:**
  - The Virtual TA immediately and politely declines:
    > _"Your instructor has configured this Virtual TA for course logistics only. I can answer questions about deadlines, assignments, and course policies, but for concept help please reach out to your instructor or visit office hours."_
  - Zero course content tools are executed.
* **Talking points for SDI:**
  - Instructors retain authoritative control over Virtual TA behavior on a per-course basis (critique §3.4).
  - This setting is enforced on the server, not in the browser.

### Step 4: Instructor looks up submission summaries and drafts announcements

* **User action:**
  1. Switch Persona back to **Prof. Elena Martinez (Instructor)**.
  2. Ask:
     > _"Which assignments are missing due dates?"_
* **Expected behavior:**
  - Tool indicator runs: `Scanning assignments without due dates...`.
  - Virtual TA lists the specific assignments in the course that have no due dates set.
* **User action:**
  > _"Summarize student submission stats for Safety Lab 1 and draft a reminder announcement."_
* **Expected behavior:**
  - Tool indicator runs: `Reviewing student submission stats...`.
  - Virtual TA summarizes submission counts (e.g., 22 submitted, 3 missing).
  - It drafts a clear, professional announcement ready for the instructor to post into Canvas.
* **Talking points for SDI:**
  - The instructor Virtual TA serves as an efficient teaching assistant (critique §3.14).
  - It is strictly read-only in v0: it drafts content for human review, never modifying grades or announcements automatically.
  - Student conversations are strictly isolated; instructors cannot read private student Virtual TA transcripts (critique §3.7).

### Step 5: Design language and accessibility highlights

* **Width constraint:**
  - Point out that the drawer runs in a fixed 320px frame, matching Canvas's official sidebar drawer (`top_navigation_placement`).
* **High contrast mode:**
  - Toggle the **High Contrast: ON** button in the host bar.
  - Show that text contrast increases to 21:1 (pure black on white) and the action buttons shift to high-contrast dark red (`#80001E`, 10.3:1 contrast against white).
* **WCAG 2.1 AA compliance:**
  - SDI Brand red (`#D50032`) is tested in CI to pass 5.42:1 on white and 4.52:1 on off-white (`#EDEAE6`).
* **Screen reader & keyboard:**
  - Highlight the non-intrusive `aria-live="polite"` region that announces streamed answers without interrupting the screen reader.
  - Demonstrate full keyboard navigation (<kbd>Tab</kbd>, <kbd>Enter</kbd> to send, <kbd>Shift</kbd>+<kbd>Enter</kbd> for newline).
* **Student privacy:**
  - Open **Account & Privacy** as a student, and demonstrate the **Clear My Conversation Data** button calling `DELETE /api/users/:userId/data`.

---

## 4. Resetting the demo state

After a demonstration session, run the reset command to clear conversations and restore default settings (critique §4.4):

```sh
just demo-reset
```
Or via pnpm:
```sh
pnpm demo:reset
```
Or click the **🔄 Reset Demo State** button directly in the demo host controls toolbar.

This performs two actions:
1. Deletes all stored messages and conversations from the persistence adapter.
2. Restores `sdi-ftt101` course setting back to `full` (Socratic assistance enabled).

---

## 5. Security, secrets hygiene, and rate limits

| Concern | Implementation in v0 |
| --- | --- |
| Canvas token safety | Held strictly server-side in Node.js memory. Never returned to browser or bundle. |
| Model provider keys | Kept in server environment (`.env`). Excluded from client bundles. |
| Log sanitization | Fastify/Pino logger redacts `authorization`, `x-canvas-token`, `body.message`, `body.password`, and cookies. |
| Student data exposure | Only synthetic sandbox data and test accounts (`demo_student`, `demo_instructor`, `demo_ta`) are used. |
| Gemini API limits | Gemini 2.5 Flash free tier allows 15 requests/min and 1,000,000 tokens/min. For high-volume multi-viewer demos, turn on pay-as-you-go billing covered by subscription credits (critique §3.9). |
