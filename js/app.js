import { DataStore, OnboardingManager, setAuthToken, tryRefreshToken,
         supabaseAuthFetch, geocodeAddress, callMatchingEngine,
         parseAuthHash, clearAuthHash } from './core.js';
import { toast, openSheet, openModal, toggleTheme, theme, escapeHtml } from './ui.js';
import { LoginView, OnboardingView, HomeView, RidesView, ProfileView,
         NotificationsSheet, EditProfileModal, FinishProfileView } from './views.js';
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
    this.start();
  }

  bind() {
    // All onclick-accessible methods
        const methods = [
      'handleLogin','showOnboarding','showLogin','handleOnboarding','handleFinishProfile','logout',
      'switchTab','cancelAsDriver','cancelAsPassenger','refresh','startRide','completeRide',
      'toggleNotifications','markAllNotificationsRead','openNotification','refreshBellBadge',
      'openEditProfile','openNotifications','toggleTheme','handleEditProfileSave'
    ];
    methods.forEach((m) => {
      this[m] = this[m].bind(this);
    });
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
    if (!email || !password) {
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

  async cancelAsDriver(rideId, btn) {
    if (
      !confirm(
        "Cancel this ride? Your passengers will be notified and we'll try to re-match them.",
      )
    )
      return;
    this.busy = true;
    this.setBtn(btn, "Cancelling…");
    try {
      await callMatchingEngine({ action: "cancelDriver", rideId });
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

  async cancelAsPassenger(rideId, btn) {
    if (!confirm("Cancel your seat? Your Nexar will be notified.")) return;
    this.busy = true;
    this.setBtn(btn, "Cancelling…");
    try {
      await callMatchingEngine({
        action: "cancelPassenger",
        rideId,
        passengerEmail: this.currentUser.email,
      });
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
  }
  async pollTick() {
    if (this.busy || this.currentView !== "dashboard" || !this.currentUser)
      return;
    try {
      await this.store.init();
      await this.store.loadNotifications(this.currentUser.email);
      const user = this.store.getUserByEmail(this.currentUser.email);
      if (user) this.currentUser = user;

      const ridesHash = this.ridesHash();
      const notifHash = this.notifHash();

      // Update bell badge in-place if only notifications changed.
      if (notifHash !== this._lastNotifHash) {
        this._lastNotifHash = notifHash;
        this.updateBellBadge();
      }

      // Only touch the content DOM if the current tab's data actually changed.
      if (this.activeTab === "rides" && ridesHash !== this._lastRidesHash) {
        this._lastRidesHash = ridesHash;
        this.renderContentOnly();
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

  ridesHash() {
    return this.store
      .getRides()
      .map(
        (r) =>
          `${r.id}:${r.status}:${(r.passengers || []).length}:${r.driver}:${r.startedAt || ""}:${r.completedAt || ""}:${r.cancelledAt || ""}`,
      )
      .sort()
      .join("|");
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
