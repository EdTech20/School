const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

function initDB() {
    // 1. users table
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            fullName TEXT NOT NULL,
            staffId TEXT,
            department TEXT,
            role TEXT NOT NULL,
            isActive INTEGER DEFAULT 1,
            profileImage TEXT,
            bio TEXT,
            phone TEXT,
            certificates TEXT DEFAULT '[]',
            loginAttempts INTEGER DEFAULT 0,
            handoverCode TEXT,
            createdAt TEXT NOT NULL
        )
    `);

    // 2. departments table
    db.exec(`
        CREATE TABLE IF NOT EXISTS departments (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            code TEXT,
            hodId TEXT,
            createdAt TEXT NOT NULL
        )
    `);

    // 3. sessions table
    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            academicYear TEXT,
            semester TEXT,
            status TEXT DEFAULT 'Open',
            isActive INTEGER DEFAULT 1,
            createdAt TEXT NOT NULL
        )
    `);

    // 4. applications table
    db.exec(`
        CREATE TABLE IF NOT EXISTS applications (
            id TEXT PRIMARY KEY,
            staffId TEXT NOT NULL,
            department TEXT NOT NULL,
            type TEXT NOT NULL,
            details TEXT NOT NULL,
            certificates TEXT DEFAULT '[]',
            sessionId TEXT NOT NULL,
            sessionName TEXT NOT NULL,
            status TEXT DEFAULT 'Pending',
            score REAL DEFAULT 0,
            submittedAt TEXT NOT NULL,
            updatedAt TEXT,
            FOREIGN KEY (staffId) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // 5. evaluations table
    db.exec(`
        CREATE TABLE IF NOT EXISTS evaluations (
            id TEXT PRIMARY KEY,
            applicationId TEXT,
            staffId TEXT NOT NULL,
            evaluatorId TEXT NOT NULL,
            evaluatorRole TEXT NOT NULL,
            sessionId TEXT NOT NULL,
            department TEXT NOT NULL,
            scores TEXT NOT NULL,
            totalScore REAL NOT NULL,
            comments TEXT,
            submittedAt TEXT NOT NULL
        )
    `);

    // 6. hodReviews table
    db.exec(`
        CREATE TABLE IF NOT EXISTS hodReviews (
            id TEXT PRIMARY KEY,
            applicationId TEXT NOT NULL,
            staffId TEXT NOT NULL,
            hodId TEXT NOT NULL,
            sessionId TEXT NOT NULL,
            reviewComments TEXT NOT NULL,
            recommendation TEXT NOT NULL,
            score REAL NOT NULL,
            status TEXT NOT NULL,
            createdAt TEXT NOT NULL
        )
    `);

    // 7. passwordResetOTP table
    db.exec(`
        CREATE TABLE IF NOT EXISTS passwordResetOTP (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            otp TEXT NOT NULL,
            expiresAt TEXT NOT NULL,
            used INTEGER DEFAULT 0,
            createdAt TEXT NOT NULL
        )
    `);

    // 8. notifications table
    db.exec(`
        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            isRead INTEGER DEFAULT 0,
            type TEXT DEFAULT 'info',
            createdAt TEXT NOT NULL
        )
    `);

    seedInitialData();
}

function seedInitialData() {
    // Seed Departments if empty
    const deptCount = db.prepare('SELECT COUNT(*) as count FROM departments').get().count;
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

    // Seed default Users if empty or missing default users
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

    // Seed initial Session if empty
    const sessionCount = db.prepare('SELECT COUNT(*) as count FROM sessions').get().count;
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
