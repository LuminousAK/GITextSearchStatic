# Database Layer

This directory contains the `sql.js-httpvfs` implementation for querying the SQLite database directly from the browser.

## Setup

1.  **Database Artifacts**: Build databases into repo-root `db/` (not `webui/public/db`).
    - Required files:
      - `db/db-manifest.json`
      - `db/meta.db` or its chunk files (for oversized DB)
      - `db/lang_*.db` or chunk files (for oversized DB)
    - Oversized DBs are chunked as `db/chunks/{dbName}.part.00...`

2.  **Worker Files**: The `sqlite.worker.js` and `sql-wasm.wasm` files should already be in `public/db/`.
    - If missing, copy them from `node_modules/sql.js-httpvfs/dist/`.

## Architecture

- `dbService.js`: Initializes the `sql.js-httpvfs` worker.
- `databaseHelper.js`: Contains raw SQL queries (ported from Python).
- `controllers.js`: Contains business logic (ported from Python) and handles data formatting.

## Usage

The API layer (`src/api/`) calls functions in `controllers.js`.
