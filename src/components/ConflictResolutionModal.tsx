import React from 'react';
import { ConcurrencyConflict } from '../types';
import { AlertTriangle, RefreshCw, X, ShieldAlert } from 'lucide-react';

interface ConflictResolutionModalProps {
  conflict: ConcurrencyConflict | null;
  onClose: () => void;
  onReload: () => void;
}

export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  conflict,
  onClose,
  onReload,
}) => {
  if (!conflict) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-amber-500/40 shadow-2xl overflow-hidden p-6 space-y-4">
        {/* Warning Icon & Header */}
        <div className="flex items-start space-x-3">
          <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shrink-0">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              Optimistic Concurrency Conflict (OCC 409)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Data protection guard prevented silent overwrite of concurrent modifications.
            </p>
          </div>
        </div>

        {/* Humanized Explanation */}
        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300 space-y-2">
          <div className="flex justify-between items-center text-[11px] pb-1 border-b border-slate-800">
            <span className="text-slate-400">Your Base Version:</span>
            <span className="font-mono text-rose-300 font-bold">
              v{conflict.submitted_version || 'stale'}
            </span>
          </div>
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-slate-400">Current Server Database Version:</span>
            <span className="font-mono text-emerald-300 font-bold">
              v{conflict.current_version}
            </span>
          </div>
          <p className="pt-1 text-slate-300 leading-relaxed">
            {conflict.message ||
              'Another user or process has updated this operational item while you were viewing it. To prevent data loss, the server rejected this stale modification.'}
          </p>
        </div>

        {/* Current State Preview */}
        {conflict.current_record && (
          <div className="text-xs space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Latest Server State:
            </span>
            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-1">
              <div className="font-medium text-slate-200">
                {conflict.current_record.title}
              </div>
              <div className="text-[11px] text-slate-400 flex items-center space-x-2">
                <span>Status: <strong className="text-slate-300">{conflict.current_record.status}</strong></span>
                <span>•</span>
                <span>Assignee: <strong className="text-slate-300">{conflict.current_record.assignee_name || 'Unassigned'}</strong></span>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end space-x-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            Review Later
          </button>
          <button
            onClick={() => {
              onReload();
              onClose();
            }}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md flex items-center space-x-1.5 transition"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Reload Latest Version</span>
          </button>
        </div>
      </div>
    </div>
  );
};
