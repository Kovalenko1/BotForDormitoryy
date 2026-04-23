import atexit
import re
import subprocess
import threading

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
_lock = threading.Lock()
_process: subprocess.Popen[str] | None = None
_public_url = ''
_url_ready = threading.Event()
_reader_thread: threading.Thread | None = None


def _fallback_url() -> str:
    if DASHBOARD_TUNNEL_ENABLED:
        return ''
    return DASHBOARD_PUBLIC_URL.strip()


def _build_command() -> list[str]:
    return [
        'ssh',
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'UserKnownHostsFile=/dev/null',
        '-o', 'ServerAliveInterval=30',
        '-o', 'ExitOnForwardFailure=yes',
        '-R', f'80:{DASHBOARD_TUNNEL_TARGET_HOST}:{DASHBOARD_TUNNEL_TARGET_PORT}',
        f'nokey@{DASHBOARD_TUNNEL_HOST}',
    ]


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
    global _process, _public_url, _reader_thread

    if not DASHBOARD_TUNNEL_ENABLED:
        return _fallback_url()

    with _lock:
        if _is_running(_process) and _public_url:
            return _public_url

        if not _is_running(_process):
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

    if wait:
        _url_ready.wait(timeout=DASHBOARD_TUNNEL_START_TIMEOUT)

    with _lock:
        return _public_url or _fallback_url()


def get_dashboard_public_url() -> str:
    with _lock:
        running_url = _public_url if _is_running(_process) else ''
    return running_url or start_dashboard_tunnel(wait=True)


def stop_dashboard_tunnel():
    global _process

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