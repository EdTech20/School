const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

// GET /api/sessions
router.get('/', (req, res) => {
    const sessions = db.prepare('SELECT * FROM sessions ORDER BY createdAt DESC').all();
    res.json({ ok: true, sessions });
});

// GET /api/sessions/active
router.get('/active', (req, res) => {
    const active = db.prepare("SELECT * FROM sessions WHERE status = 'Open' AND isActive = 1 ORDER BY createdAt DESC LIMIT 1").get();
    res.json({ ok: true, session: active || null });
});

// POST /api/sessions (HOD / VC)
router.post('/', verifyToken, requireRole('HOD', 'VC'), (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ ok: false, message: 'Session name is required (e.g. 2026/2027)' });
    }

    const sessionName = name.trim();

    // Close all current open sessions
    db.prepare("UPDATE sessions SET status = 'Closed', isActive = 0 WHERE status = 'Open'").run();

    const id = 'SESS-' + Date.now();
    const createdAt = new Date().toISOString();

    db.prepare(`
        INSERT INTO sessions (id, name, academicYear, semester, status, isActive, createdAt)
        VALUES (?, ?, ?, 'First Semester', 'Open', 1, ?)
    `).run(id, sessionName, sessionName, createdAt);

    const newSession = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);

    res.status(201).json({
        ok: true,
        message: `Appraisal session "${sessionName}" created and opened.`,
        session: newSession
    });
});

// POST /api/sessions/close (HOD / VC)
router.post('/close', verifyToken, requireRole('HOD', 'VC'), (req, res) => {
    db.prepare("UPDATE sessions SET status = 'Closed', isActive = 0 WHERE status = 'Open'").run();
    res.json({ ok: true, message: 'Current appraisal session closed.' });
});

module.exports = router;
