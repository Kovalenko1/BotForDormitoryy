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


def _normalize_optional_path(value: str) -> str | None:
    normalized = value.strip()
    if not normalized:
        return None
    return str(Path(normalized).expanduser())


def main():
    certfile = _normalize_optional_path(WEB_SSL_CERTFILE)
    keyfile = _normalize_optional_path(WEB_SSL_KEYFILE)

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
