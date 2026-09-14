/* ============================================
   PROFILE PAGE LOGIC (REST API)
   ============================================ */

const Profile = {
    tempCerts: [],
    tempProfileImage: null,

    async init() {
        if (!App.checkAuth()) return;
        await this.loadAndRenderProfile();
        this.setupEditModal();
    },

    async loadAndRenderProfile() {
        const res = await API.getMe();
        if (res.ok && res.user) {
            App.setCurrentUser(res.user);
        }
        this.renderProfile();
    },

    renderProfile() {
        const user = App.getCurrentUser();
        if (!user) return;

        document.getElementById('profileName').textContent = user.fullName || 'Unknown';
        document.getElementById('profileRole').textContent = user.role || 'Staff';
        document.getElementById('profileSystemId').textContent = user.id || 'N/A';
        document.getElementById('profileStaffId').textContent = user.staffId || 'N/A';
        document.getElementById('profileEmail').textContent = user.email || 'N/A';
        document.getElementById('profileDepartment').textContent = user.department || 'N/A';
        document.getElementById('profileRoleBadge').innerHTML = `<span class="badge badge-${(user.role || '').toLowerCase()}">${user.role}</span>`;
        document.getElementById('profilePhone').textContent = user.phone || 'Not set';
        document.getElementById('profileJoined').textContent = App.formatDate(user.createdAt);
        document.getElementById('profileBio').textContent = user.bio || 'No bio added yet.';

        const avatarEl = document.getElementById('profileAvatar');
        if (user.profileImage) {
            avatarEl.innerHTML = `<img src="${user.profileImage}" class="profile-avatar-img" alt="${user.fullName}">`;
        } else {
            avatarEl.innerHTML = '<i class="bi bi-person-fill"></i>';
        }

        const certs = user.certificates || [];
        const certContainer = document.getElementById('profileCerts');
        if (certContainer) {
            if (certs.length > 0) {
                certContainer.innerHTML = certs.map((cert, i) => `
                    <div class="cert-item">
                        <i class="bi bi-file-earmark-text"></i>
                        <span class="cert-item-name">${cert.name}</span>
                        <span class="text-gray" style="font-size: 12px;">${App.formatDate(cert.date)}</span>
                    </div>
                `).join('');
            } else {
                certContainer.innerHTML = '<p class="text-gray">No certificates added yet.</p>';
            }
        }
    },

    setupEditModal() {
        const modal = document.getElementById('editProfileModal');

        document.getElementById('editProfileBtn')?.addEventListener('click', () => {
            const user = App.getCurrentUser();
            document.getElementById('editName').value = user.fullName || '';
            document.getElementById('editStaffId').value = user.staffId || '';
            document.getElementById('editPhone').value = user.phone || '';
            document.getElementById('editBio').value = user.bio || '';
            this.tempCerts = [...(user.certificates || [])];
            this.tempProfileImage = user.profileImage || null;
            this.renderCertList();
            this.renderEditProfilePreview();
            modal.classList.add('active');
        });

        document.getElementById('closeEditModal')?.addEventListener('click', () => {
            modal.classList.remove('active');
        });

        document.getElementById('cancelEdit')?.addEventListener('click', () => {
            modal.classList.remove('active');
        });

        document.getElementById('saveProfile')?.addEventListener('click', async () => {
            await this.saveProfile();
        });

        const profileInput = document.getElementById('editProfileImage');
        if (profileInput) {
            profileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                        this.tempProfileImage = evt.target.result;
                        this.renderEditProfilePreview();
                    };
                    reader.readAsDataURL(file);
                }
            });
        }

        const uploadArea = document.getElementById('certUploadArea');
        const certInput = document.getElementById('certInput');

        uploadArea?.addEventListener('click', () => certInput?.click());

        certInput?.addEventListener('change', (e) => {
            Array.from(e.target.files).forEach(file => {
                this.tempCerts.push({
                    name: file.name,
                    date: new Date().toISOString(),
                    size: file.size
                });
            });
            this.renderCertList();
        });
    },

    renderEditProfilePreview() {
        const preview = document.getElementById('editProfilePreview');
        const icon = document.querySelector('#editProfileModal .profile-upload-icon');

        if (this.tempProfileImage) {
            preview.src = this.tempProfileImage;
            preview.classList.remove('hidden');
            if (icon) icon.style.display = 'none';
        } else {
            preview.classList.add('hidden');
            if (icon) icon.style.display = 'block';
        }
    },

    renderCertList() {
        const container = document.getElementById('certList');
        if (!container) return;
        if (this.tempCerts.length === 0) {
            container.innerHTML = '';
            return;
        }
        container.innerHTML = this.tempCerts.map((cert, i) => `
            <div class="cert-item">
                <i class="bi bi-file-earmark-text"></i>
                <span class="cert-item-name">${cert.name}</span>
                <button type="button" class="cert-item-remove" onclick="Profile.removeCert(${i})">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>
        `).join('');
    },

    removeCert(index) {
        this.tempCerts.splice(index, 1);
        this.renderCertList();
    },

    async saveProfile() {
        const fullName = document.getElementById('editName').value.trim();
        const phone = document.getElementById('editPhone').value.trim();
        const bio = document.getElementById('editBio').value.trim();

        const res = await API.updateProfile({
            fullName,
            phone,
            bio,
            certificates: this.tempCerts,
            profileImage: this.tempProfileImage
        });

        if (!res.ok) {
            App.showToast(res.message || 'Profile update failed', 'error');
            return;
        }

        document.getElementById('editProfileModal').classList.remove('active');
        App.showToast('Profile updated successfully!');
        this.renderProfile();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Profile.init();
});
