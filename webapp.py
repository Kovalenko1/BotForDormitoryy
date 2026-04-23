from calendar import monthrange
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Literal

import telebot
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_

from bot_events import log_bot_event
from config import BOT_TOKEN, NOTIFICATION_HOUR, NOTIFICATION_MINUTE, WEB_FORCE_HTTPS
from dashboard_auth import validate_telegram_init_data, verify_dashboard_token
from database import engine, get_db_session
from message_audit import ensure_message_audit_schema, install_message_audit
from models import Base, BotLog, DutyQueue, FailedNotification, FloorNotificationSetting, IncomingUserMessage, OutgoingMessageLog, RoleEnum, User
from time_utils import MOSCOW_TIMEZONE, moscow_now
from user_access import ensure_user_access_schema
from utils import cleanup_expired_keys, generate_access_key, parse_block, parse_floor, parse_notification_time, parse_room, parse_rooms_input


DIST_DIR = Path(__file__).resolve().parent / 'dashboard' / 'dist'
SITE_ROLES = {RoleEnum.ADMIN.value, RoleEnum.CHAIRMAN.value, RoleEnum.STAROSTA.value, RoleEnum.USER.value}
STAFF_ROLES = {RoleEnum.ADMIN.value, RoleEnum.CHAIRMAN.value, RoleEnum.STAROSTA.value}
MANAGE_ROLE_ROLES = {RoleEnum.ADMIN.value, RoleEnum.CHAIRMAN.value}
FAILED_MESSAGE_STATUS = 'не доставлено'
DEFAULT_FLOORS = list(range(1, 17))

WEBAPP_BOT = telebot.TeleBot(BOT_TOKEN) if BOT_TOKEN else None
if WEBAPP_BOT is not None:
    install_message_audit(WEBAPP_BOT)

Base.metadata.create_all(engine)
ensure_message_audit_schema(engine)
ensure_user_access_schema(engine)

app = FastAPI(
    title='BotForDormitory Dashboard',
    docs_url='/api/docs',
    openapi_url='/api/openapi.json',
)


class ReplaceSchedulePayload(BaseModel):
    blocks: list[str] = Field(default_factory=list)


class UpdateNotificationPayload(BaseModel):
    hour: int | None = None
    minute: int | None = None
    time: str | None = None


class BroadcastPayload(BaseModel):
    text: str
    scope: Literal['all', 'floor', 'block', 'room']
    floor: int | None = None
    block: str | None = None
    room: str | None = None
    role: Literal['all', 'admin', 'chairman', 'starosta', 'user'] = 'all'


class AccessKeyPayload(BaseModel):
    role_to_assign: Literal['chairman', 'starosta']


class UpdateUserRolePayload(BaseModel):
    role: Literal['user', 'chairman', 'starosta']


class UpdateUserAccessPayload(BaseModel):
    is_blocked: bool | None = None
    is_whitelisted: bool | None = None


@dataclass(frozen=True)
class DashboardAccess:
    chat_id: str
    role: str
    floor: int | None
    room: str | None
    username: str | None
    first_name: str | None
    last_name: str | None
    is_blocked: bool
    is_whitelisted: bool

    @property
    def is_staff(self) -> bool:
        return self.role in STAFF_ROLES

    @property
    def is_floor_scoped(self) -> bool:
        return self.role in {RoleEnum.STAROSTA.value, RoleEnum.USER.value}

    @property
    def accessible_floors(self) -> list[int]:
        if self.role in {RoleEnum.ADMIN.value, RoleEnum.CHAIRMAN.value}:
            return DEFAULT_FLOORS
        if self.floor is None:
            return []
        return [self.floor]

    @property
    def allowed_views(self) -> list[str]:
        if self.role == RoleEnum.USER.value:
            return ['schedule'] if self.is_whitelisted else []
        return ['dashboard', 'general', 'users', 'errors', 'schedule', 'management']

    @property
    def scope_value(self) -> Literal['all', 'floor']:
        return 'floor' if self.is_floor_scoped else 'all'

    @property
    def permissions(self) -> dict:
        return {
            'can_view_overview': self.is_staff,
            'can_view_logs': self.is_staff,
            'can_view_errors': self.is_staff,
            'can_view_user_history': self.is_staff,
            'can_view_schedule': self.is_staff or self.is_whitelisted,
            'can_manage_schedule': self.role in STAFF_ROLES,
            'can_manage_roles': self.role in MANAGE_ROLE_ROLES,
            'can_manage_user_access': self.role in MANAGE_ROLE_ROLES,
            'can_manage_notifications': self.role in STAFF_ROLES,
            'can_broadcast': self.role in STAFF_ROLES,
        }


@app.middleware('http')
async def https_redirect_middleware(request: Request, call_next):
    if WEB_FORCE_HTTPS and request.url.scheme != 'https':
        https_url = request.url.replace(scheme='https')
        return RedirectResponse(url=str(https_url), status_code=307)
    return await call_next(request)


