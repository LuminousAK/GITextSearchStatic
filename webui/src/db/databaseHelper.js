import { executeLangQuery, executeMetaQuery } from "./dbService";

const CJK_CHAR_RE = /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/g;  //匹配所有CJK字符
const HAS_CJK_RE = /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/;  //检测是否含有CJK字符
const ADVANCED_FTS_PREFIX_RE = /^fts:\s*/i;  //匹配以"fts:"开头的查询，忽略大小写

// 在CJK字符之间添加空格，保证unicode61 tokenizer正确分词
export const normalizeMatchKeyword = (keyword) => {
    if (!keyword || !HAS_CJK_RE.test(keyword)) {
        return keyword;  //没有CJK字符，直接返回原字符串
    }
    return keyword
        .replace(CJK_CHAR_RE, " $& ")  //CJK字符前后加空格
        .replace(/\s+/g, " ")  //连续空格合并为单个空格
        .trim();  //去除字符串头尾空格
};

// 检查是否高级模式：以"fts:"开头的查询被视为高级模式，允许用户直接输入FTS查询语法
export const isAdvancedFtsQuery = (keyword) => {
    if (typeof keyword !== "string") {
        return false;
    }
    return ADVANCED_FTS_PREFIX_RE.test(keyword.trim());
};

// 转义FTS查询中的双引号（因为将使用双引号包裹查询）
export const escapeFtsPhrase = (keyword) => {
    if (typeof keyword !== "string") {
        return "";
    }
    return keyword.replace(/"/g, "\"\"");
};

// 如果是高级模式，去掉前缀"fts:"后直接使用用户输入的内容作为查询语句
// 否则使用双引号包裹查询
export const buildFtsMatchQuery = (keyword) => {
    const trimmedKeyword = typeof keyword === "string" ? keyword.trim() : "";
    if (!trimmedKeyword) {
        return trimmedKeyword;
    }

    if (isAdvancedFtsQuery(trimmedKeyword)) {
        return trimmedKeyword.replace(ADVANCED_FTS_PREFIX_RE, "").trim();
    }

    return `"${escapeFtsPhrase(trimmedKeyword)}"`;
};

// 对输入的搜索关键词进行处理，构建FTS查询语句，并执行查询
// 并从对应真实表拿真实文本数据
export const searchFts = async (keyword, langCode) => {
    const normalizedKeyword = normalizeMatchKeyword(keyword);
    const matchQuery = buildFtsMatchQuery(normalizedKeyword);
    const advancedMode = isAdvancedFtsQuery(normalizedKeyword);
    const sql = `
        SELECT
            search_fts.source_type,
            search_fts.source_id,
            search_fts.key1,
            search_fts.key2,
            CASE
                WHEN search_fts.source_type = 'textmap' THEN textMap.content
                WHEN search_fts.source_type = 'readable' THEN readable.content
                WHEN search_fts.source_type = 'subtitle' THEN subtitle.content
                ELSE NULL
            END AS contentPreview
        FROM search_fts
        LEFT JOIN textMap
            ON search_fts.source_type = 'textmap'
            AND textMap.hash = search_fts.source_id
        LEFT JOIN readable
            ON search_fts.source_type = 'readable'
            AND (
                readable.readableId = search_fts.source_id
                OR readable.fileName = search_fts.key1
            )
        LEFT JOIN subtitle
            ON search_fts.source_type = 'subtitle'
            AND subtitle.fileName = search_fts.key1
            AND ABS(subtitle.startTime - CAST(search_fts.key2 AS REAL)) < 0.001
        WHERE search_fts.content MATCH ?
        ORDER BY bm25(search_fts, 10.0)
        LIMIT 200;
    `;
    try {
        return await executeLangQuery(langCode, sql, [matchQuery]);
    } catch (error) {
        if (advancedMode) {
            const detail = error instanceof Error ? `: ${error.message}` : "";
            throw new Error(`FTS query syntax error. Please check your 'fts:' expression${detail}`);
        }
        throw error;
    }
};

/**
 * 根据关键词查询TextMap内容
 * @deprecated 废弃，建议使用searchFts直接查询并根据source_type过滤结果
 */
export const selectTextMapFromKeyword = async (keyword, langCode) => {
    const rows = await searchFts(keyword, langCode);
    const seen = new Set();
    const results = [];
    for (const row of rows) {
        if (row.source_type !== "textmap") {
            continue;
        }
        const hash = Number(row.source_id ?? row.key1);
        if (!Number.isFinite(hash) || seen.has(hash)) {
            continue;
        }
        seen.add(hash);
        results.push({ hash, content: row.contentPreview });
    }
    return results;
};

