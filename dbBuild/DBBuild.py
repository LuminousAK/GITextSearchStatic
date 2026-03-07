import json
import os
import re

from tqdm import tqdm

import readableImport
import subtitleImport
import textMapImport
from DBConfig import DATA_PATH, connect, meta_db_path
from dbPublish import build_db_manifest

TALK_KEYSETS = [
    {
        "detect": "talkId",
        "mapping": {
            "talk_id": "talkId",
            "dialogue_list": "dialogList",
            "dialogue_id": "id",
            "role": "talkRole",
            "role_type": "type",
            "role_id": "_id",
            "text_hash": "talkContentTextMapHash",
        },
    },
    # 6.4
    {
        # Obfuscated field names seen in some data package versions.
        "detect": "LBPGKDMGFBN",
        "mapping": {
            "talk_id": "LBPGKDMGFBN",
            "dialogue_list": "LOJEOMAPIIM",
            "dialogue_id": "BLKKAMEMBBJ",
            "role": "HJIPOJOECIF",
            "role_type": "_type",
            "role_id": "_id",
            "text_hash": "CMKPOJOEHHA",
        },
    },
]

QUEST_KEYSETS = [
    {
        "detect": "id",
        "mapping": {
            "quest_id": "id",
            "title_hash": "titleTextMapHash",
            "chapter_id": "chapterId",
            "talks": "talks",
            "talk_id": "id",
        },
    },
    # 6.4
    {
        # Obfuscated field names seen in some data package versions.
        "detect": "BLKKAMEMBBJ",
        "mapping": {
            "quest_id": "BLKKAMEMBBJ",
            "title_hash": "DMLOMLNJCNA",
            "chapter_id": "KDKGIPFDENG",
            "talks": "DGJMIPFDEOF",
            "talk_id": "BLKKAMEMBBJ",
        },
    },
]


def resolve_keys(obj, keysets):
    for keyset in keysets:
        if keyset["detect"] in obj:
            return keyset["mapping"]
    return None


def _meta_conn():
    return connect(meta_db_path())


def import_talk(meta_conn):
    cursor = meta_conn.cursor()
    talk_root = os.path.join(DATA_PATH, "BinOutput", "Talk")
    folders = os.listdir(talk_root)

    sql = (
        "INSERT OR IGNORE INTO dialogue(dialogueId, talkerId, talkerType, talkId, textHash, coopQuestId) "
        "VALUES (?,?,?,?,?,?)"
    )

    for folder in folders:
        folder_path = os.path.join(talk_root, folder)
        if not os.path.isdir(folder_path):
            continue

        files = os.listdir(folder_path)
        print(f"importing talk {folder}")

        for file_name in tqdm(files):
            file_path = os.path.join(folder_path, file_name)
            obj = json.load(open(file_path, encoding="utf-8"))

            keys = resolve_keys(obj, TALK_KEYSETS)
            if keys is None:
                print(f"Skipping {folder}\\{file_name}")
                continue

            if keys["dialogue_list"] not in obj or len(obj[keys["dialogue_list"]]) == 0:
                continue

            coop_quest_id = None
            if folder == "Coop":
                coop_match = re.match(r"^([0-9]+)_[0-9]+\.json$", file_name)
                if coop_match:
                    coop_quest_id = int(coop_match.group(1))

            talk_id = obj[keys["talk_id"]]

            for dialogue in obj[keys["dialogue_list"]]:
                dialogue_id = dialogue[keys["dialogue_id"]]
                role_id = -1
                role_type = None
                if (
                    keys["role"] in dialogue
                    and keys["role_id"] in dialogue[keys["role"]]
                    and keys["role_type"] in dialogue[keys["role"]]
                ):
                    role_id = dialogue[keys["role"]][keys["role_id"]]
                    role_type = dialogue[keys["role"]][keys["role_type"]]

                if keys["text_hash"] not in dialogue:
                    continue

                text_hash = dialogue[keys["text_hash"]]

                cursor.execute(
                    sql,
                    (
                        dialogue_id,
                        role_id,
                        role_type,
                        talk_id,
                        text_hash,
                        coop_quest_id,
                    ),
                )

    cursor.close()
    meta_conn.commit()


