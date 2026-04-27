import { memo, useMemo } from 'react';
import {
  BarChart3,
  CalendarDays,
  FileText,
  History,
  LayoutDashboard,
  Orbit,
  PawPrint,
  Settings2,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import type { ThemeName } from '../App';
import type { DashboardSessionResponse, ViewType } from '../types';
import styles from './Sidebar.module.scss';

interface SidebarProps {
  currentView: ViewType;
  onChangeView: (view: ViewType) => void;
  onToggleTheme: () => void;
  session: DashboardSessionResponse;
  theme: ThemeName;
}

const roleLabels: Record<string, string> = {
  admin: 'Администратор',
  chairman: 'Председатель',
  starosta: 'Староста',
  user: 'Жилец',
};

const navConfig = [
  { id: 'dashboard', label: 'Обзор', hint: 'Главные показатели', icon: LayoutDashboard },
  { id: 'general', label: 'Журнал', hint: 'События и ошибки', icon: FileText },
  { id: 'users', label: 'История', hint: 'Карточки жильцов', icon: History },
  { id: 'schedule', label: 'Календарь', hint: 'Очередь и оценки', icon: CalendarDays },
  { id: 'statistics', label: 'Статистика', hint: 'Гистограмма по блокам', icon: BarChart3 },
  { id: 'management', label: 'Управление', hint: 'Роли, доступ, рассылки', icon: Settings2 },
  { id: 'profile', label: 'Профиль', hint: 'Комната и рейтинг', icon: UserRound },
] as const satisfies ReadonlyArray<{ id: ViewType; label: string; hint: string; icon: LucideIcon }>;

function getNavClassName(view: ViewType, isActive: boolean) {
  const names = [styles.navButton];
  if (view === 'schedule') names.push(styles.navButtonSchedule);
  if (view === 'statistics') names.push(styles.navButtonStatistics);
  if (view === 'management') names.push(styles.navButtonManagement);
  if (isActive) names.push(styles.navButtonActive);
  return names.join(' ');
}

export const Sidebar = memo(function Sidebar({ currentView, onChangeView, onToggleTheme, session, theme }: SidebarProps) {
  const allowedViews = session.allowed_views;
  const navItems = useMemo(
    () => navConfig.filter((item) => allowedViews.includes(item.id)),
    [allowedViews],
  );
  const scopeLabel = useMemo(
    () => (session.scope === 'floor' ? `Этаж ${session.user.floor ?? 'не указан'}` : 'Все этажи'),
    [session.scope, session.user.floor],
  );
  const roleLabel = roleLabels[session.user.role] ?? session.user.role;
  const ThemeIcon = theme === 'panda' ? PawPrint : Orbit;

  return (
    <>
      {/* ── Desktop sidebar ───────────────────────────────── */}
      <aside className={styles.desktop}>
        <div className={styles.desktopInner}>
          <div className={`surface-panel ${styles.brand}`}>
            <div className={styles.brandRow}>
              <div className={`${styles.brandBadge} ${theme === 'panda' ? styles.brandBadgePanda : styles.brandBadgeDark}`}>
                <ThemeIcon size={18} strokeWidth={2.7} />
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
            <button type="button" className={styles.themeButton} onClick={onToggleTheme}>
              <ThemeIcon className={styles.themeGlyph} size={16} />
              {theme === 'panda' ? 'Тема: Панда' : 'Тема: тёмная'}
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile: fixed bottom navigation ───────────────── */}
      <button type="button" className={styles.themeFab} onClick={onToggleTheme} aria-label="Сменить тему">
        <ThemeIcon className={styles.themeGlyph} size={18} />
      </button>

      <nav className={styles.bottomNav} aria-label="Навигация">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onChangeView(item.id)}
              className={`${styles.bottomNavItem}${isActive ? ` ${styles.bottomNavItemActive}` : ''}`}
            >
              <span className={styles.bottomNavIcon}>
                <Icon size={21} />
              </span>
              <span className={styles.bottomNavLabel}>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
});

