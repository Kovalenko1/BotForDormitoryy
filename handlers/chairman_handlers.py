import telebot
from telebot import types
from datetime import datetime

from database import get_db_session
from models import User, RoleEnum, BotLog
from utils import generate_access_key, cleanup_expired_keys
from config import ADMINS_LIST


def handle_delete_starosta_by_chairman(bot: telebot.TeleBot, message: telebot.types.Message):
    """
    Председатель тоже может удалять старост.
    """
    with next(get_db_session()) as session:
        db_user = session.query(User).filter(User.chat_id == str(message.from_user.id)).first()
        if not db_user or db_user.role not in [RoleEnum.CHAIRMAN, RoleEnum.ADMIN]:
            bot.send_message(message.chat.id, "У вас нет прав на выполнение этой команды.")
            return

    bot.send_message(message.chat.id, "Введите chat_id старосты, которого хотите удалить:")
    bot.register_next_step_handler(message, process_delete_starosta, bot=bot)


def handle_add_starosta(bot: telebot.TeleBot, message: telebot.types.Message):
    with next(get_db_session()) as session:
        db_user = session.query(User).filter(User.chat_id == str(message.from_user.id)).first()
        if not db_user or db_user.role not in [RoleEnum.CHAIRMAN, RoleEnum.ADMIN]:
            bot.send_message(message.chat.id, "У вас нет прав на выполнение этой команды.")
            return

    cleanup_expired_keys()
    key = generate_access_key(RoleEnum.STAROSTA)

    bot.send_message(message.chat.id,
                     f"Уникальный ключ для добавления старосты: {key}\n"
                     f"Срок действия 24 часа.")


def handle_show_all_users(bot: telebot.TeleBot, message: telebot.types.Message):
    """
    Председатель видит список всех пользователей.
    Формат:
      chat_id - room: @username (FirstName LastName)
    """
    user_chat_id = str(message.from_user.id)

    with next(get_db_session()) as session:
        db_user = session.query(User).filter_by(chat_id=user_chat_id).first()
        if not db_user or db_user.role not in [RoleEnum.CHAIRMAN, RoleEnum.ADMIN]:
            bot.send_message(message.chat.id, "У вас нет прав на просмотр всех пользователей.")
            return

        all_users = session.query(User).order_by(User.floor, User.wing, User.room).all()

        if not all_users:
            bot.send_message(message.chat.id, "В базе нет ни одного пользователя.")
            return

        lines = []
        for u in all_users:
            username_part = f"{u.username}" if u.username else "Нетъ"

            fn = (u.first_name or "").strip()
            ln = (u.last_name or "").strip()
            name_part = (fn + (" " + ln if ln else "")).strip()
            if not name_part:
                name_part = "Unknown"

            line = f"{u.chat_id} - {u.room}: {username_part} ({name_part})"
            lines.append(line)

        msg_text = "\n".join(lines)
        bot.send_message(message.chat.id, msg_text)


def handle_show_starostas(bot: telebot.TeleBot, message: telebot.types.Message):
    """
    Председатель видит всех старост.
    """
    user_chat_id = str(message.from_user.id)

    with next(get_db_session()) as session:
        db_user = session.query(User).filter_by(chat_id=user_chat_id).first()
        if not db_user or db_user.role not in [RoleEnum.CHAIRMAN, RoleEnum.ADMIN]:
            bot.send_message(message.chat.id, "У вас нет прав на просмотр старост.")
            return

        starostas = session.query(User).filter(User.role == RoleEnum.STAROSTA).order_by(User.floor, User.wing,
                                                                                        User.room).all()

        if not starostas:
            bot.send_message(message.chat.id, "Нет ни одного старосты в базе.")
            return

        lines = []
        for s in starostas:
            username_part = f"{s.username}" if s.username else "Нетъ"
            fn = (s.first_name or "").strip()
            ln = (s.last_name or "").strip()
            name_part = (fn + (" " + ln if ln else "")).strip() or "Unknown"

            line = f"{s.chat_id} - {s.room}: {username_part} ({name_part})"
            lines.append(line)

        msg_text = "\n".join(lines)
        bot.send_message(message.chat.id, msg_text)


def process_delete_starosta(message, bot):
    chat_id_to_delete = message.text.strip()
    with next(get_db_session()) as session:
        user = session.query(User).filter(User.chat_id == chat_id_to_delete).first()
        if not user or user.role != RoleEnum.STAROSTA:
            bot.send_message(message.chat.id, "Пользователь не найден или не является старостой.")
            return
        user.role = RoleEnum.USER
        session.commit()
    bot.send_message(message.chat.id, "Староста удалён (роль сброшена до USER).")
