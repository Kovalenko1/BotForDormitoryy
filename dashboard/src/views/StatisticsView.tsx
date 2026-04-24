import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarRange } from 'lucide-react';
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
        .map((grade, index) => ({
          grade,
          count: item.grade_counts[grade] ?? 0,
          index,
          meta: getDutyGradeMeta(grade),
        }));

      const breakdown = segments.map((segment) => `${segment.meta.shortLabel}: ${segment.count}`).join(', ');

      return {
        ...item,
        filledHeight: Math.max(item.average_percent, item.assessment_count > 0 ? 22 + Math.max(segments.length - 1, 0) * 8 : 0),
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
          <h2 className="page-title">Как блоки держат темп</h2>
          <p className="page-copy">
            Здесь видно, насколько ровно проходят дежурства за выбранный период. Чем выше столбец, тем стабильнее блок закрывает свои смены.
          </p>
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
              const meta = getDutyGradeMeta(grade);
              return (
                <div key={grade} className={`surface-panel-soft ${styles.summaryCard}`}>
                  <div className={styles.summaryLabel} style={{ color: meta.color }}>{meta.shortLabel}</div>
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
              <h3 className={styles.chartTitle}>Гистограмма по блокам</h3>
              <p className={styles.chartCopy}>Высота столбца показывает общий уровень блока, а внутренние пластины накладываются друг на друга и показывают, какие типы оценок вообще встречались.</p>
            </div>
            <div className="badge"><BarChart3 size={14} /> {columns.length} блоков</div>
          </div>

          {columns.length > 0 ? (
            <>
              <div className={styles.legend}>
                {DUTY_GRADE_ORDER.map((grade) => {
                  const meta = getDutyGradeMeta(grade);
                  return (
                    <span key={grade} className={styles.legendItem} style={{ borderColor: meta.border, background: meta.surface, color: meta.color }}>
                      {meta.label}
                    </span>
                  );
                })}
              </div>

              <div className={styles.histogramShell}>
                <div className={styles.scale}>
                  {[100, 75, 50, 25, 0].map((value) => (
                    <span key={value}>{value}%</span>
                  ))}
                </div>

                <div className={styles.histogramScroller}>
                  <div className={styles.histogram}>
                    {columns.map((item) => (
                      <article
                        key={item.room}
                        className={styles.column}
                        title={`Средний балл: ${item.average_score.toFixed(1)} из 4. Оценок: ${item.assessment_count}.${item.breakdown ? ` ${item.breakdown}.` : ''}`}
                      >
                        <div className={styles.columnVisual}>
                          <div className={styles.columnTrack}>
                            {item.assessment_count > 0 ? (
                              <div className={styles.columnStack} style={{ height: `${item.filledHeight}%` }}>
                                {item.segments.map((segment) => (
                                  <div
                                    key={segment.grade}
                                    className={styles.columnSegment}
                                    style={{
                                      bottom: `${segment.index * 16}px`,
                                      zIndex: segment.index + 1,
                                      borderColor: segment.meta.border,
                                      background: segment.meta.solid,
                                      boxShadow: `0 12px 24px ${segment.meta.border}`,
                                    }}
                                  />
                                ))}
                              </div>
                            ) : (
                              <div className={styles.columnGhost} />
                            )}
                          </div>
                        </div>

                        <div className={styles.columnFooter}>
                          <p className={styles.columnLabel}>Блок {item.room}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-placeholder">За выбранный период оценок пока нет. Как только staff начнёт отмечать дежурства, столбцы появятся здесь.</div>
          )}
        </section>
      )}
    </div>
  );
}