import React, { useState, useRef, useEffect } from 'react';
import { User } from '../types';
import { Activity, ShieldAlert, Cpu, RefreshCw, ChevronDown, Check, Zap, Server } from 'lucide-react';

interface NavbarProps {
  currentUser: User | null;
  users: User[];
  onSelectUser: (user: User) => void;
  onOpenResilienceLab: () => void;
  onOpenOutboxMonitor: () => void;
  onResetDemo: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  users,
  onSelectUser,
  onOpenResilienceLab,
  onOpenOutboxMonitor,
  onResetDemo,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleReset = async () => {
    if (confirm('Reset entire system database to clean initial Newtonite demo state?')) {
      setResetting(true);
      await onResetDemo();
      setResetting(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand identity */}
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-sky-400 p-0.5 shadow-lg shadow-indigo-500/20 flex items-center justify-center">
            <div className="h-full w-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Activity className="h-5 w-5 text-indigo-400 animate-pulse" />
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-lg tracking-tight text-white">checker</span>
              <span className="text-xs px-2 py-0.5 font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full">
                OpsPulse v2.4
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Operational Work Coordination & Incident Command
            </p>
          </div>
        </div>

        {/* Global Control Badges & Persona Switcher */}
        <div className="flex items-center space-x-3">
          {/* Outbox Background Worker Status Pill */}
          <button
            onClick={onOpenOutboxMonitor}
            className="hidden md:flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/70 text-xs text-slate-300 transition-colors"
            title="Inspect Asynchronous Transactional Outbox Worker & Dead-Letter Queue"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <Server className="h-3.5 w-3.5 text-slate-400" />
            <span>Outbox Worker</span>
          </button>

          {/* Interactive Concurrency & Resilience Lab Button */}
          <button
            onClick={onOpenResilienceLab}
            className="flex items-center space-x-2 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 border border-amber-500/40 text-xs font-semibold text-amber-200 shadow-sm transition-all"
          >
            <Zap className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
            <span>Concurrency Lab</span>
          </button>

          {/* 1-Click Demo Reset */}
          <button
            onClick={handleReset}
            disabled={resetting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent hover:border-slate-700 transition"
            title="Reset database to fresh seed state"
          >
            <RefreshCw className={`h-4 w-4 ${resetting ? 'animate-spin text-indigo-400' : ''}`} />
          </button>

          <div className="h-6 w-px bg-slate-800" />

          {/* Persona Switcher Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center space-x-2.5 p-1.5 pr-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-left transition shadow-sm"
            >
              <img
                src={currentUser?.avatar_url || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=face'}
                alt={currentUser?.name}
                className="h-8 w-8 rounded-lg object-cover ring-1 ring-indigo-500/40"
              />
              <div className="hidden sm:block text-xs leading-tight">
                <div className="font-semibold text-slate-200 flex items-center space-x-1.5">
                  <span>{currentUser?.name || 'Select Persona'}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider ${
                      currentUser?.role === 'ADMIN'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : currentUser?.role === 'LEAD'
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                        : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {currentUser?.role}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 truncate max-w-[140px]">
                  {currentUser?.team_name || currentUser?.title}
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-2 border-b border-slate-800">
                  <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">
                    Switch Test Persona
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Test RBAC permissions & approval gates across roles
                  </p>
                </div>

                <div className="py-1 max-h-80 overflow-y-auto">
                  {users.map((u) => {
                    const isSelected = u.id === currentUser?.id;
                    return (
                      <button
                        key={u.id}
                        onClick={() => {
                          onSelectUser(u);
                          setDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2.5 flex items-center space-x-3 transition ${
                          isSelected
                            ? 'bg-indigo-600/15 text-indigo-200 border-l-2 border-indigo-500'
                            : 'hover:bg-slate-800/80 text-slate-300'
                        }`}
                      >
                        <img
                          src={u.avatar_url}
                          alt={u.name}
                          className="h-9 w-9 rounded-lg object-cover ring-1 ring-slate-700"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold truncate text-slate-100">
                              {u.name}
                            </span>
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                                u.role === 'ADMIN'
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : u.role === 'LEAD'
                                  ? 'bg-indigo-500/20 text-indigo-300'
                                  : 'bg-slate-700 text-slate-400'
                              }`}
                            >
                              {u.role}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 truncate">{u.title}</p>
                          <p className="text-[10px] text-slate-500 truncate">{u.team_name}</p>
                        </div>
                        {isSelected && <Check className="h-4 w-4 text-indigo-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
