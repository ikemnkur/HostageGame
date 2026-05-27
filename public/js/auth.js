/* ─── Auth Page (Register / Login) ───────────────────────── */

window.AuthPage = (() => {

  function render() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="auth-page">
        <div class="logo">♔♕</div>
        <h1>Hostage</h1>
        <p class="subtitle">A chess-inspired rescue game</p>

        <div class="auth-tabs">
          <button class="auth-tab active" id="tab-login"  onclick="AuthPage._showTab('login')">Sign In</button>
          <button class="auth-tab"        id="tab-register" onclick="AuthPage._showTab('register')">Register</button>
        </div>

        <!-- ── Login form ── -->
        <form id="login-form" class="auth-form" autocomplete="on">
          <input type="text"     id="login-input"    name="login"    placeholder="Username or email" autofocus autocomplete="username" />
          <input type="password" id="login-password" name="password" placeholder="Password" autocomplete="current-password" />
          <p class="error-msg" id="login-error"></p>
          <button type="submit" id="login-btn">Sign In</button>
          <p class="auth-link" id="forgot-link"><a href="#" onclick="AuthPage._showForgot(); return false;">Forgot password?</a></p>
        </form>

        <!-- ── Register form ── -->
        <form id="register-form" class="auth-form" style="display:none;" autocomplete="on">
          <div class="name-row">
            <input type="text" id="reg-firstname" name="firstName" placeholder="First name (optional)" autocomplete="given-name" />
            <input type="text" id="reg-lastname"  name="lastName"  placeholder="Last name (optional)"  autocomplete="family-name" />
          </div>
          <input type="text"     id="reg-username" name="username" placeholder="Username (2–50 chars)" autocomplete="username" />
          <input type="email"    id="reg-email"    name="email"    placeholder="Email address"           autocomplete="email" />
          <input type="password" id="reg-password" name="password" placeholder="Password (min 6 chars)" autocomplete="new-password" />
          <input type="password" id="reg-confirm"  name="confirm"  placeholder="Confirm password"        autocomplete="new-password" />
          <p class="error-msg" id="register-error"></p>
          <button type="submit" id="register-btn">Create Account</button>
        </form>

        <!-- ── Verify email prompt (shown after register) ── -->
        <div id="verify-panel" style="display:none;">
          <p class="auth-info">A verification code was sent to <strong id="verify-email-display"></strong>.</p>
          <form id="verify-form" class="auth-form">
            <input type="text" id="verify-code" placeholder="Enter verification code" inputmode="numeric" maxlength="10" />
            <p class="error-msg" id="verify-error"></p>
            <button type="submit" id="verify-btn">Verify Email</button>
            <p class="auth-link"><a href="#" onclick="AuthPage._resendCode(); return false;">Resend code</a></p>
          </form>
          <p class="auth-link" style="margin-top:12px">
            <a href="#" onclick="AuthPage._showTab('login'); return false;">← Already verified? Sign in</a>
          </p>
        </div>

        <!-- ── Forgot password panel ── -->
        <div id="forgot-panel" style="display:none;">
          <p class="auth-info">Enter your email address and we'll send you a reset code.</p>
          <form id="forgot-form" class="auth-form">
            <input type="email" id="forgot-email" placeholder="Your email address" autocomplete="email" />
            <p class="error-msg"    id="forgot-error"></p>
            <p class="success-msg"  id="forgot-success" style="display:none"></p>
            <button type="submit" id="forgot-btn">Send Reset Code</button>
          </form>
          <div id="reset-section" style="display:none;">
            <form id="reset-form" class="auth-form">
              <input type="text"     id="reset-code"     placeholder="Reset code from email" />
              <input type="password" id="reset-password" placeholder="New password (min 6 chars)" autocomplete="new-password" />
              <input type="password" id="reset-confirm"  placeholder="Confirm new password"        autocomplete="new-password" />
              <p class="error-msg"   id="reset-error"></p>
              <button type="submit" id="reset-btn">Reset Password</button>
            </form>
          </div>
          <p class="auth-link" style="margin-top:12px">
            <a href="#" onclick="AuthPage._showTab('login'); return false;">← Back to sign in</a>
          </p>
        </div>

        <a href="/rules" class="rules-link" onclick="event.preventDefault(); window.App.navigate('/rules');">How to Play →</a>
      </div>
    `;

    _state.pendingEmail = null;

    // Pre-fill login from localStorage
    try {
      const saved = JSON.parse(localStorage.getItem('hostage_user') || localStorage.getItem('HostageChess_user'));
      if (saved?.username) document.getElementById('login-input').value = saved.username;
    } catch {}

    document.getElementById('login-form').addEventListener('submit', _handleLogin);
    document.getElementById('register-form').addEventListener('submit', _handleRegister);
    document.getElementById('verify-form').addEventListener('submit', _handleVerify);
    document.getElementById('forgot-form').addEventListener('submit', _handleForgot);
    document.getElementById('reset-form').addEventListener('submit', _handleReset);
  }

  // ─── internal state ───────────────────────────────────────
  const _state = { pendingEmail: null };

  // ─── tab switching ────────────────────────────────────────
  function _showTab(tab) {
    document.getElementById('login-form').style.display   = tab === 'login'    ? '' : 'none';
    document.getElementById('register-form').style.display = tab === 'register' ? '' : 'none';
    document.getElementById('verify-panel').style.display  = 'none';
    document.getElementById('forgot-panel').style.display  = 'none';
    document.getElementById('tab-login').classList.toggle('active',    tab === 'login');
    document.getElementById('tab-register').classList.toggle('active', tab === 'register');
    document.querySelectorAll('.auth-tabs').forEach(el => el.style.display = '');
  }

  function _showForgot() {
    document.getElementById('login-form').style.display    = 'none';
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('verify-panel').style.display  = 'none';
    document.getElementById('forgot-panel').style.display  = '';
    document.querySelectorAll('.auth-tabs').forEach(el => el.style.display = 'none');
  }

  // ─── login ────────────────────────────────────────────────
  async function _handleLogin(e) {
    e.preventDefault();
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';

    const login    = document.getElementById('login-input').value.trim();
    const password = document.getElementById('login-password').value;

    if (!login || !password) {
      errorEl.textContent = 'Please enter your username/email and password.';
      return;
    }

    const btn = document.getElementById('login-btn');
    btn.disabled = true; btn.textContent = 'Signing in…';

    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        errorEl.textContent = data.error || 'Sign in failed.';
        btn.disabled = false; btn.textContent = 'Sign In';
        return;
      }

      localStorage.setItem('hostage_user', JSON.stringify(data.user));
      localStorage.setItem('HostageChess_user', JSON.stringify(data.user));
      window.App.navigate('/lobby');
    } catch {
      errorEl.textContent = 'Network error. Please try again.';
      btn.disabled = false; btn.textContent = 'Sign In';
    }
  }

  // ─── register ─────────────────────────────────────────────
  async function _handleRegister(e) {
    e.preventDefault();
    const errorEl = document.getElementById('register-error');
    errorEl.textContent = '';

    const username  = document.getElementById('reg-username').value.trim();
    const email     = document.getElementById('reg-email').value.trim();
    const password  = document.getElementById('reg-password').value;
    const confirm   = document.getElementById('reg-confirm').value;
    const firstName = document.getElementById('reg-firstname').value.trim();
    const lastName  = document.getElementById('reg-lastname').value.trim();

    if (!username || !email || !password) {
      errorEl.textContent = 'Username, email and password are required.';
      return;
    }
    if (password !== confirm) {
      errorEl.textContent = 'Passwords do not match.';
      return;
    }
    if (password.length < 6) {
      errorEl.textContent = 'Password must be at least 6 characters.';
      return;
    }

    const btn = document.getElementById('register-btn');
    btn.disabled = true; btn.textContent = 'Creating account…';

    try {
      const res  = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, firstName, lastName }),
      });
      const data = await res.json();

      if (!res.ok) {
        errorEl.textContent = data.error || 'Registration failed.';
        btn.disabled = false; btn.textContent = 'Create Account';
        return;
      }

      // If email service is active, show verify panel; otherwise go straight to lobby
      if (data.message && data.message.includes('verify')) {
        _state.pendingEmail = email;
        document.getElementById('register-form').style.display = 'none';
        document.querySelectorAll('.auth-tabs').forEach(el => el.style.display = 'none');
        document.getElementById('verify-email-display').textContent = email;
        document.getElementById('verify-panel').style.display = '';
      } else {
        localStorage.setItem('hostage_user', JSON.stringify(data.user));
        localStorage.setItem('HostageChess_user', JSON.stringify(data.user));
        window.App.navigate('/lobby');
      }
    } catch {
      errorEl.textContent = 'Network error. Please try again.';
      btn.disabled = false; btn.textContent = 'Create Account';
    }
  }

  // ─── verify email ─────────────────────────────────────────
  async function _handleVerify(e) {
    e.preventDefault();
    const errorEl = document.getElementById('verify-error');
    errorEl.textContent = '';

    const code  = document.getElementById('verify-code').value.trim();
    const email = _state.pendingEmail;

    if (!code) { errorEl.textContent = 'Please enter the verification code.'; return; }

    const btn = document.getElementById('verify-btn');
    btn.disabled = true; btn.textContent = 'Verifying…';

    try {
      const res  = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();

      if (!res.ok) {
        errorEl.textContent = data.error || 'Verification failed.';
        btn.disabled = false; btn.textContent = 'Verify Email';
        return;
      }

      _showTab('login');
      document.getElementById('login-error').style.color = 'var(--success, #4caf50)';
      document.getElementById('login-error').textContent = '✅ Email verified! You can now sign in.';
    } catch {
      errorEl.textContent = 'Network error. Please try again.';
      btn.disabled = false; btn.textContent = 'Verify Email';
    }
  }

  async function _resendCode() {
    const email = _state.pendingEmail;
    if (!email) return;
    try {
      await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      document.getElementById('verify-error').style.color = 'var(--success, #4caf50)';
      document.getElementById('verify-error').textContent = 'Code resent! Check your inbox.';
    } catch {}
  }

  // ─── forgot password ──────────────────────────────────────
  async function _handleForgot(e) {
    e.preventDefault();
    const errorEl   = document.getElementById('forgot-error');
    const successEl = document.getElementById('forgot-success');
    errorEl.textContent = ''; successEl.style.display = 'none';

    const email = document.getElementById('forgot-email').value.trim();
    if (!email) { errorEl.textContent = 'Email is required.'; return; }

    const btn = document.getElementById('forgot-btn');
    btn.disabled = true; btn.textContent = 'Sending…';

    try {
      const res  = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      btn.disabled = false; btn.textContent = 'Send Reset Code';

      if (!res.ok) { errorEl.textContent = data.error || 'Request failed.'; return; }

      successEl.textContent = data.message;
      successEl.style.display = '';
      _state.pendingEmail = email;
      document.getElementById('reset-section').style.display = '';
    } catch {
      errorEl.textContent = 'Network error. Please try again.';
      btn.disabled = false; btn.textContent = 'Send Reset Code';
    }
  }

  // ─── reset password ───────────────────────────────────────
  async function _handleReset(e) {
    e.preventDefault();
    const errorEl = document.getElementById('reset-error');
    errorEl.textContent = '';

    const resetCode   = document.getElementById('reset-code').value.trim();
    const newPassword = document.getElementById('reset-password').value;
    const confirm     = document.getElementById('reset-confirm').value;
    const email       = _state.pendingEmail || document.getElementById('forgot-email').value.trim();

    if (!resetCode || !newPassword) { errorEl.textContent = 'All fields are required.'; return; }
    if (newPassword !== confirm)    { errorEl.textContent = 'Passwords do not match.';   return; }
    if (newPassword.length < 6)     { errorEl.textContent = 'Password too short.';        return; }

    const btn = document.getElementById('reset-btn');
    btn.disabled = true; btn.textContent = 'Resetting…';

    try {
      const res  = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, resetCode, newPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        errorEl.textContent = data.error || 'Reset failed.';
        btn.disabled = false; btn.textContent = 'Reset Password';
        return;
      }

      _showTab('login');
      document.getElementById('login-error').style.color = 'var(--success, #4caf50)';
      document.getElementById('login-error').textContent = '✅ Password reset! You can now sign in.';
    } catch {
      errorEl.textContent = 'Network error. Please try again.';
      btn.disabled = false; btn.textContent = 'Reset Password';
    }
  }

  return { render, _showTab, _showForgot, _resendCode };
})();

