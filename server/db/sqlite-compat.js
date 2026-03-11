/**
 * SQLite Compatibility Shim
 * =========================
 * Tries to use better-sqlite3 (native, preferred) and falls back to
 * Node.js 22+'s built-in node:sqlite when the native binding can't
 * be instantiated (e.g. sandbox environments without build tools).
 *
 * Exposes the same synchronous API that better-sqlite3 uses so that
 * database.js requires no changes.
 *
 * @module db/sqlite-compat
 */

'use strict';

// ─── PROBE BETTER-SQLITE3 ─────────────────────────────────────────────────────
// We need to actually attempt construction (not just require) because the
// better-sqlite3 package loads its JS wrapper fine but throws in the
// constructor when the native .node binding is missing.
let useNative = false;
try {
    const NativeDB = require('better-sqlite3');
    // Try instantiating with an in-memory DB to confirm bindings are present
    const testDb = new NativeDB(':memory:');
    testDb.close();
    useNative = true;
} catch (_) {
    // Native binding unavailable — fall through to node:sqlite shim
}

if (useNative) {
    // Pass-through: expose better-sqlite3 directly, no wrapping needed
    module.exports = require('better-sqlite3');
} else {
    // ─── NODE:SQLITE SHIM ──────────────────────────────────────────────────

    const { DatabaseSync } = require('node:sqlite');

    class StatementShim {
        constructor(stmt) { this._stmt = stmt; }

        /** Returns first row as a plain object, or undefined */
        get(...params) {
            const rows = this._stmt.all(...params);
            return rows.length > 0 ? Object.assign({}, rows[0]) : undefined;
        }

        /** Returns all rows as plain objects */
        all(...params) {
            return this._stmt.all(...params).map(r => Object.assign({}, r));
        }

        /**
         * Returns { lastInsertRowid, changes } — same shape as better-sqlite3.
         * node:sqlite's run() returns { lastInsertRowid, changes } already.
         */
        run(...params) {
            return this._stmt.run(...params);
        }
    }

    class DatabaseShim {
        constructor(path, _opts) {
            // Suppress the experimental-feature warning noise
            const orig = process.emit.bind(process);
            process.emit = (name, ...a) => {
                if (name === 'warning' && a[0]?.name === 'ExperimentalWarning'
                    && String(a[0]?.message).includes('SQLite')) return false;
                return orig(name, ...a);
            };
            this._db = new DatabaseSync(path);
            process.emit = orig;

            // Sensible defaults
            try { this._db.exec('PRAGMA journal_mode = WAL'); } catch (_) {}
            try { this._db.exec('PRAGMA foreign_keys = ON'); } catch (_) {}
            try { this._db.exec('PRAGMA synchronous = NORMAL'); } catch (_) {}
        }

        prepare(sql) { return new StatementShim(this._db.prepare(sql)); }

        exec(sql) { this._db.exec(sql); return this; }

        transaction(fn) {
            const self = this;
            return function (...args) {
                self._db.exec('BEGIN');
                try {
                    const r = fn(...args);
                    self._db.exec('COMMIT');
                    return r;
                } catch (err) {
                    try { self._db.exec('ROLLBACK'); } catch (_) {}
                    throw err;
                }
            };
        }

        pragma(str) {
            try { this._db.exec(`PRAGMA ${str}`); } catch (_) {}
            return [];
        }

        close() { try { this._db.close(); } catch (_) {} }

        backup() { return Promise.resolve(); } // no-op stub
    }

    module.exports = DatabaseShim;
}
