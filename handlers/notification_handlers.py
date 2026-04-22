import telebot

from config import NOTIFICATION_HOUR, NOTIFICATION_MINUTE
from database import get_db_session
from models import FloorNotificationSetting, RoleEnum, User
from utils import (
    format_notification_time,
    parse_block,
    parse_floor,
    parse_notification_time,
    parse_room,
)


def get_or_create_floor_setting(session, floor: int) -> FloorNotificationSetting:
    setting = session.query(FloorNotificationSetting).filter(
        FloorNotificationSetting.floor == floor
    ).first()
    if setting:
        return setting

    setting = FloorNotificationSetting(
        floor=floor,
        notification_hour=NOTIFICATION_HOUR,
        notification_minute=NOTIFICATION_MINUTE,
    )
    session.add(setting)
    session.commit()
    session.refresh(setting)
    return setting


def handle_manage_notification_time(bot: telebot.TeleBot, message: telebot.types.Message):
    user_chat_id = str(message.from_user.id)

    with next(get_db_session()) as session:
        db_user = session.query(User).filter(User.chat_id == user_chat_id).first()
        if not db_user or db_user.role not in [RoleEnum.STAROSTA, RoleEnum.CHAIRMAN, RoleEnum.ADMIN]:
            bot.send_message(message.chat.id, "У вас нет прав на изменение времени оповещений.")
            return

        if db_user.role == RoleEnum.STAROSTA:
            if not db_user.floor:
                bot.send_message(message.chat.id, "Сначала укажите свою комнату, чтобы определить этаж.")
                return

            setting = get_or_create_floor_setting(session, db_user.floor)
            bot.send_message(
                message.chat.id,
                f"Текущее время для {db_user.floor} этажа: "
                f"{format_notification_time(setting.notification_hour, setting.notification_minute)}.\n"
                f"Введите новое время в формате ЧЧ:ММ."
            )
            bot.register_next_step_handler(
                message,
                process_set_own_floor_notification_time,
                bot=bot,
                floor=db_user.floor,
            )
            return

    bot.send_message(message.chat.id, "Введите этаж и время в формате '15 20:30'.")
    bot.register_next_step_handler(message, process_set_any_floor_notification_time, bot=bot)


def process_set_own_floor_notification_time(message, bot: telebot.TeleBot, floor: int):
    try:
        hour, minute = parse_notification_time(message.text)
    except ValueError as error:
        bot.send_message(message.chat.id, str(error))
        return

    with next(get_db_session()) as session:
        setting = get_or_create_floor_setting(session, floor)
        setting.notification_hour = hour
        setting.notification_minute = minute
        session.commit()

    bot.send_message(
        message.chat.id,
        f"Время оповещений для {floor} этажа установлено на {format_notification_time(hour, minute)}."
    )


def process_set_any_floor_notification_time(message, bot: telebot.TeleBot):
    parts = message.text.strip().split(maxsplit=1)
    if len(parts) != 2:
        bot.send_message(message.chat.id, "Используйте формат: этаж и время, например '15 20:30'.")
        return

    try:
        floor = parse_floor(parts[0])
        hour, minute = parse_notification_time(parts[1])
    except ValueError as error:
        bot.send_message(message.chat.id, str(error))
        return

    with next(get_db_session()) as session:
        setting = get_or_create_floor_setting(session, floor)
        setting.notification_hour = hour
        setting.notification_minute = minute
        session.commit()

    bot.send_message(
        message.chat.id,
        f"Время оповещений для {floor} этажа установлено на {format_notification_time(hour, minute)}."
    )


def handle_broadcast_message(bot: telebot.TeleBot, message: telebot.types.Message):
    user_chat_id = str(message.from_user.id)

    with next(get_db_session()) as session:
        db_user = session.query(User).filter(User.chat_id == user_chat_id).first()
        if not db_user or db_user.role not in [RoleEnum.STAROSTA, RoleEnum.CHAIRMAN, RoleEnum.ADMIN]:
            bot.send_message(message.chat.id, "У вас нет прав на рассылку сообщений.")
            return

        if db_user.role == RoleEnum.STAROSTA:
            if not db_user.floor:
                bot.send_message(message.chat.id, "Сначала укажите свою комнату, чтобы определить этаж.")
                return

            bot.send_message(
                message.chat.id,
                "Введите цель рассылки в пределах вашего этажа: 'этаж', блок вроде 1502 или комнату вроде 1502А."
            )
            bot.register_next_step_handler(
                message,
                process_starosta_broadcast_target,
                bot=bot,
                sender_chat_id=user_chat_id,
                own_floor=db_user.floor,
            )
            return

    bot.send_message(
        message.chat.id,
        "Введите цель рассылки: 'all', этаж 1-16, блок вроде 1502 или комнату вроде 1502А."
    )
    bot.register_next_step_handler(message, process_broadcast_target, bot=bot, sender_chat_id=user_chat_id)


