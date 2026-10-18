import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { db } from '../src/db';
import { v4 as uuidv4 } from 'uuid';

describe('Idempotency Key Deduplication Guard', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM idempotency_keys').run();
    db.prepare('DELETE FROM work_items WHERE title = ?').run('New High Priority Issue');
  });

  it('executes normally on initial request and returns cached response with header on repeat', async () => {
    const key = `idem-${uuidv4()}`;

    // First request
    const firstRes = await request(app)
      .post('/api/work-items')
      .set('x-user-id', 'usr_sarah')
      .set('Idempotency-Key', key)
      .send({
        title: 'New High Priority Issue',
        description: 'Testing idempotency creation',
        category: 'INCIDENT',
        priority: 'P1_HIGH',
        team_id: 'team_eng'
      });

    expect(firstRes.status).toBe(201);
    const createdId = firstRes.body.id;
    expect(firstRes.headers['x-idempotent-replay']).toBeUndefined();

    // Count items created
    const countBefore = db.prepare('SELECT COUNT(*) as c FROM work_items WHERE title = ?').get('New High Priority Issue') as any;
    expect(countBefore.c).toBe(1);

    // Second request with exact same Idempotency-Key (simulating browser double-click or network retry)
    const secondRes = await request(app)
      .post('/api/work-items')
      .set('x-user-id', 'usr_sarah')
      .set('Idempotency-Key', key)
      .send({
        title: 'New High Priority Issue',
        description: 'Testing idempotency creation',
        category: 'INCIDENT',
        priority: 'P1_HIGH',
        team_id: 'team_eng'
      });

    expect(secondRes.status).toBe(201);
    expect(secondRes.headers['x-idempotent-replay']).toBe('true');
    expect(secondRes.body.id).toBe(createdId);

    // Assert no duplicate work item was inserted
    const countAfter = db.prepare('SELECT COUNT(*) as c FROM work_items WHERE title = ?').get('New High Priority Issue') as any;
    expect(countAfter.c).toBe(1);
  });

  it('rejects if the same key is reused with a different payload', async () => {
    const key = `idem-${uuidv4()}`;

    await request(app)
      .post('/api/work-items')
      .set('x-user-id', 'usr_sarah')
      .set('Idempotency-Key', key)
      .send({
        title: 'Original Title',
        description: 'Desc',
        category: 'INCIDENT',
        priority: 'P1_HIGH',
        team_id: 'team_eng'
      });

    // Same key, different title
    const secondRes = await request(app)
      .post('/api/work-items')
      .set('x-user-id', 'usr_sarah')
      .set('Idempotency-Key', key)
      .send({
        title: 'Different Title With Same Key',
        description: 'Desc',
        category: 'INCIDENT',
        priority: 'P1_HIGH',
        team_id: 'team_eng'
      });

    expect(secondRes.status).toBe(422);
    expect(secondRes.body.error).toBe('IDEMPOTENCY_CONFLICT');
  });
});
