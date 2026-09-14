/* ============================================
   APPLY FOR EVALUATION - SESSION BASED (REST API)
   ============================================ */
const ApplyEval = {
    tempCerts: [],

    async init() {
        if (!App.checkAuth()) return;
        const user = App.getCurrentUser();
        if (user.role !== 'Lecturer') { window.location.href = 'dashboard.html'; return; }
        await this.renderSessionState();
        await this.renderMyApplications();
        this.setupForm();
        this.setupUpload();
    },

    async getMyApplications() {
        const res = await API.getMyApplications();
        return res.ok ? res.applications : [];
    },

    async renderSessionState() {
        const box = document.getElementById('applicationSessionState');
        const form = document.getElementById('applyForm');
        const sessionRes = await API.getActiveSession();
        const session = sessionRes.ok ? sessionRes.session : null;
        const apps = await this.getMyApplications();
        const currentApp = session ? apps.find(a => a.sessionId === session.id) : null;
        const locked = !session || !!currentApp;

        if (box) {
            box.innerHTML = session ? `
                <div class="session-banner ${currentApp ? 'closed-session' : 'active-session'}">
                    <div><i class="bi ${currentApp ? 'bi-check-circle-fill' : 'bi-calendar2-check-fill'}"></i><div><strong>${session.name}</strong><small>${currentApp ? `You already applied for this session (${currentApp.status}).` : 'Application window is open.'}</small></div></div>
                    <span class="badge ${currentApp ? 'badge-evaluated' : 'badge-approved'}">${currentApp ? 'APPLIED' : 'OPEN'}</span>
                </div>` : `
                <div class="session-banner closed-session"><div><i class="bi bi-calendar-x"></i><div><strong>No active appraisal session</strong><small>The HOD must create a new session before applications can be submitted.</small></div></div><span class="badge badge-rejected">CLOSED</span></div>`;
        }

        if (form) {
            form.querySelectorAll('input,select,textarea,button').forEach(el => el.disabled = locked);
            const submit = form.querySelector('button[type="submit"]');
            if (submit) submit.innerHTML = currentApp ? '<i class="bi bi-lock-fill"></i> Application Submitted for This Session' : '<i class="bi bi-send"></i> Submit Application';
        }
        return { session, currentApp, locked };
    },

    async renderMyApplications() {
        const container = document.getElementById('myAppsList');
        if (!container) return;
        const apps = await this.getMyApplications();
        if (!apps.length) { container.innerHTML = '<div class="empty-state" style="padding:30px 20px"><i class="bi bi-inbox"></i><h5>No Applications</h5><p>No appraisal applications submitted yet.</p></div>'; return; }
        container.innerHTML = apps.map(app => `<div class="application-history-item"><div><h6>${app.sessionName || 'Previous Session'}</h6><p>${app.type} • ${App.formatDate(app.submittedAt || app.date)}</p></div><span class="badge badge-${(app.status || 'pending').toLowerCase()}">${app.status}</span></div>`).join('');
    },

    setupForm() {
        document.getElementById('applyForm')?.addEventListener('submit', async e => { e.preventDefault(); await this.submitApplication(); });
    },

    setupUpload() {
        const area = document.getElementById('appUploadArea'), input = document.getElementById('appCertInput');
        if (!area || !input) return;
        area.addEventListener('click', () => { if (!input.disabled) input.click(); });
        input.addEventListener('change', async e => {
            const files = Array.from(e.target.files);
            for (const file of files) {
                const dataUrl = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
                this.tempCerts.push({ name:file.name, type:file.type, dataUrl, date:new Date().toISOString(), size:file.size });
            }
            this.renderCertList(); input.value = '';
        });
    },

    renderCertList() {
        const container = document.getElementById('appCertList');
        if (!container) return;
        container.innerHTML = this.tempCerts.map((c,i) => `<div class="cert-item"><i class="bi ${App.fileIcon(c.name)}"></i><span class="cert-item-name">${c.name}</span><button type="button" class="cert-item-remove" onclick="ApplyEval.removeCert(${i})"><i class="bi bi-x-lg"></i></button></div>`).join('');
    },
    removeCert(i) { this.tempCerts.splice(i,1); this.renderCertList(); },

    async submitApplication() {
        const state = await this.renderSessionState();
        if (state.locked || !state.session || state.currentApp) { App.showToast('You can apply only once in an active appraisal session.', 'error'); return; }
        const type = document.getElementById('appType').value, details = document.getElementById('appDetails').value.trim();
        if (!type || !details) { App.showToast('Please fill in all fields.', 'error'); return; }

        const res = await API.submitApplication({
            type,
            details,
            certificates: this.tempCerts
        });

        if (!res.ok) {
            App.showToast(res.message || 'Submission failed', 'error');
            return;
        }

        this.tempCerts = [];
        document.getElementById('applyForm').reset();
        this.renderCertList();
        await this.renderSessionState();
        await this.renderMyApplications();
        App.showToast(`Application submitted for ${state.session.name}.`);
    }
};
document.addEventListener('DOMContentLoaded', () => ApplyEval.init());
