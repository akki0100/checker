import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { AuthenticatedRequest, Permissions } from '../auth';
import { WorkItem, WorkItemStatus, WorkItemPriority, WorkItemCategory, ConcurrencyConflictError } from '../types';
import { enqueueOutboxJob } from '../outbox';

const router = Router();

// Helper to fetch enriched work item
export function getEnrichedWorkItem(id: string): WorkItem | undefined {
  return db.prepare(`
    SELECT
      w.*,
      t.name as team_name,
      a.name as assignee_name,
      c.name as creator_name,
      app.name as approver_name
    FROM work_items w
    JOIN teams t ON w.team_id = t.id
    LEFT JOIN users a ON w.assignee_id = a.id
    JOIN users c ON w.created_by_id = c.id
    LEFT JOIN users app ON w.approval_by_id = app.id
    WHERE w.id = ?
  `).get(id) as WorkItem | undefined;
}

/**
 * GET /api/work-items - Paginated, filtered, searchable operational queue
 */
router.get('/', (req: AuthenticatedRequest, res: Response) => {
  const {
    q,
    status,
    priority,
    team_id,
    assignee_id,
    unassigned,
    needs_approval,
    page = '1',
    limit = '20'
  } = req.query;

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
  const offset = (pageNum - 1) * pageSize;

  const conditions: string[] = [];
  const params: any[] = [];

  if (q) {
    conditions.push('(w.title LIKE ? OR w.description LIKE ? OR w.id LIKE ?)');
    const term = `%${q}%`;
    params.push(term, term, term);
  }

  if (status) {
    conditions.push('w.status = ?');
    params.push(status);
  }

  if (priority) {
    conditions.push('w.priority = ?');
    params.push(priority);
  }

  if (team_id) {
    conditions.push('w.team_id = ?');
    params.push(team_id);
  }

  if (assignee_id) {
    conditions.push('w.assignee_id = ?');
    params.push(assignee_id);
  }

  if (unassigned === 'true') {
    conditions.push('w.assignee_id IS NULL');
  }

  if (needs_approval === 'true') {
    conditions.push("w.requires_approval = 1 AND w.approval_status = 'PENDING'");
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalRow = db.prepare(`
    SELECT COUNT(*) as count
    FROM work_items w
    ${whereClause}
  `).get(...params) as { count: number };

  const items = db.prepare(`
    SELECT
      w.*,
      t.name as team_name,
      a.name as assignee_name,
      c.name as creator_name,
      app.name as approver_name
    FROM work_items w
    JOIN teams t ON w.team_id = t.id
    LEFT JOIN users a ON w.assignee_id = a.id
    JOIN users c ON w.created_by_id = c.id
    LEFT JOIN users app ON w.approval_by_id = app.id
    ${whereClause}
    ORDER BY
      CASE w.priority
        WHEN 'P0_CRITICAL' THEN 1
        WHEN 'P1_HIGH' THEN 2
        WHEN 'P2_MEDIUM' THEN 3
        ELSE 4
      END,
      w.updated_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset) as WorkItem[];

  res.json({
    data: items,
    pagination: {
      total: totalRow.count,
      page: pageNum,
      pageSize,
      totalPages: Math.ceil(totalRow.count / pageSize)
    }
  });
});

/**
 * GET /api/work-items/:id - Retrieve complete work item details with timeline & notes
 */
router.get('/:id', (req: AuthenticatedRequest, res: Response) => {
  const item = getEnrichedWorkItem(req.params.id);
  if (!item) {
    res.status(404).json({ error: 'NOT_FOUND', message: `Work item '${req.params.id}' not found.` });
    return;
  }

  const history = db.prepare(`
    SELECT * FROM audit_events
    WHERE work_item_id = ?
    ORDER BY to_version DESC, created_at DESC
  `).all(item.id);

  const comments = db.prepare(`
    SELECT c.*, u.name as user_name, u.role as user_role, u.avatar_url
    FROM work_item_comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.work_item_id = ?
    ORDER BY c.created_at ASC
  `).all(item.id);

  res.json({
    item,
    history,
    comments
  });
});

/**
 * POST /api/work-items - Create new operational work item
 */
router.post('/', (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const {
    title,
    description,
    category,
    priority = 'P2_MEDIUM',
    team_id,
    requires_approval = false,
    impact_summary = 'General operational item'
  } = req.body;

  if (!title || !description || !category || !team_id) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Title, description, category, and target team are required.'
    });
    return;
  }

  // Generate monotonic sequence-based item key without collisions
  const maxRow = db.prepare("SELECT MAX(CAST(SUBSTR(id, 5) AS INTEGER)) as max_num FROM work_items WHERE id LIKE 'OPS-%'").get() as { max_num: number | null };
  const nextNum = (maxRow?.max_num || 1006) + 1;
  const itemId = `OPS-${nextNum}`;

  // Calculate default SLA based on priority
  const now = new Date();
  const slaHours = priority === 'P0_CRITICAL' ? 1 : priority === 'P1_HIGH' ? 4 : priority === 'P2_MEDIUM' ? 24 : 72;
  const slaDeadline = new Date(now.getTime() + slaHours * 3600 * 1000).toISOString();

  const nextAction = `New item logged by ${user.name}. Awaiting triage by team.`;

  const insertTx = db.transaction(() => {
    db.prepare(`
      INSERT INTO work_items (
        id, title, description, category, status, priority, team_id, assignee_id,
        created_by_id, version, requires_approval, approval_status, sla_deadline,
        sla_status, impact_summary, next_action, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'TRIAGE', ?, ?, NULL, ?, 1, ?, 'NONE', ?, 'ON_TRACK', ?, ?, datetime('now'), datetime('now'))
    `).run(
      itemId,
      title,
      description,
      category,
      priority,
      team_id,
      user.id,
      requires_approval ? 1 : 0,
      slaDeadline,
      impact_summary,
      nextAction
    );

    db.prepare(`
      INSERT INTO audit_events (
        id, work_item_id, actor_id, actor_name, action_type, from_version, to_version, changes_json, note
      ) VALUES (?, ?, ?, ?, 'CREATED', 0, 1, ?, ?)
    `).run(
      uuidv4(),
      itemId,
      user.id,
      user.name,
      JSON.stringify({ status: { from: null, to: 'TRIAGE' }, priority: { from: null, to: priority } }),
      `Item created by ${user.name} (${user.role})`
    );

    // Asynchronous background task
    enqueueOutboxJob('AUDIT_INDEX', { work_item_id: itemId, action: 'CREATE' });
    enqueueOutboxJob('SLA_MONITOR', { work_item_id: itemId, priority, sla_deadline: slaDeadline });
  });

  insertTx();

  const created = getEnrichedWorkItem(itemId);
  res.status(201).json(created);
});

/**
 * PATCH /api/work-items/:id - Optimistic Concurrency Control (OCC) update
 */
router.patch('/:id', (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { id } = req.params;
  const { expected_version, title, description, priority, impact_summary, next_action } = req.body;

  if (expected_version === undefined || expected_version === null) {
    res.status(400).json({
      error: 'MISSING_VERSION',
      message: 'OCC requires expected_version to be provided in the request body.'
    });
    return;
  }

  const current = getEnrichedWorkItem(id);
  if (!current) {
    res.status(404).json({ error: 'NOT_FOUND', message: `Work item '${id}' not found.` });
    return;
  }

  // OCC Check: Has the record been modified since client loaded it?
  if (current.version !== Number(expected_version)) {
    const conflict: ConcurrencyConflictError = {
      error: 'CONCURRENCY_CONFLICT',
      message: `Update rejected: This item was modified by another user (current version is v${current.version}, you submitted against v${expected_version}). Please refresh and review latest changes before reapplying.`,
      current_version: current.version,
      submitted_version: Number(expected_version),
      current_record: current
    };
    res.status(409).json(conflict);
    return;
  }

  // Build field diffs for audit trail
  const changes: Record<string, { from: any; to: any }> = {};
  if (title !== undefined && title !== current.title) changes.title = { from: current.title, to: title };
  if (description !== undefined && description !== current.description) changes.description = { from: current.description, to: description };
  if (priority !== undefined && priority !== current.priority) changes.priority = { from: current.priority, to: priority };
  if (impact_summary !== undefined && impact_summary !== current.impact_summary) changes.impact_summary = { from: current.impact_summary, to: impact_summary };
  if (next_action !== undefined && next_action !== current.next_action) changes.next_action = { from: current.next_action, to: next_action };

  if (Object.keys(changes).length === 0) {
    res.json(current);
    return;
  }

  const nextVersion = current.version + 1;

  const updateTx = db.transaction(() => {
    const result = db.prepare(`
      UPDATE work_items
      SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        priority = COALESCE(?, priority),
        impact_summary = COALESCE(?, impact_summary),
        next_action = COALESCE(?, next_action),
        version = version + 1,
        updated_at = datetime('now')
      WHERE id = ? AND version = ?
    `).run(
      title || null,
      description || null,
      priority || null,
      impact_summary || null,
      next_action || null,
      id,
      expected_version
    );

    if (result.changes === 0) {
      throw new Error('OCC_RACE_DETECTED');
    }

    db.prepare(`
      INSERT INTO audit_events (
        id, work_item_id, actor_id, actor_name, action_type, from_version, to_version, changes_json, note
      ) VALUES (?, ?, ?, ?, 'FIELD_UPDATED', ?, ?, ?, ?)
    `).run(
      uuidv4(),
      id,
      user.id,
      user.name,
      current.version,
      nextVersion,
      JSON.stringify(changes),
      `Updated fields: ${Object.keys(changes).join(', ')}`
    );

    enqueueOutboxJob('AUDIT_INDEX', { work_item_id: id, action: 'UPDATE', fields: Object.keys(changes) });
  });

  try {
    updateTx();
  } catch (err: any) {
    const latest = getEnrichedWorkItem(id);
    res.status(409).json({
      error: 'CONCURRENCY_CONFLICT',
      message: 'Concurrent update detected. Another user modified this item simultaneously.',
      current_version: latest?.version,
      submitted_version: expected_version,
      current_record: latest
    });
    return;
  }

  const updated = getEnrichedWorkItem(id);
  res.json(updated);
});

/**
 * POST /api/work-items/:id/claim - Atomic Claim with Race-Condition Protection
 */
router.post('/:id/claim', (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { id } = req.params;
  const { expected_version } = req.body;

  const current = getEnrichedWorkItem(id);
  if (!current) {
    res.status(404).json({ error: 'NOT_FOUND', message: `Work item '${id}' not found.` });
    return;
  }

  // Authorization check
  const perm = Permissions.canClaimItem(user, current);
  if (!perm.allowed) {
    res.status(403).json({ error: 'FORBIDDEN', message: perm.reason });
    return;
  }

  // If already assigned to this exact user, return cleanly
  if (current.assignee_id === user.id) {
    res.json(current);
    return;
  }

  const claimTx = db.transaction(() => {
    // Atomic update: only succeeds if assignee is NULL (or matches current) AND version matches
    let query = `
      UPDATE work_items
      SET
        assignee_id = ?,
        status = CASE WHEN status = 'TRIAGE' THEN 'INVESTIGATING' ELSE status END,
        version = version + 1,
        next_action = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `;
    const params: any[] = [user.id, `Claimed by ${user.name}. Actively investigating.`, id];

    if (expected_version !== undefined && expected_version !== null) {
      query += ` AND version = ?`;
      params.push(expected_version);
    }

    // If it's an unassigned claim, enforce assignee_id IS NULL atomically
    if (!current.assignee_id) {
      query += ` AND assignee_id IS NULL`;
    }

    const result = db.prepare(query).run(...params);

    if (result.changes === 0) {
      throw new Error('CLAIM_RACE_LOST');
    }

    const nextVersion = current.version + 1;
    const fromStatus = current.status;
    const toStatus = current.status === 'TRIAGE' ? 'INVESTIGATING' : current.status;

    db.prepare(`
      INSERT INTO audit_events (
        id, work_item_id, actor_id, actor_name, action_type, from_version, to_version, changes_json, note
      ) VALUES (?, ?, ?, ?, 'CLAIMED', ?, ?, ?, ?)
    `).run(
      uuidv4(),
      id,
      user.id,
      user.name,
      current.version,
      nextVersion,
      JSON.stringify({
        assignee: { from: current.assignee_name || null, to: user.name },
        status: { from: fromStatus, to: toStatus }
      }),
      `Ownership claimed by ${user.name} (${user.title})`
    );

    enqueueOutboxJob('NOTIFY_ASSIGNEE', {
      work_item_id: id,
      assignee_id: user.id,
      title: current.title
    });
  });

  try {
    claimTx();
  } catch (err: any) {
    const latest = getEnrichedWorkItem(id);
    res.status(409).json({
      error: 'CLAIM_CONFLICT',
      message: `Claim conflict: Work item was already claimed by ${latest?.assignee_name || 'another user'} or modified concurrently.`,
      current_version: latest?.version,
      current_record: latest
    });
    return;
  }

  const updated = getEnrichedWorkItem(id);
  res.json(updated);
});

/**
 * POST /api/work-items/:id/transition - State Transition with Invariant Validation
 */
router.post('/:id/transition', (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { id } = req.params;
  const { target_status, note, expected_version } = req.body as {
    target_status: WorkItemStatus;
    note?: string;
    expected_version: number;
  };

  if (!target_status) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'target_status is required.' });
    return;
  }

  const current = getEnrichedWorkItem(id);
  if (!current) {
    res.status(404).json({ error: 'NOT_FOUND', message: `Work item '${id}' not found.` });
    return;
  }

  // Version check
  if (expected_version !== undefined && expected_version !== null && current.version !== Number(expected_version)) {
    res.status(409).json({
      error: 'CONCURRENCY_CONFLICT',
      message: `State transition rejected: Work item has evolved to v${current.version}. Please refresh.`,
      current_version: current.version,
      submitted_version: Number(expected_version),
      current_record: current
    });
    return;
  }

  // Permission & Invariant validation
  const perm = Permissions.canTransitionStatus(user, current, target_status);
  if (!perm.allowed) {
    res.status(403).json({ error: 'WORKFLOW_VIOLATION', message: perm.reason });
    return;
  }

  let nextAction = current.next_action;
  let nextApprovalStatus = current.approval_status;

  if (target_status === 'PENDING_APPROVAL') {
    nextApprovalStatus = 'PENDING';
    nextAction = `Requires formal sign-off from Team Lead before moving forward.`;
  } else if (target_status === 'RESOLVED') {
    nextAction = `Resolved by ${user.name}. Item ready for archive or retrospective.`;
  } else if (target_status === 'INVESTIGATING') {
    nextAction = `In active investigation by ${current.assignee_name || user.name}.`;
  }

  const nextVersion = current.version + 1;

  const transitionTx = db.transaction(() => {
    const result = db.prepare(`
      UPDATE work_items
      SET
        status = ?,
        approval_status = ?,
        next_action = ?,
        version = version + 1,
        updated_at = datetime('now')
      WHERE id = ? AND version = ?
    `).run(target_status, nextApprovalStatus, nextAction, id, current.version);

    if (result.changes === 0) {
      throw new Error('OCC_RACE_DETECTED');
    }

    db.prepare(`
      INSERT INTO audit_events (
        id, work_item_id, actor_id, actor_name, action_type, from_version, to_version, changes_json, note
      ) VALUES (?, ?, ?, ?, 'STATUS_TRANSITION', ?, ?, ?, ?)
    `).run(
      uuidv4(),
      id,
      user.id,
      user.name,
      current.version,
      nextVersion,
      JSON.stringify({ status: { from: current.status, to: target_status } }),
      note || `Status transitioned from ${current.status} to ${target_status}`
    );

    enqueueOutboxJob('AUDIT_INDEX', { work_item_id: id, action: 'STATUS_CHANGE', target: target_status });
  });

  try {
    transitionTx();
  } catch (err) {
    const latest = getEnrichedWorkItem(id);
    res.status(409).json({
      error: 'CONCURRENCY_CONFLICT',
      message: 'State transition failed due to concurrent modification.',
      current_record: latest
    });
    return;
  }

  const updated = getEnrichedWorkItem(id);
  res.json(updated);
});

/**
 * POST /api/work-items/:id/approval - Formal Sign-off with Segregation of Duties
 */
router.post('/:id/approval', (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { id } = req.params;
  const { decision, note, expected_version } = req.body as {
    decision: 'APPROVE' | 'REJECT';
    note: string;
    expected_version: number;
  };

  if (!decision || !['APPROVE', 'REJECT'].includes(decision)) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'decision must be APPROVE or REJECT.' });
    return;
  }

  if (!note || note.trim().length === 0) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A written approval rationale note is mandatory.' });
    return;
  }

  const current = getEnrichedWorkItem(id);
  if (!current) {
    res.status(404).json({ error: 'NOT_FOUND', message: `Work item '${id}' not found.` });
    return;
  }

  // Version check
  if (expected_version !== undefined && expected_version !== null && current.version !== Number(expected_version)) {
    res.status(409).json({
      error: 'CONCURRENCY_CONFLICT',
      message: `Approval rejected: Work item has evolved to v${current.version}.`,
      current_version: current.version,
      current_record: current
    });
    return;
  }

  // RBAC check
  const perm = Permissions.canApprove(user, current);
  if (!perm.allowed) {
    res.status(403).json({ error: 'APPROVAL_NOT_PERMITTED', message: perm.reason });
    return;
  }

  const newApprovalStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  const newStatus = decision === 'APPROVE' ? 'INVESTIGATING' : 'REJECTED';
  const nextAction =
    decision === 'APPROVE'
      ? `Approved by ${user.name}. Authorized to proceed to final resolution.`
      : `Rejected by ${user.name}: "${note}". Requires revision.`;

  const nextVersion = current.version + 1;

  const approvalTx = db.transaction(() => {
    const result = db.prepare(`
      UPDATE work_items
      SET
        approval_status = ?,
        approval_by_id = ?,
        approval_note = ?,
        status = ?,
        next_action = ?,
        version = version + 1,
        updated_at = datetime('now')
      WHERE id = ? AND version = ?
    `).run(newApprovalStatus, user.id, note, newStatus, nextAction, id, current.version);

    if (result.changes === 0) {
      throw new Error('OCC_RACE_DETECTED');
    }

    db.prepare(`
      INSERT INTO audit_events (
        id, work_item_id, actor_id, actor_name, action_type, from_version, to_version, changes_json, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      id,
      user.id,
      user.name,
      decision === 'APPROVE' ? 'APPROVED' : 'APPROVAL_REJECTED',
      current.version,
      nextVersion,
      JSON.stringify({
        approval_status: { from: current.approval_status, to: newApprovalStatus },
        status: { from: current.status, to: newStatus }
      }),
      `Formal ${decision} recorded by ${user.name}: "${note}"`
    );

    enqueueOutboxJob('AUDIT_INDEX', { work_item_id: id, action: `APPROVAL_${decision}` });
  });

  try {
    approvalTx();
  } catch (err) {
    const latest = getEnrichedWorkItem(id);
    res.status(409).json({
      error: 'CONCURRENCY_CONFLICT',
      message: 'Approval failed due to concurrent modification.',
      current_record: latest
    });
    return;
  }

  const updated = getEnrichedWorkItem(id);
  res.json(updated);
});