// 根据textHash获取多个语言对应的文本内容
export const selectTextMapFromTextHash = async (textHash, langs = []) => {
    if (!langs || langs.length === 0) {
        return [];
    }
    // 每个语言去对应数据库查询一次
    const queryTasks = langs.map(async (lang) => {
        const rows = await executeLangQuery(lang, "select content from textMap where hash=?", [textHash]);
        return rows.map((row) => ({ content: row.content, lang }));
    });
    const groupedRows = await Promise.all(queryTasks);  //并发查询
    return groupedRows.flat();
};

// 获取已导入的语言列表
export const getImportedTextMapLangs = async () => {
    const sql = "select id, displayName from langCode order by id";
    return await executeMetaQuery(sql);
};

// 根据textHash查询对应角色语音的来源信息，返回格式为"角色名 · 语音名"
// TODO：可优化：减少数据库查询次数
// TODO：可以考虑加缓存？
export const getSourceFromFetter = async (textHash, langCode = 1) => {
    const sql = `
        SELECT avatarId, voiceTitleTextMapHash
        FROM fetters
        WHERE voiceFileTextTextMapHash = ?
        LIMIT 1
    `;
    const rows = await executeMetaQuery(sql, [textHash]);
    if (rows.length === 0) return null;

    const { avatarId, voiceTitleTextMapHash } = rows[0];
    const [voiceTitle, avatarName] = await Promise.all([
        getTextMapContent(voiceTitleTextMapHash, langCode),
        getCharterName(avatarId, langCode),
    ]);
    if (!voiceTitle || !avatarName) return null;
    return `${avatarName} · ${voiceTitle}`;
};

// 根据avatarId查询角色名字
export const getCharterName = async (avatarId, langCode = 1) => {
    const sql = "select nameTextMapHash from avatar where avatarId=?";
    const rows = await executeMetaQuery(sql, [avatarId]);
    if (rows.length === 0) return null;
    return await getTextMapContent(rows[0].nameTextMapHash, langCode);
};

const wanderNames = {};
const travellerNames = {};

export const getWanderName = async (langCode = 1) => {
    if (!wanderNames[langCode]) {
        wanderNames[langCode] = getCharterName(10000075, langCode);
    }
    return await wanderNames[langCode];
};

export const getTravellerName = async (langCode = 1) => {
    if (!travellerNames[langCode]) {
        travellerNames[langCode] = getCharterName(10000005, langCode);
    }
    return await travellerNames[langCode];
};

// TODO：小家伙的名字
export const getLittleOneName = async (langCode = 1) => {
    return "小家伙";
};

export const getTalkInfo = async (textHash) => {
    const sql = "select talkerType, talkerId, talkId, coopQuestId from dialogue where textHash=?";
    const rows = await executeMetaQuery(sql, [textHash]);
    return rows.length > 0 ? rows[0] : null;
};

// 获取说话人的名字
// TODO: 特殊对象的名字由用户在设置中自定义
export const getTalkerName = async (talkerType, talkerId, langCode = 1) => {
    let talkerName = null;
    if (talkerType === "TALK_ROLE_NPC") {  // NPC
        const sql = "select textHash from npc where npcId = ?";
        const rows = await executeMetaQuery(sql, [talkerId]);
        if (rows.length > 0) {
            talkerName = await getTextMapContent(rows[0].textHash, langCode);
        }
    } else if (talkerType === "TALK_ROLE_PLAYER") {  // 玩家（主角）
        talkerName = "主角";
    } else if (talkerType === "TALK_ROLE_MATE_AVATAR") {  // 反主
        talkerName = "反主";
    }

    if (talkerName === "#{REALNAME[ID(1)|HOSTONLY(true)]}") {  // 散兵
        talkerName = await getWanderName(langCode);
    }
    // TODO: 小家伙的名字适配
    // if (talkerName === "#{REALNAME[ID(2)|HOSTONLY(true)]}") {  // 小家伙（小龙）
    //     talkerName = await getLittleOneName(langCode);
    // }
    return talkerName;
};

export const getTalkQuestId = async (talkId) => {
    const sql = "select questId from questTalk where talkId=? limit 1";
    const rows = await executeMetaQuery(sql, [talkId]);
    return rows.length > 0 ? rows[0].questId : null;
};

