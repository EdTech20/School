const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

// ─── Initialize DB then mount routes ───────────────────────────────────────
const dbPromise = require('./db/database');

dbPromise.then(db => {
    // Make db available globally so routes can require it
    global._db = db;

    const authRoutes        = require('./routes/authRoutes');
    const userRoutes        = require('./routes/userRoutes');
    const departmentRoutes  = require('./routes/departmentRoutes');
    const sessionRoutes     = require('./routes/sessionRoutes');
    const applicationRoutes = require('./routes/applicationRoutes');
    const evaluationRoutes  = require('./routes/evaluationRoutes');
    const hodReviewRoutes   = require('./routes/hodReviewRoutes');
    const leaderboardRoutes = require('./routes/leaderboardRoutes');
    const notificationRoutes = require('./routes/notificationRoutes');

    app.use('/api/auth', authRoutes);
    app.use('/api/users', userRoutes);
    app.use('/api/departments', departmentRoutes);
    app.use('/api/sessions', sessionRoutes);
    app.use('/api/applications', applicationRoutes);
    app.use('/api/evaluations', evaluationRoutes);
    app.use('/api/hod-reviews', hodReviewRoutes);
    app.use('/api/leaderboard', leaderboardRoutes);
    app.use('/api/notifications', notificationRoutes);

    // Fallback: serve index.html for SPA
    app.get('*', (req, res) => {
        if (req.path.startsWith('/api')) {
            return res.status(404).json({ ok: false, message: 'API endpoint not found' });
        }
        const indexPath = path.resolve(__dirname, 'index.html');
        if (fs.existsSync(indexPath)) {
            return res.sendFile(indexPath);
        }
        res.status(200).send('Staff Appraisal System API is running.');
    });

    if (require.main === module) {
        app.listen(PORT, () => {
            console.log(`====================================================`);
            console.log(`Staff Appraisal & Evaluation System Server running`);
            console.log(`URL: http://localhost:${PORT}`);
            console.log(`DB:  ${process.env.TURSO_DATABASE_URL ? 'Turso Cloud SQLite' : 'Local SQLite'}`);
            console.log(`====================================================`);
        });
    }
}).catch(err => {
    console.error('Fatal: Could not initialize database:', err);
    process.exit(1);
});

module.exports = app;
