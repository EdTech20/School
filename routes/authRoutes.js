const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { JWT_SECRET, verifyToken } = require('../middleware/authMiddleware');

function generateSystemId() {
    const year = new Date().getFullYear();
    const countRow = db.prepare("SELECT COUNT(*) as count FROM users WHERE id LIKE ?").get(`STF/${year}/%`);
    const seq = String((countRow ? countRow.count : 0) + 1).padStart(3, '0');
    return `STF/${year}/${seq}`;
}

// POST /api/auth/login
router.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ ok: false, message: 'Please enter both email and password' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim());

    if (!user || user.isActive === 0) {
        return res.status(401).json({ ok: false, message: 'Invalid email or password' });
    }

    // Check password
    const isPasswordValid = bcrypt.compareSync(password, user.password);

    if (!isPasswordValid) {
        return res.status(401).json({ ok: false, message: 'Invalid email or password' });
    }

    // Check HOD handover locked state
    if (user.role === 'HOD' && user.handoverCode) {
        if (user.loginAttempts >= 2) {
            return res.status(403).json({ ok: false, message: 'Account locked. Please contact VC.' });
        }
        // Increment login attempts or clear handover
    }

    // Clear handover code upon login if present
    if (user.handoverCode) {
        db.prepare('UPDATE users SET handoverCode = NULL, loginAttempts = 0 WHERE id = ?').run(user.id);
        user.handoverCode = null;
        user.loginAttempts = 0;
    }

    // Parse certificates JSON
    try {
        user.certificates = typeof user.certificates === 'string' ? JSON.parse(user.certificates) : (user.certificates || []);
    } catch (e) {
        user.certificates = [];
    }

    // Hide password in response
    const { password: _, ...userWithoutPassword } = user;

    // Issue JWT token
    const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role, department: user.department },
        JWT_SECRET,
        { expiresIn: '24h' }
    );

    res.json({
        ok: true,
        message: 'Login successful!',
        token,
        user: userWithoutPassword
    });
});

// POST /api/auth/register
router.post('/register', (req, res) => {
    let { fullName, email, password, department, role, staffId, profileImage } = req.body;

    if (!fullName || !email || !department || !role || !password) {
        return res.status(400).json({ ok: false, message: 'Please fill in all required fields' });
    }

    if (role === 'Student' && !staffId) {
        return res.status(400).json({ ok: false, message: 'Please enter your Matric Number' });
    }

    if (role === 'HOD') {
        return res.status(400).json({ ok: false, message: 'HOD cannot self-register. Please register as a Lecturer. The VC will appoint HODs.' });
    }

    if (role === 'Lecturer' && !staffId) {
        staffId = 'LEC-' + Date.now().toString().slice(-6);
    }

    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim());
    if (existingEmail) {
        return res.status(400).json({ ok: false, message: 'Email already registered' });
    }

    if (staffId) {
        const existingStaff = db.prepare('SELECT id FROM users WHERE staffId = ?').get(staffId.trim());
        if (existingStaff) {
            return res.status(400).json({ ok: false, message: 'Staff ID / Matric Number already exists' });
        }
    }

    const id = generateSystemId();
    const hashedPassword = bcrypt.hashSync(password, 10);
    const createdAt = new Date().toISOString();

    db.prepare(`
        INSERT INTO users (id, email, password, fullName, staffId, department, role, isActive, profileImage, certificates, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, '[]', ?)
    `).run(id, email.trim(), hashedPassword, fullName.trim(), staffId || null, department, role, profileImage || null, createdAt);

    const newUser = db.prepare('SELECT id, email, fullName, staffId, department, role, isActive, profileImage, createdAt FROM users WHERE id = ?').get(id);

    res.status(201).json({
        ok: true,
        message: 'Account created successfully! Please login.',
        user: newUser
    });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ ok: false, message: 'Email address is required' });
    }

    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim());
    if (!user) {
        return res.status(404).json({ ok: false, message: 'Email address not found in system' });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const id = 'OTP-' + Date.now();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins

    db.prepare(`
        INSERT INTO passwordResetOTP (id, email, otp, expiresAt, used, createdAt)
        VALUES (?, ?, ?, ?, 0, ?)
    `).run(id, email.trim(), otp, expiresAt, new Date().toISOString());

    res.json({
        ok: true,
        message: 'Password reset OTP code generated',
        otp // Returned for UI verification
    });
});

// POST /api/auth/reset-password
router.post('/reset-password', (req, res) => {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
        return res.status(400).json({ ok: false, message: 'All fields are required' });
    }

    const record = db.prepare('SELECT * FROM passwordResetOTP WHERE email = ? AND otp = ? AND used = 0 ORDER BY createdAt DESC LIMIT 1').get(email.trim(), otp.trim());

    if (!record) {
        return res.status(400).json({ ok: false, message: 'Invalid or expired OTP code' });
    }

    if (new Date(record.expiresAt) < new Date()) {
        return res.status(400).json({ ok: false, message: 'OTP code has expired' });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE email = ?').run(hashedPassword, email.trim());
    db.prepare('UPDATE passwordResetOTP SET used = 1 WHERE id = ?').run(record.id);

    res.json({
        ok: true,
        message: 'Password has been reset successfully'
    });
});

// GET /api/auth/me
router.get('/me', verifyToken, (req, res) => {
    const user = db.prepare('SELECT id, email, fullName, staffId, department, role, isActive, profileImage, bio, phone, certificates, loginAttempts, handoverCode, createdAt FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
        return res.status(404).json({ ok: false, message: 'User not found' });
    }
    try {
        user.certificates = typeof user.certificates === 'string' ? JSON.parse(user.certificates) : (user.certificates || []);
    } catch (e) {
        user.certificates = [];
    }
    res.json({ ok: true, user });
});

module.exports = router;
