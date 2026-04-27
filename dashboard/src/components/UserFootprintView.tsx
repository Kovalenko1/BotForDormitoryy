import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, MessageCircle, Search, Shield, User } from 'lucide-react';
import { ApiError, dashboardApi } from '../api';
import { formatMoscowTime } from '../lib/time';
import { RoleEnum, UserFootprintResponse, UserListItem } from '../types';
import styles from './UserFootprintView.module.scss';

function useDebouncedValue<T>(value: T, delayMs = 250) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
}

function getRolePillClassName(role: RoleEnum | string) {
  return [
    styles.rolePill,
    role === RoleEnum.ADMIN ? styles.rolePillAdmin : '',
    role === RoleEnum.STAROSTA ? styles.rolePillStarosta : '',
  ].filter(Boolean).join(' ');
}

export function UserFootprintView() {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
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
    dashboardApi.getUsers({ search: debouncedSearch })
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
  }, [debouncedSearch]);

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
      <div className={styles.chatPage}>
        <header className={styles.chatHeader}>
          <button
            onClick={() => setSelectedUserId(null)}
            className={styles.backButton}
          >
            <ArrowLeft size={16} /> К списку пользователей
          </button>

          <div className={styles.profileCard}>
            <div className={styles.profileIdentity}>
              <div className={styles.avatar}>
                <User size={24} />
              </div>
              <div>
                <h2 className={styles.profileName}>
                  {selectedUser.first_name} {selectedUser.last_name}
                  {selectedUser.username && <span>{selectedUser.username}</span>}
                </h2>
                <div className={styles.profileMeta}>
                  <span>ID: {selectedUser.chat_id}</span>
                  {selectedUser.room && <span>Комната: {selectedUser.room}</span>}
                  <span className={getRolePillClassName(selectedUser.role)}>
                    {selectedUser.role}
                  </span>
                </div>
              </div>
            </div>
            <div className={styles.profileTag}>
              Живой журнал действий
            </div>
          </div>
        </header>

        {footprintError && (
          <div className={styles.errorMessage}>
            {footprintError}
          </div>
        )}

        {footprintLoading && !footprint && (
          <div className={styles.loading}>Загружаю историю пользователя...</div>
        )}

        <div className={styles.historyShell}>
          <div ref={historyRef} className={styles.historyList}>
            {!footprintLoading && userLogs.length === 0 ? (
              <div className={styles.emptyHistory}>
                <MessageCircle size={48} />
                <p>Для этого пользователя пока нет сохранённой истории.</p>
              </div>
            ) : (
              userLogs.map((log) => {
                const isOutgoing = log.direction === 'to_user';
                const isError = log.type === 'error' || log.status === 'не доставлено';

                if (log.type === 'error') {
                  return (
                    <div key={log.id} className={styles.errorLogRow}>
                      <div className={styles.errorLogTime}>
                        {formatMoscowTime(log.timestamp)}
                      </div>
                      <div className={styles.errorLogContent}>
                        <div className={styles.errorBubble}>
                          <div className={styles.errorBubbleHeader}>
                            <Shield size={16} />
                            <span>Ошибка уведомления</span>
                          </div>
                          <p>"{log.text}"</p>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={log.id} className={[styles.logRow, isOutgoing ? styles.logRowOutgoing : ''].join(' ').trim()}>
                    <div className={[styles.logTime, isOutgoing ? styles.logTimeOutgoing : ''].join(' ').trim()}>
                      {formatMoscowTime(log.timestamp)}
                    </div>

                    <div className={[styles.messageColumn, isOutgoing ? styles.messageColumnOutgoing : ''].join(' ').trim()}>
                      <div className={[styles.messageBubble, isOutgoing ? styles.messageBubbleOutgoing : styles.messageBubbleIncoming].join(' ')}>
                        <p>{log.text}</p>
                        {isError && (
                          <div className={styles.errorMarker} title={log.error_message ?? 'Ошибка'}>
                            <Shield size={20} />
                          </div>
                        )}
                      </div>
                      <div className={[styles.direction, isOutgoing ? styles.directionOutgoing : ''].join(' ').trim()}>
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
              className={styles.scrollButton}
              title="К последним сообщениям"
            >
              <ArrowDown size={20} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.listHeader}>
        <div>
          <p className={styles.eyebrow}>Поиск по людям и их истории взаимодействий.</p>
          <h2 className={styles.title}>История пользователей</h2>
        </div>

        <div className={styles.searchBox}>
          <Search className={styles.searchIcon} size={16} />
          <input
            type="text"
            placeholder="Имя, username, chat_id"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={styles.searchField}
          />
        </div>
      </header>

      {usersError && (
        <div className={styles.errorMessage}>
          {usersError}
        </div>
      )}

      {usersLoading && (
        <div className={styles.loading}>Загружаю пользователей...</div>
      )}

      <div className={styles.usersGrid}>
        {users.map((user) => (
          <button
            key={user.chat_id}
            onClick={() => setSelectedUserId(user.chat_id)}
            className={styles.userCard}
          >
            <div className={styles.userCardTop}>
              <div className={styles.userName}>
                {user.display_name}
              </div>
              <span className={getRolePillClassName(user.role)}>
                {user.role}
              </span>
            </div>

            <div className={styles.userRealName}>
              Имя: {user.first_name} {user.last_name}
            </div>

            <div className={styles.userMeta}>
              <span>{user.room ? `Комн. ${user.room}` : `Chat ID: ${user.chat_id}`}</span>
            </div>
          </button>
        ))}
        {!usersLoading && users.length === 0 && (
          <div className={styles.emptyList}>
            По этому запросу никого не нашлось.
          </div>
        )}
      </div>
    </div>
  );
}
