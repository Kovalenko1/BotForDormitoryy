import telebot
from telebot import types
from datetime import date, datetime, timedelta

from database import get_db_session
from models import BotLog, DutyQueue, FloorNotificationSetting, RoleEnum, User
from utils import parse_block, parse_floor, parse_rooms_input


def build_schedule_text(queue_items, floor: int, start_date: date | None = None) -> str:
    if not queue_items:
        return "График дежурств пуст."

    effective_start_date = start_date or date.today()
    lines = [f"Текущий график дежурств для {floor} этажа:"]
    for index, item in enumerate(queue_items):
        duty_date = effective_start_date + timedelta(days=index)
        lines.append(
            f"{item.position}. Блок {item.room} ({duty_date.strftime('%d.%m.%Y')})"
        )

    return "\n".join(lines)


def get_schedule_start_date(session, floor: int) -> date:
    today = date.today()
    floor_setting = session.query(FloorNotificationSetting).filter(
        FloorNotificationSetting.floor == floor
    ).first()
    if floor_setting and floor_setting.last_notified_on == today:
        return today + timedelta(days=1)
    return today


def get_user_with_schedule_access(session, chat_id: str):
    db_user = session.query(User).filter(User.chat_id == chat_id).first()
    if not db_user or db_user.role not in [RoleEnum.USER, RoleEnum.STAROSTA, RoleEnum.CHAIRMAN, RoleEnum.ADMIN]:
        return None
    return db_user


def resolve_target_floor(db_user: User, target_floor: int | None) -> int:
    if db_user.role in [RoleEnum.CHAIRMAN, RoleEnum.ADMIN]:
        if target_floor is None:
            raise ValueError("Введите этаж от 1 до 16.")
        return target_floor

    if not db_user.floor:
        raise ValueError("Сначала укажите свою комнату, чтобы определить этаж.")

    if target_floor is not None and target_floor != db_user.floor:
        raise ValueError("У вас нет прав на управление этим этажом.")

    return db_user.floor


def prompt_schedule_input(bot: telebot.TeleBot, message: telebot.types.Message, floor: int):
    bot.send_message(
        message.chat.id,
        f"Введите блоки для {floor} этажа (например: '1502-1504, 1505А, 1501'): "
    )
    bot.register_next_step_handler(message, process_rooms_input, bot=bot, target_floor=floor)


def prompt_schedule_delete(bot: telebot.TeleBot, message: telebot.types.Message, floor: int):
    bot.send_message(
        message.chat.id,
        f"Введите блоки для удаления из графика {floor} этажа или '.' чтобы очистить весь график: "
    )
    bot.register_next_step_handler(message, process_delete_rooms, bot=bot, target_floor=floor)


def show_schedule_for_floor(bot: telebot.TeleBot, chat_id: int, floor: int):
    with next(get_db_session()) as session:
        queue_items = session.query(DutyQueue).filter(
            DutyQueue.floor == floor
        ).order_by(DutyQueue.position).all()

        if not queue_items:
            bot.send_message(chat_id, f"График дежурств для {floor} этажа пуст.")
            return

        schedule_start_date = get_schedule_start_date(session, floor)

    bot.send_message(chat_id, build_schedule_text(queue_items, floor, start_date=schedule_start_date))


def handle_view_duty_schedule(bot: telebot.TeleBot, message: telebot.types.Message):
    with next(get_db_session()) as session:
        db_user = get_user_with_schedule_access(session, str(message.from_user.id))
        if not db_user:
            bot.send_message(message.chat.id, "У вас нет прав на просмотр графика дежурств.")
            return

        if db_user.role in [RoleEnum.CHAIRMAN, RoleEnum.ADMIN]:
            bot.send_message(message.chat.id, "Введите этаж для просмотра графика.")
            bot.register_next_step_handler(message, process_view_schedule_floor, bot=bot)
            return

        if not db_user.floor:
            bot.send_message(message.chat.id, "Сначала укажите свою комнату, чтобы определить этаж.")
            return

    show_schedule_for_floor(bot, message.chat.id, db_user.floor)


def process_view_schedule_floor(message, bot: telebot.TeleBot):
    with next(get_db_session()) as session:
        db_user = get_user_with_schedule_access(session, str(message.from_user.id))
        if not db_user or db_user.role not in [RoleEnum.CHAIRMAN, RoleEnum.ADMIN]:
            bot.send_message(message.chat.id, "У вас нет прав на просмотр графика этого этажа.")
            return

    try:
        target_floor = parse_floor(message.text)
    except ValueError as error:
        bot.send_message(message.chat.id, str(error))
        return

    show_schedule_for_floor(bot, message.chat.id, target_floor)


