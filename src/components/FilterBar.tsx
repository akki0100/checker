import React from 'react';
import { Team } from '../types';
import { Search, Plus, Filter, X } from 'lucide-react';

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedTeam: string;
  onTeamChange: (teamId: string) => void;
  selectedStatus: string;
  onStatusChange: (status: string) => void;
  selectedPriority: string;
  onPriorityChange: (priority: string) => void;
  teams: Team[];
  onCreateNew: () => void;
  activeFilterPreset: string;
  onPresetSelect: (preset: string) => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchQuery,
  onSearchChange,
  selectedTeam,
  onTeamChange,
  selectedStatus,
  onStatusChange,
  selectedPriority,
  onPriorityChange,
  teams,
  onCreateNew,
  activeFilterPreset,
  onPresetSelect,
}) => {
  const presets = [
    { id: 'ALL', label: 'All Items' },
    { id: 'MY_WORK', label: 'Assigned to Me' },
    { id: 'NEEDS_APPROVAL', label: 'Awaiting Approvals' },
    { id: 'UNASSIGNED', label: 'Unassigned Triage' },
    { id: 'CRITICAL', label: 'P0 / Critical' },
  ];

  const hasActiveFilters =
    searchQuery || selectedTeam || selectedStatus || selectedPriority || activeFilterPreset !== 'ALL';

  const clearAllFilters = () => {
    onSearchChange('');
    onTeamChange('');
    onStatusChange('');
    onPriorityChange('');
    onPresetSelect('ALL');
  };

  return (
    <div className="space-y-3">
      {/* Top Filter Controls */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search operational work by ID, title, keyword or error..."
            className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Dropdowns */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 md:pb-0">
          {/* Team Dropdown */}
          <select
            value={selectedTeam}
            onChange={(e) => onTeamChange(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          >
            <option value="">All Teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          {/* Status Dropdown */}
          <select
            value={selectedStatus}
            onChange={(e) => onStatusChange(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          >
            <option value="">All Statuses</option>
            <option value="TRIAGE">Triage</option>
            <option value="INVESTIGATING">Investigating</option>
            <option value="PENDING_APPROVAL">Pending Approval</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>

          {/* Priority Dropdown */}
          <select
            value={selectedPriority}
            onChange={(e) => onPriorityChange(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          >
            <option value="">All Priorities</option>
            <option value="P0_CRITICAL">P0 Critical</option>
            <option value="P1_HIGH">P1 High</option>
            <option value="P2_MEDIUM">P2 Medium</option>
            <option value="P3_LOW">P3 Low</option>
          </select>

          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1.5 flex items-center space-x-1"
              title="Clear filters"
            >
              <X className="h-3.5 w-3.5" />
              <span>Reset</span>
            </button>
          )}

          {/* + New Item Button */}
          <button
            onClick={onCreateNew}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            <span>New Item</span>
          </button>
        </div>
      </div>

      {/* Preset Pills */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-xs">
        <span className="text-slate-400 font-medium flex items-center space-x-1 pl-1">
          <Filter className="h-3 w-3" />
          <span>Views:</span>
        </span>
        {presets.map((preset) => {
          const isSelected = activeFilterPreset === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => onPresetSelect(preset.id)}
              className={`px-3 py-1 rounded-lg font-medium transition ${
                isSelected
                  ? 'bg-indigo-500 text-white shadow-sm'
                  : 'bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/60'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
