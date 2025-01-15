import time
from datetime import datetime
import telebot
import requests

from apscheduler.schedulers.background import BackgroundScheduler
from pytz import timezone

from config import BOT_TOKEN, ADMINS_LIST, NOTIFICATION_HOUR, NOTIFICATION_MINUTE
from database import engine, get_db_session
from models import Base, User, RoleEnum, DutyQueue, FailedNotification
from keyboards import get_main_menu

from handlers.admin_handlers import handle_add_chairman, handle_delete_chairman, handle_show_chairmans
from handlers.chairman_handlers import handle_delete_starosta_by_chairman, handle_add_starosta, handle_show_all_users, \
    handle_show_starostas
from handlers.starosta_handlers import handle_view_duty_schedule, handle_add_rooms, handle_delete_room, \
    handle_show_users
from handlers.user_handlers import handle_set_room, handle_become_chairman, handle_become_starosta
from utils import determine_wing_and_floor

bot = telebot.TeleBot(BOT_TOKEN)
desired_timezone = timezone("Europe/Moscow")
scheduler = BackgroundScheduler(timezone=desired_timezone)

Base.metadata.create_all(engine)


def check_duty():
    """
    Каждый день (в установленное время) выполняется для каждого (wing, floor):
      1) Берём первую комнату (минимальный position) из DutyQueue, где wing и floor соответствуют.
      2) Ищем пользователей с этой комнатой.
      3) Если нет пользователей — уведомляем старосту крыла/этажа.
      4) Если есть — шлём уведомления пользователям. При ошибке — FailedNotification + уведомляем старосту.
      5) Переносим комнату в конец очереди (для этого крыла/этажа).
    """
    with next(get_db_session()) as session:
        wing_floor_pairs = session.query(DutyQueue.wing, DutyQueue.floor).distinct().all()

        for (wg, fl) in wing_floor_pairs:
            first_in_queue = session.query(DutyQueue).filter(
                DutyQueue.wing == wg,
                DutyQueue.floor == fl
            ).order_by(DutyQueue.position).first()

            if not first_in_queue:
                continue

            room_today = first_in_queue.room

            users_in_room = session.query(User).filter(User.room == room_today).all()

            if not users_in_room:
                notify_starosta(
                    bot, session, wg, fl,
                    f"Сегодня должна была дежурить комната {room_today}, но у неё нет зарегистрированных пользователей!"
                )
                move_to_end_of_queue(session, first_in_queue)
                continue

            for user in users_in_room:
                try:
                    bot.send_message(
                        chat_id=int(user.chat_id),
                        text=f"Сегодня ваша очередь дежурить (комната {user.room})."
                    )
                except telebot.apihelper.ApiException as e:
                    reason = "Неизвестная ошибка"
                    if "blocked by the user" in str(e):
                        reason = "Пользователь заблокировал бота"

                    fn = FailedNotification(
                        user_id=user.id,
                        chat_id=user.chat_id,
                        reason=reason
                    )
                    session.add(fn)
                    session.commit()

                    print(f"Ошибка отправки уведомления пользователю {user.chat_id}: {reason}")

                    notify_starosta(
                        bot, session, wg, fl,
                        f"Ошибка отправки уведомления пользователю {user.chat_id} (комната {user.room}).\nПричина: {reason}"
                    )

            # После обработки всех пользователей переносим комнату в конец очереди
            move_to_end_of_queue(session, first_in_queue)


def move_to_end_of_queue(session, duty_item):
    max_position = session.query(DutyQueue).filter(
        DutyQueue.wing == duty_item.wing,
        DutyQueue.floor == duty_item.floor
    ).order_by(DutyQueue.position.desc()).first().position

    duty_item.position = max_position + 1
    session.commit()

    reorder_duty_queue(session, duty_item.wing, duty_item.floor)

def reorder_duty_queue(session, wing, floor):
    """
    Перенумеровка очереди: заново сортируем по position
    и проставляем номера от 1 до N, НО только для конкретных wing/floor.
    """
    all_rooms = session.query(DutyQueue).filter(
        DutyQueue.wing == wing,
        DutyQueue.floor == floor
    ).order_by(DutyQueue.position).all()

    for i, room in enumerate(all_rooms, start=1):
        room.position = i
    session.commit()


