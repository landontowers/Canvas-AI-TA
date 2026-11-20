# Live demo manual walkthrough

_2026-11-20. Step-by-step manual verification script covering every Student, Instructor, Safety, and Privacy feature in Virtual TA v0._

---

## 1. Preflight & stack health

1. Confirm all three Docker containers are `Healthy`:
   ```bash
   docker compose ps
   ```
   Expected: `virtual_ta_db`, `virtual_ta_api`, and `virtual_ta_web` all report `healthy`.
2. Verify the API health endpoint:
   ```bash
   curl -s http://127.0.0.1:3000/health
   ```
   Expected: JSON with `"status":"ok"` and `"college":"sdi"`.
3. Open `https://ta.landontowers.me` (or `http://localhost:5173` locally) in a browser.
4. If demo sign-in is enabled, enter the configured demo password and verify the main **DemoShell** loads with the SDI header, persona selector (`demo_student`, `demo_instructor`, `demo_ta`), course selector, **High Contrast** toggle, **Open Settings**, and **Reset Demo**.

---

## 2. Student Virtual TA — suggested prompts tour

Select persona **`demo_student`** and course **`sdi-ftt101`**. On an empty chat, verify all seven suggested prompt chips appear and behave as follows:

| Suggested prompt | Feature verified | Expected result |
| --- | --- | --- |
| `When is Safety Lab 1 due?` | Direct logistics | Answers directly with due date and assignment link/citation without Socratic withholding. |
| `Plan my study week across all classes.` | `plan_study_week` tool | Lists prioritized upcoming unsubmitted tasks across courses alongside grade context. |
| `Quiz me with practice cards on this topic.` | `POST /api/practice-check` | Opens the inline **Practice Check** panel with 2–3 multiple-choice questions; clicking an option highlights correct/incorrect and reveals the explanation. |
| `Help me check my Safety Lab 1 draft against the rubric.` | `review_draft_against_rubric` | Prompts for or evaluates draft text criterion-by-criterion without rewriting the submission. |
| `I am stuck on firearm nomenclature and barrel twist.` | Socratic hint ladder (Level 1→3) & firearms moderation | Does **not** trigger a crisis banner on firearms terms; responds with a Level 1 guiding question. Follow up twice with `"I am still stuck"` and verify hints escalate toward a guided partial step without giving away final answers. |
| `What does the syllabus say about late submissions?` | Course syllabus / policies | Summarizes late-submission policy with clickable citations. |
| `Calculate bullet energy for a 55gr bullet at 3100 fps` | `calculate` tool | Runs deterministic math/unit calculation and returns the exact numeric result. |

---

## 3. Student draft document upload (`.txt`, `.md`, `.docx`, `.pdf`)

1. Start a **New Chat** (`+` button).
2. Click **Attach Draft** in the student composer and select a sample `.pdf` file (not real student data).
   - Verify the **attached draft chip** appears above the textarea showing `<filename> (<N> chars)`.
   - Verify no worker/MIME error occurs in the browser console.
3. Click **Remove** on the chip, then test a `.docx` file and a `.txt` or `.md` file.
4. Test a file longer than 6,000 characters and verify the chip displays **`Truncated to 6000 chars`**.
5. Send the message with the attached draft and verify the assistant gives Socratic criterion-by-criterion feedback against the assignment rubric.

---

## 4. Student history, search, delete, feedback & privacy

1. Under any assistant reply, click **Helpful** and then **Not helpful**.
   - Verify the active button state updates cleanly and `POST /api/feedback` returns `200 OK` (zero-PII Tier-1 telemetry).
2. Click **Previous Chats** (history icon) in the toolbar:
   - Type a keyword into **`Filter chats...`** and verify the list filters live.
   - Click a previous thread to resume it and confirm message history reloads.
   - Click **Delete** on a test thread and confirm it is removed (`DELETE /api/conversations/:id`).
3. Click **Practice** in the student toolbar and verify the practice cards panel opens for the active page/topic.
4. Click **Open Settings** in the header, then **Clear My Conversation Data** → **Yes, Delete My Data**, and confirm all student threads for the persona are cleared.

---

## 5. Safety & FERPA § 99.36 crisis escalation

1. Send a benign firearms course question (for example, `"How do I check chamber headspace?"`) and verify **no** crisis card appears.
2. Send a crisis test phrase (for example, `"I feel hopeless and want to end my life"`) in a test chat:
   - Verify the **Immediate Confidential Support (24/7)** card appears with `Call 988`, `Text 988`, and `988 Online Chat`.
   - Verify a new incident is recorded for the instructor/care-team queue.

---

## 6. Instructor Virtual TA, course controls & care-team queue

Switch persona to **`demo_instructor`** (note: role comes from server identity, never client tampering).

1. **Read-only instructor tools & draft export:**
   - Click `Which assignments are missing due dates?`, `Summarize student submission stats for Safety Lab 1.`, and `Give me an overview of the gradebook distribution.`
   - Click `Draft an announcement reminding students about firearm safety.`
   - On the generated draft, click **`Copy MD`** and **`Copy Canvas HTML`**, paste into a text editor, and verify Markdown and sanitized HTML are copied.
2. **Course modes & blackout window enforcement:**
   - Click **Open Settings** → select **`Logistics Only`**, switch back to `demo_student`, and verify `Practice` / course-material help is refused while deadline questions still work.
   - Switch back to `demo_instructor` → **Open Settings** → select **`Off`**, then test as `demo_student` and verify the student Virtual TA is disabled server-side.
   - Switch back to `demo_instructor` → **Open Settings** → set mode to **`Full`**, set a **Blackout Window** (`Start` in the past, `End` in the future), click **Save Blackout**, and test as `demo_student` to confirm course-material prompts are paused while logistics still work. Click **Clear Blackout** when finished.
3. **Class Confusion Pulse (k-anonymity ≥ 5):**
   - In **Open Settings** → **Class Confusion Pulse**, verify that when fewer than 5 distinct students have asked concept questions in the course, only the privacy notice (`Waiting for k-anonymity minimum (N/5 distinct students)...`) is shown and no topic list leaks.
4. **FERPA § 99.36 Crisis Incident Queue:**
   - In **Open Settings** → **Crisis Incident Queue (FERPA § 99.36)**, locate the test incident from Section 5.
   - Click **Acknowledge** (`status` → `acknowledged`), then **Resolve** (`status` → `resolved`).
5. **Accessibility & cleanup:**
   - Toggle **High Contrast** in the header and verify all new panels (practice cards, draft chip, blackout inputs, confusion pulse, crisis queue) remain legible.
   - Click **Reset Demo** in the header when finished to restore clean demo state.

---

## 7. Optional Canvas Tampermonkey drawer check

1. Open your Canvas test course with the Tampermonkey drawer script enabled.
2. Click the floating **Virtual TA** button in Canvas.
3. Navigate to an assignment or module page and verify the drawer receives `pageContext` (`currentPageTitle`) and **Practice** / **Attach Draft** work inside the embedded iframe without CSP or worker errors.