def _serialize_datetime(value):
    if value is None:
        return None
    if value.tzinfo is None:
        value = MOSCOW_TIMEZONE.localize(value)
    return value.isoformat()


def _serialize_date(value: date | None):
    return value.isoformat() if value else None


def _display_name(username: str | None, first_name: str | None, last_name: str | None, fallback: str) -> str:
    if username:
        return username

    full_name = ' '.join(part for part in [first_name, last_name] if part).strip()
    return full_name or fallback


def _validate_floor_value(floor: int) -> int:
    if not 1 <= floor <= 16:
        raise HTTPException(status_code=400, detail='Этаж должен быть в диапазоне от 1 до 16.')
    return floor


def _require_access(request: Request, allowed_roles: set[str] | None = None) -> DashboardAccess:
    init_data = request.headers.get('X-Telegram-Init-Data')
    token = request.headers.get('X-Dashboard-Token')
    auth_header = request.headers.get('Authorization', '')

    if not token and auth_header.startswith('Bearer '):
        token = auth_header[7:].strip()

    telegram_user = validate_telegram_init_data(init_data)
    chat_id = telegram_user['chat_id'] if telegram_user else verify_dashboard_token(token)
    if not chat_id:
        raise HTTPException(status_code=401, detail='Требуется авторизация через Telegram или одноразовую ссылку.')

    permitted_roles = allowed_roles or SITE_ROLES
    with next(get_db_session()) as session:
        user = session.query(User).filter(User.chat_id == chat_id).first()
        if not user:
            raise HTTPException(status_code=404, detail='Пользователь не найден в базе бота.')
        if user.is_blocked:
            raise HTTPException(status_code=403, detail='Доступ к dashboard для этой учётной записи заблокирован.')
        if user.role.value not in permitted_roles:
            raise HTTPException(status_code=403, detail='У вас нет доступа к этому разделу dashboard.')
        if user.role == RoleEnum.USER and not user.is_whitelisted:
            raise HTTPException(status_code=403, detail='График доступен только пользователям из белого списка.')

        return DashboardAccess(
            chat_id=user.chat_id,
            role=user.role.value,
            floor=user.floor,
            room=user.room,
            username=user.username,
            first_name=user.first_name,
            last_name=user.last_name,
            is_blocked=user.is_blocked,
            is_whitelisted=user.is_whitelisted,
        )


def _apply_user_scope(query, access: DashboardAccess):
    if access.is_floor_scoped:
        if access.floor is None:
            raise HTTPException(status_code=403, detail='Для работы с данными вашего этажа сначала укажите комнату.')
        query = query.filter(User.floor == access.floor)
    return query


def _apply_incoming_scope(query, access: DashboardAccess):
    if access.is_floor_scoped:
        if access.floor is None:
            raise HTTPException(status_code=403, detail='Для работы с данными вашего этажа сначала укажите комнату.')
        query = query.filter(IncomingUserMessage.sender_floor == access.floor)
    return query


def _apply_outgoing_scope(query, access: DashboardAccess):
    if access.is_floor_scoped:
        if access.floor is None:
            raise HTTPException(status_code=403, detail='Для работы с данными вашего этажа сначала укажите комнату.')
        query = query.filter(
            or_(
                OutgoingMessageLog.sender_chat_id == access.chat_id,
                OutgoingMessageLog.recipient_floor == access.floor,
            )
        )
    return query


def _apply_failed_scope(query, access: DashboardAccess):
    if access.is_floor_scoped:
        if access.floor is None:
            raise HTTPException(status_code=403, detail='Для работы с данными вашего этажа сначала укажите комнату.')
        query = query.join(User, User.id == FailedNotification.user_id).filter(User.floor == access.floor)
    return query


def _apply_bot_log_scope(query, access: DashboardAccess):
    if access.is_floor_scoped:
        if access.floor is None:
            raise HTTPException(status_code=403, detail='Для работы с данными вашего этажа сначала укажите комнату.')
        query = query.outerjoin(User, User.chat_id == BotLog.user_id).filter(User.floor == access.floor)
    return query


def _user_payload(user: User) -> dict:
    return {
        'id': user.id,
        'chat_id': user.chat_id,
        'role': user.role.value,
        'room': user.room,
        'username': user.username,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'floor': user.floor,
        'wing': user.wing,
        'is_blocked': user.is_blocked,
        'is_whitelisted': user.is_whitelisted,
        'access_list': 'white' if user.is_whitelisted else 'black',
        'display_name': _display_name(user.username, user.first_name, user.last_name, user.chat_id),
    }


def _incoming_payload(message: IncomingUserMessage) -> dict:
    return {
        'id': message.id,
        'sender_chat_id': message.sender_chat_id,
        'sender_username': message.sender_username,
        'sender_role': message.sender_role,
        'sender_floor': message.sender_floor,
        'sender_room': message.sender_room,
        'text': message.text,
        'received_at': _serialize_datetime(message.received_at),
        'display_name': _display_name(message.sender_username, None, None, message.sender_chat_id),
    }