def notify_starosta(bot, session, wing, floor, message_text):
    """
    Ищет старост(у/старост) с нужными wing и floor, шлёт им уведомление.
    Допустим, у нас один староста на крыло этажа;
    если старост несколько, можно сделать .all() и всем разослать.
    """
    starosta_list = session.query(User).filter(
        User.role == RoleEnum.STAROSTA,
        User.wing == wing,
        User.floor == floor
    ).all()
    for st in starosta_list:
        try:
            bot.send_message(
                chat_id=int(st.chat_id),
                text=message_text
            )
        except Exception as e:
            print(f"Не удалось отправить старосте {st.chat_id}: {e}")


@bot.message_handler(commands=['start'])
def cmd_start(message):
    user_chat_id = str(message.from_user.id)

    with next(get_db_session()) as session:
        db_user = session.query(User).filter(User.chat_id == user_chat_id).first()
        if not db_user:
            user_info = bot.get_chat(user_chat_id)
            username = user_info.username or ""
            db_user = User(
                chat_id=user_chat_id,
                role=RoleEnum.USER,
                username=f"{"@" if username else ""}{username or "Нетъ"}",
                first_name=user_info.first_name,
                last_name=f"{user_info.last_name or ''}")
            session.add(db_user)
            session.commit()

        user_role = db_user.role.value

    bot.send_message(
        message.chat.id,
        "Привет! Это бот для дежурств.\n",
        reply_markup=get_main_menu(user_role)
    )


@bot.message_handler(func=lambda msg: msg.text == "Добавить председателя")
def add_chairman(message):
    handle_add_chairman(bot, message)


@bot.message_handler(func=lambda msg: msg.text == "Удалить председателя")
def delete_chairman(message):
    handle_delete_chairman(bot, message)


@bot.message_handler(func=lambda msg: msg.text == "Добавить старосту")
def add_starosta(message):
    handle_add_starosta(bot, message)


@bot.message_handler(func=lambda msg: msg.text == "Удалить старосту")
def delete_starosta_by_chairman(message):
    handle_delete_starosta_by_chairman(bot, message)


@bot.message_handler(func=lambda msg: msg.text == "Посмотреть график")
def view_duty_schedule(message):
    handle_view_duty_schedule(bot, message)


@bot.message_handler(func=lambda msg: msg.text == "Редактировать график")
def starosta_add_rooms(message):
    handle_add_rooms(bot, message)


@bot.message_handler(func=lambda msg: msg.text == "Удалить комнаты")
def starosta_delete_rooms(message):
    handle_delete_room(bot, message)


@bot.message_handler(func=lambda msg: msg.text == "Показать подключенных пользователей")
def starosta_show_users(message):
    handle_show_users(bot, message)


@bot.message_handler(func=lambda msg: msg.text == "Указать свою комнату")
def user_set_room(message):
    handle_set_room(bot, message)


@bot.message_handler(func=lambda msg: msg.text == "Стать председателем")
def become_chairman(message):
    handle_become_chairman(bot, message)


@bot.message_handler(func=lambda msg: msg.text == "Стать старостой")
def become_starosta(message):
    handle_become_starosta(bot, message)


@bot.message_handler(func=lambda msg: msg.text == "Показать всех пользователей")
def handle_show_all_users_command(message):
    handle_show_all_users(bot, message)


@bot.message_handler(func=lambda msg: msg.text == "Показать подключенных старост")
def handle_show_starostas_command(message):
    handle_show_starostas(bot, message)


@bot.message_handler(func=lambda msg: msg.text == "Показать председателей")
def handle_show_chairmans_command(message):
    handle_show_chairmans(bot, message)


def main():
    scheduler.add_job(check_duty, 'cron', hour=NOTIFICATION_HOUR, minute=NOTIFICATION_MINUTE)
    scheduler.start()

    while True:
        try:
            bot.infinity_polling(timeout=60, long_polling_timeout=60)
        except requests.exceptions.ReadTimeout:
            print("Timeout error. Restarting polling...")
            time.sleep(5)
        except Exception as e:
            print(f"Unexpected error: {e}. Restarting polling...")
            time.sleep(5)


if __name__ == "__main__":
    main()
