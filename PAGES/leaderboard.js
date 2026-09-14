/* ============================================
   LEADERBOARD - SESSION + SCORE PREVIEW (REST API)
   ============================================ */
const Leaderboard = {
    allSessions: [],

    async init() {
        if (!App.checkAuth()) return;
        if (App.isLecturer()) { window.location.href = 'dashboard.html'; return; }
        await this.loadSessions();
        await this.setupDepartmentFilter();
        this.setupPreviewModal();
        await this.renderLeaderboard();
    },

    async loadSessions() {
        const res = await API.getSessions();
        this.allSessions = res.ok ? res.sessions : [];
        this.setupSessionFilter();
    },

    selectedSessionId() {
        return document.getElementById('leaderboardSession')?.value || (this.allSessions[0]?.id || '');
    },

    async renderLeaderboard(dept = '') {
        const c = document.getElementById('leaderboardContainer');
        const empty = document.getElementById('leaderboardEmpty');
        if (!c) return;

        const sid = this.selectedSessionId();
        const res = await API.getLeaderboard({ department: dept || undefined, sessionId: sid || undefined });
        const data = res.ok ? res.leaderboard : [];

        if (!data.length) {
            c.innerHTML = '';
            empty?.classList.remove('hidden');
            return;
        }
        empty?.classList.add('hidden');

        c.innerHTML = data.map((e, i) => {
            const r = e.rank || (i + 1);
            const cl = r === 1 ? 'gold' : r === 2 ? 'silver' : r === 3 ? 'bronze' : 'other';
            return `<div class="leaderboard-item">
                <div class="leaderboard-rank ${cl}">${r}</div>
                <div class="leaderboard-info">
                    <h4>${e.name}</h4>
                    <p>${e.department} • Staff ID: ${e.staffId || 'N/A'}</p>
                    <small class="text-${e.hodScore > 0 ? 'success' : 'warning'}">
                        ${e.hodScore > 0 ? '<i class="bi bi-check-circle-fill"></i> Reviewed by HOD' : 'Pending HOD Review'}
                    </small>
                </div>
                <div class="leaderboard-score">
                    <h3>${e.compositeScore || 0}%</h3>
                    <p>Score</p>
                </div>
                <button class="btn btn-sm btn-outline-primary leaderboard-preview-btn" data-staffid="${e.id}"><i class="bi bi-eye"></i> Preview</button>
            </div>`;
        }).join('');

        c.querySelectorAll('.leaderboard-preview-btn').forEach(b => b.onclick = () => this.preview(b.dataset.staffid));
    },

    setupSessionFilter() {
        const f = document.getElementById('leaderboardSession');
        if (!f) return;
        f.innerHTML = this.allSessions.length ? this.allSessions.map(s => `<option value="${s.id}">${s.name}${s.status === 'Open' ? ' • OPEN' : ''}</option>`).join('') : '<option value="">No sessions</option>';
        f.addEventListener('change', () => this.renderLeaderboard(document.getElementById('leaderboardFilter')?.value || ''));
    },

    async setupDepartmentFilter() {
        const f = document.getElementById('leaderboardFilter');
        const u = App.getCurrentUser();
        if (!f) return;
        if (u.role === 'VC') {
            const res = await API.getDepartments();
            const depts = res.ok ? res.departments : [];
            f.innerHTML = '<option value="">All Departments</option>';
            depts.forEach(d => f.insertAdjacentHTML('beforeend', `<option value="${d.name}">${d.name}</option>`));
        } else {
            f.style.display = 'none';
        }
        f.addEventListener('change', () => this.renderLeaderboard(f.value));
    },

    setupPreviewModal() {
        document.getElementById('closeLeaderboardPreview')?.addEventListener('click', () => document.getElementById('leaderboardPreviewModal')?.classList.remove('active'));
    },

    async preview(staffId) {
        const sid = this.selectedSessionId();
        const userRes = await API.getUser(staffId);
        const staff = userRes.ok ? userRes.user : null;

        const evalsRes = await API.getEvaluations({ staffId, sessionId: sid });
        const evals = evalsRes.ok ? evalsRes.evaluations : [];
        const studentEvals = evals.filter(e => e.evaluatorRole === 'Student');

        const reviewRes = await API.getHodReviews({ staffId, sessionId: sid });
        const reviews = reviewRes.ok ? reviewRes.hodReviews : [];
        const review = reviews[0] || null;

        const appsRes = await API.getApplications({ sessionId: sid });
        const apps = appsRes.ok ? appsRes.applications.filter(a => a.staffId === staffId) : [];
        const certs = apps.flatMap(a => a.certificates || []);

        const avgScore = studentEvals.length > 0 ? Math.round(studentEvals.reduce((s, ev) => s + (ev.totalScore || 0), 0) / studentEvals.length) : 0;

        document.getElementById('leaderboardPreviewTitle').textContent = `${staff?.fullName || 'Staff'} — Appraisal Details`;
        document.getElementById('leaderboardPreviewBody').innerHTML = `
            <div class="preview-meta">
                <span><strong>Staff ID</strong>${staff?.staffId || 'N/A'}</span>
                <span><strong>Department</strong>${staff?.department || 'N/A'}</span>
                <span><strong>Student Evals</strong>${studentEvals.length}</span>
                <span><strong>Total Avg Score</strong>${avgScore}%</span>
            </div>
            <div class="mt-3">
                <h5>HOD Review</h5>
                <div class="app-details-box">${review ? `<strong>Recommendation:</strong> ${review.recommendation}<br><br><strong>Comments:</strong><br>${review.reviewComments || 'None'}` : '<span class="text-gray">Pending HOD Review</span>'}</div>
            </div>
            <div class="mt-3">
                <h5>Uploaded Certificate / Documents</h5>
                ${certs.length ? `
                    <div class="cert-preview-list">
                        ${certs.map((c, i) => `
                            <button class="cert-preview-item" type="button" onclick="Leaderboard.previewDocument(${JSON.stringify(c).replace(/"/g, '&quot;')})">
                                <i class="bi ${App.fileIcon(c.name)}"></i>
                                <span class="cert-preview-name">${c.name}</span>
                                <span class="cert-preview-badge"><i class="bi bi-eye"></i> View</span>
                            </button>
                        `).join('')}
                    </div>
                ` : '<p class="text-gray">No uploaded documents for this session.</p>'}
            </div>`;

        document.getElementById('leaderboardPreviewModal')?.classList.add('active');
    },

    async previewDocument(cert) {
        const title = document.getElementById('documentPreviewTitle');
        const body = document.getElementById('documentPreviewBody');
        if (title) title.textContent = cert.name;
        const n = cert.name.toLowerCase();

        if (!cert.dataUrl) {
            body.innerHTML = '<div class="cert-preview-placeholder"><i class="bi bi-file-earmark-x"></i><h4>Preview unavailable</h4></div>';
        } else if (n.match(/\.(png|jpe?g|gif|webp)$/)) {
            body.innerHTML = `<div class="document-viewer"><img src="${cert.dataUrl}" class="preview-image" alt="${cert.name}"></div>`;
        } else if (n.endsWith('.pdf')) {
            body.innerHTML = `<div class="document-viewer"><iframe src="${cert.dataUrl}" class="preview-frame" title="${cert.name}"></iframe></div>`;
        } else if (n.endsWith('.docx')) {
            body.innerHTML = '<div class="document-viewer document-text-preview"><div class="spinner-border text-primary"></div><p>Opening certificate...</p></div>';
            try {
                const bytes = Uint8Array.from(atob(cert.dataUrl.split(',')[1]), c => c.charCodeAt(0));
                const r = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer });
                body.innerHTML = `<div class="document-viewer document-text-preview">${r.value}</div>`;
            } catch {
                body.innerHTML = '<div class="cert-preview-placeholder"><i class="bi bi-exclamation-circle"></i><h4>Could not render document</h4></div>';
            }
        } else {
            body.innerHTML = '<div class="cert-preview-placeholder"><i class="bi bi-file-earmark-word"></i><h4>Document Preview</h4></div>';
        }
        document.getElementById('documentPreviewModal')?.classList.add('active');
    }
};

document.addEventListener('DOMContentLoaded', () => Leaderboard.init());
