import uuid
import re
from datetime import timedelta

from database import get_db_session
from models import AccessKey, DutyQueue, RoleEnum, User
from time_utils import moscow_now


ROOM_PATTERN = re.compile(r"^(?P<block>(?:[1-9]\d{2}|1[0-6]\d{2}))(?P<suffix>[АБ])$")
BLOCK_PATTERN = re.compile(r"^(?:[1-9]\d{2}|1[0-6]\d{2})$")
BLOCK_RANGE_PATTERN = re.compile(r"^(?P<start>(?:[1-9]\d{2}|1[0-6]\d{2}))\s*-\s*(?P<end>(?:[1-9]\d{2}|1[0-6]\d{2}))$")
TIME_PATTERN = re.compile(r"^(?P<hour>\d{1,2}):(?P<minute>\d{2})$")
ROOM_SUFFIX_MAP = {
    "A": "А",
    "А": "А",
    "B": "Б",
    "Б": "Б",
}


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
            created_at=moscow_now(),
        )
        session.add(access_key)
        session.commit()

    return key_value


def cleanup_expired_keys():
    """
    Деактивирует ключи, которым больше 24 часов.
    """
    with next(get_db_session()) as session:
        threshold_time = moscow_now() - timedelta(hours=24)
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

        if (moscow_now() - access_key.created_at) > timedelta(hours=24):
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


def normalize_room(room_text: str) -> str:
    normalized_room = room_text.strip().replace(" ", "").upper()
    if not normalized_room:
        return normalized_room

    suffix = ROOM_SUFFIX_MAP.get(normalized_room[-1])
    if suffix:
        return f"{normalized_room[:-1]}{suffix}"

    return normalized_room


def parse_room(room_text: str) -> tuple[str, str, int]:
    normalized_room = normalize_room(room_text)
    match = ROOM_PATTERN.fullmatch(normalized_room)
    if not match:
        raise ValueError("Неверный формат комнаты. Используйте формат вроде 1513А или 913Б.")

    block = match.group("block")
    floor = int(block[:2]) if len(block) == 4 else int(block[0])
    if not 1 <= floor <= 16:
        raise ValueError("Этаж должен быть в диапазоне от 1 до 16.")

    return normalized_room, block, floor


def parse_block(block_text: str) -> tuple[str, int]:
    normalized_block = block_text.strip().replace(" ", "")
    if not BLOCK_PATTERN.fullmatch(normalized_block):
        raise ValueError("Неверный формат блока. Используйте формат вроде 1513 или 913.")

    floor = int(normalized_block[:2]) if len(normalized_block) == 4 else int(normalized_block[0])
    if not 1 <= floor <= 16:
        raise ValueError("Этаж должен быть в диапазоне от 1 до 16.")

    return normalized_block, floor


def parse_block_or_room(value: str) -> tuple[str, int]:
    try:
        _, block, floor = parse_room(value)
        return block, floor
    except ValueError:
        return parse_block(value)


def expand_block(block_text: str) -> list[str]:
    normalized_block, _ = parse_block(block_text)
    return [normalized_block]


def expand_block_range(start_block_text: str, end_block_text: str) -> list[str]:
    start_block, start_floor = parse_block(start_block_text)
    end_block, end_floor = parse_block(end_block_text)

    if len(start_block) != len(end_block):
        raise ValueError("Диапазон блоков должен быть в одном формате, например 1502-1504.")

    if start_floor != end_floor:
        raise ValueError("Диапазон блоков должен быть в пределах одного этажа.")

    start_number = int(start_block)
    end_number = int(end_block)
    if start_number > end_number:
        raise ValueError("Начало диапазона должно быть меньше или равно концу.")

    expanded_blocks = []
    for block_number in range(start_number, end_number + 1):
        expanded_blocks.extend(expand_block(str(block_number)))

    return expanded_blocks


def parse_rooms_input(rooms_text: str) -> list[str]:

    """
    Принимает строку вида '1502-1504, 1505А, 1501'.
    Возвращает уникальные блоки в порядке ввода.
    Комната с буквой нормализуется до блока, например 1505a -> 1505.
    """
    result = []
    seen_blocks = set()
    parts = [part.strip() for part in rooms_text.replace('\n', ',').split(',') if part.strip()]

    for part in parts:
        range_match = BLOCK_RANGE_PATTERN.fullmatch(part)
        if range_match:
            blocks_to_add = expand_block_range(range_match.group("start"), range_match.group("end"))
        elif ROOM_PATTERN.fullmatch(normalize_room(part)):
            blocks_to_add = [parse_room(part)[1]]
        elif BLOCK_PATTERN.fullmatch(part):
            blocks_to_add = expand_block(part)
        else:
            raise ValueError(
                "Неверный формат списка блоков. Используйте, например: 1502-1504, 1505, 1501"
            )

        for block in blocks_to_add:
            if block not in seen_blocks:
                seen_blocks.add(block)
                result.append(block)

    return result


def determine_wing_and_floor(room: str):
    normalized_room, _, floor = parse_room(room)
    return "", floor


def parse_floor(floor_text: str) -> int:
    normalized_floor = floor_text.strip()
    if not normalized_floor.isdigit():
        raise ValueError("Этаж должен быть числом от 1 до 16.")

    floor = int(normalized_floor)
    if not 1 <= floor <= 16:
        raise ValueError("Этаж должен быть в диапазоне от 1 до 16.")

    return floor


def parse_notification_time(time_text: str) -> tuple[int, int]:
    normalized_time = time_text.strip()
    match = TIME_PATTERN.fullmatch(normalized_time)
    if not match:
        raise ValueError("Неверный формат времени. Используйте ЧЧ:ММ, например 20:30.")

    hour = int(match.group("hour"))
    minute = int(match.group("minute"))
    if not 0 <= hour <= 23 or not 0 <= minute <= 59:
        raise ValueError("Время должно быть в диапазоне от 00:00 до 23:59.")

    return hour, minute


def format_notification_time(hour: int, minute: int) -> str:
    return f"{hour:02d}:{minute:02d}"


def normalize_existing_data():
    with next(get_db_session()) as session:
        changed = False

        for user in session.query(User).all():
            if not user.room:
                continue

            try:
                normalized_room, _, floor = parse_room(user.room)
            except ValueError:
                continue

            if user.room != normalized_room or user.floor != floor or user.wing != "":
                user.room = normalized_room
                user.floor = floor
                user.wing = ""
                changed = True

        queue_items = session.query(DutyQueue).order_by(DutyQueue.floor, DutyQueue.position, DutyQueue.id).all()
        seen_blocks = set()
        for queue_item in queue_items:
            try:
                normalized_block, floor = parse_block_or_room(queue_item.room)
            except ValueError:
                continue

            block_key = (floor, normalized_block)
            if block_key in seen_blocks:
                session.delete(queue_item)
                changed = True
                continue

            seen_blocks.add(block_key)

            if queue_item.room != normalized_block or queue_item.floor != floor or queue_item.wing != "":
                queue_item.room = normalized_block
                queue_item.floor = floor
                queue_item.wing = ""
                changed = True

        if changed:
            session.commit()

        floor_list = session.query(DutyQueue.floor).distinct().all()
        for (floor,) in floor_list:
            floor_queue = session.query(DutyQueue).filter(
                DutyQueue.floor == floor
            ).order_by(DutyQueue.position, DutyQueue.id).all()

            for index, queue_item in enumerate(floor_queue, start=1):
                if queue_item.position != index:
                    queue_item.position = index
                    changed = True

        if changed:
            session.commit()

