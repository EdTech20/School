const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

// GET /api/applications
router.get('/', verifyToken, (req, res) => {
    const { department, status, sessionId } = req.query;
    let query = `
        SELECT a.*, u.fullName as applicantName, u.email as applicantEmail, u.staffId as staffCode
        FROM applications a
        JOIN users u ON a.staffId = u.id
        WHERE 1=1
    `;
    const params = [];

    // HOD gets applications for their department
    if (req.user.role === 'HOD') {
        query += ' AND a.department = ?';
        params.push(req.user.department);
    } else if (department) {
        query += ' AND a.department = ?';
        params.push(department);
    }

    if (status) {
        query += ' AND a.status = ?';
        params.push(status);
    }

    if (sessionId) {
        query += ' AND a.sessionId = ?';
        params.push(sessionId);
    }

    query += ' ORDER BY a.submittedAt DESC';

    const applications = db.prepare(query).all(...params);
    applications.forEach(app => {
        try {
            app.certificates = typeof app.certificates === 'string' ? JSON.parse(app.certificates) : (app.certificates || []);
        } catch (e) {
            app.certificates = [];
        }
    });

    res.json({ ok: true, applications });
});

// GET /api/applications/my
router.get('/my', verifyToken, requireRole('Lecturer'), (req, res) => {
    const apps = db.prepare(`
        SELECT * FROM applications
        WHERE staffId = ?
        ORDER BY submittedAt DESC
    `).all(req.user.id);

    apps.forEach(app => {
        try {
            app.certificates = typeof app.certificates === 'string' ? JSON.parse(app.certificates) : (app.certificates || []);
        } catch (e) {
            app.certificates = [];
        }
    });

    res.json({ ok: true, applications: apps });
});

// POST /api/applications (Lecturer)
router.post('/', verifyToken, requireRole('Lecturer'), (req, res) => {
    const { type, details, certificates } = req.body;
    const userId = req.user.id;

    if (!type || !details) {
        return res.status(400).json({ ok: false, message: 'Please fill in all application fields' });
    }

    // Get current active session
    const activeSession = db.prepare("SELECT * FROM sessions WHERE status = 'Open' AND isActive = 1 LIMIT 1").get();
    if (!activeSession) {
        return res.status(400).json({ ok: false, message: 'No active appraisal session is currently open' });
    }

    // Check if user already applied for this session
    const existing = db.prepare('SELECT id FROM applications WHERE staffId = ? AND sessionId = ?').get(userId, activeSession.id);
    if (existing) {
        return res.status(400).json({ ok: false, message: 'You have already submitted an application for this active session' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    const id = 'APP-' + Date.now();
    const certsJson = certificates ? (typeof certificates === 'string' ? certificates : JSON.stringify(certificates)) : '[]';
    const submittedAt = new Date().toISOString();

    db.prepare(`
        INSERT INTO applications (id, staffId, department, type, details, certificates, sessionId, sessionName, status, score, submittedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 0, ?)
    `).run(id, userId, user.department, type, details, certsJson, activeSession.id, activeSession.name, submittedAt);

    const newApp = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
    try {
        newApp.certificates = JSON.parse(newApp.certificates);
    } catch (e) {
        newApp.certificates = [];
    }

    // Create notification for HOD
    const hod = db.prepare("SELECT id FROM users WHERE department = ? AND role = 'HOD' LIMIT 1").get(user.department);
    if (hod) {
        const notifId = 'NOTIF-' + Date.now();
        db.prepare(`
            INSERT INTO notifications (id, userId, title, message, isRead, type, createdAt)
            VALUES (?, ?, 'New Application', ?, 0, 'info', ?)
        `).run(notifId, hod.id, `${user.fullName} submitted an appraisal application for ${activeSession.name}`, submittedAt);
    }

    res.status(201).json({
        ok: true,
        message: `Application submitted successfully for ${activeSession.name}`,
        application: newApp
    });
});

// PUT /api/applications/:id/status (HOD / VC)
router.put('/:id/status', verifyToken, requireRole('HOD', 'VC'), (req, res) => {
    const { status, score } = req.body;
    const appId = req.params.id;

    if (!['Approved', 'Rejected', 'Pending'].includes(status)) {
        return res.status(400).json({ ok: false, message: 'Invalid status' });
    }

    const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(appId);
    if (!app) {
        return res.status(404).json({ ok: false, message: 'Application not found' });
    }

    const updatedAt = new Date().toISOString();
    const newScore = score !== undefined ? parseFloat(score) : app.score;

    db.prepare(`
        UPDATE applications
        SET status = ?, score = ?, updatedAt = ?
        WHERE id = ?
    `).run(status, newScore, updatedAt, appId);

    // Notify Lecturer
    const notifId = 'NOTIF-' + Date.now();
    db.prepare(`
        INSERT INTO notifications (id, userId, title, message, isRead, type, createdAt)
        VALUES (?, ?, 'Application Updated', ?, 0, ?, ?)
    `).run(notifId, app.staffId, `Your appraisal application for ${app.sessionName} status is now ${status}`, status === 'Approved' ? 'success' : 'warning', updatedAt);

    res.json({ ok: true, message: `Application status updated to ${status}` });
});

module.exports = router;
