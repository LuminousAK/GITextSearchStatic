-- META_SCHEMA_BEGIN
PRAGMA page_size = 4096;

CREATE TABLE IF NOT EXISTS langCode (
    id          INTEGER PRIMARY KEY,
    codeName    TEXT UNIQUE,
    displayName TEXT
);

CREATE TABLE IF NOT EXISTS avatar (
    avatarId        INTEGER PRIMARY KEY,
    nameTextMapHash INTEGER
);

CREATE TABLE IF NOT EXISTS chapter (
    chapterId               INTEGER PRIMARY KEY,
    chapterTitleTextMapHash INTEGER,
    chapterNumTextMapHash   INTEGER
);

CREATE TABLE IF NOT EXISTS dialogue (
    dialogueId  INTEGER PRIMARY KEY,
    talkerType  TEXT,
    talkerId    INTEGER,
    talkId      INTEGER,
    textHash    INTEGER,
    coopQuestId INTEGER
);

CREATE INDEX IF NOT EXISTS dialogue_talkId_index ON dialogue (talkId);
CREATE INDEX IF NOT EXISTS dialogue_textHash_index ON dialogue (textHash);

CREATE TABLE IF NOT EXISTS fetters (
    fetterId                 INTEGER PRIMARY KEY,
    avatarId                 INTEGER,
    voiceTitleTextMapHash    INTEGER,
    voiceFileTextTextMapHash INTEGER
);

CREATE INDEX IF NOT EXISTS fetters_voiceFileTextTextMapHash_index ON fetters (voiceFileTextTextMapHash);

CREATE TABLE IF NOT EXISTS quest (
    questId          INTEGER PRIMARY KEY,
    titleTextMapHash INTEGER,
    chapterId        INTEGER
);

CREATE TABLE IF NOT EXISTS questTalk (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    questId INTEGER,
    talkId  INTEGER
);

CREATE INDEX IF NOT EXISTS questTalk_talkId_index ON questTalk (talkId);
CREATE INDEX IF NOT EXISTS questTalk_questId_index ON questTalk (questId);

CREATE TABLE IF NOT EXISTS npc (
    npcId    INTEGER PRIMARY KEY,
    textHash INTEGER
);

CREATE TABLE IF NOT EXISTS manualTextMap (
    id        INTEGER PRIMARY KEY,
    textMapId TEXT UNIQUE,
    textHash  INTEGER
);

-- hash 维度的统一来源索引，前端可按 hash 直接取来源。
CREATE TABLE IF NOT EXISTS hashSource (
    hash        INTEGER,
    sourceType  TEXT,
    sourceId    INTEGER,
    extra       TEXT,
    PRIMARY KEY (hash, sourceType, sourceId, extra)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS hashSource_hash_index ON hashSource (hash);
-- META_SCHEMA_END

-- LANG_SCHEMA_BEGIN
PRAGMA page_size = 4096;

CREATE TABLE IF NOT EXISTS textMap (
    hash    INTEGER PRIMARY KEY,
    content TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS readable (
    fileName         TEXT PRIMARY KEY,
    content          TEXT NOT NULL,
    titleTextMapHash INTEGER,
    readableId       INTEGER
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS readable_readableId_index ON readable (readableId);

CREATE TABLE IF NOT EXISTS subtitle (
    fileName   TEXT,
    startTime  REAL,
    endTime    REAL,
    content    TEXT NOT NULL,
    subtitleId INTEGER,
    PRIMARY KEY (fileName, startTime)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS subtitle_fileName_index ON subtitle (fileName);
CREATE INDEX IF NOT EXISTS subtitle_subtitleId_index ON subtitle (subtitleId);

CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
    content,
    source_type UNINDEXED, -- textmap / readable / subtitle
    source_id UNINDEXED,   -- textMap.hash / readable.readableId / subtitle.subtitleId
    key1 UNINDEXED,        -- textmap: hash; readable: fileName; subtitle: fileName
    key2 UNINDEXED,        -- subtitle: startTime(text)
    tokenize = 'unicode61 remove_diacritics 0'
);
-- LANG_SCHEMA_END
