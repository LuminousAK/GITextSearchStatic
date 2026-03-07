import json
from pathlib import Path

from DBConfig import OUTPUT_DIR

MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024
SERVER_CHUNK_SIZE = 100 * 1024 * 1024
REQUEST_CHUNK_SIZE = 4096
SUFFIX_LENGTH = 2
CHUNK_DIR_NAME = "chunks"
MANIFEST_NAME = "db-manifest.json"


def _chunk_file_name(db_name: str, index: int) -> str:
    return f"{db_name}.part.{index:0{SUFFIX_LENGTH}d}"


def _cleanup_existing_chunks(chunks_dir: Path, db_name: str) -> None:
    for path in chunks_dir.glob(f"{db_name}.part.*"):
        if path.is_file():
            path.unlink()


def _split_to_chunks(db_path: Path, chunks_dir: Path) -> int:
    db_name = db_path.name
    _cleanup_existing_chunks(chunks_dir, db_name)

    total_size = db_path.stat().st_size
    index = 0
    with db_path.open("rb") as source:
        while True:
            part = source.read(SERVER_CHUNK_SIZE)
            if not part:
                break
            chunk_path = chunks_dir / _chunk_file_name(db_name, index)
            with chunk_path.open("wb") as target:
                target.write(part)
            index += 1
    return total_size


def build_db_manifest() -> dict:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    chunks_dir = OUTPUT_DIR / CHUNK_DIR_NAME
    chunks_dir.mkdir(parents=True, exist_ok=True)

    manifest = {
        "version": 1,
        "databases": {},
    }

    db_paths = sorted(OUTPUT_DIR.glob("*.db"))
    for db_path in db_paths:
        db_name = db_path.name
        db_key = db_path.stem
        file_size = db_path.stat().st_size

        if file_size <= MAX_FILE_SIZE_BYTES:
            _cleanup_existing_chunks(chunks_dir, db_name)
            manifest["databases"][db_key] = {
                "serverMode": "full",
                "url": f"/db/{db_name}",
                "requestChunkSize": REQUEST_CHUNK_SIZE,
            }
            continue

        original_size = _split_to_chunks(db_path, chunks_dir)
        db_path.unlink()

        manifest["databases"][db_key] = {
            "serverMode": "chunked",
            "urlPrefix": f"/db/{CHUNK_DIR_NAME}/{db_name}.part.",
            "databaseLengthBytes": original_size,
            "serverChunkSize": SERVER_CHUNK_SIZE,
            "suffixLength": SUFFIX_LENGTH,
            "requestChunkSize": REQUEST_CHUNK_SIZE,
        }

    manifest_path = OUTPUT_DIR / MANIFEST_NAME
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return manifest


if __name__ == "__main__":
    result = build_db_manifest()
    print(f"Generated {MANIFEST_NAME} with {len(result['databases'])} database entries.")
