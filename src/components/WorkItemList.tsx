import React from 'react';
import { WorkItem, User } from '../types';
import { Clock, AlertCircle, CheckCircle2, User as UserIcon, Shield, ArrowRight, CornerDownRight } from 'lucide-react';

interface WorkItemListProps {
  items: WorkItem[];
  loading: boolean;
  selectedItemId: string | null;
  onSelectItem: (item: WorkItem) => void;
  onClaimItem: (item: WorkItem, e: React.MouseEvent) => void;
  currentUser: User | null;
}

export const WorkItemList: React.FC<WorkItemListProps> = ({
  items,
  loading,
  selectedItemId,
  onSelectItem,
  onClaimItem,
  currentUser,
}) => {
  if (loading && items.length === 0) {
    return (
      <div className="py-20 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-indigo-500 border-r-transparent"></div>
        <p className="mt-3 text-sm text-slate-400">Loading operational queues...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-20 text-center rounded-2xl bg-slate-900/40 border border-slate-800">
        <AlertCircle className="mx-auto h-10 w-10 text-slate-500" />
        <h3 className="mt-2 text-sm font-semibold text-slate-300">No work items found</h3>
        <p className="mt-1 text-xs text-slate-500">
          No operational tickets match the current query and filters.
        </p>
      </div>
    );
  }

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'P0_CRITICAL':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse">
            P0 CRITICAL
          </span>
        );
      case 'P1_HIGH':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            P1 HIGH
          </span>
        );
      case 'P2_MEDIUM':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
            P2 MEDIUM
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-700 text-slate-300">
            P3 LOW
          </span>
        );
    }
  };

  const getStatusBadge = (status: string, requiresApproval: number, approvalStatus: string) => {
    switch (status) {
      case 'PENDING_APPROVAL':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <Shield className="h-3 w-3" />
            <span>Needs Approval</span>
          </span>
        );
      case 'INVESTIGATING':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-ping"></span>
            <span>Investigating</span>
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            <span>Resolved</span>
          </span>
        );
      case 'CLOSED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
            Closed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/15 text-purple-300 border border-purple-500/30">
            Triage
          </span>
        );
    }
  };

  const getSlaIndicator = (deadline: string, status: string, slaStatus: string) => {
    if (status === 'RESOLVED' || status === 'CLOSED') {
      return (
        <span className="text-[11px] text-slate-500 flex items-center space-x-1">
          <Clock className="h-3 w-3" />
          <span>Completed</span>
        </span>
      );
    }

    const diff = (new Date(deadline).getTime() - Date.now()) / (1000 * 60);

    if (diff < 0 || slaStatus === 'BREACHED') {
      return (
        <span className="text-[11px] font-bold text-rose-400 flex items-center space-x-1 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/30">
          <AlertCircle className="h-3 w-3 animate-pulse" />
          <span>SLA BREACHED ({Math.abs(Math.round(diff))}m ago)</span>
        </span>
      );
    }

    if (diff <= 60 || slaStatus === 'AT_RISK') {
      return (
        <span className="text-[11px] font-semibold text-amber-300 flex items-center space-x-1 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
          <Clock className="h-3 w-3" />
          <span>{Math.round(diff)}m remaining</span>
        </span>
      );
    }

    const hours = Math.round(diff / 60);
    return (
      <span className="text-[11px] text-slate-400 flex items-center space-x-1">
        <Clock className="h-3 w-3" />
        <span>{hours}h left</span>
      </span>
    );
  };

  return (
    <div className="space-y-2.5">
      {items.map((item) => {
        const isSelected = selectedItemId === item.id;
        const isAssignedToMe = item.assignee_id === currentUser?.id;
        const isUnassigned = !item.assignee_id;

        return (
          <div
            key={item.id}
            onClick={() => onSelectItem(item)}
            className={`group p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
              isSelected
                ? 'bg-slate-800/90 border-indigo-500/80 shadow-lg shadow-indigo-500/10'
                : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800/80 hover:border-slate-700/80'
            }`}
          >
            {/* Left priority accent indicator bar */}
            <div
              className={`absolute left-0 top-0 bottom-0 w-1 ${
                item.priority === 'P0_CRITICAL'
                  ? 'bg-rose-500'
                  : item.priority === 'P1_HIGH'
                  ? 'bg-amber-500'
                  : item.priority === 'P2_MEDIUM'
                  ? 'bg-blue-500'
                  : 'bg-slate-700'
              }`}
            />

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Main Content */}
              <div className="flex-1 min-w-0 pl-1">
                {/* Meta Header */}
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="font-mono text-xs font-bold text-indigo-400 tracking-wide">
                    {item.id}
                  </span>
                  <span className="text-[11px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                    v{item.version}
                  </span>
                  {getPriorityBadge(item.priority)}
                  {getStatusBadge(item.status, item.requires_approval, item.approval_status)}
                  <span className="text-[11px] text-slate-400 font-medium px-2 py-0.5 rounded bg-slate-800/70">
                    {item.team_name}
                  </span>
                </div>

                {/* Title */}
                <h4 className="text-sm font-semibold text-slate-100 group-hover:text-white transition">
                  {item.title}
                </h4>

                {/* Humanized Next Action Bar */}
                <div className="mt-2 flex items-start space-x-1.5 text-xs text-amber-200/90 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-xl">
                  <CornerDownRight className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                  <span className="font-medium truncate">
                    <strong className="text-amber-300 font-semibold">Next Step: </strong>
                    {item.next_action}
                  </span>
                </div>
              </div>

              {/* Right Side Controls & SLA */}
              <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center gap-2 shrink-0 border-t md:border-t-0 pt-2 md:pt-0 border-slate-800">
                {/* SLA countdown */}
                <div>{getSlaIndicator(item.sla_deadline, item.status, item.sla_status)}</div>

                {/* Assignee / Claim Button */}
                <div className="flex items-center space-x-2">
                  {isUnassigned ? (
                    <button
                      onClick={(e) => onClaimItem(item, e)}
                      className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/60 border border-indigo-500/40 text-xs font-semibold text-indigo-200 hover:text-white transition flex items-center space-x-1"
                      title="Atomic OCC Claim"
                    >
                      <UserIcon className="h-3 w-3" />
                      <span>Claim Item</span>
                    </button>
                  ) : (
                    <div className="flex items-center space-x-1.5 text-xs text-slate-300 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60">
                      <div className="h-2 w-2 rounded-full bg-emerald-400"></div>
                      <span className="truncate max-w-[120px]">
                        {isAssignedToMe ? 'Assigned to You' : item.assignee_name}
                      </span>
                    </div>
                  )}

                  <div className="text-slate-500 group-hover:text-slate-300 transition pl-1 hidden sm:block">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
