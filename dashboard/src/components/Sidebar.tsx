import React from 'react';
import {
  Activity,
  AlertOctagon,
  BarChart3,
  CalendarDays,
  LayoutDashboard,
  MessageSquare,
  Settings2,
  Users,
} from 'lucide-react';
import type { DashboardSessionResponse, ViewType } from '../types';
import styles from './Sidebar.module.scss';

interface SidebarProps {
  currentView: ViewType;
  onChangeView: (view: ViewType) => void;
  session: DashboardSessionResponse;
}

const roleLabels: Record<string, string> = {
  admin: 'Администратор',
  chairman: 'Председатель',
  starosta: 'Староста',
  user: 'Жилец',
};

const navConfig = [
  { id: 'dashboard', label: 'Обзор', hint: 'Главные показатели', icon: LayoutDashboard },
  { id: 'general', label: 'Журнал', hint: 'События и сообщения', icon: Activity },
  { id: 'users', label: 'История', hint: 'Карточки жильцов', icon: Users },
  { id: 'errors', label: 'Сбои', hint: 'Ошибки и уведомления', icon: AlertOctagon },
  { id: 'schedule', label: 'Календарь', hint: 'Очередь и оценки', icon: CalendarDays },
  { id: 'statistics', label: 'Статистика', hint: 'Гистограмма по блокам', icon: BarChart3 },
  { id: 'management', label: 'Управление', hint: 'Роли, доступ, рассылки', icon: Settings2 },
] as const satisfies ReadonlyArray<{ id: ViewType; label: string; hint: string; icon: typeof LayoutDashboard }>;

export function Sidebar({ currentView, onChangeView, session }: SidebarProps) {
  const navItems = navConfig.filter((item) => session.allowed_views.includes(item.id));
  const scopeLabel = session.scope === 'floor'
    ? `Этаж ${session.user.floor ?? 'не указан'}`
    : 'Все этажи';
  const roleLabel = roleLabels[session.user.role] ?? session.user.role;

  const getNavClassName = (view: ViewType, isActive: boolean) => {
    const names = [styles.navButton];
    if (view === 'schedule') {
      names.push(styles.navButtonSchedule);
    }
    if (view === 'statistics') {
      names.push(styles.navButtonStatistics);
    }
    if (view === 'management') {
      names.push(styles.navButtonManagement);
    }
    if (isActive) {
      names.push(styles.navButtonActive);
    }
    return names.join(' ');
  };

  const getMobileChipClassName = (isActive: boolean) => [styles.mobileChip, isActive ? styles.mobileChipActive : ''].join(' ').trim();

  return (
    <>
      <div className={`surface-panel ${styles.mobile}`}>
        <div className={styles.mobileTop}>
          <div className={styles.mobileBrand}>
            <div className={styles.mobileBadge}>
              <MessageSquare size={18} strokeWidth={2.7} />
            </div>
            <div>
              <p className="eyebrow">Панель общежития</p>
              <h1 className={styles.brandTitle}>Dormitory Control</h1>
            </div>
          </div>
          <div className={styles.mobileProfile}>
            <p className={styles.profileName}>{session.user.display_name}</p>
            <p className={styles.profileMeta}>{roleLabel} · {scopeLabel}</p>
          </div>
        </div>

        <nav className={styles.mobileNav}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onChangeView(item.id)}
                className={getMobileChipClassName(isActive)}
              >
                <span className={styles.mobileChipIcon}>
                  <Icon size={18} />
                </span>
                <span className={styles.mobileChipText}>
                  <span className={styles.mobileChipLabel}>{item.label}</span>
                  <span className={styles.mobileChipHint}>{item.hint}</span>
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      <aside className={styles.desktop}>
        <div className={styles.desktopInner}>
          <div className={`surface-panel ${styles.brand}`}>
            <div className={styles.brandRow}>
              <div className={styles.brandBadge}>
                <MessageSquare size={18} strokeWidth={2.7} />
              </div>
              <h1 className={styles.brandTitle}>Dormitory Control</h1>
            </div>
            <p className={styles.brandCopy}>Журнал, дежурства, доступы и аналитика по этажам в одном рабочем контуре.</p>
          </div>

          <nav className={styles.nav}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onChangeView(item.id)}
                  className={getNavClassName(item.id, isActive)}
                >
                  <span className={styles.iconWrap}>
                    <Icon size={18} />
                  </span>
                  <span className={styles.navText}>
                    <span className={styles.navLabel}>{item.label}</span>
                    <span className={styles.navHint}>{item.hint}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className={`surface-panel ${styles.profile}`}>
            <div className={styles.profileRow}>
              <div className={styles.avatar}>{session.user.display_name.slice(0, 1).toUpperCase()}</div>
              <div>
                <p className={styles.profileName}>{session.user.display_name}</p>
                  <p className={styles.profileMeta}>{roleLabel} · {scopeLabel}</p>
              </div>
            </div>
            <div className="badge">Доступ: {session.scope === 'all' ? 'все этажи' : 'только свой этаж'}</div>
          </div>
        </div>
      </aside>
    </>
  );
}
