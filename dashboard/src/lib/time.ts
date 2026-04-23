const fullDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'Europe/Moscow',
});

const shortTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'Europe/Moscow',
});

export function formatMoscowDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Некорректная дата';
  }

  return fullDateFormatter.format(date);
}

export function formatMoscowTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--:--:--';
  }

  return shortTimeFormatter.format(date);
}
