import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Award, CheckCircle2, Home, LockKeyhole, PawPrint, Save, Trophy } from 'lucide-react';
import { ApiError, dashboardApi } from '../api';
import type { Achievement, DashboardProfileResponse, DashboardSessionResponse } from '../types';
import styles from './ProfileView.module.scss';

interface ProfileViewProps {
  session: DashboardSessionResponse;
  onSessionChange: (session: DashboardSessionResponse) => void;
}

function getInitialRoom(session: DashboardSessionResponse) {
  return session.user.room ?? '';
}

const ALL_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_duty',
    title: 'Первое дежурство',
    description: 'Блок получил первую оценку за дежурство.',
  },
  {
    id: 'excellent_shift',
    title: 'Чистый зачёт',
    description: 'Есть хотя бы одно дежурство на отлично.',
  },
  {
    id: 'excellent_streak',
    title: 'Серия отличников',
    description: 'Три отличных дежурства подряд.',
  },
  {
    id: 'reliable_block',
    title: 'Надёжный блок',
    description: 'Пять и более оценок со средним баллом не ниже 3.',
  },
  {
    id: 'clean_month',
    title: 'Месяц без провалов',
    description: 'За последние 30 дней нет неудовлетворительных оценок.',
  },
  {
    id: 'top_floor',
    title: 'Топ этажа',
    description: 'Блок входит в тройку рейтинга своего этажа.',
  },
];