def process_starosta_broadcast_target(message, bot: telebot.TeleBot, sender_chat_id: str, own_floor: int):
    try:
        target = parse_broadcast_target(message.text, restrict_floor=own_floor, allow_all=False)
    except ValueError as error:
        bot.send_message(message.chat.id, str(error))
        return

    bot.send_message(message.chat.id, f"Введите текст рассылки для {describe_broadcast_target(target)}.")
    bot.register_next_step_handler(
        message,
        process_broadcast_message,
        bot=bot,
        sender_chat_id=sender_chat_id,
        target=target,
    )


def process_broadcast_target(message, bot: telebot.TeleBot, sender_chat_id: str):
    try:
        target = parse_broadcast_target(message.text, restrict_floor=None, allow_all=True)
    except ValueError as error:
        bot.send_message(message.chat.id, str(error))
        return

    bot.send_message(message.chat.id, f"Введите текст рассылки для {describe_broadcast_target(target)}.")
    bot.register_next_step_handler(
        message,
        process_broadcast_message,
        bot=bot,
        sender_chat_id=sender_chat_id,
        target=target,
    )


def parse_broadcast_target(target_text: str, restrict_floor: int | None, allow_all: bool):
    normalized = target_text.strip()
    lowered = normalized.lower()

    if allow_all and lowered == 'all':
        return {'scope': 'all'}

    if lowered == 'этаж':
        if restrict_floor is None:
            raise ValueError("Для рассылки по этажу укажите номер этажа.")
        return {'scope': 'floor', 'floor': restrict_floor}

    try:
        room, block, floor = parse_room(normalized)
        if restrict_floor is not None and floor != restrict_floor:
            raise ValueError("Можно рассылать сообщения только в пределах своего этажа.")
        return {'scope': 'room', 'room': room}
    except ValueError:
        pass

    try:
        block, floor = parse_block(normalized)
        if restrict_floor is not None and floor != restrict_floor:
            raise ValueError("Можно рассылать сообщения только в пределах своего этажа.")
        return {'scope': 'block', 'block': block}
    except ValueError:
        pass

    if normalized.isdigit():
        floor = parse_floor(normalized)
        if restrict_floor is not None and floor != restrict_floor:
            raise ValueError("Можно рассылать сообщения только в пределах своего этажа.")
        return {'scope': 'floor', 'floor': floor}

    raise ValueError(
        "Неверная цель рассылки. Используйте 'all', этаж 1-16, блок вроде 1502 или комнату вроде 1502А."
    )


def describe_broadcast_target(target: dict) -> str:
    scope = target['scope']
    if scope == 'all':
        return 'всех пользователей'
    if scope == 'floor':
        return f"{target['floor']} этажа"
    if scope == 'block':
        return f"блока {target['block']}"
    return f"комнаты {target['room']}"


def process_broadcast_message(message, bot: telebot.TeleBot, sender_chat_id: str, target: dict):
    text = message.text.strip()
    if not text:
        bot.send_message(message.chat.id, "Сообщение не должно быть пустым.")
        return

    with next(get_db_session()) as session:
        recipients_query = session.query(User).filter(
            User.chat_id != sender_chat_id,
            User.chat_id.isnot(None),
        )

        scope = target['scope']
        if scope == 'floor':
            recipients_query = recipients_query.filter(User.floor == target['floor'])
        elif scope == 'block':
            recipients_query = recipients_query.filter(User.room.like(f"{target['block']}%"))
        elif scope == 'room':
            recipients_query = recipients_query.filter(User.room == target['room'])

        recipients = recipients_query.order_by(User.room, User.chat_id).all()

    if not recipients:
        bot.send_message(message.chat.id, f"Нет получателей для рассылки для {describe_broadcast_target(target)}.")
        return

    sent_count = 0
    failed_count = 0
    for recipient in recipients:
        try:
            bot.send_message(
                int(recipient.chat_id),
                text,
                sender_chat_id=sender_chat_id,
                category='broadcast',
            )
            sent_count += 1
        except Exception:
            failed_count += 1

    bot.send_message(
        message.chat.id,
        f"Рассылка для {describe_broadcast_target(target)} завершена. Отправлено: {sent_count}, ошибок: {failed_count}."
    )