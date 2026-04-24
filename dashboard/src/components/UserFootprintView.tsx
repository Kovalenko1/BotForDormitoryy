import React, { useDeferredValue, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, MessageCircle, Search, Shield, User } from 'lucide-react';
import { cn } from '../lib/utils';
import { ApiError, dashboardApi } from '../api';
import { formatMoscowTime } from '../lib/time';
import { RoleEnum, UserFootprintResponse, UserListItem } from '../types';

export function UserFootprintView() {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [usersError, setUsersError] = useState('');
  const [usersLoading, setUsersLoading] = useState(true);
  const [footprint, setFootprint] = useState<UserFootprintResponse | null>(null);
  const [footprintError, setFootprintError] = useState('');
  const [footprintLoading, setFootprintLoading] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const historyRef = useRef<HTMLDivElement | null>(null);

  const scrollHistoryToBottom = (behavior: ScrollBehavior = 'auto') => {
    const node = historyRef.current;
    if (!node) {
      return;
    }

    node.scrollTo({ top: node.scrollHeight, behavior });
  };

  useEffect(() => {
    let isActive = true;

    setUsersLoading(true);
    dashboardApi.getUsers({ search: deferredSearch })
      .then((payload) => {
        if (!isActive) {
          return;
        }

        setUsers(payload.items);
        setUsersError('');
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setUsersError(error instanceof ApiError ? error.message : 'Не удалось загрузить список пользователей.');
      })
      .finally(() => {
        if (isActive) {
          setUsersLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [deferredSearch]);

  useEffect(() => {
    if (!selectedUserId) {
      setFootprint(null);
      setFootprintError('');
      return;
    }

    let isActive = true;

    setFootprintLoading(true);
    dashboardApi.getUserFootprint(selectedUserId)
      .then((payload) => {
        if (!isActive) {
          return;
        }

        setFootprint(payload);
        setFootprintError('');
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setFootprintError(error instanceof ApiError ? error.message : 'Не удалось загрузить историю пользователя.');
      })
      .finally(() => {
        if (isActive) {
          setFootprintLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [selectedUserId]);

  useEffect(() => {
    if (!selectedUserId || !historyRef.current) {
      return;
    }

    let secondFrameId = 0;
    const frameId = window.requestAnimationFrame(() => {
      secondFrameId = window.requestAnimationFrame(() => {
        scrollHistoryToBottom('auto');
        setShowScrollToBottom(false);
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      window.cancelAnimationFrame(secondFrameId);
    };
  }, [selectedUserId, footprint?.items.length]);

  useEffect(() => {
    const node = historyRef.current;
    if (!node || !selectedUserId) {
      return;
    }

    const updateScrollButton = () => {
      const distanceToBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
      setShowScrollToBottom(distanceToBottom > 120);
    };

    updateScrollButton();
    node.addEventListener('scroll', updateScrollButton);
    return () => node.removeEventListener('scroll', updateScrollButton);
  }, [selectedUserId, footprint?.items.length]);

  const selectedUser = footprint?.user ?? users.find((user) => user.chat_id === selectedUserId) ?? null;
  const userLogs = footprint?.items ?? [];

  const scrollToBottom = () => {
    scrollHistoryToBottom('smooth');
  };

  if (selectedUser) {
    return (
      <div className="mx-auto flex h-[calc(100dvh-1rem)] max-w-4xl flex-col overflow-hidden px-4 pb-4 pt-4 sm:px-6 sm:pb-6 lg:px-8 md:h-[calc(100vh-2rem)] animate-in fade-in slide-in-from-right-8 duration-500">
        <header className="mb-4 flex flex-col gap-4 sm:mb-6">
          <button
            onClick={() => setSelectedUserId(null)}
            className="flex items-center gap-2 text-[#808080] hover:text-[#E0E0E0] w-fit text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> К списку пользователей
          </button>

          <div className="bg-[#0C0C0C] border border-[#1F1F1F] p-6 rounded-2xl flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full border border-[#303030] bg-[#111111] flex items-center justify-center text-[#E0E0E0]">
                <User className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">
                  {selectedUser.first_name} {selectedUser.last_name}
                  {selectedUser.username && <span className="text-[#808080] font-normal ml-2">{selectedUser.username}</span>}
                </h2>
                <div className="flex gap-4 mt-2 text-[10px] uppercase font-mono tracking-widest text-[#505050]">
                  <span>ID: {selectedUser.chat_id}</span>
                  {selectedUser.room && <span>Комната: {selectedUser.room}</span>}
                  <span className={cn(
                    'px-2 py-0.5 rounded border leading-none bg-[#1F1F1F] text-[#808080]',
                    selectedUser.role === RoleEnum.ADMIN && 'bg-[#2A1616] border-[#FF3B30]/30 text-[#FF4D4D]',
                    selectedUser.role === RoleEnum.STAROSTA && 'border-[#303030] bg-[#161616] text-[#B0B0B0]'
                  )}>
                    {selectedUser.role}
                  </span>
                </div>
              </div>
            </div>
            <div className="px-3 py-1.5 bg-[#1F1F1F] border border-[#303030] rounded text-xs text-[#E0E0E0] transition-colors">
              Живой журнал действий
            </div>
          </div>
        </header>

        {footprintError && (
          <div className="mb-6 bg-[#2A1616]/50 border border-[#FF3B30]/30 p-4 rounded-xl text-[#E0E0E0]">
            {footprintError}
          </div>
        )}

        {footprintLoading && !footprint && (
          <div className="text-[#707070] text-sm mb-4">Загружаю историю пользователя...</div>
        )}

        <div className="relative flex-1 min-h-0 overflow-hidden">
          <div ref={historyRef} className="h-full overflow-y-auto overscroll-contain space-y-6 pb-24 pr-1 sm:pr-4 scrollbar-thin scrollbar-thumb-[#303030]">
            {!footprintLoading && userLogs.length === 0 ? (
              <div className="text-center py-20 text-[#505050]">
                <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>Для этого пользователя пока нет сохранённой истории.</p>
              </div>
            ) : (
              userLogs.map((log) => {
                const isOutgoing = log.direction === 'to_user';
                const isError = log.type === 'error' || log.status === 'не доставлено';

                if (log.type === 'error') {
                  return (
                    <div key={log.id} className="flex gap-4 items-start w-full my-6">
                      <div className="text-[10px] font-mono text-[#FF3B30] pt-2 w-16 text-right flex-shrink-0">
                        {formatMoscowTime(log.timestamp)}
                      </div>
                      <div className="flex-1">
                        <div className="rounded-xl border border-[#FF3B30]/30 bg-[#2A1616]/50 p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Shield className="w-4 h-4 text-[#FF3B30]" />
                            <span className="text-xs font-bold text-[#FF4D4D] uppercase tracking-widest">Ошибка уведомления</span>
                          </div>
                          <p className="mb-1 text-sm italic text-[#E0E0E0] break-words [overflow-wrap:anywhere]">"{log.text}"</p>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={log.id} className={cn('flex gap-4 items-start w-full', isOutgoing && 'flex-row-reverse')}>
                    <div className={cn('text-[10px] font-mono text-[#404040] pt-2 w-16 flex-shrink-0', isOutgoing && 'text-right')}>
                      {formatMoscowTime(log.timestamp)}
                    </div>

                    <div className={cn('flex-1 flex flex-col', isOutgoing && 'items-end')}>
                      <div className={cn(
                        'relative max-w-[86%] border p-3 sm:max-w-[80%]',
                        isOutgoing
                          ? 'bg-[#1F1F1F] border-[#303030] rounded-tl-xl rounded-bl-xl rounded-br-xl'
                          : 'bg-[#161616] border-[#1F1F1F] rounded-tr-xl rounded-br-xl rounded-bl-xl'
                      )}>
                        <p className={cn('text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]', isOutgoing ? 'text-[#E0E0E0]' : 'text-[#B0B0B0]')}>{log.text}</p>
                        {isError && (
                          <div className="absolute top-1/2 -translate-y-1/2 left-0 -ml-10 text-[#FF3B30]" title={log.error_message ?? 'Ошибка'}>
                            <Shield className="w-5 h-5 opacity-80" />
                          </div>
                        )}
                      </div>
                      <div className={cn('text-[9px] uppercase tracking-wider mt-1 font-mono', isOutgoing ? 'text-[#34C759]' : 'text-[#505050]')}>
                        {log.direction === 'to_user' && `Сообщение пользователю · ${log.status}`}
                        {log.direction === 'from_user' && log.type === 'incoming' && 'Сообщение от пользователя'}
                        {log.direction === 'from_user' && log.type === 'outgoing' && `Действие пользователя через бота · ${log.status}`}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {showScrollToBottom && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-4 right-1 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-[#303030] bg-[#111111] text-[#E0E0E0] shadow-[0_12px_40px_rgba(0,0,0,0.45)] transition-colors hover:border-[#505050] sm:right-2"
              title="К последним сообщениям"
            >
              <ArrowDown className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 pb-8 pt-4 sm:px-6 lg:px-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#808080] font-semibold mb-1">Поиск по людям и их истории взаимодействий.</p>
          <h2 className="text-3xl font-serif italic text-white tracking-tight">История пользователей</h2>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#505050]" />
          <input
            type="text"
            placeholder="Имя, username, chat_id"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full bg-[#111111] border border-[#1F1F1F] rounded-full py-2 pl-10 pr-4 text-sm text-[#E0E0E0] placeholder:text-[#505050] focus:outline-none focus:border-[#303030]"
          />
        </div>
      </header>

      {usersError && (
        <div className="bg-[#2A1616]/50 border border-[#FF3B30]/30 rounded-2xl p-4 text-[#E0E0E0]">
          {usersError}
        </div>
      )}

      {usersLoading && (
        <div className="text-[#707070] text-sm">Загружаю пользователей...</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {users.map((user) => (
          <button
            key={user.chat_id}
            onClick={() => setSelectedUserId(user.chat_id)}
            className="text-left bg-[#111111] border border-[#1F1F1F] hover:border-[#303030] p-4 rounded-xl transition-all duration-200 cursor-pointer opacity-80 hover:opacity-100 flex flex-col gap-2 relative group"
          >
            <div className="flex justify-between items-start w-full">
              <div className="font-semibold text-[#B0B0B0] group-hover:text-[#E0E0E0]">
                {user.display_name}
              </div>
              <span className={cn(
                'text-[10px] px-2 py-0.5 rounded leading-none bg-[#1F1F1F] text-[#808080]',
                user.role === RoleEnum.ADMIN && 'bg-[#2A1616] text-[#FF4D4D] border border-[#FF3B30]/20'
              )}>
                {user.role}
              </span>
            </div>

            <div className="text-xs text-[#505050] line-clamp-1">
              Имя: {user.first_name} {user.last_name}
            </div>

            <div className="text-[10px] text-[#505050] flex justify-between w-full mt-2 font-mono">
              <span>{user.room ? `Комн. ${user.room}` : `Chat ID: ${user.chat_id}`}</span>
            </div>
          </button>
        ))}
        {!usersLoading && users.length === 0 && (
          <div className="col-span-full py-20 text-center text-[#505050]">
            По этому запросу никого не нашлось.
          </div>
        )}
      </div>
    </div>
  );
}
