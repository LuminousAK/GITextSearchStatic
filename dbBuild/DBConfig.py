import os
import sqlite3
from pathlib import Path

# 数据的根目录
DATA_PATH = r"E:\AnimeGameData-master"

# 数据的TextMap文件夹位置，请在其中放置需要导入的语言json，并保持其TextMapXX.json的文件名不变
LANG_PATH = os.path.join(DATA_PATH, "TextMap")

# 数据的Readable文件夹位置
READABLE_PATH = os.path.join(DATA_PATH, "Readable")

# 数据的Subtitle文件夹位置
SUBTITLE_PATH = os.path.join(DATA_PATH, "Subtitle")

# 输出目录（用于 sql.js-httpvfs 分片部署）
OUTPUT_DIR = Path("../db").resolve()
META_DB_NAME = "meta.db"
LANG_DB_TEMPLATE = "lang_{code}.db"

# 语言定义
LANG_MAP = {
    "CHS": 1,
    "CHT": 2,
    "DE": 3,
    "EN": 4,
    "ES": 5,
    "FR": 6,
    "ID": 7,
    "IT": 8,
    "JP": 9,
    "KR": 10,
    "PT": 11,
    "RU": 12,
    "TH": 13,
    "TR": 14,
    "VI": 15,
}

LANG_DISPLAY_NAME = {
    "CHS": "简体中文",
    "CHT": "繁體中文",
    "DE": "Deutsch",
    "EN": "English",
    "ES": "Español",
    "FR": "Français",
    "ID": "Bahasa Indonesia",
    "IT": "Italiano",
    "JP": "日本語",
    "KR": "한국어",
    "PT": "Português",
    "RU": "Русский",
    "TH": "ไทย",
    "TR": "Türkçe",
    "VI": "Tiếng Việt",
}


def ensure_output_dir() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def meta_db_path() -> Path:
    ensure_output_dir()
    return OUTPUT_DIR / META_DB_NAME


def lang_db_path(lang_code: str) -> Path:
    ensure_output_dir()
    return OUTPUT_DIR / LANG_DB_TEMPLATE.format(code=lang_code.lower())


def connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    return conn
