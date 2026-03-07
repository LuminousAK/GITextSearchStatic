
import { createDbWorker } from "sql.js-httpvfs";

const workerUrl = "/db/sqlite.worker.js";
const wasmUrl = "/db/sql-wasm.wasm";

const LANG_ID_TO_CODE = {
    1: "chs",
    2: "cht",
    3: "de",
    4: "en",
    5: "es",
    6: "fr",
    7: "id",
    8: "it",
    9: "jp",
    10: "kr",
    11: "pt",
    12: "ru",
    13: "th",
    14: "tr",
    15: "vi",
};

const createWorker = (url) => createDbWorker(
    [
        {
            from: "inline",
            config: {
                serverMode: "full",
                url,
                requestChunkSize: 4096,
            },
        },
    ],
    workerUrl,
    wasmUrl
);

let metaWorkerPromise = null;
const langWorkerPromises = new Map();

export const getLangCodeById = (langId) => LANG_ID_TO_CODE[Number(langId)] || null;

export const getMetaWorker = () => {
    if (!metaWorkerPromise) {
        metaWorkerPromise = createWorker("/db/meta.db");
    }
    return metaWorkerPromise;
};

export const getLangWorker = (langId) => {
    const normalizedLangId = Number(langId);
    const langCode = getLangCodeById(normalizedLangId);
    if (!langCode) {
        throw new Error(`Unsupported language id: ${langId}`);
    }
    if (!langWorkerPromises.has(normalizedLangId)) {
        langWorkerPromises.set(normalizedLangId, createWorker(`/db/lang_${langCode}.db`));
    }
    return langWorkerPromises.get(normalizedLangId);
};

export const executeMetaQuery = async (sql, params = []) => {
    const worker = await getMetaWorker();
    return await worker.db.query(sql, params);
};

export const executeLangQuery = async (langId, sql, params = []) => {
    const worker = await getLangWorker(langId);
    return await worker.db.query(sql, params);
};
