import json
import os
import re

from tqdm import main, tqdm

from DBConfig import DATA_PATH, LANG_MAP, SUBTITLE_PATH, connect, lang_db_path
from ftsNormalizer import normalize_for_fts

LOCALIZATION_PATH_KEYS = [
    "dePath", "enPath", "esPath", "frPath", "idPath", "itPath",
    "jpPath", "krPath", "ptPath", "ruPath", "tcPath", "thPath",
    "trPath", "viPath",
]

# Obfuscated field names seen in some data package versions.
LOCALIZATION_PATH_KEYS_OBFUSCATED = [
    # "EDPAFDDJJNM", "FNIFOPDJMMG",  # 6.3
    "GDDDAAPHELI", "KMGOJMCBKDK",  # 6.4
]

ALL_LOCALIZATION_PATH_KEYS = LOCALIZATION_PATH_KEYS + LOCALIZATION_PATH_KEYS_OBFUSCATED


def load_localization_config():
    """
    Loads LocalizationExcelConfigData.json and creates a mapping from filename to info (subtitleId).
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

    for entry in data:
        # Only care about LOC_SUBTITLE
        if entry.get("assetType") != "LOC_SUBTITLE":
            continue

        subtitle_id = entry.get("id")

        for key in ALL_LOCALIZATION_PATH_KEYS:
            path = entry.get(key)
            if isinstance(path, str):
                # Extract filename from path
                # Path example: "CHS/Ambor_Readings_CHS.mihoyobin"
                # We need to match this with the actual .srt filename
                # Actual .srt filename: Ambor_Readings_CHS.srt
                # So we extract the basename without extension
                filename_no_ext = os.path.splitext(os.path.basename(path))[0]
                filename_to_info[filename_no_ext] = {"subtitleId": subtitle_id}

    return filename_to_info


def parse_srt_time(time_str):
    """将 SRT 时间字符串 (00:00:01,500) 转换为秒 (1.5)"""
    try:
        time_str = time_str.replace(",", ".")
        h, m, s = time_str.split(":")
        return float(h) * 3600 + float(m) * 60 + float(s)
    except Exception:
        return 0.0


def import_subtitles():
    print("Loading localization configs for subtitles...")
    filename_to_info = load_localization_config()
    print(f"Loaded {len(filename_to_info)} subtitle file mappings.")

    print("Importing Subtitles (srt)...")
    if not os.path.exists(SUBTITLE_PATH):
        print(f"Subtitle path not found: {SUBTITLE_PATH}")
        return

    for lang_name in LANG_MAP.keys():
        lang_path = os.path.join(SUBTITLE_PATH, lang_name)
        if not os.path.exists(lang_path):
            continue

        conn = connect(lang_db_path(lang_name))
        cursor = conn.cursor()
        cursor.execute("DELETE FROM search_fts WHERE source_type = 'subtitle'")

        sql_insert = (
            "INSERT OR REPLACE INTO subtitle(fileName, startTime, endTime, content, subtitleId) "
            "VALUES (?,?,?,?,?)"
        )
        sql_insert_fts = (
            "INSERT INTO search_fts(content, source_type, source_id, key1, key2) "
            "VALUES (?, 'subtitle', ?, ?, ?)"
        )

        subtitle_files = []
        for root, _, files in os.walk(lang_path):
            for file_name in files:
                if file_name.endswith(".srt"):
                    subtitle_files.append(os.path.join(root, file_name))

        print(f"  Processing {lang_name} ({len(subtitle_files)} files)...")

        for full_path in tqdm(subtitle_files):
            file_name = os.path.basename(full_path)
            name_without_ext = os.path.splitext(file_name)[0]
            rel_path = os.path.relpath(full_path, lang_path)
            clean_name = os.path.splitext(rel_path)[0].replace(os.sep, "/")

            info = filename_to_info.get(name_without_ext)
            subtitle_id = info["subtitleId"] if info else None

            try:
                with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()

                # 简单的 SRT 解析: 按空行分割块
                blocks = re.split(r"\r?\n\s*\r?\n", content.strip())
                for block in blocks:
                    lines = [line.strip() for line in block.splitlines() if line.strip()]
                    if len(lines) < 2:
                        continue

                    # 查找包含 '-->' 的时间行
                    time_line_idx = -1
                    for idx, line in enumerate(lines):
                        if "-->" in line:
                            time_line_idx = idx
                            break
                    if time_line_idx == -1:
                        continue

                    # 解析时间
                    time_parts = lines[time_line_idx].split("-->")
                    if len(time_parts) != 2:
                        continue

                    start_time = parse_srt_time(time_parts[0].strip())
                    end_time = parse_srt_time(time_parts[1].strip())

                    # 获取文本内容 (时间行之后的所有行)
                    text_lines = lines[time_line_idx + 1:]
                    text_content = "\n".join(text_lines)

                    if text_content:
                        fts_content = normalize_for_fts(text_content, lang_name)
                        cursor.execute(
                            sql_insert,
                            (clean_name, start_time, end_time, text_content, subtitle_id),
                        )
                        cursor.execute(
                            sql_insert_fts,
                            (fts_content, subtitle_id, clean_name, str(start_time)),
                        )

            except Exception as e:
                print(f"Error processing {file_name} in {lang_name}: {e}")

        conn.commit()
        cursor.close()
        conn.close()


if __name__ == "__main__":
    import_subtitles()
