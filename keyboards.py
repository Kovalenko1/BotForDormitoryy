from telebot import types

from dashboard_links import build_dashboard_link_for_user, build_dashboard_url, is_telegram_webapp_url


BTN_CHAIRMANS = "Председатели"
BTN_ADD_CHAIRMAN = "+ Председатель"
BTN_DELETE_CHAIRMAN = "- Председатель"
BTN_BECOME_CHAIRMAN = "Стать председателем"

BTN_STAROSTAS = "Старосты"
BTN_ADD_STAROSTA = "+ Староста"
BTN_DELETE_STAROSTA = "- Староста"
BTN_BECOME_STAROSTA = "Стать старостой"

BTN_ALL_USERS = "Все жильцы"
BTN_SHOW_USERS = "Жильцы этажа"

BTN_VIEW_SCHEDULE = "График"
BTN_EDIT_SCHEDULE = "Обновить график"
BTN_DELETE_ROOMS = "Убрать из графика"
BTN_NOTIFICATION_TIME = "Время"
BTN_BROADCAST = "Рассылка"
BTN_MESSAGE_LOGS = "Журнал"
BTN_DELIVERY_ERROR_SETTINGS = "Ошибки доставки"
BTN_DELIVERY_ERRORS_ENABLE = "Включить ошибки"
BTN_DELIVERY_ERRORS_DISABLE = "Отключить ошибки"
BTN_DELIVERY_ERRORS_MUTE = "Скрыть пользователя"
BTN_DELIVERY_ERRORS_UNMUTE = "Вернуть пользователя"

BTN_SET_ROOM = "Моя комната"
BTN_REFRESH_BOT = "Обновить бота"
BTN_CANCEL = "Отмена"


def _get_webapp_button(text: str, view: str, chat_id: str | None = None):
    dashboard_url = (
        build_dashboard_link_for_user(chat_id, view=view)
        if chat_id else
        build_dashboard_url(view=view)
    )
    web_app_info = getattr(types, "WebAppInfo", None)

    if not is_telegram_webapp_url(dashboard_url) or web_app_info is None:
        return text

    try:
        return types.KeyboardButton(
            text=text,
            web_app=web_app_info(url=dashboard_url),
        )
    except TypeError:
        return text


def _get_journal_button(chat_id: str | None = None):
    return _get_webapp_button(BTN_MESSAGE_LOGS, "general", chat_id=chat_id)


def _get_schedule_button(chat_id: str | None = None):
    return _get_webapp_button(BTN_VIEW_SCHEDULE, "schedule", chat_id=chat_id)


def get_main_menu(role, chat_id: str | None = None):
    keyboard = types.ReplyKeyboardMarkup(resize_keyboard=True)
    if role in ["admin", "chairman", "starosta", "user"]:
        keyboard.add(_get_schedule_button(chat_id))

    if role in ["admin", "chairman", "starosta", "user"]:
        keyboard.add(BTN_SET_ROOM)
        keyboard.add(BTN_REFRESH_BOT)

    if role == "user":
        keyboard.add(BTN_BECOME_CHAIRMAN)
        keyboard.add(BTN_BECOME_STAROSTA)

    if role == "starosta":
        keyboard.add(BTN_DELIVERY_ERROR_SETTINGS)

    return keyboard


def get_delivery_error_settings_keyboard():
    keyboard = types.ReplyKeyboardMarkup(resize_keyboard=True)
    keyboard.add(BTN_DELIVERY_ERRORS_ENABLE, BTN_DELIVERY_ERRORS_DISABLE)
    keyboard.add(BTN_DELIVERY_ERRORS_MUTE)
    keyboard.add(BTN_DELIVERY_ERRORS_UNMUTE)
    keyboard.add(BTN_CANCEL)
    return keyboard


def get_cancel_keyboard():
    keyboard = types.ReplyKeyboardMarkup(resize_keyboard=True, one_time_keyboard=True)
    keyboard.add(BTN_CANCEL)
    return keyboard
