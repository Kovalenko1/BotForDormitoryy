import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, ArrowRightLeft, MessageSquare } from 'lucide-react';
import { ApiError, dashboardApi } from '../api';
import { formatMoscowDateTime } from '../lib/time';
import type { GeneralLogItem } from '../types';
import styles from './GeneralLogsView.module.scss';

type GeneralLogFilter = 'all' | 'event' | 'incoming' | 'outgoing' | 'errors';

export function GeneralLogsView() {
  const [logs, setLogs] = useState<GeneralLogItem[]>([]);
  const [filter, setFilter] = useState<GeneralLogFilter>(() => (
    new URLSearchParams(window.location.search).get('log_filter') === 'errors' ? 'errors' : 'all'
  ));
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

  const handleFilterChange = (nextFilter: GeneralLogFilter) => {
    setFilter(nextFilter);

    const url = new URL(window.location.href);
    if (nextFilter === 'errors') {
      url.searchParams.set('log_filter', 'errors');
    } else {
      url.searchParams.delete('log_filter');
    }
    window.history.replaceState({}, '', url);
  };

  useEffect(() => {
    const handleExternalFilter = (event: Event) => {
      const nextFilter = (event as CustomEvent<GeneralLogFilter>).detail;
      if (nextFilter) {
        setFilter(nextFilter);
      }
    };

    window.addEventListener('dashboard-log-filter', handleExternalFilter);
    return () => window.removeEventListener('dashboard-log-filter', handleExternalFilter);
  }, []);

  const filteredLogs = useMemo(() => logs.filter((log) => {
    if (filter === 'all') {
      return true;
    }

    if (filter === 'errors') {
      return Boolean(log.error_message) || log.status === 'не доставлено';
    }

    return log.type === filter;
  }), [filter, logs]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Живой журнал событий и сообщений.</p>
        <h2 className={styles.title}>Лента системы</h2>
      </header>

      <div className={styles.filters}>
        {[
          ['all', 'Все события'],
          ['event', 'Система'],
          ['incoming', 'Входящие'],
          ['outgoing', 'Исходящие'],
          ['errors', 'Ошибки'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => handleFilterChange(value as GeneralLogFilter)}
            className={[styles.filterButton, filter === value ? styles.filterButtonActive : ''].join(' ').trim()}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.logShell}>
        <div className={styles.logList}>
          {errorMessage && (
            <div className={styles.errorRow}>{errorMessage}</div>
          )}

          {filteredLogs.map((log) => {
            const isBotEvent = log.type === 'event';
            const isIncoming = log.type === 'incoming';
            const isOutgoing = log.type === 'outgoing';
            const isError = log.status === 'не доставлено';

            return (
              <div key={log.id} className={styles.logItem}>
                <div className={styles.iconCell}>
                  {isError ? <AlertTriangle className={styles.iconDanger} size={20} /> : null}
                  {!isError && isBotEvent && <Activity className={styles.iconSuccess} size={20} />}
                  {!isError && isIncoming && <MessageSquare className={styles.iconMuted} size={20} />}
                  {!isError && isOutgoing && <ArrowRightLeft className={styles.iconPrimary} size={20} />}
                </div>

                <div className={styles.content}>
                  <div className={styles.itemHeader}>
                    <p className={styles.itemTitle}>
                      {log.title}
                    </p>
                    <time className={styles.time}>
                      {formatMoscowDateTime(log.timestamp)}
                    </time>
                  </div>

                  <p className={styles.subtitle}>{log.subtitle}</p>

                  <div className={styles.textWrap}>
                    <p className={[styles.text, isBotEvent ? styles.eventText : ''].join(' ').trim()}>
                      {log.text}
                    </p>
                  </div>

                  {isError && (
                    <div className={styles.errorBox}>
                      <p className={styles.errorText}>
                        Ошибка: <span className={styles.errorValue}>{log.error_message}</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {!errorMessage && filteredLogs.length === 0 && (
            <div className={styles.empty}>В доступной вам зоне пока нет новых записей.</div>
          )}
        </div>
      </div>
    </div>
  );
}
