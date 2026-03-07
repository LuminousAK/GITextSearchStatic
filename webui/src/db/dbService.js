
import { createDbWorker } from "sql.js-httpvfs";

const workerUrl = "/db/sqlite.worker.js";
const wasmUrl = "/db/sql-wasm.wasm";
const manifestUrl = "/db/db-manifest.json";

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

const createWorker = (config) => createDbWorker(
    [
        {
            from: "inline",
            config,
        },
    ],
    workerUrl,
    wasmUrl
);

let metaWorkerPromise = null;
const langWorkerPromises = new Map();
let manifestPromise = null;

const loadManifest = async () => {
    const response = await fetch(manifestUrl, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`Failed to load DB manifest (${manifestUrl}): HTTP ${response.status}`);
    }

    const manifest = await response.json();
    if (!manifest || typeof manifest !== "object" || !manifest.databases || typeof manifest.databases !== "object") {
        throw new Error(`Invalid DB manifest format from ${manifestUrl}`);
    }
    return manifest;
};

const getManifest = () => {
    if (!manifestPromise) {
        manifestPromise = loadManifest();
    }
    return manifestPromise;
};

const getDbConfigOrThrow = (manifest, dbKey) => {
    const config = manifest.databases[dbKey];
    if (!config) {
        throw new Error(`Database "${dbKey}" is missing in ${manifestUrl}`);
    }
    return config;
};

export const getLangCodeById = (langId) => LANG_ID_TO_CODE[Number(langId)] || null;

export const getMetaWorker = () => {
    if (!metaWorkerPromise) {
        metaWorkerPromise = getManifest().then((manifest) => {
            const config = getDbConfigOrThrow(manifest, "meta");
            return createWorker(config);
        });
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
        const dbKey = `lang_${langCode}`;
        const workerPromise = getManifest().then((manifest) => {
            const config = getDbConfigOrThrow(manifest, dbKey);
            return createWorker(config);
        });
        langWorkerPromises.set(normalizedLangId, workerPromise);
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
