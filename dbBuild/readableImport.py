import json
import os

from tqdm import tqdm

from DBConfig import DATA_PATH, LANG_MAP, READABLE_PATH, connect, lang_db_path
from ftsNormalizer import normalize_for_fts


def load_document_config():
    """
    Loads DocumentExcelConfigData.json and creates a mapping from localization ID to titleTextMapHash.
    """
    doc_path = os.path.join(DATA_PATH, "ExcelBinOutput", "DocumentExcelConfigData.json")
    if not os.path.exists(doc_path):
        print(f"Document config not found: {doc_path}")
        return {}

    try:
        with open(doc_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error loading DocumentExcelConfigData.json: {e}")
        return {}

    # Map localization ID (in questIDList) to titleTextMapHash
    loc_id_to_title_hash = {}
    for entry in data:
        title_hash = entry.get("titleTextMapHash")
        quest_id_list = entry.get('questIDList', [])
        for loc_id in quest_id_list:
            loc_id_to_title_hash[loc_id] = title_hash

    return loc_id_to_title_hash


def load_localization_config(loc_id_to_title_hash):
    """
    Loads LocalizationExcelConfigData.json and creates a mapping from filename to info (titleTextMapHash, readableId).
    """
    loc_path = os.path.join(DATA_PATH, "ExcelBinOutput", "LocalizationExcelConfigData.json")
    if not os.path.exists(loc_path):
        print(f"Localization config not found: {loc_path}")
        return {}

    try:
        with open(loc_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error loading LocalizationExcelConfigData.json: {e}")
        return {}

    # Map filename to info
    filename_to_info = {}

    # Keys that might contain paths
    path_keys = [
        "dePath", "enPath", "esPath", "frPath", "idPath", "itPath",
        "jpPath", "krPath", "ptPath", "ruPath", "tcPath", "thPath",
        "trPath", "viPath", "EDPAFDDJJNM", "FNIFOPDJMMG",
    ]

    for entry in data:
        loc_id = entry.get("id")
        if loc_id not in loc_id_to_title_hash:
            continue

        title_hash = loc_id_to_title_hash[loc_id]

        for key in path_keys:
            path = entry.get(key)
            if isinstance(path, str) and "Readable" in path:
                # Extract filename from path
                # Path example: "ART/UI/Readable/DE/Poem1_DE"
                filename = os.path.basename(path)
                filename_to_info[filename] = {
                    "titleHash": title_hash,
                    "readableId": loc_id,
                }

    return filename_to_info


def import_readable():
    print("Loading document and localization configs...")
    loc_id_to_title_hash = load_document_config()
    filename_to_info = load_localization_config(loc_id_to_title_hash)
    print(f"Loaded {len(filename_to_info)} readable file mappings.")

    if not os.path.exists(READABLE_PATH):
        print(f"Readable path not found: {READABLE_PATH}")
        return

    for lang in LANG_MAP.keys():
        lang_path = os.path.join(READABLE_PATH, lang)
        if not os.path.isdir(lang_path):
            continue

        conn = connect(lang_db_path(lang))
        cursor = conn.cursor()
        cursor.execute("DELETE FROM search_fts WHERE source_type = 'readable'")

        sql_insert = (
            "INSERT OR REPLACE INTO readable(fileName, content, titleTextMapHash, readableId) "
            "VALUES (?,?,?,?)"
        )
        sql_insert_fts = (
            "INSERT INTO search_fts(content, source_type, source_id, key1, key2) "
            "VALUES (?, 'readable', ?, ?, NULL)"
        )

        files = os.listdir(lang_path)
        print(f"Importing readable for {lang}...")
        for file_name in tqdm(files):
            file_path = os.path.join(lang_path, file_name)
            if not os.path.isfile(file_path):
                continue

            name_without_ext = os.path.splitext(file_name)[0]
            info = filename_to_info.get(name_without_ext) or filename_to_info.get(file_name)

            title_hash = info["titleHash"] if info else None
            readable_id = info["readableId"] if info else None

            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()
                fts_content = normalize_for_fts(content, lang)
                cursor.execute(sql_insert, (file_name, content, title_hash, readable_id))
                cursor.execute(sql_insert_fts, (fts_content, readable_id, file_name))
            except Exception as e:
                print(f"Error reading {file_name}: {e}")

        conn.commit()
        cursor.close()
        conn.close()


if __name__ == "__main__":
    import_readable()
