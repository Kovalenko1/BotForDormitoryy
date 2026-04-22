from telebot import types


BTN_CHAIRMANS = "Председатели"
BTN_ADD_CHAIRMAN = "+ Председатель"
BTN_DELETE_CHAIRMAN = "- Председатель"
BTN_BECOME_CHAIRMAN = "Стать пред."

BTN_STAROSTAS = "Старосты"
BTN_ADD_STAROSTA = "+ Староста"
BTN_DELETE_STAROSTA = "- Староста"
BTN_BECOME_STAROSTA = "Стать стар."

BTN_ALL_USERS = "Все жильцы"
BTN_SHOW_USERS = "Жильцы этажа"

BTN_VIEW_SCHEDULE = "График"
BTN_EDIT_SCHEDULE = "Обновить график"
BTN_DELETE_ROOMS = "Убрать из графика"
BTN_NOTIFICATION_TIME = "Время"
BTN_BROADCAST = "Рассылка"
BTN_MESSAGE_LOGS = "Журнал"

BTN_SET_ROOM = "Моя комната"


def get_main_menu(role):
    keyboard = types.ReplyKeyboardMarkup(resize_keyboard=True)

    if role == "admin":
        keyboard.add(BTN_CHAIRMANS)
        keyboard.add(BTN_ADD_CHAIRMAN, BTN_DELETE_CHAIRMAN)
    if role == "chairman":
        pass
    if role == "starosta":
        keyboard.add(BTN_BECOME_CHAIRMAN)
    if role  == "user":
        keyboard.add(BTN_BECOME_CHAIRMAN, BTN_BECOME_STAROSTA)

    if role in ["admin", "chairman"]:
        keyboard.add(BTN_STAROSTAS)
        keyboard.add(BTN_ADD_STAROSTA, BTN_DELETE_STAROSTA)
        keyboard.add(BTN_ALL_USERS)

    if role in ["admin", "chairman", "starosta"]:
        keyboard.add(BTN_VIEW_SCHEDULE, BTN_EDIT_SCHEDULE)
        keyboard.add(BTN_DELETE_ROOMS)
        keyboard.add(BTN_SHOW_USERS)
        keyboard.add(BTN_NOTIFICATION_TIME, BTN_BROADCAST)
        keyboard.add(BTN_MESSAGE_LOGS)

    if role == "user":
        keyboard.add(BTN_VIEW_SCHEDULE)

    if role in ["admin", "chairman", "starosta", "user"]:
        keyboard.add(BTN_SET_ROOM)

    return keyboard


def get_cancel_keyboard():
    keyboard = types.ReplyKeyboardMarkup(resize_keyboard=True, one_time_keyboard=True)
    keyboard.add("Отмена")
    return keyboard