def _outgoing_payload(message: OutgoingMessageLog) -> dict:
    return {
        'id': message.id,
        'category': message.category,
        'sender_chat_id': message.sender_chat_id,
        'sender_username': message.sender_username,
        'sender_role': message.sender_role,
        'sender_floor': message.sender_floor,
        'sender_room': message.sender_room,
        'recipient_chat_id': message.recipient_chat_id,
        'recipient_username': message.recipient_username,
        'recipient_role': message.recipient_role,
        'recipient_floor': message.recipient_floor,
        'recipient_room': message.recipient_room,
        'text': message.text,
        'status': message.status,
        'error_message': message.error_message,
        'created_at': _serialize_datetime(message.created_at),
        'sender_display_name': _display_name(message.sender_username, None, None, message.sender_chat_id),
        'recipient_display_name': _display_name(message.recipient_username, None, None, message.recipient_chat_id),
    }


def _bot_log_payload(log: BotLog) -> dict:
    return {
        'id': log.id,
        'event': log.event,
        'timestamp': _serialize_datetime(log.timestamp),
        'user_id': log.user_id,
    }


def _failed_payload(item: FailedNotification) -> dict:
    return {
        'id': item.id,
        'user_id': item.user_id,
        'chat_id': item.chat_id,
        'reason': item.reason,
        'timestamp': _serialize_datetime(item.timestamp),
    }


def _activity_item_from_incoming(item: IncomingUserMessage) -> dict:
    return {
        'id': f'incoming-{item.id}',
        'type': 'incoming',
        'timestamp': _serialize_datetime(item.received_at),
        'title': f'От: {_display_name(item.sender_username, None, None, item.sender_chat_id)}',
        'subtitle': item.sender_room or 'Комната не указана',
        'text': item.text,
        'status': item.sender_role or 'user',
        'error_message': None,
    }


def _activity_item_from_outgoing(item: OutgoingMessageLog) -> dict:
    return {
        'id': f'outgoing-{item.id}',
        'type': 'outgoing',
        'timestamp': _serialize_datetime(item.created_at),
        'title': f'Кому: {_display_name(item.recipient_username, None, None, item.recipient_chat_id)}',
        'subtitle': f"{item.category} · {item.status}",
        'text': item.text,
        'status': item.status,
        'error_message': item.error_message,
    }


def _activity_item_from_event(item: BotLog) -> dict:
    return {
        'id': f'event-{item.id}',
        'type': 'event',
        'timestamp': _serialize_datetime(item.timestamp),
        'title': 'Системное событие',
        'subtitle': item.user_id or 'BOT',
        'text': item.event,
        'status': 'event',
        'error_message': None,
    }


def _error_item_from_failed_notification(item: FailedNotification) -> dict:
    return {
        'id': f'failed-notification-{item.id}',
        'type': 'notification',
        'timestamp': _serialize_datetime(item.timestamp),
        'message': item.reason,
        'context': f'Chat ID: {item.chat_id}',
    }


def _error_item_from_failed_message(item: OutgoingMessageLog) -> dict:
    return {
        'id': f'failed-message-{item.id}',
        'type': 'message',
        'timestamp': _serialize_datetime(item.created_at),
        'message': item.error_message or 'Неизвестная ошибка',
        'context': f"Кому: {_display_name(item.recipient_username, None, None, item.recipient_chat_id)} | {item.text[:50]}",
    }


def _queue_payload(item: DutyQueue) -> dict:
    return {
        'id': item.id,
        'room': item.room,
        'position': item.position,
        'floor': item.floor,
        'wing': item.wing,
    }


def _get_floor_setting(session, floor: int) -> FloorNotificationSetting | None:
    return session.query(FloorNotificationSetting).filter(FloorNotificationSetting.floor == floor).first()


def _get_or_create_floor_setting(session, floor: int) -> FloorNotificationSetting:
    setting = _get_floor_setting(session, floor)
    if setting:
        return setting

    setting = FloorNotificationSetting(
        floor=floor,
        notification_hour=NOTIFICATION_HOUR,
        notification_minute=NOTIFICATION_MINUTE,
        updated_at=moscow_now(),
    )
    session.add(setting)
    session.commit()
    session.refresh(setting)
    return setting


def _notification_setting_payload(setting: FloorNotificationSetting | None, floor: int) -> dict:
    if setting is None:
        return {
            'floor': floor,
            'notification_hour': NOTIFICATION_HOUR,
            'notification_minute': NOTIFICATION_MINUTE,
            'last_notified_on': None,
            'updated_at': None,
        }

    return {
        'floor': setting.floor,
        'notification_hour': setting.notification_hour,
        'notification_minute': setting.notification_minute,
        'last_notified_on': _serialize_date(setting.last_notified_on),
        'updated_at': _serialize_datetime(setting.updated_at),
    }


