/* ============================================
   STAFF APPRAISAL & EVALUATION SYSTEM
   nav.js - Auto-injects Sidebar + Topbar
   ============================================ */

const Nav = {
    init() {
        const user = JSON.parse(localStorage.getItem('currentUser'));
        if (!user) return;

        this.injectSidebar(user);
        this.injectTopbar(user);
        this.setActiveNav();
        this.setupMobileToggle();
        this.setupNotifications();
        this.setupDarkMode();
        App.updateNotificationBadge();
    },

    injectSidebar(user) {
        const showApplyForEval = user.role === 'Lecturer';

        const sidebarHTML = `
            <aside class="sidebar" id="sidebar">
                <div class="sidebar-header">
                    <div class="sidebar-brand">
                        <i class="bi bi-mortarboard-fill"></i>
                        <span>Staff Appraisal</span>
                    </div>
                    <button class="sidebar-toggle d-lg-none">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>
                <nav class="sidebar-nav">
                    <ul>
                        <li class="nav-item">
                            <a href="dashboard.html" class="nav-link" data-page="dashboard">
                                <i class="bi bi-grid-fill"></i>
                                <span>Dashboard</span>
                            </a>
                        </li>
                        <li class="nav-item">
                            <a href="profile.html" class="nav-link" data-page="profile">
                                <i class="bi bi-person-fill"></i>
                                <span>Profile</span>
                            </a>
                        </li>
                        ${user.role === 'HOD' ? `
                        <li class="nav-item">
                            <a href="evaluation.html" class="nav-link" data-page="evaluation"><i class="bi bi-clipboard-check-fill"></i><span>Evaluation</span></a>
                        </li>
                        <li class="nav-item">
                            <a href="staff-applications.html" class="nav-link" data-page="staff-applications"><i class="bi bi-people-fill"></i><span>Staff Applications</span></a>
                        </li>` : ''}
                        ${user.role === 'HOD' || user.role === 'VC' ? `
                        <li class="nav-item">
                            <a href="leaderboard.html" class="nav-link" data-page="leaderboard"><i class="bi bi-trophy-fill"></i><span>Leaderboard</span></a>
                        </li>` : ''}
                        ${user.role === 'Student' ? `
                        <li class="nav-item">
                            <a href="student-evaluation.html" class="nav-link" data-page="student-evaluation"><i class="bi bi-person-check-fill"></i><span>Evaluate Lecturers</span></a>
                        </li>` : ''}
                        ${user.role === 'VC' ? `
                        <li class="nav-item">
                            <a href="departments.html" class="nav-link" data-page="departments">
                                <i class="bi bi-building"></i>
                                <span>Departments</span>
                            </a>
                        </li>
                        ` : ''}
                        ${showApplyForEval ? `
                        <li class="nav-item">
                            <a href="apply-for-eval.html" class="nav-link" data-page="apply-for-eval">
                                <i class="bi bi-file-earmark-text-fill"></i>
                                <span>Apply for Eval</span>
                            </a>
                        </li>
                        ` : ''}
                        <li class="nav-item">
                            <a href="settings.html" class="nav-link" data-page="settings">
                                <i class="bi bi-gear-fill"></i>
                                <span>Settings</span>
                            </a>
                        </li>
                    </ul>
                </nav>
                <div class="sidebar-footer">
                    <a href="#" class="nav-link dark-mode-toggle" id="sidebarDarkMode">
                        <i class="bi bi-moon-fill" id="sidebarDarkIcon"></i>
                        <span>Dark Mode</span>
                    </a>
                    <a href="#" class="nav-link" id="logoutBtn">
                        <i class="bi bi-box-arrow-right"></i>
                        <span>Logout</span>
                    </a>
                </div>
            </aside>
            <div class="mobile-overlay" id="mobileOverlay"></div>
        `;

        document.body.insertAdjacentHTML('afterbegin', sidebarHTML);

        document.getElementById('logoutBtn').addEventListener('click', (e) => {
            e.preventDefault();
            App.logout();
        });
    },

    injectTopbar(user) {
        const pageTitle = this.getPageTitle();
        const initials = user.fullName ? user.fullName.split(' ').map(n => n[0]).join('').toUpperCase() : 'U';

        const avatarHTML = user.profileImage 
            ? `<img src="${user.profileImage}" class="user-avatar-img" alt="${initials}">`
            : `<div class="user-avatar"><i class="bi bi-person-fill"></i></div>`;

        const topbarHTML = `
            <header class="topbar">
                <div class="topbar-left">
                    <button class="sidebar-toggle d-lg-none" id="mobileToggle">
                        <i class="bi bi-list"></i>
                    </button>
                    <div>
                        <h1 class="page-title">${pageTitle}</h1>
                        <nav aria-label="breadcrumb">
                            <ol class="breadcrumb">
                                <li class="breadcrumb-item"><a href="dashboard.html">Home</a></li>
                                <li class="breadcrumb-item active">${pageTitle}</li>
                            </ol>
                        </nav>
                    </div>
                </div>
                <div class="topbar-right">
                    <div class="notification-wrapper">
                        <div class="topbar-icon" id="notificationBell">
                            <i class="bi bi-bell-fill"></i>
                            <span class="notification-badge" style="display: none;">0</span>
                        </div>
                        <div class="notification-dropdown hidden" id="notificationDropdown">
                            <div class="notification-header">
                                <h6>Notifications</h6>
                                <a href="#" id="markAllRead">Mark all read</a>
                            </div>
                            <div class="notification-list" id="notificationList">
                                <!-- Injected by JS -->
                            </div>
                        </div>
                    </div>
                    <div class="user-dropdown" id="userDropdown">
                        ${avatarHTML}
                        <div class="user-info d-none d-md-block">
                            <div class="user-name">${user.fullName || 'User'}</div>
                            <div class="user-role">${user.role}</div>
                        </div>
                        <i class="bi bi-chevron-down d-none d-md-block"></i>
                    </div>
                </div>
            </header>
        `;

        document.body.insertAdjacentHTML('afterbegin', topbarHTML);
    },

    setupNotifications() {
        const bell = document.getElementById('notificationBell');
        const dropdown = document.getElementById('notificationDropdown');
        const list = document.getElementById('notificationList');
        const markAllLink = document.getElementById('markAllRead');

        if (!bell) return;

        this.renderNotifications();

        bell.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('hidden');
            if (!dropdown.classList.contains('hidden')) {
                this.renderNotifications();
            }
        });

        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && !bell.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });

        if (markAllLink) {
            markAllLink.addEventListener('click', (e) => {
                e.preventDefault();
                App.markAllRead();
                this.renderNotifications();
            });
        }
    },

    renderNotifications() {
        const list = document.getElementById('notificationList');
        const user = App.getCurrentUser();
        if (!list || !user) return;

        const notifications = App.getNotifications()
            .filter(n => n.userId === user.id)
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 10);

        if (notifications.length === 0) {
            list.innerHTML = `
                <div class="notification-empty">
                    <i class="bi bi-bell-slash"></i>
                    <p>No notifications</p>
                </div>
            `;
            return;
        }

        list.innerHTML = notifications.map(n => `
            <div class="notification-item ${n.read ? 'read' : 'unread'}" data-id="${n.id}">
                <div class="notification-dot"></div>
                <div class="notification-content">
                    <p class="notification-msg">${n.message}</p>
                    <span class="notification-time">${App.formatDate(n.date)}</span>
                </div>
            </div>
        `).join('');

        // Click to mark read
        list.querySelectorAll('.notification-item').forEach(item => {
            item.addEventListener('click', () => {
                const notifId = item.dataset.id;
                App.markNotificationRead(notifId);
                item.classList.remove('unread');
                item.classList.add('read');
            });
        });
    },

    setupDarkMode() {
        const sidebarToggle = document.getElementById('sidebarDarkMode');
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', (e) => {
                e.preventDefault();
                App.toggleDarkMode();
                const icon = document.getElementById('sidebarDarkIcon');
                if (icon) {
                    const isDark = document.body.classList.contains('dark-mode');
                    icon.className = isDark ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
                }
            });
        }
    },

    getPageTitle() {
        const path = window.location.pathname.toLowerCase();
        if (path.includes('dashboard')) return 'Dashboard';
        if (path.includes('profile')) return 'Profile';
        if (path.includes('evaluation')) return 'Evaluation';
        if (path.includes('staff-application')) return 'Staff Applications';
        if (path.includes('leaderboard')) return 'Leaderboard';
        if (path.includes('department')) return 'Departments';
        if (path.includes('apply-for-eval')) return 'Apply for Evaluation';
        if (path.includes('student-evaluation')) return 'Evaluate Lecturers';
        if (path.includes('settings')) return 'Settings';
        return 'Staff Appraisal';
    },

    setActiveNav() {
        const currentPage = window.location.pathname.split('/').pop().replace('.html', '');
        document.querySelectorAll('.nav-link').forEach(link => {
            const page = link.getAttribute('data-page');
            if (page === currentPage) {
                link.classList.add('active');
            }
        });
    },

    setupMobileToggle() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('mobileOverlay');
        const mobileToggle = document.getElementById('mobileToggle');
        const closeToggle = sidebar?.querySelector('.sidebar-header .sidebar-toggle');
        if (!sidebar || !overlay || !mobileToggle) return;

        const isMobile = () => window.matchMedia('(max-width: 992px)').matches;

        const closeDrawer = () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            document.body.classList.remove('sidebar-open');
        };

        const openDrawer = () => {
            if (!isMobile()) return;
            sidebar.classList.remove('collapsed');
            sidebar.classList.add('active');
            overlay.classList.add('active');
            document.body.classList.add('sidebar-open');
        };

        // One owner for all drawer events, shared by every protected page
        // and every role. This avoids duplicate handlers in App.js.
        mobileToggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openDrawer();
        });

        closeToggle?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeDrawer();
        });

        overlay.addEventListener('click', closeDrawer);

        sidebar.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                if (isMobile()) closeDrawer();
            });
        });

        // Escape closes the drawer.
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && sidebar.classList.contains('active')) {
                closeDrawer();
            }
        });

        // Reset only mobile state when returning to desktop. Never apply
        // the desktop collapsed width while on a mobile breakpoint.
        const syncResponsiveState = () => {
            if (!isMobile()) {
                sidebar.classList.remove('active');
                overlay.classList.remove('active');
                document.body.classList.remove('sidebar-open');
            } else {
                // Ensure a stale desktop state can never shrink the drawer.
                sidebar.classList.remove('collapsed');
            }
        };

        window.addEventListener('resize', syncResponsiveState, { passive: true });
        window.addEventListener('orientationchange', syncResponsiveState, { passive: true });
        syncResponsiveState();
    }
};

// Auto-init
document.addEventListener('DOMContentLoaded', () => {
    Nav.init();
});
