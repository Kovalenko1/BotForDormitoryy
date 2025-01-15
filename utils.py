import uuid
from datetime import datetime, timedelta

from database import get_db_session
from models import AccessKey, RoleEnum


def generate_access_key(role_to_assign: RoleEnum) -> str:
    """
    Генерирует уникальный 8-символьный ключ, сохраняет в БД,
    возвращает сам ключ (string).
    """
    key_value = str(uuid.uuid4())[:8]
    with next(get_db_session()) as session:
        access_key = AccessKey(
            key=key_value,
            role_to_assign=role_to_assign,
            created_at=datetime.now(),
        )
        session.add(access_key)
        session.commit()

    return key_value


def cleanup_expired_keys():
    """
    Деактивирует ключи, которым больше 24 часов.
    """
    with next(get_db_session()) as session:
        threshold_time = datetime.utcnow() - timedelta(hours=24)
        keys = session.query(AccessKey).filter(
            AccessKey.created_at < threshold_time,
            AccessKey.is_active == True
        ).all()
        for k in keys:
            k.is_active = False
        session.commit()


def validate_access_key(key_value: str) -> RoleEnum:
    """
    Проверяет, существует ли активный ключ в БД (не старше 24 часов, is_active=True).
    Возвращает RoleEnum, если ключ валидный, иначе None.
    """
    with next(get_db_session()) as session:
        access_key = session.query(AccessKey).filter(
            AccessKey.key == key_value,
            AccessKey.is_active == True
        ).first()
        if not access_key:
            return None

        if (datetime.now() - access_key.created_at) > timedelta(hours=24):
            access_key.is_active = False
            session.commit()
            return None

        return access_key.role_to_assign


def deactivate_key(key_value: str):
    """
    Помечаем ключ как неактивный.
    """
    with next(get_db_session()) as session:
        access_key = session.query(AccessKey).filter(AccessKey.key == key_value).first()
        if access_key:
            access_key.is_active = False
            session.commit()

def parse_rooms_input(rooms_text: str) -> list:

    """
    Принимает строку вида '201, 202, 203, 206-208, 223, 224-226'
    Возвращает список номеров комнат: ['201', '202', '203', '206', '207', '208', '223', '224', '225', '226']
    """
    result = []
    parts = [part.strip() for part in rooms_text.split(',')]
    for part in parts:
        if '-' in part:
            start, end = part.split('-')
            for i in range(int(start), int(end) + 1):
                result.append(str(i))
        else:
            result.append(part)
    return result


def determine_wing_and_floor(room: str):
    """
    Определяет крыло и этаж,
    например:
      - Комнаты *09-*22 -> правое крыло
      - Остальные -> левое крыло
      - Этаж – первая цифра комнаты ( room='223' -> 2 этаж )
    Возвращает (wing, floor).
    """
    try:
        floor = int(room[0])
        wing = "нет"
        if len(room) >= 3:
            last_two_digits = int(room[-2:])
            if 9 <= last_two_digits <= 22:
                wing = "левое"
            elif 1 <= last_two_digits <= 8 or 23 <= last_two_digits <= 26:
                wing = "правое"
        return wing, floor

    except Exception as e:
        print(f"Ошибочка: {e}")

