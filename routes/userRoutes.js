const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

// GET /api/users
router.get('/', verifyToken, (req, res) => {
    const { role, department } = req.query;
    let query = 'SELECT id, email, fullName, staffId, department, role, isActive, profileImage, bio, phone, certificates, createdAt FROM users WHERE 1=1';
    const params = [];

    if (role) {
        query += ' AND role = ?';
        params.push(role);
    }
    if (department) {
        query += ' AND department = ?';
        params.push(department);
    }

    query += ' ORDER BY fullName ASC';

    const users = db.prepare(query).all(...params);
    users.forEach(u => {
        try {
            u.certificates = typeof u.certificates === 'string' ? JSON.parse(u.certificates) : (u.certificates || []);
        } catch (e) {
            u.certificates = [];
        }
    });

    res.json({ ok: true, users });
});

// GET /api/users/:id
router.get('/:id', verifyToken, (req, res) => {
    const user = db.prepare('SELECT id, email, fullName, staffId, department, role, isActive, profileImage, bio, phone, certificates, createdAt FROM users WHERE id = ?').get(req.params.id);
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

// PUT /api/users/profile
router.put('/profile', verifyToken, (req, res) => {
    const { fullName, phone, bio, certificates, profileImage } = req.body;
    const userId = req.user.id;

    const current = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!current) {
        return res.status(404).json({ ok: false, message: 'User not found' });
    }

    const newFullName = fullName !== undefined ? fullName.trim() : current.fullName;
    const newPhone = phone !== undefined ? phone : current.phone;
    const newBio = bio !== undefined ? bio : current.bio;
    const newProfileImage = profileImage !== undefined ? profileImage : current.profileImage;
    const newCertificates = certificates !== undefined ? (typeof certificates === 'string' ? certificates : JSON.stringify(certificates)) : current.certificates;

    db.prepare(`
        UPDATE users
        SET fullName = ?, phone = ?, bio = ?, profileImage = ?, certificates = ?
        WHERE id = ?
    `).run(newFullName, newPhone, newBio, newProfileImage, newCertificates, userId);

    const updatedUser = db.prepare('SELECT id, email, fullName, staffId, department, role, isActive, profileImage, bio, phone, certificates, createdAt FROM users WHERE id = ?').get(userId);
    try {
        updatedUser.certificates = JSON.parse(updatedUser.certificates);
    } catch (e) {
        updatedUser.certificates = [];
    }

    res.json({ ok: true, message: 'Profile updated successfully', user: updatedUser });
});

// PUT /api/users/change-password
router.put('/change-password', verifyToken, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ ok: false, message: 'Both current and new password are required' });
    }

    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(userId);
    if (!user || !bcrypt.compareSync(currentPassword, user.password)) {
        return res.status(400).json({ ok: false, message: 'Current password is incorrect' });
    }

    const hashed = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, userId);

    res.json({ ok: true, message: 'Password changed successfully' });
});

// PUT /api/users/:id/status (VC only)
router.put('/:id/status', verifyToken, requireRole('VC'), (req, res) => {
    const { isActive } = req.body;
    const targetUserId = req.params.id;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(targetUserId);
    if (!user) {
        return res.status(404).json({ ok: false, message: 'User not found' });
    }

    const newStatus = isActive ? 1 : 0;
    db.prepare('UPDATE users SET isActive = ? WHERE id = ?').run(newStatus, targetUserId);

    res.json({ ok: true, message: `User status updated to ${newStatus ? 'active' : 'inactive'}` });
});

// POST /api/users/appoint-hod (VC only)
router.post('/appoint-hod', verifyToken, requireRole('VC'), (req, res) => {
    const { userId, department } = req.body;

    if (!userId || !department) {
        return res.status(400).json({ ok: false, message: 'User ID and department are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
        return res.status(404).json({ ok: false, message: 'User not found' });
    }

    // Demote existing HOD for this department to Lecturer
    db.prepare("UPDATE users SET role = 'Lecturer' WHERE department = ? AND role = 'HOD'").run(department);

    // Promote new user to HOD
    db.prepare("UPDATE users SET role = 'HOD', department = ? WHERE id = ?").run(department, userId);

    // Update department record hodId
    db.prepare('UPDATE departments SET hodId = ? WHERE name = ?').run(userId, department);

    res.json({ ok: true, message: `${user.fullName} has been appointed as HOD of ${department}` });
});

// POST /api/users/hod-handover
router.post('/hod-handover', verifyToken, requireRole('HOD', 'VC'), (req, res) => {
    const { successorEmail } = req.body;
    if (!successorEmail) {
        return res.status(400).json({ ok: false, message: 'Successor email is required' });
    }

    const successor = db.prepare('SELECT * FROM users WHERE email = ?').get(successorEmail.trim());
    if (!successor) {
        return res.status(404).json({ ok: false, message: 'Successor user not found' });
    }

    const handoverCode = 'HO-' + Math.floor(100000 + Math.random() * 900000);
    db.prepare("UPDATE users SET handoverCode = ?, loginAttempts = 0 WHERE id = ?").run(handoverCode, successor.id);

    res.json({ ok: true, message: 'Handover code generated successfully', handoverCode, successor: successor.fullName });
});

module.exports = router;
