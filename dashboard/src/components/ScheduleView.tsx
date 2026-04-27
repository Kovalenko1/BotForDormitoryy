import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  GripVertical,
  Plus,
  Save,
  Trophy,
  Trash2,
  X,
} from 'lucide-react';
import { ApiError, dashboardApi } from '../api';
import { DUTY_GRADE_ORDER, getDutyGradeMeta } from '../lib/duty';
import { formatMoscowDateTime } from '../lib/time';
import type { DashboardSessionResponse, DutyAssessment, DutyAssessmentGrade, DutyCalendarDay, DutyCalendarResponse } from '../types';
import styles from './ScheduleView.module.scss';

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

function getUserBlock(room: string | null) {
  if (!room) {
    return null;
  }

  const normalized = room.trim().replace(/\s/g, '').toUpperCase();
  const match = normalized.match(/^(\d{3,4})/);
  return match?.[1] ?? null;
}

function getGradeToneClassName(grade: DutyAssessmentGrade) {
  return styles[`grade${grade[0].toUpperCase()}${grade.slice(1)}`];
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [assessmentGrade, setAssessmentGrade] = useState<DutyAssessmentGrade>('good');
  const [assessmentNote, setAssessmentNote] = useState('');
  const [assessmentSaving, setAssessmentSaving] = useState(false);
  const [assessmentMessage, setAssessmentMessage] = useState('');
  const [assessmentError, setAssessmentError] = useState('');

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

  useEffect(() => {
    if (!data || !selectedDate) {
      return;
    }

    const existingDay = data.days.find((day) => day.date === selectedDate && day.room);
    if (!existingDay) {
      setSelectedDate(null);
    }
  }, [data, selectedDate]);

  const leadingEmptyCells = data?.days[0]?.weekday ?? 0;
  const upcomingDays = useMemo(() => (data ? getUpcomingDays(data.days) : []), [data]);
  const dutyToday = useMemo(() => (data?.days.find((day) => day.is_today && day.room) ?? upcomingDays[0] ?? null), [data, upcomingDays]);
  const selectedDay = useMemo(
    () => data?.days.find((day) => day.date === selectedDate && day.room) ?? null,
    [data, selectedDate],
  );
  const mobileAgendaDay = selectedDay ?? dutyToday;
  const isRegularUser = session.user.role === 'user';
  const userBlock = useMemo(() => getUserBlock(session.user.room), [session.user.room]);

  useEffect(() => {
    if (!selectedDay) {
      setAssessmentGrade('good');
      setAssessmentNote('');
      setAssessmentMessage('');
      setAssessmentError('');
      return;
    }

    setAssessmentGrade(selectedDay.assessment?.grade ?? 'good');
    setAssessmentNote(selectedDay.assessment?.note ?? '');
    setAssessmentMessage('');
    setAssessmentError('');
  }, [selectedDay?.date]);

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

  const reorderDraftItems = (fromIndex: number, toIndex: number) => {
    setQueueDraft((current) => {
      if (
        fromIndex === toIndex
        || fromIndex < 0
        || toIndex < 0
        || fromIndex >= current.length
        || toIndex >= current.length
      ) {
        return current;
      }

      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const moveDraftItem = (index: number, direction: -1 | 1) => {
    reorderDraftItems(index, index + direction);
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
      setSaveMessage('Очередь сохранена.');
      setReloadToken((value) => value + 1);
    } catch (error) {
      setSaveError(error instanceof ApiError ? error.message : 'Не удалось сохранить график.');
    } finally {
      setSaving(false);
    }
  };

  const updateDayAssessment = (dutyDate: string, assessment: DutyAssessment) => {
    setData((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        days: current.days.map((day) => (
          day.date === dutyDate ? { ...day, assessment } : day
        )),
      };
    });
  };

  const upsertAssessment = async (grade: DutyAssessmentGrade, note: string | undefined, successMessage: string) => {
    if (!selectedDay || selectedFloor === null) {
      return;
    }

    setAssessmentSaving(true);
    setAssessmentMessage('');
    setAssessmentError('');

    try {
      const payload = await dashboardApi.upsertDutyAssessment(
        selectedFloor,
        selectedDay.date,
        grade,
        note,
      );
      updateDayAssessment(payload.duty_date, payload.assessment);
      setAssessmentMessage(successMessage);
      setReloadToken((value) => value + 1);
    } catch (error) {
      setAssessmentError(error instanceof ApiError ? error.message : 'Не удалось сохранить оценку дежурства.');
      throw error;
    } finally {
      setAssessmentSaving(false);
    }
  };

  const handleGradeSelect = async (grade: DutyAssessmentGrade) => {
    if (!selectedDay || assessmentSaving) {
      return;
    }

    const previousGrade = assessmentGrade;
    setAssessmentGrade(grade);

    try {
      await upsertAssessment(grade, selectedDay.assessment?.note?.trim() || undefined, 'Оценка выставлена.');
    } catch {
      setAssessmentGrade(previousGrade);
    }
  };

  const saveAssessmentComment = async () => {
    try {
      await upsertAssessment(assessmentGrade, assessmentNote.trim() || undefined, 'Комментарий сохранён.');
    } catch {
    }
  };

  const toggleDayMenu = (day: DutyCalendarDay) => {
    if (!day.room) {
      return;
    }

    setSelectedDate((current) => (current === day.date ? null : day.date));
  };

  const handleQueueDragStart = (event: React.DragEvent<HTMLElement>, index: number) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
    setDraggedIndex(index);
    setDragOverIndex(index);
  };

  const handleQueueDragOver = (event: React.DragEvent<HTMLElement>, index: number) => {
    event.preventDefault();
    if (draggedIndex === null || draggedIndex === index) {
      return;
    }

    setDragOverIndex(index);
  };

  const handleQueueDrop = (event: React.DragEvent<HTMLElement>, index: number) => {
    event.preventDefault();
    if (draggedIndex === null) {
      return;
    }

    reorderDraftItems(draggedIndex, index);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleQueueDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const renderPersonalRating = () => {
    const rating = data?.personal_rating;
    if (!rating) {
      return null;
    }

    return (
      <div className={styles.ratingCard}>
        <div className={styles.ratingTop}>
          <div>
            <div className={styles.metricLabel}><Trophy size={14} /> Персональный рейтинг блока</div>
            <div className={styles.ratingTitle}>#{rating.rank} · уровень {rating.level}</div>
            <div className={styles.metricNote}>Блок {rating.room}: {rating.level_title}</div>
          </div>
          <div className={styles.ratingScore}>{rating.average_score.toFixed(1)}</div>
        </div>

        <div className={styles.levelBar} aria-label={`Прогресс уровня ${rating.level_progress}%`}>
          <span style={{ width: `${rating.level_progress}%` }} />
        </div>
        <div className={styles.ratingMeta}>
          <span>{rating.xp} XP</span>
          <span>до уровня: {rating.next_level_xp} XP</span>
        </div>

        {rating.achievements.length > 0 ? (
          <div className={styles.achievementList}>
            {rating.achievements.slice(0, 4).map((achievement) => (
              <span key={achievement.id} className={styles.achievementPill} title={achievement.description}>
                <Award size={12} /> {achievement.title}
              </span>
            ))}
          </div>
        ) : (
          <div className={styles.metricNote}>Достижения появятся после первых оценённых дежурств.</div>
        )}
      </div>
    );
  };

  const renderDayMenu = (day: DutyCalendarDay, compact = false) => {
    if (!selectedDay || selectedDay.date !== day.date) {
      return null;
    }

    const selectedAssessment = selectedDay.assessment ? getDutyGradeMeta(selectedDay.assessment.grade) : null;

    return (
      <div
        className={[styles.dayMenu, compact ? styles.dayMenuMobile : ''].join(' ').trim()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.dayMenuHeader}>
          <div>
            <div className={styles.selectedLabel}>День дежурства</div>
            <h3 className={styles.selectedTitle}>Блок {selectedDay.room}</h3>
            <p className={styles.selectedMeta}>
              {formatMobileDayLabel(selectedDay.date)}
              {selectedDay.assessment ? ` · Последнее обновление: ${formatMoscowDateTime(selectedDay.assessment.updated_at)}` : ''}
            </p>
          </div>

          <button type="button" className={styles.dayMenuDismiss} onClick={() => setSelectedDate(null)} aria-label="Закрыть меню">
            <X size={14} />
          </button>
        </div>

        {data?.can_assess ? (
          <>
            <div className={styles.gradeGrid}>
              {DUTY_GRADE_ORDER.map((grade) => {
                const meta = getDutyGradeMeta(grade);
                const isActive = assessmentGrade === grade;
                return (
                  <button
                    key={grade}
                    type="button"
                    className={[styles.gradeButton, getGradeToneClassName(grade), isActive ? styles.gradeActive : ''].join(' ').trim()}
                    onClick={() => { void handleGradeSelect(grade); }}
                    disabled={assessmentSaving}
                  >
                    <span className={styles.gradeLabel}>{meta.label}</span>
                    <span className={styles.gradeScore}>{meta.score} из 4</span>
                  </button>
                );
              })}
            </div>

            <label className={styles.dayMenuField}>
              <span className="badge">Комментарий</span>
              <textarea
                className="textarea"
                value={assessmentNote}
                onChange={(event) => setAssessmentNote(event.target.value)}
                placeholder="Коротко зафиксируйте, что повлияло на оценку."
              />
            </label>

            {selectedAssessment ? (
              <div className={styles.assessmentMeta}>
                Текущая оценка: {selectedAssessment.label}
                {selectedDay.assessment?.note ? ` · ${selectedDay.assessment.note}` : ''}
              </div>
            ) : null}

            {assessmentMessage ? <div className="state-message">{assessmentMessage}</div> : null}
            {assessmentError ? <div className="state-message error">{assessmentError}</div> : null}

            <button type="button" className="button" onClick={() => { void saveAssessmentComment(); }} disabled={assessmentSaving}>
              <Save size={16} /> {assessmentSaving ? 'Сохраняю...' : 'Сохранить комментарий'}
            </button>
          </>
        ) : (
          <div className={styles.assessmentMeta}>
            {selectedAssessment
              ? `Оценка: ${selectedAssessment.label}${selectedDay.assessment?.note ? ` · ${selectedDay.assessment.note}` : ''}`
              : 'Для этого дня оценка пока не выставлена.'}
          </div>
        )}
      </div>
    );
  };

  if (session.accessible_floors.length === 0) {
    return (
      <div className={styles.page}>
        <section className={`surface-panel ${styles.sidebarSection}`}>
          Сначала укажите комнату в боте, чтобы dashboard смог привязать вас к нужному этажу и открыть календарь дежурств.
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={`surface-panel ${styles.hero}`}>
        <div className={styles.heroTop}>
          <div className={styles.heroTitleBlock}>
            <p className="eyebrow">Календарь дежурств</p>
          </div>

          <div className={styles.heroControls}>
            {session.accessible_floors.length > 1 && (
              <select
                className="select"
                value={selectedFloor ?? ''}
                onChange={(event) => setSelectedFloor(Number(event.target.value))}
              >
                {session.accessible_floors.map((floor) => (
                  <option key={floor} value={floor}>Этаж {floor}</option>
                ))}
              </select>
            )}

            <div className={styles.monthSwitch}>
              <button onClick={() => changeMonth(-1)} className={styles.circleButton}>
                <ChevronLeft size={16} />
              </button>
              <div className={styles.monthTitle}>{formatMonthTitle(year, month)}</div>
              <button onClick={() => changeMonth(1)} className={styles.circleButton}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        {data && !isRegularUser && (
          <div className={styles.metrics}>
            <div className={`surface-panel-soft ${styles.metricCard}`}>
              <div className={styles.metricLabel}><CalendarDays size={14} /> Этаж</div>
              <div className={styles.metricValue}>{data.floor}</div>
              <div className={styles.metricNote}>{data.scope === 'all' ? 'Можно переключаться между доступными этажами.' : 'Вы работаете только в пределах своего этажа.'}</div>
            </div>
            <div className={`surface-panel-soft ${styles.metricCard}`}>
              <div className={styles.metricLabel}><Clock3 size={14} /> Старт цикла</div>
              <div className={styles.metricValue}>{data.start_date}</div>
              <div className={styles.metricNote}>От этой точки считается очерёдность блоков.</div>
            </div>
            <div className={`surface-panel-soft ${styles.metricCard}`}>
              <div className={styles.metricLabel}><Clock3 size={14} /> Напоминание</div>
              <div className={styles.metricValue}>
                {formatNotificationTime(data.notification_setting.notification_hour, data.notification_setting.notification_minute)}
              </div>
              <div className={styles.metricNote}>В это время бот напоминает про дежурство по этажу.</div>
            </div>
            <div className={`surface-panel-soft ${styles.metricCard}`}>
              <div className={styles.metricLabel}><CalendarDays size={14} /> Ближайший блок</div>
              <div className={styles.metricValue}>{dutyToday?.room ?? '—'}</div>
              <div className={styles.metricNote}>{dutyToday ? `Следующее дежурство: ${dutyToday.date}` : 'Очередь ещё не сформирована.'}</div>
            </div>
          </div>
        )}
      </header>

      {errorMessage && (
        <div className="state-message error">{errorMessage}</div>
      )}

      {loading && (
        <section className={`surface-panel ${styles.sidebarSection}`}>Загружаю календарь и очередь блоков...</section>
      )}

      {data && (
        <div className={[styles.layout, isRegularUser ? styles.userLayout : ''].join(' ').trim()}>
          <section className={`surface-panel ${styles.calendarSection}`}>
            <div className={styles.sectionHeader}>
              <div>
                <h3 className={styles.sectionTitle}>Календарь месяца</h3>
                <p className={styles.sectionCopy}>
                  {data.can_assess
                    ? 'Клик по дате открывает контекстное меню дня. Для staff там же доступны оценка и комментарий.'
                    : 'Клик по дате с дежурством показывает детали смены вашего этажа.'}
                </p>
              </div>
              <div className="badge">
                {data.can_edit ? `${queueDraft.length} блоков в очереди` : `Этаж ${data.floor}`}
              </div>
            </div>

            <div className={styles.desktopCalendar}>
              <div className={styles.desktopCalendarIntro}>
                <div>
                  <div className={styles.metricLabel}><CalendarDays size={14} /> Карта месяца</div>
                  <div className={styles.desktopMonthTitle}>{formatMonthTitle(year, month)}</div>
                </div>

                <div className={styles.desktopFocusCard}>
                  <div>
                    <div className={styles.selectedLabel}>{selectedDay ? 'Выбранное дежурство' : 'Ближайшее дежурство'}</div>
                    <div className={styles.desktopFocusTitle}>
                      {mobileAgendaDay ? `Блок ${mobileAgendaDay.room}` : 'Нет смен'}
                    </div>
                    <div className={styles.metricNote}>
                      {mobileAgendaDay ? formatMobileDayLabel(mobileAgendaDay.date) : 'Для этого месяца дежурства пока не назначены.'}
                    </div>
                  </div>
                  {userBlock ? <span className="badge">Мой блок: {userBlock}</span> : null}
                </div>
              </div>

              <div className={styles.weekHeader}>
                {weekdayLabels.map((label) => (
                  <div key={label} className={styles.weekday}>{label}</div>
                ))}
              </div>

              <div className={styles.calendarGrid}>
                {Array.from({ length: leadingEmptyCells }).map((_, index) => (
                  <div key={`empty-${index}`} className={styles.emptyCell} />
                ))}

                {data.days.map((day) => {
                  const isSelected = selectedDay?.date === day.date;
                  const isUserDuty = Boolean(userBlock && day.room === userBlock);
                  const assessmentMeta = day.assessment ? getDutyGradeMeta(day.assessment.grade) : null;
                  const className = [
                    styles.dayCard,
                    day.room ? styles.dayButton : '',
                    isUserDuty ? styles.dayUserDuty : '',
                    day.is_today ? styles.dayToday : '',
                    isSelected ? styles.daySelected : '',
                  ].filter(Boolean).join(' ');

                  const content = (
                    <>
                      <div className={styles.dayHeader}>
                        <span className={styles.dayNumber}>{day.day}</span>
                        {day.queue_position ? <span className={styles.queueBadge}>#{day.queue_position}</span> : null}
                      </div>

                      <div className={styles.dayBody}>
                        {day.room ? (
                          <>
                            <span className={styles.roomLabel}>Дежурит</span>
                            <div className={styles.roomValue}>Блок {day.room}</div>
                            {isUserDuty ? <span className={styles.myDutyPill}>Мой блок</span> : null}
                            {assessmentMeta ? (
                              <span className={[styles.assessmentPill, getGradeToneClassName(day.assessment!.grade)].join(' ')}>
                                {assessmentMeta.shortLabel}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <p className={styles.emptyText}>На этот день очередь ещё не назначена.</p>
                        )}
                      </div>
                    </>
                  );

                  if (day.room) {
                    return (
                      <div key={day.date} className={[styles.daySlot, isSelected ? styles.daySlotActive : ''].join(' ').trim()}>
                        <button type="button" className={className} onClick={() => toggleDayMenu(day)} aria-expanded={isSelected ? true : undefined}>
                          {content}
                        </button>
                        {isSelected ? renderDayMenu(day) : null}
                      </div>
                    );
                  }

                  return (
                    <div key={day.date} className={className}>
                      {content}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={styles.mobileList}>
              <div className={styles.mobileCalendarCard}>
                <div className={styles.mobileCalendarTop}>
                  <div>
                    <div className={styles.metricLabel}><CalendarDays size={14} /> Месяц</div>
                    <div className={styles.mobileMonthTitle}>{formatMonthTitle(year, month)}</div>
                  </div>
                  <div className={styles.mobileMonthActions}>
                    <button type="button" onClick={() => changeMonth(-1)} className={styles.circleButton} aria-label="Предыдущий месяц">
                      <ChevronLeft size={16} />
                    </button>
                    <button type="button" onClick={() => changeMonth(1)} className={styles.circleButton} aria-label="Следующий месяц">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>

                <div className={styles.mobileWeekHeader}>
                  {weekdayLabels.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>

                <div className={styles.mobileMonthGrid}>
                  {Array.from({ length: leadingEmptyCells }).map((_, index) => (
                    <span key={`mobile-empty-${index}`} className={styles.mobileEmptyDay} />
                  ))}

                  {data.days.map((day) => {
                    const isSelected = selectedDay?.date === day.date;
                    const isUserDuty = Boolean(userBlock && day.room === userBlock);
                    const assessmentMeta = day.assessment ? getDutyGradeMeta(day.assessment.grade) : null;
                    return (
                      <button
                        key={day.date}
                        type="button"
                        className={[
                          styles.mobileDayButton,
                          day.room ? styles.mobileDayHasDuty : '',
                          isUserDuty ? styles.mobileDayUserDuty : '',
                          day.is_today ? styles.mobileDayToday : '',
                          isSelected ? styles.mobileDaySelected : '',
                          assessmentMeta && day.assessment ? getGradeToneClassName(day.assessment.grade) : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => day.room && toggleDayMenu(day)}
                        disabled={!day.room}
                        aria-label={day.room ? `${formatMobileDayLabel(day.date)}, блок ${day.room}` : formatMobileDayLabel(day.date)}
                      >
                        <span>{day.day}</span>
                      </button>
                    );
                  })}
                </div>

                <div className={styles.mobileAgendaPanel}>
                  <div className={styles.mobileAgendaHandle} />
                  {mobileAgendaDay ? (
                    <div className={styles.mobileAgendaContent}>
                      <div>
                        <div className={styles.selectedLabel}>{selectedDay ? 'Выбранное дежурство' : 'Ближайшее дежурство'}</div>
                        <h3 className={styles.selectedTitle}>Блок {mobileAgendaDay.room}</h3>
                        <p className={styles.selectedMeta}>{formatMobileDayLabel(mobileAgendaDay.date)}</p>
                      </div>
                      <div className={styles.mobileAgendaBadges}>
                        {userBlock && mobileAgendaDay.room === userBlock ? <span className="badge">Мой блок</span> : null}
                        {mobileAgendaDay.is_today ? <span className="badge">Сегодня</span> : null}
                      </div>
                    </div>
                  ) : (
                    <div className={styles.metricNote}>В этом месяце пока нет назначенных дежурств.</div>
                  )}
                </div>
              </div>

              {selectedDay ? renderDayMenu(selectedDay, true) : null}
            </div>
          </section>

          <aside className={styles.sidebar}>
            {data.can_edit && (
            <section className={`surface-panel ${styles.sidebarSection} ${styles.queueSection}`}>
              <div className={styles.sectionHeader}>
                <div>
                  <h3 className={styles.sectionTitle}>Очередь блоков</h3>
                  <p className={styles.sectionCopy}>
                    {data.can_edit
                      ? 'Меняйте порядок перетаскиванием, добавляйте новые блоки и сохраняйте очередь, когда всё готово.'
                      : 'Очередь можно просматривать, но редактировать её могут только staff-роли.'}
                  </p>
                </div>
                <div className="badge">{queueDraft.length} позиций</div>
              </div>

              <div className={styles.queueList}>
                {queueDraft.map((block, index) => (
                  <article
                    key={`${block}-${index}`}
                    className={[
                      styles.queueItem,
                      data.can_edit ? styles.queueItemDraggable : '',
                      draggedIndex === index ? styles.queueItemDragging : '',
                      dragOverIndex === index && draggedIndex !== null && draggedIndex !== index ? styles.queueItemTarget : '',
                    ].join(' ').trim()}
                    draggable={data.can_edit}
                    onDragStart={(event) => handleQueueDragStart(event, index)}
                    onDragOver={(event) => handleQueueDragOver(event, index)}
                    onDrop={(event) => handleQueueDrop(event, index)}
                    onDragEnd={handleQueueDragEnd}
                  >
                    <div className={styles.queueRow}>
                      <div>
                        <div className={styles.roomLabel}>Позиция {index + 1}</div>
                        <p className={styles.queueTitle}>Блок {block}</p>
                      </div>

                      {data.can_edit && (
                        <div className={styles.queueHeaderActions}>
                          <div className={styles.dragHandle} title="Перетащить блок">
                            <GripVertical size={16} />
                          </div>
                          <div className={styles.queueActions}>
                            <button type="button" className={styles.circleButton} onClick={() => moveDraftItem(index, -1)}>
                              <ChevronUp size={16} />
                            </button>
                            <button type="button" className={styles.circleButton} onClick={() => moveDraftItem(index, 1)}>
                              <ChevronDown size={16} />
                            </button>
                            <button type="button" className={styles.circleButton} onClick={() => removeDraftItem(index)}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </article>
                ))}

                {queueDraft.length === 0 && <div className="empty-placeholder">Очередь пока пустая.</div>}
              </div>

              {data.can_edit && (
                <>
                  <div className={styles.addRow}>
                    <input
                      className="field"
                      value={newBlock}
                      onChange={(event) => setNewBlock(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          addBlockToDraft();
                        }
                      }}
                      placeholder="Например, 1502"
                    />
                    <button type="button" className="button-secondary" onClick={addBlockToDraft}>
                      <Plus size={16} /> Добавить
                    </button>
                  </div>
                  {saveMessage ? <div className="state-message">{saveMessage}</div> : null}
                  {saveError ? <div className="state-message error">{saveError}</div> : null}

                  <div className={styles.saveRow}>
                    <button type="button" className="button" onClick={saveSchedule} disabled={saving}>
                      <Save size={16} /> {saving ? 'Сохраняю...' : 'Сохранить очередь'}
                    </button>
                    <button type="button" className="button-danger" onClick={() => setQueueDraft([])}>
                      Очистить очередь
                    </button>
                  </div>
                </>
              )}
            </section>
            )}

            <section className={`surface-panel ${styles.sidebarSection} ${styles.upcomingSection}`}>
              <div className={styles.sectionHeader}>
                <div>
                  <h3 className={styles.sectionTitle}>Ближайшие дежурства</h3>
                  <p className={styles.sectionCopy}>Короткий список ближайших смен, чтобы не искать их по всему месяцу.</p>
                </div>
              </div>

              {renderPersonalRating()}

              <div className={styles.upcomingList}>
                {upcomingDays.map((day) => (
                  <article key={day.date} className={styles.upcomingItem}>
                    <div className={styles.queueRow}>
                      <div>
                        <div className={styles.queueTitle}>{formatMobileDayLabel(day.date)}</div>
                        <div className={styles.metricNote}>Блок {day.room}</div>
                      </div>
                      {day.is_today ? <span className="badge">Сегодня</span> : null}
                    </div>
                  </article>
                ))}

                {upcomingDays.length === 0 && (
                  <div className="empty-placeholder">Для этого месяца дежурства пока не назначены.</div>
                )}
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
