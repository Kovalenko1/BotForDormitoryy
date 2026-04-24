import React, { useDeferredValue, useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Ban,
  Clock3,
  Crown,
  KeyRound,
  Megaphone,
  Send,
  ShieldCheck,
  ShieldX,
  UserCog,
  Users,
} from 'lucide-react';
import { ApiError, dashboardApi } from '../api';
import type {
  AccessKeyResponse,
  DashboardSessionResponse,
  ManagementRolesResponse,
  NotificationSettingItem,
  RoleEnum,
  UserListItem,
  UsersResponse,
  ViewType,
} from '../types';
import styles from './ManagementView.module.scss';

interface ManagementViewProps {
  session: DashboardSessionResponse;
  onNavigate: (view: ViewType) => void;
}

type ManagementTab = 'roles' | 'residents' | 'access' | 'notifications' | 'broadcast';
type AccessFilter = 'all' | 'white' | 'black' | 'blocked';

const roleLabels: Record<string, string> = {
  admin: 'Админ',
  chairman: 'Председатель',
  starosta: 'Староста',
  user: 'Жилец',
};

function formatTime(hour: number, minute: number) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function buildSearchValue(user: UserListItem) {
  return [
    user.display_name,
    user.chat_id,
    user.room,
    user.username,
    user.first_name,
    user.last_name,
    user.floor ? String(user.floor) : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function filterUsers(
  users: UserListItem[],
  {
    search,
    role,
    floor,
    hasRoom,
    access,
  }: {
    search: string;
    role: string;
    floor: number | null;
    hasRoom: 'all' | 'yes' | 'no';
    access: AccessFilter;
  },
) {
  const normalizedSearch = search.trim().toLowerCase();

  return users.filter((user) => {
    if (normalizedSearch && !buildSearchValue(user).includes(normalizedSearch)) {
      return false;
    }

    if (role && user.role !== role) {
      return false;
    }

    if (typeof floor === 'number' && user.floor !== floor) {
      return false;
    }

    if (hasRoom === 'yes' && !user.room) {
      return false;
    }

    if (hasRoom === 'no' && user.room) {
      return false;
    }

    if (access === 'white' && !user.is_whitelisted) {
      return false;
    }

    if (access === 'black' && user.is_whitelisted) {
      return false;
    }

    if (access === 'blocked' && !user.is_blocked) {
      return false;
    }

    return true;
  });
}

function getStatusPillStyle(user: UserListItem) {
  if (user.is_blocked) {
    return {
      borderColor: 'rgba(255, 132, 117, 0.4)',
      background: 'rgba(49, 25, 24, 0.9)',
      color: '#ff9f93',
    };
  }

  return user.is_whitelisted
    ? {
        borderColor: 'rgba(157, 212, 181, 0.3)',
        background: 'rgba(18, 37, 28, 0.9)',
        color: '#93ddb1',
      }
    : {
        borderColor: 'rgba(111, 166, 127, 0.18)',
        background: 'rgba(11, 18, 13, 0.92)',
        color: '#a7baad',
      };
}

export function ManagementView({ session, onNavigate }: ManagementViewProps) {
  const [activeTab, setActiveTab] = useState<ManagementTab>('residents');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [roleFilter, setRoleFilter] = useState('');
  const [floorFilter, setFloorFilter] = useState<number | null>(session.scope === 'floor' ? (session.accessible_floors[0] ?? null) : null);
  const [hasRoomFilter, setHasRoomFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [accessFilter, setAccessFilter] = useState<AccessFilter>('all');
  const [directory, setDirectory] = useState<UsersResponse | null>(null);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directoryError, setDirectoryError] = useState('');
  const [rolesData, setRolesData] = useState<ManagementRolesResponse | null>(null);
  const [rolesError, setRolesError] = useState('');
  const [rolesReloadToken, setRolesReloadToken] = useState(0);
  const [directoryReloadToken, setDirectoryReloadToken] = useState(0);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettingItem[]>([]);
  const [notificationError, setNotificationError] = useState('');
  const [settingsReloadToken, setSettingsReloadToken] = useState(0);
  const [timeDrafts, setTimeDrafts] = useState<Record<number, string>>({});
  const [generatedKeys, setGeneratedKeys] = useState<AccessKeyResponse[]>([]);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastScope, setBroadcastScope] = useState<'all' | 'floor' | 'block' | 'room'>(session.scope === 'all' ? 'all' : 'floor');
  const [broadcastFloor, setBroadcastFloor] = useState<number | null>(session.scope === 'floor' ? (session.accessible_floors[0] ?? null) : null);
  const [broadcastBlock, setBroadcastBlock] = useState('');
  const [broadcastRoom, setBroadcastRoom] = useState('');
  const [broadcastRole, setBroadcastRole] = useState<'all' | 'admin' | 'chairman' | 'starosta' | 'user'>('all');
  const [broadcastResult, setBroadcastResult] = useState('');
  const [broadcastError, setBroadcastError] = useState('');
  const [broadcastLoading, setBroadcastLoading] = useState(false);

  useEffect(() => {
    const tabs: ManagementTab[] = [];
    if (session.permissions.can_manage_roles) {
      tabs.push('roles');
    }
    tabs.push('residents');
    if (session.permissions.can_manage_user_access) {
      tabs.push('access');
    }
    if (session.permissions.can_manage_notifications) {
      tabs.push('notifications');
    }
    if (session.permissions.can_broadcast) {
      tabs.push('broadcast');
    }

    if (!tabs.includes(activeTab)) {
      setActiveTab(tabs[0] ?? 'residents');
    }
  }, [activeTab, session.permissions]);

  useEffect(() => {
    let isActive = true;
    setDirectoryLoading(true);

    dashboardApi.getUsers({ limit: 400 })
      .then((payload) => {
        if (!isActive) {
          return;
        }

        setDirectory(payload);
        setDirectoryError('');
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setDirectoryError(error instanceof ApiError ? error.message : 'Не удалось загрузить список жильцов.');
      })
      .finally(() => {
        if (isActive) {
          setDirectoryLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [directoryReloadToken]);

  useEffect(() => {
    if (!session.permissions.can_manage_roles) {
      return;
    }

    let isActive = true;
    dashboardApi.getManagementRoles()
      .then((payload) => {
        if (!isActive) {
          return;
        }

        setRolesData(payload);
        setRolesError('');
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setRolesError(error instanceof ApiError ? error.message : 'Не удалось загрузить текущие роли.');
      });

    return () => {
      isActive = false;
    };
  }, [rolesReloadToken, session.permissions.can_manage_roles]);

  useEffect(() => {
    if (!session.permissions.can_manage_notifications) {
      return;
    }

    let isActive = true;
    dashboardApi.getNotificationSettings()
      .then((payload) => {
        if (!isActive) {
          return;
        }

        setNotificationSettings(payload.items);
        setNotificationError('');
        setTimeDrafts(Object.fromEntries(payload.items.map((item) => [item.floor, formatTime(item.notification_hour, item.notification_minute)])));
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setNotificationError(error instanceof ApiError ? error.message : 'Не удалось загрузить настройки уведомлений.');
      });

    return () => {
      isActive = false;
    };
  }, [settingsReloadToken, session.permissions.can_manage_notifications]);

  const allUsers = directory?.items ?? [];
  const visibleUsers = filterUsers(allUsers, {
    search: deferredSearch,
    role: roleFilter,
    floor: floorFilter,
    hasRoom: hasRoomFilter,
    access: accessFilter,
  });
  const whiteListUsers = allUsers.filter((user) => user.is_whitelisted);
  const blackListUsers = allUsers.filter((user) => !user.is_whitelisted);
  const blockedUsers = allUsers.filter((user) => user.is_blocked);
  const admins = rolesData?.admins ?? allUsers.filter((user) => user.role === 'admin');
  const chairmen = rolesData?.chairmen ?? allUsers.filter((user) => user.role === 'chairman');
  const starostas = rolesData?.starostas ?? allUsers.filter((user) => user.role === 'starosta');

  const tabs = [
    session.permissions.can_manage_roles ? { id: 'roles' as const, label: 'Роли', hint: 'Ключи и staff' } : null,
    { id: 'residents' as const, label: 'Жильцы', hint: 'Фильтры и статусы' },
    session.permissions.can_manage_user_access ? { id: 'access' as const, label: 'Списки доступа', hint: 'White / black list' } : null,
    session.permissions.can_manage_notifications ? { id: 'notifications' as const, label: 'Уведомления', hint: 'Время по этажам' } : null,
    session.permissions.can_broadcast ? { id: 'broadcast' as const, label: 'Рассылка', hint: 'Массовые сообщения' } : null,
  ].filter(Boolean) as Array<{ id: ManagementTab; label: string; hint: string }>;

  const rememberSuccess = (message: string) => {
    setActionMessage(message);
    setActionError('');
  };

  const rememberError = (message: string) => {
    setActionError(message);
    setActionMessage('');
  };

  const refreshData = () => {
    setDirectoryReloadToken((value) => value + 1);
    setRolesReloadToken((value) => value + 1);
  };

  const handleCreateKey = async (roleToAssign: 'chairman' | 'starosta') => {
    try {
      const payload = await dashboardApi.createAccessKey(roleToAssign);
      setGeneratedKeys((current) => [payload, ...current].slice(0, 6));
      rememberSuccess(`Ключ для роли ${payload.role_to_assign} создан.`);
      setRolesReloadToken((value) => value + 1);
    } catch (error) {
      rememberError(error instanceof ApiError ? error.message : 'Не удалось создать ключ.');
    }
  };

  const handleRoleChange = async (chatId: string, role: RoleEnum | 'user' | 'chairman' | 'starosta') => {
    try {
      await dashboardApi.updateUserRole(chatId, role);
      rememberSuccess(`Роль пользователя ${chatId} изменена на ${roleLabels[role] ?? role}.`);
      refreshData();
    } catch (error) {
      rememberError(error instanceof ApiError ? error.message : 'Не удалось изменить роль.');
    }
  };

  const handleAccessUpdate = async (chatId: string, payload: { is_blocked?: boolean; is_whitelisted?: boolean }, successMessage: string) => {
    try {
      await dashboardApi.updateUserAccess(chatId, payload);
      rememberSuccess(successMessage);
      setDirectoryReloadToken((value) => value + 1);
    } catch (error) {
      rememberError(error instanceof ApiError ? error.message : 'Не удалось обновить доступ пользователя.');
    }
  };

  const handleSaveNotificationTime = async (floor: number) => {
    try {
      await dashboardApi.updateNotificationSetting(floor, timeDrafts[floor] ?? '');
      rememberSuccess(`Время уведомлений для этажа ${floor} обновлено.`);
      setSettingsReloadToken((value) => value + 1);
    } catch (error) {
      rememberError(error instanceof ApiError ? error.message : 'Не удалось сохранить время уведомлений.');
    }
  };

  const handleSendBroadcast = async () => {
    setBroadcastLoading(true);
    setBroadcastResult('');
    setBroadcastError('');

    try {
      const payload = await dashboardApi.sendBroadcast({
        text: broadcastText,
        scope: broadcastScope,
        floor: broadcastScope === 'floor' ? (broadcastFloor ?? undefined) : undefined,
        block: broadcastScope === 'block' ? broadcastBlock : undefined,
        room: broadcastScope === 'room' ? broadcastRoom : undefined,
        role: broadcastRole,
      });

      setBroadcastResult(`Рассылка для ${payload.target} завершена. Отправлено: ${payload.sent_count}, ошибок: ${payload.failed_count}.`);
      setBroadcastText('');
    } catch (error) {
      setBroadcastError(error instanceof ApiError ? error.message : 'Не удалось выполнить рассылку.');
    } finally {
      setBroadcastLoading(false);
    }
  };

  const canManageUser = (user: UserListItem) => {
    if (!session.permissions.can_manage_roles && !session.permissions.can_manage_user_access) {
      return false;
    }

    if (user.role === 'admin') {
      return false;
    }

    if (session.user.role !== 'admin' && user.role === 'chairman') {
      return false;
    }

    return true;
  };

  const renderActionPanel = (user: UserListItem) => {
    if (!canManageUser(user)) {
      return null;
    }

    return (
      <div className="mt-4 space-y-3">
        {session.permissions.can_manage_roles && (
          <div className={styles.actionGrid}>
            {session.user.role === 'admin' && (
              <button
                onClick={() => handleRoleChange(user.chat_id, 'chairman')}
                className={[styles.actionButton, styles.actionButtonAccent].join(' ')}
              >
                В председатели
              </button>
            )}
            <button
              onClick={() => handleRoleChange(user.chat_id, 'starosta')}
              className={[styles.actionButton, styles.actionButtonNeutral].join(' ')}
            >
              В старосты
            </button>
            <button
              onClick={() => handleRoleChange(user.chat_id, 'user')}
              className={[styles.actionButton, styles.actionButtonDanger].join(' ')}
            >
              Снять роль
            </button>
          </div>
        )}

        {session.permissions.can_manage_user_access && (
          <div className={styles.actionGrid}>
            <button
              onClick={() => handleAccessUpdate(user.chat_id, { is_whitelisted: true }, `${user.display_name} добавлен в белый список.`)}
              className={[styles.actionButton, styles.actionButtonAccent].join(' ')}
            >
              Белый список
            </button>
            <button
              onClick={() => handleAccessUpdate(user.chat_id, { is_whitelisted: false }, `${user.display_name} перемещён в чёрный список.`)}
              className={[styles.actionButton, styles.actionButtonNeutral].join(' ')}
            >
              Чёрный список
            </button>
            <button
              onClick={() => handleAccessUpdate(user.chat_id, { is_blocked: !user.is_blocked }, user.is_blocked ? `${user.display_name} разблокирован.` : `${user.display_name} заблокирован.`)}
              className={[
                styles.actionButton,
                user.is_blocked ? styles.actionButtonAccent : styles.actionButtonDanger,
              ].join(' ')}
            >
              {user.is_blocked ? 'Разблокировать' : 'Заблокировать'}
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderMiniUserCard = (user: UserListItem, accentClass: string) => (
    <div key={user.chat_id} className={`${styles.roleCard} ${accentClass}`}>
      <div className={styles.roleHeader}>
        <div className={styles.roleIdentity}>
          <p className={`${styles.roleName} ${styles.textBreak}`}>{user.display_name}</p>
          <div className={`${styles.roleMeta} ${styles.textBreak}`}>{user.chat_id}</div>
        </div>
        <div className={styles.statusPill} style={getStatusPillStyle(user)}>
          {user.is_whitelisted ? 'White' : 'Black'}
        </div>
      </div>
      <div className={`${styles.roleLocation} ${styles.textBreak}`}>
        {user.room ? `Комната ${user.room}` : 'Комната не указана'}
        {user.floor ? ` · этаж ${user.floor}` : ''}
      </div>
      {canManageUser(user) && (
        <button
          onClick={() => handleRoleChange(user.chat_id, 'user')}
          className={`button-ghost ${styles.resetButton}`}
        >
          Сбросить до жильца
        </button>
      )}
    </div>
  );

  const renderAccessList = (
    title: string,
    description: string,
    users: UserListItem[],
    listType: 'white' | 'black',
  ) => (
    <section className={styles.sectionCardSoft}>
      <div className={styles.sectionHeaderBlock}>
        <div>
          <h3 className={styles.sectionTitle}>{title}</h3>
          <p className={styles.sectionCopy}>{description}</p>
        </div>
        <div className={[styles.sectionBadge, listType === 'white' ? styles.sectionBadgeAccent : styles.sectionBadgeMuted].join(' ')}>
          {users.length}
        </div>
      </div>

      <div className={styles.listGrid}>
        {users.map((user) => (
          <div key={user.chat_id} className={styles.listItem}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className={styles.roleTagRow}>
                  <span className="text-sm font-medium text-white">{user.display_name}</span>
                  <span className={styles.roleBadge}>
                    {roleLabels[user.role] ?? user.role}
                  </span>
                  {user.is_blocked && (
                    <span className={[styles.sectionBadge, styles.sectionBadgeDanger].join(' ')}>
                      Blocked
                    </span>
                  )}
                </div>
                <div className={styles.listItemMeta}>
                  {user.room ? `Комната ${user.room}` : 'Комната не указана'}
                  {user.floor ? ` · этаж ${user.floor}` : ''}
                </div>
              </div>

              {session.permissions.can_manage_user_access && canManageUser(user) && (
                <div className={styles.listActions}>
                  <button
                    onClick={() => handleAccessUpdate(user.chat_id, { is_whitelisted: listType !== 'white' }, listType === 'white' ? `${user.display_name} перемещён в чёрный список.` : `${user.display_name} добавлен в белый список.`)}
                    className={[styles.actionButton, styles.actionButtonNeutral].join(' ')}
                  >
                    {listType === 'white' ? 'В чёрный список' : 'В белый список'}
                  </button>
                  <button
                    onClick={() => handleAccessUpdate(user.chat_id, { is_blocked: !user.is_blocked }, user.is_blocked ? `${user.display_name} разблокирован.` : `${user.display_name} заблокирован.`)}
                    className={[styles.actionButton, styles.actionButtonDanger].join(' ')}
                  >
                    {user.is_blocked ? 'Разблокировать' : 'Заблокировать'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {users.length === 0 && (
          <div className={styles.emptyState}>
            Здесь пока нет пользователей.
          </div>
        )}
      </div>
    </section>
  );

  return (
    <div className={styles.page}>
      <header className={`surface-panel ${styles.hero}`}>
        <div className={styles.heroTop}>
          <div className="max-w-2xl">
            <p className="eyebrow">Роли, доступ и коммуникация</p>
          </div>

          <button
            onClick={() => onNavigate('users')}
            className="button-secondary"
          >
            История пользователей <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>

        <div className={styles.heroMetrics}>
          <div className={`surface-panel-soft ${styles.heroMetric}`}>
            <div className={styles.metricLabel}><Crown className="h-4 w-4" /> Staff</div>
            <div className={styles.metricValue}>{admins.length + chairmen.length + starostas.length}</div>
            <div className={styles.metricCopy}>Админы, председатели и старосты, которые держат рабочий контур.</div>
          </div>
          <div className={`surface-panel-soft ${styles.heroMetric}`}>
            <div className={styles.metricLabel}><ShieldCheck className="h-4 w-4" /> White List</div>
            <div className={styles.metricValue}>{whiteListUsers.length}</div>
            <div className={styles.metricCopy}>Эти пользователи видят календарь и получают плановые уведомления.</div>
          </div>
          <div className={`surface-panel-soft ${styles.heroMetric}`}>
            <div className={styles.metricLabel}><ShieldX className="h-4 w-4" /> Black List</div>
            <div className={styles.metricValue}>{blackListUsers.length}</div>
            <div className={styles.metricCopy}>Для них рабочие сценарии выключены, но учётная запись остаётся в системе.</div>
          </div>
          <div className={`surface-panel-soft ${styles.heroMetric}`}>
            <div className={styles.metricLabel}><Ban className="h-4 w-4" /> Blocked</div>
            <div className={styles.metricValue}>{blockedUsers.length}</div>
            <div className={styles.metricCopy}>Полностью заблокированные записи без доступа к dashboard и боту.</div>
          </div>
        </div>
      </header>

      {(actionMessage || actionError) && (
        <div className={actionError ? 'state-message error' : 'state-message'}>
          {actionError || actionMessage}
        </div>
      )}

      <section className={`surface-panel ${styles.tabsShell}`}>
        <div className={styles.tabs}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[styles.tabButton, activeTab === tab.id ? styles.tabButtonActive : ''].join(' ').trim()}
            >
              <div className={styles.tabTitle}>{tab.label}</div>
              <div className={styles.tabHint}>{tab.hint}</div>
            </button>
          ))}
        </div>
      </section>

      {activeTab === 'roles' && session.permissions.can_manage_roles && (
        <div className={styles.splitLayout}>
          <section className={`surface-panel ${styles.sectionCard}`}>
            <div className={styles.sectionLead}>
              <div className={styles.sectionIcon}>
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h3 className={styles.sectionTitle}>Пригласительные ключи</h3>
                <p className={styles.sectionCopy}>Новые staff-роли выдаются через Telegram по одноразовым ключам.</p>
              </div>
            </div>

            <div className={styles.primaryActions}>
              {session.user.role === 'admin' && (
                <button
                  onClick={() => handleCreateKey('chairman')}
                  className="button"
                >
                  Ключ председателя
                </button>
              )}
              <button
                onClick={() => handleCreateKey('starosta')}
                className="button-secondary"
              >
                Ключ старосты
              </button>
            </div>

            {generatedKeys.length > 0 && (
              <div className={styles.generatedKeys}>
                {generatedKeys.map((item) => (
                  <div key={`${item.role_to_assign}-${item.key}`} className={styles.keyCard}>
                    <div className={styles.keyLabel}>{roleLabels[item.role_to_assign] ?? item.role_to_assign}</div>
                    <div className={styles.keyValue}>{item.key}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={`surface-panel ${styles.sectionCard}`}>
            <div className={styles.sectionHeaderBlock}>
              <div className={styles.sectionLead}>
                <div className={styles.sectionIcon}>
                <UserCog className="h-5 w-5" />
                </div>
                <div>
                  <h3 className={styles.sectionTitle}>Текущие роли</h3>
                  <p className={styles.sectionCopy}>Короткая раскладка по админам, председателям и старостам без лишнего шума.</p>
                </div>
              </div>
            </div>

            {rolesError && <div className={styles.sectionError}>{rolesError}</div>}

            <div className={styles.rolesGrid}>
              <div className={styles.roleColumn}>
                <div className={styles.roleHeading}><Crown className="h-4 w-4 text-[#ffce8a]" /> Админы</div>
                {admins.length > 0 ? admins.map((user) => renderMiniUserCard(user, styles.roleCardAdmin)) : (
                  <div className={styles.emptyState}>Админы не найдены.</div>
                )}
              </div>
              <div className={styles.roleColumn}>
                <div className={styles.roleHeading}><ShieldCheck className="h-4 w-4 text-[#93ddb1]" /> Председатели</div>
                {chairmen.length > 0 ? chairmen.map((user) => renderMiniUserCard(user, styles.roleCardChairman)) : (
                  <div className={styles.emptyState}>Председателей пока нет.</div>
                )}
              </div>
              <div className={styles.roleColumn}>
                <div className={styles.roleHeading}><Users className="h-4 w-4 text-[#98ddc7]" /> Старосты</div>
                {starostas.length > 0 ? starostas.map((user) => renderMiniUserCard(user, styles.roleCardStarosta)) : (
                  <div className={styles.emptyState}>Старост пока нет.</div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'residents' && (
        <section className={`surface-panel ${styles.sectionCard}`}>
          <div className={styles.sectionHeadResponsive}>
            <div>
              <h3 className={styles.sectionTitle}>Список жильцов</h3>
              <p className={styles.sectionCopy}>Поиск, фильтры и быстрые действия, когда нужно быстро разобраться по человеку.</p>
            </div>
            <div className={styles.sectionBadge}>
              Найдено: {visibleUsers.length}
            </div>
          </div>

          <div className={styles.filterGridPrimary}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Имя, chat_id, комната"
              className={`field ${styles.searchWide}`}
            />
            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              className="select"
            >
              <option value="">Все роли</option>
              <option value="user">Жильцы</option>
              <option value="starosta">Старосты</option>
              <option value="chairman">Председатели</option>
              <option value="admin">Админы</option>
            </select>
            <select
              value={floorFilter ?? ''}
              onChange={(event) => setFloorFilter(event.target.value ? Number(event.target.value) : null)}
              disabled={session.scope === 'floor'}
              className="select"
            >
              {session.scope === 'all' && <option value="">Все этажи</option>}
              {session.accessible_floors.map((floor) => (
                <option key={floor} value={floor}>Этаж {floor}</option>
              ))}
            </select>
            <select
              value={hasRoomFilter}
              onChange={(event) => setHasRoomFilter(event.target.value as 'all' | 'yes' | 'no')}
              className="select"
            >
              <option value="all">Любая комната</option>
              <option value="yes">Комната указана</option>
              <option value="no">Без комнаты</option>
            </select>
          </div>

          <div className={styles.filterGridSecondary}>
            <select
              value={accessFilter}
              onChange={(event) => setAccessFilter(event.target.value as AccessFilter)}
              className="select"
            >
              <option value="all">Любой доступ</option>
              <option value="white">Белый список</option>
              <option value="black">Чёрный список</option>
              <option value="blocked">Только заблокированные</option>
            </select>
          </div>

          {directoryError && <div className={styles.sectionError}>{directoryError}</div>}
          {directoryLoading && <div className={styles.sectionLoading}>Загружаю жильцов...</div>}

          <div className={styles.directoryGrid}>
            {visibleUsers.map((user) => (
              <article key={user.chat_id} className={`surface-panel-soft ${styles.residentCard}`}>
                <div className={styles.residentHead}>
                  <div className={styles.residentIdentity}>
                    <p className={`${styles.residentName} ${styles.textBreak}`}>{user.display_name}</p>
                    <div className={`${styles.residentId} ${styles.textBreak}`}>{user.chat_id}</div>
                  </div>
                  <div className={styles.residentBadges}>
                    <span className={styles.roleBadge}>
                      {roleLabels[user.role] ?? user.role}
                    </span>
                    <span className={styles.statusPill} style={getStatusPillStyle(user)}>
                      {user.is_blocked ? 'Blocked' : user.is_whitelisted ? 'White' : 'Black'}
                    </span>
                  </div>
                </div>

                <div className={`${styles.residentMeta} ${styles.textBreak}`}>
                  <div>{user.room ? `Комната ${user.room}` : 'Комната не указана'}</div>
                  <div className={styles.residentMetaLine}>
                    {user.floor ? `Этаж ${user.floor}` : 'Этаж не определён'}
                    {user.username ? ` · ${user.username}` : ''}
                  </div>
                </div>

                {renderActionPanel(user)}
              </article>
            ))}
          </div>

          {!directoryLoading && visibleUsers.length === 0 && (
            <div className={styles.emptyState}>
              По выбранным фильтрам пользователи не найдены.
            </div>
          )}
        </section>
      )}

      {activeTab === 'access' && session.permissions.can_manage_user_access && (
        <div className={styles.accessLayout}>
          {renderAccessList(
            'Белый список',
            'Эти пользователи получают уведомления и видят календарь дежурств.',
            whiteListUsers,
            'white',
          )}
          {renderAccessList(
            'Чёрный список',
            'Эти пользователи не видят график и не получают плановые уведомления.',
            blackListUsers,
            'black',
          )}

          <section className={`${styles.sectionCardSoft} ${styles.sectionCardDanger}`}>
            <div className={styles.sectionHeaderBlock}>
              <div>
                <h3 className={styles.sectionTitle}>Заблокированные пользователи</h3>
                <p className={styles.sectionCopy}>Блокировка закрывает dashboard и исключает пользователя из рабочих сценариев.</p>
              </div>
              <div className={[styles.sectionBadge, styles.sectionBadgeDanger].join(' ')}>
                {blockedUsers.length}
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {blockedUsers.map((user) => (
                <div key={user.chat_id} className={styles.dangerCard}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-medium text-white">{user.display_name}</div>
                      <div className={styles.dangerMeta}>
                        {user.room ? `Комната ${user.room}` : 'Комната не указана'}
                        {user.floor ? ` · этаж ${user.floor}` : ''}
                      </div>
                    </div>
                    {canManageUser(user) && (
                      <button
                        onClick={() => handleAccessUpdate(user.chat_id, { is_blocked: false }, `${user.display_name} разблокирован.`)}
                        className={[styles.actionButton, styles.actionButtonDangerSoft].join(' ')}
                      >
                        Разблокировать
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {blockedUsers.length === 0 && (
                <div className={styles.emptyState}>
                  Заблокированных пользователей нет.
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'notifications' && session.permissions.can_manage_notifications && (
        <section className={styles.sectionCardSoft}>
          <div className={styles.sectionLead}>
            <div className={styles.sectionIcon}>
              <Clock3 className="h-5 w-5" />
            </div>
            <div>
              <h3 className={styles.sectionTitle}>Время уведомлений</h3>
              <p className={styles.sectionCopy}>Гибкая настройка плановых напоминаний по каждому этажу.</p>
            </div>
          </div>

          {notificationError && <div className={styles.sectionError}>{notificationError}</div>}

          <div className={styles.notificationGrid}>
            {notificationSettings.map((item) => (
              <div key={item.floor} className={styles.notificationCard}>
                <div className={styles.notificationRow}>
                  <div>
                    <div className={styles.notificationTitle}>Этаж {item.floor}</div>
                    <div className={styles.notificationMeta}>
                      Последняя отправка: {item.last_notified_on ?? 'ещё не было'}
                    </div>
                  </div>
                  <div className={styles.notificationControls}>
                    <input
                      value={timeDrafts[item.floor] ?? formatTime(item.notification_hour, item.notification_minute)}
                      onChange={(event) => setTimeDrafts((current) => ({ ...current, [item.floor]: event.target.value }))}
                      className={`field ${styles.timeField}`}
                    />
                    <button
                      onClick={() => handleSaveNotificationTime(item.floor)}
                      className="button-secondary"
                    >
                      Сохранить
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'broadcast' && session.permissions.can_broadcast && (
        <section className={styles.sectionCardSoft}>
          <div className={styles.sectionLead}>
            <div className={styles.sectionIcon}>
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <h3 className={styles.sectionTitle}>Рассылка</h3>
              <p className={styles.sectionCopy}>Сообщения отправляются только активным пользователям из белого списка.</p>
            </div>
          </div>

          <div className={styles.broadcastGrid}>
            <select
              value={broadcastScope}
              onChange={(event) => setBroadcastScope(event.target.value as 'all' | 'floor' | 'block' | 'room')}
              className="select"
            >
              {session.scope === 'all' && <option value="all">Все пользователи</option>}
              <option value="floor">Этаж</option>
              <option value="block">Блок</option>
              <option value="room">Комната</option>
            </select>

            {broadcastScope === 'floor' && (
              <select
                value={broadcastFloor ?? ''}
                onChange={(event) => setBroadcastFloor(event.target.value ? Number(event.target.value) : null)}
                className="select"
              >
                {session.accessible_floors.map((floor) => (
                  <option key={floor} value={floor}>Этаж {floor}</option>
                ))}
              </select>
            )}

            {broadcastScope === 'block' && (
              <input
                value={broadcastBlock}
                onChange={(event) => setBroadcastBlock(event.target.value)}
                placeholder="Например, 1502"
                className="field"
              />
            )}

            {broadcastScope === 'room' && (
              <input
                value={broadcastRoom}
                onChange={(event) => setBroadcastRoom(event.target.value)}
                placeholder="Например, 1502А"
                className="field"
              />
            )}

            <select
              value={broadcastRole}
              onChange={(event) => setBroadcastRole(event.target.value as 'all' | 'admin' | 'chairman' | 'starosta' | 'user')}
              className="select"
            >
              <option value="all">Все роли</option>
              <option value="user">Только жильцы</option>
              <option value="starosta">Только старосты</option>
              <option value="chairman">Только председатели</option>
              <option value="admin">Только админы</option>
            </select>
          </div>

          <textarea
            value={broadcastText}
            onChange={(event) => setBroadcastText(event.target.value)}
            placeholder="Текст рассылки"
            className={`textarea ${styles.broadcastTextarea}`}
          />

          {broadcastResult && <div className={styles.sectionSuccess}>{broadcastResult}</div>}
          {broadcastError && <div className={styles.sectionError}>{broadcastError}</div>}

          <div className={styles.submitRow}>
            <button
              onClick={handleSendBroadcast}
              disabled={broadcastLoading}
              className="button"
            >
              <Send className="h-4 w-4" />
              {broadcastLoading ? 'Отправляю...' : 'Запустить рассылку'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
