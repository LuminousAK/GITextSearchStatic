import * as controllers from "@/db/controllers";

const CONFIG_STORAGE_KEY = "gits_static_config_v1";

const normalizeConfig = (raw = {}) => {
    const resultLanguages = Array.isArray(raw.resultLanguages)
        ? raw.resultLanguages.map((v) => parseInt(v, 10)).filter((v) => Number.isFinite(v))
        : [1, 4];
    const sourceLanguage = Number.isFinite(parseInt(raw.sourceLanguage, 10))
        ? parseInt(raw.sourceLanguage, 10)
        : 1;
    const defaultSearchLanguage = Number.isFinite(parseInt(raw.defaultSearchLanguage, 10))
        ? parseInt(raw.defaultSearchLanguage, 10)
        : sourceLanguage;
    return {
        resultLanguages,
        sourceLanguage,
        defaultSearchLanguage,
        isMale: typeof raw.isMale === "boolean" ? raw.isMale : true,
        assetDir: typeof raw.assetDir === "string" ? raw.assetDir : "",
    };
};

const getImportedTextLanguages = async () => {
    try {
        const langs = await controllers.getImportedTextMapLangs();
        const result = {};
        for (const lang of langs) {
            result[lang.id] = lang.displayName;
        }
        return { json: result };
    } catch (e) {
        console.error("Failed to load languages", e);
        return {
            json: {
                1: "CHS (Fallback)",
                2: "CHT (Fallback)",
                4: "EN (Fallback)",
            },
        };
    }
};

const getImportedVoiceLanguages = async () => ({ json: {} });

const getConfig = async () => {
    const baseConfig = normalizeConfig(controllers.getConfig());
    let persistedConfig = {};
    try {
        const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
        if (raw) {
            persistedConfig = normalizeConfig(JSON.parse(raw));
        }
    } catch (e) {
        console.warn("Failed to read persisted config, using defaults.", e);
    }

    const mergedConfig = normalizeConfig({ ...baseConfig, ...persistedConfig });
    controllers.setConfig(mergedConfig);
    return { json: mergedConfig };
};

const saveConfig = async (resultLanguages, defaultSearchLanguage, sourceLanguage, isMale) => {
    const nextConfig = normalizeConfig({
        resultLanguages,
        defaultSearchLanguage,
        sourceLanguage,
        isMale,
    });
    controllers.setConfig(nextConfig);
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(nextConfig));
    return { json: nextConfig };
};

export default {
    getImportedTextLanguages,
    getImportedVoiceLanguages,
    getConfig,
    saveConfig,
};
