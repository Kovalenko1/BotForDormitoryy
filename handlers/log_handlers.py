import telebot
from telebot import types

from dashboard_links import build_dashboard_link_for_user, is_telegram_webapp_url
from database import get_db_session
from models import RoleEnum, User


def handle_view_message_logs(bot: telebot.TeleBot, message: telebot.types.Message):
    user_chat_id = str(message.from_user.id)

    with next(get_db_session()) as session:
        db_user = session.query(User).filter(User.chat_id == user_chat_id).first()
        if not db_user or db_user.role not in [RoleEnum.STAROSTA, RoleEnum.CHAIRMAN, RoleEnum.ADMIN]:
            bot.send_message(message.chat.id, "У вас нет прав на просмотр журналов сообщений.")
            return

        if db_user.role == RoleEnum.STAROSTA and not db_user.floor:
            bot.send_message(message.chat.id, "Сначала укажите свою комнату, чтобы определить этаж.")
            return

    dashboard_url = build_dashboard_link_for_user(user_chat_id, view='general')
    if not dashboard_url:
        bot.send_message(
            message.chat.id,
            "Не удалось получить ссылку на dashboard. Попробуйте ещё раз через несколько секунд.",
            skip_audit=True,
        )
        return

    if not is_telegram_webapp_url(dashboard_url):
        bot.send_message(
            message.chat.id,
            f"Локальная ссылка на dashboard:\n{dashboard_url}",
            skip_audit=True,
        )
        return

    keyboard = types.InlineKeyboardMarkup()
    web_app_info = getattr(types, 'WebAppInfo', None)

    if web_app_info is not None:
        keyboard.add(
            types.InlineKeyboardButton(
                text='Открыть dashboard',
                web_app=web_app_info(url=dashboard_url),
            )
        )
    else:
        keyboard.add(types.InlineKeyboardButton(text='Открыть dashboard', url=dashboard_url))

    bot.send_message(
        message.chat.id,
        "Журнал перенесён в dashboard. Откройте его кнопкой ниже.",
        reply_markup=keyboard,
        skip_audit=True,
    )
