const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');

function getDb() { return global._db; }

// GET /api/leaderboard
router.get('/', verifyToken, async (req, res) => {
    try {
        const db = getDb();
        const { department, sessionId } = req.query;

        let lecSql = "SELECT id, fullName, staffId, department, role, profileImage FROM users WHERE role = 'Lecturer' AND isActive = 1";
        const lecArgs = [];
        if (department && department !== 'All') { lecSql += ' AND department = ?'; lecArgs.push(department); }
        const lecturers = await db.queryAll(lecSql, lecArgs);

        // Get active session if not provided
        let activeSessionId = sessionId;
        if (!activeSessionId) {
            const active = await db.queryOne("SELECT id FROM sessions WHERE status = 'Open' AND isActive = 1 LIMIT 1");
            if (active) activeSessionId = active.id;
        }

        const leaderboard = await Promise.all(lecturers.map(async lec => {
            let evalSql = 'SELECT totalScore FROM evaluations WHERE staffId = ?';
            const evalArgs = [lec.id];
            if (activeSessionId) { evalSql += ' AND sessionId = ?'; evalArgs.push(activeSessionId); }
            const evals = await db.queryAll(evalSql, evalArgs);

            const evalCount = evals.length;
            const avgStudentEval = evalCount > 0 ? (evals.reduce((sum, e) => sum + Number(e.totalScore), 0) / evalCount) : 0;

            let appSql = 'SELECT score FROM applications WHERE staffId = ? AND status = "Approved"';
            const appArgs = [lec.id];
            if (activeSessionId) { appSql += ' AND sessionId = ?'; appArgs.push(activeSessionId); }
            const app = await db.queryOne(appSql, appArgs);
            const hodScore = app ? Number(app.score) : 0;

            const finalScore = hodScore > 0 ? (hodScore * 0.7 + (avgStudentEval * 20) * 0.3) : (avgStudentEval * 20);

            return {
                id: lec.id,
                name: lec.fullName,
                staffId: lec.staffId,
                department: lec.department,
                profileImage: lec.profileImage,
                evalCount,
                avgEval: Number(avgStudentEval.toFixed(2)),
                hodScore: Number(hodScore.toFixed(2)),
                compositeScore: Number(finalScore.toFixed(1)),
                rating: Number((finalScore / 20).toFixed(1))
            };
        }));

        leaderboard.sort((a, b) => b.compositeScore - a.compositeScore);
        leaderboard.forEach((item, index) => { item.rank = index + 1; });

        res.json({ ok: true, leaderboard });
    } catch (err) {
        console.error('Get leaderboard error:', err);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

module.exports = router;
