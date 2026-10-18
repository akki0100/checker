import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { db } from '../src/db';

describe('Atomic Race Claim Protection', () => {
  beforeEach(() => {
    // Reset OPS-1004 to unassigned with version 1
    db.prepare(`
      UPDATE work_items
      SET assignee_id = NULL, status = 'TRIAGE', version = 1
      WHERE id = 'OPS-1004'
    `).run();
  });

  it('ensures strictly one winner when two users claim simultaneously', async () => {
    // Simulate two concurrent HTTP requests firing at the exact same millisecond
    const req1 = request(app)
      .post('/api/work-items/OPS-1004/claim')
      .set('x-user-id', 'usr_sarah') // Lead
      .send({ expected_version: 1 });

    const req2 = request(app)
      .post('/api/work-items/OPS-1004/claim')
      .set('x-user-id', 'usr_marcus') // Lead
      .send({ expected_version: 1 });

    const [res1, res2] = await Promise.all([req1, req2]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 409]);

    const winner = res1.status === 200 ? res1 : res2;
    const loser = res1.status === 409 ? res1 : res2;

    expect(winner.body.assignee_id).toBeDefined();
    expect(loser.body.error).toBe('CLAIM_CONFLICT');

    // Confirm DB state is intact and clean
    const item = db.prepare("SELECT assignee_id, version, status FROM work_items WHERE id = 'OPS-1004'").get() as any;
    expect(item.version).toBe(2);
    expect(item.status).toBe('INVESTIGATING');
    expect(['usr_sarah', 'usr_marcus']).toContain(item.assignee_id);
  });

  it('prevents regular agent from claiming an item already assigned to another user', async () => {
    // Assign to Sarah first
    db.prepare(`
      UPDATE work_items
      SET assignee_id = 'usr_sarah', status = 'INVESTIGATING', version = 2
      WHERE id = 'OPS-1004'
    `).run();

    // Priya (AGENT) attempts to claim Sarah's item
    const res = await request(app)
      .post('/api/work-items/OPS-1004/claim')
      .set('x-user-id', 'usr_priya') // Agent role
      .send({ expected_version: 2 });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
    expect(res.body.message).toContain('Only Team Leads or Admins can reassign');
  });
});
