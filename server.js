const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Initialize DB tables and seed data
require('./db/database');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const applicationRoutes = require('./routes/applicationRoutes');
const evaluationRoutes = require('./routes/evaluationRoutes');
const hodReviewRoutes = require('./routes/hodReviewRoutes');
const leaderboardRoutes = require('./routes/leaderboardRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/evaluations', evaluationRoutes);
app.use('/api/hod-reviews', hodReviewRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/notifications', notificationRoutes);

// Fallback route for single page app / static serve
app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ ok: false, message: 'API endpoint not found' });
    }
    res.sendFile(path.join(__dirname, 'index.html'));
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`====================================================`);
        console.log(`Staff Appraisal & Evaluation System Server is running`);
        console.log(`Server URL: http://localhost:${PORT}`);
        console.log(`SQLite Database: initialized & ready`);
        console.log(`====================================================`);
    });
}

module.exports = app;
