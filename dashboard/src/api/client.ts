import { getTelegramInitData } from './telegram';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
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

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const includeJson = init.body !== undefined;
  const response = await fetch(path, {
    ...init,
    headers: buildHeaders(includeJson),
  });

  if (!response.ok) {
    let message = 'Не удалось получить данные dashboard.';

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