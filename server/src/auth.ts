import { Request, Response, NextFunction } from 'express';
import { db } from './db';
import { User, WorkItem, WorkItemStatus } from './types';

// Extended Express Request
export interface AuthenticatedRequest extends Request {
  user?: User;
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const userId = (req.headers['x-user-id'] as string) || 'usr_sarah';

  const user = db.prepare(`
    SELECT u.*, t.name as team_name, t.slug as team_slug
    FROM users u
    JOIN teams t ON u.team_id = t.id
    WHERE u.id = ?
  `).get(userId) as (User & { team_slug: string }) | undefined;

  if (!user) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: `User '${userId}' not found. Please switch to a valid team persona.`
    });
    return;
  }

  req.user = user;
  next();
}

/**
 * RBAC & Domain Authorization Rules
 */
export const Permissions = {
  canClaimItem(user: User, item: WorkItem): { allowed: boolean; reason?: string } {
    if (item.status === 'RESOLVED' || item.status === 'CLOSED') {
      return { allowed: false, reason: `Item is already in terminal state '${item.status}'.` };
    }
    // If already assigned to someone else, only a Lead or Admin can reassign/force-claim
    if (item.assignee_id && item.assignee_id !== user.id) {
      if (user.role !== 'LEAD' && user.role !== 'ADMIN') {
        return {
          allowed: false,
          reason: `Item is currently claimed by another user. Only Team Leads or Admins can reassign.`
        };
      }
    }
    return { allowed: true };
  },

  canApprove(user: User, item: WorkItem): { allowed: boolean; reason?: string } {
    if (item.requires_approval !== 1) {
      return { allowed: false, reason: 'This item does not require an approval sign-off.' };
    }

    if (item.status !== 'PENDING_APPROVAL') {
      return { allowed: false, reason: `Item is in '${item.status}' state, not in 'PENDING_APPROVAL'.` };
    }

    // Admins can approve anything
    if (user.role === 'ADMIN') {
      return { allowed: true };
    }

    // Must be a LEAD
    if (user.role !== 'LEAD') {
      return {
        allowed: false,
        reason: `Only Team Leads and Admins can sign off on formal approvals. Current role is '${user.role}'.`
      };
    }

    // Must belong to the item's owning team
    if (user.team_id !== item.team_id) {
      return {
        allowed: false,
        reason: `This request requires sign-off from the owning team's Lead. User is in a different team.`
      };
    }

    // Segregation of duties: Creator cannot be the sole approver of their own critical request
    if (item.created_by_id === user.id && item.priority === 'P0_CRITICAL') {
      return {
        allowed: false,
        reason: `Segregation of Duties: Creator cannot approve their own P0 critical operational request.`
      };
    }

    return { allowed: true };
  },

  canTransitionStatus(
    user: User,
    item: WorkItem,
    targetStatus: WorkItemStatus
  ): { allowed: boolean; reason?: string } {
    // Valid state transitions
    const validTransitions: Record<WorkItemStatus, WorkItemStatus[]> = {
      TRIAGE: ['INVESTIGATING', 'REJECTED', 'CLOSED'],
      INVESTIGATING: ['PENDING_APPROVAL', 'RESOLVED', 'TRIAGE'],
      PENDING_APPROVAL: ['RESOLVED', 'INVESTIGATING', 'REJECTED'],
      RESOLVED: ['CLOSED', 'INVESTIGATING'], // Reopen or finalize
      CLOSED: ['INVESTIGATING'], // Reopen
      REJECTED: ['TRIAGE'],
    };

    const allowedNext = validTransitions[item.status] || [];
    if (!allowedNext.includes(targetStatus)) {
      return {
        allowed: false,
        reason: `Invalid state transition: Cannot move from '${item.status}' directly to '${targetStatus}'.`
      };
    }

    // Workflow invariant: Cannot resolve if approval is required and not granted
    if (targetStatus === 'RESOLVED') {
      if (item.requires_approval === 1 && item.approval_status !== 'APPROVED') {
        return {
          allowed: false,
          reason: `Workflow Gate Invariant: This item requires formal authorization before resolving. Current approval status is '${item.approval_status}'.`
        };
      }
    }

    // Terminal closure restrictions
    if (targetStatus === 'CLOSED' || targetStatus === 'REJECTED') {
      if (user.role === 'AGENT' && item.assignee_id !== user.id && item.created_by_id !== user.id) {
        return {
          allowed: false,
          reason: `Only the item assignee, creator, or a Team Lead/Admin may close or reject this item.`
        };
      }
    }

    return { allowed: true };
  }
};
