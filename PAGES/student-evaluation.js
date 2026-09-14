/* ============================================
   STUDENT EVALUATION LOGIC - SESSION BASED (REST API)
   ============================================ */
const StudentEvaluation = {
    currentStaff: null,
    allStaff: [],
    currentSession: null,
    myEvaluations: [],

    async init() {
        if (!App.checkAuth()) return;
        if (!App.isStudent()) {
            window.location.href = 'dashboard.html';
            return;
        }
        await this.loadData();
        this.setupModal();
        this.setupScoreCalculation();
        this.setupSearch();
    },

    async loadData() {
        const sessionRes = await API.getActiveSession();
        this.currentSession = sessionRes.ok ? sessionRes.session : null;
        this.renderSessionState();

        const user = App.getCurrentUser();
        const usersRes = await API.getUsers({ department: user.department, role: 'Lecturer' });
        this.allStaff = usersRes.ok ? usersRes.users.filter(u => u.isActive !== false) : [];

        if (this.currentSession) {
            const evalsRes = await API.getEvaluations({ evaluatorId: user.id, sessionId: this.currentSession.id });
            this.myEvaluations = evalsRes.ok ? evalsRes.evaluations : [];
        } else {
            this.myEvaluations = [];
        }

        this.renderStaffList(this.allStaff);
    },

    renderSessionState() {
        const box = document.getElementById('evaluationSessionState');
        if (!box) return;
        box.innerHTML = this.currentSession ? `
            <div class="session-banner active-session">
                <div><i class="bi bi-calendar2-check-fill"></i><div><strong>${this.currentSession.name}</strong><small>Active appraisal session</small></div></div>
                <span class="badge badge-approved">OPEN</span>
            </div>` : `
            <div class="session-banner closed-session">
                <div><i class="bi bi-calendar-x"></i><div><strong>No active session</strong><small>Evaluation is currently closed.</small></div></div>
            </div>`;
    },

    hasBeenEvaluated(staffId) {
        if (!this.currentSession) return false;
        return this.myEvaluations.some(e => e.staffId === staffId);
    },

    renderStaffList(staff) {
        const tbody = document.getElementById('evalTableBody');
        if (!tbody) return;

        if (!this.currentSession || staff.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-gray py-4">
                <i class="bi bi-calendar2-x" style="font-size:24px;display:block;margin-bottom:10px"></i>
                ${this.currentSession ? 'No lecturers available for evaluation.' : 'No active evaluation session.'}
            </td></tr>`;
            return;
        }

        tbody.innerHTML = staff.map(s => {
            const done = this.hasBeenEvaluated(s.id);
            return `<tr>
                <td><strong>${s.fullName}</strong></td>
                <td>${s.department}</td>
                <td>${done ? '<span class="badge badge-evaluated">Completed</span>' : '<span class="badge badge-pending">Pending</span>'}</td>
                <td>${done ? `<button class="btn btn-sm btn-outline-secondary" disabled><i class="bi bi-lock-fill"></i> Evaluated</button>` : `<button class="btn btn-sm btn-primary eval-btn" data-id="${s.id}"><i class="bi bi-clipboard-check"></i> Evaluate</button>`}</td>
            </tr>`;
        }).join('');

        tbody.querySelectorAll('.eval-btn').forEach(btn => btn.addEventListener('click', () => this.openEvalModal(btn.dataset.id)));
    },

    setupSearch() {
        const input = document.getElementById('evalSearch');
        if (!input) return;
        input.addEventListener('input', () => {
            const q = input.value.toLowerCase().trim();
            this.renderStaffList(this.allStaff.filter(s => s.fullName.toLowerCase().includes(q)));
        });
    },

    async openEvalModal(staffId) {
        if (!this.currentSession) { App.showToast('No active evaluation session.', 'error'); return; }
        if (this.hasBeenEvaluated(staffId)) { App.showToast('You have already evaluated this lecturer.', 'error'); return; }

        const userRes = await API.getUser(staffId);
        const staff = userRes.ok ? userRes.user : null;
        if (!staff) return;
        this.currentStaff = staff;

        document.getElementById('evalStaffName').textContent = staff.fullName;
        document.getElementById('evalStaffDept').textContent = `${staff.department} • ${this.currentSession.name}`;
        for (let i = 1; i <= 7; i++) {
            const el = document.getElementById('score' + i);
            if (el) el.value = 0;
        }
        document.getElementById('evalComments').value = '';
        this.updateTotalScore();
        document.getElementById('evalModal').classList.add('active');
    },

    setupModal() {
        document.getElementById('closeEvalModal')?.addEventListener('click', () => document.getElementById('evalModal').classList.remove('active'));
        document.getElementById('cancelEval')?.addEventListener('click', () => document.getElementById('evalModal').classList.remove('active'));
        document.getElementById('submitEval')?.addEventListener('click', async (e) => {
            e.preventDefault();
            await this.submitEvaluation();
        });
    },

    setupScoreCalculation() {
        for (let i = 1; i <= 7; i++) document.getElementById('score' + i)?.addEventListener('input', () => this.updateTotalScore());
    },

    updateTotalScore() {
        let total = 0;
        for (let i = 1; i <= 7; i++) {
            const el = document.getElementById('score' + i);
            total += Math.min(10, Math.max(0, Number(el ? el.value : 0) || 0));
        }
        const percentage = Math.round((total / 70) * 100);
        document.getElementById('totalScoreDisplay').textContent = `${percentage}% (${total} / 70)`;
        document.getElementById('scoreProgress').style.width = percentage + '%';
    },

    async submitEvaluation() {
        if (!this.currentSession || !this.currentStaff) return;
        if (this.hasBeenEvaluated(this.currentStaff.id)) {
            App.showToast('You have already evaluated this lecturer.', 'error');
            document.getElementById('evalModal').classList.remove('active');
            return;
        }

        const scores = {};
        for (let i = 1; i <= 7; i++) {
            const el = document.getElementById('score' + i);
            scores['criterion' + i] = Math.min(10, Math.max(0, Number(el ? el.value : 0) || 0));
        }

        const res = await API.submitEvaluation({
            staffId: this.currentStaff.id,
            scores: scores,
            comments: document.getElementById('evalComments').value.trim()
        });

        if (!res.ok) {
            App.showToast(res.message || 'Evaluation submission failed', 'error');
            return;
        }

        document.getElementById('evalModal').classList.remove('active');
        App.showToast('Evaluation submitted successfully!');
        await this.loadData();
    }
};

document.addEventListener('DOMContentLoaded', () => StudentEvaluation.init());
