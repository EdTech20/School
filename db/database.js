const bcrypt = require('bcryptjs');
const path = require('path');

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

let db = null;
let tursoClient = null;
let dbReady = false;

// ─────────────────────────────────────────────────────────────
//  SQLite Table Creation SQL
// ─────────────────────────────────────────────────────────────
const CREATE_TABLES_SQL = [
    `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
        fullName TEXT NOT NULL, staffId TEXT, department TEXT, role TEXT NOT NULL,
        isActive INTEGER DEFAULT 1, profileImage TEXT, bio TEXT DEFAULT '', phone TEXT DEFAULT '',
        certificates TEXT DEFAULT '[]', loginAttempts INTEGER DEFAULT 0, handoverCode TEXT, createdAt TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS departments (
        id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, code TEXT, hodId TEXT, createdAt TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, academicYear TEXT, semester TEXT,
        status TEXT DEFAULT 'Open', isActive INTEGER DEFAULT 1, createdAt TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS applications (
        id TEXT PRIMARY KEY, staffId TEXT NOT NULL, department TEXT NOT NULL, type TEXT NOT NULL,
        details TEXT NOT NULL, certificates TEXT DEFAULT '[]', sessionId TEXT NOT NULL,
        sessionName TEXT NOT NULL, status TEXT DEFAULT 'Pending', score REAL DEFAULT 0,
        submittedAt TEXT NOT NULL, updatedAt TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS evaluations (
        id TEXT PRIMARY KEY, applicationId TEXT, staffId TEXT NOT NULL, evaluatorId TEXT NOT NULL,
        evaluatorRole TEXT NOT NULL, sessionId TEXT NOT NULL, department TEXT NOT NULL,
        scores TEXT NOT NULL, totalScore REAL NOT NULL, comments TEXT, submittedAt TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS hodReviews (
        id TEXT PRIMARY KEY, applicationId TEXT NOT NULL, staffId TEXT NOT NULL,
        hodId TEXT NOT NULL, sessionId TEXT NOT NULL, reviewComments TEXT NOT NULL,
        recommendation TEXT NOT NULL, score REAL NOT NULL, status TEXT NOT NULL, createdAt TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS passwordResetOTP (
        id TEXT PRIMARY KEY, email TEXT NOT NULL, otp TEXT NOT NULL,
        expiresAt TEXT NOT NULL, used INTEGER DEFAULT 0, createdAt TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY, userId TEXT NOT NULL, title TEXT NOT NULL,
        message TEXT NOT NULL, isRead INTEGER DEFAULT 0, type TEXT DEFAULT 'info', createdAt TEXT NOT NULL
    )`
];

const DEFAULT_DEPTS = [
    'Computer Science', 'Mathematics', 'Physics', 'Chemistry',
    'Biology', 'Economics', 'Business Administration', 'Law',
    'Medicine', 'Engineering', 'Agriculture', 'Education'
];

const DEFAULT_USERS = [
    { id: 'STF/2026/001', email: 'vc@university.edu', password: 'vc123456', fullName: 'Vice Chancellor', role: 'VC', department: 'Administration', staffId: 'VC001' },
    { id: 'STF/2026/002', email: 'hod@university.edu', password: 'hod123456', fullName: 'Dr. John HOD', role: 'HOD', department: 'Computer Science', staffId: 'HOD001' },
    { id: 'STF/2026/003', email: 'lecturer@university.edu', password: 'lec123456', fullName: 'Jane Lecturer', role: 'Lecturer', department: 'Computer Science', staffId: 'LEC001' },
    { id: 'STF/2026/004', email: 'student@university.edu', password: 'stu123456', fullName: 'Alice Student', role: 'Student', department: 'Computer Science', staffId: 'STU001' }
];

