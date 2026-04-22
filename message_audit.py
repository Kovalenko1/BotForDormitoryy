from datetime import timedelta

from sqlalchemy import inspect, text

from database import get_db_session
from keyboards import BTN_MESSAGE_LOGS
from models import BotLog, FailedNotification, IncomingUserMessage, OutgoingMessageLog, User
from time_utils import moscow_now


def _format_error_message(error: Exception) -> str:
    error_text = str(error)
    if 'blocked by the user' in error_text:
        return 'Сообщение не доставлено: пользователь заблокировал бота.'
    return error_text or 'Неизвестная ошибка отправки.'


def _get_user(session, chat_id: str | None):
    if not chat_id:
        return None
    return session.query(User).filter(User.chat_id == chat_id).first()


def _normalize_username(username: str | None) -> str | None:
    if not username or username == 'Нетъ':
        return None

    normalized = username.strip()
    if not normalized:
        return None

    return normalized if normalized.startswith('@') else f'@{normalized}'


def _resolve_username(db_user=None, telegram_username: str | None = None) -> str | None:
    if db_user and db_user.username:
        resolved = _normalize_username(db_user.username)
        if resolved:
            return resolved

    return _normalize_username(telegram_username)


def ensure_message_audit_schema(engine):
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    table_column_map = {
        'incoming_user_messages': {
            'sender_username': 'VARCHAR',
        },
        'outgoing_message_logs': {
            'sender_username': 'VARCHAR',
            'recipient_username': 'VARCHAR',
        },
    }

    with engine.begin() as connection:
        for table_name, columns in table_column_map.items():
            if table_name not in existing_tables:
                continue

            existing_columns = {column['name'] for column in inspector.get_columns(table_name)}
            for column_name, column_type in columns.items():
                if column_name in existing_columns:
                    continue

                connection.execute(text(
                    f'ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}'
                ))


def log_incoming_message(message):
    if not getattr(message, 'text', None) or not getattr(message, 'from_user', None):
        return

    if getattr(message.from_user, 'is_bot', False):
        return

    if str(message.text).strip() == BTN_MESSAGE_LOGS:
        return

    sender_chat_id = str(message.from_user.id)

    try:
        with next(get_db_session()) as session:
            db_user = _get_user(session, sender_chat_id)
            session.add(IncomingUserMessage(
                sender_chat_id=sender_chat_id,
                sender_username=_resolve_username(db_user, getattr(message.from_user, 'username', None)),
                sender_role=db_user.role.value if db_user else None,
                sender_floor=db_user.floor if db_user else None,
                sender_room=db_user.room if db_user else None,
                text=str(message.text),
                received_at=moscow_now(),
            ))
            session.commit()
    except Exception as error:
        print(f'Не удалось записать входящее сообщение: {error}')


def cleanup_old_logs(retention_days: int = 7):
    threshold = moscow_now() - timedelta(days=retention_days)

    try:
        with next(get_db_session()) as session:
            session.query(IncomingUserMessage).filter(
                IncomingUserMessage.received_at < threshold
            ).delete(synchronize_session=False)
            session.query(OutgoingMessageLog).filter(
                OutgoingMessageLog.created_at < threshold
            ).delete(synchronize_session=False)
            session.query(FailedNotification).filter(
                FailedNotification.timestamp < threshold
            ).delete(synchronize_session=False)
            session.query(BotLog).filter(
                BotLog.timestamp < threshold
            ).delete(synchronize_session=False)
            session.commit()
    except Exception as error:
        print(f'Не удалось очистить журналы сообщений: {error}')


def install_message_audit(bot):
    original_send_message = bot.send_message

    def logged_send_message(
        chat_id,
        text,
        *args,
        sender_chat_id=None,
        sender_username=None,
        sender_role=None,
        category='bot',
        skip_audit=False,
        **kwargs,
    ):
        status = 'доставлено'
        error_message = None

        try:
            return original_send_message(chat_id, text, *args, **kwargs)
        except Exception as error:
            status = 'не доставлено'
            error_message = _format_error_message(error)
            raise
        finally:
            if skip_audit:
                return

            try:
                recipient_chat_id = str(chat_id)
                with next(get_db_session()) as session:
                    sender_chat_id_str = str(sender_chat_id) if sender_chat_id is not None else 'BOT'
                    sender_user = _get_user(session, sender_chat_id_str if sender_chat_id is not None else None)
                    recipient_user = _get_user(session, recipient_chat_id)
                    session.add(OutgoingMessageLog(
                        category=category,
                        sender_chat_id=sender_chat_id_str,
                        sender_username=_resolve_username(sender_user, sender_username),
                        sender_role=sender_role or (sender_user.role.value if sender_user else 'bot'),
                        sender_floor=sender_user.floor if sender_user else None,
                        sender_room=sender_user.room if sender_user else None,
                        recipient_chat_id=recipient_chat_id,
                        recipient_username=_resolve_username(recipient_user),
                        recipient_role=recipient_user.role.value if recipient_user else None,
                        recipient_floor=recipient_user.floor if recipient_user else None,
                        recipient_room=recipient_user.room if recipient_user else None,
                        text=str(text),
                        status=status,
                        error_message=error_message,
                        created_at=moscow_now(),
                    ))
                    session.commit()
            except Exception as log_error:
                print(f'Не удалось записать исходящее сообщение: {log_error}')

    bot.send_message = logged_send_message

    if hasattr(bot, 'set_update_listener'):
        bot.set_update_listener(lambda messages: [log_incoming_message(message) for message in messages])