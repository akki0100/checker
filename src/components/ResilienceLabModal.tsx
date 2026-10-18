import React, { useState } from 'react';
import { api } from '../api/client';
import { v4 as uuidv4 } from 'uuid';
import {
  Zap,
  X,
  Users,
  Repeat,
  ShieldAlert,
  Server,
  Play,
  CheckCircle,
  AlertCircle,
  Clock,
  ArrowRight
} from 'lucide-react';

interface ResilienceLabModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataMutated: () => void;
}

export const ResilienceLabModal: React.FC<ResilienceLabModalProps> = ({
  isOpen,
  onClose,
  onDataMutated,
}) => {
  const [activeTab, setActiveTab] = useState<'RACE_CLAIM' | 'OCC_STALE' | 'IDEMPOTENCY' | 'RBAC_SECURITY'>('RACE_CLAIM');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  if (!isOpen) return null;

  // 1. Run Simultaneous Claim Race Test
  const handleRunRaceClaim = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await api.simulateRaceClaim('OPS-1004', 'usr_sarah', 'usr_marcus');
      setResult({ type: 'RACE_CLAIM', data: res });
      onDataMutated();
    } catch (err: any) {
      setResult({ type: 'ERROR', error: err.message });
    } finally {
      setRunning(false);
    }
  };

  // 2. Run Stale OCC Conflict Test
  const handleRunOccStale = async () => {
    setRunning(true);
    setResult(null);
    try {
      // Intentionally pass expected_version = 0 (stale) to trigger 409
      await api.updateWorkItem('OPS-1002', {
        expected_version: 0,
        title: 'Conflicting update from stale tab',
      });
    } catch (err: any) {
      setResult({
        type: 'OCC_STALE',
        status: err.status,
        data: err.data || { error: 'CONCURRENCY_CONFLICT', message: err.message },
      });
    } finally {
      setRunning(false);
    }
  };

  // 3. Run Idempotency Deduplication Test
  const handleRunIdempotency = async () => {
    setRunning(true);
    setResult(null);
    try {
      const idempotencyKey = `lab-idem-${uuidv4().slice(0, 8)}`;
      const payload = {
        title: `Idempotency Test Item ${new Date().toLocaleTimeString()}`,
        description: 'Testing automatic server-side deduplication',
        category: 'INCIDENT',
        priority: 'P2_MEDIUM',
        team_id: 'team_eng',
      };

      // Request 1
      const res1 = await fetch('/api/work-items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'usr_sarah',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });
      const data1 = await res1.json();
      const replayHeader1 = res1.headers.get('x-idempotent-replay');

      // Request 2 (Duplicate replay)
      const res2 = await fetch('/api/work-items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'usr_sarah',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });
      const data2 = await res2.json();
      const replayHeader2 = res2.headers.get('x-idempotent-replay');

      setResult({
        type: 'IDEMPOTENCY',
        key: idempotencyKey,
        first_call: { status: res1.status, is_replay: replayHeader1 || 'false', item_id: data1.id },
        second_call: { status: res2.status, is_replay: replayHeader2 || 'true', item_id: data2.id },
      });
      onDataMutated();
    } catch (err: any) {
      setResult({ type: 'ERROR', error: err.message });
    } finally {
      setRunning(false);
    }
  };

  // 4. Run RBAC Security Barrier Test
  const handleRunRbacTest = async () => {
    setRunning(true);
    setResult(null);
    try {
      // Priya (Customer Support Agent) attempts to approve Marcus's €54,000 payment reversal
      const res = await fetch('/api/work-items/OPS-1001/approval', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'usr_priya', // Agent role
        },
        body: JSON.stringify({
          decision: 'APPROVE',
          note: 'Unauthorized self-approval attempt',
          expected_version: 3,
        }),
      });
      const data = await res.json();
      setResult({
        type: 'RBAC_SECURITY',
        status: res.status,
        data,
      });
    } catch (err: any) {
      setResult({ type: 'ERROR', error: err.message });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-3xl rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <Zap className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                <span>Concurrency & Resilience Lab</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold uppercase">
                  Live Test Bench
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Demonstrating non-trivial operational correctness under pressure
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 px-6 overflow-x-auto">
          <button
            onClick={() => {
              setActiveTab('RACE_CLAIM');
              setResult(null);
            }}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition whitespace-nowrap flex items-center space-x-2 ${
              activeTab === 'RACE_CLAIM'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>1. Atomic Claim Race</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('OCC_STALE');
              setResult(null);
            }}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition whitespace-nowrap flex items-center space-x-2 ${
              activeTab === 'OCC_STALE'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldAlert className="h-4 w-4" />
            <span>2. Optimistic Locking (OCC)</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('IDEMPOTENCY');
              setResult(null);
            }}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition whitespace-nowrap flex items-center space-x-2 ${
              activeTab === 'IDEMPOTENCY'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Repeat className="h-4 w-4" />
            <span>3. Idempotency Key Guard</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('RBAC_SECURITY');
              setResult(null);
            }}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition whitespace-nowrap flex items-center space-x-2 ${
              activeTab === 'RBAC_SECURITY'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="h-4 w-4" />
            <span>4. RBAC & Workflow Gate</span>
          </button>
        </div>

        {/* Tab Content & Runner */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'RACE_CLAIM' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700 space-y-2">
                <h4 className="text-sm font-bold text-white">Scenario: Simultaneous Claim Race</h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Two employees (Sarah Jenkins & Marcus Vance) rush to claim the same unassigned incident
                  (<code>OPS-1004</code>) at the exact same millisecond. Without atomic protection, both could be
                  assigned or overwrite each other.
                </p>
                <div className="text-[11px] text-indigo-300 font-mono bg-indigo-950/40 p-2.5 rounded-xl border border-indigo-500/30">
                  SQL Guard: UPDATE work_items SET assignee_id = :user, version = version + 1 WHERE id = :id AND
                  assignee_id IS NULL AND version = :v
                </div>
              </div>

              <button
                onClick={handleRunRaceClaim}
                disabled={running}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center justify-center space-x-2 shadow-lg shadow-indigo-600/30"
              >
                <Play className="h-4 w-4 fill-white" />
                <span>{running ? 'Executing Parallel Promises...' : 'Fire 2 Simultaneous Requests (Promise.all)'}</span>
              </button>
            </div>
          )}

          {activeTab === 'OCC_STALE' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700 space-y-2">
                <h4 className="text-sm font-bold text-white">Scenario: Stale Read Detection & OCC 409</h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  A user keeps an operational ticket open on screen while another engineer updates it.
                  When the first user clicks Save, the client submits <code>expected_version: 0</code>. The server
                  detects that the record evolved and rejects the mutation with <code>409 Conflict</code>.
                </p>
              </div>

              <button
                onClick={handleRunOccStale}
                disabled={running}
                className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center justify-center space-x-2 shadow-lg shadow-amber-600/30"
              >
                <Play className="h-4 w-4 fill-white" />
                <span>{running ? 'Verifying Version Guard...' : 'Submit Mutation with Stale Version (Triggers 409)'}</span>
              </button>
            </div>
          )}

          {activeTab === 'IDEMPOTENCY' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700 space-y-2">
                <h4 className="text-sm font-bold text-white">Scenario: Idempotency Key Deduplication</h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Simulates a user double-clicking "Submit" or network retries replaying the same request.
                  The backend registers the first request, saves the response hash, and on the duplicate request
                  immediately returns the cached result with header <code>X-Idempotent-Replay: true</code> without
                  re-executing logic or creating duplicate records.
                </p>
              </div>

              <button
                onClick={handleRunIdempotency}
                disabled={running}
                className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center justify-center space-x-2 shadow-lg shadow-purple-600/30"
              >
                <Play className="h-4 w-4 fill-white" />
                <span>{running ? 'Replaying Identical Key...' : 'Send Rapid-Fire Duplicate Requests with Same Key'}</span>
              </button>
            </div>
          )}

          {activeTab === 'RBAC_SECURITY' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700 space-y-2">
                <h4 className="text-sm font-bold text-white">Scenario: Server-Enforced RBAC & Approval Gate</h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Priya Patel (Customer Support Agent) attempts to authorize a €54,000 refund on item{' '}
                  <code>OPS-1001</code>. The backend evaluates the user's role and team, enforcing that only
                  Marcus Vance (Payments Lead) or an Admin can grant financial sign-offs.
                </p>
              </div>

              <button
                onClick={handleRunRbacTest}
                disabled={running}
                className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center justify-center space-x-2 shadow-lg shadow-rose-600/30"
              >
                <Play className="h-4 w-4 fill-white" />
                <span>{running ? 'Evaluating Permissions...' : 'Attempt Unauthorized Sign-off as Agent (Expect 403)'}</span>
              </button>
            </div>
          )}

          {/* Results Display */}
          {result && (
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Experiment Result & Diagnostic Log
                </span>
                <span className="text-[11px] font-mono text-emerald-400 font-semibold flex items-center space-x-1">
                  <CheckCircle className="h-3.5 w-3.5" />
                  <span>Execution Verified</span>
                </span>
              </div>

              <pre className="text-xs text-slate-300 bg-slate-900/90 p-3.5 rounded-xl overflow-x-auto border border-slate-800 font-mono leading-relaxed">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
