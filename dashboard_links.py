from ipaddress import ip_address
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from config import DASHBOARD_PUBLIC_URL, DASHBOARD_TUNNEL_ENABLED
from dashboard_auth import create_dashboard_token
from dashboard_tunnel import get_dashboard_public_url


def build_dashboard_url(view: str = 'dashboard', token: str | None = None) -> str:
    raw_url = get_dashboard_public_url()
    if not raw_url and not DASHBOARD_TUNNEL_ENABLED:
        raw_url = DASHBOARD_PUBLIC_URL.strip()
    if not raw_url:
        return ''

    parts = urlsplit(raw_url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query['view'] = view
    if token:
        query['token'] = token

    return urlunsplit((parts.scheme, parts.netloc, parts.path or '/', urlencode(query), parts.fragment))


def build_dashboard_link_for_user(chat_id: str, view: str = 'general') -> str:
    return build_dashboard_url(view=view, token=create_dashboard_token(chat_id))


def is_telegram_webapp_url(url: str) -> bool:
    if not url:
        return False

    parts = urlsplit(url)
    if parts.scheme.lower() != 'https':
        return False

    hostname = (parts.hostname or '').strip().lower()
    if not hostname or hostname in {'localhost'}:
        return False

    try:
        parsed_ip = ip_address(hostname)
    except ValueError:
        return True

    return not (
        parsed_ip.is_loopback
        or parsed_ip.is_private
        or parsed_ip.is_link_local
        or parsed_ip.is_unspecified
        or parsed_ip.is_reserved
    )
