/* ============================================
   STAFF APPRAISAL & EVALUATION SYSTEM
   App.js - Central Router & Core Logic
   ============================================ */

const App = {
    currentUser: null,

    init() {
        this.checkAuth();
        this.setupEventListeners();
    },

    checkAuth() {
        const user = JSON.parse(localStorage.getItem('currentUser'));
        const token = API ? API.getToken() : localStorage.getItem('token');
        const path = window.location.pathname.toLowerCase();
        const href = window.location.href.toLowerCase();

        const isAuthPage = path === '/' ||
                           path.endsWith('/index.html') ||
                           path.endsWith('index.html') ||
                           path.includes('login') || 
                           path.includes('signup') ||
                           path.includes('forgot') ||
                           path.includes('password') ||
                           href.includes('login.html') ||
                           href.includes('signup.html') ||
                           href.includes('forgot-password.html');

        if ((!user || !token) && !isAuthPage) {
            window.location.href = '../index.html';
            return false;
        }

        if (user && token) {
            this.currentUser = user;
            if (!isAuthPage) {
                const page = path.split('/').pop().replace('.html','');
                const protectedPage = ['evaluation','staff-applications','leaderboard','departments','apply-for-eval'];
                if (protectedPage.includes(page) && !this.canAccess(page)) {
                    window.location.href = 'dashboard.html';
                    return false;
                }
                this.renderNav();
            }
        }
        return true;
    },

    setupEventListeners() {
        return;
    },

    getCurrentUser() {
        return JSON.parse(localStorage.getItem('currentUser')) || this.currentUser;
    },

    setCurrentUser(user) {
        this.currentUser = user;
        localStorage.setItem('currentUser', JSON.stringify(user));
    },

    logout() {
        if (typeof API !== 'undefined') {
            API.logout();
        } else {
            localStorage.removeItem('currentUser');
            localStorage.removeItem('token');
        }
        window.location.href = '../index.html';
    },

    showToast(message, type = 'success') {
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="bi bi-${type === 'success' ? 'check-circle' : type === 'error' ? 'x-circle' : 'exclamation-triangle'}"></i>
            <span>${message}</span>
        `;
        container.appendChild(toast);

        setTimeout(() => toast.remove(), 4000);
    },

    renderNav() {
        // nav.js auto-injects sidebar and topbar
    },

    hasRole(role) {
        const user = this.getCurrentUser();
        return user && user.role === role;
    },

    isHOD() { return this.hasRole('HOD'); },
    isVC() { return this.hasRole('VC'); },
    isLecturer() { return this.hasRole('Lecturer'); },
    isStudent() { return this.hasRole('Student'); },

    getRolePermissions() {
        const user = this.getCurrentUser();
        if (!user) return [];

        const perms = {
            'VC': ['dashboard', 'profile', 'leaderboard', 'departments', 'settings'],
            'HOD': ['dashboard', 'profile', 'evaluation', 'staff-applications', 'leaderboard', 'settings'],
            'Lecturer': ['dashboard', 'profile', 'apply-for-eval', 'settings'],
            'Student': ['student-evaluation', 'profile', 'settings']
        };
        return perms[user.role] || [];
    },

    canAccess(page) {
        return this.getRolePermissions().includes(page);
    },

    fileIcon(name) {
        const n = String(name || '').toLowerCase();
        if (n.endsWith('.pdf')) return 'bi-file-earmark-pdf';
        if (n.endsWith('.doc') || n.endsWith('.docx')) return 'bi-file-earmark-word';
        if (n.endsWith('.jpg') || n.endsWith('.jpeg') || n.endsWith('.png') || n.endsWith('.webp')) return 'bi-file-earmark-image';
        return 'bi-file-earmark-text';
    },

    formatDate(dateStr) {
        if (!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric'
        });
    },

    // Async REST API wrappers
    async getUsers(query = {}) {
        const res = await API.getUsers(query);
        return res.ok ? res.users : [];
    },

    async getDepartments() {
        const res = await API.getDepartments();
        return res.ok ? res.departments : [];
    },

    async getSessions() {
        const res = await API.getSessions();
        return res.ok ? res.sessions : [];
    },

    async getActiveSession() {
        const res = await API.getActiveSession();
        return res.ok ? res.session : null;
    },

    async createAppraisalSession(name) {
        const res = await API.createSession(name);
        return res;
    },

    async closeActiveSession() {
        const res = await API.closeSession();
        return res.ok;
    },

    /* ============================================
       NOTIFICATION SYSTEM
       ============================================ */
    async getNotifications() {
        const res = await API.getNotifications();
        return res.ok ? res.notifications : [];
    },

    async getUnreadCount() {
        const notifs = await this.getNotifications();
        return notifs.filter(n => !n.isRead).length;
    },

    async markNotificationRead(notifId) {
        await API.markNotificationRead(notifId);
        this.updateNotificationBadge();
    },

    async updateNotificationBadge() {
        const badge = document.querySelector('.notification-badge');
        if (badge) {
            const count = await this.getUnreadCount();
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
    },

    /* ============================================
       DARK MODE
       ============================================ */
    toggleDarkMode() {
        const isDark = document.body.classList.toggle('dark-mode');
        localStorage.setItem('darkMode', isDark ? 'true' : 'false');
        this.updateDarkModeIcon();
    },

    loadDarkMode() {
        const isDark = localStorage.getItem('darkMode') === 'true';
        if (isDark) {
            document.body.classList.add('dark-mode');
        }
        this.updateDarkModeIcon();
    },

    updateDarkModeIcon() {
        const icon = document.getElementById('darkModeIcon');
        if (icon) {
            const isDark = document.body.classList.contains('dark-mode');
            icon.className = isDark ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();
    App.loadDarkMode();
});