def _get_schedule_start_date(session, floor: int) -> date:
    today = date.today()
    floor_setting = _get_floor_setting(session, floor)
    if floor_setting and floor_setting.last_notified_on == today:
        return today + timedelta(days=1)
    return today


def _resolve_floor_access(access: DashboardAccess, requested_floor: int | None) -> int:
    if access.role in {RoleEnum.ADMIN.value, RoleEnum.CHAIRMAN.value}:
        if requested_floor is None:
            raise HTTPException(status_code=400, detail='Укажите этаж.')
        return _validate_floor_value(requested_floor)

    if access.floor is None:
        raise HTTPException(status_code=403, detail='Сначала укажите комнату, чтобы определить этаж.')

    if requested_floor is not None and requested_floor != access.floor:
        raise HTTPException(status_code=403, detail='У вас нет доступа к данным другого этажа.')

    return access.floor


def _build_calendar_days(queue_items: list[DutyQueue], start_date: date, year: int, month: int) -> list[dict]:
    _, days_in_month = monthrange(year, month)
    rooms = [item.room for item in queue_items]
    result = []

    for day_number in range(1, days_in_month + 1):
        current_date = date(year, month, day_number)
        room = None
        queue_position = None
        if rooms:
            queue_index = (current_date - start_date).days % len(rooms)
            room = rooms[queue_index]
            queue_position = queue_index + 1

        result.append({
            'date': current_date.isoformat(),
            'day': day_number,
            'weekday': current_date.weekday(),
            'room': room,
            'queue_position': queue_position,
            'is_today': current_date == date.today(),
            'is_current_month': True,
        })

    return result


def _normalize_schedule_blocks(blocks: list[str], floor: int) -> list[str]:
    try:
        normalized_blocks = parse_rooms_input(','.join(blocks)) if blocks else []
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    valid_blocks = []
    for block in normalized_blocks:
        try:
            normalized_block, block_floor = parse_block(block)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        if block_floor != floor:
            raise HTTPException(status_code=400, detail=f'Блок {normalized_block} не относится к этажу {floor}.')
        valid_blocks.append(normalized_block)
    return valid_blocks


def _replace_schedule(session, floor: int, blocks: list[str]):
    session.query(DutyQueue).filter(DutyQueue.floor == floor).delete()
    session.flush()

    for position, block in enumerate(blocks, start=1):
        session.add(DutyQueue(
            room=block,
            position=position,
            floor=floor,
            wing='',
        ))

    session.commit()


def _parse_broadcast_payload(payload: BroadcastPayload, access: DashboardAccess) -> tuple[dict, str]:
    scope = payload.scope
    if scope == 'all':
        if access.role not in {RoleEnum.ADMIN.value, RoleEnum.CHAIRMAN.value}:
            raise HTTPException(status_code=403, detail='Рассылка всем доступна только председателю или админу.')
        return {'scope': 'all'}, 'всех пользователей'

    if scope == 'floor':
        floor = _resolve_floor_access(access, payload.floor)
        return {'scope': 'floor', 'floor': floor}, f'{floor} этажа'

    if scope == 'block':
        if not payload.block:
            raise HTTPException(status_code=400, detail='Укажите блок для рассылки.')
        try:
            block, floor = parse_block(payload.block)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        _resolve_floor_access(access, floor)
        return {'scope': 'block', 'block': block, 'floor': floor}, f'блока {block}'

    if not payload.room:
        raise HTTPException(status_code=400, detail='Укажите комнату для рассылки.')

    try:
        room, block, floor = parse_room(payload.room)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    _resolve_floor_access(access, floor)
    return {'scope': 'room', 'room': room, 'floor': floor}, f'комнаты {room}'


def _resolve_broadcast_recipients(session, access: DashboardAccess, payload: BroadcastPayload):
    target, target_label = _parse_broadcast_payload(payload, access)
    query = session.query(User).filter(
        User.chat_id != access.chat_id,
        User.chat_id.isnot(None),
        User.is_blocked.is_(False),
        User.is_whitelisted.is_(True),
    )

    if target['scope'] == 'floor':
        query = query.filter(User.floor == target['floor'])
    elif target['scope'] == 'block':
        query = query.filter(User.room.like(f"{target['block']}%"))
    elif target['scope'] == 'room':
        query = query.filter(User.room == target['room'])

    if payload.role != 'all':
        query = query.filter(User.role == RoleEnum(payload.role))

    return query.order_by(User.floor.asc(), User.room.asc(), User.chat_id.asc()).all(), target_label


