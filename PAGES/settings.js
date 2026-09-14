/* ============================================
   SETTINGS PAGE LOGIC (REST API)
   ============================================ */

const Settings = {
    async init() {
        if (!App.checkAuth()) return;
        this.renderAccountInfo();
        this.setupTabs();
        this.setupChangePassword();
        this.setupNotificationsToggle();
        this.setupDangerZone();
    },

    renderAccountInfo() {
        const user = App.getCurrentUser();
        if (!user) return;

        document.getElementById('settingsName').value = user.fullName || '';
        document.getElementById('settingsEmail').value = user.email || '';
        document.getElementById('settingsStaffId').value = user.staffId || '';
        document.getElementById('settingsPhone').value = user.phone || '';
        document.getElementById('settingsBio').value = user.bio || '';
    },

    setupTabs() {
        document.querySelectorAll('.settings-nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const target = item.dataset.tab;

                document.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');

                document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
                document.getElementById(target)?.classList.add('active');
            });
        });
    },

    setupChangePassword() {
        const form = document.getElementById('changePasswordForm');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newSettingsPassword').value;
            const confirmPassword = document.getElementById('confirmSettingsPassword').value;

            if (!currentPassword || !newPassword || !confirmPassword) {
                App.showToast('Please fill in all password fields', 'error');
                return;
            }

            if (newPassword.length < 6) {
                App.showToast('New password must be at least 6 characters', 'error');
                return;
            }

            if (newPassword !== confirmPassword) {
                App.showToast('New passwords do not match', 'error');
                return;
            }

            const res = await API.changePassword(currentPassword, newPassword);

            if (!res.ok) {
                App.showToast(res.message || 'Failed to change password', 'error');
                return;
            }

            App.showToast('Password changed successfully!');
            form.reset();
        });

        const toggleCurrent = document.getElementById('toggleCurrentPassword');
        if (toggleCurrent) {
            toggleCurrent.addEventListener('click', () => {
                const input = document.getElementById('currentPassword');
                input.type = input.type === 'password' ? 'text' : 'password';
                toggleCurrent.querySelector('i').className = input.type === 'password' ? 'bi bi-eye' : 'bi bi-eye-slash';
            });
        }

        const toggleNew = document.getElementById('toggleNewSettingsPassword');
        if (toggleNew) {
            toggleNew.addEventListener('click', () => {
                const input = document.getElementById('newSettingsPassword');
                input.type = input.type === 'password' ? 'text' : 'password';
                toggleNew.querySelector('i').className = input.type === 'password' ? 'bi bi-eye' : 'bi bi-eye-slash';
            });
        }
    },

    setupNotificationsToggle() {
        const emailToggle = document.getElementById('emailNotif');
        const evalToggle = document.getElementById('evalNotif');
        const appToggle = document.getElementById('appNotif');

        const prefs = JSON.parse(localStorage.getItem('notificationPrefs')) || {};
        if (emailToggle) emailToggle.checked = prefs.email !== false;
        if (evalToggle) evalToggle.checked = prefs.evaluation !== false;
        if (appToggle) appToggle.checked = prefs.application !== false;

        const saveBtn = document.getElementById('saveNotifPrefs');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const prefs = {
                    email: emailToggle ? emailToggle.checked : true,
                    evaluation: evalToggle ? evalToggle.checked : true,
                    application: appToggle ? appToggle.checked : true
                };
                localStorage.setItem('notificationPrefs', JSON.stringify(prefs));
                App.showToast('Notification preferences saved!');
            });
        }
    },

    setupDangerZone() {
        const deleteBtn = document.getElementById('deleteAccountBtn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async () => {
                if (confirm('Are you sure you want to deactivate your account? This cannot be undone.')) {
                    const user = App.getCurrentUser();
                    const res = await API.toggleUserStatus(user.id, false);
                    if (res.ok) {
                        App.logout();
                    } else {
                        App.showToast(res.message || 'Deactivation failed', 'error');
                    }
                }
            });
        }

        const clearBtn = document.getElementById('clearDataBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (App.isVC()) {
                    if (confirm('WARNING: This will clear local session storage. Database tables remain persisted.')) {
                        localStorage.clear();
                        App.showToast('Local state reset. Reloading...');
                        setTimeout(() => App.logout(), 1000);
                    }
                } else {
                    App.showToast('Only VC can reset system state', 'error');
                }
            });
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Settings.init();
});
