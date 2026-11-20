# Developer guide: setting up and using the Virtual TA demo

This guide walks a developer through configuring, running, using, and verifying the Virtual TA v0 local demo for Sonoran Desert Institute (SDI) (critique §4).

---

## 1. Overview and architecture

Virtual TA v0 is a Socratic Virtual TA built into the Canvas LMS sidebar drawer. A single engine serves two assistants with strict separation of access and instruction harnesses (critique §3.14):

- **Student Virtual TA (`virtual_ta.student`):** guides students through course concepts Socratically with hint ladders, and answers course logistics (schedules, syllabi, policies) directly.
- **Instructor Virtual TA (`virtual_ta.instructor`):** provides course staff with a direct, read-only teaching assistant to summarize submissions, locate undated assignments, and draft announcements.

### Repository structure (hexagonal architecture)

The codebase strictly enforces ports and adapters via automated dependency checks (critique §3.12):

```
Canvas-AI-TA/
├── packages/
│   ├── core/       # Pure domain models, ports, harness profiles, policies (ZERO vendor SDKs)
│   └── adapters/   # Canvas REST, Gemini, Drizzle PostgreSQL, mathjs, contract tests, evals
├── apps/
│   ├── api/        # Fastify REST & SSE streaming server, role guards, secrets redaction
│   └── web/        # React + Instructure/SDI themed 320px Canvas sidebar drawer
└── doc/            # Architecture critique, implementation plan, walkthrough, developer guide
```

---

## 2. Prerequisites and toolchain

Ensure the following tools are installed on your workstation:

| Tool | Minimum version | Purpose |
| --- | --- | --- |
| **Node.js** | `>= 22.0.0` (v26 tested) | Runtime environment |
| **pnpm** | `>= 10.0.0` (v12.21 tested) | Workspace package manager |
| **Docker & Compose** | `>= 24.0.0` (Compose v2.27+ tested) | Local database and container stack |
| **just** | `>= 1.30.0` | Command runner for development recipes |

To install `just` and `pnpm` if missing:
```bash
# Install pnpm
corepack enable && corepack prepare pnpm@latest --activate

# Install just (Linux)
curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash -s -- --to ~/.local/bin
```

---

## 3. Environment configuration and running modes

1. Copy `template.env` to `.env`:
   ```bash
   cp template.env .env
   ```
   > [!IMPORTANT]
   > `.env` is gitignored. Never commit or print real tokens or API keys (critique §4.4).

2. Choose your operating mode in `.env`:

### Mode A: 100% offline development (default)
Requires zero external keys or internet access. Uses synthetic fixtures and in-process mock adapters.
```ini
MODEL_PROVIDER=fake
CANVAS_BASE_URL=https://classroom.sdi.edu
CANVAS_ACCESS_TOKEN=mock-dev-token
DEMO_AUTH_ENABLED=false
```

### Mode B: Live Gemini AI generation
Uses Google Gemini 3.8 Flash on a personal Google account for development and demo (critique §3.9). Send synthetic sandbox data only.
```ini
MODEL_PROVIDER=gemini
GEMINI_API_KEY=your_google_ai_studio_api_key_here
# Optional model overrides (defaults to gemini-3.8-flash):
# STUDENT_MODEL=gemini-3.8-flash
# INSTRUCTOR_MODEL=gemini-3.8-flash
# CLASSIFIER_MODEL=gemini-3.8-flash
```

### Mode C: Protected remote demo sharing
Requires a passcode or Cloudflare Access email to access the demo (critique §4.3).
```ini
DEMO_AUTH_ENABLED=true
DEMO_PASSWORD=sdi-demo-2026
DEMO_INVITED_EMAILS=evaluator@sdi.edu,guest@sdi.edu
```

### Mode D: Hybrid live Canvas identity with fake course data (Approach 1)
Validates identity and masquerading against a live Canvas instance, but keeps all course material sent to the AI model strictly synthetic (protecting FERPA and proprietary curriculum per critique §3.1 and §4.4):
```ini
CANVAS_BASE_URL=https://classroom.sdi.edu
CANVAS_ACCESS_TOKEN=your_personal_access_token_here
CANVAS_USE_FAKE_COURSE_DATA=true

# Masquerade target IDs for your live Canvas test accounts:
DEMO_STUDENT_ID=your_test_student_canvas_id
DEMO_INSTRUCTOR_ID=your_instructor_canvas_id
```

