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
      case 'management':
        return <ManagementView session={session!} onNavigate={handleChangeView} />;
      default:
        return null;
    }
  };

  if (!session && !errorMessage) {
    return (
      <div className="min-h-screen bg-[#080808] text-[#E0E0E0] flex items-center justify-center px-6">
        <div className="max-w-md w-full bg-[#111111] border border-[#1F1F1F] rounded-3xl p-8 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-[#808080] font-semibold mb-3">Портал общежития</p>
          <h1 className="text-3xl font-serif italic text-white tracking-tight">Подключение dashboard</h1>
          <p className="mt-4 text-sm text-[#A0A0A0] leading-relaxed">
            Проверяю доступ и загружаю данные из системы бота.
          </p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#080808] text-[#E0E0E0] flex items-center justify-center px-6">
        <div className="max-w-lg w-full bg-[#111111] border border-[#2A1616] rounded-3xl p-8 text-center shadow-[0_20px_80px_rgba(0,0,0,0.4)]">
          <p className="text-xs uppercase tracking-[0.3em] text-[#FF6B57] font-semibold mb-3">Доступ не получен</p>
          <h1 className="text-3xl font-serif italic text-white tracking-tight">Dashboard недоступен</h1>
          <p className="mt-4 text-sm text-[#C9C9C9] leading-relaxed">
            {errorMessage}
          </p>
          <p className="mt-4 text-xs text-[#707070] uppercase tracking-[0.2em]">
            Откройте страницу через Telegram Web App или по персональной ссылке
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#080808] text-[#E0E0E0] font-sans selection:bg-[#303030] md:h-screen md:flex-row md:overflow-hidden">
      <Sidebar currentView={currentView} onChangeView={handleChangeView} session={session} />

      <main className="relative flex-1 overflow-visible md:overflow-y-auto">
        <div className="relative isolate min-h-full">
          {visitedViews
            .filter((view) => session.allowed_views.includes(view))
            .map((view) => (
              <section
                key={view}
                className={view === currentView ? 'block min-h-full' : 'hidden min-h-full'}
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
