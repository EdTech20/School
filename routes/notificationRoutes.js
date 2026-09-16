const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');

function getDb() { return global._db; }

// GET /api/notifications
router.get('/', verifyToken, async (req, res) => {
    try {
        const notifications = await getDb().queryAll(
            'SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC',
            [req.user.id]
        );
        res.json({ ok: true, notifications });
    } catch (err) {
        console.error('Get notifications error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', verifyToken, async (req, res) => {
    try {
        await getDb().run('UPDATE notifications SET isRead = 1 WHERE id = ? AND userId = ?', [req.params.id, req.user.id]);
        res.json({ ok: true, message: 'Notification marked as read' });
    } catch (err) {
        console.error('Mark notification read error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

module.exports = router;
