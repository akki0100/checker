# Newtonite OpsPulse — Engineering Decisions & Architectural Trade-offs

## Executive Overview
Newtonite OpsPulse replaces ad-hoc spreadsheets, chat threads, and emails with an operational work coordination platform. When hundreds of employees handle urgent incidents, high-value payments, KYC compliance requests, and customer escalations, system correctness under pressure cannot rely on ideal user behavior.

Below are the **five core architectural decisions** made during the design and implementation of OpsPulse, detailing rationale, alternatives evaluated, and explicit trade-offs.

---

### Decision 1: Optimistic Concurrency Control (OCC) with Monotonic Version Counters
**Problem:** In a fast-moving operations environment, multiple team members open the same incident ticket simultaneously. If User A updates the description or priority while User B is composing notes based on an earlier version, traditional last-write-wins (LWW) silently overwrites User A’s critical updates.

**Solution:**
- Every `work_item` row maintains a monotonic integer `version` initialized at `1`.
- Any mutation (`PATCH /api/work-items/:id`, status transitions, approvals) requires the client to supply `expected_version`.
- Updates execute conditionally:
  ```sql
  UPDATE work_items
  SET title = ?, description = ?, version = version + 1, updated_at = datetime('now')
  WHERE id = ? AND version = ?;
  ```
- If `changes === 0`, the server rolls back and returns `409 Conflict` (`CONCURRENCY_CONFLICT`), accompanied by the latest database record and field diffs.
- The UI intercepts `409 Conflict` and presents an interactive **Conflict Resolution Modal**, allowing the operator to inspect what their teammate changed and reload the latest version without losing context.

**Trade-offs & Alternatives:**
- *Alternative Considered (Pessimistic DB Locks / WebSocket Heartbeat Locks):* Holding pessimistic row locks (`SELECT FOR UPDATE`) or lease locks prevents simultaneous edits, but fails when users leave browser tabs open, disconnect abruptly, or walk away, causing widespread operational gridlock.
- *Trade-off Accepted:* OCC requires clients to handle conflicts gracefully and retry if necessary, but maximizes read/write throughput and completely eliminates silent data corruption.

---

### Decision 2: Atomic Conditional Claim Guard Against Race Conditions
**Problem:** When a critical P0 incident enters the triage queue (e.g. payment duplicate charges or API latency spikes), multiple engineers or support leads rush to click "Claim" at the exact same fraction of a second. Under naive `SELECT` then `UPDATE` logic, two workers both see `assignee_id = NULL` and believe they claimed the ticket, leading to duplicate customer outreach or conflicting investigations.

**Solution:**
- Single-statement atomic conditional updates:
  ```sql
  UPDATE work_items
  SET assignee_id = :user_id,
      status = CASE WHEN status = 'TRIAGE' THEN 'INVESTIGATING' ELSE status END,
      version = version + 1,
      next_action = :next_action,
      updated_at = datetime('now')
  WHERE id = :id AND assignee_id IS NULL AND version = :expected_version;
  ```
- Because SQLite in WAL mode executes writes sequentially with immediate atomic consistency, exactly one worker’s query modifies the row (`changes === 1`).
- The second worker’s query modifies 0 rows, triggering an atomic `CLAIM_CONFLICT` (409) with the message: *"Work item was already claimed by [Winner Name] or modified concurrently."*

**Trade-offs & Alternatives:**
- *Alternative Considered (Distributed Redis Mutex):* Introduces external dependency, network latency, and lease-timeout edge cases for an internal operations tool.
- *Trade-off Accepted:* Relies on database ACID guarantees at the persistence layer, providing zero-overhead, strictly correct atomicity.

---

### Decision 3: Idempotency Key Guard for Network Retries & Double-Clicks
**Problem:** Operational workflows involve high-stakes actions: initiating a €54,000 batch refund investigation, escalating an incident, or logging compliance holds. In high-pressure scenarios or on shaky mobile/VPN connections, users frequently double-click buttons or client HTTP libraries automatically retry on transient socket drops. Without deduplication, duplicate work items or duplicate audit entries flood the system.

**Solution:**
- The client generates a unique `Idempotency-Key: <uuid>` on sensitive state-altering actions (`POST /api/work-items`, approvals, state transitions).
- Middleware stores `(key, user_id, endpoint, request_hash, status, response_code, response_body)`.
- **Two-phase state machine:**
  1. If key is new: status set to `PROCESSING`.
  2. If an identical key arrives while `PROCESSING`: returns `409 Conflict` (`IDEMPOTENCY_IN_FLIGHT`).
  3. Once business logic completes: stores response body/code and marks `COMPLETED`.
  4. Subsequent replays return the cached response with `X-Idempotent-Replay: true` header without re-executing logic or creating duplicate audit rows.
  5. If the same key is reused with a different request payload, the request is rejected with `422 Unprocessable Entity` (`IDEMPOTENCY_CONFLICT`).

