import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, MessageCircle, Users } from 'lucide-react';
import { ApiError, dashboardApi } from '../api';
import { formatMoscowDateTime } from '../lib/time';
import type { DashboardOverviewResponse, ViewType } from '../types';
import styles from './DashboardView.module.scss';

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
      <div className={styles.page}>
        <section className={`surface-panel ${styles.error}`}>{errorMessage}</section>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.page}>
        <section className={`surface-panel ${styles.hero}`}>
          <p className="eyebrow">Обзор dashboard</p>
          <h2 className="page-title">Собираю рабочую сводку</h2>
          <p className="page-copy">Подтягиваю ключевые метрики, журнал и последние ошибки.</p>
        </section>
        <div className={styles.stats}>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className={`surface-panel ${styles.statCard}`} />
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
      tone: 'blue',
      targetView: 'management' as ViewType,
    },
    {
      label: 'Событий бота',
      value: data.summary.bot_logs_count,
      icon: Activity,
      tone: 'green',
      targetView: 'general' as ViewType,
    },
    {
      label: 'Сообщений',
      value: data.summary.messages_count,
      icon: MessageCircle,
      tone: 'orange',
      targetView: 'general' as ViewType,
    },
    {
      label: 'Ошибок отправки',
      value: data.summary.failed_count,
      icon: AlertTriangle,
      tone: 'red',
      targetView: 'general' as ViewType,
      logFilter: 'errors' as const,
    },
  ];

  const navigateFromStat = (targetView: ViewType, logFilter?: 'errors') => {
    if (logFilter) {
      const url = new URL(window.location.href);
      url.searchParams.set('log_filter', logFilter);
      window.history.replaceState({}, '', url);
      window.dispatchEvent(new CustomEvent('dashboard-log-filter', { detail: logFilter }));
    }

    onNavigate(targetView);
  };

  return (
    <div className={styles.page}>
      <div className={styles.stats}>
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <button
              key={stat.label}
              onClick={() => navigateFromStat(stat.targetView, stat.logFilter)}
              className={`surface-panel ${styles.statCard}`}
            >
              <div className={styles.statRow}>
                <div>
                  <p className={styles.statLabel}>{stat.label}</p>
                  <p className={styles.statValue}>{stat.value}</p>
                </div>
                <div className={[styles.statIcon, styles[`statIcon${stat.tone[0].toUpperCase()}${stat.tone.slice(1)}`]].join(' ')}>
                  <Icon size={24} />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className={styles.columns}>
        <section className={`surface-panel ${styles.section}`}>
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle}>Последние события</h3>
              <p className={styles.sectionCopy}>Что бот успел сделать в доступном вам контуре за последнее время.</p>
            </div>
            <button onClick={() => onNavigate('general')} className="button-ghost">
              Открыть журнал
            </button>
          </div>

          <div className={styles.feed}>
            {data.recent_activity.map((item) => (
              <article key={item.id} className={styles.feedItem}>
                <div className={[styles.feedDot, styles.feedDotSuccess].join(' ')} />
                <div>
                  <p className={styles.feedTitle}>{item.title}</p>
                  <p className={styles.feedSubtitle}>{item.subtitle}</p>
                  <p className={styles.feedText}>{item.text}</p>
                  <p className={styles.feedTime}>{formatMoscowDateTime(item.timestamp)}</p>
                </div>
              </article>
            ))}
            {data.recent_activity.length === 0 && (
              <div className="empty-placeholder">В доступной зоне пока тихо: свежих событий нет.</div>
            )}
          </div>
        </section>

        <section className={`surface-panel ${styles.section}`}>
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle}>Сигналы о сбоях</h3>
              <p className={styles.sectionCopy}>Ошибки доставки и другие сбои, на которые стоит обратить внимание в первую очередь.</p>
            </div>
            <button onClick={() => navigateFromStat('general', 'errors')} className="button-ghost">
              Открыть ошибки в журнале
            </button>
          </div>

          <div className={styles.feed}>
            {data.recent_errors.map((item) => (
              <article key={item.id} className={styles.feedItem}>
                <div className={[styles.feedDot, styles.feedDotDanger].join(' ')} />
                <div>
                  <p className={styles.feedTitle}>{item.message}</p>
                  <p className={styles.feedText}>{item.context}</p>
                  <p className={styles.feedTime}>{formatMoscowDateTime(item.timestamp)}</p>
                </div>
              </article>
            ))}
            {data.recent_errors.length === 0 && (
              <div className="empty-placeholder">За последнее время серьёзных сбоев не зафиксировано.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