def _staff_lists_payload(session) -> dict:
    admins = session.query(User).filter(User.role == RoleEnum.ADMIN).order_by(User.chat_id.asc()).all()
    chairmen = session.query(User).filter(User.role == RoleEnum.CHAIRMAN).order_by(User.chat_id.asc()).all()
    starostas = session.query(User).filter(User.role == RoleEnum.STAROSTA).order_by(User.floor.asc(), User.chat_id.asc()).all()
    return {
        'admins': [_user_payload(item) for item in admins],
        'chairmen': [_user_payload(item) for item in chairmen],
        'starostas': [_user_payload(item) for item in starostas],
    }


def _assert_manageable_user(access: DashboardAccess, target_user: User):
    if target_user.role == RoleEnum.ADMIN:
        raise HTTPException(status_code=403, detail='Нельзя управлять администратором через dashboard.')

    if target_user.role == RoleEnum.CHAIRMAN and access.role != RoleEnum.ADMIN.value:
        raise HTTPException(status_code=403, detail='Только администратор может управлять председателями.')


@app.get('/api/health')
def api_healthcheck():
    return {'status': 'ok'}


@app.get('/api/session')
def get_session(request: Request):
    access = _require_access(request)
    return {
        'user': {
            'chat_id': access.chat_id,
            'role': access.role,
            'floor': access.floor,
            'room': access.room,
            'username': access.username,
            'first_name': access.first_name,
            'last_name': access.last_name,
            'is_blocked': access.is_blocked,
            'is_whitelisted': access.is_whitelisted,
            'access_list': 'white' if access.is_whitelisted else 'black',
            'display_name': _display_name(access.username, access.first_name, access.last_name, access.chat_id),
        },
        'scope': access.scope_value,
        'allowed_views': access.allowed_views,
        'permissions': access.permissions,
        'accessible_floors': access.accessible_floors,
    }


@app.get('/api/dashboard/overview')
def get_dashboard_overview(request: Request):
    access = _require_access(request, STAFF_ROLES)

    with next(get_db_session()) as session:
        users_query = _apply_user_scope(session.query(User), access)
        incoming_query = _apply_incoming_scope(session.query(IncomingUserMessage), access)
        outgoing_query = _apply_outgoing_scope(session.query(OutgoingMessageLog), access)
        bot_logs_query = _apply_bot_log_scope(session.query(BotLog), access)
        failed_notifications_query = _apply_failed_scope(session.query(FailedNotification), access)
        failed_messages_query = _apply_outgoing_scope(
            session.query(OutgoingMessageLog).filter(OutgoingMessageLog.status == FAILED_MESSAGE_STATUS),
            access,
        )

        summary = {
            'users_count': users_query.with_entities(func.count(User.id)).scalar() or 0,
            'bot_logs_count': bot_logs_query.with_entities(func.count(BotLog.id)).scalar() or 0,
            'messages_count': (incoming_query.with_entities(func.count(IncomingUserMessage.id)).scalar() or 0)
            + (outgoing_query.with_entities(func.count(OutgoingMessageLog.id)).scalar() or 0),
            'failed_count': failed_messages_query.with_entities(func.count(OutgoingMessageLog.id)).scalar() or 0,
        }

        recent_activity = [
            _activity_item_from_incoming(item)
            for item in incoming_query.order_by(IncomingUserMessage.received_at.desc()).limit(5).all()
        ]
        recent_activity.extend(
            _activity_item_from_outgoing(item)
            for item in outgoing_query.order_by(OutgoingMessageLog.created_at.desc()).limit(5).all()
        )
        recent_activity.extend(
            _activity_item_from_event(item)
            for item in bot_logs_query.order_by(BotLog.timestamp.desc()).limit(5).all()
        )
        recent_activity.sort(key=lambda item: item['timestamp'], reverse=True)

        recent_errors = [
            _error_item_from_failed_notification(item)
            for item in failed_notifications_query.order_by(FailedNotification.timestamp.desc()).limit(5).all()
        ]
        recent_errors.extend(
            _error_item_from_failed_message(item)
            for item in failed_messages_query.order_by(OutgoingMessageLog.created_at.desc()).limit(5).all()
        )
        recent_errors.sort(key=lambda item: item['timestamp'], reverse=True)

    return {
        'summary': summary,
        'recent_activity': recent_activity[:5],
        'recent_errors': recent_errors[:5],
    }


@app.get('/api/logs/general')
def get_general_logs(request: Request, limit: int = 120):
    access = _require_access(request, STAFF_ROLES)
    safe_limit = max(20, min(limit, 300))

    with next(get_db_session()) as session:
        incoming_messages = _apply_incoming_scope(session.query(IncomingUserMessage), access).order_by(
            IncomingUserMessage.received_at.desc()
        ).limit(safe_limit).all()
        outgoing_messages = _apply_outgoing_scope(session.query(OutgoingMessageLog), access).order_by(
            OutgoingMessageLog.created_at.desc()
        ).limit(safe_limit).all()
        bot_logs = _apply_bot_log_scope(session.query(BotLog), access).order_by(
            BotLog.timestamp.desc()
        ).limit(safe_limit).all()

    items = [_activity_item_from_incoming(item) for item in incoming_messages]
    items.extend(_activity_item_from_outgoing(item) for item in outgoing_messages)
    items.extend(_activity_item_from_event(item) for item in bot_logs)
    items.sort(key=lambda item: item['timestamp'], reverse=True)

    return {'items': items[:safe_limit]}


