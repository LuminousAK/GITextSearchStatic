from pathlib import Path

from DBConfig import (
    LANG_DISPLAY_NAME,
    LANG_MAP,
    connect,
    lang_db_path,
    meta_db_path,
)

DDL_FILE = Path(__file__).with_name("databaseDDL.sql")


def _load_schema_section(start_marker: str, end_marker: str) -> str:
    ddl_text = DDL_FILE.read_text(encoding="utf-8")
    start = ddl_text.find(start_marker)
    end = ddl_text.find(end_marker)
    if start == -1 or end == -1 or end <= start:
        raise RuntimeError(f"Cannot locate DDL section: {start_marker} -> {end_marker}")
    start += len(start_marker)
    return ddl_text[start:end].strip()


def _reset_db_file(path: Path) -> None:
    if path.exists():
        path.unlink()


def _init_meta_db(meta_schema_sql: str) -> None:
    path = meta_db_path()
    _reset_db_file(path)

    conn = connect(path)
    cur = conn.cursor()
    cur.executescript(meta_schema_sql)

    for code, lang_id in LANG_MAP.items():
        cur.execute(
            "INSERT INTO langCode(id, codeName, displayName) VALUES (?, ?, ?)",
            (lang_id, code, LANG_DISPLAY_NAME[code]),
        )

    conn.commit()
    cur.close()
    conn.close()


def _init_lang_dbs(lang_schema_sql: str) -> None:
    for code in LANG_MAP.keys():
        path = lang_db_path(code)
        _reset_db_file(path)

        conn = connect(path)
        cur = conn.cursor()
        cur.executescript(lang_schema_sql)
        conn.commit()
        cur.close()
        conn.close()


def build() -> None:
    meta_schema = _load_schema_section("-- META_SCHEMA_BEGIN", "-- META_SCHEMA_END")
    lang_schema = _load_schema_section("-- LANG_SCHEMA_BEGIN", "-- LANG_SCHEMA_END")

    _init_meta_db(meta_schema)
    _init_lang_dbs(lang_schema)

    print("Initialized meta DB + language DBs. Next run DBBuild.py.")


if __name__ == "__main__":
    build()
