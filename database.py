from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from config import (
    POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB,
    POSTGRES_HOST, POSTGRES_PORT
)

DATABASE_URL = (
    f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
)

engine = create_engine(DATABASE_URL, echo=False)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db_session():
    """
    Генератор сессии, который можно использовать в обработчиках:

    with get_db_session() as session:
        # ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