@app.get('/api/errors')
def get_errors(request: Request, limit: int = 100):
    access = _require_access(request, STAFF_ROLES)
    safe_limit = max(20, min(limit, 300))

    with next(get_db_session()) as session:
        failed_notifications = _apply_failed_scope(session.query(FailedNotification), access).order_by(
            FailedNotification.timestamp.desc()
        ).limit(safe_limit).all()
        failed_messages = _apply_outgoing_scope(
            session.query(OutgoingMessageLog).filter(OutgoingMessageLog.status == FAILED_MESSAGE_STATUS),
            access,
        ).order_by(OutgoingMessageLog.created_at.desc()).limit(safe_limit).all()

    items = [_error_item_from_failed_notification(item) for item in failed_notifications]
    items.extend(_error_item_from_failed_message(item) for item in failed_messages)
    items.sort(key=lambda item: item['timestamp'], reverse=True)

    return {'items': items[:safe_limit]}


@app.get('/api/users')
def get_users(
    request: Request,
    search: str = '',
    limit: int = 200,
    role: str = '',
    floor: int | None = None,
    has_room: bool | None = None,
    is_blocked: bool | None = None,
    is_whitelisted: bool | None = None,
):
    access = _require_access(request, STAFF_ROLES)
    safe_limit = max(20, min(limit, 500))

    with next(get_db_session()) as session:
        users_query = _apply_user_scope(session.query(User), access)
        search_value = search.strip()
        if search_value:
            pattern = f'%{search_value}%'
            users_query = users_query.filter(
                or_(
                    User.chat_id.ilike(pattern),
                    User.username.ilike(pattern),
                    User.first_name.ilike(pattern),
                    User.last_name.ilike(pattern),
                    User.room.ilike(pattern),
                )
            )

        role_value = role.strip().lower()
        if role_value:
            try:
                users_query = users_query.filter(User.role == RoleEnum(role_value))
            except ValueError as error:
                raise HTTPException(status_code=400, detail='Неизвестная роль пользователя.') from error

        if floor is not None:
            _resolve_floor_access(access, floor)
            users_query = users_query.filter(User.floor == floor)

        if has_room is True:
            users_query = users_query.filter(User.room.isnot(None))
        elif has_room is False:
            users_query = users_query.filter(User.room.is_(None))

        if is_blocked is not None:
            users_query = users_query.filter(User.is_blocked.is_(is_blocked))

        if is_whitelisted is not None:
            users_query = users_query.filter(User.is_whitelisted.is_(is_whitelisted))

        total = users_query.with_entities(func.count(User.id)).scalar() or 0
        users = users_query.order_by(User.floor.asc(), User.room.asc(), User.chat_id.asc()).limit(safe_limit).all()

    return {
        'items': [_user_payload(user) for user in users],
        'total': total,
    }


@app.get('/api/users/{chat_id}/footprint')
def get_user_footprint(chat_id: str, request: Request):
    access = _require_access(request, STAFF_ROLES)

    with next(get_db_session()) as session:
        target_user = _apply_user_scope(session.query(User), access).filter(User.chat_id == chat_id).first()
        if not target_user:
            raise HTTPException(status_code=404, detail='Пользователь не найден или недоступен в вашем scope.')

        incoming_messages = session.query(IncomingUserMessage).filter(
            IncomingUserMessage.sender_chat_id == chat_id
        ).order_by(IncomingUserMessage.received_at.asc()).all()
        outgoing_messages = session.query(OutgoingMessageLog).filter(
            or_(
                OutgoingMessageLog.sender_chat_id == chat_id,
                OutgoingMessageLog.recipient_chat_id == chat_id,
            )
        ).order_by(OutgoingMessageLog.created_at.asc()).all()
        failed_notifications = session.query(FailedNotification).filter(
            FailedNotification.chat_id == chat_id
        ).order_by(FailedNotification.timestamp.asc()).all()

    items = [
        {
            'id': f'incoming-{item.id}',
            'type': 'incoming',
            'timestamp': _serialize_datetime(item.received_at),
            'text': item.text,
            'status': item.sender_role or 'user',
            'error_message': None,
            'direction': 'from_user',
        }
        for item in incoming_messages
    ]
    items.extend(
        {
            'id': f'outgoing-{item.id}',
            'type': 'outgoing',
            'timestamp': _serialize_datetime(item.created_at),
            'text': item.text,
            'status': item.status,
            'error_message': item.error_message,
            'direction': 'from_user' if item.sender_chat_id == chat_id else 'to_user',
        }
        for item in outgoing_messages
    )
    items.extend(
        {
            'id': f'failure-{item.id}',
            'type': 'error',
            'timestamp': _serialize_datetime(item.timestamp),
            'text': item.reason,
            'status': 'ошибка',
            'error_message': item.reason,
            'direction': 'error',
        }
        for item in failed_notifications
    )
    items.sort(key=lambda item: item['timestamp'])

    return {
        'user': _user_payload(target_user),
        'items': items,
    }


