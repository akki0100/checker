import React, { useState, useEffect } from 'react';
import { WorkItem, AuditEvent, Comment, User } from '../types';
import { api } from '../api/client';
import {
  X,
  Clock,
  Shield,
  CheckCircle2,
  AlertTriangle,
  History,
  MessageSquare,
  Send,
  Edit3,
  UserCheck,
  ArrowRightCircle,
  FileText,
  CornerDownRight,
  Info
} from 'lucide-react';

interface WorkItemDetailProps {
  itemId: string;
  onClose: () => void;
  currentUser: User | null;
  onItemUpdated: () => void;
  onTriggerConflict: (conflict: any) => void;
}

export const WorkItemDetail: React.FC<WorkItemDetailProps> = ({
  itemId,
  onClose,
  currentUser,
  onItemUpdated,
  onTriggerConflict,
}) => {
  const [data, setData] = useState<{ item: WorkItem; history: AuditEvent[]; comments: Comment[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'DETAILS' | 'HISTORY' | 'COMMENTS'>('DETAILS');

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editImpact, setEditImpact] = useState('');
  const [editNextAction, setEditNextAction] = useState('');
  const [saving, setSaving] = useState(false);

  // Status transition state
  const [targetStatus, setTargetStatus] = useState<string>('');
  const [transitionNote, setTransitionNote] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  // Approval state
  const [approvalDecision, setApprovalDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [approvalNote, setApprovalNote] = useState('');
  const [submittingApproval, setSubmittingApproval] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  // Comment state
  const [commentText, setCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  const loadItem = async () => {
    try {
      setLoading(true);
      const res = await api.getWorkItem(itemId);
      setData(res);
      setEditTitle(res.item.title);
      setEditDesc(res.item.description);
      setEditPriority(res.item.priority);
      setEditImpact(res.item.impact_summary);
      setEditNextAction(res.item.next_action);
    } catch (err: any) {
      console.error('Failed to load item:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItem();
  }, [itemId]);

  if (loading || !data) {
    return (
      <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-slate-900 border-l border-slate-800 shadow-2xl z-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-indigo-500 border-r-transparent"></div>
          <p className="mt-3 text-sm text-slate-400">Loading work item specifications...</p>
        </div>
      </div>
    );
  }

  const { item, history, comments } = data;

  // Handle Save with OCC check
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateWorkItem(item.id, {
        expected_version: item.version,
        title: editTitle,
        description: editDesc,
        priority: editPriority,
        impact_summary: editImpact,
        next_action: editNextAction,
      });
      setIsEditing(false);
      await loadItem();
      onItemUpdated();
    } catch (err: any) {
      if (err.status === 409 && err.data?.error === 'CONCURRENCY_CONFLICT') {
        // Trigger OCC Conflict Resolution Modal
        onTriggerConflict(err.data);
      } else {
        alert(err.message || 'Failed to save changes');
      }
    } finally {
      setSaving(false);
    }
  };

  // Handle Claim
  const handleClaim = async () => {
    try {
      await api.claimWorkItem(item.id, item.version);
      await loadItem();
      onItemUpdated();
    } catch (err: any) {
      if (err.status === 409) {
        onTriggerConflict(err.data);
      } else {
        alert(err.message || 'Failed to claim item');
      }
    }
  };

  // Handle Transition
  const handleTransition = async () => {
    if (!targetStatus) return;
    setTransitioning(true);
    setTransitionError(null);
    try {
      await api.transitionStatus(item.id, targetStatus, item.version, transitionNote);
      setTargetStatus('');
      setTransitionNote('');
      await loadItem();
      onItemUpdated();
    } catch (err: any) {
      if (err.status === 409) {
        onTriggerConflict(err.data);
      } else {
        setTransitionError(err.message || 'Transition rejected by server');
      }
    } finally {
      setTransitioning(false);
    }
  };

  // Handle Formal Approval Sign-off
  const handleApproval = async () => {
    if (!approvalNote.trim()) {
      setApprovalError('Please provide a mandatory sign-off explanation note.');
      return;
    }
    setSubmittingApproval(true);
    setApprovalError(null);
    try {
      await api.submitApproval(item.id, approvalDecision, item.version, approvalNote);
      setApprovalNote('');
      await loadItem();
      onItemUpdated();
    } catch (err: any) {
      if (err.status === 409) {
        onTriggerConflict(err.data);
      } else {
        setApprovalError(err.message || 'Approval sign-off rejected');
      }
    } finally {
      setSubmittingApproval(false);
    }
  };

  // Handle Add Comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setPostingComment(true);
    try {
      await api.addComment(item.id, commentText);
      setCommentText('');
      await loadItem();
    } catch (err: any) {
      alert(err.message || 'Failed to post comment');
    } finally {
      setPostingComment(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-slate-900 border-l border-slate-800 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-slate-800 flex items-start justify-between bg-slate-950/40">
        <div>
          <div className="flex items-center space-x-2 mb-2">
            <span className="font-mono text-xs font-bold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20">
              {item.id}
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono font-semibold" title="OCC Version">
              Version: v{item.version}
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium">
              {item.category.replace('_', ' ')}
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium">
              {item.team_name}
            </span>
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight leading-snug">
            {item.title}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Humanized Next Action Guidance Banner */}
      <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-3 flex items-start space-x-2.5">
        <CornerDownRight className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
        <div className="text-xs">
          <span className="font-bold text-amber-300 uppercase tracking-wider text-[11px] block">
            What requires attention next:
          </span>
          <p className="text-amber-200 mt-0.5 font-medium leading-relaxed">{item.next_action}</p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-950/20 px-6">
        <button
          onClick={() => setActiveTab('DETAILS')}
          className={`py-3 px-4 text-xs font-semibold border-b-2 transition flex items-center space-x-1.5 ${
            activeTab === 'DETAILS'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>Specifications & Actions</span>
        </button>
        <button
          onClick={() => setActiveTab('HISTORY')}
          className={`py-3 px-4 text-xs font-semibold border-b-2 transition flex items-center space-x-1.5 ${
            activeTab === 'HISTORY'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <History className="h-4 w-4" />
          <span>Audit Timeline ({history.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('COMMENTS')}
          className={`py-3 px-4 text-xs font-semibold border-b-2 transition flex items-center space-x-1.5 ${
            activeTab === 'COMMENTS'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          <span>Team Discussion ({comments.length})</span>
        </button>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeTab === 'DETAILS' && (
          <div className="space-y-6">
            {/* Ownership & Quick Actions Card */}
            <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Work Item Ownership
                </span>
                <span className="text-xs text-slate-400">
                  Logged by: <strong className="text-slate-300">{item.creator_name}</strong>
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex items-center space-x-2.5">
                  <div className="h-9 w-9 rounded-xl bg-slate-700 flex items-center justify-center text-slate-300 font-bold text-sm">
                    {item.assignee_name ? item.assignee_name.charAt(0) : '?'}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-200">
                      {item.assignee_name || 'Currently Unassigned'}
                    </div>
                    <div className="text-xs text-slate-400">
                      {item.assignee_id === currentUser?.id
                        ? 'Assigned to you'
                        : item.assignee_name
                        ? 'Assigned team member'
                        : 'Available to claim'}
                    </div>
                  </div>
                </div>

                {item.assignee_id !== currentUser?.id && (
                  <button
                    onClick={handleClaim}
                    className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow-sm flex items-center space-x-1.5"
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    <span>{item.assignee_id ? 'Reassign to Me' : 'Claim Ownership'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Formal Approval Sign-off Card (Visible if status is PENDING_APPROVAL) */}
            {item.status === 'PENDING_APPROVAL' && (
              <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-slate-900 border border-amber-500/30 space-y-3">
                <div className="flex items-center space-x-2 text-amber-300">
                  <Shield className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Workflow Gate: Formal Approval Required
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  This work item requires explicit sign-off from a Team Lead before it can proceed to final resolution.
                </p>

                {approvalError && (
                  <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300">
                    {approvalError}
                  </div>
                )}

                <div className="space-y-2 pt-1">
                  <label className="text-xs font-medium text-slate-400">Sign-off Rationale / Decision Note</label>
                  <textarea
                    value={approvalNote}
                    onChange={(e) => setApprovalNote(e.target.value)}
                    placeholder="Provide justification or authorization conditions for audit record..."
                    rows={2}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                  <div className="flex items-center space-x-2 pt-1">
                    <button
                      onClick={() => {
                        setApprovalDecision('APPROVE');
                        handleApproval();
                      }}
                      disabled={submittingApproval}
                      className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-sm flex items-center justify-center space-x-1"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Authorize & Approve</span>
                    </button>
                    <button
                      onClick={() => {
                        setApprovalDecision('REJECT');
                        handleApproval();
                      }}
                      disabled={submittingApproval}
                      className="flex-1 py-2 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-bold transition shadow-sm flex items-center justify-center space-x-1"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>Reject & Send Back</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 flex items-center space-x-1">
                    <Info className="h-3 w-3" />
                    <span>Server enforces RBAC: Only owning Team Lead or Admin may authorize.</span>
                  </p>
                </div>
              </div>
            )}

            {/* Workflow State Transition Controls */}
            <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700/80 space-y-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Workflow State Transition
              </span>

              {transitionError && (
                <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300">
                  {transitionError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={targetStatus}
                  onChange={(e) => setTargetStatus(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                >
                  <option value="">Select Target Status...</option>
                  <option value="TRIAGE">Triage</option>
                  <option value="INVESTIGATING">Investigating</option>
                  <option value="PENDING_APPROVAL">Pending Approval</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="CLOSED">Closed</option>
                </select>

                <input
                  type="text"
                  value={transitionNote}
                  onChange={(e) => setTransitionNote(e.target.value)}
                  placeholder="Optional transition reason..."
                  className="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>

              <button
                onClick={handleTransition}
                disabled={!targetStatus || transitioning}
                className="w-full py-2 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-xs font-semibold transition flex items-center justify-center space-x-1.5"
              >
                <ArrowRightCircle className="h-3.5 w-3.5" />
                <span>Execute State Transition (OCC Guarded)</span>
              </button>
            </div>

            {/* Editable Details Form with OCC Version Enforcement */}
            <form onSubmit={handleSave} className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700/80 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-1">
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>Item Details (OCC Protected)</span>
                </span>
                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                  >
                    Edit Fields
                  </button>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400">Title</label>
                <input
                  type="text"
                  disabled={!isEditing}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full mt-1 bg-slate-900 border border-slate-700 disabled:bg-slate-900/50 text-xs text-slate-200 rounded-xl px-3 py-2"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400">Description & Technical Context</label>
                <textarea
                  disabled={!isEditing}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={4}
                  className="w-full mt-1 bg-slate-900 border border-slate-700 disabled:bg-slate-900/50 text-xs text-slate-200 rounded-xl p-3 leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-400">Priority</label>
                  <select
                    disabled={!isEditing}
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value)}
                    className="w-full mt-1 bg-slate-900 border border-slate-700 disabled:bg-slate-900/50 text-xs text-slate-200 rounded-xl px-3 py-2"
                  >
                    <option value="P0_CRITICAL">P0 Critical</option>
                    <option value="P1_HIGH">P1 High</option>
                    <option value="P2_MEDIUM">P2 Medium</option>
                    <option value="P3_LOW">P3 Low</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400">Business / Exposure Impact</label>
                  <input
                    type="text"
                    disabled={!isEditing}
                    value={editImpact}
                    onChange={(e) => setEditImpact(e.target.value)}
                    className="w-full mt-1 bg-slate-900 border border-slate-700 disabled:bg-slate-900/50 text-xs text-slate-200 rounded-xl px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400">Next Action Guidance</label>
                <input
                  type="text"
                  disabled={!isEditing}
                  value={editNextAction}
                  onChange={(e) => setEditNextAction(e.target.value)}
                  className="w-full mt-1 bg-slate-900 border border-slate-700 disabled:bg-slate-900/50 text-xs text-slate-200 rounded-xl px-3 py-2"
                />
              </div>

              {isEditing && (
                <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-700">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setEditTitle(item.title);
                      setEditDesc(item.description);
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition"
                  >
                    {saving ? 'Validating Version...' : 'Save Changes (OCC v' + item.version + ')'}
                  </button>
                </div>
              )}
            </form>
          </div>
        )}

        {/* Audit Timeline Tab */}
        {activeTab === 'HISTORY' && (
          <div className="space-y-4">
            <div className="text-xs text-slate-400 mb-2">
              Full chronological record of version evolutions, state transitions, and actor mutations.
            </div>
            <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
              {history.map((event) => (
                <div key={event.id} className="relative group">
                  <div className="absolute -left-6 top-1 h-2.5 w-2.5 rounded-full bg-indigo-500 ring-4 ring-slate-900"></div>
                  <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200">{event.actor_name}</span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(event.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-mono text-[10px] font-bold">
                        {event.action_type}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        v{event.from_version} → v{event.to_version}
                      </span>
                    </div>
                    {event.note && <p className="text-slate-300 pt-1 italic">"{event.note}"</p>}
                    {event.changes_json && event.changes_json !== '{}' && (
                      <pre className="text-[10px] bg-slate-950 p-2 rounded-lg text-slate-400 overflow-x-auto mt-1 font-mono">
                        {event.changes_json}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comments Tab */}
        {activeTab === 'COMMENTS' && (
          <div className="space-y-4">
            <div className="space-y-3">
              {comments.map((comment) => (
                <div key={comment.id} className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-slate-200">{comment.user_name}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-700 text-slate-300">
                        {comment.user_role}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {new Date(comment.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-slate-200 leading-relaxed">{comment.content}</p>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddComment} className="pt-2">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Share technical findings or collaborate with team..."
                rows={3}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
              <div className="flex justify-end mt-2">
                <button
                  type="submit"
                  disabled={postingComment || !commentText.trim()}
                  className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center space-x-1.5 transition shadow"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Post Note</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
