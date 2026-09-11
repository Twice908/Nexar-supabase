import { icons, escapeHtml, initials } from './ui.js';

export function LoginView() {
  return `
    <div class="auth-screen">
      <img class="auth-logo" src="assets/logo-long.svg" alt="Nexar">
      <h1 class="auth-heading">Welcome back.</h1>
      <p class="auth-sub">Sign in to find your Nexar for today's commute.</p>
      <div class="auth-form">
        <div class="field">
          <label class="field-label" for="loginEmail">Email</label>
          <input class="field-input" type="email" id="loginEmail" placeholder="you@example.com" autocomplete="email">
        </div>
        <div class="field">
          <label class="field-label" for="loginPassword">Password</label>
          <input class="field-input" type="password" id="loginPassword" placeholder="Enter password" autocomplete="current-password">
        </div>
        <div id="loginError"></div>
        <button class="btn btn-primary btn-block" onclick="app.handleLogin()">Sign in</button>
      </div>
      <div class="auth-footer">
        New here? <button onclick="app.showOnboarding()">Create an account</button>
      </div>
    </div>
  `;
}

export function OnboardingView() {
  return `
    <div class="auth-screen">
      <img class="auth-logo" src="assets/logo-long.svg" alt="Nexar">
      <h1 class="auth-heading">Create your account.</h1>
      <p class="auth-sub">A few details so we can match you with the right Nexar.</p>
      <form id="onboardingForm" class="auth-form">
        <div class="field"><label class="field-label" for="name">Full name</label><input class="field-input" id="name" type="text" placeholder="Your name"></div>
        <div class="field"><label class="field-label" for="email">Email</label><input class="field-input" id="email" type="email" placeholder="you@example.com"></div>
        <div class="field"><label class="field-label" for="password">Password</label><input class="field-input" id="password" type="password" placeholder="At least 6 characters"></div>
        <div class="field"><label class="field-label" for="mobile">Mobile number</label><input class="field-input" id="mobile" type="tel" placeholder="10 digits"></div>
        <div class="field"><label class="field-label" for="homeZone">Home zone</label><input class="field-input" id="homeZone" type="text" placeholder="e.g., Andheri West, Mumbai"></div>
        <div class="field"><label class="field-label" for="officeAddress">Office address</label><textarea class="field-textarea" id="officeAddress" placeholder="Street, area, city"></textarea></div>
        <div class="field"><label class="field-label" for="officeEntryTime">Office entry time</label><input class="field-input" id="officeEntryTime" type="time" value="09:00"></div>
        <div class="field"><label class="field-label" for="officeExitTime">Office exit time</label><input class="field-input" id="officeExitTime" type="time" value="18:00"></div>
        <div class="field"><label class="field-label" for="carCompany">Car company</label><input class="field-input" id="carCompany" type="text" placeholder="e.g., Maruti Suzuki"></div>
        <div class="field"><label class="field-label" for="carModel">Car model</label><input class="field-input" id="carModel" type="text" placeholder="e.g., Swift"></div>
        <div class="field"><label class="field-label" for="carNumber">Car plate</label><input class="field-input" id="carNumber" type="text" placeholder="e.g., MH14KM1234" autocapitalize="characters"></div>
        <div class="field">
          <label class="field-label" for="vacantSeats">Vacant seats</label>
          <select class="field-select" id="vacantSeats"><option value="2">2</option><option value="3">3</option><option value="4">4</option></select>
        </div>
        <div id="onboardingError"></div>
        <button type="submit" id="onboardBtn" class="btn btn-primary btn-block" style="margin-top:8px">Create account</button>
      </form>
      <div class="auth-footer">
        Already have an account? <button onclick="app.showLogin()">Sign in</button>
      </div>
    </div>
  `;
}

