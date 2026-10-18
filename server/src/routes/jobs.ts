import { Router, Response } from 'express';
import { db } from '../db';
import { AuthenticatedRequest } from '../auth';
import { processOutboxQueue, enqueueOutboxJob } from '../outbox';
import { OutboxJob } from '../types';

const router = Router();

/**
 * GET /api/jobs - Inspect outbox and background job statuses
 */
router.get('/', (req: AuthenticatedRequest, res: Response) => {
  const { status, limit = '30' } = req.query;

  let query = 'SELECT * FROM outbox_jobs';
  const params: any[] = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(parseInt(limit as string, 10) || 30);

  const jobs = db.prepare(query).all(...params) as OutboxJob[];

  const summary = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'PROCESSING' THEN 1 ELSE 0 END) as processing,
      SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'DEAD_LETTER' THEN 1 ELSE 0 END) as dead_letter
    FROM outbox_jobs
  `).get() as Record<string, number>;

  res.json({
    summary: {
      pending: summary.pending || 0,
      processing: summary.processing || 0,
      completed: summary.completed || 0,
      failed: summary.failed || 0,
      dead_letter: summary.dead_letter || 0,
    },
    jobs
  });
});

/**
 * POST /api/jobs/tick - Trigger an immediate synchronous outbox worker batch
 */
router.post('/tick', (req: AuthenticatedRequest, res: Response) => {
  const result = processOutboxQueue(10);
  res.json({
    success: true,
    result
  });
});

/**
 * POST /api/jobs/test-failure - Enqueue an intentionally failing job to test dead-letter behavior
 */
router.post('/test-failure', (req: AuthenticatedRequest, res: Response) => {
  const jobId = enqueueOutboxJob('INTEGRATION_WEBHOOK', {
    endpoint: 'https://payment-clearing.invalid/webhook',
    simulate_fail: true,
    reason: 'Testing exponential backoff and dead-letter queue'
  });

  res.status(201).json({
    success: true,
    message: 'Test failing job enqueued. Trigger worker tick 3 times to observe dead-letter transition.',
    job_id: jobId
  });
});

/**
 * POST /api/jobs/retry-dead-letter/:id - Revive a dead-letter job
 */
router.post('/retry-dead-letter/:id', (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  const result = db.prepare(`
    UPDATE outbox_jobs
    SET status = 'PENDING', attempts = 0, error_message = NULL, scheduled_at = datetime('now')
    WHERE id = ?
  `).run(id);

  if (result.changes === 0) {
    res.status(404).json({ error: 'NOT_FOUND', message: `Job ${id} not found.` });
    return;
  }

  res.json({ success: true, message: `Job ${id} re-queued for processing.` });
});

export default router;