// ─────────────────────────────────────────────────────────────
//  TURSO ASYNC PATH
// ─────────────────────────────────────────────────────────────
async function initTurso() {
    const { createClient } = require('@libsql/client');
    tursoClient = createClient({ url: tursoUrl, authToken: tursoToken });

    for (const sql of CREATE_TABLES_SQL) {
        await tursoClient.execute(sql);
    }

    // Seed departments
    const deptCount = await tursoClient.execute('SELECT COUNT(*) as count FROM departments');
    if (Number(deptCount.rows[0].count) === 0) {
        for (let i = 0; i < DEFAULT_DEPTS.length; i++) {
            const name = DEFAULT_DEPTS[i];
            const code = name.split(' ').map(w => w[0]).join('').toUpperCase();
            await tursoClient.execute({
                sql: `INSERT INTO departments (id, name, code, createdAt) VALUES (?, ?, ?, ?)`,
                args: [`DEPT-${String(i + 1).padStart(3, '0')}`, name, code, new Date().toISOString()]
            });
        }
    }

    // Seed users
    for (const u of DEFAULT_USERS) {
        const existing = await tursoClient.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [u.email] });
        if (existing.rows.length === 0) {
            const hash = bcrypt.hashSync(u.password, 10);
            await tursoClient.execute({
                sql: `INSERT INTO users (id, email, password, fullName, staffId, department, role, isActive, certificates, bio, phone, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, 1, '[]', '', '', ?)`,
                args: [u.id, u.email, hash, u.fullName, u.staffId, u.department, u.role, new Date().toISOString()]
            });
        }
    }

    // Seed session
    const sessCount = await tursoClient.execute('SELECT COUNT(*) as count FROM sessions');
    if (Number(sessCount.rows[0].count) === 0) {
        await tursoClient.execute({
            sql: `INSERT INTO sessions (id, name, academicYear, semester, status, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: ['SESS-2026-001', '2026/2027', '2026/2027', 'First Semester', 'Open', 1, new Date().toISOString()]
        });
    }

    console.log('✅ Turso Cloud DB initialized & seeded');
    dbReady = true;
    return buildTursoAdapter();
}

// ─────────────────────────────────────────────────────────────
//  TURSO ADAPTER — makes tursoClient look sync-ish to routes
//  Routes must await all db calls when using turso
// ─────────────────────────────────────────────────────────────
function buildTursoAdapter() {
    return {
        isTurso: true,
        client: tursoClient,

        async execute(sql, args = []) {
            const result = await tursoClient.execute({ sql, args });
            return result;
        },

        // Convenience wrappers matching better-sqlite3's sync API surface
        // but returning Promises (routes need to await these)
        prepare(sql) {
            return {
                async run(...args) {
                    await tursoClient.execute({ sql, args });
                    return { changes: 1 };
                },
                async get(...args) {
                    const r = await tursoClient.execute({ sql, args });
                    if (r.rows.length === 0) return null;
                    return rowToObj(r.columns, r.rows[0]);
                },
                async all(...args) {
                    const r = await tursoClient.execute({ sql, args });
                    return r.rows.map(row => rowToObj(r.columns, row));
                }
            };
        },

        // Direct async helpers
        async queryOne(sql, args = []) {
            const r = await tursoClient.execute({ sql, args });
            if (r.rows.length === 0) return null;
            return rowToObj(r.columns, r.rows[0]);
        },

        async queryAll(sql, args = []) {
            const r = await tursoClient.execute({ sql, args });
            return r.rows.map(row => rowToObj(r.columns, row));
        },

        async run(sql, args = []) {
            await tursoClient.execute({ sql, args });
            return { changes: 1 };
        }
    };
}

function rowToObj(columns, row) {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
}

// ─────────────────────────────────────────────────────────────
//  BETTER-SQLITE3 SYNC PATH (local dev / non-Vercel)
// ─────────────────────────────────────────────────────────────
function initSqlite() {
    const Database = require('better-sqlite3');
    const dbPath = path.join(__dirname, '..', 'database.sqlite');
    const nativeDb = new Database(dbPath);
    nativeDb.pragma('foreign_keys = ON');

    // Create tables
    for (const sql of CREATE_TABLES_SQL) {
        nativeDb.prepare(sql).run();
    }

    // Seed departments
    const deptCount = nativeDb.prepare('SELECT COUNT(*) as count FROM departments').get().count;
    if (deptCount === 0) {
        const ins = nativeDb.prepare('INSERT INTO departments (id, name, code, createdAt) VALUES (?, ?, ?, ?)');
        DEFAULT_DEPTS.forEach((name, i) => {
            const code = name.split(' ').map(w => w[0]).join('').toUpperCase();
            ins.run(`DEPT-${String(i + 1).padStart(3, '0')}`, name, code, new Date().toISOString());
        });
    }

    // Seed users
    const findUser = nativeDb.prepare('SELECT id FROM users WHERE email = ?');
    const insUser = nativeDb.prepare(`INSERT INTO users (id, email, password, fullName, staffId, department, role, isActive, certificates, bio, phone, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, 1, '[]', '', '', ?)`);
    DEFAULT_USERS.forEach(u => {
        if (!findUser.get(u.email)) {
            insUser.run(u.id, u.email, bcrypt.hashSync(u.password, 10), u.fullName, u.staffId, u.department, u.role, new Date().toISOString());
        }
    });

    // Seed session
    const sessCount = nativeDb.prepare('SELECT COUNT(*) as count FROM sessions').get().count;
    if (sessCount === 0) {
        nativeDb.prepare(`INSERT INTO sessions (id, name, academicYear, semester, status, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run('SESS-2026-001', '2026/2027', '2026/2027', 'First Semester', 'Open', 1, new Date().toISOString());
    }

    console.log('✅ Local SQLite DB initialized & seeded');
    dbReady = true;

    // Wrap to add async helpers matching turso adapter interface
    return {
        isTurso: false,
        prepare(sql) { return nativeDb.prepare(sql); },
        exec(sql) { return nativeDb.exec(sql); },
        pragma(p) { return nativeDb.pragma(p); },

        async queryOne(sql, args = []) {
            return nativeDb.prepare(sql).get(...args) || null;
        },
        async queryAll(sql, args = []) {
            return nativeDb.prepare(sql).all(...args);
        },
        async run(sql, args = []) {
            const r = nativeDb.prepare(sql).run(...args);
            return { changes: r.changes };
        }
    };
}

// ─────────────────────────────────────────────────────────────
//  MODULE INIT — export a promise that resolves to the db adapter
// ─────────────────────────────────────────────────────────────
let dbPromise;

if (tursoUrl) {
    // Turso Cloud — used in production / Vercel. Never fall back to native SQLite here
    // because better-sqlite3 native binaries are not available on Vercel serverless.
    dbPromise = initTurso();
} else {
    // Local development — use better-sqlite3 (sync, fast)
    dbPromise = Promise.resolve(initSqlite());
}

// Export both the promise and a sync-safe proxy
// Routes should do: const db = await require('./db/database');
module.exports = dbPromise;
