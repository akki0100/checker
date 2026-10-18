import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { db } from '../src/db';

describe('Optimistic Concurrency Control (OCC) & Stale Write Defense', () => {
  beforeEach(() => {
    // Reset test item version
    db.prepare(`
      UPDATE work_items
      SET version = 1, title = 'Original Title', description = 'Original description'
      WHERE id = 'OPS-1002'
    `).run();
  });

  it('allows updates when expected_version matches current database version', async () => {
    const res = await request(app)
      .patch('/api/work-items/OPS-1002')
      .set('x-user-id', 'usr_sarah')
      .send({
        expected_version: 1,
        title: 'Updated Latency Incident Title'
      });

    expect(res.status).toBe(200);
    expect(res.body.version).toBe(2);
    expect(res.body.title).toBe('Updated Latency Incident Title');

    // Verify audit log captured the OCC version bump
    const audit = db.prepare(`
      SELECT * FROM audit_events
      WHERE work_item_id = 'OPS-1002' AND action_type = 'FIELD_UPDATED'
      ORDER BY created_at DESC LIMIT 1
    `).get() as any;

    expect(audit).toBeDefined();
    expect(audit.from_version).toBe(1);
    expect(audit.to_version).toBe(2);
  });

  it('rejects updates with 409 Conflict when client submits a stale version', async () => {
    // Simulate User A having already bumped the version to 2
    db.prepare("UPDATE work_items SET version = 2 WHERE id = 'OPS-1002'").run();

    // User B attempts to submit an edit based on stale version 1
    const res = await request(app)
      .patch('/api/work-items/OPS-1002')
      .set('x-user-id', 'usr_david')
      .send({
        expected_version: 1, // Stale version!
        title: 'Conflicting Edit From Stale Tab'
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONCURRENCY_CONFLICT');
    expect(res.body.current_version).toBe(2);
    expect(res.body.submitted_version).toBe(1);
    expect(res.body.current_record).toBeDefined();

    // Verify title in DB was NOT overwritten
    const check = db.prepare("SELECT title FROM work_items WHERE id = 'OPS-1002'").get() as any;
    expect(check.title).not.toBe('Conflicting Edit From Stale Tab');
  });

  it('rejects requests missing expected_version parameter', async () => {
    const res = await request(app)
      .patch('/api/work-items/OPS-1002')
      .set('x-user-id', 'usr_sarah')
      .send({
        title: 'Title without version'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MISSING_VERSION');
  });
});
