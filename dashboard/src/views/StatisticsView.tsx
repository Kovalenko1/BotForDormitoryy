import { useEffect, useMemo, useState } from 'react';
import { Award, BarChart3, CalendarRange, Trophy } from 'lucide-react';
import { ApiError, dashboardApi } from '../api';
import { DUTY_GRADE_ORDER, getDutyGradeMeta } from '../lib/duty';
import type { DashboardSessionResponse, DutyStatsResponse } from '../types';
import styles from './StatisticsView.module.scss';

interface StatisticsViewProps {
  session: DashboardSessionResponse;
}

function getPreferredFloor(session: DashboardSessionResponse) {
  const userFloor = session.user.floor;
  if (typeof userFloor === 'number' && session.accessible_floors.includes(userFloor)) {
    return userFloor;
  }

  return session.accessible_floors[0] ?? null;
}

function toInputDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getGradeToneClassName(grade: string) {
  return styles[`grade${grade[0].toUpperCase()}${grade.slice(1)}`];
}

export function StatisticsView({ session }: StatisticsViewProps) {
  const today = new Date();
  const defaultStart = new Date(today);
  defaultStart.setDate(today.getDate() - 29);

  const [floor, setFloor] = useState<number | null>(() => getPreferredFloor(session));
  const [startDate, setStartDate] = useState(() => toInputDate(defaultStart));
  const [endDate, setEndDate] = useState(() => toInputDate(today));
  const [data, setData] = useState<DutyStatsResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (floor === null) {
      setLoading(false);
      return;
    }

    let isActive = true;
    setLoading(true);

    dashboardApi.getDutyStats({ floor, startDate, endDate })
      .then((payload) => {
        if (!isActive) {
          return;
        }

        setData(payload);
        setErrorMessage('');
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setErrorMessage(error instanceof ApiError ? error.message : 'Не удалось загрузить статистику дежурств.');
      })
      .finally(() => {
        if (isActive) {
          setLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [endDate, floor, startDate]);

  const sortedItems = useMemo(
    () => (data?.items ?? []).slice().sort((left, right) => right.average_score - left.average_score || right.assessment_count - left.assessment_count),
    [data],
  );

  const columns = useMemo(
    () => sortedItems.map((item) => {
      const segments = DUTY_GRADE_ORDER
        .filter((grade) => (item.grade_counts[grade] ?? 0) > 0)
        .map((grade) => ({
          grade,
          count: item.grade_counts[grade] ?? 0,
          meta: getDutyGradeMeta(grade),
        }));

      const breakdown = segments.map((segment) => `${segment.meta.shortLabel}: ${segment.count}`).join(', ');

      return {
        ...item,
        segments,
        breakdown,
      };
    }),
    [sortedItems],
  );

  if (session.accessible_floors.length === 0) {
    return (
      <div className={styles.page}>
        <section className={`surface-panel ${styles.error}`}>
          Сначала укажите комнату в боте. После этого dashboard сможет привязать вас к этажу и открыть аналитику.
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={`surface-panel ${styles.hero}`}>
        <div>
          <p className="eyebrow">Статистика дежурств</p>
        </div>

        <div className={styles.filters}>
          <label>
            <span className="badge">Этаж</span>
            <select className="select" value={floor ?? ''} onChange={(event) => setFloor(Number(event.target.value))}>
              {session.accessible_floors.map((item) => (
                <option key={item} value={item}>Этаж {item}</option>
              ))}
            </select>
          </label>

          <label>
            <span className="badge">Период от</span>
            <input className="field" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>

          <label>
            <span className="badge">Период до</span>
            <input className="field" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>

          <div className={`surface-panel-soft ${styles.summaryCard}`}>
            <div className={styles.summaryLabel}>Диапазон</div>
            <div className={styles.summaryValue}><CalendarRange size={16} /> {startDate} - {endDate}</div>
          </div>
        </div>

        {data && (
          <div className={styles.summary}>
            <div className={`surface-panel-soft ${styles.summaryCard}`}>
              <div className={styles.summaryLabel}>Оценок за период</div>
              <div className={styles.summaryValue}>{data.summary.assessment_count}</div>
            </div>
            <div className={`surface-panel-soft ${styles.summaryCard}`}>
              <div className={styles.summaryLabel}>Средний балл</div>
              <div className={styles.summaryValue}>{data.summary.average_score.toFixed(1)}</div>
            </div>
            {DUTY_GRADE_ORDER.map((grade) => {
              return (
                <div key={grade} className={`surface-panel-soft ${styles.summaryCard}`}>
                  <div className={[styles.summaryLabel, getGradeToneClassName(grade)].join(' ')}>
                    {getDutyGradeMeta(grade).shortLabel}
                  </div>
                  <div className={styles.summaryValue}>{data.summary.grade_counts[grade] ?? 0}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {errorMessage && (
        <section className={`surface-panel ${styles.error}`}>
          <div className="state-message error">{errorMessage}</div>
        </section>
      )}

      {!errorMessage && loading && (
        <section className={`surface-panel ${styles.chart}`}>
          Загружаю сводку по дежурствам...
        </section>
      )}

      {data && !loading && (
        <section className={`surface-panel ${styles.chart}`}>
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.chartTitle}>Распределение оценок по блокам</h3>
              <p className={styles.chartCopy}>Высота столбика — средний балл относительно максимума (4). Цвета показывают типы оценок.</p>
            </div>
            <div className="badge"><BarChart3 size={14} /> {columns.length} блоков</div>
          </div>

          {columns.length > 0 ? (
            <>
              <div className={styles.legend}>
                {DUTY_GRADE_ORDER.map((grade) => {
                  const meta = getDutyGradeMeta(grade);
                  return (
                    <span key={grade} className={[styles.legendItem, getGradeToneClassName(grade)].join(' ')}>
                      {meta.label}
                    </span>
                  );
                })}
              </div>

              <div className={styles.ratingGrid}>
                {columns.slice(0, 6).map((item) => (
                  <article key={item.room} className={styles.ratingCard}>
                    <div className={styles.ratingHeader}>
                      <div>
                        <div className={styles.summaryLabel}><Trophy size={13} /> #{item.rank}</div>
                        <div className={styles.ratingTitle}>Блок {item.room}</div>
                      </div>
                      <div className={styles.levelBadge}>Lv {item.level}</div>
                    </div>
                    <div className={styles.ratingMeta}>
                      {item.level_title} · {item.xp} XP · ср. {item.average_score.toFixed(1)}
                    </div>
                    <div className={styles.levelBar}>
                      <span style={{ width: `${item.level_progress}%` }} />
                    </div>
                    <div className={styles.achievementRow}>
                      {item.achievements.slice(0, 3).map((achievement) => (
                        <span key={achievement.id} className={styles.achievementPill} title={achievement.description}>
                          <Award size={12} /> {achievement.title}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>

              <div className={styles.histogramWrap}>
                <div className={styles.histogram}>
                  {columns.map((item) => {
                    const total = item.assessment_count;
                    const pct = total > 0 ? Math.max(item.average_percent, 5) : 0;
                    return (
                      <div
                        key={item.room}
                        className={styles.col}
                        title={`Ср. балл: ${item.average_score.toFixed(1)}/4. Оценок: ${total}.${item.breakdown ? ` ${item.breakdown}.` : ''}`}
                      >
                        <div className={styles.colScore}>
                          {total > 0 ? item.average_score.toFixed(1) : '—'}
                        </div>
                        <div className={styles.colBarArea}>
                          {total > 0 ? (
                            <div className={styles.colBar} style={{ height: `${pct}%` }}>
                              {item.segments.flatMap((seg) => (
                                Array.from({ length: seg.count }).map((_, segmentIndex) => (
                                  <div
                                    key={`${seg.grade}-${segmentIndex}`}
                                    className={[styles.colSegment, getGradeToneClassName(seg.grade)].join(' ')}
                                  />
                                ))
                              ))}
                            </div>
                          ) : (
                            <div className={styles.colGhost} />
                          )}
                        </div>
                        <div className={styles.colLabel}>Блок {item.room}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="empty-placeholder">За выбранный период оценок пока нет. Как только staff начнёт отмечать дежурства, строки появятся здесь.</div>
          )}
        </section>
      )}
    </div>
  );
}
