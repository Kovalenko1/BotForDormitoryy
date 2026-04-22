import telebot

from config import ADMINS_LIST
from database import get_db_session
from models import User, RoleEnum, BotLog
from time_utils import moscow_now
from utils import generate_access_key, cleanup_expired_keys


def handle_add_chairman(bot: telebot.TeleBot, message: telebot.types.Message):
    if message.from_user.id not in ADMINS_LIST:
        bot.send_message(message.chat.id, "У вас нет прав на выполнение этой команды.")
        return

    cleanup_expired_keys()
    key = generate_access_key(RoleEnum.CHAIRMAN)

    bot.send_message(message.chat.id,
                     f"Уникальный ключ для добавления председателя: {key}\n"
                     f"Срок действия 24 часа. Передайте его нужному человеку.")

    with next(get_db_session()) as session:
        session.add(BotLog(
            event=f"Admin {message.from_user.id} generated chairman key {key}",
            timestamp=moscow_now(),
            user_id=str(message.from_user.id)
        ))
        session.commit()


def handle_delete_chairman(bot: telebot.TeleBot, message: telebot.types.Message):
    """
    Сбрасываем роль на user.
    """
    if message.from_user.id not in ADMINS_LIST:
        bot.send_message(message.chat.id, "У вас нет прав на выполнение этой команды.")
        return

    bot.send_message(message.chat.id, "Введите chat_id председателя, которого хотите удалить:")
    bot.register_next_step_handler(message, process_delete_chairman, bot=bot)


def handle_show_chairmans(bot: telebot.TeleBot, message: telebot.types.Message):
    """
    Админ видит всех председателей (role=CHAIRMAN).
    """
    user_chat_id = str(message.from_user.id)
    with next(get_db_session()) as session:
        db_user = session.query(User).filter_by(chat_id=user_chat_id).first()
        if not db_user or db_user.role != RoleEnum.ADMIN:
            bot.send_message(message.chat.id, "У вас нет прав на просмотр председателей.")
            return

        chairmans = session.query(User).filter(User.role == RoleEnum.CHAIRMAN).order_by(User.id).all()

        if not chairmans:
            bot.send_message(message.chat.id, "Нет ни одного председателя в базе.")
            return

        lines = []
        for c in chairmans:
            username_part = f"{c.username}" if c.username else "Нетъ"
            fn = (c.first_name or "").strip()
            ln = (c.last_name or "").strip()
            name_part = (fn + (" " + ln if ln else "")).strip() or "Unknown"

            line = f"{c.chat_id} - {c.room}: {username_part} ({name_part})"
            lines.append(line)

        msg_text = "\n".join(lines)
        bot.send_message(message.chat.id, msg_text)


def process_delete_chairman(message, bot):
    chat_id_to_delete = message.text.strip()
    with next(get_db_session()) as session:
        user = session.query(User).filter(User.chat_id == chat_id_to_delete).first()
        if not user or user.role != RoleEnum.CHAIRMAN:
            bot.send_message(message.chat.id, "Пользователь не найден или не является председателем.")
            return
        user.role = RoleEnum.USER
        session.commit()
    bot.send_message(message.chat.id, "Председатель удалён (роль сброшена до USER).")
