import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../ops_pulse.db');

// Ensure parent dir exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(DB_PATH);

// Configure SQLite for high-concurrency production reliability
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      color TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL, -- 'AGENT' | 'LEAD' | 'ADMIN'
      team_id TEXT NOT NULL,
      title TEXT NOT NULL,
      avatar_url TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (team_id) REFERENCES teams(id)
    );

    CREATE TABLE IF NOT EXISTS work_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      team_id TEXT NOT NULL,
      assignee_id TEXT,
      created_by_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      requires_approval INTEGER NOT NULL DEFAULT 0,
      approval_status TEXT NOT NULL DEFAULT 'NONE',
      approval_by_id TEXT,
      approval_note TEXT,
      sla_deadline TEXT NOT NULL,
      sla_status TEXT NOT NULL DEFAULT 'ON_TRACK',
      impact_summary TEXT NOT NULL,
      next_action TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (team_id) REFERENCES teams(id),
      FOREIGN KEY (assignee_id) REFERENCES users(id),
      FOREIGN KEY (created_by_id) REFERENCES users(id),
      FOREIGN KEY (approval_by_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      work_item_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      action_type TEXT NOT NULL,
      from_version INTEGER NOT NULL,
      to_version INTEGER NOT NULL,
      changes_json TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (work_item_id) REFERENCES work_items(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS work_item_comments (
      id TEXT PRIMARY KEY,
      work_item_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      is_internal INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (work_item_id) REFERENCES work_items(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      status TEXT NOT NULL, -- 'PROCESSING' | 'COMPLETED'
      response_code INTEGER,
      response_body TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS outbox_jobs (
      id TEXT PRIMARY KEY,
      job_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      error_message TEXT,
      scheduled_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_work_items_status ON work_items(status);
    CREATE INDEX IF NOT EXISTS idx_work_items_team ON work_items(team_id);
    CREATE INDEX IF NOT EXISTS idx_work_items_assignee ON work_items(assignee_id);
    CREATE INDEX IF NOT EXISTS idx_audit_item ON audit_events(work_item_id);
    CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox_jobs(status, scheduled_at);
  `);

  seedDataIfEmpty();
}

export function seedDataIfEmpty() {
  const insertTeam = db.prepare(`
    INSERT OR IGNORE INTO teams (id, name, slug, description, color) VALUES (?, ?, ?, ?, ?)
  `);

  const teams = [
    { id: 'team_eng', name: 'Engineering & Infrastructure', slug: 'engineering', description: 'Core platform, stability, bug fixes and outages', color: '#3B82F6' },
    { id: 'team_payments', name: 'Payments & Financial Fraud', slug: 'payments', description: 'Chargebacks, payment gateway anomalies, payouts', color: '#10B981' },
    { id: 'team_compliance', name: 'Trust & Compliance', slug: 'compliance', description: 'KYC sanctions, regulatory audits, user data holds', color: '#8B5CF6' },
    { id: 'team_support', name: 'Customer Operations (Tier 2)', slug: 'support', description: 'VIP escalations and complex customer investigations', color: '#F59E0B' },
    { id: 'team_ops', name: 'Global Operations & Admin', slug: 'operations', description: 'Company-wide coordination and escalation triage', color: '#EC4899' },
  ];

  teams.forEach(t => insertTeam.run(t.id, t.name, t.slug, t.description, t.color));

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, name, email, role, team_id, title, avatar_url) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const users = [
    {
      id: 'usr_sarah',
      name: 'Sarah Jenkins',
      email: 'sarah.jenkins@newtonite.internal',
      role: 'LEAD',
      team_id: 'team_eng',
      title: 'Incident Commander & Principal Eng',
      avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=face',
    },
    {
      id: 'usr_marcus',
      name: 'Marcus Vance',
      email: 'marcus.vance@newtonite.internal',
      role: 'LEAD',
      team_id: 'team_payments',
      title: 'Head of Financial Crime & Risk',
      avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
    },
    {
      id: 'usr_elena',
      name: 'Elena Rostova',
      email: 'elena.rostova@newtonite.internal',
      role: 'LEAD',
      team_id: 'team_compliance',
      title: 'Director of Legal & Compliance',
      avatar_url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&h=150&fit=crop&crop=face',
    },
    {
      id: 'usr_priya',
      name: 'Priya Patel',
      email: 'priya.patel@newtonite.internal',
      role: 'AGENT',
      team_id: 'team_support',
      title: 'Senior Escalation Specialist',
      avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face',
    },
    {
      id: 'usr_alex',
      name: 'Alex Rivera',
      email: 'alex.rivera@newtonite.internal',
      role: 'ADMIN',
      team_id: 'team_ops',
      title: 'Operations Director',
      avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=face',
    },
    {
      id: 'usr_david',
      name: 'David Zhang',
      email: 'david.zhang@newtonite.internal',
      role: 'AGENT',
      team_id: 'team_eng',
      title: 'Site Reliability Engineer',
      avatar_url: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&h=150&fit=crop&crop=face',
    },
  ];

  users.forEach(u => insertUser.run(u.id, u.name, u.email, u.role, u.team_id, u.title, u.avatar_url));

  const insertItem = db.prepare(`
    INSERT OR IGNORE INTO work_items (
      id, title, description, category, status, priority, team_id, assignee_id,
      created_by_id, version, requires_approval, approval_status, approval_by_id,
      approval_note, sla_deadline, sla_status, impact_summary, next_action, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAudit = db.prepare(`
    INSERT OR IGNORE INTO audit_events (
      id, work_item_id, actor_id, actor_name, action_type, from_version, to_version, changes_json, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertComment = db.prepare(`
    INSERT OR IGNORE INTO work_item_comments (id, work_item_id, user_id, content, is_internal, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const now = new Date();
  const in30Mins = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  const in2Hours = new Date(now.getTime() + 2 * 3600 * 1000).toISOString();
  const in6Hours = new Date(now.getTime() + 6 * 3600 * 1000).toISOString();
  const past20Mins = new Date(now.getTime() - 20 * 60 * 1000).toISOString();

  const seedItems = [
    {
      id: 'OPS-1001',
      title: 'Duplicate charge spike on EU Stripe connector',
      description: 'Automated monitoring detected 42 customer accounts billed twice during the 08:30 UTC batch run. Total flagged exposure is approx €54,000. Customer support is receiving inbound tickets.',
      category: 'PAYMENT_INVESTIGATION',
      status: 'PENDING_APPROVAL',
      priority: 'P0_CRITICAL',
      team_id: 'team_payments',
      assignee_id: 'usr_marcus',
      created_by_id: 'usr_priya',
      version: 3,
      requires_approval: 1,
      approval_status: 'PENDING',
      approval_by_id: null,
      approval_note: null,
      sla_deadline: in30Mins,
      sla_status: 'AT_RISK',
      impact_summary: '€54,000 duplicate charge across 42 enterprise accounts',
      next_action: 'Requires sign-off from Marcus Vance (Finance Lead) before executing batch reversal refund',
      created_at: new Date(now.getTime() - 90 * 60 * 1000).toISOString(),
      updated_at: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
    },
    {
      id: 'OPS-1002',
      title: 'Checkout API 504 Gateway Timeouts in US-East',
      description: 'P99 latency spiked from 120ms to 4.8s following database connection pool exhaustion on replica cluster 4. Payment processing rate dropped by 18%.',
      category: 'INCIDENT',
      status: 'INVESTIGATING',
      priority: 'P0_CRITICAL',
      team_id: 'team_eng',
      assignee_id: 'usr_sarah',
      created_by_id: 'usr_david',
      version: 2,
      requires_approval: 0,
      approval_status: 'NONE',
      approval_by_id: null,
      approval_note: null,
      sla_deadline: in2Hours,
      sla_status: 'ON_TRACK',
      impact_summary: '18% drop in checkout conversion across North America',
      next_action: 'Sarah Jenkins is verifying memory leak in connection pooler after recycling pods',
      created_at: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
      updated_at: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
    },
    {
      id: 'OPS-1003',
      title: 'High-Net-Worth customer sanctions screening false positive',
      description: 'Apex Capital onboarding flagged under OFAC watchlist automated fuzzy-match. Legal counsel verified company registration differs from designated entity. Requires compliance director sign-off to unblock funds.',
      category: 'COMPLIANCE_REQUEST',
      status: 'PENDING_APPROVAL',
      priority: 'P1_HIGH',
      team_id: 'team_compliance',
      assignee_id: 'usr_elena',
      created_by_id: 'usr_priya',
      version: 2,
      requires_approval: 1,
      approval_status: 'PENDING',
      approval_by_id: null,
      approval_note: null,
      sla_deadline: in6Hours,
      sla_status: 'ON_TRACK',
      impact_summary: '$2.4M escrow account locked pending KYC clearance',
      next_action: 'Requires compliance director sign-off from Elena Rostova to confirm identity clearance',
      created_at: new Date(now.getTime() - 120 * 60 * 1000).toISOString(),
      updated_at: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
    },
    {
      id: 'OPS-1004',
      title: 'Enterprise SSO certificate expiration warning for Acromark Corp',
      description: 'Acromark SAML signing certificate expires in 72 hours. Customer admin uploaded new metadata XML but requires manual certificate fingerprint validation.',
      category: 'CUSTOMER_ESCALATION',
      status: 'TRIAGE',
      priority: 'P1_HIGH',
      team_id: 'team_support',
      assignee_id: null, // UNASSIGNED: Great for testing Claim Race!
      created_by_id: 'usr_priya',
      version: 1,
      requires_approval: 0,
      approval_status: 'NONE',
      approval_by_id: null,
      approval_note: null,
      sla_deadline: in2Hours,
      sla_status: 'ON_TRACK',
      impact_summary: '1,400 enterprise users at risk of login lockout',
      next_action: 'Unassigned. Awaiting support or eng agent to claim and verify SAML certificate',
      created_at: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
      updated_at: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
    },
    {
      id: 'OPS-1005',
      title: 'Off-hours database partition reindexing approval',
      description: 'Audit logs table partition maintenance planned for Saturday 02:00 UTC. Requires Ops Admin sign-off for read-only maintenance window.',
      category: 'OPS_APPROVAL',
      status: 'TRIAGE',
      priority: 'P2_MEDIUM',
      team_id: 'team_ops',
      assignee_id: null, // UNASSIGNED
      created_by_id: 'usr_david',
      version: 1,
      requires_approval: 1,
      approval_status: 'NONE',
      approval_by_id: null,
      approval_note: null,
      sla_deadline: in6Hours,
      sla_status: 'ON_TRACK',
      impact_summary: '15-minute scheduled read-only window during maintenance',
      next_action: 'Requires review and assignment by Operations Team',
      created_at: past20Mins,
      updated_at: past20Mins,
    },
    {
      id: 'OPS-1006',
      title: 'Webhook delivery backpressure during black Friday load test',
      description: 'Partner outgoing webhook queue reached 12,000 backlogged messages. Exponential backoff worker resolved queue backlog.',
      category: 'INCIDENT',
      status: 'RESOLVED',
      priority: 'P2_MEDIUM',
      team_id: 'team_eng',
      assignee_id: 'usr_david',
      created_by_id: 'usr_sarah',
      version: 4,
      requires_approval: 0,
      approval_status: 'NONE',
      approval_by_id: null,
      approval_note: null,
      sla_deadline: past20Mins,
      sla_status: 'ON_TRACK',
      impact_summary: 'Resolved - 12k webhooks delivered with 0 dropped payloads',
      next_action: 'Post-mortem action item created in Jira',
      created_at: new Date(now.getTime() - 240 * 60 * 1000).toISOString(),
      updated_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
    },
  ];

  seedItems.forEach(item => {
    insertItem.run(
      item.id,
      item.title,
      item.description,
      item.category,
      item.status,
      item.priority,
      item.team_id,
      item.assignee_id,
      item.created_by_id,
      item.version,
      item.requires_approval,
      item.approval_status,
      item.approval_by_id,
      item.approval_note,
      item.sla_deadline,
      item.sla_status,
      item.impact_summary,
      item.next_action,
      item.created_at,
      item.updated_at
    );

    // Initial audit event
    insertAudit.run(
      uuidv4(),
      item.id,
      item.created_by_id,
      'System Creator',
      'CREATED',
      0,
      1,
      JSON.stringify({ status: { from: null, to: item.status } }),
      'Work item created and entered triage queue',
      item.created_at
    );
  });

  // Add rich audit events and comments to OPS-1001 for demonstration
  insertAudit.run(
    uuidv4(),
    'OPS-1001',
    'usr_marcus',
    'Marcus Vance',
    'CLAIMED',
    1,
    2,
    JSON.stringify({ assignee: { from: null, to: 'usr_marcus' } }),
    'Claimed item to investigate batch ledger logs',
    new Date(now.getTime() - 60 * 60 * 1000).toISOString()
  );

  insertAudit.run(
    uuidv4(),
    'OPS-1001',
    'usr_marcus',
    'Marcus Vance',
    'APPROVAL_REQUESTED',
    2,
    3,
    JSON.stringify({ status: { from: 'INVESTIGATING', to: 'PENDING_APPROVAL' } }),
    'Identified 42 duplicate transactions totaling €54k. Requested refund authority sign-off.',
    new Date(now.getTime() - 10 * 60 * 1000).toISOString()
  );

  insertComment.run(
    uuidv4(),
    'OPS-1001',
    'usr_priya',
    'Notified affected accounts via template CRM-EU-09. Customers have been advised not to dispute with their banks while we process internal reversal.',
    1,
    new Date(now.getTime() - 35 * 60 * 1000).toISOString()
  );

  insertComment.run(
    uuidv4(),
    'OPS-1001',
    'usr_marcus',
    'Root cause confirmed: idempotency key header was stripped by intermediate cloud proxy during retry storm. Reversal script staged and dry-run completed cleanly.',
    1,
    new Date(now.getTime() - 12 * 60 * 1000).toISOString()
  );

  // Seed Outbox jobs
  const insertOutbox = db.prepare(`
    INSERT INTO outbox_jobs (id, job_type, payload_json, status, attempts, max_attempts, error_message, scheduled_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertOutbox.run(
    uuidv4(),
    'SLA_MONITOR',
    JSON.stringify({ work_item_id: 'OPS-1001', alert_level: 'AT_RISK', deadline: in30Mins }),
    'PENDING',
    0,
    3,
    null,
    now.toISOString(),
    now.toISOString(),
    now.toISOString()
  );

  insertOutbox.run(
    uuidv4(),
    'NOTIFY_ASSIGNEE',
    JSON.stringify({ work_item_id: 'OPS-1002', recipient: 'sarah.jenkins@newtonite.internal', event: 'INCIDENT_P0_ASSIGNED' }),
    'COMPLETED',
    1,
    3,
    null,
    past20Mins,
    past20Mins,
    past20Mins
  );

  insertOutbox.run(
    uuidv4(),
    'INTEGRATION_WEBHOOK',
    JSON.stringify({ endpoint: 'https://pagerduty.internal/webhook/incidents', event_id: 'OPS-1002' }),
    'DEAD_LETTER',
    3,
    3,
    'Connection refused to external audit sink (HTTP 503). Max retries exceeded.',
    past20Mins,
    past20Mins,
    past20Mins
  );
}
