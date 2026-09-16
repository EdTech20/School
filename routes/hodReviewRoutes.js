const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

function getDb() { return global._db; }

// POST /api/hod-reviews
router.post('/', verifyToken, requireRole('HOD', 'VC'), async (req, res) => {
    try {
        const db = getDb();
        const { applicationId, staffId, reviewComments, recommendation, score, status } = req.body;
        const hodId = req.user.id;

        if (!applicationId || !staffId || !reviewComments || score === undefined) {
            return res.status(400).json({ ok: false, message: 'All review fields are required' });
        }

        const app = await db.queryOne('SELECT * FROM applications WHERE id = ?', [applicationId]);
        if (!app) return res.status(404).json({ ok: false, message: 'Application not found' });

        const id = 'HODREV-' + Date.now();
        const createdAt = new Date().toISOString();
        const reviewStatus = status || 'Approved';

        await db.run(
            `INSERT INTO hodReviews (id, applicationId, staffId, hodId, sessionId, reviewComments, recommendation, score, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, applicationId, staffId, hodId, app.sessionId, reviewComments, recommendation || 'Recommended', parseFloat(score), reviewStatus, createdAt]
        );

        await db.run(
            'UPDATE applications SET status = ?, score = ?, updatedAt = ? WHERE id = ?',
            [reviewStatus, parseFloat(score), createdAt, applicationId]
        );

        await db.run(
            `INSERT INTO notifications (id, userId, title, message, isRead, type, createdAt) VALUES (?, ?, 'HOD Review Submitted', ?, 0, 'success', ?)`,
            ['NOTIF-' + Date.now(), staffId, `Your application for ${app.sessionName} has been reviewed with status ${reviewStatus}.`, createdAt]
        );

        res.status(201).json({ ok: true, message: 'HOD review and score submitted successfully' });
    } catch (err) {
        console.error('Submit HOD review error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

// GET /api/hod-reviews
router.get('/', verifyToken, async (req, res) => {
    try {
        const db = getDb();
        const { staffId, applicationId, sessionId } = req.query;
        let sql = 'SELECT * FROM hodReviews WHERE 1=1';
        const args = [];
        if (staffId) { sql += ' AND staffId = ?'; args.push(staffId); }
        if (applicationId) { sql += ' AND applicationId = ?'; args.push(applicationId); }
        if (sessionId) { sql += ' AND sessionId = ?'; args.push(sessionId); }
        sql += ' ORDER BY createdAt DESC';
        const reviews = await db.queryAll(sql, args);
        res.json({ ok: true, hodReviews: reviews });
    } catch (err) {
        console.error('Get HOD reviews error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

module.exports = router;
