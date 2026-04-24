import React, { startTransition, useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { GeneralLogsView } from './components/GeneralLogsView';
import { UserFootprintView } from './components/UserFootprintView';
import { ErrorsView } from './components/ErrorsView';
import { ScheduleView } from './components/ScheduleView';
import { ManagementView } from './components/ManagementView';
import { ApiError, dashboardApi, getInitialView, initTelegramWebApp, waitForTelegramInitData } from './api';
import type { DashboardSessionResponse, ViewType } from './types';
import { StatisticsView } from './views/StatisticsView';
import styles from './App.module.scss';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>(() => getInitialView());
  const [visitedViews, setVisitedViews] = useState<ViewType[]>(() => [getInitialView()]);
  const [session, setSession] = useState<DashboardSessionResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isActive = true;

    const loadSession = async () => {
      initTelegramWebApp();
      await waitForTelegramInitData();

      try {
        const payload = await dashboardApi.getSession();
        if (!isActive) {
          return;
        }

        setSession(payload);
      } catch (error) {
        if (!isActive) {
          return;
        }

        setErrorMessage(error instanceof ApiError ? error.message : 'Не удалось открыть dashboard.');
      }
    };

    void loadSession();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    if (!session.allowed_views.includes(currentView)) {
      setCurrentView(session.allowed_views[0] ?? 'schedule');
    }
  }, [currentView, session]);

  useEffect(() => {
    setVisitedViews((current) => (current.includes(currentView) ? current : [...current, currentView]));
  }, [currentView]);

  useEffect(() => {
    if (!session) {
      return;
    }

    setVisitedViews((current) => {
      const next = [...current];
      for (const view of session.allowed_views) {
        if (!next.includes(view)) {
          next.push(view);
        }
      }
      return next;
    });
  }, [session]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', currentView);
    window.history.replaceState({}, '', url);
  }, [currentView]);

  const handleChangeView = (view: ViewType) => {
    startTransition(() => {
      setCurrentView(view);
    });
  };

  const renderView = (view: ViewType) => {
    switch (view) {
      case 'dashboard':
        return <DashboardView onNavigate={handleChangeView} />;
      case 'general':
        return <GeneralLogsView />;
      case 'users':
        return <UserFootprintView />;
      case 'errors':
        return <ErrorsView />;
      case 'schedule':
        return <ScheduleView session={session!} />;
      case 'statistics':
        return <StatisticsView session={session!} />;
      case 'management':
        return <ManagementView session={session!} onNavigate={handleChangeView} />;
      default:
        return null;
    }
  };

  if (!session && !errorMessage) {
    return (
      <div className={styles.overlay}>
        <div className={`surface-panel ${styles.overlayCard}`}>
          <p className={styles.overlayLabel}>Панель общежития</p>
          <h1 className={styles.overlayTitle}>Подключаю dashboard</h1>
          <p className={styles.overlayText}>Проверяю права доступа и загружаю рабочие данные бота.</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className={styles.overlay}>
        <div className={`surface-panel ${styles.overlayCard}`}>
          <p className={styles.overlayLabel}>Доступ не подтверждён</p>
          <h1 className={styles.overlayTitle}>Страница пока закрыта</h1>
          <p className={styles.overlayText}>{errorMessage}</p>
          <p className={styles.overlayHint}>Откройте dashboard через Telegram Web App или по своей персональной ссылке</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <Sidebar currentView={currentView} onChangeView={handleChangeView} session={session} />

      <main className={styles.content}>
        <div className={styles.viewHost}>
          {visitedViews
            .filter((view) => session.allowed_views.includes(view))
            .map((view) => (
              <section
                key={view}
                className={view === currentView ? styles.view : styles.hidden}
                aria-hidden={view === currentView ? undefined : true}
              >
                {renderView(view)}
              </section>
            ))}
        </div>
      </main>
    </div>
  );
}
