/* ============================================
   HOD EVALUATION LOGIC - SESSION BASED (REST API)
   ============================================ */
const Evaluation = {
    currentStaff: null,
    allStaff: [],
    currentSession: null,
    reviewsList: [],
    appsList: [],

    async init() {
        if (!App.checkAuth()) return;
        if (!App.isHOD()) {
            window.location.href = 'dashboard.html';
            return;
        }
        await this.loadData();
        this.setupFilters();
        this.setupModal();
        this.setupSearch();
    },

    async loadData() {
        const sessionRes = await API.getActiveSession();
        this.currentSession = sessionRes.ok ? sessionRes.session : null;
        this.renderSessionState();

        if (!this.currentSession) {
            this.allStaff = [];
            this.renderStaffList([]);
            return;
        }

        const user = App.getCurrentUser();
        const appsRes = await API.getApplications({ department: user.department, status: 'Approved', sessionId: this.currentSession.id });
        this.appsList = appsRes.ok ? appsRes.applications : [];

        const usersRes = await API.getUsers({ department: user.department, role: 'Lecturer' });
        const users = usersRes.ok ? usersRes.users : [];

        const approvedStaffIds = new Set(this.appsList.map(a => a.staffId));
        this.allStaff = users.filter(u => u.isActive !== false && approvedStaffIds.has(u.id));

        const reviewsRes = await API.getHodReviews({ sessionId: this.currentSession.id });
        this.reviewsList = reviewsRes.ok ? reviewsRes.hodReviews : [];

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
                <div><i class="bi bi-calendar-x"></i><div><strong>No active session</strong><small>Create a session from the HOD dashboard before evaluating staff.</small></div></div>
            </div>`;
    },

    hasBeenEvaluated(staffId) {
        if (!this.currentSession) return false;
        return this.reviewsList.some(e => e.staffId === staffId && e.sessionId === this.currentSession.id);
    },

    getEvaluation(staffId) {
        if (!this.currentSession) return null;
        return this.reviewsList.find(e => e.staffId === staffId && e.sessionId === this.currentSession.id) || null;
    },

    renderStaffList(staff) {
        const tbody = document.getElementById('evalTableBody');
        if (!tbody) return;

        if (!this.currentSession || staff.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-gray py-4">
                <i class="bi bi-calendar2-x" style="font-size:24px;display:block;margin-bottom:10px"></i>
                ${this.currentSession ? 'No approved lecturers available for this session.' : 'No active appraisal session. Create a new session first.'}
            </td></tr>`;
            return;
        }

        tbody.innerHTML = staff.map(s => {
            const review = this.getEvaluation(s.id);
            const done = !!review;
            return `<tr>
                <td><strong>${s.fullName}</strong></td>
                <td>${s.staffId}</td>
                <td>${s.department}</td>
                <td>${done ? App.formatDate(review.createdAt) : 'Not yet reviewed'}</td>
                <td>${done ? '<span class="badge badge-evaluated">Reviewed</span>' : '<span class="badge badge-pending">Pending Review</span>'}</td>
                <td>${done ? `<button class="btn btn-sm btn-outline-secondary" disabled><i class="bi bi-lock-fill"></i> Reviewed</button>` : `<button class="btn btn-sm btn-primary eval-btn" data-id="${s.id}"><i class="bi bi-clipboard-check"></i> Review</button>`}</td>
            </tr>`;
        }).join('');

        tbody.querySelectorAll('.eval-btn').forEach(btn => btn.addEventListener('click', () => this.openEvalModal(btn.dataset.id)));
    },

    setupSearch() {
        const input = document.getElementById('evalSearch');
        if (!input) return;
        input.addEventListener('input', () => {
            const q = input.value.toLowerCase().trim();
            this.renderStaffList(this.allStaff.filter(s => s.fullName.toLowerCase().includes(q) || s.staffId.toLowerCase().includes(q)));
        });
    },

    setupFilters() {
        const deptFilter = document.getElementById('deptFilter');
        if (deptFilter) deptFilter.style.display = 'none';
    },

    async openEvalModal(staffId) {
        if (!this.currentSession) { App.showToast('Create an appraisal session first.', 'error'); return; }
        if (this.hasBeenEvaluated(staffId)) { App.showToast('You have already reviewed this lecturer for this session.', 'error'); return; }

        const usersRes = await API.getUser(staffId);
        const staff = usersRes.ok ? usersRes.user : null;
        if (!staff) return;
        this.currentStaff = staff;

        document.getElementById('evalStaffName').textContent = staff.fullName;
        document.getElementById('evalStaffDept').textContent = `${staff.department} • ${this.currentSession.name}`;

        // Calculate average student score
        const evalsRes = await API.getEvaluations({ staffId: staffId, sessionId: this.currentSession.id });
        const studentEvals = evalsRes.ok ? evalsRes.evaluations.filter(e => e.evaluatorRole === 'Student') : [];

        let avgScore = 0;
        if (studentEvals.length > 0) {
            const sum = studentEvals.reduce((s, e) => s + (e.totalScore || 0), 0);
            avgScore = Math.round(sum / studentEvals.length);
        }

        document.getElementById('totalScoreDisplay').textContent = `${avgScore}%`;
        document.getElementById('scoreProgress').style.width = `${avgScore}%`;

        document.getElementById('hodRecommendation').value = '';
        document.getElementById('evalComments').value = '';
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

    async submitEvaluation() {
        if (!this.currentSession || !this.currentStaff) return;
        if (this.hasBeenEvaluated(this.currentStaff.id)) {
            App.showToast('You have already reviewed this lecturer.', 'error');
            document.getElementById('evalModal').classList.remove('active');
            return;
        }

        const recommendation = document.getElementById('hodRecommendation').value;
        if (!recommendation) {
            App.showToast('Please select a recommendation.', 'error');
            return;
        }

        const comments = document.getElementById('evalComments').value.trim();

        // Find application for this staff in current session
        const app = this.appsList.find(a => a.staffId === this.currentStaff.id);
        if (!app) {
            App.showToast('No approved application found for this staff.', 'error');
            return;
        }

        // Displayed average student score as score
        const scoreText = document.getElementById('totalScoreDisplay').textContent.replace('%', '');
        const score = parseFloat(scoreText) || 80;

        const res = await API.submitHodReview({
            applicationId: app.id,
            staffId: this.currentStaff.id,
            reviewComments: comments || 'Reviewed by HOD',
            recommendation: recommendation,
            score: score,
            status: 'Approved'
        });

        if (!res.ok) {
            App.showToast(res.message || 'Submission failed', 'error');
            return;
        }

        document.getElementById('evalModal').classList.remove('active');
        App.showToast('Review submitted successfully!');
        await this.loadData();
    }
};

document.addEventListener('DOMContentLoaded', () => Evaluation.init());
