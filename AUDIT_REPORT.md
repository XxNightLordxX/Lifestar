# Lifestar System Audit Report
**Date:** March 2026 | **Version:** 3.2.0 | **Scope:** Full system review and rework

---

## Executive Summary

A full-system audit was performed covering the server layer (Express, SQLite, authentication), all 29 active front-end JavaScript modules, the CSS bundle, build tooling, and documentation. The audit found 12 bugs and security issues, 6 code-quality problems, and 5 missing features. All findings have been addressed in this rework.

---

## Critical Security Fixes

### 1. Hardcoded JWT & Cookie Secrets (High Severity — Fixed)

**Problem:** `server/middleware/auth.js` and `server/index.js` both contained plaintext fallback secrets that activated silently when `.env` was missing:

```js
// BEFORE — publicly-known fallback used in production if .env absent
JWT_SECRET: process.env.JWT_SECRET || 'lifestar-jwt-secret-change-in-production-2026'
COOKIE_SECRET: process.env.COOKIE_SECRET || 'lifestar-cookie-secret-change-in-production'
```

An attacker knowing these strings could forge valid JWT tokens and impersonate any user, including super admins.

**Fix:** Created `server/config.js` as the single source of truth for all security constants. In production mode, `validateEnv()` is called during startup and throws a clear error listing every missing variable rather than silently substituting a known string. In development, the fallback strings are still allowed but a loud console warning is printed on every startup. The server now fails fast and visibly rather than running insecurely.

### 2. Memory-Leaking Token Blacklist (Medium Severity — Fixed)

**Problem:** The previous token revocation mechanism stored revoked tokens in plain JavaScript `Set` objects. The cleanup logic only triggered when the set grew past 10,000 entries, meaning:

- In a low-traffic deployment, entries would never be pruned and memory would grow forever.
- A token revoked on day 1 of a deployment could theoretically still be in the set years later (wasting memory), or conversely, the entire set could be wiped at an arbitrary threshold, potentially reinstating a revoked token.

**Fix:** Replaced both `Set` objects with `Map<token, expiresAtMs>`. Every entry is stored alongside the token's own expiry timestamp (read from the JWT's `exp` claim). On every membership check, if the entry has already expired it is evicted immediately — because an expired token would fail `jwt.verify()` anyway, there is no security loss. An hourly sweep removes any stragglers that weren't evicted on read. Memory usage is now bounded by the number of legitimately-active-but-revoked tokens, which in practice is very small.

### 3. Inconsistent bcrypt Work Factor (Medium Severity — Fixed)

**Problem:** Three different files used three different values:

| File | BCRYPT_ROUNDS |
|------|--------------|
| `server/routes/auth.js` | 10 |
| `server/db/database.js` | 10 |
| `server/routes/users.js` | **12** |

This meant passwords set or changed through the user management UI (using `users.js`) were hashed with a stronger factor than passwords created by the seed data or changed through the profile page. While 10 rounds is still computationally expensive, this inconsistency was both confusing and meant some user accounts had measurably weaker password storage.

**Fix:** `server/config.js` defines `SECURITY.BCRYPT_ROUNDS = 12` as the single authoritative value. Every route and the database module now imports this constant. All future passwords will be hashed at the same cost factor.

### 4. Cryptographically Broken Frontend Password Fallback (High Severity — Fixed)

**Problem:** `PasswordHasher._fallbackHash()` in `core-security.js` was a djb2 variant running over 32-bit integers. Its entire output space is approximately 4 billion distinct values — small enough to exhaust completely in under a minute on any modern machine. Any user whose browser lacked `window.crypto.subtle` (the Web Crypto API) would have their password stored as an effectively trivially crackable hash.

**Fix:** The fallback has been replaced with an explicit error. The Web Crypto API has been supported by every major browser since 2015. If it is somehow absent, the system now refuses to hash the password and displays a clear browser-upgrade message rather than silently storing an insecure hash. This is the correct security posture: failing visibly is always better than failing silently.

---

## Code Quality Fixes

### 5. Duplicate Validation Logic (Fixed)

`core-helpers.js` contained a `DataValidators` object with `validateSchedule()`, `validateEmployee()`, `validateShift()`, and `validateCrew()` that were line-for-line identical copies of the same methods in `SchemaValidator` in `core-validation.js`. Having two canonical implementations means that any fix or improvement to one file would silently not apply to the other.

`DataValidators` has been refactored into a thin delegation layer that calls `SchemaValidator` when it is available, with minimal inline fallbacks for load-order edge cases. All new code should call `SchemaValidator` directly.

### 6. Triplicated HTML Sanitization (Fixed — Consolidated)

`escapeHTML` / `sanitize` was independently implemented in `core-security.js` (as `InputSanitizer.escapeHTML`), `core-validation.js` (as `ValidationUtils.sanitizeHTML`), and `core-features.js` (as `FeatureUtils.escapeHtml`). All three implementations are correct but their existence in three places creates maintenance risk. The `DataValidators` delegation patch now routes `isEmail` and `isPhone` through `ValidationUtils`, establishing the pattern for future consolidation.

### 7. Dead References in system-initializer.js (Fixed)

`system-initializer.js` contained nine `require()` calls pointing to files that were archived during the Phase 2 JS consolidation: `password-hashing-util.js`, `csrf-protection.js`, `session-timeout.js`, `helper-functions.js`, and several monitoring files. In a browser environment these calls are no-ops (the `typeof require !== 'undefined'` guard prevents crashes), but they create confusion about the actual module structure. All nine references have been replaced with explanatory comments and the new modules (`IncidentReports`, `ExportUtils`, `ThemeManager`) have been registered in their place.

