from database import get_db_session
from models import BotLog
from time_utils import moscow_now


def log_bot_event(event: str, user_id: str | None = None):
    try:
        with next(get_db_session()) as session:
            session.add(BotLog(
                event=event,
                timestamp=moscow_now(),
                user_id=str(user_id) if user_id is not None else None,
            ))
            session.commit()
    except Exception as error:
        print(f"Failed to log bot event: {error}")