// 根据questId获取任务名字，格式为"(章节号 · )(章节名 · )任务名"
// TODO：可以考虑加一层内存缓存？
export const getQuestName = async (questId, langCode) => {
    const metaSql = `
        SELECT
            q.titleTextMapHash AS questTitleHash,
            c.chapterTitleTextMapHash AS chapterTitleHash,
            c.chapterNumTextMapHash AS chapterNumHash
        FROM quest q
        LEFT JOIN chapter c ON q.chapterId = c.chapterId
        WHERE q.questId = ?
        LIMIT 1
    `;
    const rows = await executeMetaQuery(metaSql, [questId]);
    if (rows.length === 0) return "对话文本";

    const { questTitleHash, chapterTitleHash, chapterNumHash } = rows[0];
    // 过滤掉值为0或null的hash，不给后面的sql传空值
    const hashes = [questTitleHash, chapterTitleHash, chapterNumHash].filter(Boolean);
    if (hashes.length === 0) return "对话文本";

    // 一次性查询所有相关的textMap内容，避免多次查询数据库
    const placeholders = hashes.map(() => "?").join(",");
    const textRows = await executeLangQuery(
        langCode,
        `select hash, content from textMap where hash in (${placeholders})`,
        hashes
    );
    const textMap = new Map(textRows.map((r) => [r.hash, r.content]));

    const questTitle = textMap.get(questTitleHash);
    if (!questTitle) return "对话文本";

    const chapterTitle = chapterTitleHash ? textMap.get(chapterTitleHash) : null;
    const chapterNum = chapterNumHash ? textMap.get(chapterNumHash) : null;

    if (!chapterTitle) return questTitle;  // 没有章节信息，直接返回任务名
    if (chapterNum) return `${chapterNum} · ${chapterTitle} · ${questTitle}`;  //完整
    return `${chapterTitle} · ${questTitle}`;  // 没有章节号
};

export const getTalkQuestName = async (talkId, langCode = 1) => {
    const questId = await getTalkQuestId(talkId);
    if (questId === null) return "对话文本";
    return await getQuestName(questId, langCode);
};

export const getCoopTalkQuestName = async (coopQuestId, langCode) => {
    // 直接除以100把subQuestId变为questId
    const questId = Math.floor(coopQuestId / 100);
    return await getQuestName(questId, langCode);
};

// 为某句对话生成完整的来源字符串，格式为"角色名, 任务名"
export const getSourceFromDialogue = async (textHash, langCode = 1) => {
    const talkInfo = await getTalkInfo(textHash);
    return await buildSourceFromTalkInfo(talkInfo, langCode);
};

export const buildSourceFromTalkInfo = async (talkInfo, langCode = 1) => {
    if (!talkInfo) return null;

    const { talkId, talkerType, talkerId, coopQuestId } = talkInfo;
    const [talkerName, questCompleteName] = await Promise.all([
        getTalkerName(talkerType, talkerId, langCode),
        coopQuestId === null
            ? getTalkQuestName(talkId, langCode)
            : getCoopTalkQuestName(coopQuestId, langCode),
    ]);

    if (!talkerName) return questCompleteName;
    return `${talkerName}, ${questCompleteName}`;
};

/**
 * 根据占位符名称获取对应的文本内容
 * @deprecated 暂时用不上
 */
export const getManualTextMap = async (placeHolderName, langCode) => {
    const sql = "select textHash from manualTextMap where textMapId=?";
    const rows = await executeMetaQuery(sql, [placeHolderName]);
    if (rows.length === 0) return null;
    return await getTextMapContent(rows[0].textHash, langCode);
};

// 获取一整段剧情对话的所有台词
export const getTalkContent = async (talkId, coopQuestId) => {
    let sql;
    let params;
    if (coopQuestId === null) {
        sql = "select textHash, talkerType, talkerId, dialogueId from dialogue where talkId = ? and coopQuestId is null order by dialogueId";
        params = [talkId];
    } else {
        sql = "select textHash, talkerType, talkerId, dialogueId from dialogue where talkId = ? and coopQuestId = ? order by dialogueId";
        params = [talkId, coopQuestId];
    }
    const rows = await executeMetaQuery(sql, params);
    return rows.length > 0 ? rows : null;
};

/**
 * 获取语言ID到语言名称的映射
 * @deprecated 废弃
 */
export const getLangCodeMap = async () => {
    const rows = await executeMetaQuery("select id, codeName from langCode");
    const mapping = {};
    for (const row of rows) {
        mapping[row.id] = row.codeName;
    }
    return mapping;
};