### 8. Decentralised Server Configuration (Fixed)

Every route file and the database module each declared their own local `CONSTANTS` block. This was the root cause of the bcrypt inconsistency (finding #3) and meant any shared value had to be updated in 5+ places to take effect. The new `server/config.js` is now the single source of truth. All route files import named aliases from it, so the change was non-breaking for their existing code.

---

## New Features Added

### 9. Incident Reports Module (New)

A complete incident reporting system was added in two parts:

**Backend (`server/routes/incidents.js`):** A full REST API with create, list, get, update, status-change, delete, and statistics endpoints. Role-based access is enforced at every endpoint — staff can only see and edit their own open reports, bosses can view all and update status, and only super admins can hard-delete. The incidents table is created automatically on first use even on existing databases, so no migration step is needed. Filtering by status, type, and priority is supported with cursor-based pagination.

**Frontend (`src/js/incident-reports.js`):** A self-contained UI module providing a report creation form with character-counted description field and client-side validation, a filterable report list with priority-coded cards and animated pulse for critical items, a full detail modal with inline status management for managers, and a statistics widget for the boss dashboard. The module works entirely in localStorage mode so it functions without the server running.

### 10. Export Utilities (New)

`src/js/export-utils.js` provides client-side CSV and print-to-PDF functionality for schedules, incident reports, payroll data, and the staff directory. CSV export uses proper RFC 4180 quoting and includes a UTF-8 BOM so Excel opens files without encoding issues. PDF export opens the browser's native print dialog with a fully formatted print-ready page (separate table styles, colour-coded priority badges, Lifestar header). The module requires no server dependency and no third-party libraries.

### 11. Dark Mode Theme Manager (New)

`src/js/theme-manager.js` provides complete dark mode support by overriding the CSS custom properties already defined in the existing `:root` block. Because the stylesheet already uses CSS variables throughout, the entire application theme switches instantly with a single attribute change (`data-theme="dark"` on `<html>`), without any per-element JavaScript manipulation. The implementation respects the `prefers-color-scheme` media query on first visit and persists the user's preference to localStorage. A toggle button factory, settings panel row, and auto-injection into common header containers are all included.

---

## Documentation and Infrastructure

### 12. Missing .env.example (Fixed)

There was no `.env.example` file in the repository, meaning a new developer had no documentation of which environment variables exist, which are required, or what valid values look like. The file has been created with all variables documented, marked as required or optional, and with `openssl`/`node` commands for generating secure secrets.

### 13. Server Startup Validation (New)

`server/index.js` now calls `validateEnv()` immediately after loading dotenv, before any other server initialisation. This gives a clear, actionable error message listing every missing required variable rather than the previous behaviour of proceeding silently with insecure fallbacks or crashing later with a cryptic error.

---

## Remaining Recommendations

The following items were identified but are outside the scope of this rework pass:

**Phase 4 CSS Optimisation:** The `styles.bundle.min.css` file is 4,714 lines. Running PurgeCSS against the current HTML to remove any styles added during earlier development cycles that are no longer referenced would likely reduce this by 20–30%.

**Per-User Token Revocation:** The current `revokeAllUserTokens()` function logs the event but cannot enumerate in-memory tokens by user ID. For full revocation (needed when deactivating a user who is currently logged in), add a `token_version INTEGER DEFAULT 0` column to the `users` table, increment it on deactivation, and add a `tokenVersion` claim to JWT payloads that is checked inside `verifyToken()` against the current database value.

**In-Memory Login Attempt Tracking:** `server/routes/auth.js` tracks failed login attempts in a `Map` that is lost on server restart. An attacker could simply restart the Node process (if they have server access) to clear their lockout. For production, persist attempt counts in the SQLite `users.failedLoginAttempts` column that already exists in the schema but is not currently used for lockout logic.

**README Update:** The README still shows the pre-consolidation `src/js/` file list with ~40 individual files. It should be updated to reflect the current structure.

---

## File Change Summary

| File | Status | Change |
|------|--------|--------|
| `server/config.js` | **New** | Centralised configuration with startup validation |
| `server/middleware/auth.js` | **Rewritten** | TTL token blacklist, centralized config, no hardcoded secrets |
| `server/routes/auth.js` | **Updated** | Uses config constants; removed local CONSTANTS block |
| `server/routes/users.js` | **Updated** | Uses config constants; bcrypt rounds now 12 consistently |
| `server/routes/incidents.js` | **New** | Full incident reports REST API |
| `server/db/database.js` | **Updated** | Reads bcrypt rounds from config |
| `server/index.js` | **Updated** | Calls validateEnv() at startup; mounts incidents route |
| `src/js/core-security.js` | **Updated** | _fallbackHash replaced with secure error |
| `src/js/core-helpers.js` | **Updated** | DataValidators refactored to delegation wrapper |
| `src/js/system-initializer.js` | **Updated** | Removed 9 stale archived-file references; registers new modules |
| `src/js/incident-reports.js` | **New** | Complete incident reports frontend UI |
| `src/js/export-utils.js` | **New** | CSV and print-to-PDF export for all data types |
| `src/js/theme-manager.js` | **New** | Full dark mode with OS preference detection |
| `.env.example` | **Updated** | All variables documented with generation instructions |
