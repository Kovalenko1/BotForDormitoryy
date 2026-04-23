import time
from datetime import datetime
import telebot
import requests

from apscheduler.schedulers.background import BackgroundScheduler
from pytz import timezone

from config import BOT_TOKEN, NOTIFICATION_HOUR, NOTIFICATION_MINUTE
from database import engine, get_db_session
from models import Base, User, RoleEnum, DutyQueue, FailedNotification, FloorNotificationSetting
from keyboards import (
    BTN_ADD_CHAIRMAN,
    BTN_ADD_STAROSTA,
    BTN_ALL_USERS,
    BTN_BECOME_CHAIRMAN,
    BTN_BECOME_STAROSTA,
    BTN_BROADCAST,
    BTN_CHAIRMANS,
    BTN_DELETE_CHAIRMAN,
    BTN_DELETE_ROOMS,
    BTN_DELETE_STAROSTA,
    BTN_EDIT_SCHEDULE,
    BTN_MESSAGE_LOGS,
    BTN_NOTIFICATION_TIME,
    BTN_SET_ROOM,
    BTN_SHOW_USERS,
    BTN_STAROSTAS,
    BTN_VIEW_SCHEDULE,
    get_main_menu,
)

from handlers.admin_handlers import handle_add_chairman, handle_delete_chairman, handle_show_chairmans
from handlers.chairman_handlers import handle_delete_starosta_by_chairman, handle_add_starosta, handle_show_all_users, \
    handle_show_starostas
from handlers.log_handlers import handle_view_message_logs
from handlers.notification_handlers import handle_broadcast_message, handle_manage_notification_time
from handlers.starosta_handlers import handle_view_duty_schedule, handle_add_rooms, handle_delete_room, \
    handle_show_users
from handlers.user_handlers import handle_set_room, handle_become_chairman, handle_become_starosta
from bot_events import log_bot_event
from dashboard_tunnel import start_dashboard_tunnel
from message_audit import cleanup_old_logs, ensure_message_audit_schema, install_message_audit
from user_access import ensure_user_access_schema
from utils import normalize_existing_data

bot = telebot.TeleBot(BOT_TOKEN)
desired_timezone = timezone("Europe/Moscow")
scheduler = BackgroundScheduler(timezone=desired_timezone)

Base.metadata.create_all(engine)
ensure_message_audit_schema(engine)
ensure_user_access_schema(engine)
normalize_existing_data()
install_message_audit(bot)


def get_floor_notification_setting(session, floor: int):
    setting = session.query(FloorNotificationSetting).filter(
        FloorNotificationSetting.floor == floor
    ).first()
    if setting:
        return setting

    setting = FloorNotificationSetting(
        floor=floor,
        notification_hour=NOTIFICATION_HOUR,
        notification_minute=NOTIFICATION_MINUTE,
    )
    session.add(setting)
    session.commit()
    session.refresh(setting)
    return setting


def check_duty():
    """
        Каждый день выполняется для каждого этажа:
      1) Берём первую комнату (минимальный position) из DutyQueue для этажа.
      2) Ищем пользователей с этой комнатой.
      3) Если нет пользователей — уведомляем старосту этажа.
      4) Если есть — шлём уведомления пользователям. При ошибке — FailedNotification + уведомляем старосту.
      5) Переносим комнату в конец очереди этого этажа.
    """
    now = datetime.now(desired_timezone)

    with next(get_db_session()) as session:
        floor_list = session.query(DutyQueue.floor).distinct().all()

        for (fl,) in floor_list:
            notification_setting = get_floor_notification_setting(session, fl)
            if notification_setting.last_notified_on == now.date():
                continue

            if (
                notification_setting.notification_hour != now.hour
                or notification_setting.notification_minute != now.minute
            ):
                continue

            first_in_queue = session.query(DutyQueue).filter(
                DutyQueue.floor == fl
            ).order_by(DutyQueue.position).first()

            if not first_in_queue:
                continue

            block_today = first_in_queue.room

            users_in_room = session.query(User).filter(
                User.room.like(f"{block_today}%"),
                User.is_blocked.is_(False),
                User.is_whitelisted.is_(True),
            ).all()

            if not users_in_room:
                notify_starosta(
                    bot, session, fl,
                    f"Сегодня должен был дежурить блок {block_today}, но у него нет зарегистрированных пользователей!"
                )
                move_to_end_of_queue(session, first_in_queue)
                notification_setting.last_notified_on = now.date()
                session.commit()
                continue

            for user in users_in_room:
                try:
                    bot.send_message(
                        chat_id=int(user.chat_id),
                        text=f"Сегодня дежурит ваш блок {block_today}. (в случае если вы не можете провести дежурство, пожалуйста, договоритесь с соседями по блоку или комнате о замене)",
                        category='duty',
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
                        bot, session, fl,
                        f"Ошибка отправки уведомления пользователю {user.chat_id} (комната {user.room}).\nПричина: {reason}"
                    )

            # После обработки всех пользователей переносим комнату в конец очереди
            move_to_end_of_queue(session, first_in_queue)
            notification_setting.last_notified_on = now.date()
            session.commit()


