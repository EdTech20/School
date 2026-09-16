const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');

function getDb() { return global._db; }

// POST /api/evaluations
router.post('/', verifyToken, async (req, res) => {
    try {
        const db = getDb();
        const { staffId, applicationId, scores, comments } = req.body;
        const evaluatorId = req.user.id;
        const evaluatorRole = req.user.role;

        if (!staffId || !scores) return res.status(400).json({ ok: false, message: 'Lecturer ID and scores are required' });

        const lecturer = await db.queryOne('SELECT * FROM users WHERE id = ?', [staffId]);
        if (!lecturer) return res.status(404).json({ ok: false, message: 'Target lecturer not found' });

        const activeSession = await db.queryOne("SELECT * FROM sessions WHERE status = 'Open' AND isActive = 1 LIMIT 1");
        if (!activeSession) return res.status(400).json({ ok: false, message: 'No active appraisal session for evaluations' });

        const existing = await db.queryOne('SELECT id FROM evaluations WHERE staffId = ? AND evaluatorId = ? AND sessionId = ?', [staffId, evaluatorId, activeSession.id]);
        if (existing) return res.status(400).json({ ok: false, message: 'You have already evaluated this lecturer for the current session.' });

        const scoresObj = typeof scores === 'string' ? JSON.parse(scores) : scores;
        const values = Object.values(scoresObj).map(v => Number(v) || 0);
        const totalScore = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

        const id = 'EVAL-' + Date.now();
        const submittedAt = new Date().toISOString();
        await db.run(
            `INSERT INTO evaluations (id, applicationId, staffId, evaluatorId, evaluatorRole, sessionId, department, scores, totalScore, comments, submittedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, applicationId || null, staffId, evaluatorId, evaluatorRole, activeSession.id, lecturer.department, JSON.stringify(scoresObj), totalScore, comments || '', submittedAt]
        );

        const newEval = await db.queryOne('SELECT * FROM evaluations WHERE id = ?', [id]);
        res.status(201).json({ ok: true, message: 'Evaluation submitted successfully', evaluation: newEval });
    } catch (err) {
        console.error('Submit evaluation error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

// GET /api/evaluations
router.get('/', verifyToken, async (req, res) => {
    try {
        const db = getDb();
        const { department, staffId, evaluatorId, sessionId } = req.query;
        let sql = `
            SELECT e.*, l.fullName as staffName, l.staffId as staffCode, ev.fullName as evaluatorName
            FROM evaluations e
            LEFT JOIN users l ON e.staffId = l.id
            LEFT JOIN users ev ON e.evaluatorId = ev.id
            WHERE 1=1
        `;
        const args = [];
        if (req.user.role === 'HOD') { sql += ' AND e.department = ?'; args.push(req.user.department); }
        else if (department) { sql += ' AND e.department = ?'; args.push(department); }
        if (staffId) { sql += ' AND e.staffId = ?'; args.push(staffId); }
        if (evaluatorId) { sql += ' AND e.evaluatorId = ?'; args.push(evaluatorId); }
        if (sessionId) { sql += ' AND e.sessionId = ?'; args.push(sessionId); }
        sql += ' ORDER BY e.submittedAt DESC';
        const evals = await db.queryAll(sql, args);
        evals.forEach(e => { try { e.scores = JSON.parse(e.scores); } catch { e.scores = {}; } });
        res.json({ ok: true, evaluations: evals });
    } catch (err) {
        console.error('Get evaluations error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

// GET /api/evaluations/lecturer/:id
router.get('/lecturer/:id', verifyToken, async (req, res) => {
    try {
        const evals = await getDb().queryAll(
            `SELECT e.*, ev.fullName as evaluatorName FROM evaluations e LEFT JOIN users ev ON e.evaluatorId = ev.id WHERE e.staffId = ? ORDER BY e.submittedAt DESC`,
            [req.params.id]
        );
        evals.forEach(e => { try { e.scores = JSON.parse(e.scores); } catch { e.scores = {}; } });
        res.json({ ok: true, evaluations: evals });
    } catch (err) {
        console.error('Get lecturer evals error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

module.exports = router;
