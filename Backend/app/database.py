import os
import psycopg2
from urllib.parse import urlparse
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Retrieve database connection URL from environment variables
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/sbud")

# Connection arguments (e.g. check_same_thread is required only for SQLite)
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

# Create the SQLAlchemy engine
engine = create_engine(DATABASE_URL, connect_args=connect_args)

# Create a session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Declarative base class for models
Base = declarative_base()

def get_db():
    """
    FastAPI dependency that yields a database session and closes it after the request.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def create_db_if_not_exists():
    """
    Connects to the default 'postgres' database and creates the target database if it doesn't exist.
    Skipped if using SQLite.
    """
    if DATABASE_URL.startswith("sqlite"):
        return
        
    try:
        parsed = urlparse(DATABASE_URL)
        dbname = parsed.path.lstrip('/')
        if not dbname:
            return
            
        # Connect to default DB 'postgres' to check/create the target database
        conn = psycopg2.connect(
            host=parsed.hostname,
            port=parsed.port or 5432,
            user=parsed.username,
            password=parsed.password,
            dbname="postgres"
        )
        conn.autocommit = True
        with conn.cursor() as cursor:
            cursor.execute("SELECT 1 FROM pg_catalog.pg_database WHERE datname = %s;", (dbname,))
            exists = cursor.fetchone()
            if not exists:
                print(f"Database '{dbname}' does not exist. Creating database '{dbname}'...")
                cursor.execute(f'CREATE DATABASE "{dbname}";')
                print(f"Database '{dbname}' created successfully.")
            else:
                print(f"Database '{dbname}' already exists.")
        conn.close()
    except Exception as e:
        print(f"WARNING: Automatic database creation check failed: {e}")
        print("Continuing initialization under the assumption that the database exists or will be created manually.")

def init_db():
    """
    Checks database existence and creates all tables defined in models.
    """
    create_db_if_not_exists()
    
    # Import models to register them on Base.metadata
    from app import models
    Base.metadata.create_all(bind=engine)
