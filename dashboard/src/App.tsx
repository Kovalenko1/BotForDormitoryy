import { Suspense, lazy, startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { ApiError, dashboardApi, getInitialView, initTelegramWebApp, waitForTelegramInitData } from './api';
import type { DashboardSessionResponse, ViewType } from './types';
import styles from './App.module.scss';

export type ThemeName = 'dark' | 'panda';

const DashboardView = lazy(() => import('./components/DashboardView').then(({ DashboardView }) => ({ default: DashboardView })));
const GeneralLogsView = lazy(() => import('./components/GeneralLogsView').then(({ GeneralLogsView }) => ({ default: GeneralLogsView })));
const UserFootprintView = lazy(() => import('./components/UserFootprintView').then(({ UserFootprintView }) => ({ default: UserFootprintView })));
const ScheduleView = lazy(() => import('./components/ScheduleView').then(({ ScheduleView }) => ({ default: ScheduleView })));
const ManagementView = lazy(() => import('./components/ManagementView').then(({ ManagementView }) => ({ default: ManagementView })));
const StatisticsView = lazy(() => import('./views/StatisticsView').then(({ StatisticsView }) => ({ default: StatisticsView })));
const ProfileView = lazy(() => import('./views/ProfileView').then(({ ProfileView }) => ({ default: ProfileView })));

function ViewFallback() {
  return (
    <section className={`surface-panel ${styles.viewFallback}`}>
      Загружаю раздел...
    </section>
  );
}

export default function App() {
  const initialView = useMemo(() => getInitialView(), []);
  const [currentView, setCurrentView] = useState<ViewType>(initialView);
  const [visitedViews, setVisitedViews] = useState<ViewType[]>(() => [initialView]);
  const [session, setSession] = useState<DashboardSessionResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [theme, setTheme] = useState<ThemeName>(() => {
    const storedTheme = window.localStorage.getItem('dashboard-theme');
    return storedTheme === 'panda' ? 'panda' : 'dark';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('dashboard-theme', theme);
  }, [theme]);

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

    if (!session.user.room && session.allowed_views.includes('profile') && currentView !== 'profile') {
      setCurrentView('profile');
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
    const url = new URL(window.location.href);
    if (url.searchParams.get('view') === currentView) {
      return;
    }

    url.searchParams.set('view', currentView);
    window.history.replaceState({}, '', url);
  }, [currentView]);

  const handleChangeView = useCallback((view: ViewType) => {
    startTransition(() => {
      setCurrentView((current) => (current === view ? current : view));
    });
  }, []);

  const handleToggleTheme = useCallback(() => {
    setTheme((current) => (current === 'panda' ? 'dark' : 'panda'));
  }, []);

  const allowedViews = useMemo(() => new Set(session?.allowed_views ?? []), [session?.allowed_views]);
  const mountedViews = useMemo(
    () => visitedViews.filter((view) => allowedViews.has(view)),
    [allowedViews, visitedViews],
  );

  const renderView = (view: ViewType) => {
    switch (view) {
      case 'dashboard':
        return <DashboardView onNavigate={handleChangeView} />;
      case 'general':
        return <GeneralLogsView />;
      case 'users':
        return <UserFootprintView />;
      case 'schedule':
        return <ScheduleView session={session!} />;
      case 'statistics':
        return <StatisticsView session={session!} />;
      case 'management':
        return <ManagementView session={session!} onNavigate={handleChangeView} />;
      case 'profile':
        return <ProfileView session={session!} onSessionChange={setSession} />;
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
      <Sidebar
        currentView={currentView}
        onChangeView={handleChangeView}
        onToggleTheme={handleToggleTheme}
        session={session}
        theme={theme}
      />

      <main className={styles.content}>
        <div className={styles.viewHost}>
          {mountedViews.map((view) => (
            <section
              key={view}
              className={view === currentView ? styles.view : styles.hidden}
              aria-hidden={view === currentView ? undefined : true}
            >
              <Suspense fallback={<ViewFallback />}>
                {renderView(view)}
              </Suspense>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
