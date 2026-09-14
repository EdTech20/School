const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { verifyToken } = require('../middleware/authMiddleware');

// POST /api/evaluations
router.post('/', verifyToken, (req, res) => {
    const { staffId, applicationId, scores, comments } = req.body;
    const evaluatorId = req.user.id;
    const evaluatorRole = req.user.role;

    if (!staffId || !scores) {
        return res.status(400).json({ ok: false, message: 'Lecturer ID and scores are required' });
    }

    const lecturer = db.prepare('SELECT * FROM users WHERE id = ?').get(staffId);
    if (!lecturer) {
        return res.status(404).json({ ok: false, message: 'Target lecturer not found' });
    }

    const activeSession = db.prepare("SELECT * FROM sessions WHERE status = 'Open' AND isActive = 1 LIMIT 1").get();
    if (!activeSession) {
        return res.status(400).json({ ok: false, message: 'No active appraisal session for evaluations' });
    }

    // Check if evaluator already evaluated this lecturer in this session
    const existing = db.prepare('SELECT id FROM evaluations WHERE staffId = ? AND evaluatorId = ? AND sessionId = ?').get(staffId, evaluatorId, activeSession.id);
    if (existing) {
        return res.status(400).json({ ok: false, message: 'You have already evaluated this lecturer for the current active session.' });
    }

    // Compute total score
    let totalScore = 0;
    const scoresObj = typeof scores === 'string' ? JSON.parse(scores) : scores;
    if (typeof scoresObj === 'object' && scoresObj !== null) {
        const values = Object.values(scoresObj).map(v => Number(v) || 0);
        if (values.length > 0) {
            totalScore = values.reduce((a, b) => a + b, 0) / values.length;
        }
    }

    const id = 'EVAL-' + Date.now();
    const submittedAt = new Date().toISOString();
    const scoresJson = JSON.stringify(scoresObj);

    db.prepare(`
        INSERT INTO evaluations (id, applicationId, staffId, evaluatorId, evaluatorRole, sessionId, department, scores, totalScore, comments, submittedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, applicationId || null, staffId, evaluatorId, evaluatorRole, activeSession.id, lecturer.department, scoresJson, totalScore, comments || '', submittedAt);

    const newEval = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(id);

    res.status(201).json({
        ok: true,
        message: 'Evaluation submitted successfully',
        evaluation: newEval
    });
});

// GET /api/evaluations
router.get('/', verifyToken, (req, res) => {
    const { department, staffId, evaluatorId, sessionId } = req.query;
    let query = `
        SELECT e.*, 
               l.fullName as staffName, l.staffId as staffCode,
               ev.fullName as evaluatorName
        FROM evaluations e
        LEFT JOIN users l ON e.staffId = l.id
        LEFT JOIN users ev ON e.evaluatorId = ev.id
        WHERE 1=1
    `;
    const params = [];

    if (req.user.role === 'HOD') {
        query += ' AND e.department = ?';
        params.push(req.user.department);
    } else if (department) {
        query += ' AND e.department = ?';
        params.push(department);
    }

    if (staffId) {
        query += ' AND e.staffId = ?';
        params.push(staffId);
    }

    if (evaluatorId) {
        query += ' AND e.evaluatorId = ?';
        params.push(evaluatorId);
    }

    if (sessionId) {
        query += ' AND e.sessionId = ?';
        params.push(sessionId);
    }

    query += ' ORDER BY e.submittedAt DESC';

    const evals = db.prepare(query).all(...params);
    evals.forEach(e => {
        try {
            e.scores = JSON.parse(e.scores);
        } catch (err) {
            e.scores = {};
        }
    });

    res.json({ ok: true, evaluations: evals });
});

// GET /api/evaluations/lecturer/:id
router.get('/lecturer/:id', verifyToken, (req, res) => {
    const staffId = req.params.id;
    const evals = db.prepare(`
        SELECT e.*, ev.fullName as evaluatorName
        FROM evaluations e
        LEFT JOIN users ev ON e.evaluatorId = ev.id
        WHERE e.staffId = ?
        ORDER BY e.submittedAt DESC
    `).all(staffId);

    evals.forEach(e => {
        try {
            e.scores = JSON.parse(e.scores);
        } catch (err) {
            e.scores = {};
        }
    });

    res.json({ ok: true, evaluations: evals });
});

module.exports = router;
