import * as databaseHelper from "./databaseHelper";

let resultLanguages = [1, 4];
let sourceLanguage = 1;
let defaultSearchLanguage = 1;
let isMale = true;

export const setConfig = (config) => {
    if (config.resultLanguages) resultLanguages = config.resultLanguages;
    if (config.sourceLanguage) sourceLanguage = config.sourceLanguage;
    if (config.defaultSearchLanguage) defaultSearchLanguage = config.defaultSearchLanguage;
    if (typeof config.isMale === "boolean") isMale = config.isMale;
};

export const getConfig = () => ({
    resultLanguages,
    sourceLanguage,
    defaultSearchLanguage,
    isMale,
    assetDir: "",
});

const crc32 = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return hash;
};

const placeholderReplace = (text) => {
    if (!text) return "";
    return text.replace(/\{M#([^}]+)\}\{F#([^}]+)\}/g, (_match, m, f) => (isMale ? m : f));
};

const groupSingleFtsRows = (rows = []) => {
    const grouped = {
        textMapMatches: [],
        readableMatches: [],
        subtitleMatches: [],
        countsBySource: {
            textmap: 0,
            readable: 0,
            subtitle: 0,
        },
    };

    const textMapSeen = new Set();
    const readableSeen = new Set();
    const subtitleSeen = new Set();

    for (const row of rows) {
        if (row.source_type === "textmap") {
            const hash = Number(row.source_id ?? row.key1);
            if (!Number.isFinite(hash) || textMapSeen.has(hash)) {
                continue;
            }
            textMapSeen.add(hash);
            grouped.textMapMatches.push({ hash, content: row.contentPreview });
            continue;
        }

        if (row.source_type === "readable") {
            const fileName = row.key1;
            const readableId = Number(row.source_id);
            if (!fileName) {
                continue;
            }
            const key = Number.isFinite(readableId) ? `id:${readableId}` : `file:${fileName}`;
            if (readableSeen.has(key)) {
                continue;
            }
            readableSeen.add(key);
            grouped.readableMatches.push({
                fileName,
                readableId: Number.isFinite(readableId) ? readableId : null,
            });
            continue;
        }

        if (row.source_type === "subtitle") {
            const fileName = row.key1;
            const startTime = Number(row.key2);
            const subtitleId = Number(row.source_id);
            if (!fileName || !Number.isFinite(startTime)) {
                continue;
            }
            const key = Number.isFinite(subtitleId)
                ? `id:${subtitleId}|t:${startTime}`
                : `file:${fileName}|t:${startTime}`;
            if (subtitleSeen.has(key)) {
                continue;
            }
            subtitleSeen.add(key);
            grouped.subtitleMatches.push({
                fileName,
                startTime,
                subtitleId: Number.isFinite(subtitleId) ? subtitleId : null,
            });
        }
    }

    grouped.countsBySource = {
        textmap: grouped.textMapMatches.length,
        readable: grouped.readableMatches.length,
        subtitle: grouped.subtitleMatches.length,
    };

    return grouped;
};

export const getImportedTextMapLangs = async () => {
    return await databaseHelper.getImportedTextMapLangs();
};

const queryTextHashInfo = async (textHash, langs, sourceLangCode, queryOrigin = true) => {
    const obj = { translates: {}, hash: textHash };
    const translates = await databaseHelper.selectTextMapFromTextHash(textHash, langs);

    for (const translate of translates) {
        if (translate.content?.startsWith("#")) {
            obj.translates[translate.lang] = placeholderReplace(translate.content).substring(1);
        } else {
            obj.translates[translate.lang] = translate.content;
        }
    }

    if (queryOrigin) {
        const talkInfo = await databaseHelper.getTalkInfo(textHash);
        obj.isTalk = !!talkInfo;
        let origin = null;

        if (talkInfo) {
            origin = await databaseHelper.buildSourceFromTalkInfo(talkInfo, sourceLangCode);
        } else {
            origin = await databaseHelper.getSourceFromFetter(textHash, sourceLangCode);
        }

        if (!origin) {
            origin = "其他文本";
        }
        obj.origin = origin;
    }

    return obj;
};

export const getTranslateObj = async (keyword, langCode) => {
    const ans = [];
    const langs = [...new Set([...resultLanguages, langCode])];
    const grouped = groupSingleFtsRows(await databaseHelper.searchFts(keyword, langCode));
    const textMapMatches = grouped.textMapMatches;
    let readableContents = grouped.readableMatches;
    const subtitleContents = grouped.subtitleMatches;

    if (readableContents.length > 0) {
        const readableMetadataRows = await databaseHelper.selectReadableMetadataFromFileNames(
            readableContents.map((item) => item.fileName),
            langCode
        );
        const metadataMap = new Map(readableMetadataRows.map((item) => [item.fileName, item]));
        readableContents = readableContents.map((item) => {
            const metadata = metadataMap.get(item.fileName);
            if (!metadata) {
                return item;
            }
            return {
                fileName: item.fileName,
                readableId: item.readableId ?? metadata.readableId,
                titleTextMapHash: metadata.titleTextMapHash,
            };
        });
    }

    for (const content of textMapMatches) {
        const obj = await queryTextHashInfo(content.hash, langs, sourceLanguage);
        ans.push(obj);
    }
    for (const { fileName, titleTextMapHash, readableId } of readableContents) {
        const fileHash = crc32(fileName);
        let origin = `阅读物：${fileName}`;
        if (titleTextMapHash) {
            const title = await databaseHelper.getTextMapContent(titleTextMapHash, sourceLanguage);
            if (title) origin = `阅读物：${fileName} (${title})`;
        }

        const obj = {
            translates: {},
            hash: fileHash,
            isTalk: false,
            origin,
        };

        let translations = [];
        if (readableId) {
            translations = await databaseHelper.selectReadableFromReadableId(readableId, langs);
        }
        if (translations.length === 0) {
            translations = await databaseHelper.selectReadableFromFileName(fileName, langs);
        }
        for (const { content: transContent, lang: transLangCode } of translations) {
            obj.translates[transLangCode] = transContent;
        }
        ans.push(obj);
    }

    for (const { fileName, startTime, subtitleId } of subtitleContents) {
        const fileHash = crc32(`${fileName}_${startTime}`);
        const obj = {
            translates: {},
            hash: fileHash,
            isTalk: false,
            origin: `字幕: ${fileName}`,
            isSubtitle: true,
            fileName,
            subtitleId,
        };

        let translations = [];
        if (subtitleId) {
            translations = await databaseHelper.selectSubtitleTranslationsBySubtitleId(subtitleId, startTime, langs);
        }
        if (translations.length === 0) {
            translations = await databaseHelper.selectSubtitleTranslations(fileName, startTime, langs);
        }

        for (const { content: transContent, lang: transLangCode } of translations) {
            obj.translates[transLangCode] = transContent;
        }
        ans.push(obj);
    }

    return ans;
};

export const getTalkFromHash = async (textHash, searchLang) => {
    const talkInfo = await databaseHelper.getTalkInfo(textHash);
    if (!talkInfo) {
        throw new Error("内容不属于任何对话！");
    }

    const langs = [...resultLanguages];
    if (searchLang && !langs.includes(searchLang)) {
        langs.push(searchLang);
    }

    const { talkId, coopQuestId } = talkInfo;
    const questCompleteName = coopQuestId === null
        ? await databaseHelper.getTalkQuestName(talkId, sourceLanguage)
        : await databaseHelper.getCoopTalkQuestName(coopQuestId, sourceLanguage);

    const rawDialogues = await databaseHelper.getTalkContent(talkId, coopQuestId);
    const dialogues = [];

    if (rawDialogues) {
        for (const rawDialogue of rawDialogues) {
            const { textHash: dTextHash, talkerType: dTalkerType, talkerId: dTalkerId, dialogueId } = rawDialogue;
            const obj = await queryTextHashInfo(dTextHash, langs, sourceLanguage, false);
            obj.talker = await databaseHelper.getTalkerName(dTalkerType, dTalkerId, sourceLanguage);
            obj.dialogueId = dialogueId;
            dialogues.push(obj);
        }
    }

    return {
        talkQuestName: questCompleteName,
        talkId,
        dialogues,
    };
};

export const getSubtitleContext = async (fileName, subtitleId, searchLang) => {
    const langs = [...resultLanguages];
    if (searchLang && !langs.includes(searchLang)) {
        langs.push(searchLang);
    }

    const lines = subtitleId
        ? await databaseHelper.selectSubtitleContextBySubtitleId(subtitleId, langs)
        : await databaseHelper.selectSubtitleContext(fileName, langs);

    const clusters = [];
    const threshold = 0.5;

    for (const { content, lang, startTime } of lines) {
        const lastCluster = clusters[clusters.length - 1];
        if (lastCluster && Math.abs(lastCluster.time - startTime) < threshold && !lastCluster.translates[lang]) {
            lastCluster.translates[lang] = content;
        } else {
            clusters.push({
                time: startTime,
                translates: { [lang]: content },
                talker: "",
                dialogueId: Math.floor(startTime * 1000),
            });
        }
    }

    const dialogues = clusters.map((cluster) => ({
        talker: "",
        translates: cluster.translates,
        dialogueId: cluster.dialogueId,
    }));

    return {
        talkQuestName: `字幕: ${fileName}`,
        talkId: 0,
        dialogues,
    };
};
