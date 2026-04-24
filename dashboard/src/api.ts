import type { ViewType } from './types';

export { ApiError } from './api/client';
export { dashboardApi } from './api/dashboard';
export { initTelegramWebApp, waitForTelegramInitData } from './api/telegram';

const VALID_VIEWS: ViewType[] = ['dashboard', 'general', 'users', 'errors', 'schedule', 'statistics', 'management'];

export function getInitialView(): ViewType {
  const current = new URLSearchParams(window.location.search).get('view');
  return VALID_VIEWS.includes(current as ViewType) ? (current as ViewType) : 'dashboard';
}
