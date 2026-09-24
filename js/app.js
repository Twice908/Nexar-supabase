import { DataStore, OnboardingManager, setAuthToken, tryRefreshToken,
         supabaseAuthFetch, geocodeAddress, callMatchingEngine,
         parseAuthHash, clearAuthHash, isValidEmail } from './core.js';
import { toast, openSheet, openModal, toggleTheme, theme, escapeHtml } from './ui.js';
import { initPush } from './push.js';
import { LoginView, OnboardingView, HomeView, RidesView, ProfileView,
         NotificationsSheet, EditProfileModal, FinishProfileView,
         buildStartTimer, buildPickupCountdown, kmBetween,
         iconPhone, iconWhatsApp } from './views.js';
import { icons } from './ui.js';

class App {
  constructor() {
    this.store = new DataStore();
    this.onboarding = new OnboardingManager(this.store);
    this.currentUser = null;
    this.currentView = "login";
    this.activeTab = "home";
    this.busy = false;
    this._pollingHandle = null;
    this._lastRidesHash = "";
    this._lastNotifHash = "";
    this._tabJustChanged = false;
    this.rideMaps = new Map();

    // expose public handlers globally for onclick
    window.app = this;
    this.bind();
    this.installActionsMenuAutoClose();
    this.start();
  }

  bind() {
    // All onclick-accessible methods
        const methods = [
      'handleLogin','showOnboarding','showLogin','handleOnboarding','handleFinishProfile','logout',
      'switchTab','cancelAsDriver','cancelAsPassenger','refresh','startRide','completeRide',
      'toggleNotifications','markAllNotificationsRead','openNotification','refreshBellBadge',
      'openEditProfile','openNotifications','toggleTheme','handleEditProfileSave','markPickedUp','markDropped',
      'openCancelSheet','pickCancelReason','confirmCancelSheet','closeCancelSheet',
      'markArrived','markNoShow','handleArrivalPrompt',
      'pickStars', 'submitRating', 'overrideCarCommitment'
    ];
    methods.forEach((m) => {
  if (typeof this[m] === 'function') {
    this[m] = this[m].bind(this);
  } else {
    console.warn(`[App] bind skipped — method not found: ${m}`);
  }
});
  }

  async overrideCarCommitment(date, btn) {
    if (!confirm('Tell us you drove alone today? You\'ll be matched as a Nexar for the evening ride.')) return;
    this.setBtn(btn, 'Saving…');
    this.busy = true;
    try {
      await callMatchingEngine({
        action: 'overrideCarCommitment',
        userEmail: this.currentUser.email,
        date
      });
      await this.store.init();
      toast('You\'ll be matched as a Nexar for the evening ride', 'success');
      this.switchTab('rides');
    } catch (e) {
      toast(e.message, 'error');
      this.setBtn(btn, null);
    } finally {
      this.busy = false;
    }
  }

    // ============ timer ticker + auto-arrival ============
  startUiTicker() {
    if (this._uiTicker) return;
    this._uiTicker = setInterval(() => {
      this.tickTimers();
      this.checkAutoArrival();
    }, 1000);
  }

  stopUiTicker() {
    if (this._uiTicker) {
      clearInterval(this._uiTicker);
      this._uiTicker = null;
    }
    this._arrivalDwell = {};
  }

  // Recompute every timer pill in-place without a full re-render.
  tickTimers() {
    if (!this.currentUser || this.currentView !== 'dashboard') return;

    document.querySelectorAll('[data-timer]').forEach((el) => {
      const kind = el.dataset.timer;
      // Recompute the appropriate pill in place. Full re-render would flicker.
      if (kind === 'start') {
        // Find the ride this timer belongs to.
        const card = el.closest('.ride-card');
        if (!card) return;
        const ride = this._rideForCard(card);
        if (!ride) return;
        const fresh = document.createElement('div');
        fresh.innerHTML = buildStartTimer(ride);
        const replacement = fresh.querySelector('[data-timer="start"]');
        if (replacement) el.replaceWith(replacement);
      }
      if (kind === 'pickup') {
        const email = el.dataset.email;
        const card = el.closest('.ride-card');
        if (!card || !email) return;
        const ride = this._rideForCard(card);
        if (!ride) return;
        const fresh = document.createElement('div');
        fresh.innerHTML = buildPickupCountdown(ride, email);
        const replacement = fresh.querySelector('[data-timer="pickup"]');
        if (replacement) el.replaceWith(replacement);
      }

          // Detect expired pickup timers for rides where I'm the driver.
    const myActive = this.store.getRides().find(r =>
      r.driver === this.currentUser?.email && r.status === 'active'
    );
    if (!myActive) return;

    // Make sure only one sheet is open at a time. If a sheet is already open,
    // don't stack another one.
    const sheetRoot = document.getElementById('sheet-root');
    const sheetOpen = sheetRoot && sheetRoot.children.length > 0;

    for (const a of (myActive.pickupArrivals || [])) {
      const picked = (myActive.pickedUp || []).includes(a.email);
      const noShow = (myActive.noShows || []).some(n => n.email === a.email);
      if (picked || noShow) continue;

      const deadline = new Date(a.arrived_at).getTime() + 5 * 60 * 1000;
      if (Date.now() > deadline) {
        const key = `noshow|${myActive.id}|${a.email}`;
        if (!this._noshowPrompted) this._noshowPrompted = {};
        if (this._noshowPrompted[key]) continue;

        this._noshowPrompted[key] = true;
        if (!sheetOpen) this.openNoShowSheet(myActive.id, a.email);
        break; // one sheet at a time
      }
    }
      // 'arrival' updates are driven by pollTick (position changes)
    });
  }

  _rideForCard(cardEl) {
    const mapEl = cardEl.querySelector('[id^="ride-map-"]');
    if (mapEl) {
      const id = mapEl.id.replace('ride-map-', '');
      return this.store.getRides().find(r => r.id === id) || null;
    }
    return null;
  }

