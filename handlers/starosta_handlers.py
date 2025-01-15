import telebot
from telebot import types
from datetime import datetime

from database import get_db_session
from models import User, RoleEnum, DutyQueue, BotLog
from config import ADMINS_LIST
from utils import parse_rooms_input, determine_wing_and_floor


def handle_view_duty_schedule(bot: telebot.TeleBot, message: telebot.types.Message):
    with next(get_db_session()) as session:
        db_user = session.query(User).filter(User.chat_id == str(message.from_user.id)).first()
        if not db_user or db_user.role not in [RoleEnum.STAROSTA, RoleEnum.CHAIRMAN, RoleEnum.ADMIN]:
            bot.send_message(message.chat.id, "У вас нет прав на просмотр графика дежурств.")
            return


        queue_items = session.query(DutyQueue).filter(
            DutyQueue.wing == db_user.wing,
            DutyQueue.floor == db_user.floor
        ).order_by(DutyQueue.position).all()

        if not queue_items:
            bot.send_message(message.chat.id, "График дежурств пуст.")
            return

        text = "Текущий график дежурств:\n"
        for item in queue_items:
            text += f"{item.position}. Комната {item.room} ({item.floor} этаж, {item.wing} крыло)\n"

        bot.send_message(message.chat.id, text)


def handle_add_rooms(bot: telebot.TeleBot, message: telebot.types.Message):
    with next(get_db_session()) as session:
        db_user = session.query(User).filter(User.chat_id == str(message.from_user.id)).first()
        if not db_user or db_user.role not in [RoleEnum.STAROSTA, RoleEnum.CHAIRMAN, RoleEnum.ADMIN]:
            bot.send_message(message.chat.id, "У вас нет прав на выполнение этой команды.")
            return

    bot.send_message(
        message.chat.id,
        "Введите номера комнат для добавления/перезаписи (например: '201, 202-205, 208'): "
    )
    bot.register_next_step_handler(message, process_rooms_input, bot=bot)


def process_rooms_input(message, bot: telebot.TeleBot):
    rooms_text = message.text.strip()
    rooms = parse_rooms_input(rooms_text)
    user_chat_id = str(message.from_user.id)

    with next(get_db_session()) as session:
        db_user = session.query(User).filter(User.chat_id == user_chat_id).first()
        if not db_user:
            bot.send_message(message.chat.id, "Ошибка: не найден пользователь.")
            return

        user_floor = db_user.floor
        user_wing = db_user.wing

        session.query(DutyQueue).filter(
            DutyQueue.floor == user_floor,
            DutyQueue.wing == user_wing
        ).delete()
        session.commit()

        valid_rooms = []
        invalid_rooms = []

        position_counter = 1
        for room in rooms:
            wing_of_room, floor_of_room = determine_wing_and_floor(room)

            if wing_of_room == user_wing and floor_of_room == user_floor:
                session.add(DutyQueue(
                    room=room,
                    position=position_counter,
                    wing=user_wing,
                    floor=user_floor
                ))
                position_counter += 1
                valid_rooms.append(room)
            else:
                invalid_rooms.append(room)

        session.commit()

    msg_parts = []
    if valid_rooms:
        msg_parts.append(
            f"Добавлены комнаты (этаж {user_floor}, крыло {user_wing}): {', '.join(valid_rooms)}."
        )
    if invalid_rooms:
        msg_parts.append(
            f"Эти комнаты не относятся к вашему этажу/крылу и не были добавлены: {', '.join(invalid_rooms)}."
        )
    if not msg_parts:
        msg_parts = ["Никакие комнаты не были добавлены."]

    bot.send_message(message.chat.id, "\n".join(msg_parts))


def handle_delete_room(bot: telebot.TeleBot, message: telebot.types.Message):
    with next(get_db_session()) as session:
        db_user = session.query(User).filter(User.chat_id == str(message.from_user.id)).first()
        if not db_user or db_user.role not in [RoleEnum.STAROSTA, RoleEnum.CHAIRMAN, RoleEnum.ADMIN]:
            bot.send_message(message.chat.id, "У вас нет прав на выполнение этой команды.")
            return

    bot.send_message(
        message.chat.id,
        "Введите номера комнат для удаления (например: '201,202,203-205'): "
    )
    bot.register_next_step_handler(message, process_delete_rooms, bot=bot)


def process_delete_rooms(message, bot: telebot.TeleBot):
    rooms_text = message.text.strip()
    rooms = parse_rooms_input(rooms_text)

    user_chat_id = str(message.from_user.id)

    with next(get_db_session()) as session:
        db_user = session.query(User).filter(User.chat_id == user_chat_id).first()
        if not db_user:
            bot.send_message(message.chat.id, "Ошибка: не найден пользователь.")
            return

        user_floor = db_user.floor
        user_wing = db_user.wing

        deleted_rooms = []
        not_found_rooms = []
        denied_rooms = []

        for room in rooms:
            wing_of_room, floor_of_room = determine_wing_and_floor(room)
            if wing_of_room != user_wing or floor_of_room != user_floor:
                denied_rooms.append(room)
                continue

            dq_list = session.query(DutyQueue).filter(
                DutyQueue.room == room,
                DutyQueue.floor == user_floor,
                DutyQueue.wing == user_wing
            ).all()

            if not dq_list:
                not_found_rooms.append(room)
            else:
                for d in dq_list:
                    session.delete(d)
                deleted_rooms.append(room)

        session.commit()

        reorder_after_delete(session, user_floor, user_wing)

    msg_parts = []
    if deleted_rooms:
        msg_parts.append(f"Удалены комнаты: {', '.join(deleted_rooms)}.")
    if not_found_rooms:
        msg_parts.append(f"Не найдены в очереди: {', '.join(not_found_rooms)}.")
    if denied_rooms:
        msg_parts.append(f"Комнаты не относятся к вашему этажу/крылу: {', '.join(denied_rooms)}.")

    if not msg_parts:
        msg_parts = ["Ничего не удалено."]

    bot.send_message(message.chat.id, "\n".join(msg_parts))


def reorder_after_delete(session, floor, wing):
    """
    Переупорядочиваем позиции (position) только в очереди (wing, floor).
    """
    all_rooms = session.query(DutyQueue).filter(
        DutyQueue.floor == floor,
        DutyQueue.wing == wing
    ).order_by(DutyQueue.position).all()

    for i, room in enumerate(all_rooms, start=1):
        room.position = i
    session.commit()


def handle_show_users(bot: telebot.TeleBot, message: telebot.types.Message):
    """
    Староста видит только пользователей своего этажа и крыла (db_user.floor, db_user.wing).
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
        user_wing = db_user.wing

        users_list = session.query(User).filter(
            User.floor == user_floor,
            User.wing == user_wing
        ).order_by(User.room, User.chat_id).all()

        if not users_list:
            bot.send_message(message.chat.id, "У вас нет зарегистрированных пользователей на вашем этаже/крыле.")
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