/**
 * POST /api/work-items/:id/comments - Add collaborative internal note
 */
router.post('/:id/comments', (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { id } = req.params;
  const { content, is_internal = 1 } = req.body;

  if (!content || !content.trim()) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Comment content cannot be empty.' });
    return;
  }

  const item = getEnrichedWorkItem(id);
  if (!item) {
    res.status(404).json({ error: 'NOT_FOUND', message: `Work item '${id}' not found.` });
    return;
  }

  const commentId = uuidv4();
  db.prepare(`
    INSERT INTO work_item_comments (id, work_item_id, user_id, content, is_internal)
    VALUES (?, ?, ?, ?, ?)
  `).run(commentId, id, user.id, content.trim(), is_internal ? 1 : 0);

  // Record lightweight audit event without bumping item version
  db.prepare(`
    INSERT INTO audit_events (
      id, work_item_id, actor_id, actor_name, action_type, from_version, to_version, changes_json, note
    ) VALUES (?, ?, ?, ?, 'COMMENT_ADDED', ?, ?, ?, ?)
  `).run(
    uuidv4(),
    id,
    user.id,
    user.name,
    item.version,
    item.version,
    JSON.stringify({ comment_id: commentId }),
    `Added collaboration note: "${content.trim().slice(0, 80)}..."`
  );

  const newComment = db.prepare(`
    SELECT c.*, u.name as user_name, u.role as user_role, u.avatar_url
    FROM work_item_comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `).get(commentId);

  res.status(201).json(newComment);
});

export default router;