// 批量获取阅读物的元信息。根据文件名列表查询
export const selectReadableMetadataFromFileNames = async (fileNames = [], langCode) => {
    if (!fileNames || fileNames.length === 0) {
        return [];
    }
    const uniqueFileNames = [...new Set(fileNames.filter(Boolean))];
    if (uniqueFileNames.length === 0) {
        return [];
    }
    const placeholders = uniqueFileNames.map(() => "?").join(", ");
    const sql = `select fileName, titleTextMapHash, readableId from readable where fileName in (${placeholders})`;
    return await executeLangQuery(langCode, sql, uniqueFileNames);
};

// 获取阅读物的文本内容
export const selectReadableFromFileName = async (fileName, langs = []) => {
    if (!langs || langs.length === 0) return [];
    const tasks = langs.map(async (lang) => {
        const rows = await executeLangQuery(lang, "select content from readable where fileName=?", [fileName]);
        return rows.map((row) => ({ content: row.content, lang }));
    });
    const grouped = await Promise.all(tasks);
    return grouped.flat();
};

// 获取阅读物的文本内容，根据readableId查询
export const selectReadableFromReadableId = async (readableId, langs = []) => {
    if (!langs || langs.length === 0) return [];
    const tasks = langs.map(async (lang) => {
        const rows = await executeLangQuery(lang, "select content from readable where readableId=?", [readableId]);
        return rows.map((row) => ({ content: row.content, lang }));
    });
    const grouped = await Promise.all(tasks);
    return grouped.flat();
};

// 根据textHash获取文本内容
export const getTextMapContent = async (textHash, langCode) => {
    const rows = await executeLangQuery(langCode, "select content from textMap where hash=?", [textHash]);
    return rows.length > 0 ? rows[0].content : null;
};

// 根据文件名和时间戳获取字幕文本内容
export const selectSubtitleTranslations = async (fileName, startTime, langs = []) => {
    if (!langs || langs.length === 0) return [];
    const minTime = startTime - 0.5;
    const maxTime = startTime + 0.5;
    const tasks = langs.map(async (lang) => {
        const sql = "select content from subtitle where fileName=? and startTime between ? and ?";
        const rows = await executeLangQuery(lang, sql, [fileName, minTime, maxTime]);
        return rows.map((row) => ({ content: row.content, lang }));
    });
    const grouped = await Promise.all(tasks);
    return grouped.flat();
};

// 根据subtitleId和时间戳获取字幕文本内容
export const selectSubtitleTranslationsBySubtitleId = async (subtitleId, startTime, langs = []) => {
    if (!langs || langs.length === 0) return [];
    const minTime = startTime - 0.5;
    const maxTime = startTime + 0.5;
    const tasks = langs.map(async (lang) => {
        const sql = "select content from subtitle where subtitleId=? and startTime between ? and ?";
        const rows = await executeLangQuery(lang, sql, [subtitleId, minTime, maxTime]);
        return rows.map((row) => ({ content: row.content, lang }));
    });
    const grouped = await Promise.all(tasks);
    return grouped.flat();
};

// 获取某个文件的所有字幕文本内容，按时间顺序返回
export const selectSubtitleContext = async (fileName, langs = []) => {
    if (!langs || langs.length === 0) return [];
    const tasks = langs.map(async (lang) => {
        const sql = "select content, startTime, endTime from subtitle where fileName=? order by startTime";
        const rows = await executeLangQuery(lang, sql, [fileName]);
        return rows.map((row) => ({
            content: row.content,
            lang,
            startTime: row.startTime,
            endTime: row.endTime,
        }));
    });
    const grouped = await Promise.all(tasks);
    return grouped.flat().sort((a, b) => a.startTime - b.startTime);
};

// 获取某个subtitleId的所有字幕文本内容，按时间顺序返回
export const selectSubtitleContextBySubtitleId = async (subtitleId, langs = []) => {
    if (!langs || langs.length === 0) return [];
    const tasks = langs.map(async (lang) => {
        const sql = "select content, startTime, endTime from subtitle where subtitleId=? order by startTime";
        const rows = await executeLangQuery(lang, sql, [subtitleId]);
        return rows.map((row) => ({
            content: row.content,
            lang,
            startTime: row.startTime,
            endTime: row.endTime,
        }));
    });
    const grouped = await Promise.all(tasks);
    return grouped.flat().sort((a, b) => a.startTime - b.startTime);
};
