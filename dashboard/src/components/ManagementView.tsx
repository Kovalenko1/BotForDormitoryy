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

function statusPillClasses(user: UserListItem) {
  if (user.is_blocked) {
    return 'border-[#ff8475]/40 bg-[#311918] text-[#ff9f93]';
  }

  return user.is_whitelisted
    ? 'border-[#9dd4b5]/30 bg-[#12251c] text-[#93ddb1]'
    : 'border-[#7b7f89]/30 bg-[#17191d] text-[#a8adb8]';
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
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {session.user.role === 'admin' && (
              <button
                onClick={() => handleRoleChange(user.chat_id, 'chairman')}
                className="rounded-2xl border border-[#353a33] bg-[#151915] px-3 py-2 text-xs text-[#cde4bf] transition hover:border-[#4f5c48]"
              >
                В председатели
              </button>
            )}
            <button
              onClick={() => handleRoleChange(user.chat_id, 'starosta')}
              className="rounded-2xl border border-[#2f3640] bg-[#14171b] px-3 py-2 text-xs text-[#d9e2f2] transition hover:border-[#4a5361]"
            >
              В старосты
            </button>
            <button
              onClick={() => handleRoleChange(user.chat_id, 'user')}
              className="rounded-2xl border border-[#3a2625] bg-[#1a1212] px-3 py-2 text-xs text-[#ffb4aa] transition hover:border-[#6b3f3a]"
            >
              Снять роль
            </button>
          </div>
        )}

        {session.permissions.can_manage_user_access && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button
              onClick={() => handleAccessUpdate(user.chat_id, { is_whitelisted: true }, `${user.display_name} добавлен в белый список.`)}
              className="rounded-2xl border border-[#2d3d33] bg-[#122019] px-3 py-2 text-xs text-[#93ddb1] transition hover:border-[#4b705d]"
            >
              Белый список
            </button>
            <button
              onClick={() => handleAccessUpdate(user.chat_id, { is_whitelisted: false }, `${user.display_name} перемещён в чёрный список.`)}
              className="rounded-2xl border border-[#30333a] bg-[#15171c] px-3 py-2 text-xs text-[#b6bcc9] transition hover:border-[#515867]"
            >
              Чёрный список
            </button>
            <button
              onClick={() => handleAccessUpdate(user.chat_id, { is_blocked: !user.is_blocked }, user.is_blocked ? `${user.display_name} разблокирован.` : `${user.display_name} заблокирован.`)}
              className={`rounded-2xl border px-3 py-2 text-xs transition ${
                user.is_blocked
                  ? 'border-[#2f4c36] bg-[#132018] text-[#8ee4a5] hover:border-[#4c7d5c]'
                  : 'border-[#3b2525] bg-[#1a1111] text-[#ffb4aa] hover:border-[#6f3e3e]'
              }`}
            >
              {user.is_blocked ? 'Разблокировать' : 'Заблокировать'}
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderMiniUserCard = (user: UserListItem, accentClass: string) => (
    <div key={user.chat_id} className={`rounded-2xl border bg-[#0b0d11] p-4 ${accentClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-white">{user.display_name}</div>
          <div className="mt-1 text-xs text-[#8d93a0]">{user.chat_id}</div>
        </div>
        <div className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] ${statusPillClasses(user)}`}>
          {user.is_whitelisted ? 'White' : 'Black'}
        </div>
      </div>
      <div className="mt-3 text-sm text-[#c6cad2]">
        {user.room ? `Комната ${user.room}` : 'Комната не указана'}
        {user.floor ? ` · этаж ${user.floor}` : ''}
      </div>
      {canManageUser(user) && (
        <button
          onClick={() => handleRoleChange(user.chat_id, 'user')}
          className="mt-4 rounded-full border border-[#363a44] px-3 py-1.5 text-xs text-[#d7dce5] transition hover:border-[#5a6070]"
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
    <section className="rounded-[28px] border border-[#222731] bg-[#0b0d11] p-5 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium text-white">{title}</h3>
          <p className="mt-1 text-sm text-[#8d93a0]">{description}</p>
        </div>
        <div className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.24em] ${listType === 'white' ? 'border-[#2d3d33] bg-[#122019] text-[#93ddb1]' : 'border-[#30333a] bg-[#15171c] text-[#b6bcc9]'}`}>
          {users.length}
        </div>
      </div>

      <div className="space-y-3">
        {users.map((user) => (
          <div key={user.chat_id} className="rounded-2xl border border-[#1e232d] bg-[#11141a] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-white">{user.display_name}</span>
                  <span className="rounded-full border border-[#303641] px-2 py-0.5 text-[10px] uppercase tracking-[0.22em] text-[#a6aebb]">
                    {roleLabels[user.role] ?? user.role}
                  </span>
                  {user.is_blocked && (
                    <span className="rounded-full border border-[#6d3a37] bg-[#251616] px-2 py-0.5 text-[10px] uppercase tracking-[0.22em] text-[#ff9f93]">
                      Blocked
                    </span>
                  )}
                </div>
                <div className="mt-2 text-sm text-[#b7bdc9]">
                  {user.room ? `Комната ${user.room}` : 'Комната не указана'}
                  {user.floor ? ` · этаж ${user.floor}` : ''}
                </div>
              </div>

              {session.permissions.can_manage_user_access && canManageUser(user) && (
                <div className="grid grid-cols-1 gap-2 sm:min-w-[230px]">
                  <button
                    onClick={() => handleAccessUpdate(user.chat_id, { is_whitelisted: listType !== 'white' }, listType === 'white' ? `${user.display_name} перемещён в чёрный список.` : `${user.display_name} добавлен в белый список.`)}
                    className="rounded-2xl border border-[#303641] bg-[#171b22] px-3 py-2 text-xs text-[#d6dce7] transition hover:border-[#525b6b]"
                  >
                    {listType === 'white' ? 'В чёрный список' : 'В белый список'}
                  </button>
                  <button
                    onClick={() => handleAccessUpdate(user.chat_id, { is_blocked: !user.is_blocked }, user.is_blocked ? `${user.display_name} разблокирован.` : `${user.display_name} заблокирован.`)}
                    className="rounded-2xl border border-[#3b2525] bg-[#1a1111] px-3 py-2 text-xs text-[#ffb4aa] transition hover:border-[#6f3e3e]"
                  >
                    {user.is_blocked ? 'Разблокировать' : 'Заблокировать'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {users.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[#262c37] px-4 py-8 text-center text-sm text-[#6f7785]">
            Здесь пока нет пользователей.
          </div>
        )}
      </div>
    </section>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 pb-8 pt-4 sm:space-y-6 sm:px-6 lg:px-8">
      <header className="overflow-hidden rounded-[32px] border border-[#232733] bg-[radial-gradient(circle_at_top_left,_rgba(111,177,132,0.18),_transparent_42%),linear-gradient(135deg,#0d1015_0%,#111723_55%,#0c0f14_100%)] p-5 sm:p-6 lg:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] uppercase tracking-[0.34em] text-[#8ca28f]">Управление доступом, ролями и коммуникацией</p>
            <h2 className="mt-3 text-3xl font-serif italic tracking-tight text-white sm:text-4xl">Центр управления общежитием</h2>
            <p className="mt-3 text-sm leading-relaxed text-[#b2bac8]">
              Разделён по задачам: staff-ролям, спискам доступа, уведомлениям и рассылкам. Белый список получает уведомления и видит график, чёрный список отключает эти сценарии, блокировка полностью закрывает доступ.
            </p>
          </div>

          <button
            onClick={() => onNavigate('users')}
            className="inline-flex items-center gap-2 self-start rounded-full border border-[#303641] bg-[#171b22]/80 px-4 py-2 text-sm text-[#d9e1ec] transition hover:border-[#4b5361]"
          >
            История пользователей <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-3xl border border-[#26303c] bg-[#121722]/85 p-4">
            <div className="flex items-center gap-2 text-[#9db3f2]"><Crown className="h-4 w-4" /> <span className="text-xs uppercase tracking-[0.24em]">Staff</span></div>
            <div className="mt-3 text-3xl font-semibold text-white">{admins.length + chairmen.length + starostas.length}</div>
            <div className="mt-1 text-sm text-[#8d93a0]">админы, председатели и старосты</div>
          </div>
          <div className="rounded-3xl border border-[#284139] bg-[#121c19]/85 p-4">
            <div className="flex items-center gap-2 text-[#93ddb1]"><ShieldCheck className="h-4 w-4" /> <span className="text-xs uppercase tracking-[0.24em]">White List</span></div>
            <div className="mt-3 text-3xl font-semibold text-white">{whiteListUsers.length}</div>
            <div className="mt-1 text-sm text-[#8d93a0]">получают уведомления и видят график</div>
          </div>
          <div className="rounded-3xl border border-[#2d3340] bg-[#131720]/85 p-4">
            <div className="flex items-center gap-2 text-[#b6bcc9]"><ShieldX className="h-4 w-4" /> <span className="text-xs uppercase tracking-[0.24em]">Black List</span></div>
            <div className="mt-3 text-3xl font-semibold text-white">{blackListUsers.length}</div>
            <div className="mt-1 text-sm text-[#8d93a0]">без доступа к графику и duty-уведомлениям</div>
          </div>
          <div className="rounded-3xl border border-[#432828] bg-[#1a1212]/85 p-4">
            <div className="flex items-center gap-2 text-[#ffb4aa]"><Ban className="h-4 w-4" /> <span className="text-xs uppercase tracking-[0.24em]">Blocked</span></div>
            <div className="mt-3 text-3xl font-semibold text-white">{blockedUsers.length}</div>
            <div className="mt-1 text-sm text-[#8d93a0]">учётных записей заблокировано</div>
          </div>
        </div>
      </header>

      {(actionMessage || actionError) && (
        <div className={`rounded-[28px] border p-4 text-sm sm:p-5 ${actionError ? 'border-[#6d3a37] bg-[#241615] text-[#ffc4bc]' : 'border-[#31503a] bg-[#132018] text-[#b7f0c7]'}`}>
          {actionError || actionMessage}
        </div>
      )}

      <section className="rounded-[28px] border border-[#212631] bg-[#0b0d11] p-2">
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`min-w-fit rounded-[22px] px-4 py-3 text-left transition ${
                activeTab === tab.id
                  ? 'bg-[linear-gradient(135deg,#dce5f3_0%,#c7d9ec_100%)] text-[#08101a]'
                  : 'bg-transparent text-[#9aa2af] hover:bg-[#151920] hover:text-[#edf2f8]'
              }`}
            >
              <div className="text-sm font-medium">{tab.label}</div>
              <div className={`text-[11px] ${activeTab === tab.id ? 'text-[#314250]' : 'text-[#69717f]'}`}>{tab.hint}</div>
            </button>
          ))}
        </div>
      </section>

      {activeTab === 'roles' && session.permissions.can_manage_roles && (
        <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
          <section className="rounded-[28px] border border-[#212833] bg-[#0b0d11] p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-[#2b3340] bg-[#121824] p-3 text-[#dfe8f4]">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-white">Пригласительные ключи</h3>
                <p className="mt-1 text-sm text-[#8d93a0]">Новые роли выдаются через Telegram по одноразовым ключам.</p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {session.user.role === 'admin' && (
                <button
                  onClick={() => handleCreateKey('chairman')}
                  className="rounded-full bg-[#dce5f3] px-4 py-3 text-sm font-medium text-[#09111c]"
                >
                  Ключ председателя
                </button>
              )}
              <button
                onClick={() => handleCreateKey('starosta')}
                className="rounded-full border border-[#303641] bg-[#171b22] px-4 py-3 text-sm text-[#dfe6f2] transition hover:border-[#4c5665]"
              >
                Ключ старосты
              </button>
            </div>

            {generatedKeys.length > 0 && (
              <div className="mt-6 space-y-3">
                {generatedKeys.map((item) => (
                  <div key={`${item.role_to_assign}-${item.key}`} className="rounded-2xl border border-[#242933] bg-[#11141a] p-4">
                    <div className="text-[10px] uppercase tracking-[0.28em] text-[#8d93a0]">{roleLabels[item.role_to_assign] ?? item.role_to_assign}</div>
                    <div className="mt-2 break-all font-mono text-lg text-white">{item.key}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-[28px] border border-[#212833] bg-[#0b0d11] p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl border border-[#2b3340] bg-[#121824] p-3 text-[#dfe8f4]">
                <UserCog className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-white">Текущие роли</h3>
                <p className="mt-1 text-sm text-[#8d93a0]">Отдельные колонки для админов, председателей и старост.</p>
              </div>
            </div>

            {rolesError && <div className="mb-4 text-sm text-[#ffb4aa]">{rolesError}</div>}

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-white"><Crown className="h-4 w-4 text-[#ffce8a]" /> Админы</div>
                {admins.length > 0 ? admins.map((user) => renderMiniUserCard(user, 'border-[#3a3325]')) : (
                  <div className="rounded-2xl border border-dashed border-[#2b313d] px-4 py-8 text-center text-sm text-[#6f7785]">Админы не найдены.</div>
                )}
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-white"><ShieldCheck className="h-4 w-4 text-[#9dc8ff]" /> Председатели</div>
                {chairmen.length > 0 ? chairmen.map((user) => renderMiniUserCard(user, 'border-[#273141]')) : (
                  <div className="rounded-2xl border border-dashed border-[#2b313d] px-4 py-8 text-center text-sm text-[#6f7785]">Председателей пока нет.</div>
                )}
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-white"><Users className="h-4 w-4 text-[#98ddc7]" /> Старосты</div>
                {starostas.length > 0 ? starostas.map((user) => renderMiniUserCard(user, 'border-[#26352f]')) : (
                  <div className="rounded-2xl border border-dashed border-[#2b313d] px-4 py-8 text-center text-sm text-[#6f7785]">Старост пока нет.</div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'residents' && (
        <section className="rounded-[28px] border border-[#212833] bg-[#0b0d11] p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-lg font-medium text-white">Список жильцов</h3>
              <p className="mt-1 text-sm text-[#8d93a0]">Поиск, фильтры и быстрые действия по ролям и доступу.</p>
            </div>
            <div className="rounded-full border border-[#2d3340] bg-[#11161e] px-4 py-2 text-xs uppercase tracking-[0.26em] text-[#9aa2af]">
              Найдено: {visibleUsers.length}
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Имя, chat_id, комната"
              className="rounded-2xl border border-[#2a303b] bg-[#11161e] px-4 py-3 text-sm text-[#edf2f8] placeholder:text-[#69717f] focus:border-[#536071] focus:outline-none md:col-span-2"
            />
            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              className="rounded-2xl border border-[#2a303b] bg-[#11161e] px-4 py-3 text-sm text-[#edf2f8]"
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
              className="rounded-2xl border border-[#2a303b] bg-[#11161e] px-4 py-3 text-sm text-[#edf2f8] disabled:opacity-60"
            >
              {session.scope === 'all' && <option value="">Все этажи</option>}
              {session.accessible_floors.map((floor) => (
                <option key={floor} value={floor}>Этаж {floor}</option>
              ))}
            </select>
            <select
              value={hasRoomFilter}
              onChange={(event) => setHasRoomFilter(event.target.value as 'all' | 'yes' | 'no')}
              className="rounded-2xl border border-[#2a303b] bg-[#11161e] px-4 py-3 text-sm text-[#edf2f8]"
            >
              <option value="all">Любая комната</option>
              <option value="yes">Комната указана</option>
              <option value="no">Без комнаты</option>
            </select>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <select
              value={accessFilter}
              onChange={(event) => setAccessFilter(event.target.value as AccessFilter)}
              className="rounded-2xl border border-[#2a303b] bg-[#11161e] px-4 py-3 text-sm text-[#edf2f8]"
            >
              <option value="all">Любой доступ</option>
              <option value="white">Белый список</option>
              <option value="black">Чёрный список</option>
              <option value="blocked">Только заблокированные</option>
            </select>
          </div>

          {directoryError && <div className="mt-5 text-sm text-[#ffb4aa]">{directoryError}</div>}
          {directoryLoading && <div className="mt-5 text-sm text-[#8d93a0]">Загружаю жильцов...</div>}

          <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {visibleUsers.map((user) => (
              <article key={user.chat_id} className="rounded-[26px] border border-[#212833] bg-[#11151b] p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-medium text-white">{user.display_name}</div>
                    <div className="mt-1 text-xs text-[#8d93a0]">{user.chat_id}</div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <span className="rounded-full border border-[#303641] px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] text-[#d2d9e6]">
                      {roleLabels[user.role] ?? user.role}
                    </span>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] ${statusPillClasses(user)}`}>
                      {user.is_blocked ? 'Blocked' : user.is_whitelisted ? 'White' : 'Black'}
                    </span>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-[#20252f] bg-[#0d1015] px-4 py-3 text-sm text-[#c6cad2]">
                  <div>{user.room ? `Комната ${user.room}` : 'Комната не указана'}</div>
                  <div className="mt-1 text-[#8d93a0]">
                    {user.floor ? `Этаж ${user.floor}` : 'Этаж не определён'}
                    {user.username ? ` · ${user.username}` : ''}
                  </div>
                </div>

                {renderActionPanel(user)}
              </article>
            ))}
          </div>

          {!directoryLoading && visibleUsers.length === 0 && (
            <div className="mt-5 rounded-3xl border border-dashed border-[#29303b] px-4 py-14 text-center text-sm text-[#6f7785]">
              По выбранным фильтрам пользователи не найдены.
            </div>
          )}
        </section>
      )}

      {activeTab === 'access' && session.permissions.can_manage_user_access && (
        <div className="grid gap-5 xl:grid-cols-2">
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

          <section className="rounded-[28px] border border-[#212731] bg-[#0b0d11] p-5 sm:p-6 xl:col-span-2">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-medium text-white">Заблокированные пользователи</h3>
                <p className="mt-1 text-sm text-[#8d93a0]">Блокировка закрывает dashboard и исключает пользователя из рабочих сценариев.</p>
              </div>
              <div className="rounded-full border border-[#5a3330] bg-[#201313] px-3 py-1 text-xs uppercase tracking-[0.24em] text-[#ffb4aa]">
                {blockedUsers.length}
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {blockedUsers.map((user) => (
                <div key={user.chat_id} className="rounded-2xl border border-[#3a2525] bg-[#171010] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-medium text-white">{user.display_name}</div>
                      <div className="mt-1 text-sm text-[#d2b0aa]">
                        {user.room ? `Комната ${user.room}` : 'Комната не указана'}
                        {user.floor ? ` · этаж ${user.floor}` : ''}
                      </div>
                    </div>
                    {canManageUser(user) && (
                      <button
                        onClick={() => handleAccessUpdate(user.chat_id, { is_blocked: false }, `${user.display_name} разблокирован.`)}
                        className="rounded-full border border-[#5a3330] px-4 py-2 text-sm text-[#ffd5ce] transition hover:border-[#8c4943]"
                      >
                        Разблокировать
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {blockedUsers.length === 0 && (
                <div className="col-span-full rounded-2xl border border-dashed border-[#29303b] px-4 py-10 text-center text-sm text-[#6f7785]">
                  Заблокированных пользователей нет.
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'notifications' && session.permissions.can_manage_notifications && (
        <section className="rounded-[28px] border border-[#212833] bg-[#0b0d11] p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-[#2b3340] bg-[#121824] p-3 text-[#dfe8f4]">
              <Clock3 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-white">Время уведомлений</h3>
              <p className="mt-1 text-sm text-[#8d93a0]">Гибкая настройка плановых напоминаний по каждому этажу.</p>
            </div>
          </div>

          {notificationError && <div className="mt-5 text-sm text-[#ffb4aa]">{notificationError}</div>}

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {notificationSettings.map((item) => (
              <div key={item.floor} className="rounded-[26px] border border-[#212833] bg-[linear-gradient(135deg,#10151d_0%,#131a24_100%)] p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">Этаж {item.floor}</div>
                    <div className="mt-1 text-sm text-[#8d93a0]">
                      Последняя отправка: {item.last_notified_on ?? 'ещё не было'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={timeDrafts[item.floor] ?? formatTime(item.notification_hour, item.notification_minute)}
                      onChange={(event) => setTimeDrafts((current) => ({ ...current, [item.floor]: event.target.value }))}
                      className="w-28 rounded-full border border-[#2f3640] bg-[#0c1016] px-4 py-2 text-sm text-[#edf2f8] focus:border-[#556173] focus:outline-none"
                    />
                    <button
                      onClick={() => handleSaveNotificationTime(item.floor)}
                      className="rounded-full border border-[#303641] bg-[#171b22] px-4 py-2 text-sm text-[#dfe6f2] transition hover:border-[#4c5665]"
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
        <section className="rounded-[28px] border border-[#212833] bg-[#0b0d11] p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-[#2b3340] bg-[#121824] p-3 text-[#dfe8f4]">
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-white">Рассылка</h3>
              <p className="mt-1 text-sm text-[#8d93a0]">Сообщения отправляются только активным пользователям из белого списка.</p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <select
              value={broadcastScope}
              onChange={(event) => setBroadcastScope(event.target.value as 'all' | 'floor' | 'block' | 'room')}
              className="rounded-2xl border border-[#2a303b] bg-[#11161e] px-4 py-3 text-sm text-[#edf2f8]"
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
                className="rounded-2xl border border-[#2a303b] bg-[#11161e] px-4 py-3 text-sm text-[#edf2f8]"
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
                className="rounded-2xl border border-[#2a303b] bg-[#11161e] px-4 py-3 text-sm text-[#edf2f8] placeholder:text-[#69717f] focus:border-[#536071] focus:outline-none"
              />
            )}

            {broadcastScope === 'room' && (
              <input
                value={broadcastRoom}
                onChange={(event) => setBroadcastRoom(event.target.value)}
                placeholder="Например, 1502А"
                className="rounded-2xl border border-[#2a303b] bg-[#11161e] px-4 py-3 text-sm text-[#edf2f8] placeholder:text-[#69717f] focus:border-[#536071] focus:outline-none"
              />
            )}

            <select
              value={broadcastRole}
              onChange={(event) => setBroadcastRole(event.target.value as 'all' | 'admin' | 'chairman' | 'starosta' | 'user')}
              className="rounded-2xl border border-[#2a303b] bg-[#11161e] px-4 py-3 text-sm text-[#edf2f8]"
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
            className="mt-4 min-h-36 w-full rounded-[26px] border border-[#2a303b] bg-[#11161e] px-4 py-4 text-sm text-[#edf2f8] placeholder:text-[#69717f] focus:border-[#536071] focus:outline-none"
          />

          {broadcastResult && <div className="mt-4 text-sm text-[#93ddb1]">{broadcastResult}</div>}
          {broadcastError && <div className="mt-4 text-sm text-[#ffb4aa]">{broadcastError}</div>}

          <div className="mt-5">
            <button
              onClick={handleSendBroadcast}
              disabled={broadcastLoading}
              className="inline-flex items-center gap-2 rounded-full bg-[#dce5f3] px-5 py-3 text-sm font-medium text-[#09111c] disabled:opacity-60"
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
