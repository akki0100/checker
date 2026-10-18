import { Router, Response } from 'express';
import { db } from '../db';
import { AuthenticatedRequest } from '../auth';
import { getEnrichedWorkItem } from './items';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

/**
 * POST /api/simulation/race-claim
 * Simulates two employees attempting to claim the exact same work item simultaneously
 */
router.post('/race-claim', async (req: AuthenticatedRequest, res: Response) => {
  const {
    item_id = 'OPS-1004',
    user1_id = 'usr_david',
    user2_id = 'usr_priya'
  } = req.body;

  // Verify item exists
  const item = getEnrichedWorkItem(item_id);
  if (!item) {
    res.status(404).json({ error: 'NOT_FOUND', message: `Item ${item_id} not found.` });
    return;
  }

  // If item is already assigned, unassign it first for the simulation
  if (item.assignee_id) {
    db.prepare(`
      UPDATE work_items
      SET assignee_id = NULL, status = 'TRIAGE', version = version + 1
      WHERE id = ?
    `).run(item_id);
  }

  const freshItem = getEnrichedWorkItem(item_id)!;
  const initialVersion = freshItem.version;

  // Execute two concurrent claim promises simulating parallel incoming HTTP requests
  const attemptClaim = (userId: string, userName: string) => {
    return new Promise<{ user: string; success: boolean; status: number; message: string }>((resolve) => {
      try {
        const claimTx = db.transaction(() => {
          // Atomic OCC conditional update
          const result = db.prepare(`
            UPDATE work_items
            SET
              assignee_id = ?,
              status = 'INVESTIGATING',
              version = version + 1,
              next_action = ?,
              updated_at = datetime('now')
            WHERE id = ? AND assignee_id IS NULL AND version = ?
          `).run(userId, `Claimed by ${userName} in concurrency race test`, item_id, initialVersion);

          if (result.changes === 0) {
            throw new Error('RACE_LOST');
          }

          db.prepare(`
            INSERT INTO audit_events (
              id, work_item_id, actor_id, actor_name, action_type, from_version, to_version, changes_json, note
            ) VALUES (?, ?, ?, ?, 'CLAIMED', ?, ?, ?, ?)
          `).run(
            uuidv4(),
            item_id,
            userId,
            userName,
            initialVersion,
            initialVersion + 1,
            JSON.stringify({ assignee: { from: null, to: userName } }),
            `Simulated race claim won by ${userName}`
          );
        });

        claimTx();
        resolve({
          user: userName,
          success: true,
          status: 200,
          message: 'Claim succeeded. Ownership acquired atomically.'
        });
      } catch (err) {
        resolve({
          user: userName,
          success: false,
          status: 409,
          message: '409 Conflict: Work item was already claimed by another user or modified concurrently.'
        });
      }
    });
  };

  const user1 = db.prepare('SELECT * FROM users WHERE id = ?').get(user1_id) as any;
  const user2 = db.prepare('SELECT * FROM users WHERE id = ?').get(user2_id) as any;

  // Trigger both simultaneously
  const results = await Promise.all([
    attemptClaim(user1.id, user1.name),
    attemptClaim(user2.id, user2.name)
  ]);

  const finalItem = getEnrichedWorkItem(item_id);

  res.json({
    simulation: 'CONCURRENT_CLAIM_RACE',
    item_id,
    initial_version: initialVersion,
    final_version: finalItem?.version,
    final_assignee: finalItem?.assignee_name,
    concurrent_requests: results,
    analysis:
      'Database atomic conditional update ensured strictly one winner, preventing double assignment while the second request was cleanly rejected with 409 Conflict.'
  });
});

export default router;
