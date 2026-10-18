# Newtonite OpsPulse — Resilient Operational Coordination System

> **Newtonite Software Engineering Assessment | Operations Under Pressure**  
> A high-reliability operational coordination platform designed to eliminate chaos, duplicate work, and stale-write hazards across fast-growing multi-team organizations.

---

## 🌟 Why OpsPulse?

When a company scales from 20 to hundreds of employees, coordinating operational requests via Slack threads, shared spreadsheets, and email causes critical failures:
1. **Accidental Race Conditions:** Two employees start resolving the same customer outage or payment incident without realizing it.
2. **Stale Overwrite Hazards:** One employee saves edits while another views an outdated snapshot, silently destroying teammate work.
3. **Lost Approvals & Invariants:** High-stakes items (e.g. €54,000 duplicate charge refunds or sanctions holds) bypass compliance reviews or get lost in message threads.
4. **Retry Storms & Double Execution:** Impatient double-clicks or unstable connections create duplicate payouts or duplicate tickets.

**Newtonite OpsPulse solves all of these problems with domain-enforced correctness.**

---

## 🏛️ Architecture Overview

```
                     ┌───────────────────────────────────────────────┐
                     │          Vite + React 19 Client               │
                     │  - Modern Dark-Slate Glassmorphic Dashboard   │
                     │  - 1-Click Multi-Team Persona Switcher        │
                     │  - Live Concurrency & Resilience Lab          │
                     │  - Interactive OCC Conflict Diff Resolver     │
                     └───────────────────────┬───────────────────────┘
                                             │ HTTP REST + Idempotency-Key
                                             ▼
                     ┌───────────────────────────────────────────────┐
                     │             Express API Layer                 │
                     │  - Auth & Persona Resolver (x-user-id)        │
                     │  - Idempotency Middleware (SHA-256 Hash TTL)  │
                     │  - RBAC & Segregation of Duties Engine        │
                     │  - State Machine Workflow Gate Validator      │
                     └───────────────────────┬───────────────────────┘
                                             │ Atomic Transactions
                                             ▼
                     ┌───────────────────────────────────────────────┐
                     │            SQLite Database (WAL Mode)         │
                     │  - work_items (with monotonic version counter)│
                     │  - audit_events (immutable chronological log) │
                     │  - idempotency_keys (two-phase execution lock)│
                     │  - outbox_jobs (transactional outbox table)   │
                     └───────────────────────┬───────────────────────┘
                                             │ Background Polling
                                             ▼
                     ┌───────────────────────────────────────────────┐
                     │        Async Outbox Background Worker         │
                     │  - SLA Monitor (Breach detection)             │
                     │  - Notification Dispatch                      │
                     │  - Exponential Backoff & Dead-Letter Queue    │
                     └───────────────────────────────────────────────┘
```

---

## 🚀 Quickstart

### Prerequisites
- Node.js v18+ (tested on Node v20/v24)
- npm v9+

### 1. Installation
```bash
npm install
```

### 2. Run Application (Single Command)
Starts both the backend API server (`http://localhost:4000`) and the Vite frontend (`http://localhost:5173`):
```bash
npm run dev
```

Open **`http://localhost:5173`** in your browser.

### 3. Run Automated Tests
Executes the comprehensive Vitest test suite testing OCC, atomic race conditions, idempotency deduplication, RBAC rules, and the transactional outbox:
```bash
npm test
```

---

## 🔬 Critical Engineering Scenarios (Beyond Simple CRUD)

OpsPulse provides a built-in **"⚡ Concurrency Lab"** button directly in the navbar for the reviewer to test these scenarios interactively:

### 1. Optimistic Concurrency Control (OCC 409 Conflict)
- Every work item carries an integer `version` (starts at `v1`, increments on every mutation).
- When a client sends a modification, it submits `expected_version`.
- If another user modified the ticket first, the server rolls back and returns **`409 Conflict`** with the latest server state.
- **In the UI:** The app displays the **Conflict Resolution Modal**, showing the version diff and offering a clean reload without losing work.

### 2. Atomic Race Condition Defense (Claim Collisions)
- Two workers attempting to claim the same unassigned incident simultaneously execute:
  ```sql
  UPDATE work_items
  SET assignee_id = :user, version = version + 1
  WHERE id = :id AND assignee_id IS NULL AND version = :v;
  ```
- Exactly one worker succeeds (`200 OK`). The second worker receives an atomic **`409 Conflict: Already claimed by [Other User]`**.
- **In the UI:** Click **"⚡ Concurrency Lab"** → **"1. Atomic Claim Race"** → Click **"Fire 2 Simultaneous Requests"** to watch the parallel race resolution in real time.

