const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'staff_appraisal_jwt_secret_key_2026';

function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ ok: false, message: 'Access token required' });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ ok: false, message: 'Invalid or expired token' });
    }
}

function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ ok: false, message: 'Unauthorized' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ ok: false, message: 'Forbidden: Insufficient role permissions' });
        }

        next();
    };
}

module.exports = {
    JWT_SECRET,
    verifyToken,
    requireRole
};