---

## 4. Running the demo stack

### Method 1: Docker Compose (recommended full-stack)

Starts PostgreSQL (port 5432), the Fastify API (host port 3001), and Nginx/Web (port 5173):

```bash
just dev
```
Or directly with Docker Compose:
```bash
docker compose up --build
```

- **Web UI:** [http://localhost:5173](http://localhost:5173)
- **API Health Check:** [http://localhost:3001/health](http://localhost:3001/health)
- **Demo Config:** [http://localhost:3001/api/config/demo](http://localhost:3001/api/config/demo)

To shut down the containers:
```bash
just dev-down
```

### Method 2: Local process development (fast reloads)

For active frontend or API editing without Docker rebuilds:

1. Start PostgreSQL:
   ```bash
   docker compose up -d db
   ```
2. Run database migrations and seed sandbox course:
   ```bash
   just db-migrate && just db-seed
   ```
3. Start the API server in terminal 1:
   ```bash
   pnpm --filter @virtual-ta/api dev
   ```
4. Start the Vite development server in terminal 2:
   ```bash
   pnpm --filter @virtual-ta/web dev
   ```

---

## 5. Using the demo interface

Open your browser to [http://localhost:5173](http://localhost:5173). The interface consists of two sections:

1. **Top control bar (Canvas host simulation):** controls persona masquerading, simulated course pages, high-contrast mode, and state resets.
2. **Main 320px Canvas frame:** styled to the exact dimensions and theme of Canvas LMS's `top_navigation` sidebar drawer (critique §3.13, §4.5).

### Persona switching

| Persona | Name | Role | Access & Behavior |
| --- | --- | --- | --- |
| `demo_student` | Alex Chen | Student | Socratic guidance on course concepts, direct answers for due dates and syllabus. Student grades and own submissions only. |
| `demo_instructor` | Prof. Elena Martinez | Instructor | Direct assistant for drafting announcements, reviewing submission stats, and scanning undated assignments. Strictly read-only. |
| `demo_ta` | Jordan Lee | Teaching Assistant | Course staff assistance matching instructor permissions. |

### Simulating Canvas page context (`lti.getPageContent`)

In Canvas, the sidebar drawer knows which page the student is currently viewing. In the demo, select from the **Current Canvas Page** dropdown:
- **Assignment: Safety Lab 1:** simulates being on the lab assignment page.
- **Module 1: Firearm Safety & Nomenclature:** simulates viewing course modules.
- **Course Syllabus:** simulates reading course policies.
- **Announcement: Welcome to FTT 101:** simulates viewing announcements.

### Key demo workflows

#### 1. Ask a logistics question (Student)
- Select **Alex Chen (Student)**.
- Click the suggestion chip: _"When is Safety Lab 1 due?"_
- Notice the tool pill: `Calling: Checking upcoming assignments...`.
- The Virtual TA provides the exact deadline and attaches a Canvas citation badge linking to the assignment.

#### 2. Seek concept help (Socratic hint ladder)
- Select **Alex Chen (Student)**.
- Type: _"What is barrel twist rate and can you give me the answer for question 2?"_
- The Virtual TA declines to give the answer and instead provides a guiding hint to stimulate critical thinking.

#### 3. Enforce `logistics_only` mode (Instructor control)
- Switch to **Prof. Elena Martinez (Instructor)**.
- Click the gear icon (`⚙️`) in the header to open **Course Settings (Staff)**.
- Change the setting from **Full Virtual TA (Default)** to **Logistics Only**.
- Return to the drawer (`💬`), switch back to **Alex Chen (Student)**, and ask a course concept question.
- The Virtual TA politely declines: _"Your instructor has configured this Virtual TA for course logistics only..."_ and executes zero course content tools.

#### 4. Audit assignments and draft announcements (Instructor)
- Switch to **Prof. Elena Martinez (Instructor)**.
- Ask: _"Which assignments are missing due dates?"_
- Ask: _"Summarize student submission stats for Safety Lab 1 and draft a reminder announcement."_
- The Virtual TA reviews gradebook data and prepares a draft for the instructor to post.

#### 5. High-contrast mode & accessibility
- Click the **👁 High Contrast** button in the host bar.
- Notice the theme immediately shifts to high-contrast tokens: pure black text (21:1 on white) and dark red action accents (`#80001E`, 10.3:1 on white).
- All streamed responses are announced to screen readers via an `aria-live="polite"` region.
- The entire drawer supports keyboard navigation (<kbd>Enter</kbd> to submit, <kbd>Shift</kbd>+<kbd>Enter</kbd> for newline).

#### 6. Student data deletion ("clear my data")
- As a student, click the gear icon (`⚙️`) to open **Account & Privacy**.
- Click **Clear My Conversation Data** and confirm.
- Stored chat transcripts are erased from the persistence store via `DELETE /api/users/:userId/data`.

---

## 6. Resetting the demo state

After completing a demo or test session, reset the database to clean baseline settings (critique §4.4):

```bash
just demo-reset
```
Or via pnpm:
```bash
pnpm demo:reset
```
Or click the **🔄 Reset Demo State** button in the top demo control bar.

This action:
1. Deletes all conversation messages and sessions.
2. Restores `sdi-ftt101` course setting back to `full` (Socratic assistance enabled).

---

## 7. Remote sharing via Cloudflare Tunnel

To present the demo to remote stakeholders securely without port forwarding (critique §4.3):

1. **Using Docker Compose:**
   - Retrieve your Cloudflare Tunnel token from Cloudflare Zero Trust.
   - Add `CLOUDFLARE_TUNNEL_TOKEN=<token>` to `.env`.
   - Start the stack with the tunnel profile:
     ```bash
     docker compose --profile tunnel up
     ```
2. **Using Cloudflare quick-tunnel (ad-hoc):**
   ```bash
   cloudflared tunnel --url http://localhost:5173
   ```
3. **Restricting access:**
   - In Cloudflare Access, restrict your subdomain (`virtual-ta-demo.yourdomain.com`) to invited email addresses. The backend automatically trusts the `Cf-Access-Authenticated-User-Email` header.
   - Or set `DEMO_AUTH_ENABLED=true` and `DEMO_PASSWORD=<passcode>` in `.env` to require password sign-in.

---

## 8. Verification and quality gates

Before submitting changes, run the automated verification checks (critique §8, plan Phase 1):

```bash
just check
```
This runs the complete quality suite:
1. `pnpm typecheck`: Strict TypeScript typechecking across all 4 packages/apps.
2. `pnpm lint`: ESLint verification.
3. `pnpm dep-check`: Dependency-cruiser architecture boundary checks (ensuring `packages/core` never imports adapters or vendor SDKs).
4. `pnpm test:coverage`: Vitest test suite with `@vitest/coverage-v8` (unit, WCAG AA contrast, contract, and server role-permission tests).

### Running the evaluation suite
Run the 60-case Socratic and instructor evaluation suite against baseline results (plan Phase 3):
```bash
just eval
```

### Running theme contrast tests alone
Verify WCAG 2.1 AA/AAA contrast ratios for SDI design tokens (critique §3.13):
```bash
pnpm vitest run apps/web/src/theme/contrast.test.ts
```

---

## 9. Troubleshooting and FAQ

- **Port 3000 conflict:** Host port 3000 may be used by another service on your machine. The local stack maps API port to `3001` via `API_PORT=3001` in `.env`.
- **pnpm build scripts ignored:** If pnpm skips building native binaries (`esbuild`), run:
  ```bash
  pnpm approve-builds --all && pnpm install
  ```
- **Gemini quota limits:** On the free tier, Gemini Flash limits requests to 15 RPM. If running multi-user demos, upgrade to pay-as-you-go covered by subscription credits (critique §3.9).