**Trade-offs & Alternatives:**
- *Trade-off Accepted:* Slight storage overhead for idempotency logs (cleaned up via background TTL). In exchange, sensitive operations become completely safe against duplicate triggers.

---

### Decision 4: Server-Enforced RBAC with Segregation of Duties Workflow Gates
**Problem:** Newtonite spans multiple teams: Customer Operations, Engineering, Payments & Financial Risk, Trust & Compliance, and Global Ops. Hiding UI buttons is insufficient for security; the API must strictly enforce domain authorization rules and workflow gates. Specifically:
- A tier-1 support agent cannot approve their own or another team's financial disbursement.
- Items requiring formal sign-off cannot bypass `PENDING_APPROVAL` to `RESOLVED`.
- Only owning Team Leads or System Admins can authorize sensitive actions.

**Solution:**
- Express middleware resolves authenticated persona (`x-user-id` header).
- Domain permission rules (`canClaimItem`, `canApprove`, `canTransitionStatus`) validate:
  1. **Role capability:** Must be `LEAD` or `ADMIN` to approve.
  2. **Team ownership:** Marcus Vance (Payments Lead) can approve payments items; Sarah Jenkins (Eng Lead) can approve engineering incidents; Elena Rostova (Compliance Lead) can approve KYC holds. Cross-team approval is blocked unless user is `ADMIN`.
  3. **Segregation of Duties:** The creator of a P0 critical item cannot serve as the sole approver for that same item.
  4. **State Machine Invariant:** Attempting to transition from `PENDING_APPROVAL` directly to `RESOLVED` without `approval_status === 'APPROVED'` returns `403 Forbidden` (`WORKFLOW_VIOLATION`).

**Trade-offs & Alternatives:**
- *Alternative Considered (Client-only role filtering):* Trivially circumvented via direct curl/Postman calls.
- *Trade-off Accepted:* Centralized policy enforcement in backend domain services ensures zero unauthorized state drift.

---

### Decision 5: Transactional Outbox Pattern for Secondary Work & Asynchronous Resilience
**Problem:** Secondary actions—evaluating SLA breaches, sending notification alerts to Slack/email, syncing downstream audit search indexes, or calling third-party webhooks—must not block the primary HTTP transaction. If an external notification webhook times out or crashes, the user's primary action (claiming an issue or updating status) must not fail.

**Solution:**
- Integrated **Transactional Outbox Table** (`outbox_jobs`).
- Inside the *same atomic database transaction* as the work item update, an outbox job is enqueued (`PENDING`).
- An asynchronous worker processes outbox batches:
  - Updates SLA breach counters (`ON_TRACK` -> `AT_RISK` -> `BREACHED`).
  - Simulates notification dispatch.
  - Implements **exponential backoff retries** (`attempts < max_attempts`).
  - Jobs that fail 3 times are moved to `DEAD_LETTER` queue for operator inspection without stalling other operations.
  - An interactive **Outbox Monitor Modal** provides live queue counts, manual worker trigger, and dead-letter replay.

**Trade-offs & Alternatives:**
- *Alternative Considered (Direct synchronous external calls in request handler):* High latency, couples primary user workflows to third-party availability.
- *Trade-off Accepted:* Eventual consistency for notifications (seconds delay) in exchange for bulletproof primary transaction reliability.

---

## What Was Intentionally Not Built (Pragmatic Scope Control)
1. **Full OAuth2 / SSO Identity Provider Infrastructure:**
   - Instead of spinning up Keycloak/Auth0, we built an instantaneous **Persona Switcher** with 5 realistic role personas (`LEAD`, `AGENT`, `ADMIN` across Eng, Payments, Compliance, Support). This allows reviewers to verify RBAC gates in seconds directly in the UI without tedious login/logout cycles.
2. **External Redis / Kafka Distributed Cluster:**
   - Instead of requiring Docker or daemon setups for the evaluation, we utilized SQLite in WAL mode with embedded transactional outbox queues. This provides true ACID transactions, serial write isolation, and immediate zero-setup execution.
3. **Complex Markdown WYSIWYG Editor:**
   - Simple text inputs with clean typography prioritize responsive operational triage over decorative formatting.

---

## Verification & Automated Test Strategy
The test suite in `server/tests/` explicitly verifies the critical non-CRUD failure modes:
1. `occ.test.ts`: Verifies rejection with `409 Conflict` on stale version submissions and clean version progression on valid matches.
2. `race_claim.test.ts`: Fires two concurrent claims via `Promise.all` at the exact same millisecond; asserts strictly one 200 winner and one 409 conflict rejection.
3. `idempotency.test.ts`: Asserts duplicate HTTP submissions with the same idempotency key return cached responses with `X-Idempotent-Replay: true` without duplicate work items or audit entries.
4. `rbac_gates.test.ts`: Proves agents cannot approve; cross-team leads cannot approve; and unapproved items cannot be marked resolved.
5. `outbox.test.ts`: Verifies outbox job completion, retry counter increments, exponential backoff, and transition to `DEAD_LETTER` state.
