import { WorkItem, AuditEvent, Comment, User, Team, OperationalMetrics, OutboxJob } from '../types';

let currentUserId = localStorage.getItem('opspulse_user_id') || 'usr_sarah';

export function getActiveUserId(): string {
  return currentUserId;
}

export function setActiveUserId(id: string): void {
  currentUserId = id;
  localStorage.setItem('opspulse_user_id', id);
}

// Helper to make API requests with persona header and optional Idempotency-Key
async function request<T>(
  endpoint: string,
  options: RequestInit & { idempotencyKey?: string } = {}
): Promise<{ data: T; headers: Headers; status: number }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-user-id': currentUserId,
    ...(options.headers as Record<string, string>),
  };

  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  const responseData = await response.json();

  if (!response.ok) {
    const error: any = new Error(responseData.message || 'API request failed');
    error.status = response.status;
    error.data = responseData;
    throw error;
  }

  return { data: responseData, headers: response.headers, status: response.status };
}

export const api = {
  async getWorkItems(params: Record<string, any> = {}): Promise<{ data: WorkItem[]; pagination: any }> {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        query.append(k, String(v));
      }
    });
    const res = await request<{ data: WorkItem[]; pagination: any }>(`/api/work-items?${query.toString()}`);
    return res.data;
  },

  async getWorkItem(id: string): Promise<{ item: WorkItem; history: AuditEvent[]; comments: Comment[] }> {
    const res = await request<{ item: WorkItem; history: AuditEvent[]; comments: Comment[] }>(`/api/work-items/${id}`);
    return res.data;
  },

  async createWorkItem(payload: any, idempotencyKey?: string): Promise<WorkItem> {
    const res = await request<WorkItem>('/api/work-items', {
      method: 'POST',
      body: JSON.stringify(payload),
      idempotencyKey,
    });
    return res.data;
  },

  async updateWorkItem(id: string, payload: { expected_version: number; [key: string]: any }): Promise<WorkItem> {
    const res = await request<WorkItem>(`/api/work-items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async claimWorkItem(id: string, expected_version?: number, idempotencyKey?: string): Promise<WorkItem> {
    const res = await request<WorkItem>(`/api/work-items/${id}/claim`, {
      method: 'POST',
      body: JSON.stringify({ expected_version }),
      idempotencyKey,
    });
    return res.data;
  },

  async transitionStatus(
    id: string,
    target_status: string,
    expected_version: number,
    note?: string,
    idempotencyKey?: string
  ): Promise<WorkItem> {
    const res = await request<WorkItem>(`/api/work-items/${id}/transition`, {
      method: 'POST',
      body: JSON.stringify({ target_status, expected_version, note }),
      idempotencyKey,
    });
    return res.data;
  },

  async submitApproval(
    id: string,
    decision: 'APPROVE' | 'REJECT',
    expected_version: number,
    note: string,
    idempotencyKey?: string
  ): Promise<WorkItem> {
    const res = await request<WorkItem>(`/api/work-items/${id}/approval`, {
      method: 'POST',
      body: JSON.stringify({ decision, expected_version, note }),
      idempotencyKey,
    });
    return res.data;
  },

  async addComment(id: string, content: string): Promise<Comment> {
    const res = await request<Comment>(`/api/work-items/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    return res.data;
  },

  async getUsers(): Promise<User[]> {
    const res = await request<User[]>('/api/meta/users');
    return res.data;
  },

  async getTeams(): Promise<Team[]> {
    const res = await request<Team[]>('/api/meta/teams');
    return res.data;
  },

  async getMetrics(): Promise<OperationalMetrics> {
    const res = await request<OperationalMetrics>('/api/meta/metrics');
    return res.data;
  },

  async resetDemo(): Promise<void> {
    await request('/api/meta/reset-demo', { method: 'POST' });
  },

  async simulateRaceClaim(itemId: string, user1Id: string, user2Id: string): Promise<any> {
    const res = await request<any>('/api/simulation/race-claim', {
      method: 'POST',
      body: JSON.stringify({ item_id: itemId, user1_id: user1Id, user2_id: user2Id }),
    });
    return res.data;
  },

  async getOutboxJobs(status?: string): Promise<{ summary: any; jobs: OutboxJob[] }> {
    const q = status ? `?status=${status}` : '';
    const res = await request<{ summary: any; jobs: OutboxJob[] }>(`/api/jobs${q}`);
    return res.data;
  },

  async triggerWorkerTick(): Promise<any> {
    const res = await request<any>('/api/jobs/tick', { method: 'POST' });
    return res.data;
  },

  async simulateOutboxFailure(): Promise<any> {
    const res = await request<any>('/api/jobs/test-failure', { method: 'POST' });
    return res.data;
  },

  async retryDeadLetter(id: string): Promise<any> {
    const res = await request<any>(`/api/jobs/retry-dead-letter/${id}`, { method: 'POST' });
    return res.data;
  },
};
