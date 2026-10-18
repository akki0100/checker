import React, { useState, useEffect, useCallback } from 'react';
import { WorkItem, User, Team, OperationalMetrics, ConcurrencyConflict } from './types';
import { api, getActiveUserId, setActiveUserId } from './api/client';
import { Navbar } from './components/Navbar';
import { MetricCards } from './components/MetricCards';
import { FilterBar } from './components/FilterBar';
import { WorkItemList } from './components/WorkItemList';
import { WorkItemDetail } from './components/WorkItemDetail';
import { CreateItemModal } from './components/CreateItemModal';
import { ConflictResolutionModal } from './components/ConflictResolutionModal';
import { ResilienceLabModal } from './components/ResilienceLabModal';
import { OutboxMonitorModal } from './components/OutboxMonitorModal';

export const App: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [metrics, setMetrics] = useState<OperationalMetrics | null>(null);

  // Queue state
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('');
  const [activeFilterPreset, setActiveFilterPreset] = useState('ALL');

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isResilienceLabOpen, setIsResilienceLabOpen] = useState(false);
  const [isOutboxOpen, setIsOutboxOpen] = useState(false);
  const [activeConflict, setActiveConflict] = useState<ConcurrencyConflict | null>(null);

  // Initialize users & teams
  useEffect(() => {
    async function init() {
      try {
        const [fetchedUsers, fetchedTeams] = await Promise.all([
          api.getUsers(),
          api.getTeams(),
        ]);
        setUsers(fetchedUsers);
        setTeams(fetchedTeams);

        const savedId = getActiveUserId();
        const active = fetchedUsers.find((u) => u.id === savedId) || fetchedUsers[0] || null;
        setCurrentUser(active);
      } catch (e) {
        console.error('Failed to load metadata:', e);
      }
    }
    init();
  }, []);

  // Fetch metrics & items
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { q: searchQuery };

      if (selectedTeam) params.team_id = selectedTeam;
      if (selectedStatus) params.status = selectedStatus;
      if (selectedPriority) params.priority = selectedPriority;

      // Handle preset logic
      if (activeFilterPreset === 'MY_WORK' && currentUser) {
        params.assignee_id = currentUser.id;
      } else if (activeFilterPreset === 'NEEDS_APPROVAL') {
        params.needs_approval = 'true';
      } else if (activeFilterPreset === 'UNASSIGNED') {
        params.unassigned = 'true';
      } else if (activeFilterPreset === 'CRITICAL') {
        params.priority = 'P0_CRITICAL';
      } else if (activeFilterPreset === 'SLA_RISK') {
        // Will be matched in list
      }

      const [itemsRes, metricsRes] = await Promise.all([
        api.getWorkItems(params),
        api.getMetrics(),
      ]);

      let resultItems = itemsRes.data;
      if (activeFilterPreset === 'SLA_RISK') {
        resultItems = resultItems.filter(
          (i) =>
            (i.sla_status === 'AT_RISK' || i.sla_status === 'BREACHED') &&
            i.status !== 'RESOLVED' &&
            i.status !== 'CLOSED'
        );
      }

      setItems(resultItems);
      setMetrics(metricsRes);
    } catch (e) {
      console.error('Failed to fetch operational items:', e);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedTeam, selectedStatus, selectedPriority, activeFilterPreset, currentUser]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Persona switcher handler
  const handleSelectUser = (user: User) => {
    setCurrentUser(user);
    setActiveUserId(user.id);
  };

  // 1-Click claim from queue with atomic OCC
  const handleQuickClaim = async (item: WorkItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.claimWorkItem(item.id, item.version);
      loadData();
    } catch (err: any) {
      if (err.status === 409) {
        setActiveConflict(err.data);
      } else {
        alert(err.message || 'Failed to claim item');
      }
    }
  };

  // 1-Click reset demo data
  const handleResetDemo = async () => {
    try {
      await api.resetDemo();
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-indigo-500 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        currentUser={currentUser}
        users={users}
        onSelectUser={handleSelectUser}
        onOpenResilienceLab={() => setIsResilienceLabOpen(true)}
        onOpenOutboxMonitor={() => setIsOutboxOpen(true)}
        onResetDemo={handleResetDemo}
      />

      {/* Main Workspace Dashboard */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Metric Cards Banner */}
        <MetricCards
          metrics={metrics}
          activeFilter={activeFilterPreset}
          onFilterSelect={(preset) => setActiveFilterPreset(preset)}
        />

        {/* Filter Controls & Search */}
        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedTeam={selectedTeam}
          onTeamChange={setSelectedTeam}
          selectedStatus={selectedStatus}
          onStatusChange={setSelectedStatus}
          selectedPriority={selectedPriority}
          onPriorityChange={setSelectedPriority}
          teams={teams}
          onCreateNew={() => setIsCreateOpen(true)}
          activeFilterPreset={activeFilterPreset}
          onPresetSelect={setActiveFilterPreset}
        />

        {/* Queue List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span className="font-semibold uppercase tracking-wider">
              Operational Work Stream ({items.length} items)
            </span>
            <span className="text-[11px] text-slate-500">
              Auto-refreshed with Optimistic Concurrency Control (OCC)
            </span>
          </div>

          <WorkItemList
            items={items}
            loading={loading}
            selectedItemId={selectedItemId}
            onSelectItem={(item) => setSelectedItemId(item.id)}
            onClaimItem={handleQuickClaim}
            currentUser={currentUser}
          />
        </div>
      </main>

      {/* Detail Slide-over Drawer */}
      {selectedItemId && (
        <WorkItemDetail
          itemId={selectedItemId}
          onClose={() => setSelectedItemId(null)}
          currentUser={currentUser}
          onItemUpdated={loadData}
          onTriggerConflict={(conflict) => setActiveConflict(conflict)}
        />
      )}

      {/* Create Work Item Modal */}
      <CreateItemModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        teams={teams}
        onItemCreated={loadData}
      />

      {/* Concurrency Conflict Resolution Modal (OCC 409) */}
      <ConflictResolutionModal
        conflict={activeConflict}
        onClose={() => setActiveConflict(null)}
        onReload={loadData}
      />

      {/* Interactive Resilience & Concurrency Lab */}
      <ResilienceLabModal
        isOpen={isResilienceLabOpen}
        onClose={() => setIsResilienceLabOpen(false)}
        onDataMutated={loadData}
      />

      {/* Transactional Outbox Background Worker Modal */}
      <OutboxMonitorModal
        isOpen={isOutboxOpen}
        onClose={() => setIsOutboxOpen(false)}
      />
    </div>
  );
};

export default App;