export function HomeView({ user, rides, notifications }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = (user.name || '').split(' ')[0] || 'there';

  const todayStr = toLocalDate(new Date());
  const todayRides = rides.filter(r =>
    r.date === todayStr && (r.driver === user.email || r.passengers.includes(user.email))
  );
  const nextRide = todayRides.find(r => r.status === 'matched' || r.status === 'active');

  const month = todayStr.slice(0, 7);
  const thisMonth = rides.filter(r => r.date.startsWith(month) &&
    (r.driver === user.email || r.passengers.includes(user.email)));
  const asDriver = thisMonth.filter(r => r.driver === user.email).length;
  const asPassenger = thisMonth.filter(r => r.passengers.includes(user.email)).length;

  const hero = nextRide ? `
    <div class="hero-ride">
      <div class="hero-ride-label">Today's ride</div>
      <div class="hero-ride-time">${nextRide.pickupTime || '—'}</div>
      <div class="hero-ride-meta">
        ${statusPill(nextRide.status)}
        <span>${nextRide.tripType === 'morning' ? 'To office' : 'To home'}</span>
        <span>${nextRide.driver === user.email ? 'You drive' : 'You ride'}</span>
      </div>
    </div>
  ` : `
    <div class="hero-ride">
      <div class="hero-ride-label">Today</div>
      <div class="hero-ride-time" style="font-size:20px; font-weight:600;">No ride today</div>
      <div class="hero-ride-meta"><span>Rides are matched at 7 PM for the next morning.</span></div>
    </div>
  `;

  return `
    <div class="section">
      <div class="greeting">${greeting}, ${escapeHtml(firstName)}.</div>
      <div class="greeting-sub">Here's what's happening.</div>
    </div>
    ${hero}
    <div class="stat-grid">
      <div class="stat"><div class="stat-value">${asDriver}</div><div class="stat-label">As Nexar</div></div>
      <div class="stat"><div class="stat-value">${asPassenger}</div><div class="stat-label">As Nexirian</div></div>
      <div class="stat"><div class="stat-value">${thisMonth.length}</div><div class="stat-label">Total rides</div></div>
    </div>
    <div class="section">
      <div class="section-header"><span class="meta">Your details</span></div>
      <div class="card-list">
        ${rowSimple(icons.pin, 'Home zone', user.homeZone)}
        ${rowSimple(icons.pin, 'Office', user.officeAddress)}
        ${rowSimple(icons.car, 'Vehicle', `${user.carCompany} ${user.carModel}`)}
        ${rowSimple(icons.check, 'Plate', user.carNumber)}
      </div>
    </div>
  `;
}

export function RidesView({ user, rides }) {
  const todayStr = toLocalDate(new Date());
  const mine = rides.filter(r => r.driver === user.email || r.passengers.includes(user.email));
  const upcoming = mine.filter(r => r.date >= todayStr)
    .sort((a, b) => (a.date + a.tripType).localeCompare(b.date + b.tripType));
  const past = mine.filter(r => r.date < todayStr)
    .sort((a, b) => (b.date + b.tripType).localeCompare(a.date + a.tripType));

  return `
    <div class="section-header" style="padding:0 4px 12px">
      <span class="h2">Rides</span>
      <button class="icon-btn" onclick="app.refresh(this)" aria-label="Refresh">${icons.clock}</button>
    </div>
    <div id="rideError"></div>

    <div class="section">
      <div class="section-header"><span class="meta">Upcoming</span></div>
      ${upcoming.length === 0
        ? emptyState('No upcoming rides', 'Rides are matched at 7 PM for the next morning.')
        : upcoming.map(r => rideCard(r, user, false)).join('')}
    </div>

    ${past.length > 0 ? `
      <div class="section">
        <div class="section-header"><span class="meta">Past</span></div>
        ${past.slice(0, 10).map(r => rideCard(r, user, true)).join('')}
      </div>
    ` : ''}
  `;
}

