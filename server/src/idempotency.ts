import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from './db';
import { AuthenticatedRequest } from './auth';

export function idempotencyMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

  // If no key provided, continue without idempotency caching
  if (!idempotencyKey) {
    next();
    return;
  }

  const userId = req.user?.id || 'anonymous';
  const requestPayload = JSON.stringify(req.body || {});
  const requestHash = crypto
    .createHash('sha256')
    .update(`${userId}:${req.method}:${req.originalUrl}:${requestPayload}`)
    .digest('hex');

  const existing = db.prepare(`
    SELECT * FROM idempotency_keys WHERE key = ?
  `).get(idempotencyKey) as {
    key: string;
    user_id: string;
    endpoint: string;
    request_hash: string;
    status: 'PROCESSING' | 'COMPLETED';
    response_code: number | null;
    response_body: string | null;
    created_at: string;
  } | undefined;

  if (existing) {
    // If different request payload used the same idempotency key, reject
    if (existing.request_hash !== requestHash) {
      res.status(422).json({
        error: 'IDEMPOTENCY_CONFLICT',
        message: 'Idempotency key was previously used with a different request payload or user.'
      });
      return;
    }

    if (existing.status === 'PROCESSING') {
      res.status(409).json({
        error: 'IDEMPOTENCY_IN_FLIGHT',
        message: 'A request with this idempotency key is currently executing. Please avoid aggressive retries.'
      });
      return;
    }

    if (existing.status === 'COMPLETED' && existing.response_body) {
      res.setHeader('X-Idempotent-Replay', 'true');
      res.setHeader('X-Idempotency-Key', idempotencyKey);
      res.status(existing.response_code || 200);
      try {
        const parsed = JSON.parse(existing.response_body);
        res.json(parsed);
      } catch {
        res.send(existing.response_body);
      }
      return;
    }
  }

  // Register new key as PROCESSING
  try {
    db.prepare(`
      INSERT INTO idempotency_keys (key, user_id, endpoint, request_hash, status)
      VALUES (?, ?, ?, ?, 'PROCESSING')
    `).run(idempotencyKey, userId, req.originalUrl, requestHash);
  } catch (err: any) {
    // Race on key insertion
    res.status(409).json({
      error: 'IDEMPOTENCY_IN_FLIGHT',
      message: 'Concurrent request with identical idempotency key detected.'
    });
    return;
  }

  // Intercept response to store completed payload
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  let captured = false;
  const captureAndSave = (bodyContent: any, statusCode: number) => {
    if (captured) return;
    captured = true;
    const stringified = typeof bodyContent === 'string' ? bodyContent : JSON.stringify(bodyContent);

    try {
      if (statusCode >= 200 && statusCode < 500) {
        db.prepare(`
          UPDATE idempotency_keys
          SET status = 'COMPLETED', response_code = ?, response_body = ?
          WHERE key = ?
        `).run(statusCode, stringified, idempotencyKey);
      } else {
        // On 5xx server errors, remove key to allow client retry
        db.prepare('DELETE FROM idempotency_keys WHERE key = ?').run(idempotencyKey);
      }
    } catch (e) {
      console.error('Failed to update idempotency key:', e);
    }
  };

  res.json = (body: any) => {
    captureAndSave(body, res.statusCode);
    return originalJson(body);
  };

  res.send = (body: any) => {
    captureAndSave(body, res.statusCode);
    return originalSend(body);
  };

  next();
}
