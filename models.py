from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import Column, Integer, String, Boolean, Date, DateTime, Enum
import enum

from time_utils import moscow_now

Base = declarative_base()


class RoleEnum(str, enum.Enum):
    ADMIN = "admin"
    CHAIRMAN = "chairman"  # председатель
    STAROSTA = "starosta"
    USER = "user"


class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(String, unique=True, index=True, nullable=False)
    role = Column(Enum(RoleEnum), default=RoleEnum.USER, nullable=False)
    room = Column(String, nullable=True)
    username = Column(String, nullable=True)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    floor = Column(Integer, nullable=True)
    wing = Column(String, nullable=True)
    is_blocked = Column(Boolean, default=False, nullable=False)
    is_whitelisted = Column(Boolean, default=True, nullable=False)


class DutyQueue(Base):
    """
    Таблица для хранения списка (очереди) комнат для дежурств.
    Порядок задаётся полем position.
    """
    __tablename__ = 'duty_queue'

    id = Column(Integer, primary_key=True, index=True)
    room = Column(String, nullable=False)
    position = Column(Integer, nullable=False)
    floor = Column(Integer, nullable=False)
    wing = Column(String, nullable=False)


class BotLog(Base):
    __tablename__ = 'bot_logs'

    id = Column(Integer, primary_key=True, index=True)
    event = Column(String, nullable=False)
    timestamp = Column(DateTime, nullable=False)
    user_id = Column(String, nullable=True)


class AccessKey(Base):
    """
    Таблица для хранения временных ключей (на 30 минут).
    - key: уникальный ключ (строка)
    - role_to_assign: роль, которая будет присвоена
    - created_at: время создания
    - is_active: если False, ключ не действует (либо можно проверять по времени)
    """
    __tablename__ = 'access_keys'

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, nullable=False, unique=True, index=True)
    role_to_assign = Column(Enum(RoleEnum), nullable=False)
    created_at = Column(DateTime, default=moscow_now, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)


class FailedNotification(Base):
    """
    Таблица для логирования недоставленных уведомлений.
    """
    __tablename__ = 'failed_notifications'

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False)  # ID пользователя (из таблицы users.id)
    chat_id = Column(String, nullable=False)  # chat_id
    reason = Column(String, nullable=False)  # причина (блокировка бота / ошибка и т.д.)
    timestamp = Column(DateTime, default=moscow_now, nullable=False)


class FloorNotificationSetting(Base):
    __tablename__ = 'floor_notification_settings'

    id = Column(Integer, primary_key=True, index=True)
    floor = Column(Integer, unique=True, index=True, nullable=False)
    notification_hour = Column(Integer, nullable=False)
    notification_minute = Column(Integer, nullable=False)
    last_notified_on = Column(Date, nullable=True)
    updated_at = Column(DateTime, default=moscow_now, nullable=False)


class IncomingUserMessage(Base):
    __tablename__ = 'incoming_user_messages'

    id = Column(Integer, primary_key=True, index=True)
    sender_chat_id = Column(String, index=True, nullable=False)
    sender_username = Column(String, nullable=True)
    sender_role = Column(String, nullable=True)
    sender_floor = Column(Integer, nullable=True)
    sender_room = Column(String, nullable=True)
    text = Column(String, nullable=False)
    received_at = Column(DateTime, default=moscow_now, nullable=False)


class OutgoingMessageLog(Base):
    __tablename__ = 'outgoing_message_logs'

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String, nullable=False, default='bot')
    sender_chat_id = Column(String, index=True, nullable=False)
    sender_username = Column(String, nullable=True)
    sender_role = Column(String, nullable=True)
    sender_floor = Column(Integer, nullable=True)
    sender_room = Column(String, nullable=True)
    recipient_chat_id = Column(String, index=True, nullable=False)
    recipient_username = Column(String, nullable=True)
    recipient_role = Column(String, nullable=True)
    recipient_floor = Column(Integer, nullable=True)
    recipient_room = Column(String, nullable=True)
    text = Column(String, nullable=False)
    status = Column(String, nullable=False)
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime, default=moscow_now, nullable=False)
