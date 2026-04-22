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
