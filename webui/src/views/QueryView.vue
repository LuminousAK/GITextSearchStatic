<template>
    <div class="viewWrapper">
        <h1 class="pageTitle">关键词检索</h1>
        <div class="helpText">
            <p>使用关键词对游戏的指定语言的文本进行检索。</p>
            <p>默认按短语匹配；如需高级语法请使用 <code>fts:</code> 前缀。</p>
            <!-- <p>检索结果中,可能有对应配音的结果会被排序在前面。</p> -->
        </div>


        <el-input
            v-model="keyword"
            style="max-width: 600px;"
            placeholder="请输入关键词"
            class="input-with-select"
            @keyup.enter.native="onQueryButtonClicked"
            clearable
        >
            <template #prepend>
                <el-select v-model="selectedInputLanguage" placeholder="Select" class="languageSelector" >
                    <el-option v-for="(v,k) in supportedInputLanguage" :label="v" :value="k" :key="k"/>
                </el-select>
            </template>
            <template #append>
                <el-button :icon="Search" @click="onQueryButtonClicked"/>
            </template>
        </el-input>
        <span class="searchSummary">
            {{ searchSummary }}
        </span>


        <div>
            <TranslateDisplay v-for="translate in queryResult" :translate-obj="translate" class="translate" :keyword="keywordLast" :search-lang="searchLangLast" />
        </div>
    </div>

</template>

<script setup>
import {onBeforeMount, ref} from 'vue';
import { Search } from '@element-plus/icons-vue'
import global from "@/global/global"
import api from "@/api/keywordQuery"
import TranslateDisplay from "@/components/ResultEntry.vue";

const queryLanguages = [1,4]

const queryResult = ref([])


const selectedInputLanguage = ref(global.config.defaultSearchLanguage + '')
const keyword = ref("")
const keywordLast = ref("")
const searchLangLast = ref(0)
const supportedInputLanguage = ref({})
const searchSummary = ref("")

onBeforeMount(async ()=>{
    supportedInputLanguage.value = global.languages
})

const onQueryButtonClicked = async () =>{
    let ans = (await api.queryByKeyword(keyword.value, selectedInputLanguage.value)).json

    let searchSummaryTmp = `查询用时: ${ans.time.toFixed(2)}ms，`
    if(ans.contents.length > 0){
        if(ans.contents.length >= 200){
            searchSummaryTmp += `共 ≥200 条结果`
        }else{
            searchSummaryTmp += `共 ${ans.contents.length} 条结果`
        }

    }else{
        searchSummaryTmp += `没有找到结果。`
        searchSummary.value = searchSummaryTmp
        queryResult.value = []
        return
    }

    // let mergedCount = 0
    // // 去重，合并相同的语音条目
    // let resultMap = new Map()
    // for(let item of ans.contents){
    //     let key = item.translates[queryLanguages[0]]
    //     if(!resultMap.has(key)){
    //         resultMap.set(key, item)
    //         continue
    //     }
    //     mergedCount++;
    //
    //     let oldItem = resultMap.get(key)
    //     let voicePathsToAdd = []
    //     for(let newVoicePath of item.voicePaths){
    //         let found = false
    //         for(let oldVoicePath of oldItem.voicePaths){
    //             if(oldVoicePath === newVoicePath){
    //                 found = false
    //                 break
    //             }
    //         }
    //         if(!found){
    //             voicePathsToAdd.push(newVoicePath)
    //         }
    //     }
    //     if(voicePathsToAdd.length > 0){
    //         oldItem.voicePaths.push(...voicePathsToAdd)
    //
    //     }
    // }
    // // 重排序，把有语音的条目拉到上面
    // queryResult.value.length = 0
    // let noVoiceEntries = []
    //
    // resultMap.forEach((item, key, _)=>{
    //     if(item.voicePaths.length > 0){
    //         queryResult.value.push(item)
    //     }else{
    //         noVoiceEntries.push(item)
    //     }
    // })
    //
    //
    // queryResult.value.push(...noVoiceEntries)

    // 不合并了
    queryResult.value = ans.contents;
    // 把有语音的排在前面
    // queryResult.value.sort((a, b) => {
    //   const aHasVoice = a.voicePaths && a.voicePaths.length > 0;
    //   const bHasVoice = b.voicePaths && b.voicePaths.length > 0;
    //   if (aHasVoice && !bHasVoice) return -1;
    //   if (!aHasVoice && bHasVoice) return 1;
    //   return 0;
    // });

    keywordLast.value = keyword.value
    searchLangLast.value = parseInt(selectedInputLanguage.value)

    // if(mergedCount > 0){
    //     searchSummaryTmp += `，已合并 ${mergedCount} 条重复结果。`
    // }else{
    //     searchSummaryTmp += '。'
    // }

    // 不合并了
    searchSummaryTmp += '。'
    searchSummary.value = searchSummaryTmp
}

</script>

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

.languageSelector{
    width: 120px;
}

.languageSelector:deep(input){
    text-align: center;
}
.translate:not(:last-child){
    border-bottom: 1px solid #ccc;
}

.pageTitle {
    border-bottom: 1px #ccc solid;
    padding-bottom: 10px;
}

.helpText {
    margin: 20px 0 20px 0;
    color: #999;
}

.searchSummary{
    margin-left: 10px;
    color: var(--el-input-text-color, var(--el-text-color-regular));
    font-size: 14px;
}

</style>
