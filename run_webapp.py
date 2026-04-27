from pathlib import Path

import uvicorn

from config import (
    WEB_FORWARDED_ALLOW_IPS,
    WEB_HOST,
    WEB_PORT,
    WEB_SSL_CERTFILE,
    WEB_SSL_KEYFILE,
    WEB_SSL_KEYFILE_PASSWORD,
)


def _normalize_optional_path(value: str, default_filename: str | None = None) -> str | None:
    normalized = value.strip()
    if not normalized:
        return None

    path = Path(normalized).expanduser()
    if (
        default_filename
        and path.name not in {'fullchain.pem', 'cert.pem', 'privkey.pem', 'key.pem'}
        and path.suffix.lower() != '.pem'
    ):
        path = path / default_filename

    return str(path)


def main():
    certfile = _normalize_optional_path(WEB_SSL_CERTFILE, 'fullchain.pem')
    keyfile = _normalize_optional_path(WEB_SSL_KEYFILE, 'privkey.pem')

    if bool(certfile) != bool(keyfile):
        raise RuntimeError("WEB_SSL_CERTFILE and WEB_SSL_KEYFILE must be set together.")

    uvicorn.run(
        "webapp:app",
        host=WEB_HOST,
        port=WEB_PORT,
        forwarded_allow_ips=WEB_FORWARDED_ALLOW_IPS,
        proxy_headers=True,
        ssl_certfile=certfile,
        ssl_keyfile=keyfile,
        ssl_keyfile_password=WEB_SSL_KEYFILE_PASSWORD or None,
        factory=False,
    )


if __name__ == "__main__":
    main()
