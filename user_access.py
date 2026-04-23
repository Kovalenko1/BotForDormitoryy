from sqlalchemy import inspect, text


def ensure_user_access_schema(engine):
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    if 'users' not in existing_tables:
        return

    existing_columns = {column['name'] for column in inspector.get_columns('users')}

    with engine.begin() as connection:
        if 'is_blocked' not in existing_columns:
            connection.execute(text(
                'ALTER TABLE users ADD COLUMN is_blocked BOOLEAN NOT NULL DEFAULT FALSE'
            ))

        if 'is_whitelisted' not in existing_columns:
            connection.execute(text(
                'ALTER TABLE users ADD COLUMN is_whitelisted BOOLEAN NOT NULL DEFAULT TRUE'
            ))

        connection.execute(text('UPDATE users SET is_blocked = FALSE WHERE is_blocked IS NULL'))
        connection.execute(text('UPDATE users SET is_whitelisted = TRUE WHERE is_whitelisted IS NULL'))