def import_avatars(meta_conn):
    cursor = meta_conn.cursor()
    avatars = json.load(open(os.path.join(DATA_PATH, "ExcelBinOutput", "AvatarExcelConfigData.json"), encoding="utf-8"))
    
    sql = "INSERT OR REPLACE INTO avatar(avatarId, nameTextMapHash) VALUES (?,?)"
    
    for avatar in avatars:
        cursor.execute(sql, (avatar["id"], avatar["nameTextMapHash"]))

    cursor.close()
    meta_conn.commit()


def import_fetters(meta_conn):
    cursor = meta_conn.cursor()
    fetters = json.load(open(os.path.join(DATA_PATH, "ExcelBinOutput", "FettersExcelConfigData.json"), encoding="utf-8"))
    sql = "INSERT OR REPLACE INTO fetters(fetterId, avatarId, voiceTitleTextMapHash, voiceFileTextTextMapHash) VALUES (?,?,?,?)"
    for fetter in fetters:
        cursor.execute(
            sql,
            (
                fetter["fetterId"],
                fetter["avatarId"],
                fetter["voiceTitleTextMapHash"],
                fetter["voiceFileTextTextMapHash"],
            ),
        )
    cursor.close()
    meta_conn.commit()


def import_quest(meta_conn):
    cursor = meta_conn.cursor()
    quest_root = os.path.join(DATA_PATH, "BinOutput", "Quest")
    files = os.listdir(quest_root)

    sql_quest = "INSERT OR REPLACE INTO quest(questId, titleTextMapHash, chapterId) VALUES (?,?,?)"
    sql_quest_talk = "INSERT INTO questTalk(questId, talkId) VALUES (?,?)"

    for file_name in tqdm(files):
        obj = json.load(open(os.path.join(quest_root, file_name), encoding="utf-8"))

        keys = resolve_keys(obj, QUEST_KEYSETS)
        if keys is None:
            print(f"Skipping {file_name}")
            continue

        quest_id = obj[keys["quest_id"]]
        
        if keys["title_hash"] in obj:
            title_hash = obj[keys["title_hash"]]
        else:
            title_hash = None
            print(f"questId {quest_id} doesn't have TitleTextMapHash!")

        chapter_id = obj.get(keys["chapter_id"])

        cursor.execute(sql_quest, (quest_id, title_hash, chapter_id))

        if keys["talks"] not in obj:
            print(f"questId {quest_id} doesn't have talks!")
        else:
            for talk in obj.get(keys["talks"], []):
                cursor.execute(sql_quest_talk, (quest_id, talk[keys["talk_id"]]))

    cursor.close()
    meta_conn.commit()


def import_chapters(meta_conn):
    cursor = meta_conn.cursor()
    chapters = json.load(open(os.path.join(DATA_PATH, "ExcelBinOutput", "ChapterExcelConfigData.json"), encoding="utf-8"))
    sql = "INSERT OR REPLACE INTO chapter(chapterId, chapterTitleTextMapHash, chapterNumTextMapHash) VALUES (?,?,?)"
    for chapter in chapters:
        cursor.execute(sql, (chapter["id"], chapter["chapterTitleTextMapHash"], chapter["chapterNumTextMapHash"]))
    cursor.close()
    meta_conn.commit()


def import_npcs(meta_conn):
    cursor = meta_conn.cursor()
    npcs = json.load(open(os.path.join(DATA_PATH, "ExcelBinOutput", "NpcExcelConfigData.json"), encoding="utf-8"))
    sql = "INSERT OR REPLACE INTO npc(npcId, textHash) VALUES (?,?)"
    for npc in npcs:
        cursor.execute(sql, (npc["id"], npc["nameTextMapHash"]))
    cursor.close()
    meta_conn.commit()


