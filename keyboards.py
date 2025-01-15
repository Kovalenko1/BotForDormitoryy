from telebot import types


def get_main_menu(role):
    keyboard = types.ReplyKeyboardMarkup(resize_keyboard=True)

    if role == "admin":
        keyboard.add("Показать председателей")
        keyboard.add("Добавить председателя", "Удалить председателя")
    if role == "chairman":
        pass
    if role == "starosta":
        keyboard.add("Стать председателем")
    if role  == "user":
        keyboard.add("Стать председателем", "Стать старостой")

    if role in ["admin", "chairman"]:
        keyboard.add("Показать подключенных старост")
        keyboard.add("Добавить старосту", "Удалить старосту")
        keyboard.add("Показать всех пользователей")

    if role in ["admin", "chairman", "starosta"]:
        keyboard.add("Посмотреть график", "Редактировать график")
        keyboard.add("Удалить комнаты")
        keyboard.add("Показать подключенных пользователей")

    if role in ["admin", "chairman", "starosta", "user"]:
        keyboard.add("Указать свою комнату")

    return keyboard


def get_cancel_keyboard():
    keyboard = types.ReplyKeyboardMarkup(resize_keyboard=True, one_time_keyboard=True)
    keyboard.add("Отмена")
    return keyboard
