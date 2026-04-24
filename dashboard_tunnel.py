import atexit
import re
import subprocess
import threading
from ipaddress import ip_address
from urllib.parse import urlsplit

from config import (
    DASHBOARD_PUBLIC_URL,
    DASHBOARD_TUNNEL_ENABLED,
    DASHBOARD_TUNNEL_HOST,
    DASHBOARD_TUNNEL_START_TIMEOUT,
    DASHBOARD_TUNNEL_TARGET_HOST,
    DASHBOARD_TUNNEL_TARGET_PORT,
)


_URL_PATTERN = re.compile(
    r"^https://(?:[A-Za-z0-9-]+\.)+(?:localhost\.run|lhr\.life)",
    re.IGNORECASE,
)
_IGNORED_TUNNEL_URLS = {
    'https://admin.localhost.run',
    'https://localhost.run',
}
_TEMPORARY_TUNNEL_HOST_SUFFIXES = (
    'localhost.run',
    'lhr.life',
)
_lock = threading.Lock()
_process: subprocess.Popen[str] | None = None
_public_url = ''
_url_ready = threading.Event()
_reader_thread: threading.Thread | None = None
_monitor_thread: threading.Thread | None = None
_stop_event = threading.Event()


def _is_public_web_url(url: str) -> bool:
    normalized = url.strip()
    if not normalized:
        return False

    parts = urlsplit(normalized)
    if parts.scheme.lower() != 'https':
        return False

    hostname = (parts.hostname or '').strip().lower()
    if not hostname or hostname == 'localhost':
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


def _is_temporary_tunnel_host(hostname: str) -> bool:
    normalized = hostname.strip().lower()
    return any(
        normalized == suffix or normalized.endswith(f'.{suffix}')
        for suffix in _TEMPORARY_TUNNEL_HOST_SUFFIXES
    )


def _get_fixed_public_url() -> str:
    candidate = DASHBOARD_PUBLIC_URL.strip()
    if not _is_public_web_url(candidate):
        return ''

    hostname = (urlsplit(candidate).hostname or '').strip().lower()
    if _is_temporary_tunnel_host(hostname):
        return ''

    return candidate


def _fallback_url() -> str:
    fixed_url = _get_fixed_public_url()
    if fixed_url:
        return fixed_url
    if DASHBOARD_TUNNEL_ENABLED:
        return ''
    return DASHBOARD_PUBLIC_URL.strip()


def _build_command() -> list[str]:
    return [
        'ssh',
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'UserKnownHostsFile=/dev/null',
        '-o', 'TCPKeepAlive=yes',
        '-o', 'ServerAliveInterval=30',
        '-o', 'ServerAliveCountMax=3',
        '-o', 'ExitOnForwardFailure=yes',
        '-R', f'80:{DASHBOARD_TUNNEL_TARGET_HOST}:{DASHBOARD_TUNNEL_TARGET_PORT}',
        f'nokey@{DASHBOARD_TUNNEL_HOST}',
    ]


def _start_process_locked():
    global _process, _public_url, _reader_thread

    _public_url = ''
    _url_ready.clear()
    _process = subprocess.Popen(
        _build_command(),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        stdin=subprocess.DEVNULL,
        text=True,
        bufsize=1,
    )
    _reader_thread = threading.Thread(
        target=_consume_output,
        args=(_process,),
        daemon=True,
    )
    _reader_thread.start()


def _watch_tunnel_process():
    while not _stop_event.wait(10):
        if not DASHBOARD_TUNNEL_ENABLED or _get_fixed_public_url():
            continue

        with _lock:
            if _is_running(_process):
                continue
            _start_process_locked()


def _ensure_monitor_thread_locked():
    global _monitor_thread

    if _monitor_thread is not None and _monitor_thread.is_alive():
        return

    _monitor_thread = threading.Thread(target=_watch_tunnel_process, daemon=True)
    _monitor_thread.start()


def _extract_public_url(line: str) -> str:
    for fragment in line.split('https://'):
        if not fragment:
            continue

        match = _URL_PATTERN.match(f'https://{fragment}')
        if not match:
            continue

        normalized = match.group(0).rstrip('/').lower()
        if normalized in _IGNORED_TUNNEL_URLS:
            continue
        return match.group(0).rstrip('/')
    return ''


def _consume_output(process: subprocess.Popen[str]):
    global _public_url

    assert process.stdout is not None

    try:
        for line in process.stdout:
            public_url = _extract_public_url(line)
            if public_url:
                with _lock:
                    _public_url = public_url
                    _url_ready.set()
                print(f'Dashboard tunnel ready: {_public_url}')
    finally:
        with _lock:
            if process is _process:
                _url_ready.clear()


def _is_running(process: subprocess.Popen[str] | None) -> bool:
    return process is not None and process.poll() is None


def start_dashboard_tunnel(wait: bool = True) -> str:
    fixed_url = _get_fixed_public_url()
    if fixed_url:
        return fixed_url

    if not DASHBOARD_TUNNEL_ENABLED:
        return _fallback_url()

    with _lock:
        if _is_running(_process) and _public_url:
            return _public_url

        if not _is_running(_process):
            _start_process_locked()
        _ensure_monitor_thread_locked()

    if wait:
        _url_ready.wait(timeout=DASHBOARD_TUNNEL_START_TIMEOUT)

    with _lock:
        return _public_url or _fallback_url()


def get_dashboard_public_url() -> str:
    fixed_url = _get_fixed_public_url()
    if fixed_url:
        return fixed_url

    with _lock:
        running_url = _public_url if _is_running(_process) else ''
    return running_url or start_dashboard_tunnel(wait=True)


def stop_dashboard_tunnel():
    global _process

    _stop_event.set()

    with _lock:
        process = _process
        _process = None

    if process is not None and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()


atexit.register(stop_dashboard_tunnel)