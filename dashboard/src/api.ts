import type {
  AccessKeyResponse,
  BroadcastResponse,
  DashboardOverviewResponse,
  DashboardSessionResponse,
  DutyCalendarResponse,
  ErrorsResponse,
  GeneralLogsResponse,
  ManagementRolesResponse,
  NotificationSettingsResponse,
  RoleEnum,
  UserFootprintResponse,
  UsersResponse,
  ViewType,
} from './types';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: Record<string, unknown>;
        ready?: () => void;
        expand?: () => void;
        requestFullscreen?: () => void | Promise<void>;
      };
    };
  }
}

const VALID_VIEWS: ViewType[] = ['dashboard', 'general', 'users', 'errors', 'schedule', 'management'];

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function initTelegramWebApp() {
  const webApp = window.Telegram?.WebApp;
  webApp?.ready?.();
  webApp?.expand?.();

  window.setTimeout(() => {
    try {
      webApp?.expand?.();
      webApp?.requestFullscreen?.();
    } catch {
      // Telegram clients differ in WebApp API support.
    }
  }, 80);
}

function getTelegramInitData() {
  return window.Telegram?.WebApp?.initData?.trim() ?? '';
}

export async function waitForTelegramInitData(timeoutMs = 2500) {
  const token = new URLSearchParams(window.location.search).get('token')?.trim();
  if (token || getTelegramInitData()) {
    return;
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    if (getTelegramInitData()) {
      return;
    }
  }
}

export function getInitialView(): ViewType {
  const current = new URLSearchParams(window.location.search).get('view');
  return VALID_VIEWS.includes(current as ViewType) ? (current as ViewType) : 'dashboard';
}

function buildHeaders(includeJson = false) {
  const headers = new Headers({
    Accept: 'application/json',
  });

  if (includeJson) {
    headers.set('Content-Type', 'application/json');
  }

  const initData = getTelegramInitData();
  const token = new URLSearchParams(window.location.search).get('token')?.trim();

  if (initData) {
    headers.set('X-Telegram-Init-Data', initData);
  }

  if (token) {
    headers.set('X-Dashboard-Token', token);
  }

  return headers;
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const includeJson = init.body !== undefined;
  const response = await fetch(path, {
    ...init,
    headers: buildHeaders(includeJson),
  });

  if (!response.ok) {
    let message = 'Не удалось загрузить данные dashboard.';

    try {
      const payload = await response.json();
      if (typeof payload?.detail === 'string') {
        message = payload.detail;
      }
    } catch {
      message = response.statusText || message;
    }

    throw new ApiError(response.status, message);
  }

  return response.json() as Promise<T>;
}

export const dashboardApi = {
  getSession() {
    return apiRequest<DashboardSessionResponse>('/api/session');
  },
  getOverview() {
    return apiRequest<DashboardOverviewResponse>('/api/dashboard/overview');
  },
  getGeneralLogs(limit = 120) {
    return apiRequest<GeneralLogsResponse>(`/api/logs/general?limit=${limit}`);
  },
  getErrors(limit = 100) {
    return apiRequest<ErrorsResponse>(`/api/errors?limit=${limit}`);
  },
  getUsers(params: {
    search?: string;
    role?: string;
    floor?: number | null;
    hasRoom?: boolean | null;
    isBlocked?: boolean | null;
    isWhitelisted?: boolean | null;
    limit?: number;
  } = {}) {
    const query = new URLSearchParams();
    if (params.search) {
      query.set('search', params.search);
    }
    if (params.role) {
      query.set('role', params.role);
    }
    if (typeof params.floor === 'number') {
      query.set('floor', String(params.floor));
    }
    if (typeof params.hasRoom === 'boolean') {
      query.set('has_room', String(params.hasRoom));
    }
    if (typeof params.isBlocked === 'boolean') {
      query.set('is_blocked', String(params.isBlocked));
    }
    if (typeof params.isWhitelisted === 'boolean') {
      query.set('is_whitelisted', String(params.isWhitelisted));
    }
    if (typeof params.limit === 'number') {
      query.set('limit', String(params.limit));
    }
    const suffix = query.toString();
    return apiRequest<UsersResponse>(`/api/users${suffix ? `?${suffix}` : ''}`);
  },
  getUserFootprint(chatId: string) {
    return apiRequest<UserFootprintResponse>(`/api/users/${encodeURIComponent(chatId)}/footprint`);
  },
  getDutyCalendar(params: { floor?: number | null; year?: number; month?: number } = {}) {
    const query = new URLSearchParams();
    if (typeof params.floor === 'number') {
      query.set('floor', String(params.floor));
    }
    if (typeof params.year === 'number') {
      query.set('year', String(params.year));
    }
    if (typeof params.month === 'number') {
      query.set('month', String(params.month));
    }
    const suffix = query.toString();
    return apiRequest<DutyCalendarResponse>(`/api/duty/calendar${suffix ? `?${suffix}` : ''}`);
  },
  replaceDutySchedule(floor: number, blocks: string[]) {
    return apiRequest<{ floor: number; blocks: string[] }>(`/api/duty/floors/${floor}`, {
      method: 'PUT',
      body: JSON.stringify({ blocks }),
    });
  },
  getNotificationSettings() {
    return apiRequest<NotificationSettingsResponse>('/api/notification-settings');
  },
  updateNotificationSetting(floor: number, time: string) {
    return apiRequest(`/api/notification-settings/${floor}`, {
      method: 'PUT',
      body: JSON.stringify({ time }),
    });
  },
  sendBroadcast(payload: {
    text: string;
    scope: 'all' | 'floor' | 'block' | 'room';
    floor?: number;
    block?: string;
    room?: string;
    role?: 'all' | 'admin' | 'chairman' | 'starosta' | 'user';
  }) {
    return apiRequest<BroadcastResponse>('/api/broadcast', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getManagementRoles() {
    return apiRequest<ManagementRolesResponse>('/api/management/roles');
  },
  createAccessKey(roleToAssign: 'chairman' | 'starosta') {
    return apiRequest<AccessKeyResponse>('/api/management/access-keys', {
      method: 'POST',
      body: JSON.stringify({ role_to_assign: roleToAssign }),
    });
  },
  updateUserRole(chatId: string, role: RoleEnum | 'user' | 'chairman' | 'starosta') {
    return apiRequest(`/api/management/users/${encodeURIComponent(chatId)}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
  },
  updateUserAccess(chatId: string, payload: { is_blocked?: boolean; is_whitelisted?: boolean }) {
    return apiRequest(`/api/management/users/${encodeURIComponent(chatId)}/access`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
};
