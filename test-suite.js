#!/usr/bin/env node
/**
 * Lifestar Comprehensive Test Suite
 * Starts the server inline and runs API tests
 */

'use strict';

process.env.NODE_ENV = 'development';
require('dotenv').config();

const http = require('http');

function apiCall(method, path, body, token) {
    return new Promise((resolve) => {
        const data = body ? JSON.stringify(body) : null;
        const opts = {
            hostname: '127.0.0.1',
            port: 8061,
            path: '/api' + path,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
            },
        };
        const req = http.request(opts, (res) => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                try { resolve({ ok: res.statusCode < 400, status: res.statusCode, data: JSON.parse(raw) }); }
                catch { resolve({ ok: false, status: res.statusCode, data: {} }); }
            });
        });
        req.on('error', e => resolve({ ok: false, status: 0, data: { error: e.message } }));
        if (data) req.write(data);
        req.end();
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const pass = [];
const fail = [];
function check(label, cond, info = '') {
    if (cond) { pass.push(label); console.log(`  ✓ ${label}${info ? ' — ' + info : ''}`); }
    else       { fail.push(label); console.log(`  ✗ ${label}${info ? ' — ' + info : ''}`); }
}

async function runTests() {
    // ── Login ─────────────────────────────────────────────────────────────────
    console.log('\n═══ LOGIN TESTS ═══');
    const creds = [
        ['super','super123','super'],
        ['boss','boss123','boss'],
        ['paramedic1','paramedic123','paramedic'],
        ['emt1','emt123','emt'],
        ['emt2','emt123','emt'],
        ['paramedic2','paramedic123','paramedic'],
    ];
    for (const [u,p,expectedRole] of creds) {
        const r = await apiCall('POST', '/auth/login', { username: u, password: p });
        check(`Login [${u}]`, r.ok && r.data.user?.role === expectedRole, `role=${r.data.user?.role || r.data.error}`);
    }

    console.log('\n═══ CASE-INSENSITIVE LOGIN ═══');
    const ci = await apiCall('POST', '/auth/login', { username: 'SUPER', password: 'super123' });
    check('SUPER (uppercase) logs in', ci.ok && ci.data.user?.role === 'super');

    const bossCI = await apiCall('POST', '/auth/login', { username: 'Boss', password: 'boss123' });
    check('Boss (mixed case) logs in', bossCI.ok && bossCI.data.user?.role === 'boss');

    // ── Tokens ────────────────────────────────────────────────────────────────
    const loginR = await apiCall('POST', '/auth/login', { username: 'super', password: 'super123' });
    const tok = loginR.data.token;
    check('JWT token returned', !!tok && tok.length > 20);

    // ── Permissions ───────────────────────────────────────────────────────────
    console.log('\n═══ PERMISSIONS API ═══');
    const defs = await apiCall('GET', '/permissions/definitions', null, tok);
    const defCount = Object.keys(defs.data.definitions || {}).length;
    check('Permission definitions loaded', defCount >= 50, `${defCount} keys`);
    check('All 4 roles in defaults', JSON.stringify(Object.keys(defs.data.roles || {}).sort()) === JSON.stringify(['boss','emt','paramedic','super']));

    const au = await apiCall('GET', '/permissions/all-users', null, tok);
    const users = au.data.users || [];
    check('All active users listed', users.length >= 4, `${users.length} users`);
    console.log('  User permission counts:');
    for (const u of users) console.log(`    ${u.username.padEnd(15)} (${u.role.padEnd(9)}) ${String(u.effective.length).padStart(3)} perms`);

    // Boss permissions
    const bossId = users.find(u => u.username === 'boss')?.id;
    const bossPerms = await apiCall('GET', `/permissions/user/${bossId}`, null, tok);
    check('Boss permissions retrieved', bossPerms.ok);
    check('Boss has schedule.publish', bossPerms.data.effective?.includes('schedule.publish'));
    check('Boss does NOT have admin.permissions', !bossPerms.data.effective?.includes('admin.permissions'));

    // Grant
    const grantR = await apiCall('POST', `/permissions/user/${bossId}/grant`, { permission: 'admin.logs' }, tok);
    check('Grant admin.logs to boss', grantR.ok);
    const afterGrant = await apiCall('GET', `/permissions/user/${bossId}`, null, tok);
    check('Boss has admin.logs after grant', afterGrant.data.effective?.includes('admin.logs'));

    // Revoke
    const revokeR = await apiCall('POST', `/permissions/user/${bossId}/revoke`, { permission: 'admin.logs' }, tok);
    check('Revoke admin.logs from boss', revokeR.ok);
    const afterRevoke = await apiCall('GET', `/permissions/user/${bossId}`, null, tok);
    check('Boss lacks admin.logs after revoke', !afterRevoke.data.effective?.includes('admin.logs'));

    // Reset
    await apiCall('POST', `/permissions/user/${bossId}/grant`, { permission: 'admin.logs' }, tok);
    const resetR = await apiCall('POST', `/permissions/user/${bossId}/reset`, {}, tok);
    check('Reset boss to role defaults', resetR.ok);
    const afterReset = await apiCall('GET', `/permissions/user/${bossId}`, null, tok);
    check('Boss back to defaults after reset', !afterReset.data.effective?.includes('admin.logs'));

    // ── Schedules ─────────────────────────────────────────────────────────────
    console.log('\n═══ SCHEDULES API ═══');
    const sched = await apiCall('GET', '/schedules?limit=10', null, tok);
    const scheds = sched.data.schedules || [];
    check('Schedules retrieved', scheds.length > 0, `${scheds.length} schedules`);
    check('Schedules include crew data', scheds.every(s => Array.isArray(s.crews)), 'all have crews array');
    for (const s of scheds.slice(0, 3)) console.log(`    [${s.id}] ${s.name.padEnd(40)} ${s.status} crews=${s.crews.length}`);

    // ── Users ─────────────────────────────────────────────────────────────────
    console.log('\n═══ USERS API ═══');
    const usersR = await apiCall('GET', '/users?limit=20', null, tok);
    const userList = usersR.data.users || [];
    check('Users retrieved', userList.length >= 4, `${userList.length} users`);

    // Create user
    const newUser = {
        username: `testuser${Math.floor(Math.random()*9999)}`,
        password: 'Testpass99', // meets complexity: upper, lower, digit
        fullName: 'Test User',
        role: 'emt',
        phone: '555-9999',
    };
    const createR = await apiCall('POST', '/users', newUser, tok);
    check('Create new user', createR.ok, createR.data.error || '');

    // Login with new user
    if (createR.ok) {
        const newLogin = await apiCall('POST', '/auth/login', { username: newUser.username, password: newUser.password });
        check('New user can log in', newLogin.ok);
        // Delete them
        const newUserId = createR.data.user?.id;
        if (newUserId) {
            const delR = await apiCall('DELETE', `/users/${newUserId}`, null, tok);
            check('Delete test user', delR.ok);
        }
    }

    // ── Auth/Me ───────────────────────────────────────────────────────────────
    console.log('\n═══ SESSION API ═══');
    const meR = await apiCall('GET', '/auth/me', null, tok);
    check('GET /auth/me returns current user', meR.ok && meR.data.user?.username === 'super');

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════');
    console.log(`PASSED: ${pass.length} / ${pass.length + fail.length}`);
    if (fail.length) {
        console.log(`FAILED: ${fail.length}`);
        fail.forEach(f => console.log(`  ✗ ${f}`));
    } else {
        console.log('ALL TESTS PASSED! ✓');
    }
    console.log('═══════════════════════════════════════════\n');
}

// ── Start the server inline, then run tests ──────────────────────────────────
const { initializeDatabase } = require('./server/db/database');
const { app }                = require('./server/index.js');

async function main() {
    console.log('Starting inline server test...');
    await sleep(1000);
    try {
        await runTests();
    } catch (e) {
        console.error('Test runner error:', e.message);
    }
    process.exit(0);
}

main();