def move_to_end_of_queue(session, duty_item):
    max_position = session.query(DutyQueue).filter(
        DutyQueue.floor == duty_item.floor
    ).order_by(DutyQueue.position.desc()).first().position

    duty_item.position = max_position + 1
    session.commit()

    reorder_duty_queue(session, duty_item.floor)

def reorder_duty_queue(session, floor):
    """
    Перенумеровка очереди: заново сортируем по position
    и проставляем номера от 1 до N только для конкретного этажа.
    """
    all_rooms = session.query(DutyQueue).filter(
        DutyQueue.floor == floor
    ).order_by(DutyQueue.position).all()

    for i, room in enumerate(all_rooms, start=1):
        room.position = i
    session.commit()


def notify_starosta(bot, session, floor, message_text):
    """
    Ищет старосту нужного этажа и шлёт ему уведомление.
    Допустим, у нас один староста на этаж;
    если старост несколько, можно сделать .all() и всем разослать.
    """
    starosta_list = session.query(User).filter(
        User.role == RoleEnum.STAROSTA,
        User.floor == floor,
        User.is_blocked.is_(False),
    ).all()
    for st in starosta_list:
        try:
            bot.send_message(
                chat_id=int(st.chat_id),
                text=message_text,
                category='duty'
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
                username=f"{'@' if username else ''}{username or 'Нет'}",
                first_name=user_info.first_name,
                last_name=f"{user_info.last_name or ''}")
            session.add(db_user)
            session.commit()

        user_role = db_user.role.value

    bot.send_message(
        message.chat.id,
        "Привет! Рад видеть тебя здесь.\nПри возникновении трудностей с использованием бота пишите @Alexgear10001.\nПри наличии предложений по улучшению бота пишите @KVA06",
        reply_markup=get_main_menu(user_role, user_chat_id)
    )


@bot.message_handler(func=lambda msg: msg.text == BTN_ADD_CHAIRMAN)
def add_chairman(message):
    handle_add_chairman(bot, message)


@bot.message_handler(func=lambda msg: msg.text == BTN_DELETE_CHAIRMAN)
def delete_chairman(message):
    handle_delete_chairman(bot, message)


@bot.message_handler(func=lambda msg: msg.text == BTN_ADD_STAROSTA)
def add_starosta(message):
    handle_add_starosta(bot, message)


@bot.message_handler(func=lambda msg: msg.text == BTN_DELETE_STAROSTA)
def delete_starosta_by_chairman(message):
    handle_delete_starosta_by_chairman(bot, message)


@bot.message_handler(func=lambda msg: msg.text == BTN_VIEW_SCHEDULE)
def view_duty_schedule(message):
    handle_view_duty_schedule(bot, message)


@bot.message_handler(func=lambda msg: msg.text == BTN_EDIT_SCHEDULE)
def starosta_add_rooms(message):
    handle_add_rooms(bot, message)


@bot.message_handler(func=lambda msg: msg.text == BTN_DELETE_ROOMS)
def starosta_delete_rooms(message):
    handle_delete_room(bot, message)


@bot.message_handler(func=lambda msg: msg.text == BTN_SHOW_USERS)
def starosta_show_users(message):
    handle_show_users(bot, message)


@bot.message_handler(func=lambda msg: msg.text == BTN_NOTIFICATION_TIME)
def manage_notification_time(message):
    handle_manage_notification_time(bot, message)


@bot.message_handler(func=lambda msg: msg.text == BTN_BROADCAST)
def broadcast_message(message):
    handle_broadcast_message(bot, message)


@bot.message_handler(func=lambda msg: msg.text == BTN_MESSAGE_LOGS)
def view_message_logs(message):
    handle_view_message_logs(bot, message)


@bot.message_handler(func=lambda msg: msg.text == BTN_SET_ROOM)
def user_set_room(message):
    handle_set_room(bot, message)


@bot.message_handler(func=lambda msg: msg.text == BTN_BECOME_CHAIRMAN)
def become_chairman(message):
    handle_become_chairman(bot, message)


@bot.message_handler(func=lambda msg: msg.text == BTN_BECOME_STAROSTA)
def become_starosta(message):
    handle_become_starosta(bot, message)


@bot.message_handler(func=lambda msg: msg.text == BTN_ALL_USERS)
def handle_show_all_users_command(message):
    handle_show_all_users(bot, message)


@bot.message_handler(func=lambda msg: msg.text == BTN_STAROSTAS)
def handle_show_starostas_command(message):
    handle_show_starostas(bot, message)


@bot.message_handler(func=lambda msg: msg.text == BTN_CHAIRMANS)
def handle_show_chairmans_command(message):
    handle_show_chairmans(bot, message)


def main():
    scheduler.add_job(check_duty, 'cron', minute='*')
    scheduler.add_job(cleanup_old_logs, 'cron', day_of_week='mon', hour=0, minute=0)
    scheduler.start()
    start_dashboard_tunnel(wait=False)
    log_bot_event("Bot polling started")

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