export function ProfileView({ session, onSessionChange }: ProfileViewProps) {
  const [profile, setProfile] = useState<DashboardProfileResponse | null>(null);
  const [roomDraft, setRoomDraft] = useState(() => getInitialRoom(session));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isActive = true;
    setLoading(true);

    dashboardApi.getProfile()
      .then((payload) => {
        if (!isActive) {
          return;
        }

        setProfile(payload);
        setRoomDraft(payload.session.user.room ?? '');
        onSessionChange(payload.session);
        setErrorMessage('');
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setErrorMessage(error instanceof ApiError ? error.message : 'Не удалось загрузить профиль.');
      })
      .finally(() => {
        if (isActive) {
          setLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [onSessionChange]);

  useEffect(() => {
    setRoomDraft(getInitialRoom(session));
  }, [session.user.room]);

  const user = profile?.session.user ?? session.user;
  const rating = profile?.personal_rating ?? null;
  const topBlocks = useMemo(() => (profile?.floor_rating ?? []).slice(0, 5), [profile?.floor_rating]);
  const earnedAchievementIds = useMemo(
    () => new Set((rating?.achievements ?? []).map((achievement) => achievement.id)),
    [rating?.achievements],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const room = roomDraft.trim();
    if (!room) {
      setErrorMessage('Укажите комнату в формате 1513А или 913Б.');
      return;
    }

    setSaving(true);
    setMessage('');
    setErrorMessage('');

    try {
      const payload = await dashboardApi.updateProfileRoom(room);
      setProfile(payload);
      setRoomDraft(payload.session.user.room ?? '');
      onSessionChange(payload.session);
      setMessage('Комната обновлена. Доступ к графику пересчитан по новому этажу.');
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Не удалось сохранить комнату.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Профиль жильца</p>
          <h2 className={styles.title}>{user.display_name}</h2>
          <p className={styles.copy}>
            Комната определяет этаж, доступный график и рейтинг блока.
          </p>
        </div>

        <div className={styles.heroBadge}>
          <PawPrint size={18} />
          {user.room ? `Комната ${user.room}` : 'Комната не указана'}
        </div>
      </section>

      {errorMessage ? <div className={styles.error}>{errorMessage}</div> : null}
      {message ? <div className={styles.success}>{message}</div> : null}

      <div className={styles.layout}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.cardLabel}>Комната</p>
              <h3 className={styles.cardTitle}>Изменить привязку</h3>
            </div>
            <Home className={styles.cardIcon} size={22} />
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.fieldLabel}>
              <span>Номер комнаты</span>
              <input
                value={roomDraft}
                onChange={(event) => setRoomDraft(event.target.value)}
                className={styles.field}
                placeholder="1513А"
                autoComplete="off"
              />
            </label>

            <button type="submit" className={styles.primaryButton} disabled={saving}>
              <Save size={16} />
              {saving ? 'Сохраняю...' : 'Сохранить комнату'}
            </button>
          </form>

          <div className={styles.metaGrid}>
            <div>
              <span>Этаж</span>
              <strong>{user.floor ?? 'не определён'}</strong>
            </div>
            <div>
              <span>Роль</span>
              <strong>{user.role}</strong>
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.cardLabel}>Рейтинг блока</p>
              <h3 className={styles.cardTitle}>{rating ? `#${rating.rank} · уровень ${rating.level}` : 'Пока нет оценки'}</h3>
            </div>
            <Trophy className={styles.cardIcon} size={22} />
          </div>

          {loading ? (
            <div className={styles.empty}>Загружаю рейтинг...</div>
          ) : rating ? (
            <div className={styles.ratingBody}>
              <div className={styles.scoreRow}>
                <div>
                  <div className={styles.scoreLabel}>Блок {rating.room}</div>
                  <div className={styles.scoreTitle}>{rating.level_title}</div>
                </div>
                <div className={styles.score}>{rating.average_score.toFixed(1)}</div>
              </div>

              <div className={styles.progressTrack} aria-label={`Прогресс уровня ${rating.level_progress}%`}>
                <span style={{ width: `${rating.level_progress}%` }} />
              </div>

              <div className={styles.ratingMeta}>
                <span>{rating.xp} XP</span>
                <span>до уровня: {rating.next_level_xp} XP</span>
              </div>

              <div className={styles.achievementList}>
                {rating.achievements.length > 0 ? rating.achievements.map((achievement) => (
                  <span key={achievement.id} className={styles.achievementPill} title={achievement.description}>
                    <Award size={12} />
                    {achievement.title}
                  </span>
                )) : (
                  <span className={styles.emptyPill}>Достижения появятся после оценённых дежурств</span>
                )}
              </div>
            </div>
          ) : (
            <div className={styles.empty}>
              Укажите комнату и дождитесь первых оценок дежурств для вашего блока.
            </div>
          )}
        </section>
      </div>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <p className={styles.cardLabel}>Достижения</p>
            <h3 className={styles.cardTitle}>Все доступные награды</h3>
          </div>
          <Award className={styles.cardIcon} size={22} />
        </div>

        <div className={styles.allAchievementsGrid}>
          {ALL_ACHIEVEMENTS.map((achievement) => {
            const earned = earnedAchievementIds.has(achievement.id);
            const Icon = earned ? CheckCircle2 : LockKeyhole;

            return (
              <article
                key={achievement.id}
                className={[styles.achievementCard, earned ? styles.achievementCardEarned : ''].join(' ').trim()}
              >
                <div className={styles.achievementCardIcon}>
                  <Icon size={16} />
                </div>
                <div>
                  <h4 className={styles.achievementCardTitle}>{achievement.title}</h4>
                  <p className={styles.achievementCardText}>{achievement.description}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <p className={styles.cardLabel}>Этаж</p>
            <h3 className={styles.cardTitle}>Топ блоков</h3>
          </div>
        </div>

        {topBlocks.length > 0 ? (
          <div className={styles.topList}>
            {topBlocks.map((item) => (
              <article key={item.room} className={styles.topItem}>
                <div>
                  <div className={styles.topTitle}>#{item.rank} · блок {item.room}</div>
                  <div className={styles.topMeta}>{item.level_title} · {item.xp} XP</div>
                </div>
                <div className={styles.topScore}>{item.average_score.toFixed(1)}</div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>На этом этаже пока нет оценённых дежурств.</div>
        )}
      </section>
    </div>
  );
}
