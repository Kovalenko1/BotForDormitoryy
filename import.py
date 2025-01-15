import time

import telebot
from config import BOT_TOKEN

from database import get_db_session
from models import User, RoleEnum
from utils import determine_wing_and_floor

TOKEN = '6837247499:AAEjFumOQbne5TyY_VDnznq4SPJ02tVdLY0'
bot = telebot.TeleBot(TOKEN)

def get_users_by_room():
    dic = {}
    with open('date.txt', 'r') as file:
        lines = file.read().splitlines()
        for line in lines:
            usersKey = []
            key, value = line.split(':')
            usersKey.append(value)
            if (key not in dic.keys()):
                dic.update({key: usersKey})
            else:
                dic[key].append(value)
        return dic

users = dict(sorted(get_users_by_room().items()))

dictt = {}
for room in users.keys():
    arr = []
    for i in users[room]:
        arr.append(bot.get_chat(i))
    dictt[room] = arr


with next(get_db_session()) as session:
    for room in dictt.keys():
        for user in dictt[room]:
            db_user = session.query(User).filter(User.chat_id == str(user.id)).first()
            if not db_user:
                print(user.username)
                wing, floor = determine_wing_and_floor(room)
                db_user = User(
                    chat_id=str(user.id),
                    role=RoleEnum.USER,
                    room=room,
                    username=f"{"@" if user.username else ""}{user.username or "Нетъ"}",
                    first_name=user.first_name,
                    last_name=f"{user.last_name or ''}",
                    floor=floor,
                    wing=wing)
                session.add(db_user)
                session.commit()
