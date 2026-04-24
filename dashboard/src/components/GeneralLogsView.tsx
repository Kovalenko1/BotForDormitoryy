import React, { useEffect, useState } from 'react';
import { Activity, ArrowRightLeft, MessageSquare } from 'lucide-react';
import { cn } from '../lib/utils';
import { ApiError, dashboardApi } from '../api';
import { formatMoscowDateTime } from '../lib/time';
import type { GeneralLogItem } from '../types';

export function GeneralLogsView() {
  const [logs, setLogs] = useState<GeneralLogItem[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isActive = true;

    dashboardApi.getGeneralLogs()
      .then((payload) => {
        if (!isActive) {
          return;
        }

        setLogs(payload.items);
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setErrorMessage(error instanceof ApiError ? error.message : 'Не удалось загрузить журнал.');
      });

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 pb-8 pt-4 sm:px-6 lg:px-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-8 flex flex-col gap-1">
        <p className="text-xs uppercase tracking-[0.3em] text-[#808080] font-semibold">Живой журнал событий и сообщений.</p>
        <h2 className="text-3xl font-serif italic text-white tracking-tight">Лента системы</h2>
      </header>

      <div className="bg-[#0C0C0C] border border-[#1F1F1F] rounded-2xl overflow-hidden">
        <div className="divide-y divide-[#1F1F1F]">
          {errorMessage && (
            <div className="p-5 text-[#FF6B57] bg-[#2A1616]/40">{errorMessage}</div>
          )}

          {logs.map((log) => {
            const isBotEvent = log.type === 'event';
            const isIncoming = log.type === 'incoming';
            const isOutgoing = log.type === 'outgoing';
            const isError = log.status === 'не доставлено';

            return (
              <div key={log.id} className="flex gap-4 p-4 transition-colors hover:bg-[#111111] sm:gap-5 sm:p-5">
                <div className="mt-1 flex-shrink-0 opacity-70">
                  {isBotEvent && <Activity className="w-5 h-5 text-[#34C759]" />}
                  {isIncoming && <MessageSquare className="w-5 h-5 text-[#808080]" />}
                  {isOutgoing && <ArrowRightLeft className="w-5 h-5 text-[#E0E0E0]" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
                    <p className="text-sm font-semibold text-[#B0B0B0]">
                      {log.title}
                    </p>
                    <time className="text-[10px] text-[#505050] font-mono flex-shrink-0">
                      {formatMoscowDateTime(log.timestamp)}
                    </time>
                  </div>

                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#505050] mt-2">{log.subtitle}</p>

                  <div className="mt-2">
                    <p className={cn(
                      'text-sm leading-relaxed',
                      isBotEvent ? 'text-[#808080] font-mono' : 'text-[#E0E0E0]'
                    )}>
                      {log.text}
                    </p>
                  </div>

                  {isError && (
                    <div className="mt-3 p-3 bg-[#2A1616]/50 border border-[#FF3B30]/30 rounded-xl">
                      <p className="text-[11px] text-[#A0A0A0]">
                        Ошибка: <span className="text-[#FF3B30] font-mono uppercase">{log.error_message}</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {!errorMessage && logs.length === 0 && (
            <div className="p-10 text-center text-[#505050]">В доступной вам зоне пока нет новых записей.</div>
          )}
        </div>
      </div>
    </div>
  );
}
