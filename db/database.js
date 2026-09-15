const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

let db;

function createFallbackDB() {
    const memory = {
        users: [],
        departments: [],
        sessions: [],
        applications: [],
        evaluations: [],
        hodReviews: [],
        passwordResetOTP: [],
        notifications: []
    };

    return {
        pragma() {},
        exec() {},
        prepare(sql) {
            const cleanSql = sql.trim();
            return {
                run(...params) {
                    if (cleanSql.startsWith('INSERT INTO users')) {
                        const [id, email, password, fullName, staffId, department, role, isActive, profileImage, certificates, createdAt] = params;
                        memory.users.push({ id, email, password, fullName, staffId, department, role, isActive: isActive ?? 1, profileImage: profileImage || null, certificates: certificates || '[]', bio: '', phone: '', loginAttempts: 0, handoverCode: null, createdAt: createdAt || new Date().toISOString() });
                    } else if (cleanSql.startsWith('INSERT INTO departments')) {
                        const [id, name, code, createdAt] = params;
                        memory.departments.push({ id, name, code, hodId: null, createdAt: createdAt || new Date().toISOString() });
                    } else if (cleanSql.startsWith('INSERT INTO sessions')) {
                        const [id, name, academicYear, semester, status, isActive, createdAt] = params;
                        memory.sessions.push({ id, name, academicYear, semester, status: status || 'Open', isActive: isActive ?? 1, createdAt: createdAt || new Date().toISOString() });
                    } else if (cleanSql.startsWith('INSERT INTO applications')) {
                        const [id, staffId, department, type, details, certificates, sessionId, sessionName, status, score, submittedAt] = params;
                        memory.applications.push({ id, staffId, department, type, details, certificates: certificates || '[]', sessionId, sessionName, status: status || 'Pending', score: score || 0, submittedAt: submittedAt || new Date().toISOString() });
                    } else if (cleanSql.startsWith('INSERT INTO evaluations')) {
                        const [id, applicationId, staffId, evaluatorId, evaluatorRole, sessionId, department, scores, totalScore, comments, submittedAt] = params;
                        memory.evaluations.push({ id, applicationId, staffId, evaluatorId, evaluatorRole, sessionId, department, scores, totalScore, comments, submittedAt: submittedAt || new Date().toISOString() });
                    } else if (cleanSql.startsWith('INSERT INTO hodReviews')) {
                        const [id, applicationId, staffId, hodId, sessionId, reviewComments, recommendation, score, status, createdAt] = params;
                        memory.hodReviews.push({ id, applicationId, staffId, hodId, sessionId, reviewComments, recommendation, score, status, createdAt: createdAt || new Date().toISOString() });
                    } else if (cleanSql.startsWith('INSERT INTO notifications')) {
                        const [id, userId, title, message, isRead, type, createdAt] = params;
                        memory.notifications.push({ id, userId, title, message, isRead: isRead ?? 0, type: type || 'info', createdAt: createdAt || new Date().toISOString() });
                    } else if (cleanSql.startsWith('INSERT INTO passwordResetOTP')) {
                        const [id, email, otp, expiresAt, used, createdAt] = params;
                        memory.passwordResetOTP.push({ id, email, otp, expiresAt, used: used ?? 0, createdAt: createdAt || new Date().toISOString() });
                    } else if (cleanSql.startsWith('UPDATE users SET status =') || cleanSql.includes('UPDATE users')) {
                        if (params.length >= 2) {
                            const targetId = params[params.length - 1];
                            const u = memory.users.find(x => x.id === targetId);
                            if (u && cleanSql.includes('isActive =')) u.isActive = params[0];
                            if (u && cleanSql.includes('password =')) u.password = params[0];
                            if (u && cleanSql.includes('handoverCode =')) { u.handoverCode = params[0]; u.loginAttempts = 0; }
                        }
                    } else if (cleanSql.includes('UPDATE sessions SET status =')) {
                        memory.sessions.forEach(s => { if (s.status === 'Open') s.status = 'Closed'; });
                    } else if (cleanSql.includes('UPDATE applications SET status =')) {
                        const [status, score, updatedAt, id] = params;
                        const app = memory.applications.find(a => a.id === id);
                        if (app) { app.status = status; if (score !== undefined) app.score = score; app.updatedAt = updatedAt; }
                    } else if (cleanSql.startsWith('DELETE FROM departments')) {
                        const [id] = params;
                        memory.departments = memory.departments.filter(d => d.id !== id);
                    }
                    return { changes: 1 };
                },
                get(...params) {
                    if (cleanSql.includes('FROM users WHERE email =')) {
                        return memory.users.find(u => u.email === params[0]) || null;
                    } else if (cleanSql.includes('FROM users WHERE id =')) {
                        return memory.users.find(u => u.id === params[0]) || null;
                    } else if (cleanSql.includes('COUNT(*) as count FROM users')) {
                        return { count: memory.users.filter(u => u.id && u.id.includes(params[0]?.replace('%',''))).length };
                    } else if (cleanSql.includes('COUNT(*) as count FROM departments')) {
                        return { count: memory.departments.length };
                    } else if (cleanSql.includes('COUNT(*) as count FROM sessions')) {
                        return { count: memory.sessions.length };
                    } else if (cleanSql.includes('FROM sessions WHERE status = \'Open\'')) {
                        return memory.sessions.find(s => s.status === 'Open') || null;
                    } else if (cleanSql.includes('FROM applications WHERE staffId = ? AND sessionId = ?')) {
                        return memory.applications.find(a => a.staffId === params[0] && a.sessionId === params[1]) || null;
                    } else if (cleanSql.includes('FROM applications WHERE id =')) {
                        return memory.applications.find(a => a.id === params[0]) || null;
                    } else if (cleanSql.includes('FROM evaluations WHERE id =')) {
                        return memory.evaluations.find(e => e.id === params[0]) || null;
                    } else if (cleanSql.includes('FROM departments WHERE name =')) {
                        return memory.departments.find(d => d.name === params[0]) || null;
                    }
                    return null;
                },
                all(...params) {
                    if (cleanSql.includes('FROM users')) {
                        let res = [...memory.users];
                        if (cleanSql.includes('role = ?')) {
                            const rIndex = cleanSql.indexOf('role = ?');
                            res = res.filter(u => u.role === params[0]);
                        }
                        return res;
                    } else if (cleanSql.includes('FROM departments')) {
                        return memory.departments.map(d => {
                            const hod = memory.users.find(u => u.id === d.hodId);
                            return { ...d, hodName: hod ? hod.fullName : null };
                        });
                    } else if (cleanSql.includes('FROM sessions')) {
                        return [...memory.sessions].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
                    } else if (cleanSql.includes('FROM applications')) {
                        return memory.applications.map(a => {
                            const u = memory.users.find(x => x.id === a.staffId);
                            return { ...a, applicantName: u ? u.fullName : 'Unknown', applicantEmail: u ? u.email : '', staffCode: u ? u.staffId : '' };
                        });
                    } else if (cleanSql.includes('FROM evaluations')) {
                        return memory.evaluations.map(e => {
                            const l = memory.users.find(x => x.id === e.staffId);
                            const ev = memory.users.find(x => x.id === e.evaluatorId);
                            return { ...e, staffName: l ? l.fullName : '', staffCode: l ? l.staffId : '', evaluatorName: ev ? ev.fullName : '' };
                        });
                    } else if (cleanSql.includes('FROM hodReviews')) {
                        return [...memory.hodReviews];
                    } else if (cleanSql.includes('FROM notifications')) {
                        return memory.notifications.filter(n => n.userId === params[0]);
                    }
                    return [];
                }
            };
        }
    };
}

