import React, { useState } from 'react';
import { Team } from '../types';
import { api } from '../api/client';
import { v4 as uuidv4 } from 'uuid';
import { X, Plus, Sparkles } from 'lucide-react';

interface CreateItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  teams: Team[];
  onItemCreated: () => void;
}

export const CreateItemModal: React.FC<CreateItemModalProps> = ({
  isOpen,
  onClose,
  teams,
  onItemCreated,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('INCIDENT');
  const [priority, setPriority] = useState('P1_HIGH');
  const [teamId, setTeamId] = useState(teams[0]?.id || 'team_eng');
  const [impactSummary, setImpactSummary] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const presets = [
    {
      label: 'Payment Ledger Anomaly',
      title: 'Discrepancy in Settlement Batch #902',
      category: 'PAYMENT_INVESTIGATION',
      priority: 'P0_CRITICAL',
      teamId: 'team_payments',
      impact: '$38,200 unreconciled variance across 14 merchants',
      approval: true,
      desc: 'Nightly settlement batch report revealed un-reconciled debit events on merchant partner accounts. Requires investigation and lead authorization before manual settlement override.',
    },
    {
      label: 'Production DB Slowdown',
      title: 'Database connection starvation on primary cluster',
      category: 'INCIDENT',
      priority: 'P0_CRITICAL',
      teamId: 'team_eng',
      impact: '2,500 checkout requests delayed or dropped',
      approval: false,
      desc: 'Active DB client connections exceeded 95% threshold. SRE team investigating long-running analytical query blocking write transactions.',
    },
    {
      label: 'KYC Sanctions Clearance',
      title: 'Sanctions match verification for corporate partner',
      category: 'COMPLIANCE_REQUEST',
      priority: 'P1_HIGH',
      teamId: 'team_compliance',
      impact: '$1.2M treasury withdrawal pending compliance approval',
      approval: true,
      desc: 'Screening hit on beneficial owner of subsidiary company. Requires legal review of documentation and Director of Compliance sign-off.',
    },
  ];

  const applyPreset = (preset: (typeof presets)[0]) => {
    setTitle(preset.title);
    setCategory(preset.category);
    setPriority(preset.priority);
    setTeamId(preset.teamId);
    setImpactSummary(preset.impact);
    setRequiresApproval(preset.approval);
    setDescription(preset.desc);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description || !teamId) return;

    setSubmitting(true);
    try {
      const idempotencyKey = `create-${uuidv4()}`;
      await api.createWorkItem(
        {
          title,
          description,
          category,
          priority,
          team_id: teamId,
          impact_summary: impactSummary || 'Operational request requiring team triage',
          requires_approval: requiresApproval,
        },
        idempotencyKey
      );
      onItemCreated();
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to create work item');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-base font-bold text-white">Log Operational Work Item</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Initiate operational triage for incidents, investigations, or approval requests
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Realistic Presets */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-semibold text-slate-400 flex items-center space-x-1">
            <Sparkles className="h-3 w-3 text-indigo-400" />
            <span>Quick-Fill Realistic Operational Scenario:</span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => applyPreset(p)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-indigo-600/30 border border-slate-700 hover:border-indigo-500/50 text-[11px] font-medium text-slate-300 hover:text-indigo-200 transition"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5 pt-1">
          <div>
            <label className="text-xs font-medium text-slate-300">Title / Headline</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Gateway 504 timeouts on European checkout..."
              className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="text-xs font-medium text-slate-300">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-200"
              >
                <option value="INCIDENT">Incident</option>
                <option value="PAYMENT_INVESTIGATION">Payment Investigation</option>
                <option value="CUSTOMER_ESCALATION">Customer Escalation</option>
                <option value="COMPLIANCE_REQUEST">Compliance Request</option>
                <option value="OPS_APPROVAL">Ops Approval</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300">Priority (SLA)</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-200"
              >
                <option value="P0_CRITICAL">P0 Critical (1h SLA)</option>
                <option value="P1_HIGH">P1 High (4h SLA)</option>
                <option value="P2_MEDIUM">P2 Medium (24h SLA)</option>
                <option value="P3_LOW">P3 Low (72h SLA)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300">Owning Team</label>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-200"
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-300">Business / Exposure Impact Summary</label>
            <input
              type="text"
              value={impactSummary}
              onChange={(e) => setImpactSummary(e.target.value)}
              placeholder="e.g. $45,000 transaction exposure, 1,200 users impacted..."
              className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-300">Operational Context & Steps</label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detail the operational anomaly, steps observed, logs or customer reference..."
              className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>

          <div className="flex items-center space-x-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800">
            <input
              type="checkbox"
              id="requires_approval"
              checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="requires_approval" className="text-xs text-slate-300 cursor-pointer">
              Enforce formal Lead sign-off gate before item can be marked Resolved
            </label>
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md flex items-center space-x-1.5 transition"
            >
              <Plus className="h-4 w-4" />
              <span>{submitting ? 'Registering...' : 'Create Operational Item'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
