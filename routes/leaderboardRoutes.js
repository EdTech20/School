const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { verifyToken } = require('../middleware/authMiddleware');

// GET /api/leaderboard
router.get('/', verifyToken, (req, res) => {
    const { department, sessionId } = req.query;

    // Get lecturers
    let query = "SELECT id, fullName, staffId, department, role, profileImage FROM users WHERE role = 'Lecturer' AND isActive = 1";
    const params = [];

    if (department && department !== 'All') {
        query += ' AND department = ?';
        params.push(department);
    }

    const lecturers = db.prepare(query).all(...params);

    // Get active session if not provided
    let activeSessionId = sessionId;
    if (!activeSessionId) {
        const active = db.prepare("SELECT id FROM sessions WHERE status = 'Open' AND isActive = 1 LIMIT 1").get();
        if (active) activeSessionId = active.id;
    }

    const leaderboard = lecturers.map(lec => {
        // Fetch evaluations for this lecturer
        let evalQuery = 'SELECT totalScore FROM evaluations WHERE staffId = ?';
        const evalParams = [lec.id];
        if (activeSessionId) {
            evalQuery += ' AND sessionId = ?';
            evalParams.push(activeSessionId);
        }
        const evals = db.prepare(evalQuery).all(...evalParams);

        const evalCount = evals.length;
        const avgStudentEval = evalCount > 0 ? (evals.reduce((sum, e) => sum + e.totalScore, 0) / evalCount) : 0;

        // Fetch HOD / Application score
        let appQuery = 'SELECT score FROM applications WHERE staffId = ? AND status = "Approved"';
        const appParams = [lec.id];
        if (activeSessionId) {
            appQuery += ' AND sessionId = ?';
            appParams.push(activeSessionId);
        }
        const app = db.prepare(appQuery).get(...appParams);
        const hodScore = app ? app.score : 0;

        // Compute composite score (70% HOD score + 30% Student Evals, scaled 0-100 or 0-5)
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
            rating: Number((finalScore / 20).toFixed(1)) // 1 to 5 stars rating scale
        };
    });

    // Sort by composite score descending
    leaderboard.sort((a, b) => b.compositeScore - a.compositeScore);

    // Add ranks
    leaderboard.forEach((item, index) => {
        item.rank = index + 1;
    });

    res.json({ ok: true, leaderboard });
});

module.exports = router;