function rideCard(ride, user, past) {
  const isDriver = ride.driver === user.email;

  if (ride.status === 'no match') {
    return `
      <div class="ride-card">
        <div class="ride-card-head">
          <div>
            <div class="ride-card-title">${ride.tripType === 'morning' ? 'Morning' : 'Evening'} ride</div>
            <div class="ride-card-date">${formatDate(ride.date)}</div>
          </div>
          <span class="pill pill-neutral"><span class="dot"></span>No match</span>
        </div>
        <div class="ride-card-body">
          <p class="caption">No Nexar could serve your route. Please arrange your own commute.</p>
        </div>
      </div>
    `;
  }
  if (ride.status === 'cancelled') {
    return `
      <div class="ride-card">
        <div class="ride-card-head">
          <div>
            <div class="ride-card-title">${ride.tripType === 'morning' ? 'Morning' : 'Evening'} ride</div>
            <div class="ride-card-date">${formatDate(ride.date)}</div>
          </div>
          <span class="pill pill-danger"><span class="dot"></span>Cancelled</span>
        </div>
        <div class="ride-card-body">
          <p class="caption">${escapeHtml(ride.cancellationReason || 'This ride was cancelled.')}</p>
        </div>
      </div>
    `;
  }

  const driverUser = ride.driver ? { name: '', carCompany: '', carModel: '', carNumber: '' } : null;

  const timelineItems = [];
  if (ride.startedAt)   timelineItems.push(['Started', fmtTime(ride.startedAt)]);
  if (ride.completedAt) timelineItems.push(['Completed', fmtTime(ride.completedAt)]);
  if (ride.cancelledAt) timelineItems.push(['Cancelled', fmtTime(ride.cancelledAt)]);

  const meGroup = (ride.group || []).find(g => g.email === user.email);
  const myWalk = (!isDriver && meGroup && meGroup.walkMin > 0) ? `
    <div class="walk-note">${icons.walk}
      <span>Walk ~${meGroup.walkMin} min (${Math.round((meGroup.walkKm||0) * 1000)} m) to your office</span>
    </div>` : '';

  const driverChip = (!isDriver && ride.driver) ? `
    <div class="driver-chip">
      <div class="driver-chip-avatar" id="driver-avatar-${ride.id}">?</div>
      <div class="driver-chip-body">
        <div class="driver-chip-name" id="driver-name-${ride.id}">Loading…</div>
        <div class="driver-chip-car" id="driver-car-${ride.id}"></div>
      </div>
    </div>
  ` : '';

  const passengerList = isDriver ? `
    <div class="passenger-list">
      <div class="meta" style="margin-bottom:8px">Passengers</div>
      ${(ride.pickupOrder && ride.pickupOrder.length > 0 ? ride.pickupOrder : ride.passengers).map((email, i) => {
        const g = (ride.group || []).find(x => x.email === email);
        const walk = g && typeof g.walkMin === 'number' ? g.walkMin : null;
        const km = g && typeof g.walkKm === 'number' ? g.walkKm : null;
        return `
          <div class="passenger-row">
            <div class="passenger-num">${i + 1}</div>
            <div class="passenger-body">
              <div class="passenger-name" id="passenger-name-${ride.id}-${i}">…</div>
              ${walk !== null ? `<div class="passenger-walk">Walk ${walk} min (${Math.round((km||0)*1000)} m)</div>` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  ` : '';

  const mapId = past ? '' : `ride-map-${ride.id}`;

  return `
    <div class="ride-card">
      <div class="ride-card-head">
        <div>
          <div class="ride-card-title">${ride.tripType === 'morning' ? 'Morning' : 'Evening'} ride</div>
          <div class="ride-card-date">${formatDate(ride.date)} · ${isDriver ? 'You drive' : 'You ride'}</div>
        </div>
        ${statusPill(ride.status)}
      </div>
      <div class="ride-card-body">
        <div class="ride-meta">
          <div class="ride-meta-item"><div class="meta-label">Pickup</div><div class="meta-value">${ride.pickupTime || '—'}</div></div>
          <div class="ride-meta-item"><div class="meta-label">Dropoff</div><div class="meta-value">${ride.dropoffTime || '—'}</div></div>
        </div>
        ${timelineItems.length ? `
          <div class="timeline">
            ${timelineItems.map(([k, v]) => `<div class="timeline-row"><span>${k}</span><strong>${v}</strong></div>`).join('')}
          </div>
        ` : ''}
        ${driverChip}
        ${myWalk}
        ${mapId ? `<div class="ride-map" id="${mapId}"></div>` : ''}
        ${passengerList}
        ${!past ? actionButtons(ride, isDriver) : ''}
      </div>
    </div>
  `;
}

function actionButtons(ride, isDriver) {
  const btns = [];
  if (isDriver) {
    if (ride.status === 'matched') btns.push(`<button class="btn btn-primary btn-sm" style="flex:1" onclick="app.startRide('${ride.id}', this)">${icons.play} Start</button>`);
    if (ride.status === 'active')  btns.push(`<button class="btn btn-primary btn-sm" style="flex:1" onclick="app.completeRide('${ride.id}', this)">${icons.check} Complete</button>`);
    if (['matched','active'].includes(ride.status))
      btns.push(`<button class="btn btn-danger btn-sm" onclick="app.cancelAsDriver('${ride.id}', this)">Cancel</button>`);
  } else {
    if (['matched','active'].includes(ride.status))
      btns.push(`<button class="btn btn-secondary btn-sm" style="flex:1" onclick="app.cancelAsPassenger('${ride.id}', this)">Cancel seat</button>`);
  }
  return btns.length ? `<div class="ride-actions">${btns.join('')}</div>` : '';
}

export function ProfileView({ user }) {
  const t = document.documentElement.getAttribute('data-theme');
  const isDark = t === 'dark';
  return `
    <div class="profile-header">
      <div class="profile-avatar">${initials(user.name)}</div>
      <div class="profile-name">${escapeHtml(user.name)}</div>
      <div class="profile-email">${escapeHtml(user.email)}</div>
    </div>

    <div class="section">
      <div class="card-list">
        <button class="card-row" onclick="app.openEditProfile()">
          <div class="card-row-left">
            <div class="card-row-icon">${icons.edit}</div>
            <div class="card-row-main">
              <div class="card-row-title">Edit profile</div>
              <div class="card-row-sub">Addresses, vehicle, timings</div>
            </div>
          </div>
          <div class="card-row-chevron">${icons.chevronRight}</div>
        </button>
        <button class="card-row" onclick="app.openNotifications()">
          <div class="card-row-left">
            <div class="card-row-icon">${icons.bell}</div>
            <div class="card-row-main">
              <div class="card-row-title">Notifications</div>
              <div class="card-row-sub">Ride updates and alerts</div>
            </div>
          </div>
          <div class="card-row-chevron">${icons.chevronRight}</div>
        </button>
      </div>
    </div>

    <div class="section">
      <div class="card-list">
        <div class="card-row" style="cursor:default">
          <div class="card-row-left">
            <div class="card-row-icon">${icons.moon}</div>
            <div class="card-row-main">
              <div class="card-row-title">Dark mode</div>
              <div class="card-row-sub">${isDark ? 'On' : 'Off'}</div>
            </div>
          </div>
          <button class="toggle" role="switch" aria-checked="${isDark}" onclick="app.toggleTheme(this)">
            <span class="toggle-knob"></span>
          </button>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="card-list">
        <button class="card-row" onclick="app.logout()">
          <div class="card-row-left">
            <div class="card-row-icon" style="color:var(--danger-fg)">${icons.logout}</div>
            <div class="card-row-main"><div class="card-row-title" style="color:var(--danger-fg)">Sign out</div></div>
          </div>
        </button>
      </div>
    </div>
  `;
}

export function NotificationsSheet(notifications) {
  if (!notifications.length) {
    return `<div class="empty">
      <div class="empty-mark"></div>
      <div class="empty-title">No notifications yet</div>
      <div class="empty-sub">Ride updates will appear here.</div>
    </div>`;
  }
  return `
    <div style="display:flex;justify-content:flex-end;margin-bottom:8px">
      <button class="btn btn-ghost btn-sm" onclick="app.markAllNotificationsRead()">Mark all read</button>
    </div>
    ${notifications.map(n => `
      <button class="notif-item ${n.read ? '' : 'is-unread'}" onclick="app.openNotification('${n.id}','${n.rideId || ''}')">
        <span class="notif-dot ${n.read ? 'is-read' : ''}"></span>
        <div class="notif-body">
          <div class="notif-title">${escapeHtml(n.title)}</div>
          ${n.body ? `<div class="notif-text">${escapeHtml(n.body)}</div>` : ''}
          <div class="notif-time">${timeAgo(n.createdAt)}</div>
        </div>
      </button>
    `).join('')}
  `;
}

export function EditProfileModal(user) {
  return `
    <form id="editProfileForm">
      <div class="field"><label class="field-label" for="editName">Full name</label><input class="field-input" id="editName" value="${escapeHtml(user.name)}"></div>
      <div class="field"><label class="field-label" for="editEmail">Email</label><input class="field-input" id="editEmail" value="${escapeHtml(user.email)}" readonly></div>
      <div class="field"><label class="field-label" for="editMobile">Mobile</label><input class="field-input" id="editMobile" value="${escapeHtml(user.mobile)}"></div>
      <div class="field"><label class="field-label" for="editHomeZone">Home zone</label><input class="field-input" id="editHomeZone" value="${escapeHtml(user.homeZone)}"></div>
      <div class="field"><label class="field-label" for="editOfficeAddress">Office address</label><textarea class="field-textarea" id="editOfficeAddress">${escapeHtml(user.officeAddress)}</textarea></div>
      <div class="field"><label class="field-label" for="editOfficeEntryTime">Office entry</label><input class="field-input" id="editOfficeEntryTime" type="time" value="${user.officeEntryTime}"></div>
      <div class="field"><label class="field-label" for="editOfficeExitTime">Office exit</label><input class="field-input" id="editOfficeExitTime" type="time" value="${user.officeExitTime}"></div>
      <div class="field"><label class="field-label" for="editCarCompany">Car company</label><input class="field-input" id="editCarCompany" value="${escapeHtml(user.carCompany)}"></div>
      <div class="field"><label class="field-label" for="editCarModel">Car model</label><input class="field-input" id="editCarModel" value="${escapeHtml(user.carModel)}"></div>
      <div class="field"><label class="field-label" for="editCarNumber">Car plate</label><input class="field-input" id="editCarNumber" value="${escapeHtml(user.carNumber)}"></div>
      <div class="field">
        <label class="field-label" for="editVacantSeats">Vacant seats</label>
        <select class="field-select" id="editVacantSeats">
          ${[2,3,4].map(n => `<option value="${n}" ${user.vacantSeats===n?'selected':''}>${n}</option>`).join('')}
        </select>
      </div>
      <div id="editProfileError"></div>
      <button type="submit" id="editProfileBtn" class="btn btn-primary btn-block" style="margin-top:8px">Save changes</button>
    </form>
  `;
}

// ——— helpers ———
function statusPill(status) {
  const map = {
    matching: ['pill-warning', 'Matching'],
    matched: ['pill-info', 'Matched'],
    started: ['pill-info', 'Started'],
    active: ['pill-success', 'In progress'],
    completed: ['pill-neutral', 'Completed'],
    cancelled: ['pill-danger', 'Cancelled'],
    'no match': ['pill-neutral', 'No match'],
  };
  const [cls, label] = map[status] || ['pill-neutral', status];
  return `<span class="pill ${cls}"><span class="dot"></span>${label}</span>`;
}

function rowSimple(icon, title, sub) {
  return `
    <div class="card-row" style="cursor:default">
      <div class="card-row-left">
        <div class="card-row-icon">${icon}</div>
        <div class="card-row-main">
          <div class="card-row-title">${escapeHtml(title)}</div>
          <div class="card-row-sub">${escapeHtml(sub || '—')}</div>
        </div>
      </div>
    </div>`;
}

function emptyState(title, sub) {
  return `<div class="empty">
    <div class="empty-mark"></div>
    <div class="empty-title">${title}</div>
    <div class="empty-sub">${sub}</div>
  </div>`;
}

function toLocalDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function formatDate(s) {
  const d = new Date(s + 'T00:00:00');
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (s === toLocalDate(today)) return 'Today';
  if (s === toLocalDate(tomorrow)) return 'Tomorrow';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}