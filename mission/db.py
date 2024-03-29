from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

user = "root"
password = "1234"
host = "localhost:3306"
db_name = "team_minimap"

# user = "ngoc"
# password = "K4$d9BP&B"
# host = "localhost:3306"
# db_name = "team_minimap"

DATABASE_URL = 'mysql+mysqlconnector://%s:%s@%s/%s?charset=utf8' % (
    user,
    password,
    host,
    db_name,
)

ENGINE = create_engine(
    DATABASE_URL, 
    encoding="utf-8"
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=ENGINE)

Base = declarative_base()
