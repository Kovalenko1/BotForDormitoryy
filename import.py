import telebot
from config import BOT_TOKEN

from database import get_db_session
from models import User, RoleEnum
from utils import parse_room

bot = telebot.TeleBot(BOT_TOKEN) if BOT_TOKEN else None


def get_users_by_room(path: str = 'date.txt') -> dict[str, list[str]]:
    rooms: dict[str, list[str]] = {}

    with open(path, 'r', encoding='utf-8') as file:
        for raw_line in file:
            line = raw_line.strip()
            if not line or ':' not in line:
                continue

            room, chat_id = (part.strip() for part in line.split(':', 1))
            if room and chat_id:
                rooms.setdefault(room, []).append(chat_id)

    return dict(sorted(rooms.items()))


def import_users(path: str = 'date.txt') -> int:
    if bot is None:
        raise RuntimeError('BOT_TOKEN is required to import Telegram users.')

    users_by_room = get_users_by_room(path)
    chat_ids = {chat_id for ids in users_by_room.values() for chat_id in ids}

    with next(get_db_session()) as session:
        existing_chat_ids = {
            row[0]
            for row in session.query(User.chat_id).filter(User.chat_id.in_(list(chat_ids))).all()
        } if chat_ids else set()

        imported_count = 0
        for room, room_chat_ids in users_by_room.items():
            normalized_room, _, floor = parse_room(room)

            for chat_id in room_chat_ids:
                if chat_id in existing_chat_ids:
                    continue

                telegram_user = bot.get_chat(chat_id)
                username = f'@{telegram_user.username}' if telegram_user.username else 'Нетъ'
                session.add(User(
                    chat_id=str(telegram_user.id),
                    role=RoleEnum.USER,
                    room=normalized_room,
                    username=username,
                    first_name=telegram_user.first_name,
                    last_name=telegram_user.last_name or '',
                    floor=floor,
                    wing='',
                ))
                existing_chat_ids.add(chat_id)
                existing_chat_ids.add(str(telegram_user.id))
                imported_count += 1

        session.commit()
        return imported_count


if __name__ == '__main__':
    count = import_users()
    print(f'Imported users: {count}')