def import_manual_textmap(meta_conn):
    cursor = meta_conn.cursor()
    placeholders = json.load(open(os.path.join(DATA_PATH, "ExcelBinOutput", "ManualTextMapConfigData.json"), encoding="utf-8"))
    sql = "INSERT OR REPLACE INTO manualTextMap(id, textMapId, textHash) VALUES (NULL, ?, ?)"
    for item in placeholders:
        cursor.execute(sql, (item["textMapId"], item["textMapContentTextMapHash"]))
    cursor.close()
    meta_conn.commit()


def rebuild_hash_source(meta_conn):
    cursor = meta_conn.cursor()
    cursor.execute("DELETE FROM hashSource")

    inserts = [
        "INSERT OR IGNORE INTO hashSource(hash, sourceType, sourceId, extra) SELECT textHash, 'dialogue', dialogueId, CAST(talkId AS TEXT) FROM dialogue WHERE textHash IS NOT NULL",
        "INSERT OR IGNORE INTO hashSource(hash, sourceType, sourceId, extra) SELECT textHash, 'npc_name', npcId, NULL FROM npc WHERE textHash IS NOT NULL",
        "INSERT OR IGNORE INTO hashSource(hash, sourceType, sourceId, extra) SELECT textHash, 'manual_text', id, textMapId FROM manualTextMap WHERE textHash IS NOT NULL",
        "INSERT OR IGNORE INTO hashSource(hash, sourceType, sourceId, extra) SELECT nameTextMapHash, 'avatar_name', avatarId, NULL FROM avatar WHERE nameTextMapHash IS NOT NULL",
        "INSERT OR IGNORE INTO hashSource(hash, sourceType, sourceId, extra) SELECT voiceTitleTextMapHash, 'fetter_voice_title', fetterId, CAST(avatarId AS TEXT) FROM fetters WHERE voiceTitleTextMapHash IS NOT NULL",
        "INSERT OR IGNORE INTO hashSource(hash, sourceType, sourceId, extra) SELECT voiceFileTextTextMapHash, 'fetter_voice_text', fetterId, CAST(avatarId AS TEXT) FROM fetters WHERE voiceFileTextTextMapHash IS NOT NULL",
        "INSERT OR IGNORE INTO hashSource(hash, sourceType, sourceId, extra) SELECT titleTextMapHash, 'quest_title', questId, CAST(chapterId AS TEXT) FROM quest WHERE titleTextMapHash IS NOT NULL",
        "INSERT OR IGNORE INTO hashSource(hash, sourceType, sourceId, extra) SELECT chapterTitleTextMapHash, 'chapter_title', chapterId, NULL FROM chapter WHERE chapterTitleTextMapHash IS NOT NULL",
        "INSERT OR IGNORE INTO hashSource(hash, sourceType, sourceId, extra) SELECT chapterNumTextMapHash, 'chapter_num', chapterId, NULL FROM chapter WHERE chapterNumTextMapHash IS NOT NULL",
    ]

    for sql in inserts:
        cursor.execute(sql)

    meta_conn.commit()
    cursor.close()


def main():
    meta_conn = _meta_conn()

    print("Importing talks...")
    import_talk(meta_conn)

    print("Importing avatars...")
    import_avatars(meta_conn)

    print("Importing NPCs...")
    import_npcs(meta_conn)

    print("Importing ManualTextMap...")
    import_manual_textmap(meta_conn)

    print("Importing fetters...")
    import_fetters(meta_conn)

    print("Importing quests...")
    import_quest(meta_conn)

    print("Importing chapters...")
    import_chapters(meta_conn)

    print("Importing readable...")
    readableImport.import_readable()

    print("Importing subtitles...")
    subtitleImport.import_subtitles()

    print("Rebuilding hashSource...")
    rebuild_hash_source(meta_conn)

    print("Importing textmaps into per-language DBs...")
    textMapImport.import_all()

    print("Optimizing meta database...")
    cur = meta_conn.cursor()
    cur.execute("VACUUM;")
    meta_conn.commit()
    cur.close()
    meta_conn.close()

    print("Publishing DB artifacts (chunk + manifest)...")
    build_db_manifest()

    print("Done!")


if __name__ == "__main__":
    main()
