const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, verifyToken } = require('../middleware/authMiddleware');

function getDb() { return global._db; }

async function generateSystemId() {
    const db = getDb();
    const year = new Date().getFullYear();
    const countRow = await db.queryOne(`SELECT COUNT(*) as count FROM users WHERE id LIKE ?`, [`STF/${year}/%`]);
    const seq = String((countRow ? Number(countRow.count) : 0) + 1).padStart(3, '0');
    return `STF/${year}/${seq}`;
}

function parseCerts(val) {
    try { return typeof val === 'string' ? JSON.parse(val) : (val || []); } catch { return []; }
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const db = getDb();

        if (!email || !password) {
            return res.status(400).json({ ok: false, message: 'Please enter both email and password' });
        }

        const user = await db.queryOne('SELECT * FROM users WHERE email = ?', [email.trim()]);

        if (!user || Number(user.isActive) === 0) {
            return res.status(401).json({ ok: false, message: 'Invalid email or password' });
        }

        const isPasswordValid = bcrypt.compareSync(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ ok: false, message: 'Invalid email or password' });
        }

        // HOD handover lock
        if (user.role === 'HOD' && user.handoverCode && Number(user.loginAttempts) >= 2) {
            return res.status(403).json({ ok: false, message: 'Account locked. Please contact VC.' });
        }

        // Clear handover code on login
        if (user.handoverCode) {
            await db.run('UPDATE users SET handoverCode = NULL, loginAttempts = 0 WHERE id = ?', [user.id]);
            user.handoverCode = null;
            user.loginAttempts = 0;
        }

        user.certificates = parseCerts(user.certificates);
        const { password: _, ...userWithoutPassword } = user;

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, department: user.department },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ ok: true, message: 'Login successful!', token, user: userWithoutPassword });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ ok: false, message: 'Server error during login' });
    }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const db = getDb();
        let { fullName, email, password, department, role, staffId, profileImage } = req.body;

        if (!fullName || !email || !department || !role || !password) {
            return res.status(400).json({ ok: false, message: 'Please fill in all required fields' });
        }
        if (role === 'Student' && !staffId) {
            return res.status(400).json({ ok: false, message: 'Please enter your Matric Number' });
        }
        if (role === 'HOD') {
            return res.status(400).json({ ok: false, message: 'HOD cannot self-register. Register as Lecturer; VC will appoint HODs.' });
        }
        if (role === 'Lecturer' && !staffId) {
            staffId = 'LEC-' + Date.now().toString().slice(-6);
        }

        const existingEmail = await db.queryOne('SELECT id FROM users WHERE email = ?', [email.trim()]);
        if (existingEmail) {
            return res.status(400).json({ ok: false, message: 'Email already registered' });
        }

        if (staffId) {
            const existingStaff = await db.queryOne('SELECT id FROM users WHERE staffId = ?', [staffId.trim()]);
            if (existingStaff) {
                return res.status(400).json({ ok: false, message: 'Staff ID / Matric Number already exists' });
            }
        }

        const id = await generateSystemId();
        const hashedPassword = bcrypt.hashSync(password, 10);
        const createdAt = new Date().toISOString();

        await db.run(
            `INSERT INTO users (id, email, password, fullName, staffId, department, role, isActive, profileImage, certificates, bio, phone, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, '[]', '', '', ?)`,
            [id, email.trim(), hashedPassword, fullName.trim(), staffId || null, department, role, profileImage || null, createdAt]
        );

        const newUser = await db.queryOne('SELECT id, email, fullName, staffId, department, role, isActive, profileImage, createdAt FROM users WHERE id = ?', [id]);
        res.status(201).json({ ok: true, message: 'Account created successfully! Please login.', user: newUser });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ ok: false, message: 'Server error during registration' });
    }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
    try {
        const db = getDb();
        const { email } = req.body;
        if (!email) return res.status(400).json({ ok: false, message: 'Email address is required' });

        const user = await db.queryOne('SELECT id FROM users WHERE email = ?', [email.trim()]);
        if (!user) return res.status(404).json({ ok: false, message: 'Email address not found in system' });

        const otp = String(Math.floor(100000 + Math.random() * 900000));
        const id = 'OTP-' + Date.now();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        await db.run(
            `INSERT INTO passwordResetOTP (id, email, otp, expiresAt, used, createdAt) VALUES (?, ?, ?, ?, 0, ?)`,
            [id, email.trim(), otp, expiresAt, new Date().toISOString()]
        );

        res.json({ ok: true, message: 'Password reset OTP code generated', otp });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
    try {
        const db = getDb();
        const { email, otp, newPassword } = req.body;
        if (!email || !otp || !newPassword) {
            return res.status(400).json({ ok: false, message: 'All fields are required' });
        }

        const record = await db.queryOne(
            'SELECT * FROM passwordResetOTP WHERE email = ? AND otp = ? AND used = 0 ORDER BY createdAt DESC LIMIT 1',
            [email.trim(), otp.trim()]
        );

        if (!record) return res.status(400).json({ ok: false, message: 'Invalid or expired OTP code' });
        if (new Date(record.expiresAt) < new Date()) return res.status(400).json({ ok: false, message: 'OTP code has expired' });

        const hashedPassword = bcrypt.hashSync(newPassword, 10);
        await db.run('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email.trim()]);
        await db.run('UPDATE passwordResetOTP SET used = 1 WHERE id = ?', [record.id]);

        res.json({ ok: true, message: 'Password has been reset successfully' });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

// GET /api/auth/me
router.get('/me', verifyToken, async (req, res) => {
    try {
        const db = getDb();
        const user = await db.queryOne(
            'SELECT id, email, fullName, staffId, department, role, isActive, profileImage, bio, phone, certificates, loginAttempts, handoverCode, createdAt FROM users WHERE id = ?',
            [req.user.id]
        );
        if (!user) return res.status(404).json({ ok: false, message: 'User not found' });
        user.certificates = parseCerts(user.certificates);
        res.json({ ok: true, user });
    } catch (err) {
        console.error('Get me error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

module.exports = router;
