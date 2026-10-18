import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { OutboxJob } from '../types';
import { Server, X, RefreshCw, AlertOctagon, CheckCircle, Clock, Play } from 'lucide-react';

interface OutboxMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OutboxMonitorModal: React.FC<OutboxMonitorModalProps> = ({ isOpen, onClose }) => {
  const [data, setData] = useState<{ summary: any; jobs: OutboxJob[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const loadJobs = async () => {
    try {
      setLoading(true);
      const res = await api.getOutboxJobs();
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadJobs();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTick = async () => {
    setActionLoading(true);
    try {
      await api.triggerWorkerTick();
      await loadJobs();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleTestFailure = async () => {
    setActionLoading(true);
    try {
      await api.simulateOutboxFailure();
      await loadJobs();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetryDeadLetter = async (id: string) => {
    try {
      await api.retryDeadLetter(id);
      await loadJobs();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-4xl rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <Server className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                <span>Transactional Outbox & Background Jobs</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold uppercase">
                  Async Pipeline
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Decoupled notification, SLA surveillance, and webhook delivery with dead-letter queueing
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

        {/* Summary Counter Bar */}
        {data && (
          <div className="grid grid-cols-5 border-b border-slate-800 bg-slate-950/20 divide-x divide-slate-800 text-center py-3">
            <div>
              <div className="text-xs text-slate-400">Pending</div>
              <div className="text-lg font-bold text-slate-200">{data.summary.pending}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Processing</div>
              <div className="text-lg font-bold text-sky-400">{data.summary.processing}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Completed</div>
              <div className="text-lg font-bold text-emerald-400">{data.summary.completed}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Retrying</div>
              <div className="text-lg font-bold text-amber-400">{data.summary.failed}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Dead-Letter</div>
              <div className="text-lg font-bold text-rose-400">{data.summary.dead_letter}</div>
            </div>
          </div>
        )}

        {/* Actions Bar */}
        <div className="p-4 bg-slate-950/40 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              onClick={handleTick}
              disabled={actionLoading}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition flex items-center space-x-1.5"
            >
              <Play className="h-3.5 w-3.5 fill-white" />
              <span>Trigger Worker Batch Tick</span>
            </button>
            <button
              onClick={handleTestFailure}
              disabled={actionLoading}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold transition flex items-center space-x-1.5"
            >
              <AlertOctagon className="h-3.5 w-3.5 text-rose-400" />
              <span>Simulate Webhook Transient Failure</span>
            </button>
          </div>
          <button
            onClick={loadJobs}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white"
            title="Refresh jobs"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>

        {/* Job List */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1">
          {data?.jobs.map((job) => {
            const isDead = job.status === 'DEAD_LETTER';
            const isDone = job.status === 'COMPLETED';
            const isRetrying = job.status === 'FAILED';

            return (
              <div
                key={job.id}
                className="p-3.5 rounded-2xl bg-slate-800/40 border border-slate-700/60 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-slate-300">{job.job_type}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold text-[10px] uppercase ${
                        isDone
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : isDead
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse'
                          : isRetrying
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {job.status}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Attempts: {job.attempts}/{job.max_attempts}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 font-mono truncate max-w-lg">
                    {job.payload_json}
                  </p>

                  {job.error_message && (
                    <p className="text-[11px] text-rose-300 font-medium">
                      Error: {job.error_message}
                    </p>
                  )}
                </div>

                {isDead && (
                  <button
                    onClick={() => handleRetryDeadLetter(job.id)}
                    className="px-3 py-1 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 border border-rose-500/40 text-[11px] font-semibold text-rose-200 transition shrink-0"
                  >
                    Revive to Queue
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
