const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

function getDb() { return global._db; }

// GET /api/sessions
router.get('/', async (req, res) => {
    try {
        const sessions = await getDb().queryAll('SELECT * FROM sessions ORDER BY createdAt DESC');
        res.json({ ok: true, sessions });
    } catch (err) {
        console.error('Get sessions error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

// GET /api/sessions/active
router.get('/active', async (req, res) => {
    try {
        const active = await getDb().queryOne("SELECT * FROM sessions WHERE status = 'Open' AND isActive = 1 ORDER BY createdAt DESC LIMIT 1");
        res.json({ ok: true, session: active || null });
    } catch (err) {
        console.error('Get active session error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

// POST /api/sessions (HOD / VC)
router.post('/', verifyToken, requireRole('HOD', 'VC'), async (req, res) => {
    try {
        const db = getDb();
        const { name } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ ok: false, message: 'Session name is required (e.g. 2026/2027)' });
        const sessionName = name.trim();
        await db.run("UPDATE sessions SET status = 'Closed', isActive = 0 WHERE status = 'Open'");
        const id = 'SESS-' + Date.now();
        const createdAt = new Date().toISOString();
        await db.run(
            `INSERT INTO sessions (id, name, academicYear, semester, status, isActive, createdAt) VALUES (?, ?, ?, 'First Semester', 'Open', 1, ?)`,
            [id, sessionName, sessionName, createdAt]
        );
        const newSession = await db.queryOne('SELECT * FROM sessions WHERE id = ?', [id]);
        res.status(201).json({ ok: true, message: `Appraisal session "${sessionName}" created and opened.`, session: newSession });
    } catch (err) {
        console.error('Create session error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

// POST /api/sessions/close (HOD / VC)
router.post('/close', verifyToken, requireRole('HOD', 'VC'), async (req, res) => {
    try {
        await getDb().run("UPDATE sessions SET status = 'Closed', isActive = 0 WHERE status = 'Open'");
        res.json({ ok: true, message: 'Current appraisal session closed.' });
    } catch (err) {
        console.error('Close session error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

module.exports = router;