@app.get('/api/duty/calendar')
def get_duty_calendar(
    request: Request,
    floor: int | None = None,
    year: int | None = None,
    month: int | None = None,
):
    access = _require_access(request)
    target_floor = _resolve_floor_access(access, floor)
    year_value = year or date.today().year
    month_value = month or date.today().month
    if not 1 <= month_value <= 12:
        raise HTTPException(status_code=400, detail='Месяц должен быть в диапазоне от 1 до 12.')

    with next(get_db_session()) as session:
        queue_items = session.query(DutyQueue).filter(
            DutyQueue.floor == target_floor
        ).order_by(DutyQueue.position.asc()).all()
        setting = _get_floor_setting(session, target_floor)
        schedule_start_date = _get_schedule_start_date(session, target_floor)

    return {
        'floor': target_floor,
        'year': year_value,
        'month': month_value,
        'can_edit': access.permissions['can_manage_schedule'],
        'scope': access.scope_value,
        'accessible_floors': access.accessible_floors,
        'start_date': schedule_start_date.isoformat(),
        'queue': [_queue_payload(item) for item in queue_items],
        'notification_setting': _notification_setting_payload(setting, target_floor),
        'days': _build_calendar_days(queue_items, schedule_start_date, year_value, month_value),
    }


@app.put('/api/duty/floors/{floor}')
def replace_duty_schedule(floor: int, payload: ReplaceSchedulePayload, request: Request):
    access = _require_access(request, STAFF_ROLES)
    target_floor = _resolve_floor_access(access, floor)
    normalized_blocks = _normalize_schedule_blocks(payload.blocks, target_floor)

    with next(get_db_session()) as session:
        _replace_schedule(session, target_floor, normalized_blocks)

    log_bot_event(
        f"Dashboard updated duty schedule for floor {target_floor}: {', '.join(normalized_blocks) if normalized_blocks else 'cleared'}",
        user_id=access.chat_id,
    )

    return {'floor': target_floor, 'blocks': normalized_blocks}


@app.get('/api/notification-settings')
def get_notification_settings(request: Request):
    access = _require_access(request, STAFF_ROLES)

    with next(get_db_session()) as session:
        settings = {item.floor: item for item in session.query(FloorNotificationSetting).all()}

    return {
        'items': [
            _notification_setting_payload(settings.get(floor), floor)
            for floor in access.accessible_floors
        ]
    }


@app.put('/api/notification-settings/{floor}')
def update_notification_setting(floor: int, payload: UpdateNotificationPayload, request: Request):
    access = _require_access(request, STAFF_ROLES)
    target_floor = _resolve_floor_access(access, floor)

    if payload.time:
        try:
            hour, minute = parse_notification_time(payload.time)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
    elif payload.hour is not None and payload.minute is not None:
        hour = int(payload.hour)
        minute = int(payload.minute)
        if not 0 <= hour <= 23 or not 0 <= minute <= 59:
            raise HTTPException(status_code=400, detail='Время должно быть в диапазоне от 00:00 до 23:59.')
    else:
        raise HTTPException(status_code=400, detail='Передайте time или пару hour/minute.')

    with next(get_db_session()) as session:
        setting = _get_or_create_floor_setting(session, target_floor)
        setting.notification_hour = hour
        setting.notification_minute = minute
        setting.updated_at = moscow_now()
        session.commit()
        payload_data = _notification_setting_payload(setting, target_floor)

    log_bot_event(
        f"Dashboard updated notification time for floor {target_floor} to {hour:02d}:{minute:02d}",
        user_id=access.chat_id,
    )

    return payload_data


@app.post('/api/broadcast')
def send_broadcast(payload: BroadcastPayload, request: Request):
    access = _require_access(request, STAFF_ROLES)
    if not WEBAPP_BOT:
        raise HTTPException(status_code=503, detail='BOT_TOKEN не настроен, рассылка недоступна.')

    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail='Текст рассылки не должен быть пустым.')

    with next(get_db_session()) as session:
        recipients, target_label = _resolve_broadcast_recipients(session, access, payload)

    if not recipients:
        raise HTTPException(status_code=404, detail='Не найдено получателей для выбранного фильтра.')

    sent_count = 0
    failed_count = 0
    for recipient in recipients:
        try:
            WEBAPP_BOT.send_message(
                int(recipient.chat_id),
                text,
                sender_chat_id=access.chat_id,
                sender_username=access.username,
                sender_role=access.role,
                category='broadcast',
            )
            sent_count += 1
        except Exception:
            failed_count += 1

    log_bot_event(
        f"Dashboard broadcast to {target_label}: sent={sent_count}, failed={failed_count}",
        user_id=access.chat_id,
    )

    return {
        'target': target_label,
        'recipients_count': len(recipients),
        'sent_count': sent_count,
        'failed_count': failed_count,
    }


