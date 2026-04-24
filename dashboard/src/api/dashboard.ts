import { apiRequest } from './client';
import type {
  AccessKeyResponse,
  BroadcastResponse,
  DashboardOverviewResponse,
  DashboardSessionResponse,
  DutyAssessmentGrade,
  DutyAssessmentResponse,
  DutyCalendarResponse,
  DutyStatsResponse,
  ErrorsResponse,
  GeneralLogsResponse,
  ManagementRolesResponse,
  NotificationSettingsResponse,
  RoleEnum,
  UserFootprintResponse,
  UsersResponse,
} from '../types';

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
  upsertDutyAssessment(floor: number, dutyDate: string, grade: DutyAssessmentGrade, note?: string) {
    return apiRequest<DutyAssessmentResponse>(`/api/duty/assessments/${floor}/${encodeURIComponent(dutyDate)}`, {
      method: 'PUT',
      body: JSON.stringify({ grade, note }),
    });
  },
  getDutyStats(params: { floor?: number | null; startDate?: string; endDate?: string } = {}) {
    const query = new URLSearchParams();
    if (typeof params.floor === 'number') {
      query.set('floor', String(params.floor));
    }
    if (params.startDate) {
      query.set('start_date', params.startDate);
    }
    if (params.endDate) {
      query.set('end_date', params.endDate);
    }
    const suffix = query.toString();
    return apiRequest<DutyStatsResponse>(`/api/duty/stats${suffix ? `?${suffix}` : ''}`);
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