from datetime import datetime

from pytz import timezone


MOSCOW_TIMEZONE = timezone("Europe/Moscow")


def moscow_now() -> datetime:
    return datetime.now(MOSCOW_TIMEZONE).replace(tzinfo=None)