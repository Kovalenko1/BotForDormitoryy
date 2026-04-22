from sqlalchemy import or_
import telebot

from database import get_db_session
from models import IncomingUserMessage, OutgoingMessageLog, RoleEnum, User


def normalize_log_text(value: str) -> str:
    return value.replace('\n', ' / ').strip()


def format_username(username: str | None) -> str:
    return username or 'без тега'


def split_chunks(text: str, chunk_size: int = 3500) -> list[str]:
    if not text:
        return []

    chunks = []
    current_chunk = []
    current_length = 0

    for line in text.splitlines():
        additional_length = len(line) + 1
        if current_chunk and current_length + additional_length > chunk_size:
            chunks.append('\n'.join(current_chunk))
            current_chunk = [line]
            current_length = additional_length
        else:
            current_chunk.append(line)
            current_length += additional_length

    if current_chunk:
        chunks.append('\n'.join(current_chunk))

    return chunks


def handle_view_message_logs(bot: telebot.TeleBot, message: telebot.types.Message):
    user_chat_id = str(message.from_user.id)

    with next(get_db_session()) as session:
        db_user = session.query(User).filter(User.chat_id == user_chat_id).first()
        if not db_user or db_user.role not in [RoleEnum.STAROSTA, RoleEnum.CHAIRMAN, RoleEnum.ADMIN]:
            bot.send_message(message.chat.id, "У вас нет прав на просмотр журналов сообщений.")
            return

        incoming_query = session.query(IncomingUserMessage)
        outgoing_query = session.query(OutgoingMessageLog)

        if db_user.role == RoleEnum.STAROSTA:
            if not db_user.floor:
                bot.send_message(message.chat.id, "Сначала укажите свою комнату, чтобы определить этаж.")
                return

            incoming_query = incoming_query.filter(IncomingUserMessage.sender_floor == db_user.floor)
            outgoing_query = outgoing_query.filter(
                or_(
                    OutgoingMessageLog.sender_chat_id == user_chat_id,
                    OutgoingMessageLog.recipient_floor == db_user.floor,
                )
            )

        incoming_messages = list(reversed(
            incoming_query.order_by(IncomingUserMessage.received_at.desc()).limit(20).all()
        ))
        outgoing_messages = list(reversed(
            outgoing_query.order_by(OutgoingMessageLog.created_at.desc()).limit(20).all()
        ))

    incoming_lines = ["Входящие сообщения:"]
    if incoming_messages:
        for incoming_message in incoming_messages:
            incoming_lines.append(
                f"[{incoming_message.received_at.strftime('%d.%m.%Y %H:%M')}] "
                f"{incoming_message.sender_chat_id} "
                f"{format_username(incoming_message.sender_username)} "
                f"({incoming_message.sender_room or 'комната не указана'})"
            )
            incoming_lines.append(f"Текст: {normalize_log_text(incoming_message.text)}")
            incoming_lines.append("")
    else:
        incoming_lines.append("Нет сообщений.")

    outgoing_lines = ["Исходящие сообщения:"]
    if outgoing_messages:
        for outgoing_message in outgoing_messages:
            outgoing_lines.append(
                f"[{outgoing_message.created_at.strftime('%d.%m.%Y %H:%M')}] "
                f"{outgoing_message.category} | {outgoing_message.status}"
            )
            outgoing_lines.append(
                f"От: {outgoing_message.sender_chat_id} {format_username(outgoing_message.sender_username)}"
            )
            outgoing_lines.append(
                f"Кому: {outgoing_message.recipient_chat_id} {format_username(outgoing_message.recipient_username)}"
            )
            outgoing_lines.append(f"Текст: {normalize_log_text(outgoing_message.text)}")
            if outgoing_message.error_message:
                outgoing_lines.append(f"Ошибка: {outgoing_message.error_message}")
            outgoing_lines.append("")
    else:
        outgoing_lines.append("Нет сообщений.")

    for chunk in split_chunks('\n'.join(incoming_lines)):
        bot.send_message(message.chat.id, chunk, skip_audit=True)

    for chunk in split_chunks('\n'.join(outgoing_lines)):
        bot.send_message(message.chat.id, chunk, skip_audit=True)