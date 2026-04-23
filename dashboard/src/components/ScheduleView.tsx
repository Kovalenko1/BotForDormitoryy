import React, { useEffect, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { ApiError, dashboardApi } from '../api';
import type { DashboardSessionResponse, DutyCalendarDay, DutyCalendarResponse } from '../types';

interface ScheduleViewProps {
  session: DashboardSessionResponse;
}

const weekdayLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const monthFormatter = new Intl.DateTimeFormat('ru-RU', {
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Moscow',
});

const mobileDayFormatter = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/Moscow',
});

function formatMonthTitle(year: number, month: number) {
  return monthFormatter.format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatNotificationTime(hour: number, minute: number) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatMobileDayLabel(value: string) {
  return mobileDayFormatter.format(new Date(`${value}T00:00:00`));
}

function getUpcomingDays(days: DutyCalendarDay[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = days.filter((day) => {
    if (!day.room) {
      return false;
    }

    const current = new Date(`${day.date}T00:00:00`);
    return current >= today;
  });

  return (upcoming.length > 0 ? upcoming : days.filter((day) => Boolean(day.room))).slice(0, 5);
}

function getPreferredFloor(session: DashboardSessionResponse) {
  const userFloor = session.user.floor;
  if (typeof userFloor === 'number' && session.accessible_floors.includes(userFloor)) {
    return userFloor;
  }

  return session.accessible_floors[0] ?? null;
}

export function ScheduleView({ session }: ScheduleViewProps) {
  const today = new Date();
  const [selectedFloor, setSelectedFloor] = useState<number | null>(() => getPreferredFloor(session));
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [data, setData] = useState<DutyCalendarResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [queueDraft, setQueueDraft] = useState<string[]>([]);
  const [newBlock, setNewBlock] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedFloor === null || !session.accessible_floors.includes(selectedFloor)) {
      setSelectedFloor(getPreferredFloor(session));
    }
  }, [selectedFloor, session]);

  useEffect(() => {
    if (selectedFloor === null) {
      setLoading(false);
      return;
    }

    let isActive = true;
    setLoading(true);
    setSaveMessage('');
    setSaveError('');

    dashboardApi.getDutyCalendar({ floor: selectedFloor, year, month })
      .then((payload) => {
        if (!isActive) {
          return;
        }

        setData(payload);
        setQueueDraft(payload.queue.map((item) => item.room));
        setErrorMessage('');
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setErrorMessage(error instanceof ApiError ? error.message : 'Не удалось загрузить график дежурств.');
      })
      .finally(() => {
        if (isActive) {
          setLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [selectedFloor, year, month, reloadToken]);

  const changeMonth = (delta: number) => {
    const current = new Date(year, month - 1 + delta, 1);
    setYear(current.getFullYear());
    setMonth(current.getMonth() + 1);
  };

  const addBlockToDraft = () => {
    const value = newBlock.trim();
    if (!value) {
      return;
    }

    setQueueDraft((current) => [...current, value]);
    setNewBlock('');
  };

  const moveDraftItem = (index: number, direction: -1 | 1) => {
    setQueueDraft((current) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }

      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const removeDraftItem = (index: number) => {
    setQueueDraft((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const saveSchedule = async () => {
    if (selectedFloor === null) {
      return;
    }

    setSaving(true);
    setSaveMessage('');
    setSaveError('');

    try {
      await dashboardApi.replaceDutySchedule(selectedFloor, queueDraft);
      setSaveMessage('График сохранён.');
      setReloadToken((value) => value + 1);
    } catch (error) {
      setSaveError(error instanceof ApiError ? error.message : 'Не удалось сохранить график.');
    } finally {
      setSaving(false);
    }
  };

  if (session.accessible_floors.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 pb-8 pt-4 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-[#212833] bg-[#0b0d11] p-6 text-[#e2e7ee]">
          Сначала укажите комнату в боте, чтобы получить доступ к графику своего этажа.
        </div>
      </div>
    );
  }

  const leadingEmptyCells = data?.days[0]?.weekday ?? 0;
  const upcomingDays = data ? getUpcomingDays(data.days) : [];
  const dutyToday = data?.days.find((day) => day.is_today && day.room) ?? upcomingDays[0] ?? null;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 pb-8 pt-4 sm:space-y-6 sm:px-6 lg:px-8">
      <header className="overflow-hidden rounded-[32px] border border-[#222a34] bg-[radial-gradient(circle_at_top_left,_rgba(138,194,255,0.16),_transparent_38%),linear-gradient(135deg,#0c1017_0%,#101724_48%,#0b0d12_100%)] p-5 sm:p-6 lg:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] uppercase tracking-[0.34em] text-[#8fb6ef]">Календарь дежурств</p>
            <h2 className="mt-3 text-3xl font-serif italic tracking-tight text-white sm:text-4xl">График этажа</h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {session.accessible_floors.length > 1 && (
              <select
                value={selectedFloor ?? ''}
                onChange={(event) => setSelectedFloor(Number(event.target.value))}
                className="rounded-full border border-[#303743] bg-[#121824] px-4 py-2.5 text-sm text-[#eef3f8] focus:border-[#546173] focus:outline-none"
              >
                {session.accessible_floors.map((floor) => (
                  <option key={floor} value={floor}>Этаж {floor}</option>
                ))}
              </select>
            )}

            <div className="flex items-center gap-2 rounded-full border border-[#303743] bg-[#121824] px-2 py-2">
              <button onClick={() => changeMonth(-1)} className="flex h-9 w-9 items-center justify-center rounded-full text-[#dce4f0] transition hover:bg-[#1b2230]">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="min-w-40 text-center text-sm capitalize text-[#eef3f8]">{formatMonthTitle(year, month)}</div>
              <button onClick={() => changeMonth(1)} className="flex h-9 w-9 items-center justify-center rounded-full text-[#dce4f0] transition hover:bg-[#1b2230]">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {data && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl border border-[#263141] bg-[#121824]/90 p-4">
              <div className="flex items-center gap-2 text-[#9dc8ff]"><CalendarDays className="h-4 w-4" /> <span className="text-xs uppercase tracking-[0.24em]">Этаж</span></div>
              <div className="mt-3 text-3xl font-semibold text-white">{data.floor}</div>
              <div className="mt-1 text-sm text-[#8d93a0]">доступный контур: {data.scope === 'all' ? 'все этажи' : 'один этаж'}</div>
            </div>
            <div className="rounded-3xl border border-[#284139] bg-[#122019]/90 p-4">
              <div className="flex items-center gap-2 text-[#93ddb1]"><Clock3 className="h-4 w-4" /> <span className="text-xs uppercase tracking-[0.24em]">Старт цикла</span></div>
              <div className="mt-3 text-lg font-semibold text-white">{data.start_date}</div>
              <div className="mt-1 text-sm text-[#8d93a0]">с этой даты очередь считает следующий блок</div>
            </div>
            <div className="rounded-3xl border border-[#2c3240] bg-[#121720]/90 p-4">
              <div className="flex items-center gap-2 text-[#d7dfeb]"><Clock3 className="h-4 w-4" /> <span className="text-xs uppercase tracking-[0.24em]">Уведомление</span></div>
              <div className="mt-3 text-3xl font-semibold text-white">
                {formatNotificationTime(data.notification_setting.notification_hour, data.notification_setting.notification_minute)}
              </div>
              <div className="mt-1 text-sm text-[#8d93a0]">время отправки напоминания по этажу</div>
            </div>
            <div className="rounded-3xl border border-[#373227] bg-[#1b1712]/90 p-4">
              <div className="flex items-center gap-2 text-[#ffd892]"><CalendarDays className="h-4 w-4" /> <span className="text-xs uppercase tracking-[0.24em]">Ближайший блок</span></div>
              <div className="mt-3 text-3xl font-semibold text-white">{dutyToday?.room ?? '—'}</div>
              <div className="mt-1 text-sm text-[#8d93a0]">{dutyToday ? dutyToday.date : 'очередь пока не задана'}</div>
            </div>
          </div>
        )}
      </header>

      {errorMessage && (
        <div className="rounded-[28px] border border-[#6d3a37] bg-[#241615] p-4 text-[#ffc4bc]">
          {errorMessage}
        </div>
      )}

      {loading && (
        <div className="rounded-[28px] border border-[#212833] bg-[#0b0d11] p-5 text-sm text-[#8d93a0]">
          Загружаю график дежурств...
        </div>
      )}

      {data && (
        <div className="grid gap-5 xl:grid-cols-[1.5fr_0.95fr]">
          <section className="order-2 rounded-[30px] border border-[#212833] bg-[#0b0d11] p-5 sm:p-6 xl:order-1">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-lg font-medium text-white">Месяц дежурств</h3>
              </div>
              <div className="rounded-full border border-[#2d3440] bg-[#11161e] px-4 py-2 text-xs uppercase tracking-[0.24em] text-[#9aa2af]">
                {queueDraft.length} блоков в очереди
              </div>
            </div>

            <div className="mt-6 hidden md:block">
              <div className="grid grid-cols-7 gap-3 text-center text-[11px] uppercase tracking-[0.28em] text-[#6f7785]">
                {weekdayLabels.map((label) => (
                  <div key={label} className="rounded-full border border-transparent px-2 py-2">{label}</div>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-7 gap-3">
                {Array.from({ length: leadingEmptyCells }).map((_, index) => (
                  <div key={`empty-${index}`} className="min-h-32 rounded-[24px] border border-dashed border-[#1d232d] bg-[#0d1015]" />
                ))}

                {data.days.map((day) => (
                  <div
                    key={day.date}
                    className={`min-h-32 min-w-0 overflow-hidden rounded-[24px] border p-4 transition ${
                      day.is_today
                        ? 'border-[#6fb184]/50 bg-[linear-gradient(180deg,#13241a_0%,#10161a_100%)] shadow-[0_18px_45px_rgba(17,41,24,0.28)]'
                        : 'border-[#1f2430] bg-[#10141b]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-semibold ${day.is_today ? 'text-white' : 'text-[#d7dde7]'}`}>{day.day}</span>
                      {day.queue_position && (
                        <span className="rounded-full border border-[#2f3640] px-2 py-0.5 text-[10px] uppercase tracking-[0.24em] text-[#8d93a0]">
                          #{day.queue_position}
                        </span>
                      )}
                    </div>

                    <div className="mt-6">
                      {day.room ? (
                        <>
                          <p className="text-[11px] uppercase tracking-[0.28em] text-[#6f7785]">Дежурит</p>
                          <p className="mt-2 text-xl font-semibold leading-tight text-white [overflow-wrap:anywhere] xl:text-2xl">{day.room}</p>
                        </>
                      ) : (
                        <p className="mt-6 text-sm text-[#5d6573]">Очередь ещё не заполнена</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 space-y-3 md:hidden">
              {data.days.map((day) => (
                <div
                  key={day.date}
                  className={`rounded-[24px] border p-4 ${
                    day.is_today
                      ? 'border-[#6fb184]/50 bg-[linear-gradient(180deg,#13241a_0%,#10161a_100%)]'
                      : 'border-[#1f2430] bg-[#10141b]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium capitalize text-white">{formatMobileDayLabel(day.date)}</div>
                      <div className="mt-1 text-sm text-[#8d93a0]">{day.room ? `Блок ${day.room}` : 'Очередь не заполнена'}</div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {day.queue_position && (
                        <span className="rounded-full border border-[#2f3640] px-2 py-0.5 text-[10px] uppercase tracking-[0.24em] text-[#8d93a0]">
                          #{day.queue_position}
                        </span>
                      )}
                      {day.is_today && (
                        <span className="rounded-full border border-[#3f5a47] bg-[#173021] px-2 py-0.5 text-[10px] uppercase tracking-[0.24em] text-[#93ddb1]">
                          Сегодня
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="order-1 flex flex-col gap-5 xl:order-2">
            <section className="order-2 rounded-[30px] border border-[#212833] bg-[#0b0d11] p-5 sm:p-6 xl:order-1">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-lg font-medium text-white">Очередь блоков</h3>
                  <p className="mt-1 text-sm text-[#8d93a0]">
                    {data.can_edit
                      ? 'После изменения очереди не забудьте сохранить график внизу, чтобы изменения вступили в силу.'
                      : 'Редактирование доступно только старосте, председателю и администратору.'}
                  </p>
                </div>
                <div className="rounded-full border border-[#2d3440] bg-[#11161e] px-3 py-1 text-xs uppercase tracking-[0.24em] text-[#9aa2af]">
                  {queueDraft.length} элементов
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {queueDraft.map((block, index) => (
                  <div key={`${block}-${index}`} className="rounded-[24px] border border-[#1f2430] bg-[#10141b] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] uppercase tracking-[0.28em] text-[#6f7785]">Позиция {index + 1}</div>
                        <div className="mt-2 text-lg font-semibold text-white">Блок {block}</div>
                      </div>

                      {data.can_edit && (
                        <div className="grid grid-cols-3 gap-2">
                          <button onClick={() => moveDraftItem(index, -1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-[#2f3640] text-[#d9e1ec] transition hover:border-[#566173]">
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button onClick={() => moveDraftItem(index, 1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-[#2f3640] text-[#d9e1ec] transition hover:border-[#566173]">
                            <ChevronDown className="h-4 w-4" />
                          </button>
                          <button onClick={() => removeDraftItem(index)} className="flex h-9 w-9 items-center justify-center rounded-full border border-[#4d2a2a] text-[#ffb4aa] transition hover:border-[#7a4444]">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {queueDraft.length === 0 && (
                  <div className="rounded-[24px] border border-dashed border-[#262c37] px-4 py-10 text-center text-sm text-[#6f7785]">
                    Очередь пока пустая.
                  </div>
                )}
              </div>

              {data.can_edit && (
                <div className="mt-5 space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      value={newBlock}
                      onChange={(event) => setNewBlock(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          addBlockToDraft();
                        }
                      }}
                      placeholder="Добавить блок, например 1502"
                      className="flex-1 rounded-full border border-[#2a303b] bg-[#11161e] px-4 py-3 text-sm text-[#edf2f8] placeholder:text-[#69717f] focus:border-[#536071] focus:outline-none"
                    />
                    <button
                      onClick={addBlockToDraft}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-[#303641] bg-[#171b22] px-4 py-3 text-sm text-[#dfe6f2] transition hover:border-[#4c5665]"
                    >
                      <Plus className="h-4 w-4" />
                      Добавить
                    </button>
                  </div>

                  {saveMessage && <div className="text-sm text-[#93ddb1]">{saveMessage}</div>}
                  {saveError && <div className="text-sm text-[#ffb4aa]">{saveError}</div>}

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={saveSchedule}
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-full bg-[#dce5f3] px-5 py-3 text-sm font-medium text-[#09111c] disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" />
                      {saving ? 'Сохраняю...' : 'Сохранить график'}
                    </button>
                    <button
                      onClick={() => setQueueDraft([])}
                      className="rounded-full border border-[#4d2a2a] px-5 py-3 text-sm text-[#ffb4aa] transition hover:border-[#7a4444]"
                    >
                      Очистить очередь
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="order-1 rounded-[30px] border border-[#212833] bg-[#0b0d11] p-5 sm:p-6 xl:order-2">
              <div className="mb-4">
                <h3 className="text-lg font-medium text-white">Ближайшие дежурства</h3>
              </div>

              <div className="space-y-3">
                {upcomingDays.map((day) => (
                  <div key={day.date} className="rounded-[22px] border border-[#1f2430] bg-[#10141b] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-white">{formatMobileDayLabel(day.date)}</div>
                        <div className="mt-1 text-sm text-[#8d93a0]">Блок {day.room}</div>
                      </div>
                      {day.is_today && (
                        <span className="rounded-full border border-[#3f5a47] bg-[#173021] px-2 py-0.5 text-[10px] uppercase tracking-[0.24em] text-[#93ddb1]">
                          Сегодня
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {upcomingDays.length === 0 && (
                  <div className="rounded-[22px] border border-dashed border-[#262c37] px-4 py-8 text-center text-sm text-[#6f7785]">
                    Для этого месяца дежурства ещё не назначены.
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
