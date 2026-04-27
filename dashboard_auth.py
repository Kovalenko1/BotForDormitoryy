import base64
import binascii
import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl

from config import BOT_TOKEN, DASHBOARD_TOKEN_TTL_SECONDS, DASHBOARD_WEBAPP_MAX_AGE_SECONDS


def _b64encode(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode()).decode().rstrip('=')


def _b64decode(value: str) -> str:
    padding = '=' * (-len(value) % 4)
    return base64.urlsafe_b64decode(f'{value}{padding}'.encode()).decode()


def _sign_value(value: str) -> str:
    if not BOT_TOKEN:
        raise RuntimeError('BOT_TOKEN is required to sign dashboard tokens.')

    return hmac.new(
        BOT_TOKEN.encode(),
        f'dashboard:{value}'.encode(),
        hashlib.sha256,
    ).hexdigest()


def create_dashboard_token(chat_id: str, ttl_seconds: int | None = None) -> str:
    ttl = DASHBOARD_TOKEN_TTL_SECONDS
    expires_at = int(time.time()) + int(ttl)
    payload = json.dumps({'chat_id': str(chat_id), 'exp': expires_at}, separators=(',', ':'))
    encoded_payload = _b64encode(payload)
    signature = _sign_value(encoded_payload)
    return f'{encoded_payload}.{signature}'


def verify_dashboard_token(token: str | None) -> str | None:
    if not BOT_TOKEN or not token or '.' not in token:
        return None

    encoded_payload, signature = token.rsplit('.', 1)
    try:
        expected_signature = _sign_value(encoded_payload)
    except RuntimeError:
        return None

    if not hmac.compare_digest(signature, expected_signature):
        return None

    try:
        payload = json.loads(_b64decode(encoded_payload))
    except (binascii.Error, json.JSONDecodeError, UnicodeDecodeError, ValueError):
        return None

    chat_id = payload.get('chat_id')
    if not chat_id:
        return None

    try:
        expires_at = int(payload.get('exp'))
    except (TypeError, ValueError):
        return None

    if int(expires_at) < int(time.time()):
        return None

    return str(chat_id)


def validate_telegram_init_data(init_data: str | None) -> dict | None:
    if not init_data or not BOT_TOKEN:
        return None

    parsed_data = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = parsed_data.pop('hash', None)
    auth_date = parsed_data.get('auth_date')
    if not received_hash or not auth_date:
        return None

    try:
        if int(auth_date) + DASHBOARD_WEBAPP_MAX_AGE_SECONDS < int(time.time()):
            return None
    except ValueError:
        return None

    data_check_string = '\n'.join(
        f'{key}={value}' for key, value in sorted(parsed_data.items())
    )
    secret_key = hmac.new(
        b'WebAppData',
        BOT_TOKEN.encode(),
        hashlib.sha256,
    ).digest()
    expected_hash = hmac.new(
        secret_key,
        data_check_string.encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected_hash, received_hash):
        return None

    user_payload = parsed_data.get('user')
    if not user_payload:
        return None

    try:
        user = json.loads(user_payload)
    except json.JSONDecodeError:
        return None

    user_id = user.get('id')
    if user_id is None:
        return None

    return {
        'chat_id': str(user_id),
        'username': user.get('username'),
        'first_name': user.get('first_name'),
        'last_name': user.get('last_name'),
    }
