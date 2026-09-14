/* ============================================
   DEPARTMENTS PAGE LOGIC (VC ONLY - REST API)
   ============================================ */

const Departments = {
    currentDept: null,
    appointMode: false,

    async init() {
        if (!App.checkAuth()) return;

        if (!App.isVC()) {
            window.location.href = 'dashboard.html';
            return;
        }

        await this.renderDepartments();
        this.setupModals();
    },

    async renderDepartments() {
        const deptsRes = await API.getDepartments();
        const depts = deptsRes.ok ? deptsRes.departments : [];
        const usersRes = await API.getUsers();
        const users = usersRes.ok ? usersRes.users : [];
        const container = document.getElementById('departmentsGrid');

        if (!container) return;

        if (depts.length === 0) {
            container.innerHTML = '';
            document.getElementById('deptEmpty')?.classList.remove('hidden');
            return;
        }

        document.getElementById('deptEmpty')?.classList.add('hidden');

        container.innerHTML = depts.map(dObj => {
            const dept = dObj.name;
            const staff = users.filter(u => u.department === dept && u.role === 'Lecturer' && u.isActive !== false);
            const hod = users.find(u => u.id === dObj.hodId || (u.department === dept && u.role === 'HOD' && u.isActive !== false));

            const actionBtn = hod 
                ? `<button class="btn btn-sm btn-outline-primary" onclick="Departments.openHandoverModal('${dept}')" title="Handover HOD"><i class="bi bi-arrow-left-right"></i></button>`
                : `<button class="btn btn-sm btn-success" onclick="Departments.openAppointModal('${dept}')" title="Appoint HOD"><i class="bi bi-person-plus"></i> Appoint HOD</button>`;

            return `
                <div class="col-md-6 col-lg-4 mb-4">
                    <div class="dept-card">
                        <div class="dept-header">
                            <span class="dept-name">${dept}</span>
                            ${actionBtn}
                        </div>
                        <p class="text-gray mb-2" style="font-size: 14px;">
                            <i class="bi bi-person-badge"></i> HOD: ${hod ? hod.fullName : '<span style="color:var(--danger)">Not Assigned</span>'}
                        </p>
                        <div class="dept-stats">
                            <div class="dept-stat">
                                <h4>${staff.length}</h4>
                                <p>Lecturers</p>
                            </div>
                            <div class="dept-stat">
                                <h4>${hod ? '1' : '0'}</h4>
                                <p>HOD</p>
                            </div>
                            <div class="dept-stat">
                                <h4>${staff.length + (hod ? 1 : 0)}</h4>
                                <p>Total</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    setupModals() {
        document.getElementById('addDeptBtn')?.addEventListener('click', () => {
            document.getElementById('deptModalTitle').textContent = 'Add Department';
            document.getElementById('deptName').value = '';
            this.currentDept = null;
            document.getElementById('deptModal').classList.add('active');
        });

        document.getElementById('closeDeptModal')?.addEventListener('click', () => {
            document.getElementById('deptModal').classList.remove('active');
        });

        document.getElementById('cancelDept')?.addEventListener('click', () => {
            document.getElementById('deptModal').classList.remove('active');
        });

        document.getElementById('saveDept')?.addEventListener('click', async () => {
            await this.saveDepartment();
        });

        document.getElementById('closeHandoverModal')?.addEventListener('click', () => {
            document.getElementById('handoverModal').classList.remove('active');
        });

        document.getElementById('cancelHandover')?.addEventListener('click', () => {
            document.getElementById('handoverModal').classList.remove('active');
        });

        document.getElementById('confirmHandover')?.addEventListener('click', async () => {
            await this.confirmAction();
        });
    },

    async saveDepartment() {
        const name = document.getElementById('deptName').value.trim();
        if (!name) {
            App.showToast('Please enter a department name', 'error');
            return;
        }

        const res = await API.createDepartment(name);
        if (!res.ok) {
            App.showToast(res.message || 'Failed to create department', 'error');
            return;
        }

        document.getElementById('deptModal').classList.remove('active');
        App.showToast('Department added successfully!');
        await this.renderDepartments();
    },

    async openAppointModal(dept) {
        this.currentDept = dept;
        this.appointMode = true;
        document.getElementById('handoverModalTitle').textContent = 'Appoint HOD';
        document.getElementById('handoverDeptName').textContent = dept;
        document.getElementById('handoverCodeArea').classList.add('hidden');
        document.getElementById('confirmHandover').innerHTML = '<i class="bi bi-person-plus"></i> Appoint HOD';

        const usersRes = await API.getUsers({ department: dept, role: 'Lecturer' });
        const lecturers = usersRes.ok ? usersRes.users : [];

        const select = document.getElementById('newHODSelect');
        select.innerHTML = '<option value="">Select Lecturer</option>';

        if (lecturers.length === 0) {
            select.innerHTML = '<option value="">No lecturers in this department</option>';
            select.disabled = true;
        } else {
            select.disabled = false;
            lecturers.forEach(l => {
                const opt = document.createElement('option');
                opt.value = l.id;
                opt.textContent = l.fullName + ' (' + (l.staffId || 'No ID') + ')';
                select.appendChild(opt);
            });
        }

        document.getElementById('handoverModal').classList.add('active');
    },

    async openHandoverModal(dept) {
        await this.openAppointModal(dept);
        this.appointMode = false;
        document.getElementById('handoverModalTitle').textContent = 'HOD Handover';
        document.getElementById('confirmHandover').innerHTML = '<i class="bi bi-arrow-left-right"></i> Confirm Handover';
    },

    async confirmAction() {
        const newHODId = document.getElementById('newHODSelect').value;
        if (!newHODId) {
            App.showToast('Please select a lecturer', 'error');
            return;
        }

        const res = await API.appointHOD(newHODId, this.currentDept);
        if (!res.ok) {
            App.showToast(res.message || 'Action failed', 'error');
            return;
        }

        document.getElementById('handoverModal').classList.remove('active');
        App.showToast(res.message || 'HOD appointed successfully!');
        await this.renderDepartments();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Departments.init();
});
