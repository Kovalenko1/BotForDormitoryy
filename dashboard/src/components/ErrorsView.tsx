import { useEffect, useState } from 'react';
import { AlertTriangle, Bot, ServerCrash } from 'lucide-react';
import { ApiError, dashboardApi } from '../api';
import { formatMoscowDateTime } from '../lib/time';
import type { ErrorLogItem } from '../types';
import styles from './ErrorsView.module.scss';

export function ErrorsView() {
  const [allErrors, setAllErrors] = useState<ErrorLogItem[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isActive = true;

    dashboardApi.getErrors()
      .then((payload) => {
        if (!isActive) {
          return;
        }

        setAllErrors(payload.items);
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setErrorMessage(error instanceof ApiError ? error.message : 'Не удалось загрузить ошибки.');
      });

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Сбойные уведомления и ошибки доставки.</p>
          <h2 className={styles.title}>Проблемные места</h2>
        </div>
        <div className={styles.counter}>
          <AlertTriangle size={16} />
          <span>{allErrors.length} проблем</span>
        </div>
      </header>

      {errorMessage && (
        <div className={styles.errorMessage}>
          {errorMessage}
        </div>
      )}

      <div className={styles.grid}>
        {allErrors.map((error) => (
          <div key={error.id} className={styles.card}>
            <div className={styles.cardAccent} />

            <div className={styles.cardBody}>
              <div className={styles.iconCell}>
                {error.type === 'notification' ? (
                  <ServerCrash size={20} />
                ) : (
                  <Bot size={20} />
                )}
              </div>

              <div className={styles.content}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>{error.message}</h3>
                  <time className={styles.time}>
                    {formatMoscowDateTime(error.timestamp)}
                  </time>
                </div>

                <div className={styles.contextRow}>
                  <p>Контекст: {error.context}</p>
                  <span>
                    {error.type === 'notification' ? 'уведомление' : 'сообщение'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}

        {!errorMessage && allErrors.length === 0 && (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              <AlertTriangle size={32} />
            </div>
            <p className={styles.emptyTitle}>Критичных сбоев сейчас нет.</p>
            <p className={styles.emptyCopy}>Система работает ровно.</p>
          </div>
        )}
      </div>
    </div>
  );
}
