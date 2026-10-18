import { describe, it, expect, beforeEach } from 'vitest';
import { db, initDatabase } from '../src/db';
import { enqueueOutboxJob, processOutboxQueue } from '../src/outbox';

describe('Transactional Outbox & Background Processing Resilience', () => {
  beforeEach(() => {
    initDatabase();
    db.prepare('DELETE FROM outbox_jobs').run();
  });

  it('processes normal pending jobs to COMPLETED', () => {
    const jobId = enqueueOutboxJob('AUDIT_INDEX', { work_item_id: 'OPS-1002', action: 'TEST' });

    const batch = processOutboxQueue(10);
    expect(batch.processed).toBe(1);
    expect(batch.succeeded).toBe(1);
    expect(batch.failed).toBe(0);

    const job = db.prepare('SELECT status, attempts FROM outbox_jobs WHERE id = ?').get(jobId) as any;
    expect(job.status).toBe('COMPLETED');
    expect(job.attempts).toBe(1);
  });

  it('retries failing jobs with backoff and moves to DEAD_LETTER upon exceeding max_attempts', () => {
    // Enqueue an intentionally failing job
    const jobId = enqueueOutboxJob('INTEGRATION_WEBHOOK', { simulate_fail: true, endpoint: 'test-endpoint' });

    // Attempt 1: Fails, status -> FAILED
    const run1 = processOutboxQueue(10);
    expect(run1.failed).toBe(1);

    let job = db.prepare('SELECT status, attempts FROM outbox_jobs WHERE id = ?').get(jobId) as any;
    expect(job.status).toBe('FAILED');
    expect(job.attempts).toBe(1);

    // Fast-forward scheduled_at to current time to simulate backoff elapsing
    db.prepare("UPDATE outbox_jobs SET scheduled_at = datetime('now', '-1 minute') WHERE id = ?").run(jobId);

    // Attempt 2: Fails again, status -> FAILED
    const run2 = processOutboxQueue(10);
    expect(run2.failed).toBe(1);

    job = db.prepare('SELECT status, attempts FROM outbox_jobs WHERE id = ?').get(jobId) as any;
    expect(job.status).toBe('FAILED');
    expect(job.attempts).toBe(2);

    // Fast-forward scheduled_at again
    db.prepare("UPDATE outbox_jobs SET scheduled_at = datetime('now', '-1 minute') WHERE id = ?").run(jobId);

    // Attempt 3: Exceeds max_attempts (3), status -> DEAD_LETTER
    const run3 = processOutboxQueue(10);
    expect(run3.deadLettered).toBe(1);

    job = db.prepare('SELECT status, attempts, error_message FROM outbox_jobs WHERE id = ?').get(jobId) as any;
    expect(job.status).toBe('DEAD_LETTER');
    expect(job.attempts).toBe(3);
    expect(job.error_message).toContain('Simulated transient network timeout');
  });
});
