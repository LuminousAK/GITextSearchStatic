import argparse
import json
import os
import re
from typing import Iterator, List, Tuple

from tqdm import tqdm

from DBConfig import LANG_MAP, LANG_PATH, connect, lang_db_path
from ftsNormalizer import normalize_for_fts

# example: TextMapRU_1.json & TextMapRU_2.json
TEXTMAP_FILE_RE = re.compile(r"^TextMap([A-Za-z]+)(?:_(\d+))?\.json$")


def _iter_textmap_files(lang_code: str) -> List[str]:
    '''获取某特定语言的所有文本字典文件，并按正确顺序排列'''
    files: List[Tuple[int, str]] = []
    for name in os.listdir(LANG_PATH):
        m = TEXTMAP_FILE_RE.match(name)
        if not m:
            continue
        code = m.group(1).upper()
        if code != lang_code.upper():
            continue
        seq = int(m.group(2)) if m.group(2) is not None else -1
        files.append((seq, name))

    files.sort(key=lambda item: item[0])
    return [name for _, name in files]


def _iter_entries(lang_code: str) -> Iterator[Tuple[int, str]]:
    files = _iter_textmap_files(lang_code)
    if not files:
        raise FileNotFoundError(f"No TextMap files found for language: {lang_code}")

    for file_name in files:
        file_path = os.path.join(LANG_PATH, file_name)
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        for hash_str, content in data.items():
            if content:
                # replace '\\n' with actual newlines '\n'
                yield int(hash_str), content.replace("\\n", "\n")


def import_language(lang_code: str, batch_size: int = 5000) -> None:
    lang_code = lang_code.upper()
    if lang_code not in LANG_MAP:
        raise ValueError(f"Unsupported language code: {lang_code}")

    conn = connect(lang_db_path(lang_code))
    cur = conn.cursor()

    cur.execute("DELETE FROM textMap")
    cur.execute("DELETE FROM search_fts WHERE source_type = 'textmap'")

    pending_map = []
    pending_fts = []
    total = 0

    for hash_value, content in tqdm(_iter_entries(lang_code), desc=f"TextMap-{lang_code}"):
        pending_map.append((hash_value, content))
        pending_fts.append((normalize_for_fts(content, lang_code), hash_value, hash_value))

        if len(pending_map) >= batch_size:
            cur.executemany("INSERT OR REPLACE INTO textMap(hash, content) VALUES (?, ?)", pending_map)
            cur.executemany(
                "INSERT INTO search_fts(content, source_type, source_id, key1, key2) VALUES (?, 'textmap', ?, ?, NULL)",
                pending_fts,
            )
            total += len(pending_map)
            pending_map.clear()
            pending_fts.clear()

    if pending_map:
        cur.executemany("INSERT OR REPLACE INTO textMap(hash, content) VALUES (?, ?)", pending_map)
        cur.executemany(
            "INSERT INTO search_fts(content, source_type, source_id, key1, key2) VALUES (?, 'textmap', ?, ?, NULL)",
            pending_fts,
        )
        total += len(pending_map)

    conn.commit()
    cur.execute("VACUUM;")
    conn.commit()
    cur.close()
    conn.close()

    print(f"[{lang_code}] imported {total} rows")


def import_all() -> None:
    for code in LANG_MAP.keys():
        import_language(code)


def main() -> None:
    parser = argparse.ArgumentParser(description="Import TextMap into per-language DB(s).")
    parser.add_argument("--lang", help="Single language code, e.g. EN")
    args = parser.parse_args()

    if args.lang:
        import_language(args.lang)
    else:
        import_all()


if __name__ == "__main__":
    main()