@app.get('/api/management/roles')
def get_management_roles(request: Request):
    access = _require_access(request, MANAGE_ROLE_ROLES)
    with next(get_db_session()) as session:
        return _staff_lists_payload(session)


@app.post('/api/management/access-keys')
def create_management_access_key(payload: AccessKeyPayload, request: Request):
    access = _require_access(request, MANAGE_ROLE_ROLES)
    requested_role = payload.role_to_assign

    if requested_role == RoleEnum.CHAIRMAN.value and access.role != RoleEnum.ADMIN.value:
        raise HTTPException(status_code=403, detail='Только администратор может создавать ключ председателя.')

    cleanup_expired_keys()
    key = generate_access_key(RoleEnum(requested_role))
    log_bot_event(
        f"Dashboard generated {requested_role} access key {key}",
        user_id=access.chat_id,
    )
    return {
        'key': key,
        'role_to_assign': requested_role,
    }


@app.put('/api/management/users/{chat_id}/role')
def update_management_user_role(chat_id: str, payload: UpdateUserRolePayload, request: Request):
    access = _require_access(request, MANAGE_ROLE_ROLES)
    target_role = payload.role

    if target_role == RoleEnum.CHAIRMAN.value and access.role != RoleEnum.ADMIN.value:
        raise HTTPException(status_code=403, detail='Только администратор может назначать председателей.')

    with next(get_db_session()) as session:
        target_user = session.query(User).filter(User.chat_id == chat_id).first()
        if not target_user:
            raise HTTPException(status_code=404, detail='Пользователь не найден.')

        _assert_manageable_user(access, target_user)

        if target_role == RoleEnum.STAROSTA.value:
            if target_user.floor is None:
                raise HTTPException(status_code=400, detail='Нельзя назначить старосту без указанной комнаты и этажа.')

            existing_starosta = session.query(User).filter(
                User.role == RoleEnum.STAROSTA,
                User.floor == target_user.floor,
                User.chat_id != target_user.chat_id,
            ).first()
            if existing_starosta:
                raise HTTPException(status_code=409, detail=f'На этаже {target_user.floor} уже назначен староста.')

        target_user.role = RoleEnum(target_role)
        session.commit()
        session.refresh(target_user)
        user_payload = _user_payload(target_user)

    log_bot_event(
        f"Dashboard changed role for {chat_id} to {target_role}",
        user_id=access.chat_id,
    )

    return user_payload


@app.put('/api/management/users/{chat_id}/access')
def update_management_user_access(chat_id: str, payload: UpdateUserAccessPayload, request: Request):
    access = _require_access(request, MANAGE_ROLE_ROLES)

    if payload.is_blocked is None and payload.is_whitelisted is None:
        raise HTTPException(status_code=400, detail='Передайте хотя бы один параметр доступа для обновления.')

    with next(get_db_session()) as session:
        target_user = session.query(User).filter(User.chat_id == chat_id).first()
        if not target_user:
            raise HTTPException(status_code=404, detail='Пользователь не найден.')

        _assert_manageable_user(access, target_user)

        if payload.is_blocked is not None:
            if target_user.chat_id == access.chat_id and payload.is_blocked:
                raise HTTPException(status_code=400, detail='Нельзя заблокировать собственную учётную запись.')
            target_user.is_blocked = payload.is_blocked

        if payload.is_whitelisted is not None:
            target_user.is_whitelisted = payload.is_whitelisted

        session.commit()
        session.refresh(target_user)
        user_payload = _user_payload(target_user)

    log_bot_event(
        (
            f"Dashboard updated access for {chat_id}: "
            f"blocked={user_payload['is_blocked']}, whitelist={user_payload['is_whitelisted']}"
        ),
        user_id=access.chat_id,
    )

    return user_payload


@app.get('/', include_in_schema=False)
def serve_dashboard_index():
    if not DIST_DIR.exists():
        raise HTTPException(status_code=503, detail='Dashboard ещё не собран.')
    return FileResponse(DIST_DIR / 'index.html')


@app.get('/{full_path:path}', include_in_schema=False)
def serve_dashboard_asset(full_path: str):
    if full_path.startswith('api/'):
        raise HTTPException(status_code=404, detail='Ресурс не найден.')
    if not DIST_DIR.exists():
        raise HTTPException(status_code=503, detail='Dashboard ещё не собран.')

    candidate = (DIST_DIR / full_path).resolve()
    if str(candidate).startswith(str(DIST_DIR.resolve())) and candidate.is_file():
        return FileResponse(candidate)

    return FileResponse(DIST_DIR / 'index.html')
