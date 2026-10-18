import { db } from './db';
import { OutboxJob } from './types';
import { v4 as uuidv4 } from 'uuid';

export function enqueueOutboxJob(
  jobType: OutboxJob['job_type'],
  payload: Record<string, any>,
  scheduledAt?: Date
): string {
  const id = uuidv4();
  const scheduled = (scheduledAt || new Date()).toISOString();

  db.prepare(`
    INSERT INTO outbox_jobs (id, job_type, payload_json, status, attempts, max_attempts, scheduled_at)
    VALUES (?, ?, ?, 'PENDING', 0, 3, ?)
  `).run(id, jobType, JSON.stringify(payload), scheduled);

  return id;
}

export interface WorkerProcessResult {
  processed: number;
  succeeded: number;
  failed: number;
  deadLettered: number;
  jobDetails: Array<{ id: string; type: string; status: string; error?: string }>;
}

export function processOutboxQueue(limit = 10): WorkerProcessResult {
  const now = new Date().toISOString();

  // Atomically select candidate jobs ready for processing
  const jobs = db.prepare(`
    SELECT * FROM outbox_jobs
    WHERE status IN ('PENDING', 'FAILED')
      AND attempts < max_attempts
      AND scheduled_at <= ?
    ORDER BY created_at ASC
    LIMIT ?
  `).all(now, limit) as OutboxJob[];

  const result: WorkerProcessResult = {
    processed: jobs.length,
    succeeded: 0,
    failed: 0,
    deadLettered: 0,
    jobDetails: []
  };

  for (const job of jobs) {
    // Mark as PROCESSING
    db.prepare(`
      UPDATE outbox_jobs
      SET status = 'PROCESSING', attempts = attempts + 1, updated_at = datetime('now')
      WHERE id = ?
    `).run(job.id);

    try {
      const payload = JSON.parse(job.payload_json);

      switch (job.job_type) {
        case 'SLA_MONITOR': {
          // Re-evaluate SLA status for the item
          const item = db.prepare('SELECT id, sla_deadline, status FROM work_items WHERE id = ?').get(payload.work_item_id) as any;
          if (item && item.status !== 'RESOLVED' && item.status !== 'CLOSED') {
            const deadlineTime = new Date(item.sla_deadline).getTime();
            const currentTime = Date.now();
            const diffMinutes = (deadlineTime - currentTime) / (1000 * 60);

            let newSla = 'ON_TRACK';
            if (diffMinutes <= 0) {
              newSla = 'BREACHED';
            } else if (diffMinutes <= 60) {
              newSla = 'AT_RISK';
            }

            db.prepare('UPDATE work_items SET sla_status = ? WHERE id = ?').run(newSla, item.id);
          }
          break;
        }

        case 'NOTIFY_ASSIGNEE': {
          // Simulated asynchronous notification delivery
          // (Email, Slack, Webhook)
          break;
        }

        case 'INTEGRATION_WEBHOOK': {
          // Simulate webhook that intentionally fails if payload contains test_fail
          if (payload.simulate_fail) {
            throw new Error(`Simulated transient network timeout for endpoint: ${payload.endpoint || 'webhook'}`);
          }
          break;
        }

        case 'AUDIT_INDEX': {
          // Downstream analytics / elasticsearch projection sync
          break;
        }
      }

      // Mark COMPLETED
      db.prepare(`
        UPDATE outbox_jobs
        SET status = 'COMPLETED', error_message = NULL, updated_at = datetime('now')
        WHERE id = ?
      `).run(job.id);

      result.succeeded++;
      result.jobDetails.push({ id: job.id, type: job.job_type, status: 'COMPLETED' });
    } catch (err: any) {
      const nextAttempt = job.attempts + 1;
      const isDeadLetter = nextAttempt >= job.max_attempts;
      const status = isDeadLetter ? 'DEAD_LETTER' : 'FAILED';
      const backoffSeconds = Math.pow(2, nextAttempt) * 5; // Exponential backoff
      const nextScheduled = new Date(Date.now() + backoffSeconds * 1000).toISOString();

      db.prepare(`
        UPDATE outbox_jobs
        SET status = ?, error_message = ?, scheduled_at = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(status, err.message, nextScheduled, job.id);

      if (isDeadLetter) {
        result.deadLettered++;
      } else {
        result.failed++;
      }
      result.jobDetails.push({ id: job.id, type: job.job_type, status, error: err.message });
    }
  }

  return result;
}

// Background poller interval timer
let workerInterval: NodeJS.Timeout | null = null;

export function startOutboxWorker(intervalMs = 4000) {
  if (workerInterval) return;
  workerInterval = setInterval(() => {
    try {
      processOutboxQueue(5);
    } catch (e) {
      console.error('Outbox worker tick error:', e);
    }
  }, intervalMs);
}

export function stopOutboxWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
}
