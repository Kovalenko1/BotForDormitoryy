import React from 'react';
import {
  Activity,
  AlertOctagon,
  CalendarDays,
  LayoutDashboard,
  MessageSquare,
  Settings2,
  Users,
} from 'lucide-react';
import { cn } from '../lib/utils';
import type { DashboardSessionResponse, ViewType } from '../types';

interface SidebarProps {
  currentView: ViewType;
  onChangeView: (view: ViewType) => void;
  session: DashboardSessionResponse;
}

const roleLabels: Record<string, string> = {
  admin: 'Администратор',
  chairman: 'Председатель',
  starosta: 'Староста',
  user: 'Жилец',
};

const navConfig = [
  { id: 'dashboard', label: 'Дашборд', icon: LayoutDashboard },
  { id: 'general', label: 'Журнал', icon: Activity },
  { id: 'users', label: 'История пользователей', icon: Users },
  { id: 'errors', label: 'Ошибки и сбои', icon: AlertOctagon },
  { id: 'schedule', label: 'График', icon: CalendarDays },
  { id: 'management', label: 'Управление', icon: Settings2 },
] as const satisfies ReadonlyArray<{ id: ViewType; label: string; icon: typeof LayoutDashboard }>;

function getDesktopNavClasses(view: ViewType, isActive: boolean) {
  if (!isActive) {
    if (view === 'schedule') {
      return 'text-[#5f748e] hover:bg-[#121a25] hover:text-[#dbe9ff]';
    }

    if (view === 'management') {
      return 'text-[#627868] hover:bg-[#131c17] hover:text-[#e0f1e6]';
    }

    return 'text-[#505050] hover:bg-[#161616] hover:text-[#B0B0B0]';
  }

  if (view === 'schedule') {
    return 'border border-[#2f4e72] bg-[linear-gradient(135deg,#101d2f_0%,#152840_100%)] text-[#e4f0ff] shadow-[0_14px_34px_rgba(17,39,64,0.28)]';
  }

  if (view === 'management') {
    return 'border border-[#355140] bg-[linear-gradient(135deg,#111d17_0%,#18261f_100%)] text-[#e1f2e7] shadow-[0_14px_34px_rgba(17,44,28,0.24)]';
  }

  return 'bg-[#1F1F1F] text-[#E0E0E0]';
}

function getMobileNavClasses(view: ViewType, isActive: boolean) {
  if (!isActive) {
    if (view === 'schedule') {
      return 'bg-[#10151d] text-[#7893b8] border-[#1e2a37]';
    }

    if (view === 'management') {
      return 'bg-[#101712] text-[#77917d] border-[#1d2a21]';
    }

    return 'bg-[#111111] text-[#707070] border-[#1F1F1F]';
  }

  if (view === 'schedule') {
    return 'bg-[linear-gradient(135deg,#112034_0%,#18304a_100%)] text-[#e8f3ff] border-[#32587f]';
  }

  if (view === 'management') {
    return 'bg-[linear-gradient(135deg,#122017_0%,#1a2d21_100%)] text-[#e4f3e8] border-[#3c6147]';
  }

  return 'bg-[#1F1F1F] text-[#E0E0E0] border-[#303030]';
}

function getIconClasses(view: ViewType, isActive: boolean) {
  if (!isActive) {
    if (view === 'schedule') {
      return 'text-[#6f8eb6]';
    }

    if (view === 'management') {
      return 'text-[#7c9a84]';
    }

    return 'text-[#505050]';
  }

  if (view === 'schedule') {
    return 'text-[#8fb6ef]';
  }

  if (view === 'management') {
    return 'text-[#93ddb1]';
  }

  return 'text-[#E0E0E0]';
}

export function Sidebar({ currentView, onChangeView, session }: SidebarProps) {
  const navItems = navConfig.filter((item) => session.allowed_views.includes(item.id));
  const scopeLabel = session.scope === 'floor'
    ? `Этаж ${session.user.floor ?? 'не указан'}`
    : 'Все этажи';

  return (
    <>
      <div className="md:hidden border-b border-[#1F1F1F] bg-[#0C0C0C] px-4 py-4 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-[#808080] font-semibold">Портал общежития</p>
            <h1 className="text-xl font-serif italic text-white">Dormitory Control</h1>
          </div>
          <div className="text-right">
            <p className="text-sm text-[#E0E0E0] font-medium">{session.user.display_name}</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#707070]">{scopeLabel}</p>
          </div>
        </div>

        <nav className="flex gap-2 overflow-x-auto pb-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onChangeView(item.id)}
                className={cn(
                  'flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-full text-sm border transition-colors',
                  getMobileNavClasses(item.id, isActive)
                )}
              >
                <Icon className={cn('w-4 h-4', getIconClasses(item.id, isActive))} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      <aside className="w-72 bg-[#0C0C0C] border-r border-[#1F1F1F] flex-col hidden md:flex">
        <div className="p-6">
          <h1 className="text-xl font-bold text-white flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-[#080808]">
              <MessageSquare className="w-4 h-4" strokeWidth={3} />
            </div>
            Dormitory Control
          </h1>
          <p className="text-[#808080] text-[10px] mt-3 font-semibold uppercase tracking-[0.2em] leading-normal">
            График, журнал, ошибки и управление дежурствами
          </p>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onChangeView(item.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-transparent text-sm font-medium transition-all duration-200',
                  getDesktopNavClasses(item.id, isActive)
                )}
              >
                <Icon className={cn('w-5 h-5 opacity-90', getIconClasses(item.id, isActive))} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#1F1F1F]">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-[#111111] text-[#E0E0E0] border border-[#303030] flex items-center justify-center font-bold text-xs ring-1 ring-[#1F1F1F]">
              {session.user.display_name.slice(0, 1).toUpperCase()}
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-[#E0E0E0]">{session.user.display_name}</p>
              <p className="text-[11px] text-[#505050]">{roleLabels[session.user.role] ?? session.user.role} · {scopeLabel}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
