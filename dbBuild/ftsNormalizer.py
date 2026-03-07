import re

CJK_INDEX_LANGS = {"CHS", "CHT", "JP", "KR"}

_CJK_CHAR_RE = re.compile(
    r"[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]"
)
_SPACE_RE = re.compile(r"\s+")


def _space_split_cjk(text: str) -> str:
    spaced = _CJK_CHAR_RE.sub(lambda m: f" {m.group(0)} ", text)
    return _SPACE_RE.sub(" ", spaced).strip()


def normalize_for_fts(text: str, lang_code: str) -> str:
    if not text:
        return text
    if lang_code.upper() not in CJK_INDEX_LANGS:
        return text
    return _space_split_cjk(text)


def normalize_query_for_fts(query: str) -> str:
    if not query:
        return query
    if not _CJK_CHAR_RE.search(query):
        return query
    return _space_split_cjk(query)