  // Auto-arrival: for each of my active rides as driver, check if I'm within
  // 50 m of a passenger pickup for >= 60 s, then markArrived automatically.
  checkAutoArrival() {
    if (this.busy || this.currentView !== 'dashboard' || !this.currentUser) return;
    if (!this._arrivalDwell) this._arrivalDwell = {};

    const myActive = this.store.getRides().find(r =>
      r.driver === this.currentUser.email && r.status === 'active'
    );
    if (!myActive || !myActive.currentPosition) return;

    const [meLat, meLng] = [myActive.currentPosition.lat, myActive.currentPosition.lng];
    const arrivals = myActive.pickupArrivals || [];

    (myActive.passengers || []).forEach(email => {
      if (arrivals.some(a => a.email === email)) return;
      const p = this.store.getUserByEmail(email);
      if (!p) return;
      const pickup = myActive.tripType === 'morning'
        ? [p.homeLat, p.homeLng]
        : [p.officeLat, p.officeLng];
      if (!pickup[0] || !pickup[1]) return;

      const km = kmBetween([meLat, meLng], pickup);
      const withinRadius = km <= 0.05; // 50 m
      const key = `${myActive.id}|${email}`;

      if (withinRadius) {
        if (!this._arrivalDwell[key]) this._arrivalDwell[key] = Date.now();
        if (Date.now() - this._arrivalDwell[key] >= 60 * 1000) {
          delete this._arrivalDwell[key];
          this.markArrived(myActive.id, email, null, true);
        }
      } else {
        delete this._arrivalDwell[key];
      }
    });
  }
    // Closes any open <details class="passenger-actions-menu"> when the user
  // clicks/taps outside of it. Uses capture phase so it runs before any
  // inline onclick handlers that might otherwise stop the event.
  installActionsMenuAutoClose() {
    const closeAll = (except) => {
      document.querySelectorAll('details.passenger-actions-menu[open]').forEach(d => {
        if (d !== except) d.removeAttribute('open');
      });
    };

    document.addEventListener('click', (e) => {
      const openMenu = e.target.closest('details.passenger-actions-menu');
      closeAll(openMenu);
    }, true);

    // Also close on scroll — otherwise a scrolled page leaves the popover
    // floating in the wrong place on mobile.
    window.addEventListener('scroll', () => closeAll(null), true);
  }

    async markArrived(rideId, passengerEmail, btn, isAuto = false) {
    if (btn) this.setBtn(btn, 'Marking…');
    try {
      await callMatchingEngine({
        action: 'markArrived',
        rideId,
        passengerEmail,
        source: isAuto ? 'gps' : 'manual'
      });
      await this.store.init();
      await this.store.loadNotifications(this.currentUser.email);
      if (!isAuto) this.switchTab('rides');
      else this.renderContentOnly();
    } catch (e) {
      if (btn) {
        this.setBtn(btn, null);
        toast(e.message, 'error');
      }
    }
  }

