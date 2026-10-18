import React from 'react';
import { OperationalMetrics } from '../types';
import { Flame, Clock, AlertTriangle, Inbox, UserCheck } from 'lucide-react';

interface MetricCardsProps {
  metrics: OperationalMetrics | null;
  activeFilter: string;
  onFilterSelect: (filter: string) => void;
}

export const MetricCards: React.FC<MetricCardsProps> = ({
  metrics,
  activeFilter,
  onFilterSelect,
}) => {
  if (!metrics) return null;

  const cards = [
    {
      id: 'ALL_OPEN',
      label: 'Active Work',
      count: metrics.open_incidents,
      icon: Flame,
      color: 'from-blue-500/20 to-indigo-500/10 border-blue-500/30 text-blue-400',
      activeBorder: 'ring-2 ring-blue-500 shadow-blue-500/10',
      description: 'Items in triage or investigation',
    },
    {
      id: 'NEEDS_APPROVAL',
      label: 'Pending Approvals',
      count: metrics.pending_approvals,
      icon: Clock,
      color: 'from-amber-500/20 to-yellow-500/10 border-amber-500/30 text-amber-400',
      activeBorder: 'ring-2 ring-amber-500 shadow-amber-500/10',
      description: 'Blocked waiting on Lead sign-off',
    },
    {
      id: 'SLA_RISK',
      label: 'SLA at Risk',
      count: metrics.sla_at_risk,
      icon: AlertTriangle,
      color: 'from-rose-500/20 to-red-500/10 border-rose-500/30 text-rose-400',
      activeBorder: 'ring-2 ring-rose-500 shadow-rose-500/10',
      description: 'Expiring in <60m or breached',
    },
    {
      id: 'UNASSIGNED',
      label: 'Unassigned Triage',
      count: metrics.unassigned_count,
      icon: Inbox,
      color: 'from-purple-500/20 to-fuchsia-500/10 border-purple-500/30 text-purple-400',
      activeBorder: 'ring-2 ring-purple-500 shadow-purple-500/10',
      description: 'Unclaimed operational items',
    },
    {
      id: 'MY_WORK',
      label: 'Assigned to Me',
      count: metrics.my_assigned_count,
      icon: UserCheck,
      color: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-400',
      activeBorder: 'ring-2 ring-emerald-500 shadow-emerald-500/10',
      description: 'Your immediate responsibilities',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        const isSelected = activeFilter === card.id;

        return (
          <button
            key={card.id}
            onClick={() => onFilterSelect(isSelected ? 'ALL' : card.id)}
            className={`p-3.5 rounded-2xl bg-gradient-to-br ${card.color} border text-left transition-all hover:scale-[1.02] active:scale-[0.99] shadow-lg ${
              isSelected ? card.activeBorder : 'border-slate-800/80 bg-slate-900/60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-300 tracking-wide">
                {card.label}
              </span>
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-black tracking-tight text-white">
                {card.count}
              </span>
              <span className="text-[11px] text-slate-400 truncate hidden xl:inline">
                {card.description}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
};
