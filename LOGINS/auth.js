/* ============================================
   STAFF APPRAISAL & EVALUATION SYSTEM
   auth.js - Authentication Logic (REST API Connected)
   ============================================ */

const Auth = {
    init() {
        this.setupLogin();
        this.setupSignup();
        this.setupForgotPassword();
    },

    setupLogin() {
        const form = document.getElementById('loginForm');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value;

            if (!email || !password) {
                this.showAlert('Please enter both email and password', 'danger');
                return;
            }

            const res = await API.login(email, password);

            if (!res.ok) {
                this.showAlert(res.message || 'Invalid email or password', 'danger');
                return;
            }

            this.showAlert('Login successful! Redirecting...', 'success');
            setTimeout(() => {
                window.location.href = 'PAGES/dashboard.html';
            }, 1000);
        });

        const toggleBtn = document.getElementById('togglePassword');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const input = document.getElementById('loginPassword');
                input.type = input.type === 'password' ? 'text' : 'password';
                toggleBtn.querySelector('i').className = input.type === 'password' ? 'bi bi-eye' : 'bi bi-eye-slash';
            });
        }
    },

    async setupSignup() {
        const form = document.getElementById('signupForm');
        if (!form) return;

        const deptSelect = document.getElementById('signupDepartment');
        if (deptSelect) {
            const deptsRes = await API.getDepartments();
            const depts = deptsRes.ok ? deptsRes.departments.map(d => d.name) : [
                'Computer Science', 'Mathematics', 'Physics', 'Chemistry',
                'Biology', 'Economics', 'Business Administration', 'Law',
                'Medicine', 'Engineering', 'Agriculture', 'Education'
            ];
            deptSelect.innerHTML = '<option value="">Select Department</option>';
            depts.forEach(dept => {
                const opt = document.createElement('option');
                opt.value = dept;
                opt.textContent = dept;
                deptSelect.appendChild(opt);
            });
        }

        const roleSelect = document.getElementById('signupRole');
        const matricGroup = document.getElementById('matricNumberGroup');
        if (roleSelect && matricGroup) {
            roleSelect.addEventListener('change', (e) => {
                if (e.target.value === 'Student') {
                    matricGroup.classList.remove('hidden');
                } else {
                    matricGroup.classList.add('hidden');
                    document.getElementById('signupStaffId').value = '';
                }
            });
            matricGroup.classList.add('hidden');
        }

        const profileInput = document.getElementById('profileImage');
        const preview = document.getElementById('profilePreview');
        if (profileInput && preview) {
            profileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                        preview.src = evt.target.result;
                        preview.style.display = 'block';
                        const icon = preview.parentElement.querySelector('.profile-upload-icon');
                        if (icon) icon.style.display = 'none';
                    };
                    reader.readAsDataURL(file);
                }
            });
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const fullName = document.getElementById('signupName').value.trim();
            const email = document.getElementById('signupEmail').value.trim();
            let staffId = document.getElementById('signupStaffId').value.trim();
            const department = document.getElementById('signupDepartment').value;
            const role = document.getElementById('signupRole').value;
            const password = document.getElementById('signupPassword').value;
            const confirmPassword = document.getElementById('signupConfirmPassword').value;
            const profileImageInput = document.getElementById('profileImage');

            if (!fullName || !email || !department || !role || !password) {
                this.showAlert('Please fill in all required fields', 'danger');
                return;
            }

            if (role === 'Student' && !staffId) {
                this.showAlert('Please enter your Matric Number', 'danger');
                return;
            }

            if (password !== confirmPassword) {
                this.showAlert('Passwords do not match', 'danger');
                return;
            }

            if (password.length < 6) {
                this.showAlert('Password must be at least 6 characters', 'danger');
                return;
            }

            if (role === 'HOD') {
                this.showAlert('HOD cannot self-register. Please register as a Lecturer. The VC will appoint HODs.', 'danger');
                return;
            }

            const sendRegistration = async (profileImage = null) => {
                const res = await API.register({
                    fullName,
                    email,
                    staffId,
                    department,
                    role,
                    password,
                    profileImage
                });

                if (!res.ok) {
                    this.showAlert(res.message || 'Registration failed', 'danger');
                    return;
                }

                this.showAlert('Account created successfully! Please login.', 'success');
                setTimeout(() => {
                    window.location.href = '../index.html';
                }, 1500);
            };

            if (profileImageInput && profileImageInput.files && profileImageInput.files[0]) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    sendRegistration(evt.target.result);
                };
                reader.readAsDataURL(profileImageInput.files[0]);
            } else {
                sendRegistration(null);
            }
        });

        const toggleBtn = document.getElementById('toggleSignupPassword');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const input = document.getElementById('signupPassword');
                input.type = input.type === 'password' ? 'text' : 'password';
                toggleBtn.querySelector('i').className = input.type === 'password' ? 'bi bi-eye' : 'bi bi-eye-slash';
            });
        }
    },

    /* ============================================
       OTP-BASED FORGOT PASSWORD
       ============================================ */
    setupForgotPassword() {
        const step1 = document.getElementById('step1');
        if (!step1) return;

        document.getElementById('sendOtpBtn').addEventListener('click', () => {
            this.sendOTP();
        });

        document.getElementById('verifyOtpBtn').addEventListener('click', () => {
            this.verifyOTP();
        });

        document.getElementById('resetPasswordBtn').addEventListener('click', () => {
            this.resetPassword();
        });

        const resendLink = document.getElementById('resendOtpLink');
        if (resendLink) {
            resendLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.sendOTP();
            });
        }

        const toggleNewBtn = document.getElementById('toggleNewPassword');
        if (toggleNewBtn) {
            toggleNewBtn.addEventListener('click', () => {
                const input = document.getElementById('newPassword');
                input.type = input.type === 'password' ? 'text' : 'password';
                toggleNewBtn.querySelector('i').className = input.type === 'password' ? 'bi bi-eye' : 'bi bi-eye-slash';
            });
        }
    },

    async sendOTP() {
        const email = document.getElementById('forgotEmail').value.trim();

        if (!email) {
            this.showAlert('Please enter your email address', 'danger');
            return;
        }

        const btn = document.getElementById('sendOtpBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Sending...';
        btn.disabled = true;

        const res = await API.forgotPassword(email);

        btn.innerHTML = originalText;
        btn.disabled = false;

        if (!res.ok) {
            this.showAlert(res.message || 'Failed to generate OTP', 'danger');
            return;
        }

        // Store email & temporary OTP for UI verification step
        sessionStorage.setItem('resetEmail', email);
        if (res.otp) {
            sessionStorage.setItem('resetOTP', res.otp);
        }

        this.showAlert(`OTP generated (${res.otp || 'Sent'}). Enter code below.`, 'success');

        document.getElementById('step1').classList.add('hidden');
        document.getElementById('step2').classList.remove('hidden');
        document.getElementById('otpEmailDisplay').textContent = email;
    },

    verifyOTP() {
        const enteredOTP = document.getElementById('otpInput').value.trim();
        const storedOTP = sessionStorage.getItem('resetOTP');

        if (!enteredOTP || enteredOTP.length !== 6) {
            this.showAlert('Please enter the 6-digit OTP', 'danger');
            return;
        }

        if (storedOTP && enteredOTP !== storedOTP) {
            this.showAlert('Invalid OTP code. Please try again.', 'danger');
            return;
        }

        sessionStorage.setItem('verifiedOTP', enteredOTP);
        this.showAlert('OTP verified successfully!', 'success');

        document.getElementById('step2').classList.add('hidden');
        document.getElementById('step3').classList.remove('hidden');
    },

    async resetPassword() {
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmNewPassword').value;
        const email = sessionStorage.getItem('resetEmail');
        const otp = sessionStorage.getItem('verifiedOTP') || sessionStorage.getItem('resetOTP');

        if (!email || !otp) {
            this.showAlert('Session expired. Please start again.', 'danger');
            return;
        }

        if (!newPassword || !confirmPassword) {
            this.showAlert('Please fill in both password fields', 'danger');
            return;
        }

        if (newPassword.length < 6) {
            this.showAlert('Password must be at least 6 characters', 'danger');
            return;
        }

        if (newPassword !== confirmPassword) {
            this.showAlert('Passwords do not match', 'danger');
            return;
        }

        const res = await API.resetPassword(email, otp, newPassword);

        if (!res.ok) {
            this.showAlert(res.message || 'Password reset failed', 'danger');
            return;
        }

        sessionStorage.removeItem('resetEmail');
        sessionStorage.removeItem('resetOTP');
        sessionStorage.removeItem('verifiedOTP');

        this.showAlert('Password reset successful! Redirecting to login...', 'success');
        setTimeout(() => {
            window.location.href = '../index.html';
        }, 1500);
    },

    showAlert(message, type) {
        let alertBox = document.getElementById('authAlert');
        if (!alertBox) {
            alertBox = document.createElement('div');
            alertBox.id = 'authAlert';
            const form = document.querySelector('.auth-form:not(.hidden)') || document.querySelector('form');
            if (form) form.parentNode.insertBefore(alertBox, form);
        }

        alertBox.className = `alert alert-${type}`;
        alertBox.innerHTML = `<i class="bi bi-${type === 'success' ? 'check-circle' : 'exclamation-triangle'}"></i> ${message}`;
        alertBox.style.display = 'flex';

        setTimeout(() => {
            alertBox.style.display = 'none';
        }, 5000);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Auth.init();
});
