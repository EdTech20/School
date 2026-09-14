const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

// GET /api/departments
router.get('/', (req, res) => {
    const depts = db.prepare(`
        SELECT d.id, d.name, d.code, d.hodId, d.createdAt, u.fullName as hodName
        FROM departments d
        LEFT JOIN users u ON d.hodId = u.id
        ORDER BY d.name ASC
    `).all();

    res.json({ ok: true, departments: depts });
});

// POST /api/departments (VC only)
router.post('/', verifyToken, requireRole('VC'), (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ ok: false, message: 'Department name is required' });
    }

    const trimmed = name.trim();
    const existing = db.prepare('SELECT id FROM departments WHERE name = ?').get(trimmed);
    if (existing) {
        return res.status(400).json({ ok: false, message: 'Department already exists' });
    }

    const id = 'DEPT-' + Date.now().toString().slice(-6);
    const code = trimmed.split(' ').map(w => w[0]).join('').toUpperCase();
    const createdAt = new Date().toISOString();

    db.prepare('INSERT INTO departments (id, name, code, createdAt) VALUES (?, ?, ?, ?)').run(id, trimmed, code, createdAt);

    const newDept = db.prepare('SELECT * FROM departments WHERE id = ?').get(id);
    res.status(201).json({ ok: true, message: 'Department created successfully', department: newDept });
});

// DELETE /api/departments/:id (VC only)
router.delete('/:id', verifyToken, requireRole('VC'), (req, res) => {
    const dept = db.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id);
    if (!dept) {
        return res.status(404).json({ ok: false, message: 'Department not found' });
    }

    db.prepare('DELETE FROM departments WHERE id = ?').run(req.params.id);
    res.json({ ok: true, message: 'Department deleted successfully' });
});

module.exports = router;
