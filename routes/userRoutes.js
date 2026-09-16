const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

function getDb() { return global._db; }
function parseCerts(v) { try { return typeof v === 'string' ? JSON.parse(v) : (v || []); } catch { return []; } }

// GET /api/users
router.get('/', verifyToken, async (req, res) => {
    try {
        const db = getDb();
        const { role, department } = req.query;
        let sql = 'SELECT id, email, fullName, staffId, department, role, isActive, profileImage, bio, phone, certificates, createdAt FROM users WHERE 1=1';
        const args = [];
        if (role) { sql += ' AND role = ?'; args.push(role); }
        if (department) { sql += ' AND department = ?'; args.push(department); }
        sql += ' ORDER BY fullName ASC';
        const users = await db.queryAll(sql, args);
        users.forEach(u => { u.certificates = parseCerts(u.certificates); });
        res.json({ ok: true, users });
    } catch (err) {
        console.error('Get users error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

// GET /api/users/:id
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const db = getDb();
        const user = await db.queryOne(
            'SELECT id, email, fullName, staffId, department, role, isActive, profileImage, bio, phone, certificates, createdAt FROM users WHERE id = ?',
            [req.params.id]
        );
        if (!user) return res.status(404).json({ ok: false, message: 'User not found' });
        user.certificates = parseCerts(user.certificates);
        res.json({ ok: true, user });
    } catch (err) {
        console.error('Get user error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

// PUT /api/users/profile
router.put('/profile', verifyToken, async (req, res) => {
    try {
        const db = getDb();
        const { fullName, phone, bio, certificates, profileImage } = req.body;
        const userId = req.user.id;
        const current = await db.queryOne('SELECT * FROM users WHERE id = ?', [userId]);
        if (!current) return res.status(404).json({ ok: false, message: 'User not found' });

        const newFullName = fullName !== undefined ? fullName.trim() : current.fullName;
        const newPhone = phone !== undefined ? phone : current.phone;
        const newBio = bio !== undefined ? bio : current.bio;
        const newProfileImage = profileImage !== undefined ? profileImage : current.profileImage;
        const newCerts = certificates !== undefined ? (typeof certificates === 'string' ? certificates : JSON.stringify(certificates)) : current.certificates;

        await db.run(
            'UPDATE users SET fullName = ?, phone = ?, bio = ?, profileImage = ?, certificates = ? WHERE id = ?',
            [newFullName, newPhone, newBio, newProfileImage, newCerts, userId]
        );
        const updatedUser = await db.queryOne(
            'SELECT id, email, fullName, staffId, department, role, isActive, profileImage, bio, phone, certificates, createdAt FROM users WHERE id = ?',
            [userId]
        );
        updatedUser.certificates = parseCerts(updatedUser.certificates);
        res.json({ ok: true, message: 'Profile updated successfully', user: updatedUser });
    } catch (err) {
        console.error('Update profile error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

// PUT /api/users/change-password
router.put('/change-password', verifyToken, async (req, res) => {
    try {
        const db = getDb();
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ ok: false, message: 'Both current and new password are required' });
        }
        const user = await db.queryOne('SELECT password FROM users WHERE id = ?', [req.user.id]);
        if (!user || !bcrypt.compareSync(currentPassword, user.password)) {
            return res.status(400).json({ ok: false, message: 'Current password is incorrect' });
        }
        await db.run('UPDATE users SET password = ? WHERE id = ?', [bcrypt.hashSync(newPassword, 10), req.user.id]);
        res.json({ ok: true, message: 'Password changed successfully' });
    } catch (err) {
        console.error('Change password error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

// PUT /api/users/:id/status (VC only)
router.put('/:id/status', verifyToken, requireRole('VC'), async (req, res) => {
    try {
        const db = getDb();
        const user = await db.queryOne('SELECT id FROM users WHERE id = ?', [req.params.id]);
        if (!user) return res.status(404).json({ ok: false, message: 'User not found' });
        await db.run('UPDATE users SET isActive = ? WHERE id = ?', [req.body.isActive ? 1 : 0, req.params.id]);
        res.json({ ok: true, message: `User status updated` });
    } catch (err) {
        console.error('Toggle status error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

// POST /api/users/appoint-hod (VC only)
router.post('/appoint-hod', verifyToken, requireRole('VC'), async (req, res) => {
    try {
        const db = getDb();
        const { userId, department } = req.body;
        if (!userId || !department) return res.status(400).json({ ok: false, message: 'User ID and department are required' });
        const user = await db.queryOne('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user) return res.status(404).json({ ok: false, message: 'User not found' });
        await db.run("UPDATE users SET role = 'Lecturer' WHERE department = ? AND role = 'HOD'", [department]);
        await db.run("UPDATE users SET role = 'HOD', department = ? WHERE id = ?", [department, userId]);
        await db.run('UPDATE departments SET hodId = ? WHERE name = ?', [userId, department]);
        res.json({ ok: true, message: `${user.fullName} has been appointed as HOD of ${department}` });
    } catch (err) {
        console.error('Appoint HOD error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

// POST /api/users/hod-handover
router.post('/hod-handover', verifyToken, requireRole('HOD', 'VC'), async (req, res) => {
    try {
        const db = getDb();
        const { successorEmail } = req.body;
        if (!successorEmail) return res.status(400).json({ ok: false, message: 'Successor email is required' });
        const successor = await db.queryOne('SELECT * FROM users WHERE email = ?', [successorEmail.trim()]);
        if (!successor) return res.status(404).json({ ok: false, message: 'Successor user not found' });
        const handoverCode = 'HO-' + Math.floor(100000 + Math.random() * 900000);
        await db.run("UPDATE users SET handoverCode = ?, loginAttempts = 0 WHERE id = ?", [handoverCode, successor.id]);
        res.json({ ok: true, message: 'Handover code generated successfully', handoverCode, successor: successor.fullName });
    } catch (err) {
        console.error('HOD handover error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

module.exports = router;