def handle_add_rooms(bot: telebot.TeleBot, message: telebot.types.Message):
    with next(get_db_session()) as session:
        db_user = session.query(User).filter(User.chat_id == str(message.from_user.id)).first()
        if not db_user or db_user.role not in [RoleEnum.STAROSTA, RoleEnum.CHAIRMAN, RoleEnum.ADMIN]:
            bot.send_message(message.chat.id, "У вас нет прав на выполнение этой команды.")
            return

        if db_user.role in [RoleEnum.CHAIRMAN, RoleEnum.ADMIN]:
            bot.send_message(message.chat.id, "Введите этаж для обновления графика.")
            bot.register_next_step_handler(message, process_add_schedule_floor, bot=bot)
            return

        if not db_user.floor:
            bot.send_message(message.chat.id, "Сначала укажите свою комнату, чтобы определить этаж.")
            return

    prompt_schedule_input(bot, message, db_user.floor)


def process_add_schedule_floor(message, bot: telebot.TeleBot):
    with next(get_db_session()) as session:
        db_user = session.query(User).filter(User.chat_id == str(message.from_user.id)).first()
        if not db_user or db_user.role not in [RoleEnum.CHAIRMAN, RoleEnum.ADMIN]:
            bot.send_message(message.chat.id, "У вас нет прав на выполнение этой команды.")
            return

    try:
        target_floor = parse_floor(message.text)
    except ValueError as error:
        bot.send_message(message.chat.id, str(error))
        return

    prompt_schedule_input(bot, message, target_floor)


def process_rooms_input(message, bot: telebot.TeleBot, target_floor: int | None = None):
    rooms_text = message.text.strip()

    try:
        blocks = parse_rooms_input(rooms_text)
    except ValueError as error:
        bot.send_message(message.chat.id, str(error))
        return

    if not blocks:
        bot.send_message(message.chat.id, "Список блоков пуст.")
        return

    user_chat_id = str(message.from_user.id)

    with next(get_db_session()) as session:
        db_user = session.query(User).filter(User.chat_id == user_chat_id).first()
        if not db_user:
            bot.send_message(message.chat.id, "Ошибка: не найден пользователь.")
            return

        try:
            user_floor = resolve_target_floor(db_user, target_floor)
        except ValueError as error:
            bot.send_message(message.chat.id, str(error))
            return

        session.query(DutyQueue).filter(
            DutyQueue.floor == user_floor
        ).delete()
        session.commit()

        valid_blocks = []
        invalid_blocks = []

        position_counter = 1
        for block in blocks:
            normalized_block, floor_of_block = parse_block(block)

            if floor_of_block == user_floor:
                session.add(DutyQueue(
                    room=normalized_block,
                    position=position_counter,
                    wing="",
                    floor=user_floor
                ))
                position_counter += 1
                valid_blocks.append(normalized_block)
            else:
                invalid_blocks.append(normalized_block)

        # Reset cycle start so position 1 is on duty today
        floor_setting = session.query(FloorNotificationSetting).filter(
            FloorNotificationSetting.floor == user_floor
        ).first()
        if floor_setting:
            floor_setting.last_notified_on = None

        session.commit()

    with next(get_db_session()) as session:
        updated_queue = session.query(DutyQueue).filter(
            DutyQueue.floor == user_floor
        ).order_by(DutyQueue.position).all()

    msg_parts = []
    if valid_blocks:
        msg_parts.append(
            f"Добавлены блоки (этаж {user_floor}): {', '.join(valid_blocks)}."
        )
    if invalid_blocks:
        msg_parts.append(
            f"Эти блоки не относятся к выбранному этажу и не были добавлены: {', '.join(invalid_blocks)}."
        )
    if not msg_parts:
        msg_parts = ["Никакие блоки не были добавлены."]

    msg_parts.append("")
    msg_parts.append(build_schedule_text(updated_queue, user_floor, start_date=date.today()))

    bot.send_message(message.chat.id, "\n".join(msg_parts))


def handle_delete_room(bot: telebot.TeleBot, message: telebot.types.Message):
    with next(get_db_session()) as session:
        db_user = session.query(User).filter(User.chat_id == str(message.from_user.id)).first()
        if not db_user or db_user.role not in [RoleEnum.STAROSTA, RoleEnum.CHAIRMAN, RoleEnum.ADMIN]:
            bot.send_message(message.chat.id, "У вас нет прав на выполнение этой команды.")
            return

        if db_user.role in [RoleEnum.CHAIRMAN, RoleEnum.ADMIN]:
            bot.send_message(message.chat.id, "Введите этаж для изменения графика.")
            bot.register_next_step_handler(message, process_delete_schedule_floor, bot=bot)
            return

        if not db_user.floor:
            bot.send_message(message.chat.id, "Сначала укажите свою комнату, чтобы определить этаж.")
            return

    prompt_schedule_delete(bot, message, db_user.floor)


