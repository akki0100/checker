export type UserRole = 'AGENT' | 'LEAD' | 'ADMIN';

export type TeamSlug = 'engineering' | 'payments' | 'compliance' | 'support' | 'operations';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  team_id: string;
  team_name?: string;
  avatar_url: string;
  title: string;
}

export interface Team {
  id: string;
  name: string;
  slug: TeamSlug;
  description: string;
  color: string;
}

export type WorkItemCategory =
  | 'INCIDENT'
  | 'PAYMENT_INVESTIGATION'
  | 'CUSTOMER_ESCALATION'
  | 'COMPLIANCE_REQUEST'
  | 'OPS_APPROVAL';

export type WorkItemStatus =
  | 'TRIAGE'
  | 'INVESTIGATING'
  | 'PENDING_APPROVAL'
  | 'RESOLVED'
  | 'CLOSED'
  | 'REJECTED';

export type WorkItemPriority = 'P0_CRITICAL' | 'P1_HIGH' | 'P2_MEDIUM' | 'P3_LOW';

export type ApprovalStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';

export type SLAStatus = 'ON_TRACK' | 'AT_RISK' | 'BREACHED';

export interface WorkItem {
  id: string;
  title: string;
  description: string;
  category: WorkItemCategory;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  team_id: string;
  team_name?: string;
  assignee_id: string | null;
  assignee_name?: string | null;
  created_by_id: string;
  creator_name?: string;
  version: number; // Incrementing counter for Optimistic Concurrency Control (OCC)
  requires_approval: number; // 0 or 1
  approval_status: ApprovalStatus;
  approval_by_id: string | null;
  approver_name?: string | null;
  approval_note: string | null;
  sla_deadline: string; // ISO string
  sla_status: SLAStatus;
  impact_summary: string;
  next_action: string;
  created_at: string;
  updated_at: string;
}

export interface AuditEvent {
  id: string;
  work_item_id: string;
  actor_id: string;
  actor_name: string;
  action_type:
    | 'CREATED'
    | 'FIELD_UPDATED'
    | 'STATUS_TRANSITION'
    | 'CLAIMED'
    | 'ASSIGNED'
    | 'UNASSIGNED'
    | 'APPROVAL_REQUESTED'
    | 'APPROVED'
    | 'APPROVAL_REJECTED'
    | 'COMMENT_ADDED';
  from_version: number;
  to_version: number;
  changes_json: string; // JSON string of { [field]: { from, to } }
  note: string | null;
  created_at: string;
}

export interface Comment {
  id: string;
  work_item_id: string;
  user_id: string;
  user_name?: string;
  user_role?: string;
  content: string;
  is_internal: number;
  created_at: string;
}

export interface OutboxJob {
  id: string;
  job_type: 'SLA_MONITOR' | 'NOTIFY_ASSIGNEE' | 'AUDIT_INDEX' | 'INTEGRATION_WEBHOOK';
  payload_json: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'DEAD_LETTER';
  attempts: number;
  max_attempts: number;
  error_message: string | null;
  scheduled_at: string;
  created_at: string;
  updated_at: string;
}

export interface ConcurrencyConflictError {
  error: 'CONCURRENCY_CONFLICT';
  message: string;
  current_version: number;
  submitted_version: number;
  current_record: WorkItem;
}
