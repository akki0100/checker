import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { db } from '../src/db';

describe('RBAC & Workflow Gate Invariants', () => {
  beforeEach(() => {
    // Reset OPS-1001 to PENDING_APPROVAL with version 3
    db.prepare(`
      UPDATE work_items
      SET
        status = 'PENDING_APPROVAL',
        approval_status = 'PENDING',
        requires_approval = 1,
        team_id = 'team_payments',
        created_by_id = 'usr_priya',
        version = 3
      WHERE id = 'OPS-1001'
    `).run();
  });

  it('prohibits standard AGENT from performing a formal approval sign-off', async () => {
    const res = await request(app)
      .post('/api/work-items/OPS-1001/approval')
      .set('x-user-id', 'usr_priya') // Priya is AGENT
      .send({
        decision: 'APPROVE',
        note: 'Attempting to self-approve refund',
        expected_version: 3
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('APPROVAL_NOT_PERMITTED');
    expect(res.body.message).toContain('Only Team Leads and Admins can sign off');
  });

  it('prohibits a LEAD from another team from signing off on payments approval', async () => {
    const res = await request(app)
      .post('/api/work-items/OPS-1001/approval')
      .set('x-user-id', 'usr_sarah') // Sarah is LEAD of Engineering, not Payments
      .send({
        decision: 'APPROVE',
        note: 'Cross-team approval attempt',
        expected_version: 3
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('APPROVAL_NOT_PERMITTED');
    expect(res.body.message).toContain("owning team's Lead");
  });

  it('allows the Payments Lead (Marcus Vance) to authorize the approval', async () => {
    const res = await request(app)
      .post('/api/work-items/OPS-1001/approval')
      .set('x-user-id', 'usr_marcus') // Marcus is LEAD of Payments
      .send({
        decision: 'APPROVE',
        note: 'Verified duplicate EU ledger entries. Authorized for batch €54k reversal.',
        expected_version: 3
      });

    expect(res.status).toBe(200);
    expect(res.body.approval_status).toBe('APPROVED');
    expect(res.body.version).toBe(4);
  });

  it('enforces workflow invariant: cannot resolve item before approval sign-off', async () => {
    // Attempting to resolve OPS-1001 while approval_status is still PENDING
    const res = await request(app)
      .post('/api/work-items/OPS-1001/transition')
      .set('x-user-id', 'usr_marcus')
      .send({
        target_status: 'RESOLVED',
        note: 'Bypassing approval gate',
        expected_version: 3
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('WORKFLOW_VIOLATION');
    expect(res.body.message).toContain('requires formal authorization before resolving');
  });
});