def process_delete_schedule_floor(message, bot: telebot.TeleBot):
    with next(get_db_session()) as session:
        db_user = session.query(User).filter(User.chat_id == str(message.from_user.id)).first()
        if not db_user or db_user.role not in [RoleEnum.CHAIRMAN, RoleEnum.ADMIN]:
            bot.send_message(message.chat.id, "У вас нет прав на выполнение этой команды.")
            return

    try:
        target_floor = parse_floor(message.text)
    except ValueError as error:
        bot.send_message(message.chat.id, str(error))
        return

    prompt_schedule_delete(bot, message, target_floor)


def process_delete_rooms(message, bot: telebot.TeleBot, target_floor: int | None = None):
    rooms_text = message.text.strip()

    user_chat_id = str(message.from_user.id)

    with next(get_db_session()) as session:
        db_user = session.query(User).filter(User.chat_id == user_chat_id).first()
        if not db_user:
            bot.send_message(message.chat.id, "Ошибка: не найден пользователь.")
            return

        try:
            user_floor = resolve_target_floor(db_user, target_floor)
        except ValueError as error:
            bot.send_message(message.chat.id, str(error))
            return

        if rooms_text == ".":
            deleted_count = session.query(DutyQueue).filter(
                DutyQueue.floor == user_floor
            ).delete()
            session.commit()
            bot.send_message(
                message.chat.id,
                f"График для {user_floor} этажа очищен. Удалено записей: {deleted_count}.\n\nГрафик дежурств пуст."
            )
            return

        try:
            blocks = parse_rooms_input(rooms_text)
        except ValueError as error:
            bot.send_message(message.chat.id, str(error))
            return

        if not blocks:
            bot.send_message(message.chat.id, "Список блоков пуст.")
            return

        deleted_blocks = []
        not_found_blocks = []
        denied_blocks = []

        for block in blocks:
            normalized_block, floor_of_room = parse_block(block)
            if floor_of_room != user_floor:
                denied_blocks.append(normalized_block)
                continue

            dq_list = session.query(DutyQueue).filter(
                DutyQueue.room == normalized_block,
                DutyQueue.floor == user_floor
            ).all()

            if not dq_list:
                not_found_blocks.append(normalized_block)
            else:
                for d in dq_list:
                    session.delete(d)
                deleted_blocks.append(normalized_block)

        session.commit()

        reorder_after_delete(session, user_floor)

        updated_queue = session.query(DutyQueue).filter(
            DutyQueue.floor == user_floor
        ).order_by(DutyQueue.position).all()

    msg_parts = []
    if deleted_blocks:
        msg_parts.append(f"Удалены блоки: {', '.join(deleted_blocks)}.")
    if not_found_blocks:
        msg_parts.append(f"Не найдены в очереди: {', '.join(not_found_blocks)}.")
    if denied_blocks:
        msg_parts.append(f"Блоки не относятся к выбранному этажу: {', '.join(denied_blocks)}.")

    if not msg_parts:
        msg_parts = ["Ничего не удалено."]

    msg_parts.append("")
    msg_parts.append(build_schedule_text(updated_queue, user_floor, start_date=date.today()))

    bot.send_message(message.chat.id, "\n".join(msg_parts))


def reorder_after_delete(session, floor):
    """
    Переупорядочиваем позиции только в очереди конкретного этажа.
    """
    all_rooms = session.query(DutyQueue).filter(
        DutyQueue.floor == floor
    ).order_by(DutyQueue.position).all()

    for i, room in enumerate(all_rooms, start=1):
        room.position = i
    session.commit()


def handle_show_users(bot: telebot.TeleBot, message: telebot.types.Message):
    """
        Староста видит только пользователей своего этажа.
    Формат строки:
      chat_id - room: @username (first_name [last_name])
    """
    user_chat_id = str(message.from_user.id)

    with next(get_db_session()) as session:
        db_user = session.query(User).filter(User.chat_id == user_chat_id).first()
        if not db_user or db_user.role not in [RoleEnum.STAROSTA, RoleEnum.CHAIRMAN, RoleEnum.ADMIN]:
            bot.send_message(message.chat.id, "У вас нет прав на выполнение этой команды.")
            return

        user_floor = db_user.floor
        if not user_floor:
            bot.send_message(message.chat.id, "Сначала укажите свою комнату, чтобы определить этаж.")
            return

        users_list = session.query(User).filter(
            User.floor == user_floor
        ).order_by(User.room, User.chat_id).all()

        if not users_list:
            bot.send_message(message.chat.id, "У вас нет зарегистрированных пользователей на вашем этаже.")
            return

        lines = []
        for u in users_list:
            username_part = f"{u.username}" if u.username else "Нетъ"
            fn = (u.first_name or "").strip()
            ln = (u.last_name or "").strip()
            name_part = (fn + (" " + ln if ln else "")).strip()
            if not name_part:
                name_part = "Unknown"

            line = f"{u.chat_id} - {u.room}: {username_part} ({name_part})"
            lines.append(line)

        result_text = "\n".join(lines)

        bot.send_message(message.chat.id, result_text)
