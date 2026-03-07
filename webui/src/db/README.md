# Database Layer

This directory contains the `sql.js-httpvfs` implementation for querying the SQLite database directly from the browser.

## Setup

1.  **Database File**: Place your SQLite database file named `data.db` in `public/db/`.
    - Path: `public/db/data.db`
    - This file should contain the tables: `textMap`, `dialogue`, `quest`, `fetters`, `readable`, `subtitle`, etc.

2.  **Worker Files**: The `sqlite.worker.js` and `sql-wasm.wasm` files should already be in `public/db/`.
    - If missing, copy them from `node_modules/sql.js-httpvfs/dist/`.

## Architecture

- `dbService.js`: Initializes the `sql.js-httpvfs` worker.
- `databaseHelper.js`: Contains raw SQL queries (ported from Python).
- `controllers.js`: Contains business logic (ported from Python) and handles data formatting.

## Usage

The API layer (`src/api/`) calls functions in `controllers.js`.
