import React, { useEffect, useState } from 'react';
import { AlertTriangle, Bot, ServerCrash } from 'lucide-react';
import { ApiError, dashboardApi } from '../api';
import { formatMoscowDateTime } from '../lib/time';
import type { ErrorLogItem } from '../types';

export function ErrorsView() {
  const [allErrors, setAllErrors] = useState<ErrorLogItem[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isActive = true;

    dashboardApi.getErrors()
      .then((payload) => {
        if (!isActive) {
          return;
        }

        setAllErrors(payload.items);
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setErrorMessage(error instanceof ApiError ? error.message : 'Не удалось загрузить ошибки.');
      });

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 pb-8 pt-4 sm:px-6 lg:px-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#FF3B30] font-semibold mb-1">Сводка недоставленных сообщений и ошибок.</p>
          <h2 className="text-3xl font-serif italic text-[#E0E0E0] tracking-tight">Системные сбои</h2>
        </div>
        <div className="bg-[#2A1616]/50 text-[#FF4D4D] px-4 py-2 rounded-full border border-[#FF3B30]/20 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          <span className="font-mono text-xs">{allErrors.length} проблем</span>
        </div>
      </header>

      {errorMessage && (
        <div className="bg-[#2A1616]/50 border border-[#FF3B30]/30 rounded-2xl p-6 text-[#E0E0E0]">
          {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {allErrors.map((error) => (
          <div key={error.id} className="bg-[#111111] border border-[#1F1F1F] rounded-xl p-6 relative overflow-hidden hover:border-[#303030] transition-colors group ring-1 ring-[#FF3B30]/30 shadow-lg">
            <div className="absolute top-0 left-0 w-1 h-full bg-[#FF3B30]/50 group-hover:bg-[#FF3B30] transition-colors" />

            <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
              <div className="flex-shrink-0 mt-1">
                {error.type === 'notification' ? (
                  <ServerCrash className="w-6 h-6 text-[#FF4D4D] opacity-80" />
                ) : (
                  <Bot className="w-6 h-6 text-[#FF8080] opacity-80" />
                )}
              </div>

              <div className="flex-1">
                <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <h3 className="text-[#E0E0E0] font-medium text-lg">{error.message}</h3>
                  <time className="text-sm font-mono text-[#808080]">
                    {formatMoscowDateTime(error.timestamp)}
                  </time>
                </div>

                <div className="mt-4 flex flex-col gap-3 border-t border-[#1F1F1F] bg-[#080808] px-6 py-4 sm:-mx-6 sm:-mb-6 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-mono text-[#808080]">Контекст: {error.context}</p>
                  <span className="text-[10px] uppercase tracking-widest text-[#FF3B30] font-semibold">
                    {error.type === 'notification' ? 'уведомление' : 'сообщение'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}

        {!errorMessage && allErrors.length === 0 && (
          <div className="text-center py-32 text-[#505050] border border-dashed border-[#1F1F1F] rounded-2xl">
            <div className="w-16 h-16 rounded-full bg-[#34C759]/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-[#34C759]" />
            </div>
            <p className="text-lg text-[#34C759]">Системных сбоев не обнаружено.</p>
            <p className="mt-2">Всё работает в штатном режиме.</p>
          </div>
        )}
      </div>
    </div>
  );
}
