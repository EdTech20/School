/* ============================================
   STAFF APPRAISAL & EVALUATION SYSTEM
   api.js - Frontend REST API Client
   ============================================ */

const API = {
    baseUrl: (typeof window !== 'undefined' && (window.location.protocol === 'file:' || !window.location.port)) ? 'http://localhost:5001/api' : '/api',

    getToken() {
        return localStorage.getItem('token');
    },

    setToken(token) {
        if (token) {
            localStorage.setItem('token', token);
        } else {
            localStorage.removeItem('token');
        }
    },

    getHeaders(extraHeaders = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...extraHeaders
        };
        const token = this.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    },

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const config = {
            ...options,
            headers: this.getHeaders(options.headers)
        };

        try {
            const res = await fetch(url, config);
            const data = await res.json();
            if (!res.ok) {
                if (res.status === 401 || res.status === 403) {
                    // Token expired or invalid
                    if (!endpoint.includes('/auth/login')) {
                        console.warn('Authentication token expired or invalid');
                    }
                }
                return { ok: false, message: data.message || 'Request failed', status: res.status, ...data };
            }
            return data;
        } catch (err) {
            console.error(`API Error (${endpoint}):`, err);
            return { ok: false, message: err.message || 'Network error occurred' };
        }
    },

    // Auth API
    async login(email, password) {
        const res = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        if (res.ok && res.token) {
            this.setToken(res.token);
            localStorage.setItem('currentUser', JSON.stringify(res.user));
        }
        return res;
    },

    async register(userData) {
        return await this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
    },

    async forgotPassword(email) {
        return await this.request('/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
    },

    async resetPassword(email, otp, newPassword) {
        return await this.request('/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify({ email, otp, newPassword })
        });
    },

    async getMe() {
        return await this.request('/auth/me');
    },

    logout() {
        this.setToken(null);
        localStorage.removeItem('currentUser');
    },

    // Users API
    async getUsers(query = {}) {
        const params = new URLSearchParams(query).toString();
        return await this.request(`/users${params ? '?' + params : ''}`);
    },

    async getUser(id) {
        return await this.request(`/users/${id}`);
    },

    async updateProfile(profileData) {
        const res = await this.request('/users/profile', {
            method: 'PUT',
            body: JSON.stringify(profileData)
        });
        if (res.ok && res.user) {
            localStorage.setItem('currentUser', JSON.stringify(res.user));
        }
        return res;
    },

    async changePassword(currentPassword, newPassword) {
        return await this.request('/users/change-password', {
            method: 'PUT',
            body: JSON.stringify({ currentPassword, newPassword })
        });
    },

    async toggleUserStatus(id, isActive) {
        return await this.request(`/users/${id}/status`, {
            method: 'PUT',
            body: JSON.stringify({ isActive })
        });
    },

    async appointHOD(userId, department) {
        return await this.request('/users/appoint-hod', {
            method: 'POST',
            body: JSON.stringify({ userId, department })
        });
    },

    async generateHodHandover(successorEmail) {
        return await this.request('/users/hod-handover', {
            method: 'POST',
            body: JSON.stringify({ successorEmail })
        });
    },

    // Departments API
    async getDepartments() {
        return await this.request('/departments');
    },

    async createDepartment(name) {
        return await this.request('/departments', {
            method: 'POST',
            body: JSON.stringify({ name })
        });
    },

    async deleteDepartment(id) {
        return await this.request(`/departments/${id}`, {
            method: 'DELETE'
        });
    },

    // Sessions API
    async getSessions() {
        return await this.request('/sessions');
    },

    async getActiveSession() {
        return await this.request('/sessions/active');
    },

    async createSession(name) {
        return await this.request('/sessions', {
            method: 'POST',
            body: JSON.stringify({ name })
        });
    },

    async closeSession() {
        return await this.request('/sessions/close', {
            method: 'POST'
        });
    },

    // Applications API
    async getApplications(query = {}) {
        const params = new URLSearchParams(query).toString();
        return await this.request(`/applications${params ? '?' + params : ''}`);
    },

    async getMyApplications() {
        return await this.request('/applications/my');
    },

    async submitApplication(appData) {
        return await this.request('/applications', {
            method: 'POST',
            body: JSON.stringify(appData)
        });
    },

    async updateApplicationStatus(id, status, score) {
        return await this.request(`/applications/${id}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status, score })
        });
    },

    // Evaluations API
    async getEvaluations(query = {}) {
        const params = new URLSearchParams(query).toString();
        return await this.request(`/evaluations${params ? '?' + params : ''}`);
    },

    async submitEvaluation(evalData) {
        return await this.request('/evaluations', {
            method: 'POST',
            body: JSON.stringify(evalData)
        });
    },

    // HOD Reviews API
    async submitHodReview(reviewData) {
        return await this.request('/hod-reviews', {
            method: 'POST',
            body: JSON.stringify(reviewData)
        });
    },

    async getHodReviews(query = {}) {
        const params = new URLSearchParams(query).toString();
        return await this.request(`/hod-reviews${params ? '?' + params : ''}`);
    },

    // Leaderboard API
    async getLeaderboard(query = {}) {
        const params = new URLSearchParams(query).toString();
        return await this.request(`/leaderboard${params ? '?' + params : ''}`);
    },

    // Notifications API
    async getNotifications() {
        return await this.request('/notifications');
    },

    async markNotificationRead(id) {
        return await this.request(`/notifications/${id}/read`, {
            method: 'PUT'
        });
    }
};
