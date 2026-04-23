import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle, MessageCircle, Users } from 'lucide-react';
import { ApiError, dashboardApi } from '../api';
import { formatMoscowDateTime } from '../lib/time';
import type { DashboardOverviewResponse, ViewType } from '../types';

interface DashboardViewProps {
  onNavigate: (view: ViewType) => void;
}

export function DashboardView({ onNavigate }: DashboardViewProps) {
  const [data, setData] = useState<DashboardOverviewResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isActive = true;

    dashboardApi.getOverview()
      .then((payload) => {
        if (!isActive) {
          return;
        }

        setData(payload);
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setErrorMessage(error instanceof ApiError ? error.message : 'Не удалось загрузить обзор dashboard.');
      });

    return () => {
      isActive = false;
    };
  }, []);

  if (errorMessage) {
      return (
      <div className="px-4 pb-8 pt-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto bg-[#111111] border border-[#2A1616] rounded-2xl p-6 text-[#E0E0E0]">
          {errorMessage}
        </div>
      </div>
    );
  }

  if (!data) {
      return (
      <div className="px-4 pb-8 pt-4 space-y-6 sm:px-6 lg:px-8 animate-in fade-in duration-300">
        <div className="h-8 w-64 bg-[#111111] rounded-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-32 rounded-xl bg-[#111111] border border-[#1F1F1F]" />
          ))}
        </div>
      </div>
    );
  }

  const stats = [
    {
      label: 'Жильцов в доступе',
      value: data.summary.users_count,
      icon: Users,
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
      targetView: 'management' as ViewType,
    },
    {
      label: 'Событий бота',
      value: data.summary.bot_logs_count,
      icon: Activity,
      color: 'text-emerald-400',
      bg: 'bg-emerald-400/10',
      targetView: 'general' as ViewType,
    },
    {
      label: 'Сообщений',
      value: data.summary.messages_count,
      icon: MessageCircle,
      color: 'text-amber-400',
      bg: 'bg-amber-400/10',
      targetView: 'general' as ViewType,
    },
    {
      label: 'Ошибок отправки',
      value: data.summary.failed_count,
      icon: AlertTriangle,
      color: 'text-rose-400',
      bg: 'bg-rose-400/10',
      targetView: 'errors' as ViewType,
    },
  ];

  return (
    <div className="px-4 pb-8 pt-4 space-y-8 sm:px-6 lg:px-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-[#808080] font-semibold mb-1">Метрики и статистика бота общежития.</p>
        <h2 className="text-3xl font-serif italic text-white tracking-tight">Обзор системы</h2>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <button
              key={stat.label}
              onClick={() => onNavigate(stat.targetView)}
              className="bg-[#111111] border border-[#1F1F1F] rounded-xl p-6 hover:border-[#303030] transition-colors text-left"
            >
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${stat.bg}`}>
                  <Icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-[#808080] text-[11px] uppercase tracking-widest font-bold">{stat.label}</p>
                  <p className="text-3xl font-semibold text-white mt-1">{stat.value}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section className="overflow-hidden bg-[#111111] border border-[#1F1F1F] rounded-xl p-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <h3 className="text-lg font-medium text-[#B0B0B0]">Недавняя активность</h3>
            <button onClick={() => onNavigate('general')} className="text-xs uppercase tracking-[0.2em] text-[#707070] hover:text-[#E0E0E0]">
              В журнал
            </button>
          </div>
          <div className="space-y-4">
            {data.recent_activity.map((item) => (
              <div key={item.id} className="flex min-w-0 items-start gap-4">
                <div className="w-2 h-2 mt-2 rounded-full bg-[#34C759] shadow-[0_0_8px_rgba(52,199,89,0.3)]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#E0E0E0]">{item.title}</p>
                  <p className="text-xs uppercase tracking-[0.2em] text-[#505050] mt-1">{item.subtitle}</p>
                  <p className="mt-2 text-sm text-[#B0B0B0] break-words [overflow-wrap:anywhere]">{item.text}</p>
                  <p className="text-xs text-[#505050] font-mono mt-2">{formatMoscowDateTime(item.timestamp)}</p>
                </div>
              </div>
            ))}
            {data.recent_activity.length === 0 && (
              <p className="text-[#505050] text-sm">В доступном scope пока нет недавней активности.</p>
            )}
          </div>
        </section>

        <section className="overflow-hidden bg-[#111111] border border-[#1F1F1F] rounded-xl p-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <h3 className="text-lg font-medium text-[#B0B0B0]">Недавние ошибки</h3>
            <button onClick={() => onNavigate('errors')} className="text-xs uppercase tracking-[0.2em] text-[#707070] hover:text-[#E0E0E0]">
              К ошибкам
            </button>
          </div>
          <div className="space-y-4">
            {data.recent_errors.map((item) => (
              <div key={item.id} className="flex min-w-0 items-start gap-4">
                <div className="w-2 h-2 mt-2 rounded-full bg-[#FF3B30] shadow-[0_0_8px_rgba(255,59,48,0.3)]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#E0E0E0] break-words [overflow-wrap:anywhere]">{item.message}</p>
                  <p className="mt-1 text-xs text-[#808080] break-words [overflow-wrap:anywhere]">{item.context}</p>
                  <p className="text-xs text-[#505050] font-mono mt-2">{formatMoscowDateTime(item.timestamp)}</p>
                </div>
              </div>
            ))}
            {data.recent_errors.length === 0 && (
              <p className="text-[#505050] text-sm">Ошибок отправки в доступном scope пока нет.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
