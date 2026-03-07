
import * as controllers from "@/db/controllers";

const queryByKeyword = async (keyword, langCode) => {
    try {
        const start = performance.now();
        const contents = await controllers.getTranslateObj(keyword, parseInt(langCode));
        const end = performance.now();

        return {
            json: {
                contents: contents,
                time: end - start
            }
        };
    } catch (e) {
        console.error("Query Error", e);
        return {
            json: {
                contents: [],
                time: 0,
                error: e.message
            }
        };
    }
};

const getTalkFromHash = async (textHash, searchLang) => {
    try {
        const start = performance.now();
        const contents = await controllers.getTalkFromHash(textHash, searchLang ? parseInt(searchLang) : undefined);
        const end = performance.now();
        
        return {
            json: {
                contents: contents,
                time: end - start
            }
        };
    } catch (e) {
        console.error("Talk Error", e);
        return {
            json: {
                contents: null,
                time: 0,
                error: e.message
            }
        };
    }
};

const getSubtitleContext = async (fileName, subtitleId, searchLang) => {
    try {
        const start = performance.now();
        const contents = await controllers.getSubtitleContext(fileName, subtitleId, searchLang ? parseInt(searchLang) : undefined);
        const end = performance.now();

        return {
            json: {
                contents: contents,
                time: end - start
            }
        };
    } catch (e) {
        console.error("Subtitle Error", e);
        return {
            json: {
                contents: null,
                time: 0,
                error: e.message
            }
        };
    }
}

export default {
    queryByKeyword,
    getTalkFromHash,
    getSubtitleContext
};