try {
    const Database = require('better-sqlite3');
    const isVercel = !!process.env.VERCEL;
    const defaultDbPath = path.join(__dirname, '..', 'database.sqlite');
    const dbPath = isVercel ? path.join('/tmp', 'database.sqlite') : defaultDbPath;

    if (isVercel && fs.existsSync(defaultDbPath) && !fs.existsSync(dbPath)) {
        try { fs.copyFileSync(defaultDbPath, dbPath); } catch (e) {}
    }

    db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
} catch (err) {
    console.warn('better-sqlite3 native module warning, switching to in-memory store:', err.message);
    db = createFallbackDB();
}

function initDB() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
            fullName TEXT NOT NULL, staffId TEXT, department TEXT, role TEXT NOT NULL,
            isActive INTEGER DEFAULT 1, profileImage TEXT, bio TEXT, phone TEXT,
            certificates TEXT DEFAULT '[]', loginAttempts INTEGER DEFAULT 0, handoverCode TEXT, createdAt TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS departments (
            id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, code TEXT, hodId TEXT, createdAt TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, academicYear TEXT, semester TEXT, status TEXT DEFAULT 'Open', isActive INTEGER DEFAULT 1, createdAt TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS applications (
            id TEXT PRIMARY KEY, staffId TEXT NOT NULL, department TEXT NOT NULL, type TEXT NOT NULL, details TEXT NOT NULL, certificates TEXT DEFAULT '[]', sessionId TEXT NOT NULL, sessionName TEXT NOT NULL, status TEXT DEFAULT 'Pending', score REAL DEFAULT 0, submittedAt TEXT NOT NULL, updatedAt TEXT
        );
        CREATE TABLE IF NOT EXISTS evaluations (
            id TEXT PRIMARY KEY, applicationId TEXT, staffId TEXT NOT NULL, evaluatorId TEXT NOT NULL, evaluatorRole TEXT NOT NULL, sessionId TEXT NOT NULL, department TEXT NOT NULL, scores TEXT NOT NULL, totalScore REAL NOT NULL, comments TEXT, submittedAt TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS hodReviews (
            id TEXT PRIMARY KEY, applicationId TEXT NOT NULL, staffId TEXT NOT NULL, hodId TEXT NOT NULL, sessionId TEXT NOT NULL, reviewComments TEXT NOT NULL, recommendation TEXT NOT NULL, score REAL NOT NULL, status TEXT NOT NULL, createdAt TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS passwordResetOTP (
            id TEXT PRIMARY KEY, email TEXT NOT NULL, otp TEXT NOT NULL, expiresAt TEXT NOT NULL, used INTEGER DEFAULT 0, createdAt TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY, userId TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, isRead INTEGER DEFAULT 0, type TEXT DEFAULT 'info', createdAt TEXT NOT NULL
        );
    `);

    seedInitialData();
}

function seedInitialData() {
    const countRow = db.prepare('SELECT COUNT(*) as count FROM departments').get();
    const deptCount = countRow ? countRow.count : 0;
    if (deptCount === 0) {
        const defaultDepts = [
            'Computer Science', 'Mathematics', 'Physics', 'Chemistry',
            'Biology', 'Economics', 'Business Administration', 'Law',
            'Medicine', 'Engineering', 'Agriculture', 'Education'
        ];
        const insertDept = db.prepare('INSERT INTO departments (id, name, code, createdAt) VALUES (?, ?, ?, ?)');
        defaultDepts.forEach((name, i) => {
            const code = name.split(' ').map(w => w[0]).join('').toUpperCase();
            insertDept.run(`DEPT-${String(i + 1).padStart(3, '0')}`, name, code, new Date().toISOString());
        });
    }

    const defaultUsers = [
        { id: 'STF/2026/001', email: 'vc@university.edu', password: 'vc123456', fullName: 'Vice Chancellor', role: 'VC', department: 'Administration', staffId: 'VC001' },
        { id: 'STF/2026/002', email: 'hod@university.edu', password: 'hod123456', fullName: 'Dr. John HOD', role: 'HOD', department: 'Computer Science', staffId: 'HOD001' },
        { id: 'STF/2026/003', email: 'lecturer@university.edu', password: 'lec123456', fullName: 'Jane Lecturer', role: 'Lecturer', department: 'Computer Science', staffId: 'LEC001' },
        { id: 'STF/2026/004', email: 'student@university.edu', password: 'stu123456', fullName: 'Alice Student', role: 'Student', department: 'Computer Science', staffId: 'STU001' }
    ];

    const findUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
    const insertUser = db.prepare(`
        INSERT INTO users (id, email, password, fullName, staffId, department, role, isActive, certificates, bio, phone, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, '[]', '', '', ?)
    `);

    defaultUsers.forEach(u => {
        const existing = findUserByEmail.get(u.email);
        if (!existing) {
            const hashedPassword = bcrypt.hashSync(u.password, 10);
            insertUser.run(u.id, u.email, hashedPassword, u.fullName, u.staffId, u.department, u.role, new Date().toISOString());
        }
    });

    const sCountRow = db.prepare('SELECT COUNT(*) as count FROM sessions').get();
    const sessionCount = sCountRow ? sCountRow.count : 0;
    if (sessionCount === 0) {
        const insertSession = db.prepare(`
            INSERT INTO sessions (id, name, academicYear, semester, status, isActive, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        insertSession.run('SESS-2026-001', '2026/2027', '2026/2027', 'First Semester', 'Open', 1, new Date().toISOString());
    }
}

initDB();

module.exports = db;