    openNoShowSheet(rideId, passengerEmail) {
    const p = this.store.getUserByEmail(passengerEmail);
    const name = p?.name || passengerEmail;
    const contactHTML = p?.mobile ? `
      <div class="passenger-contact-buttons" style="margin-bottom:var(--s-3);">
        <a href="${buildTelUrl(p.mobile)}" class="btn btn-secondary btn-sm">${iconPhone()}<span>Call ${escapeHtml(name)}</span></a>
        <a href="${buildWhatsAppUrl(p.mobile, `Hi ${name}, I'm waiting at the pickup point.`)}" target="_blank" class="btn btn-secondary btn-sm">${iconWhatsApp()}<span>WhatsApp</span></a>
      </div>` : '';

    const html = `
      <p class="cancel-sheet-hint">${escapeHtml(name)} hasn't shown up in 5 minutes. What would you like to do?</p>
      ${contactHTML}
      <div class="cancel-sheet-actions" style="flex-direction:column;">
        <button class="btn btn-primary btn-block" onclick="app.handleArrivalPrompt('${rideId}', '${passengerEmail}', 'picked')">Picked up</button>
        <button class="btn btn-danger btn-block" onclick="app.handleArrivalPrompt('${rideId}', '${passengerEmail}', 'leave')">Leave without ${escapeHtml(name)}</button>
        <button class="btn btn-secondary btn-block" onclick="app.closeCancelSheet()">Wait longer</button>
      </div>
    `;

    const rideIdClosure = rideId;
    const emailClosure = passengerEmail;

    const { close } = openSheet({
      title: 'Passenger not here',
      content: html,
      onClose: () => {
        // Re-arm so the prompt can fire again if the driver hits "Wait longer".
        const key = `noshow|${rideIdClosure}|${emailClosure}`;
        if (this._noshowPrompted) delete this._noshowPrompted[key];
      }
    });
    this._cancelSheetClose = close;
  }

  async handleArrivalPrompt(rideId, passengerEmail, mode) {
    this.closeCancelSheet();
    this.busy = true;
    try {
      if (mode === 'picked') {
        await callMatchingEngine({ action: 'markPickedUp', rideId, passengerEmail });
      } else if (mode === 'leave') {
        await callMatchingEngine({ action: 'markNoShow', rideId, passengerEmail });
      }
      await this.store.init();
      await this.store.loadNotifications(this.currentUser.email);
      this.switchTab('rides');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      this.busy = false;
    }
  }

  // ============ router ============
    render() {
    const root = document.getElementById('root');

    // currentView is owned exclusively by start(), handleLogin(),
    // handleOnboarding(), handleFinishProfile(), showLogin(), and logout().
    // render() must NOT override it based on session state — doing so was
    // forcing every view back to 'onboarding' whenever an authenticated user
    // had no profile row yet (the exact state right after email confirmation).
    if (!this.currentView) this.currentView = 'login';

    this.destroyRideMaps();

        if (this.currentView === 'login') {
      root.innerHTML = LoginView({
        banner: this._loginBanner,
        prefillEmail: this._prefillEmail
      });
      this._loginBanner = null;
      this._prefillEmail = null;
    }
    else if (this.currentView === 'onboarding') {
      root.innerHTML = OnboardingView();
      document.getElementById('onboardingForm').addEventListener('submit', e => { e.preventDefault(); this.handleOnboarding(); });
    }
    else if (this.currentView === 'finish_profile') {
      root.innerHTML = FinishProfileView({
        pending: this._pendingProfile || {},
        email: (this.currentUser && this.currentUser.email) || ''
      });
      document.getElementById('finishProfileForm').addEventListener('submit', e => {
        e.preventDefault();
        this.handleFinishProfile();
      });
    }
    else {
      root.innerHTML = this.dashboardHtml();
      this.attachDashboardHandlers();
      const content = document.getElementById("appContent");
      if (content && this._tabJustChanged) {
        content.classList.add("tab-enter");
        this._tabJustChanged = false;
      }
      if (this.activeTab === "rides") this.mountRideMaps();
      if (this.activeTab === "home") this.hydrateRideCards();
    }
  }

    // ——— Pending signup (survives email confirmation round-trip) ———
  savePendingSignup(email, data) {
    try {
      localStorage.setItem('nexar_pending_signup', JSON.stringify({
        email, data, savedAt: Date.now()
      }));
    } catch {}
  }

  getPendingSignup(email) {
    try {
      const raw = localStorage.getItem('nexar_pending_signup');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.email !== email) return null;
      if (Date.now() - (parsed.savedAt || 0) > 24 * 60 * 60 * 1000) {
        localStorage.removeItem('nexar_pending_signup');
        return null;
      }
      return parsed.data;
    } catch { return null; }
  }

  clearPendingSignup() {
    try { localStorage.removeItem('nexar_pending_signup'); } catch {}
  }

    // ============ ratings ============
  pickStars(rideId, rateeEmail, stars, btn) {
    // Highlight the chosen stars, reveal the comment box.
    const row = document.querySelector(`[data-star-target="${rideId}|${rateeEmail}"]`);
    if (row) {
      row.querySelectorAll('.star-btn').forEach(b => {
        const n = parseInt(b.dataset.stars, 10);
        b.style.color = n <= stars ? '#f59e0b' : 'var(--text-tertiary)';
      });
      row.dataset.chosenStars = String(stars);
    }
    const commentRow = document.querySelector(`[data-comment-for="${rideId}|${rateeEmail}"]`);
    if (commentRow) commentRow.style.display = 'block';
  }

  async submitRating(rideId, rateeEmail, btn) {
    const row = document.querySelector(`[data-star-target="${rideId}|${rateeEmail}"]`);
    const stars = row ? parseInt(row.dataset.chosenStars || '0', 10) : 0;
    if (!stars) {
      toast('Pick a star rating first', 'error');
      return;
    }
    const commentInput = document.querySelector(`[data-comment-input="${rideId}|${rateeEmail}"]`);
    const comment = commentInput ? commentInput.value.trim() : '';

    this.busy = true;
    this.setBtn(btn, 'Submitting…');
    try {
      await callMatchingEngine({
        action: 'submitRating',
        rideId,
        raterEmail: this.currentUser.email,
        rateeEmail,
        stars,
        comment
      });
      await this.store.init();
      this.switchTab('rides');
    } catch (e) {
      toast(e.message, 'error');
      this.setBtn(btn, null);
    } finally {
      this.busy = false;
    }
  }

  dashboardHtml() {
    const unread = (this.store.getNotifications() || []).filter(
      (n) => !n.read,
    ).length;
    const user = this.currentUser;
    const tabContent =
      this.activeTab === "home"
        ? HomeView({
            user,
            rides: this.store.getRides(),
            notifications: this.store.getNotifications(),
          })
        : this.activeTab === "rides"
          ? RidesView({ user, rides: this.store.getRides() })
          : ProfileView({ user });

    return `
      <div class="app-shell">
        <header class="topbar">
          <img class="topbar-logo logo-light-theme" src="assets/logo-short-dark.svg" alt="Nexar">
          <img class="topbar-logo logo-dark-theme"  src="assets/logo-short-white.svg" alt="Nexar">
          <div class="topbar-actions">
            <button class="icon-btn" onclick="app.toggleNotifications()" aria-label="Notifications">
              ${icons.bell}
              ${unread > 0 ? `<span class="badge">${unread > 9 ? "9+" : unread}</span>` : ""}
            </button>
            <button class="avatar-btn" onclick="app.switchTab('profile')" aria-label="Profile">
              ${(user.name || "?").trim()[0].toUpperCase()}
            </button>
          </div>
        </header>
        <main class="app-content" id="appContent">${tabContent}</main>
        <nav class="bottom-nav">
          <button class="nav-item ${this.activeTab === "home" ? "is-active" : ""}" onclick="app.switchTab('home')">
            ${icons.home}<span>Home</span>
          </button>
          <button class="nav-item ${this.activeTab === "rides" ? "is-active" : ""}" onclick="app.switchTab('rides')">
            ${icons.car}<span>Rides</span>
          </button>
          <button class="nav-item ${this.activeTab === "profile" ? "is-active" : ""}" onclick="app.switchTab('profile')">
            ${icons.user}<span>Profile</span>
          </button>
        </nav>
      </div>
    `;
  }

  attachDashboardHandlers() {
    // nothing extra right now, all onclick-based
  }

  switchTab(tab) {
    if (tab === this.activeTab) return;
    this.activeTab = tab;
    this._tabJustChanged = true;
    this.render();
  }

  // ============ auth ============
    async start() {
    // 1. Auth tokens in URL fragment (from email confirmation link)
    const authHash = parseAuthHash();
    if (authHash && authHash.accessToken && authHash.email) {
      setAuthToken(authHash.accessToken);
      this.store.saveSession({
        loggedIn: true,
        email: authHash.email,
        authId: authHash.authId,
        accessToken: authHash.accessToken,
        refreshToken: authHash.refreshToken || '',
        loginTime: new Date().toISOString()
      });
      clearAuthHash();

      try {
        await this.store.init();
        await this.store.loadNotifications(authHash.email);
      } catch (e) {
        console.error('Post-confirm init failed:', e);
        this.store.clearSession();
        setAuthToken(null);
        this.currentView = 'login';
        this.render();
        return;
      }

      const user = this.store.getUserByEmail(authHash.email);
      if (user) {
        this.currentUser = user;
        this.currentView = 'dashboard';
        this.activeTab = 'home';
        this.render();
        this.startPolling();
        return;
      }

      // Authenticated but no profile row — user needs to finish onboarding.
      this.currentUser = { email: authHash.email, authId: authHash.authId };
      this._pendingProfile = this.getPendingSignup(authHash.email) || {};
      this.currentView = 'finish_profile';
      this.render();
      return;
    }

    // 2. Saved session from a previous visit
    const session = this.store.getSession();
    if (session.loggedIn && session.accessToken) {
      setAuthToken(session.accessToken);
      let ok = false;
      try {
        await this.store.init();
        await this.store.loadNotifications(session.email);
        ok = true;
      } catch {
        if (await tryRefreshToken(this.store)) {
          try {
            await this.store.init();
            await this.store.loadNotifications(session.email);
            ok = true;
          } catch {}
        }
      }

      if (ok) {
        const user = this.store.getUserByEmail(session.email);
        if (user) {
          this.currentUser = user;
          this.currentView = 'dashboard';
          this.activeTab = 'home';
          this.render();
          this.startPolling();
          return;
        }
        // Authenticated but no profile row — same finish flow.
        this.currentUser = { email: session.email, authId: session.authId };
        this._pendingProfile = this.getPendingSignup(session.email) || {};
        this.currentView = 'finish_profile';
        this.render();
        return;
      }

      this.store.clearSession();
      setAuthToken(null);
    }

    // 3. Not authenticated
    this.currentView = 'login';
    this.render();
  }

  async handleLogin() {
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const err = document.getElementById("loginError");
    err.innerHTML = "";
    if (!isValidEmail(email)) {
      err.innerHTML =
        '<div class="alert alert-error">Enter a valid email address</div>';
      return;
    }
    if (!password) {
      err.innerHTML =
        '<div class="alert alert-error">Enter email and password</div>';
      return;
    }
    try {
      const auth = await supabaseAuthFetch("token?grant_type=password", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setAuthToken(auth.access_token);
      await this.store.init();
      await this.store.loadNotifications(email);
      const user = this.store.getUserByEmail(email);
      this.store.saveSession({
        loggedIn: true,
        email,
        accessToken: auth.access_token,
        refreshToken: auth.refresh_token,
        authId: auth.user.id,
        loginTime: new Date().toISOString(),
      });
        if (!user) {
        this.currentUser = { email, authId: auth.user.id };
        this._pendingProfile = this.getPendingSignup(email) || {};
        this.currentView = 'finish_profile';
        this.render();
        return;
      }
      this.currentUser = user;
      this.currentView = "dashboard";
      this.activeTab = "home";
      this.render();
      this.startPolling();
    } catch (e) {
      err.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
    }
  }

  showOnboarding() {
    this.currentView = "onboarding";
    this.currentUser = {};
    this.render();
  }
  showLogin() {
    this.currentView = "login";
    this.render();
  }

  async handleOnboarding() {
    const data = {
      name: document.getElementById('name').value,
      email: document.getElementById('email').value.trim(),
      mobile: document.getElementById('mobile').value,
      homeZone: document.getElementById('homeZone').value,
      officeAddress: document.getElementById('officeAddress').value,
      officeEntryTime: document.getElementById('officeEntryTime').value,
      officeExitTime: document.getElementById('officeExitTime').value,
      carCompany: document.getElementById('carCompany').value,
      carModel: document.getElementById('carModel').value,
      carNumber: document.getElementById('carNumber').value.toUpperCase(),
      vacantSeats: parseInt(document.getElementById('vacantSeats').value)
    };
    const password = document.getElementById('password').value;
    const errEl = document.getElementById('onboardingError');
    errEl.innerHTML = '';

    const errs = this.onboarding.validateUserData(data);
    if (!password || password.length < 6) errs.push('Password must be at least 6 characters');
    if (errs.length) {
      errEl.innerHTML = `<div class="alert alert-error">${errs.join('<br>')}</div>`;
      return;
    }

    const btn = document.getElementById('onboardBtn');
    btn.disabled = true;
    btn.textContent = 'Creating account…';

    // Persist BEFORE signup so it survives the email round-trip.
    this.savePendingSignup(data.email, data);

    try {
      // Geocode (best-effort — a failure here doesn't block signup).
      const homeC = await geocodeAddress(data.homeZone).catch(() => null);
      if (homeC) { data.homeLat = homeC.lat; data.homeLng = homeC.lng; }
      await new Promise(r => setTimeout(r, 900));
      const officeC = await geocodeAddress(data.officeAddress).catch(() => null);
      if (officeC) { data.officeLat = officeC.lat; data.officeLng = officeC.lng; }
      this.savePendingSignup(data.email, data);

      const auth = await supabaseAuthFetch(
        'signup?redirect_to=' + encodeURIComponent('https://twice908.github.io/Nexar-supabase/'),
        {
          method: 'POST',
          body: JSON.stringify({ email: data.email, password })
        }
      );

      // Case A — email confirmation required. No session yet.
      if (!auth.access_token) {
        errEl.innerHTML = `<div class="alert alert-success">
          Account created. Check your inbox at <strong>${escapeHtml(data.email)}</strong> —
          click the confirmation link to finish your profile.
        </div>`;
        btn.disabled = false;
        btn.textContent = 'Create account';
        return;
      }

      // Case B — signup returned a session immediately (email confirmation disabled).
      setAuthToken(auth.access_token);
      const user = await this.onboarding.saveUser({ ...data, authId: auth.user.id });
      this.store.saveSession({
        loggedIn: true,
        email: user.email,
        authId: auth.user.id,
        accessToken: auth.access_token,
        refreshToken: auth.refresh_token,
        loginTime: new Date().toISOString()
      });
      this.clearPendingSignup();
      await this.store.init();
      await this.store.loadNotifications(user.email);
      this.currentUser = this.store.getUserByEmail(user.email) || user;
      this.currentView = 'dashboard';
      this.activeTab = 'home';
      this.render();
      this.startPolling();
    } catch (e) {
      const msg = (e.message || '').toLowerCase();
      const isAlreadyRegistered =
        msg.includes('already registered') ||
        msg.includes('already exists') ||
        msg.includes('user already');

      if (isAlreadyRegistered) {
        // Bounce to login with a friendly banner and pre-filled email.
        this._loginBanner = 'This email is already registered. Sign in to continue.';
        this._prefillEmail = data.email;
        this.currentView = 'login';
        this.render();
        return;
      }

      errEl.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
      btn.disabled = false;
      btn.textContent = 'Create account';
    }
  }

    async handleFinishProfile() {
    const btn = document.getElementById('finishProfileBtn');
    const errEl = document.getElementById('finishProfileError');
    errEl.innerHTML = '';

    const session = this.store.getSession();
    const email = (this.currentUser && this.currentUser.email) || session.email;
    const authId = (this.currentUser && this.currentUser.authId) || session.authId;

    const data = {
      email,
      authId,
      name: document.getElementById('fpName').value,
      mobile: document.getElementById('fpMobile').value,
      homeZone: document.getElementById('fpHomeZone').value,
      officeAddress: document.getElementById('fpOfficeAddress').value,
      officeEntryTime: document.getElementById('fpOfficeEntryTime').value,
      officeExitTime: document.getElementById('fpOfficeExitTime').value,
      carCompany: document.getElementById('fpCarCompany').value,
      carModel: document.getElementById('fpCarModel').value,
      carNumber: document.getElementById('fpCarNumber').value.toUpperCase(),
      vacantSeats: parseInt(document.getElementById('fpVacantSeats').value)
    };

    const errs = this.onboarding.validateUserData(data);
    if (errs.length) {
      errEl.innerHTML = `<div class="alert alert-error">${errs.join('<br>')}</div>`;
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const homeC = await geocodeAddress(data.homeZone).catch(() => null);
      if (homeC) { data.homeLat = homeC.lat; data.homeLng = homeC.lng; }
      const officeC = await geocodeAddress(data.officeAddress).catch(() => null);
      if (officeC) { data.officeLat = officeC.lat; data.officeLng = officeC.lng; }

      const user = await this.store.saveUser(data);
      this.clearPendingSignup();

      await this.store.init();
      await this.store.loadNotifications(user.email);
      this.currentUser = this.store.getUserByEmail(user.email) || user;
      this._pendingProfile = null;
      this.currentView = 'dashboard';
      this.activeTab = 'home';
      this.render();
      this.startPolling();
    } catch (e) {
      errEl.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
      btn.disabled = false;
      btn.textContent = 'Save profile';
    }
  }

  logout() {
    this.destroyRideMaps();
    this.stopPositionWatcher();
    this.stopUiTicker();
    this.store.clearSession();
    setAuthToken(null);
    this.currentUser = null;
    this.currentView = "login";
    this.render();
  }

  // ============ ride actions ============
  setBtn(btn, text, disabled = true) {
    if (!btn) return;
    if (text) {
      btn.dataset._t = btn.textContent;
      btn.textContent = text;
      btn.disabled = disabled;
    } else {
      btn.textContent = btn.dataset._t || btn.textContent;
      btn.disabled = false;
    }
  }

    // ============ cancellation with reason ============
  openCancelSheet(rideId, role) {
    // role: 'driver' | 'passenger'
    const reasons = role === 'driver'
      ? [
          ['cant_drive', "Can't drive today"],
          ['car_issue', 'Car issue'],
          ['running_late', 'Running late'],
          ['emergency', 'Personal emergency'],
          ['other', 'Other'],
        ]
      : [
          ['plans_changed', 'Plans changed'],
          ['wfh', 'Working from home'],
          ['alternate_transport', 'Found alternate transport'],
          ['running_late', 'Running late'],
          ['other', 'Other'],
        ];

    const html = `
      <div id="cancelSheet" class="cancel-sheet">
        <p class="cancel-sheet-hint">Help us understand why you're cancelling.</p>
        <div class="cancel-reason-list">
          ${reasons.map(([id, label]) => `
            <button class="cancel-reason-btn" data-reason-id="${id}"
              onclick="app.pickCancelReason('${id}')">${escapeHtml(label)}</button>
          `).join('')}
        </div>
        <div id="cancelCustomWrap" class="cancel-custom" style="display:none;">
          <textarea id="cancelCustomText" class="field-textarea" rows="2" maxlength="200" placeholder="Tell us more (optional)"></textarea>
        </div>
        <div id="cancelSheetError" class="error"></div>
        <div class="cancel-sheet-actions">
          <button class="btn btn-secondary btn-sm" onclick="app.closeCancelSheet()">Keep ride</button>
          <button class="btn btn-danger btn-sm" id="cancelConfirmBtn" disabled
            onclick="app.confirmCancelSheet('${rideId}', '${role}')">Confirm cancel</button>
        </div>
      </div>
    `;

    const { close } = openSheet({ title: 'Cancel ride', content: html });
    this._cancelSheetClose = close;
    this._cancelSheetState = { reasonId: null, role };
  }

  pickCancelReason(reasonId) {
    if (!this._cancelSheetState) return;
    this._cancelSheetState.reasonId = reasonId;

    document.querySelectorAll('.cancel-reason-btn').forEach(b => {
      const isThis = b.dataset.reasonId === reasonId;
      b.classList.toggle('is-picked', isThis);
    });

    const customWrap = document.getElementById('cancelCustomWrap');
    if (customWrap) {
      customWrap.style.display = (reasonId === 'other') ? 'block' : 'none';
    }

    const confirmBtn = document.getElementById('cancelConfirmBtn');
    if (confirmBtn) confirmBtn.disabled = false;
  }

  closeCancelSheet() {
    if (this._cancelSheetClose) {
      this._cancelSheetClose();
      this._cancelSheetClose = null;
    }
    this._cancelSheetState = null;
  }

  async confirmCancelSheet(rideId, role) {
    if (!this._cancelSheetState || !this._cancelSheetState.reasonId) return;

    const reasonId = this._cancelSheetState.reasonId;
    let custom = '';
    if (reasonId === 'other') {
      const el = document.getElementById('cancelCustomText');
      custom = el ? el.value.trim() : '';
      if (!custom) {
        const errEl = document.getElementById('cancelSheetError');
        if (errEl) { errEl.textContent = 'Please describe your reason.'; errEl.classList.add('show'); }
        return;
      }
    }
    // Encoded as "reason_id: custom_text"
    const reason = custom ? `${reasonId}: ${custom}` : reasonId;

    const btn = document.getElementById('cancelConfirmBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Cancelling…'; }

    this.busy = true;
    try {
      if (role === 'driver') {
        await callMatchingEngine({ action: 'cancelDriver', rideId, reason });
      } else {
        await callMatchingEngine({
          action: 'cancelPassenger',
          rideId,
          passengerEmail: this.currentUser.email,
          reason
        });
      }
      this.closeCancelSheet();
      await this.store.init();
      await this.store.loadNotifications(this.currentUser.email);
      this.switchTab('rides');
      toast('Ride cancelled', 'success');
    } catch (e) {
      const errEl = document.getElementById('cancelSheetError');
      if (errEl) { errEl.textContent = e.message; errEl.classList.add('show'); }
      if (btn) { btn.disabled = false; btn.textContent = 'Confirm cancel'; }
    } finally {
      this.busy = false;
    }
  }

  // Wrappers so existing onclick handlers still resolve.
  cancelAsDriver(rideId) {
    this.openCancelSheet(rideId, 'driver');
  }
  cancelAsPassenger(rideId) {
    this.openCancelSheet(rideId, 'passenger');
  }

    // Immediately toggles the two action buttons in the DOM so the driver
  // doesn't wait for the next poll cycle before seeing the state change.
  flipPassengerButtons(rideId, passengerEmail, newState /* 'picked' | 'dropped' */) {
    const onboardBtn = document.querySelector(`[data-pickup-btn="${rideId}|${passengerEmail}"]`);
    const dropBtn = document.querySelector(`[data-drop-btn="${rideId}|${passengerEmail}"]`);

    if (newState === 'picked') {
      if (onboardBtn) { onboardBtn.disabled = true; onboardBtn.textContent = 'Onboarded'; }
      if (dropBtn) dropBtn.disabled = false;
      // Update the sibling status pill if we can find it
      const row = onboardBtn ? onboardBtn.closest('.passenger-row') : null;
      if (row) {
        const pill = row.querySelector('.pill');
        if (pill) {
          pill.className = 'pill pill-info';
          pill.style.fontSize = '10px';
          pill.style.padding = '2px 7px';
          pill.innerHTML = '<span class="dot"></span>On board';
        }
      }
    } else if (newState === 'dropped') {
      if (dropBtn) { dropBtn.disabled = true; dropBtn.textContent = 'Dropped ✓'; }
      if (onboardBtn) onboardBtn.disabled = true;
      const row = dropBtn ? dropBtn.closest('.passenger-row') : null;
      if (row) {
        const pill = row.querySelector('.pill');
        if (pill) {
          pill.className = 'pill pill-success';
          pill.style.fontSize = '10px';
          pill.style.padding = '2px 7px';
          pill.innerHTML = '<span class="dot"></span>Dropped';
        }
      }
    }
  }

  async markPickedUp(rideId, passengerEmail, btn) {
    // 1. Optimistic flip so the UI is instant.
    this.flipPassengerButtons(rideId, passengerEmail, 'picked');

    this.busy = true;
    try {
      await callMatchingEngine({ action: 'markPickedUp', rideId, passengerEmail });
      // Silent refresh — don't re-render the whole tab, just sync cache.
      await this.store.init();
      await this.store.loadNotifications(this.currentUser.email);
    } catch (e) {
      toast(e.message, 'error');
      // Re-render to restore the correct state on failure.
      this.switchTab('rides');
    } finally {
      this.busy = false;
    }
  }

  async markDropped(rideId, passengerEmail, btn) {
    if (!confirm('Mark this passenger as dropped off?')) return;

    // 1. Optimistic flip.
    this.flipPassengerButtons(rideId, passengerEmail, 'dropped');

    this.busy = true;

    // Try to capture GPS; timeout + silent fallback.
    let lat = null, lng = null;
    try {
      const pos = await new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('no geolocation'));
        const t = setTimeout(() => reject(new Error('timeout')), 4000);
        navigator.geolocation.getCurrentPosition(
          (p) => { clearTimeout(t); resolve(p); },
          (e) => { clearTimeout(t); reject(e); },
          { enableHighAccuracy: true, timeout: 4000, maximumAge: 30000 }
        );
      });
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch { /* proceed without coords */ }

    try {
      await callMatchingEngine({ action: 'markDropped', rideId, passengerEmail, lat, lng });
      await this.store.init();
      await this.store.loadNotifications(this.currentUser.email);
    } catch (e) {
      toast(e.message, 'error');
      this.switchTab('rides');
    } finally {
      this.busy = false;
    }
  }

  async startRide(rideId, btn) {
    if (!confirm("Start the ride? Passengers will be notified.")) return;
    this.busy = true;
    this.setBtn(btn, "Starting…");
    try {
      await callMatchingEngine({ action: "startRide", rideId });
      await this.store.init();
      await this.store.loadNotifications(this.currentUser.email);
      this.switchTab("rides");
    } catch (e) {
      toast(e.message, "error");
      this.setBtn(btn, null);
    } finally {
      this.busy = false;
    }
  }

  async completeRide(rideId, btn) {
    if (!confirm("Mark the ride as completed?")) return;
    this.busy = true;
    this.setBtn(btn, "Completing…");
    try {
      await callMatchingEngine({ action: "completeRide", rideId });
      await this.store.init();
      await this.store.loadNotifications(this.currentUser.email);
      this.switchTab("rides");
    } catch (e) {
      toast(e.message, "error");
      this.setBtn(btn, null);
    } finally {
      this.busy = false;
    }
  }

  async refresh(btn) {
    this.busy = true;
    this.setBtn(btn, "↻");
    try {
      await this.store.init();
      await this.store.loadNotifications(this.currentUser.email);
      this.switchTab("rides");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      this.busy = false;
    }
  }

    // ============ live position ============
  startPositionWatcher() {
    if (this._positionWatcher) return;
    if (!navigator.geolocation) return;

    const tick = async () => {
      if (this.busy || this.currentView !== 'dashboard' || !this.currentUser) return;

      const myActiveRide = this.store.getRides().find(r =>
        r.driver === this.currentUser.email && r.status === 'active'
      );
      if (!myActiveRide) return;

      try {
        const pos = await new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('timeout')), 5000);
          navigator.geolocation.getCurrentPosition(
            (p) => { clearTimeout(t); resolve(p); },
            (e) => { clearTimeout(t); reject(e); },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 }
          );
        });

        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        // Don't bother the server if we haven't moved meaningfully (> 20 m).
        const last = myActiveRide.currentPosition;
        if (last) {
          const dLat = (lat - last.lat) * 111000;
          const dLng = (lng - last.lng) * 111000 * Math.cos(lat * Math.PI / 180);
          if (Math.hypot(dLat, dLng) < 20) return;
        }

        // Optimistically update local cache so the driver's own map moves instantly.
        myActiveRide.currentPosition = { lat, lng, at: new Date().toISOString() };

        await callMatchingEngine({
          action: 'updatePosition',
          rideId: myActiveRide.id,
          driverEmail: this.currentUser.email,
          lat, lng
        });
      } catch { /* skip this tick */ }
    };

    // Fire once immediately, then every 15 seconds.
    tick();
    this._positionWatcher = setInterval(tick, 15000);
  }

  stopPositionWatcher() {
    if (this._positionWatcher) {
      clearInterval(this._positionWatcher);
      this._positionWatcher = null;
    }
  }
  // ============ notifications ============
  toggleNotifications() {
    this.openNotifications();
  }
  openNotifications() {
    const html = NotificationsSheet(this.store.getNotifications());
    openSheet({ title: "Notifications", content: html });
  }
  async markAllNotificationsRead() {
    try {
      await this.store.markAllNotificationsRead(this.currentUser.email);
      toast("All caught up", "success");
      this.render();
    } catch (e) {
      toast(e.message, "error");
    }
  }
  async openNotification(id, rideId) {
    try {
      await this.store.markNotificationRead(id);
    } catch {}
    if (rideId) {
      this.switchTab("rides");
    } else {
      this.render();
    }
  }
  refreshBellBadge() {
    /* re-rendered by render() */
  }

  // ============ profile ============
  openEditProfile() {
    const { el } = openModal({
      title: "Edit profile",
      content: EditProfileModal(this.currentUser),
    });
    el.querySelector("#editProfileForm").addEventListener("submit", (e) => {
      e.preventDefault();
      this.handleEditProfileSave(el);
    });
  }

  async handleEditProfileSave(modalEl) {
    const updated = {
      ...this.currentUser,
      name: modalEl.querySelector("#editName").value,
      mobile: modalEl.querySelector("#editMobile").value,
      homeZone: modalEl.querySelector("#editHomeZone").value,
      officeAddress: modalEl.querySelector("#editOfficeAddress").value,
      officeEntryTime: modalEl.querySelector("#editOfficeEntryTime").value,
      officeExitTime: modalEl.querySelector("#editOfficeExitTime").value,
      carCompany: modalEl.querySelector("#editCarCompany").value,
      carModel: modalEl.querySelector("#editCarModel").value,
      carNumber: modalEl.querySelector("#editCarNumber").value.toUpperCase(),
      vacantSeats: parseInt(modalEl.querySelector("#editVacantSeats").value),
      updatedAt: new Date().toISOString(),
    };
    const errEl = modalEl.querySelector("#editProfileError");
    const errs = this.onboarding.validateUserData(updated);
    if (errs.length) {
      errEl.innerHTML = `<div class="alert alert-error">${errs.join("<br>")}</div>`;
      return;
    }

    const btn = modalEl.querySelector("#editProfileBtn");
    btn.disabled = true;
    btn.textContent = "Saving…";

    try {
      const homeC = await geocodeAddress(updated.homeZone).catch(() => null);
      if (homeC) {
        updated.homeLat = homeC.lat;
        updated.homeLng = homeC.lng;
      }
      const officeC = await geocodeAddress(updated.officeAddress).catch(
        () => null,
      );
      if (officeC) {
        updated.officeLat = officeC.lat;
        updated.officeLng = officeC.lng;
      }

      const saved = await this.store.saveUser(updated);
      this.currentUser = saved;
      toast("Profile saved", "success");
      this.render();
    } catch (e) {
      errEl.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
      btn.disabled = false;
      btn.textContent = "Save changes";
    }
  }

  toggleTheme(el) {
    toggleTheme();
    const isDark = theme() === "dark";
    el.setAttribute("aria-checked", String(isDark));
    const sub = el.closest(".card-row").querySelector(".card-row-sub");
    if (sub) sub.textContent = isDark ? "On" : "Off";
  }

  // ============ polling ============
    startPolling() {
    if (this._pollingHandle) return;
    this._pollingHandle = setInterval(() => this.pollTick(), 30000);
    if (this.currentUser?.email) initPush(this.currentUser.email);
    this.startPositionWatcher();
    this.startUiTicker();
  }
  async pollTick() {
    if (this.busy || this.currentView !== "dashboard" || !this.currentUser)
      return;
    try {
      const prevHash = this._lastRidesHash;
      await this.store.init();
      await this.store.loadNotifications(this.currentUser.email);
      const user = this.store.getUserByEmail(this.currentUser.email);
      if (user) this.currentUser = user;

      const ridesHash = this.ridesHash();

      // Was the only difference in the position bucket? If so, avoid a full
      // re-render and just nudge the marker.
      const stripPosition = (s) => s.replace(/:[^:|]*$/, '');
      this._positionOnlyChange =
        prevHash && stripPosition(prevHash) === stripPosition(ridesHash);
      const notifHash = this.notifHash();

      // Update bell badge in-place if only notifications changed.
      if (notifHash !== this._lastNotifHash) {
        this._lastNotifHash = notifHash;
        this.updateBellBadge();
      }

      // Only touch the content DOM if the current tab's data actually changed.
      if (this.activeTab === "rides" && ridesHash !== this._lastRidesHash) {
        // If ONLY the driver position changed, patch the map in-place rather
        // than tearing down and re-mounting the whole card (which flickers).
        const positionOnlyChanged = this._positionOnlyChange;
        this._lastRidesHash = ridesHash;
        if (positionOnlyChanged && this.activeTab === 'rides') {
          this.store.getRides().forEach(r => {
            if (r.status === 'active') this.refreshDriverMarker(r.id);
          });
        } else {
          this.renderContentOnly();
        }
      } else if (
        this.activeTab === "home" &&
        ridesHash !== this._lastRidesHash
      ) {
        this._lastRidesHash = ridesHash;
        this.renderContentOnly();
      }
      // Profile tab has no polling-driven state → never re-render from poll.
    } catch (e) {
      if (String(e.message).includes("401")) {
        if (!(await tryRefreshToken(this.store))) this.logout();
      }
    }
  }

    // Cheap redraw of a single ride's driver marker. Called from pollTick when
  // position changed but nothing else did.
  refreshDriverMarker(rideId) {
    const map = this.rideMaps.get(rideId);
    if (!map) return;
    const ride = this.store.getRides().find(r => r.id === rideId);
    if (!ride || !ride.currentPosition) return;

    const pos = [ride.currentPosition.lat, ride.currentPosition.lng];
    if (this._driverMarkers?.get(rideId)) {
      this._driverMarkers.get(rideId).setLatLng(pos);
    } else {
      if (!this._driverMarkers) this._driverMarkers = new Map();
      const marker = L.circleMarker(pos, {
        radius: 10,
        color: '#fff',
        weight: 3,
        fillColor: '#2563eb',
        fillOpacity: 1
      }).addTo(map).bindPopup('<b>Nexar — live</b>');
      this._driverMarkers.set(rideId, marker);
    }

    // Extend the drawn route with the live history.
    const hist = (ride.positionHistory || []).map(p => [p.lat, p.lng]);
    if (this._driverTracks?.get(rideId)) {
      this._driverTracks.get(rideId).setLatLngs(hist);
    } else {
      if (!this._driverTracks) this._driverTracks = new Map();
      const line = L.polyline(hist, {
        color: '#2563eb',
        weight: 3,
        opacity: 0.9
      }).addTo(map);
      this._driverTracks.set(rideId, line);
    }
  }

    ridesHash() {
    const ratingKey = (this.store.getRatings() || [])
      .map(r => `${r.rideId}:${r.raterEmail}:${r.rateeEmail}:${r.stars}`)
      .sort()
      .join(',');
    return this.store
      .getRides()
      .map((r) => {        // Include a coarse position bucket so we re-render when the driver
        // moves but not on every tiny GPS jitter.
        const pos = r.currentPosition;
        const posKey = pos
          ? `${pos.lat.toFixed(3)}_${pos.lng.toFixed(3)}`
          : '-';
        return `${r.id}:${r.status}:${(r.passengers || []).length}:${r.driver}:${r.startedAt || ""}:${r.completedAt || ""}:${r.cancelledAt || ""}:${posKey}`;
      })
      .sort()
      .join("|") + '||R||' + ratingKey;
  }

  notifHash() {
    const n = this.store.getNotifications() || [];
    return `${n.length}:${n.filter((x) => !x.read).length}`;
  }

  updateBellBadge() {
    const btn = document.querySelector(
      'button[onclick="app.toggleNotifications()"]',
    );
    if (!btn) return;
    const unread = (this.store.getNotifications() || []).filter(
      (n) => !n.read,
    ).length;
    let badge = btn.querySelector(".badge");
    if (unread > 0) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "badge";
        btn.appendChild(badge);
      }
      badge.textContent = unread > 9 ? "9+" : unread;
    } else if (badge) {
      badge.remove();
    }
  }

  // Re-render only the tab content, not the shell (topbar/nav stay put).
  renderContentOnly() {
    const content = document.getElementById("appContent");
    if (!content) return;
    this.destroyRideMaps();
    const user = this.currentUser;
    content.innerHTML =
      this.activeTab === "home"
        ? HomeView({
            user,
            rides: this.store.getRides(),
            notifications: this.store.getNotifications(),
          })
        : this.activeTab === "rides"
          ? RidesView({ user, rides: this.store.getRides() })
          : ProfileView({ user });
    if (this.activeTab === "rides") this.mountRideMaps();
    if (this.activeTab === "home") this.hydrateRideCards();
  }

  // ============ maps ============
  destroyRideMaps() {
    this.rideMaps.forEach((m) => {
      try {
        m.remove();
      } catch {}
    });
    this.rideMaps.clear();
    this._driverMarkers?.clear();
    this._driverTracks?.clear();
  }

  mountRideMaps() {
    if (typeof L === "undefined") return;
    const user = this.currentUser;
    const rides = this.store
      .getRides()
      .filter(
        (r) => r.driver === user.email || r.passengers.includes(user.email),
      );

    rides.forEach((ride) => {
      if (ride.status === "no match" || ride.status === "cancelled") return;
      const el = document.getElementById(`ride-map-${ride.id}`);
      if (!el) return;
      const driver = this.store.getUserByEmail(ride.driver);
      if (!driver) return;

      const valid = (p) =>
        Array.isArray(p) &&
        typeof p[0] === "number" &&
        typeof p[1] === "number";
      const isMorning = ride.tripType === "morning";
      const dH = [driver.homeLat, driver.homeLng];
      const dO = [driver.officeLat, driver.officeLng];
      const start = isMorning ? dH : dO;
      const end = isMorning ? dO : dH;
      if (!valid(start) || !valid(end)) {
        el.innerHTML =
          '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:13px;">Map unavailable — missing coordinates</div>';
        return;
      }

      try {
        const map = L.map(el, {
          zoomControl: false,
          scrollWheelZoom: false,
          attributionControl: true,
        });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap",
        }).addTo(map);

        const pts = [start];
        L.circleMarker(start, {
          radius: 8,
          color: "#fff",
          weight: 3,
          fillColor: "#0a0a0a",
          fillOpacity: 1,
        })
          .addTo(map)
          .bindPopup(`<b>${driver.name}</b><br>Nexar`);

        const ordered =
          ride.pickupOrder && ride.pickupOrder.length
            ? ride.pickupOrder
            : ride.passengers;
        ordered.forEach((email, i) => {
          const p = this.store.getUserByEmail(email);
          if (!p) return;
          const loc = [p.homeLat, p.homeLng];
          if (!valid(loc)) return;
          pts.push(loc);
          L.circleMarker(loc, {
            radius: 6,
            color: "#fff",
            weight: 2,
            fillColor: "#ff9500",
            fillOpacity: 1,
          })
            .addTo(map)
            .bindPopup(`<b>${p.name}</b><br>Pickup #${i + 1}`);
        });

        pts.push(end);
        L.circleMarker(end, {
          radius: 8,
          color: "#fff",
          weight: 3,
          fillColor: "#ff3b30",
          fillOpacity: 1,
        })
          .addTo(map)
          .bindPopup(`<b>${isMorning ? "Office" : "Home"}</b>`);

        L.polyline(pts, {
          color: "#0a0a0a",
          weight: 2,
          opacity: 0.6,
          dashArray: "4 6",
        }).addTo(map);
        map.fitBounds(L.latLngBounds(pts).pad(0.25));
        this.rideMaps.set(ride.id, map);
        // If there's a live driver position, drop the moving marker now.
        if (ride.currentPosition && ride.status === 'active') {
          this.refreshDriverMarker(ride.id);
        }
      } catch (err) {
        console.error("Map init failed", err);
      }
    });
  }

  // Hydrate async names on home tab cards (driver/passenger names come from cache)
  hydrateRideCards() {
    const user = this.currentUser;
    const rides = this.store
      .getRides()
      .filter(
        (r) =>
          r.date >= new Date().toISOString().slice(0, 10) &&
          (r.driver === user.email || r.passengers.includes(user.email)),
      );
    rides.forEach((ride) => {
      if (ride.driver === user.email) {
        const ordered =
          ride.pickupOrder && ride.pickupOrder.length
            ? ride.pickupOrder
            : ride.passengers;
        ordered.forEach((email, i) => {
          const el = document.getElementById(`passenger-name-${ride.id}-${i}`);
          const p = this.store.getUserByEmail(email);
          if (el && p) el.textContent = p.name;
        });
      } else if (ride.driver) {
        const d = this.store.getUserByEmail(ride.driver);
        const nameEl = document.getElementById(`driver-name-${ride.id}`);
        const carEl = document.getElementById(`driver-car-${ride.id}`);
        const avEl = document.getElementById(`driver-avatar-${ride.id}`);
        if (d) {
          if (nameEl) nameEl.textContent = d.name;
          if (carEl)
            carEl.textContent = `${d.carCompany} ${d.carModel} · ${d.carNumber}`;
          if (avEl) avEl.textContent = (d.name || "?").trim()[0].toUpperCase();
        }
      }
    });
  }
}

new App();
