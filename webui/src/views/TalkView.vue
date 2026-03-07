<script setup>
import global from "@/global/global"
import api from "@/api/keywordQuery";

import {useRoute} from "vue-router";
import {onActivated, ref, computed} from "vue";
import StylizedText from "@/components/StylizedText.vue";

const route = useRoute()
const keyword = ref("")
const questName = ref("对话文本")
const textHash = ref(0)
const queryTime = ref("0")
const dialogues = ref([])


const reloadPage = () => {
    textHash.value = parseInt(route.query.textHash)
    keyword.value = route.query.keyword
    reloadTalk()
}


const reloadTalk = () => {
    const {isSubtitle, fileName, subtitleId, searchLang} = route.query;
    let requestPromise;

    if (route.query.isSubtitle) {
        requestPromise = api.getSubtitleContext(fileName, subtitleId, searchLang);
    }else{
        requestPromise = api.getTalkFromHash(textHash.value, searchLang);
    }

    requestPromise.then(res => {
        const resJson = res.json;
        const {contents, time} = resJson;
        queryTime.value = time.toFixed(2);
        questName.value = contents.talkQuestName;
        dialogues.value = contents.dialogues;
    }).catch(err => {
        if(err && !err.network && err.defaultHandler){
            err.defaultHandler();
        }else{
            console.error('reloadTalk Error:', err);
        }
    });
}

const displayLanguages = computed(() => {
    let langs = [...global.config.resultLanguages]
    let searchLang = parseInt(route.query.searchLang)
    if (searchLang && !langs.includes(searchLang)) {
        langs.push(searchLang)
    }
    return langs
})


onActivated(() => {
    reloadPage()
})

</script>

<template>
    <div class="viewWrapper">
        <h1 class="pageTitle">剧情对话查询</h1>
        <div class="helpText">
            <p>来源：{{questName}}</p>
            <p>查询用时： {{queryTime}} ms</p>
        </div>
        <el-table :data="dialogues">
            <el-table-column prop="talker" label="角色" width="100" />
            <template v-for="langCode in displayLanguages">
                <el-table-column :label="global.languages[langCode]" >
                    <template #default="scope">
                        <StylizedText :text="scope.row.translates[langCode]" :keyword="keyword"/>
                    </template>
                </el-table-column>
            </template>

        </el-table>

    </div>

</template>

<style scoped>
.viewWrapper{
    position: relative;
    width: 85%;
    margin: 0 auto;
    background-color: #fff;
    box-shadow: 0 3px 3px rgba(36,37,38,.05);
    border-radius: 3px;
    padding: 20px;
}

.pageTitle {
    border-bottom: 1px #ccc solid;
    padding-bottom: 10px;
}

.helpText {
    margin: 20px 0 20px 0;
    color: #999;
}
</style>
