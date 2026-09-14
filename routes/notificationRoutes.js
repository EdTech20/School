const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { verifyToken } = require('../middleware/authMiddleware');

// GET /api/notifications
router.get('/', verifyToken, (req, res) => {
    const notifications = db.prepare('SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC').all(req.user.id);
    res.json({ ok: true, notifications });
});

// PUT /api/notifications/:id/read
router.put('/:id/read', verifyToken, (req, res) => {
    db.prepare('UPDATE notifications SET isRead = 1 WHERE id = ? AND userId = ?').run(req.params.id, req.user.id);
    res.json({ ok: true, message: 'Notification marked as read' });
});

module.exports = router;
