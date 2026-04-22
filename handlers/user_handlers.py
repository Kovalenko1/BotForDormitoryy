import telebot
from datetime import datetime
from keyboards import get_main_menu
from database import get_db_session
from models import User, RoleEnum
from utils import validate_access_key, deactivate_key, parse_room


def handle_set_room(bot: telebot.TeleBot, message: telebot.types.Message):
    bot.send_message(message.chat.id, "Введите номер вашей комнаты в формате 1513А или 913Б:")
    bot.register_next_step_handler(message, save_user_room, bot=bot)


def save_user_room(message, bot: telebot.TeleBot):
    room_number = message.text.strip()
    user_chat_id = str(message.from_user.id)

    try:
        normalized_room, _, floor = parse_room(room_number)
    except ValueError as error:
        bot.send_message(message.chat.id, str(error))
        return

    with next(get_db_session()) as session:
        db_user = session.query(User).filter(User.chat_id == user_chat_id).first()
        if not db_user:
            db_user = User(chat_id=user_chat_id, role=RoleEnum.USER)
            session.add(db_user)
        db_user.room = normalized_room
        db_user.wing = ""
        db_user.floor = floor
        session.commit()

    bot.send_message(message.chat.id, f"Номер вашей комнаты сохранён/обновлён: {normalized_room}")


def handle_become_chairman(bot: telebot.TeleBot, message: telebot.types.Message):
    bot.send_message(message.chat.id, "Введите ключ для становления председателем:")
    bot.register_next_step_handler(message, process_become_chairman, bot=bot)


def process_become_chairman(message, bot: telebot.TeleBot):
    key_value = message.text.strip()
    user_chat_id = str(message.from_user.id)

    role = validate_access_key(key_value)
    if role == RoleEnum.CHAIRMAN:
        with next(get_db_session()) as session:
            db_user = session.query(User).filter(User.chat_id == user_chat_id).first()
            if not db_user:
                db_user = User(chat_id=user_chat_id, role=RoleEnum.CHAIRMAN)
                session.add(db_user)
            else:
                db_user.role = RoleEnum.CHAIRMAN
            session.commit()
        deactivate_key(key_value)
        bot.send_message(message.chat.id, "Поздравляем! Вы стали председателем.", reply_markup=get_main_menu("chairman"))
    else:
        bot.send_message(message.chat.id, "Неверный или просроченный ключ.")


def handle_become_starosta(bot: telebot.TeleBot, message: telebot.types.Message):
    bot.send_message(message.chat.id, "Введите ключ для становления старостой:")
    bot.register_next_step_handler(message, process_become_starosta, bot=bot)


def process_become_starosta(message, bot: telebot.TeleBot):
    key_value = message.text.strip()
    user_chat_id = str(message.from_user.id)

    role = validate_access_key(key_value)
    if role == RoleEnum.STAROSTA:
        with next(get_db_session()) as session:
            db_user = session.query(User).filter(User.chat_id == user_chat_id).first()
            if not db_user or not db_user.floor or not db_user.room:
                bot.send_message(message.chat.id, "Сначала укажите свою комнату, чтобы определить этаж.")
                return

            existing_starosta = session.query(User).filter(
                User.role == RoleEnum.STAROSTA,
                User.floor == db_user.floor,
                User.chat_id != user_chat_id
            ).first()
            if existing_starosta:
                bot.send_message(message.chat.id, f"На {db_user.floor} этаже уже назначен староста.")
                return

            db_user.role = RoleEnum.STAROSTA
            session.commit()
        deactivate_key(key_value)
        bot.send_message(message.chat.id, "Поздравляем! Вы стали старостой.", reply_markup=get_main_menu("starosta"))
    else:
        bot.send_message(message.chat.id, "Неверный или просроченный ключ.")
