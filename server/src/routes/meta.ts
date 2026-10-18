import { Router, Response } from 'express';
import { db, seedDataIfEmpty } from '../db';
import { AuthenticatedRequest } from '../auth';

const router = Router();

/**
 * GET /api/meta/users - List available user personas for quick-switch
 */
router.get('/users', (req: AuthenticatedRequest, res: Response) => {
  const users = db.prepare(`
    SELECT u.*, t.name as team_name, t.slug as team_slug
    FROM users u
    JOIN teams t ON u.team_id = t.id
    ORDER BY u.role DESC, u.name ASC
  `).all();
  res.json(users);
});

/**
 * GET /api/meta/teams - List operational teams
 */
router.get('/teams', (req: AuthenticatedRequest, res: Response) => {
  const teams = db.prepare(`
    SELECT t.*, COUNT(w.id) as active_items_count
    FROM teams t
    LEFT JOIN work_items w ON w.team_id = t.id AND w.status NOT IN ('RESOLVED', 'CLOSED', 'REJECTED')
    GROUP BY t.id
  `).all();
  res.json(teams);
});

/**
 * GET /api/meta/metrics - Operational pulse metrics
 */
router.get('/metrics', (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;

  const openIncidents = db.prepare(`
    SELECT COUNT(*) as count FROM work_items
    WHERE status NOT IN ('RESOLVED', 'CLOSED', 'REJECTED')
  `).get() as { count: number };

  const pendingApprovals = db.prepare(`
    SELECT COUNT(*) as count FROM work_items
    WHERE requires_approval = 1 AND approval_status = 'PENDING'
  `).get() as { count: number };

  const slaAtRisk = db.prepare(`
    SELECT COUNT(*) as count FROM work_items
    WHERE sla_status IN ('AT_RISK', 'BREACHED') AND status NOT IN ('RESOLVED', 'CLOSED', 'REJECTED')
  `).get() as { count: number };

  const unassigned = db.prepare(`
    SELECT COUNT(*) as count FROM work_items
    WHERE assignee_id IS NULL AND status NOT IN ('RESOLVED', 'CLOSED', 'REJECTED')
  `).get() as { count: number };

  const myAssigned = db.prepare(`
    SELECT COUNT(*) as count FROM work_items
    WHERE assignee_id = ? AND status NOT IN ('RESOLVED', 'CLOSED', 'REJECTED')
  `).get(user.id) as { count: number };

  res.json({
    open_incidents: openIncidents.count,
    pending_approvals: pendingApprovals.count,
    sla_at_risk: slaAtRisk.count,
    unassigned_count: unassigned.count,
    my_assigned_count: myAssigned.count,
  });
});

/**
 * POST /api/meta/reset-demo - Re-seed to pristine state
 */
router.post('/reset-demo', (req: AuthenticatedRequest, res: Response) => {
  db.exec(`
    DELETE FROM work_item_comments;
    DELETE FROM audit_events;
    DELETE FROM work_items;
    DELETE FROM outbox_jobs;
    DELETE FROM idempotency_keys;
    DELETE FROM users;
    DELETE FROM teams;
  `);

  seedDataIfEmpty();
  res.json({ success: true, message: 'Database reset to clean Newtonite demo state.' });
});

export default router;
