const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

function getDb() { return global._db; }

// GET /api/departments
router.get('/', async (req, res) => {
    try {
        const db = getDb();
        const depts = await db.queryAll(`
            SELECT d.id, d.name, d.code, d.hodId, d.createdAt, u.fullName as hodName
            FROM departments d
            LEFT JOIN users u ON d.hodId = u.id
            ORDER BY d.name ASC
        `);
        res.json({ ok: true, departments: depts });
    } catch (err) {
        console.error('Get departments error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

// POST /api/departments (VC only)
router.post('/', verifyToken, requireRole('VC'), async (req, res) => {
    try {
        const db = getDb();
        const { name } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ ok: false, message: 'Department name is required' });
        const trimmed = name.trim();
        const existing = await db.queryOne('SELECT id FROM departments WHERE name = ?', [trimmed]);
        if (existing) return res.status(400).json({ ok: false, message: 'Department already exists' });
        const id = 'DEPT-' + Date.now().toString().slice(-6);
        const code = trimmed.split(' ').map(w => w[0]).join('').toUpperCase();
        await db.run('INSERT INTO departments (id, name, code, createdAt) VALUES (?, ?, ?, ?)', [id, trimmed, code, new Date().toISOString()]);
        const newDept = await db.queryOne('SELECT * FROM departments WHERE id = ?', [id]);
        res.status(201).json({ ok: true, message: 'Department created successfully', department: newDept });
    } catch (err) {
        console.error('Create department error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

// DELETE /api/departments/:id (VC only)
router.delete('/:id', verifyToken, requireRole('VC'), async (req, res) => {
    try {
        const db = getDb();
        const dept = await db.queryOne('SELECT id FROM departments WHERE id = ?', [req.params.id]);
        if (!dept) return res.status(404).json({ ok: false, message: 'Department not found' });
        await db.run('DELETE FROM departments WHERE id = ?', [req.params.id]);
        res.json({ ok: true, message: 'Department deleted successfully' });
    } catch (err) {
        console.error('Delete department error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

module.exports = router;
