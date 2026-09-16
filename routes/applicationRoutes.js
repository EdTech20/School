const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

function getDb() { return global._db; }
function parseCerts(v) { try { return typeof v === 'string' ? JSON.parse(v) : (v || []); } catch { return []; } }

// GET /api/applications
router.get('/', verifyToken, async (req, res) => {
    try {
        const db = getDb();
        const { department, status, sessionId } = req.query;
        let sql = `
            SELECT a.*, u.fullName as applicantName, u.email as applicantEmail, u.staffId as staffCode
            FROM applications a
            JOIN users u ON a.staffId = u.id
            WHERE 1=1
        `;
        const args = [];
        if (req.user.role === 'HOD') { sql += ' AND a.department = ?'; args.push(req.user.department); }
        else if (department) { sql += ' AND a.department = ?'; args.push(department); }
        if (status) { sql += ' AND a.status = ?'; args.push(status); }
        if (sessionId) { sql += ' AND a.sessionId = ?'; args.push(sessionId); }
        sql += ' ORDER BY a.submittedAt DESC';
        const applications = await db.queryAll(sql, args);
        applications.forEach(app => { app.certificates = parseCerts(app.certificates); });
        res.json({ ok: true, applications });
    } catch (err) {
        console.error('Get applications error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

// GET /api/applications/my
router.get('/my', verifyToken, requireRole('Lecturer'), async (req, res) => {
    try {
        const apps = await getDb().queryAll('SELECT * FROM applications WHERE staffId = ? ORDER BY submittedAt DESC', [req.user.id]);
        apps.forEach(app => { app.certificates = parseCerts(app.certificates); });
        res.json({ ok: true, applications: apps });
    } catch (err) {
        console.error('Get my applications error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

// POST /api/applications (Lecturer)
router.post('/', verifyToken, requireRole('Lecturer'), async (req, res) => {
    try {
        const db = getDb();
        const { type, details, certificates } = req.body;
        const userId = req.user.id;
        if (!type || !details) return res.status(400).json({ ok: false, message: 'Please fill in all application fields' });

        const activeSession = await db.queryOne("SELECT * FROM sessions WHERE status = 'Open' AND isActive = 1 LIMIT 1");
        if (!activeSession) return res.status(400).json({ ok: false, message: 'No active appraisal session is currently open' });

        const existing = await db.queryOne('SELECT id FROM applications WHERE staffId = ? AND sessionId = ?', [userId, activeSession.id]);
        if (existing) return res.status(400).json({ ok: false, message: 'You have already submitted an application for this session' });

        const user = await db.queryOne('SELECT * FROM users WHERE id = ?', [userId]);
        const id = 'APP-' + Date.now();
        const certsJson = certificates ? (typeof certificates === 'string' ? certificates : JSON.stringify(certificates)) : '[]';
        const submittedAt = new Date().toISOString();

        await db.run(
            `INSERT INTO applications (id, staffId, department, type, details, certificates, sessionId, sessionName, status, score, submittedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 0, ?)`,
            [id, userId, user.department, type, details, certsJson, activeSession.id, activeSession.name, submittedAt]
        );

        // Notify HOD
        const hod = await db.queryOne("SELECT id FROM users WHERE department = ? AND role = 'HOD' LIMIT 1", [user.department]);
        if (hod) {
            await db.run(
                `INSERT INTO notifications (id, userId, title, message, isRead, type, createdAt) VALUES (?, ?, 'New Application', ?, 0, 'info', ?)`,
                ['NOTIF-' + Date.now(), hod.id, `${user.fullName} submitted an appraisal application for ${activeSession.name}`, submittedAt]
            );
        }

        const newApp = await db.queryOne('SELECT * FROM applications WHERE id = ?', [id]);
        newApp.certificates = parseCerts(newApp.certificates);
        res.status(201).json({ ok: true, message: `Application submitted successfully for ${activeSession.name}`, application: newApp });
    } catch (err) {
        console.error('Submit application error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

// PUT /api/applications/:id/status (HOD / VC)
router.put('/:id/status', verifyToken, requireRole('HOD', 'VC'), async (req, res) => {
    try {
        const db = getDb();
        const { status, score } = req.body;
        const appId = req.params.id;
        if (!['Approved', 'Rejected', 'Pending'].includes(status)) return res.status(400).json({ ok: false, message: 'Invalid status' });
        const app = await db.queryOne('SELECT * FROM applications WHERE id = ?', [appId]);
        if (!app) return res.status(404).json({ ok: false, message: 'Application not found' });
        const updatedAt = new Date().toISOString();
        const newScore = score !== undefined ? parseFloat(score) : app.score;
        await db.run('UPDATE applications SET status = ?, score = ?, updatedAt = ? WHERE id = ?', [status, newScore, updatedAt, appId]);
        await db.run(
            `INSERT INTO notifications (id, userId, title, message, isRead, type, createdAt) VALUES (?, ?, 'Application Updated', ?, 0, ?, ?)`,
            ['NOTIF-' + Date.now(), app.staffId, `Your appraisal application status is now ${status}`, status === 'Approved' ? 'success' : 'warning', updatedAt]
        );
        res.json({ ok: true, message: `Application status updated to ${status}` });
    } catch (err) {
        console.error('Update application status error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

module.exports = router;
