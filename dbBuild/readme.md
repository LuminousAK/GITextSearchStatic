# dbBuild 使用说明（多库版本）

## 目标结构
构建结果会输出到 `../db/`：

- `meta.db`：来源追踪与业务元数据（任务、对话、角色、可读物、字幕、`hashSource`）
- `lang_chs.db` ... `lang_vi.db`：每种语言一个库，仅包含：
  - `textMap(hash, content)`
  - `textMap_fts(content, hash)`

该结构适配 `sql.js-httpvfs`：
- 搜索时只加载用户选择的单语言库（更小、更快）
- 展示多语言结果时按 `hash` 去对应语言库查同 hash 文本
- 追溯来源时在 `meta.db` 查询 `hashSource`

## 前置准备
1. 在 `DBConfig.py` 设置 `DATA_PATH` 为 AnimeGameData 根目录。
2. 确认以下目录存在：
   - `TextMap`
   - `Readable`
   - `Subtitle`
   - `ExcelBinOutput`
   - `BinOutput`

## 构建步骤
1. 初始化所有数据库结构：

```bash
python DBInit.py
```

2. 导入全部数据：

```bash
python DBBuild.py
```

## 仅重建某个语言库

```bash
python textMapImport.py --lang EN
```

不带 `--lang` 时会重建全部语言库。

## 常用查询示例
### 1) 在单语言库里搜索
```sql
SELECT hash, snippet(textMap_fts, 0, '[', ']', '...', 12) AS hit
FROM textMap_fts
WHERE textMap_fts MATCH 'diluc'
LIMIT 50;
```

### 2) 根据 hash 查来源
```sql
SELECT sourceType, sourceId, extra
FROM hashSource
WHERE hash = ?;
```

### 3) 根据 hash 取多语言文本
在每个目标语言库执行：
```sql
SELECT content FROM textMap WHERE hash = ?;
```
