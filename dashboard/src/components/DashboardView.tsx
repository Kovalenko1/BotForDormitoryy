import React, { useEffect, useState } from 'react';
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
      color: '#8fc4ff',
      surface: 'rgba(143, 196, 255, 0.16)',
      targetView: 'management' as ViewType,
    },
    {
      label: 'Событий бота',
      value: data.summary.bot_logs_count,
      icon: Activity,
      color: '#91d9b3',
      surface: 'rgba(145, 217, 179, 0.16)',
      targetView: 'general' as ViewType,
    },
    {
      label: 'Сообщений',
      value: data.summary.messages_count,
      icon: MessageCircle,
      color: '#ffb869',
      surface: 'rgba(255, 184, 105, 0.16)',
      targetView: 'general' as ViewType,
    },
    {
      label: 'Ошибок отправки',
      value: data.summary.failed_count,
      icon: AlertTriangle,
      color: '#ff8d82',
      surface: 'rgba(255, 141, 130, 0.16)',
      targetView: 'errors' as ViewType,
    },
  ];

  return (
    <div className={styles.page}>
      <section className={`surface-panel ${styles.hero}`}>
        <div>
          <p className="eyebrow">Рабочая сводка</p>
          <h2 className="page-title">Что происходит в системе прямо сейчас</h2>
          <p className="page-copy">
            Быстрый срез по сообщениям, событиям бота и сбоям отправки. Отсюда удобно перейти в журнал, календарь или раздел управления.
          </p>
        </div>

        <div className={styles.heroActions}>
          <button className="button-secondary" onClick={() => onNavigate('schedule')}>Открыть календарь</button>
          <button className="button-ghost" onClick={() => onNavigate('statistics')}>Посмотреть статистику</button>
        </div>
      </section>

      <div className={styles.stats}>
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <button
              key={stat.label}
              onClick={() => onNavigate(stat.targetView)}
              className={`surface-panel ${styles.statCard}`}
            >
              <div className={styles.statRow}>
                <div>
                  <p className={styles.statLabel}>{stat.label}</p>
                  <p className={styles.statValue}>{stat.value}</p>
                </div>
                <div className={styles.statIcon} style={{ background: stat.surface }}>
                  <Icon className="w-6 h-6" style={{ color: stat.color }} />
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
                <div className={styles.feedDot} style={{ background: '#91d9b3' }} />
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
            <button onClick={() => onNavigate('errors')} className="button-ghost">
              Перейти к сбоям
            </button>
          </div>

          <div className={styles.feed}>
            {data.recent_errors.map((item) => (
              <article key={item.id} className={styles.feedItem}>
                <div className={styles.feedDot} style={{ background: '#ff8d82' }} />
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
