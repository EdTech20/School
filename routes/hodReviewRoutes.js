const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

// POST /api/hod-reviews
router.post('/', verifyToken, requireRole('HOD', 'VC'), (req, res) => {
    const { applicationId, staffId, reviewComments, recommendation, score, status } = req.body;
    const hodId = req.user.id;

    if (!applicationId || !staffId || !reviewComments || score === undefined) {
        return res.status(400).json({ ok: false, message: 'All review fields are required' });
    }

    const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId);
    if (!app) {
        return res.status(404).json({ ok: false, message: 'Application not found' });
    }

    const id = 'HODREV-' + Date.now();
    const createdAt = new Date().toISOString();
    const reviewStatus = status || 'Approved';

    // Insert or replace HOD review
    db.prepare(`
        INSERT INTO hodReviews (id, applicationId, staffId, hodId, sessionId, reviewComments, recommendation, score, status, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, applicationId, staffId, hodId, app.sessionId, reviewComments, recommendation || 'Recommended', parseFloat(score), reviewStatus, createdAt);

    // Update application score and status
    db.prepare(`
        UPDATE applications
        SET status = ?, score = ?, updatedAt = ?
        WHERE id = ?
    `).run(reviewStatus, parseFloat(score), createdAt, applicationId);

    // Notify Lecturer
    const notifId = 'NOTIF-' + Date.now();
    db.prepare(`
        INSERT INTO notifications (id, userId, title, message, isRead, type, createdAt)
        VALUES (?, ?, 'HOD Review Submitted', ?, 0, 'success', ?)
    `).run(notifId, staffId, `Your application for ${app.sessionName} has been reviewed by HOD with status ${reviewStatus}.`, createdAt);

    res.status(201).json({
        ok: true,
        message: 'HOD review and score submitted successfully'
    });
});

// GET /api/hod-reviews
router.get('/', verifyToken, (req, res) => {
    const { staffId, applicationId, sessionId } = req.query;
    let query = 'SELECT * FROM hodReviews WHERE 1=1';
    const params = [];

    if (staffId) {
        query += ' AND staffId = ?';
        params.push(staffId);
    }
    if (applicationId) {
        query += ' AND applicationId = ?';
        params.push(applicationId);
    }
    if (sessionId) {
        query += ' AND sessionId = ?';
        params.push(sessionId);
    }

    query += ' ORDER BY createdAt DESC';

    const reviews = db.prepare(query).all(...params);
    res.json({ ok: true, hodReviews: reviews });
});

module.exports = router;
