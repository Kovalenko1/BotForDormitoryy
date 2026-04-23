import os


def _get_int_env(name, default):
	value = os.getenv(name)
	if value in (None, ""):
		return default
	return int(value)


def _get_int_list_env(name, default):
	value = os.getenv(name)
	if value in (None, ""):
		return default
	return [int(item.strip()) for item in value.split(",") if item.strip()]


def _get_bool_env(name, default=False):
	value = os.getenv(name)
	if value in (None, ""):
		return default
	return value.strip().lower() in {"1", "true", "yes", "on"}


BOT_TOKEN = os.getenv("BOT_TOKEN", "")
TEST_TOKEN = os.getenv("TEST_TOKEN", "")

ADMINS_LIST = _get_int_list_env("ADMINS_LIST", [752455616])

DATABASE_URL = os.getenv("DATABASE_URL")
POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "postgres")
POSTGRES_DB = os.getenv("POSTGRES_DB", "dorm2")
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT = _get_int_env("POSTGRES_PORT", 6565)

NOTIFICATION_HOUR = _get_int_env("NOTIFICATION_HOUR", 20)
NOTIFICATION_MINUTE = _get_int_env("NOTIFICATION_MINUTE", 0)

DASHBOARD_PUBLIC_URL = os.getenv("DASHBOARD_PUBLIC_URL", "http://localhost:8000")
DASHBOARD_TOKEN_TTL_SECONDS = _get_int_env("DASHBOARD_TOKEN_TTL_SECONDS", 1800)
DASHBOARD_WEBAPP_MAX_AGE_SECONDS = _get_int_env("DASHBOARD_WEBAPP_MAX_AGE_SECONDS", 3600)
DASHBOARD_TUNNEL_ENABLED = _get_bool_env("DASHBOARD_TUNNEL_ENABLED", True)
DASHBOARD_TUNNEL_HOST = os.getenv("DASHBOARD_TUNNEL_HOST", "localhost.run")
DASHBOARD_TUNNEL_TARGET_HOST = os.getenv("DASHBOARD_TUNNEL_TARGET_HOST", "web")
DASHBOARD_TUNNEL_TARGET_PORT = _get_int_env("DASHBOARD_TUNNEL_TARGET_PORT", 8000)
DASHBOARD_TUNNEL_START_TIMEOUT = _get_int_env("DASHBOARD_TUNNEL_START_TIMEOUT", 12)

WEB_HOST = os.getenv("WEB_HOST", "0.0.0.0")
WEB_PORT = _get_int_env("WEB_PORT", 8000)
WEB_SSL_CERTFILE = os.getenv("WEB_SSL_CERTFILE", "")
WEB_SSL_KEYFILE = os.getenv("WEB_SSL_KEYFILE", "")
WEB_SSL_KEYFILE_PASSWORD = os.getenv("WEB_SSL_KEYFILE_PASSWORD", "")
WEB_FORCE_HTTPS = _get_bool_env("WEB_FORCE_HTTPS", False)
WEB_FORWARDED_ALLOW_IPS = os.getenv("WEB_FORWARDED_ALLOW_IPS", "*")