### 3. Idempotency Key Deduplication Guard
- Every sensitive mutation sends an `Idempotency-Key: <uuid>` header.
- If network drops or a user double-clicks, the second request returns the cached result with `X-Idempotent-Replay: true` header without creating duplicate items or audit entries.
- Reusing a key with a altered payload is rejected with `422 Unprocessable Entity`.

### 4. Server-Enforced RBAC & Approval Invariants
- High-stakes items (e.g. €54,000 EU refund duplicate charge `OPS-1001`) have `requires_approval = 1`.
- Standard support agents or leads from other teams cannot authorize payment sign-offs.
- Only Marcus Vance (**Payments Lead**) or an **Admin** can approve.
- Items cannot bypass `PENDING_APPROVAL` directly to `RESOLVED` without signed sign-off.
- **In the UI:** Use the top-right **Persona Switcher** to switch between **Sarah Jenkins** (Eng Lead), **Marcus Vance** (Payments Lead), **Elena Rostova** (Compliance Lead), and **Priya Patel** (Support Agent) to observe real-time authorization behavior.

### 5. Transactional Outbox with Exponential Backoff & Dead-Letter Queue
- Secondary work (SLA surveillance, notifications, external webhooks) is written to `outbox_jobs` in the *same atomic transaction* as the primary ticket update.
- Background worker processes jobs asynchronously with exponential backoff retries (`5s`, `10s`, `20s`).
- Jobs failing 3 times transition to `DEAD_LETTER` queue without crashing the system.
- **In the UI:** Click the **"Outbox Worker"** pill in the navbar to inspect live queue counts, trigger worker ticks, or simulate webhook delivery failure.

---

## 👥 Built-in Realistic Test Personas

Use the dropdown in the top-right header to switch personas instantly:

| Persona | Role | Owning Team | Permissions Highlights |
|---|---|---|---|
| **Sarah Jenkins** | `LEAD` | Engineering | Incident Commander. Can triage and resolve outages, claim items, view cross-team tickets. |
| **Marcus Vance** | `LEAD` | Payments & Fraud | Financial Crime Lead. Sole authorized approver for payment reversal item `OPS-1001`. |
| **Elena Rostova** | `LEAD` | Compliance & Trust | Director of Compliance. Authorized approver for KYC sanctions clearance `OPS-1003`. |
| **Priya Patel** | `AGENT` | Customer Support | Tier 2 Specialist. Can triage and claim customer tickets, cannot approve financial releases. |
| **Alex Rivera** | `ADMIN` | Global Operations | Full administrative override across all teams and approval gates. |

---

## 📊 Pre-Seeded Realistic Work Items

| ID | Title | Category | Priority | Initial State | Key Workflow Invariant |
|---|---|---|---|---|---|
| **OPS-1001** | Duplicate charge spike on EU Stripe connector | Payment Investigation | `P0 Critical` | `PENDING_APPROVAL` | €54k exposure. Blocked until Marcus Vance (Payments Lead) signs off. |
| **OPS-1002** | Checkout API 504 Gateway Timeouts in US-East | Incident | `P0 Critical` | `INVESTIGATING` | Active latency outage owned by Sarah Jenkins. |
| **OPS-1003** | High-Net-Worth customer sanctions screening false positive | Compliance Request | `P1 High` | `PENDING_APPROVAL` | $2.4M escrow hold. Requires Elena Rostova (Compliance Lead) approval. |
| **OPS-1004** | Enterprise SSO certificate expiration warning | Customer Escalation | `P1 High` | `TRIAGE` (Unassigned) | Ideal for testing atomic claim race conditions! |
| **OPS-1005** | Off-hours database partition reindexing approval | Ops Approval | `P2 Medium` | `TRIAGE` (Unassigned) | Scheduled maintenance window approval. |
| **OPS-1006** | Webhook delivery backpressure during load test | Incident | `P2 Medium` | `RESOLVED` | Completed historical incident with complete audit history. |

---

## 🧪 Automated Test Suite

Run all tests:
```bash
npm test
```

Test files located in `server/tests/`:
- `server/tests/occ.test.ts` (OCC 409 conflict detection and stale write defense)
- `server/tests/race_claim.test.ts` (Atomic claim race condition with Promise.all)
- `server/tests/idempotency.test.ts` (Duplicate request deduplication and replay headers)
- `server/tests/rbac_gates.test.ts` (Role-based access boundaries and approval invariants)
- `server/tests/outbox.test.ts` (Transactional outbox retries, exponential backoff, dead-letter state)

---

## 📄 Documentation

- [ENGINEERING_DECISIONS.md](file:///Users/akashbhati/Downloads/newtonite/ENGINEERING_DECISIONS.md): In-depth discussion of the 5 architectural decisions, trade-offs, and what was intentionally not built.
