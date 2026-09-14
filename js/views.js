import { icons, escapeHtml, initials } from './ui.js';

export function LoginView({ banner, prefillEmail } = {}) {
  const bannerHtml = banner ? `<div class="alert alert-warning">${escapeHtml(banner)}</div>` : '';
  const emailVal = prefillEmail ? `value="${escapeHtml(prefillEmail)}"` : '';
  return `
    <div class="auth-screen auth-screen-login">
      <div class="auth-brand">
        <img class="auth-logo logo-light-theme" src="assets/logo-long-dark.svg" alt="Nexar">
        <img class="auth-logo logo-dark-theme"  src="assets/logo-long-white.svg" alt="Nexar">
      </div>
      <div class="auth-intro">
        <h1 class="auth-heading">Welcome back.</h1>
        <p class="auth-sub">Sign in to find your Nexar for today's commute.</p>
      </div>
      ${bannerHtml}
      <div class="auth-form">
        <div class="field">
          <label class="field-label" for="loginEmail">Email</label>
          <input class="field-input" type="email" id="loginEmail" placeholder="you@example.com" autocomplete="email" ${emailVal}>
        </div>
        <div class="field">
          <label class="field-label" for="loginPassword">Password</label>
          <input class="field-input" type="password" id="loginPassword" placeholder="Enter password" autocomplete="current-password">
        </div>
        <div id="loginError"></div>
        <button class="btn btn-primary btn-block auth-submit" onclick="app.handleLogin()">Sign in</button>
      </div>
      <div class="auth-footer">
        New here? <button onclick="app.showOnboarding()">Create an account</button>
      </div>
    </div>
  `;
}

export function OnboardingView() {
  return `
    <div class="auth-screen auth-screen-form">
      <div class="auth-back">
        <button class="icon-btn" onclick="app.showLogin()" aria-label="Back to sign in">
          ${icons.chevronLeft}
        </button>
        <span class="caption">Back to sign in</span>
      </div>
      <div class="auth-brand">
        <img class="auth-logo logo-light-theme" src="assets/logo-long-dark.svg" alt="Nexar">
        <img class="auth-logo logo-dark-theme"  src="assets/logo-long-white.svg" alt="Nexar">
      </div>
      <div class="auth-intro">
        <h1 class="auth-heading">Create your account.</h1>
        <p class="auth-sub">A few details so we can match you with the right Nexar.</p>
      </div>
      <form id="onboardingForm" class="auth-form">
        <div class="auth-form-section">
          <div class="auth-section-title">About you</div>
          <div class="field"><label class="field-label" for="name">Full name</label><input class="field-input" id="name" type="text" placeholder="Your name"></div>
          <div class="field"><label class="field-label" for="email">Email</label><input class="field-input" id="email" type="email" placeholder="you@example.com"></div>
          <div class="field"><label class="field-label" for="password">Password</label><input class="field-input" id="password" type="password" placeholder="At least 6 characters"></div>
          <div class="field"><label class="field-label" for="mobile">Mobile number</label><input class="field-input" id="mobile" type="tel" placeholder="10 digits"></div>
        </div>
        <div class="auth-form-section">
          <div class="auth-section-title">Your commute</div>
          <div class="field"><label class="field-label" for="homeZone">Home zone</label><input class="field-input" id="homeZone" type="text" placeholder="e.g., Andheri West, Mumbai"></div>
          <div class="field"><label class="field-label" for="officeAddress">Office address</label><textarea class="field-textarea" id="officeAddress" placeholder="Street, area, city"></textarea></div>
          <div class="auth-field-grid">
            <div class="field"><label class="field-label" for="officeEntryTime">Office entry time</label><input class="field-input" id="officeEntryTime" type="time" value="09:00"></div>
            <div class="field"><label class="field-label" for="officeExitTime">Office exit time</label><input class="field-input" id="officeExitTime" type="time" value="18:00"></div>
          </div>
        </div>
        <div class="auth-form-section">
          <div class="auth-section-title">Your car</div>
          <div class="auth-field-grid">
            <div class="field"><label class="field-label" for="carCompany">Car company</label><input class="field-input" id="carCompany" type="text" placeholder="e.g., Maruti Suzuki"></div>
            <div class="field"><label class="field-label" for="carModel">Car model</label><input class="field-input" id="carModel" type="text" placeholder="e.g., Swift"></div>
          </div>
          <div class="field"><label class="field-label" for="carNumber">Car plate</label><input class="field-input" id="carNumber" type="text" placeholder="e.g., MH14KM1234" autocapitalize="characters"></div>
          <div class="field">
            <label class="field-label" for="vacantSeats">Vacant seats</label>
            <select class="field-select" id="vacantSeats"><option value="2">2</option><option value="3">3</option><option value="4">4</option></select>
          </div>
        </div>
        <div id="onboardingError"></div>
        <button type="submit" id="onboardBtn" class="btn btn-primary btn-block auth-submit">Create account</button>
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
    <div class="hero-ride hero-ride-scheduled">
      <div class="hero-ride-label">Today's ride</div>
      <div class="hero-ride-main">
        <div class="hero-ride-time">${nextRide.pickupTime || '—'}</div>
        <div class="hero-ride-direction">${nextRide.tripType === 'morning' ? 'To office' : 'To home'}</div>
      </div>
      <div class="hero-ride-meta">
        ${statusPill(nextRide.status)}
        <span>${nextRide.driver === user.email ? 'You drive' : 'You ride'}</span>
      </div>
    </div>
  ` : `
    <div class="hero-ride hero-ride-empty">
      <div class="hero-ride-label">Today</div>
      <div class="hero-ride-time" style="font-size:20px; font-weight:600;">No ride today</div>
      <div class="hero-ride-meta"><span>Rides are matched at 7 PM for the next morning.</span></div>
    </div>
  `;

  return `
    <div class="section home-intro">
      <div class="greeting">${greeting}, ${escapeHtml(firstName)}.</div>
      <div class="greeting-sub">Here's what's happening.</div>
    </div>
    ${hero}
    <div class="stat-grid home-stats">
      <div class="stat"><div class="stat-value">${asDriver}</div><div class="stat-label">As Nexar</div></div>
      <div class="stat"><div class="stat-value">${asPassenger}</div><div class="stat-label">As Nexirian</div></div>
      <div class="stat"><div class="stat-value">${thisMonth.length}</div><div class="stat-label">Total rides</div></div>
    </div>
    <div class="section">
      <div class="section-header home-section-header"><span class="h3">Your details</span></div>
      <div class="card-list">
        ${rowSimple(icons.pin, 'Home zone', user.homeZone)}
        ${rowSimple(icons.pin, 'Office', user.officeAddress)}
        ${rowSimple(icons.car, 'Vehicle', `${user.carCompany} ${user.carModel}`)}
        ${rowSimple(icons.check, 'Plate', user.carNumber)}
      </div>
    </div>
  `;
}

export function FinishProfileView({ pending, email }) {
  const p = pending || {};
  const v = (k, fallback = '') => escapeHtml(p[k] ?? fallback);
  const selectedSeat = p.vacantSeats || 3;

  return `
    <div class="auth-screen auth-screen-form">
      <div class="auth-back">
        <button class="icon-btn" onclick="app.logout()" aria-label="Sign out">
          ${icons.chevronLeft}
        </button>
        <span class="caption">Sign out</span>
      </div>

      <div class="auth-brand">
        <img class="auth-logo logo-light-theme" src="assets/logo-long-dark.svg" alt="Nexar">
        <img class="auth-logo logo-dark-theme"  src="assets/logo-long-white.svg" alt="Nexar">
      </div>

      <div class="profile-confirmed">
        <span class="pill pill-success"><span class="dot"></span>Email confirmed</span>
      </div>
      <div class="auth-intro">
        <h1 class="auth-heading">Finish your profile.</h1>
        <p class="auth-sub">Signed in as <strong>${escapeHtml(email)}</strong>. A few details so we can match you with rides.</p>
      </div>

      <form id="finishProfileForm" class="auth-form">
        <div class="auth-form-section">
          <div class="auth-section-title">About you</div>
          <div class="auth-field-grid">
            <div class="field"><label class="field-label" for="fpName">Full name</label><input class="field-input" id="fpName" type="text" value="${v('name')}" placeholder="Your name"></div>
            <div class="field"><label class="field-label" for="fpMobile">Mobile number</label><input class="field-input" id="fpMobile" type="tel" value="${v('mobile')}" placeholder="10 digits"></div>
          </div>
        </div>
        <div class="auth-form-section">
          <div class="auth-section-title">Your commute</div>
          <div class="field"><label class="field-label" for="fpHomeZone">Home zone</label><input class="field-input" id="fpHomeZone" type="text" value="${v('homeZone')}" placeholder="e.g., Andheri West, Mumbai"></div>
          <div class="field"><label class="field-label" for="fpOfficeAddress">Office address</label><textarea class="field-textarea" id="fpOfficeAddress" placeholder="Street, area, city">${v('officeAddress')}</textarea></div>
          <div class="auth-field-grid">
            <div class="field"><label class="field-label" for="fpOfficeEntryTime">Office entry time</label><input class="field-input" id="fpOfficeEntryTime" type="time" value="${v('officeEntryTime', '09:00')}"></div>
            <div class="field"><label class="field-label" for="fpOfficeExitTime">Office exit time</label><input class="field-input" id="fpOfficeExitTime" type="time" value="${v('officeExitTime', '18:00')}"></div>
          </div>
        </div>
        <div class="auth-form-section">
          <div class="auth-section-title">Your car</div>
          <div class="auth-field-grid">
            <div class="field"><label class="field-label" for="fpCarCompany">Car company</label><input class="field-input" id="fpCarCompany" type="text" value="${v('carCompany')}" placeholder="e.g., Maruti Suzuki"></div>
            <div class="field"><label class="field-label" for="fpCarModel">Car model</label><input class="field-input" id="fpCarModel" type="text" value="${v('carModel')}" placeholder="e.g., Swift"></div>
          </div>
          <div class="field"><label class="field-label" for="fpCarNumber">Car plate</label><input class="field-input" id="fpCarNumber" type="text" value="${v('carNumber')}" placeholder="e.g., MH14KM1234" autocapitalize="characters"></div>
          <div class="field">
            <label class="field-label" for="fpVacantSeats">Vacant seats</label>
            <select class="field-select" id="fpVacantSeats">
              ${[2,3,4].map(n => `<option value="${n}" ${selectedSeat === n ? 'selected' : ''}>${n}</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="finishProfileError"></div>
        <button type="submit" id="finishProfileBtn" class="btn btn-primary btn-block auth-submit">Save profile</button>
      </form>
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
    <div class="section-header rides-header">
      <span class="h2">Rides</span>
      <button class="icon-btn" onclick="app.refresh(this)" aria-label="Refresh">${icons.clock}</button>
    </div>
    <div id="rideError"></div>

    <div class="section rides-section">
      <div class="section-header"><span class="meta">Upcoming</span></div>
      ${upcoming.length === 0
        ? emptyState('No upcoming rides', 'Rides are matched at 7 PM for the next morning.')
        : upcoming.map(r => rideCard(r, user, false)).join('')}
    </div>

    ${past.length > 0 ? `
      <div class="section rides-section rides-section-past">
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

  const timelineItems = [];
  if (ride.startedAt)   timelineItems.push(['Started', fmtTime(ride.startedAt)]);
  if (ride.completedAt) timelineItems.push(['Completed', fmtTime(ride.completedAt)]);
  if (ride.cancelledAt) timelineItems.push(['Cancelled', fmtTime(ride.cancelledAt)]);

  const meGroup = (ride.group || []).find(g => g.email === user.email);
  const myWalk = (!isDriver && meGroup && meGroup.walkMin > 0) ? `
    <div class="walk-note">${icons.walk}
      <span>Walk ~${meGroup.walkMin} min (${Math.round((meGroup.walkKm||0) * 1000)} m) to your office</span>
    </div>` : '';

  const driverUser = (!isDriver && ride.driver) ? window.app.store.getUserByEmail(ride.driver) : null;
    const driverChip = (!isDriver && driverUser) ? (() => {
    const avg = window.app.store.getAverageRating(driverUser.email);
    const ratingHtml = avg
      ? `<div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">★ ${avg.avg} · ${avg.count} rating${avg.count === 1 ? '' : 's'}</div>`
      : '';
    return `
      <div class="driver-chip">
        <div class="driver-chip-avatar">${(driverUser.name || '?').trim()[0].toUpperCase()}</div>
        <div class="driver-chip-body">
          <div class="driver-chip-name">${escapeHtml(driverUser.name || 'Nexar')}</div>
          <div class="driver-chip-car">${escapeHtml(`${driverUser.carCompany || ''} ${driverUser.carModel || ''}`.trim())} · ${escapeHtml(driverUser.carNumber || '')}</div>
          ${ratingHtml}
        </div>
        <div style="display:flex; gap:6px; flex-shrink:0;">
          ${buildTelUrl(driverUser.mobile) ? `<a href="${buildTelUrl(driverUser.mobile)}" class="icon-btn" title="Call Nexar">${iconPhone()}</a>` : ''}
          ${driverUser.mobile ? `<a href="${buildWhatsAppUrl(driverUser.mobile, `Hi ${driverUser.name}, this is about our Nexar ride on ${ride.date}.`)}" target="_blank" rel="noopener" class="icon-btn" title="WhatsApp Nexar">${iconWhatsApp()}</a>` : ''}
        </div>
      </div>
    `;
  })() : '';
      const passengerList = isDriver ? `
    <div class="passenger-list">
      <div class="meta" style="margin-bottom:8px">Passengers</div>
      ${(ride.pickupOrder && ride.pickupOrder.length > 0 ? ride.pickupOrder : ride.passengers).map((email, i) => {
        const g = (ride.group || []).find(x => x.email === email);
        const p = window.app.store.getUserByEmail(email);
        const name = p?.name || g?.name || email;
        const walk = g && typeof g.walkMin === 'number' ? g.walkMin : null;
        const km = g && typeof g.walkKm === 'number' ? g.walkKm : null;

        const picked = (ride.pickedUp || []).includes(email);
        const dropped = (ride.droppedOff || []).includes(email);

        let statusPill;
        if (dropped) {
          statusPill = `<span class="pill pill-success" style="font-size:10px; padding:2px 7px;"><span class="dot"></span>Dropped</span>`;
        } else if (picked) {
          statusPill = `<span class="pill pill-info" style="font-size:10px; padding:2px 7px;"><span class="dot"></span>On board</span>`;
        } else if (ride.status === 'active') {
          statusPill = `<span class="pill pill-warning" style="font-size:10px; padding:2px 7px;"><span class="dot"></span>Waiting</span>`;
        } else {
          statusPill = `<span class="pill pill-neutral" style="font-size:10px; padding:2px 7px;"><span class="dot"></span>Not started</span>`;
        }

        // Both buttons always rendered when ride is active; disabled state
        // flips instantly on tap so the driver doesn't wait for polling.
        const showActions = ride.status === 'active';
        const onboardDisabled = picked ? 'disabled' : '';
        const droppedDisabled = (!picked || dropped) ? 'disabled' : '';
        const actionsRow = showActions ? `
          <div style="display:flex; gap:8px; margin-top:8px;">
            <button
              class="btn btn-primary btn-sm"
              style="flex:1;"
              data-pickup-btn="${ride.id}|${email}"
              ${onboardDisabled}
              onclick="app.markPickedUp('${ride.id}', '${email}', this)">Onboard</button>
            <button
              class="btn btn-outline btn-sm"
              style="flex:1;"
              data-drop-btn="${ride.id}|${email}"
              ${droppedDisabled}
              onclick="app.markDropped('${ride.id}', '${email}', this)">Dropped</button>
          </div>
        ` : '';

        const pPhone = p?.mobile;
        const contactBtns = pPhone ? `
          <a href="${buildTelUrl(pPhone)}" class="icon-btn" style="width:30px;height:30px;" title="Call passenger">${iconPhone()}</a>
          <a href="${buildWhatsAppUrl(pPhone, `Hi ${name}, about our Nexar ride on ${ride.date}.`)}" target="_blank" rel="noopener" class="icon-btn" style="width:30px;height:30px;" title="WhatsApp passenger">${iconWhatsApp()}</a>
        ` : '';

        const ev = (ride.dropoffEvents || []).find(e => e.email === email);
        const dropTimeLabel = ev && ev.at ? `<div class="passenger-walk">Dropped at ${new Date(ev.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>` : '';

        return `
          <div class="passenger-row" style="display:block;">
            <div style="display:flex; align-items:flex-start; gap:10px;">
              <div class="passenger-num">${i + 1}</div>
              <div class="passenger-body" style="flex:1;">
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                  <div class="passenger-name">${escapeHtml(name)}</div>
                  ${statusPill}
                  <div style="margin-left:auto; display:flex; gap:4px;">${contactBtns}</div>
                </div>
                ${walk !== null ? `<div class="passenger-walk">Walk ${walk} min (${Math.round((km||0)*1000)} m)</div>` : ''}
                ${dropTimeLabel}
              </div>
            </div>
            ${actionsRow}
          </div>
        `;
      }).join('')}
    </div>
  ` : '';

    // Passenger's view: list co-passengers + status
    const coPassengerList = (!isDriver && (ride.passengers || []).length > 0) ? `
    <div class="passenger-list">
      <div class="meta" style="margin-bottom:8px">Riders</div>
      ${(ride.pickupOrder && ride.pickupOrder.length > 0 ? ride.pickupOrder : ride.passengers).map((email, i) => {
        const g = (ride.group || []).find(x => x.email === email);
        const p = window.app.store.getUserByEmail(email);
        const name = p?.name || g?.name || email;
        const isMe = email === user.email;
        const picked = (ride.pickedUp || []).includes(email);
        const dropped = (ride.droppedOff || []).includes(email);

        let statusPill;
        if (dropped) {
          statusPill = `<span class="pill pill-success" style="font-size:10px; padding:2px 7px;"><span class="dot"></span>Dropped</span>`;
        } else if (picked) {
          statusPill = `<span class="pill pill-info" style="font-size:10px; padding:2px 7px;"><span class="dot"></span>On board</span>`;
        } else if (ride.status === 'active') {
          statusPill = `<span class="pill pill-warning" style="font-size:10px; padding:2px 7px;"><span class="dot"></span>Waiting</span>`;
        } else {
          statusPill = `<span class="pill pill-neutral" style="font-size:10px; padding:2px 7px;"><span class="dot"></span>Not started</span>`;
        }

        return `
          <div class="passenger-row">
            <div class="passenger-num">${i + 1}</div>
            <div class="passenger-body">
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <div class="passenger-name">${escapeHtml(name)}${isMe ? ' <span style="color:var(--text-tertiary); font-size:11px;">(you)</span>' : ''}</div>
                ${statusPill}
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  ` : '';

  const mapId = past ? '' : `ride-map-${ride.id}`;

  return `
    <div class="ride-card ${past ? 'is-past' : ''}">
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

        ${buildMapAndShareRow(ride, isDriver, user)}

        ${passengerList}
        ${coPassengerList}
        ${buildRatingBlock(ride, user, isDriver)}
        ${!past ? actionButtons(ride, isDriver) : ''}
      </div>
    </div>
  `;
}

// Builds the Google Maps button + Share button row.
function buildMapAndShareRow(ride, isDriver, user) {
  if (ride.status === 'no match' || ride.status === 'cancelled') return '';
  const driver = window.app.store.getUserByEmail(ride.driver);
  if (!driver) return '';

  const isMorning = ride.tripType === 'morning';
  const driverHome = [driver.homeLat, driver.homeLng];
  const driverOffice = [driver.officeLat, driver.officeLng];
  const start = isMorning ? driverHome : driverOffice;
  const end = isMorning ? driverOffice : driverHome;

  // Order passenger stops along the route using pickupOrder.
  const ordered = (ride.pickupOrder && ride.pickupOrder.length > 0)
    ? ride.pickupOrder
    : (ride.passengers || []);
  const passengerStops = ordered
    .map(email => {
      const p = window.app.store.getUserByEmail(email);
      return p ? [p.homeLat, p.homeLng] : null;
    })
    .filter(Boolean);

  const stops = [start, ...passengerStops, end];
  const mapsUrl = buildGoogleMapsUrl(stops);

  const shareText = [
    `I'm on a Nexar ride (${ride.tripType} · ${ride.date}).`,
    `Nexar: ${driver.name} — ${driver.carCompany} ${driver.carModel} (${driver.carNumber}).`,
    `Pickup ${ride.pickupTime || '—'} · Dropoff ${ride.dropoffTime || '—'}.`,
    `Track: ${window.location.origin}${window.location.pathname}`
  ].join(' ');
  const shareUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  return `
    <div style="display:flex; gap:8px; margin-bottom:12px;">
      ${mapsUrl ? `<a href="${mapsUrl}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="flex:1; text-decoration:none;">
        ${iconMap()} <span>Open in Maps</span>
      </a>` : ''}
      <a href="${shareUrl}" target="_blank" rel="noopener" class="btn btn-outline btn-sm" style="flex:1; text-decoration:none;">
        ${iconShare()} <span>Share ride</span>
      </a>
    </div>
  `;
}

// Inline SVG icons (kept in views.js to avoid touching ui.js)
function iconPhone() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>`;
}
function iconWhatsApp() {
  return `<svg viewBox="0 0 24 24" fill="currentColor" style="width:18px;height:18px;">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
  </svg>`;
}
function iconMap() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;">
    <path d="M9 20 3 17V4l6 3 6-3 6 3v13l-6-3-6 3z"/>
    <path d="M9 7v13"/>
    <path d="M15 4v13"/>
  </svg>`;
}
function iconShare() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;">
    <circle cx="18" cy="5" r="3"/>
    <circle cx="6" cy="12" r="3"/>
    <circle cx="18" cy="19" r="3"/>
    <path d="m8.59 13.51 6.83 3.98"/>
    <path d="m15.41 6.51-6.82 3.98"/>
  </svg>`;
}

// Builds a Google Maps directions URL from an ordered list of [lat,lng] stops.
// Max 10 stops supported by the URL scheme — our groups top out at ~8, so safe.
function buildGoogleMapsUrl(stops, travelMode = 'driving') {
  const valid = stops.filter(s =>
    Array.isArray(s) && typeof s[0] === 'number' && typeof s[1] === 'number'
  );
  if (valid.length < 2) return null;
  const origin = `${valid[0][0]},${valid[0][1]}`;
  const destination = `${valid[valid.length - 1][0]},${valid[valid.length - 1][1]}`;
  const waypoints = valid.slice(1, -1).map(s => `${s[0]},${s[1]}`).join('|');
  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=${travelMode}`;
  if (waypoints) url += `&waypoints=${encodeURIComponent(waypoints)}`;
  return url;
}

// Builds a WhatsApp deep-link with a pre-filled text message.
function buildWhatsAppUrl(phone, text) {
  // Strip non-digits; assume Indian numbers are 10 digits and prefix 91.
  const digits = (phone || '').replace(/\D/g, '');
  const intl = digits.length === 10 ? '91' + digits : digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
}

// Builds a `tel:` link for the call button.
function buildTelUrl(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  return digits ? `tel:+${digits.length === 10 ? '91' + digits : digits}` : null;
}

function buildRatingBlock(ride, user, isDriver) {
  if (ride.status !== 'completed') return '';

  const store = window.app.store;
  const ratees = isDriver
    ? (ride.passengers || [])
    : (ride.driver ? [ride.driver] : []);

  if (ratees.length === 0) return '';

  const rows = ratees.map(email => {
    const p = store.getUserByEmail(email);
    const name = p?.name || email;
    const existing = store.getRatingFor(ride.id, user.email, email);

    if (existing) {
      return `
        <div class="passenger-row" style="display:block;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div class="passenger-body" style="flex:1;">
              <div class="passenger-name">${escapeHtml(name)}</div>
              <div class="passenger-walk">You rated ${'★'.repeat(existing.stars)}${'☆'.repeat(5 - existing.stars)}</div>
              ${existing.comment ? `<div class="passenger-walk" style="font-style:italic;">"${escapeHtml(existing.comment)}"</div>` : ''}
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="passenger-row" style="display:block;" data-rate-row="${ride.id}|${email}">
        <div style="display:flex; align-items:center; gap:10px;">
          <div class="passenger-body" style="flex:1;">
            <div class="passenger-name">Rate ${escapeHtml(name)}</div>
            <div class="star-picker" data-star-target="${ride.id}|${email}">
              ${[1,2,3,4,5].map(n => `
                <button type="button" class="star-btn" data-stars="${n}" onclick="app.pickStars('${ride.id}', '${email}', ${n}, this)">★</button>
              `).join('')}
            </div>
            <div class="rate-comment-row" style="margin-top:6px; display:none;" data-comment-for="${ride.id}|${email}">
              <input type="text" class="field-input" style="height:38px; font-size:13px;" placeholder="Add a comment (optional)" data-comment-input="${ride.id}|${email}">
              <button class="btn btn-primary btn-sm" style="margin-top:6px;" onclick="app.submitRating('${ride.id}', '${email}', this)">Submit rating</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="passenger-list" style="margin-top:8px;">
      <div class="meta" style="margin-bottom:8px">Rate this ride</div>
      ${rows}
    </div>
  `;
}

function actionButtons(ride, isDriver) {
  const btns = [];
  if (isDriver) {
    if (ride.status === 'matched') {
      btns.push(`<button class="btn btn-primary btn-sm" style="flex:1" onclick="app.startRide('${ride.id}', this)">${icons.play} Start</button>`);
      btns.push(`<button class="btn btn-danger btn-sm" onclick="app.cancelAsDriver('${ride.id}', this)">Cancel</button>`);
    }
    if (ride.status === 'active') {
      btns.push(`<button class="btn btn-primary btn-sm" style="flex:1" onclick="app.completeRide('${ride.id}', this)">${icons.check} Complete</button>`);
    }
  } else {
    if (ride.status === 'matched') {
      btns.push(`<button class="btn btn-secondary btn-sm" style="flex:1" onclick="app.cancelAsPassenger('${ride.id}', this)">Cancel seat</button>`);
    }
  }
  return btns.length ? `<div class="ride-actions">${btns.join('')}</div>` : '';
}

export function ProfileView({ user }) {
  const t = document.documentElement.getAttribute('data-theme');
  const isDark = t === 'dark';
  return `
    <div class="profile-header profile-summary">
      <div class="profile-avatar">${initials(user.name)}</div>
      <div class="profile-name">${escapeHtml(user.name)}</div>
      <div class="profile-email">${escapeHtml(user.email)}</div>
    </div>

    <div class="section profile-section">
      <div class="section-header profile-section-header"><span class="meta">Account</span></div>
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

    <div class="section profile-section">
      <div class="section-header profile-section-header"><span class="meta">Preferences</span></div>
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

    <div class="section profile-section">
      <div class="section-header profile-section-header"><span class="meta">Session</span></div>
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
    return `<div class="empty notifications-empty">
      <div class="empty-mark"></div>
      <div class="empty-title">No notifications yet</div>
      <div class="empty-sub">Ride updates will appear here.</div>
    </div>`;
  }
  return `
    <div class="notifications-toolbar">
      <button class="btn btn-ghost btn-sm" onclick="app.markAllNotificationsRead()">Mark all read</button>
    </div>
    <div class="notification-list">
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
    </div>
  `;
}

export function EditProfileModal(user) {
  return `
    <form id="editProfileForm">
      <div class="modal-form-section">
        <div class="modal-form-title">About you</div>
        <div class="field"><label class="field-label" for="editName">Full name</label><input class="field-input" id="editName" value="${escapeHtml(user.name)}"></div>
        <div class="field"><label class="field-label" for="editEmail">Email</label><input class="field-input" id="editEmail" value="${escapeHtml(user.email)}" readonly></div>
        <div class="field"><label class="field-label" for="editMobile">Mobile</label><input class="field-input" id="editMobile" value="${escapeHtml(user.mobile)}"></div>
      </div>
      <div class="modal-form-section">
        <div class="modal-form-title">Your commute</div>
        <div class="field"><label class="field-label" for="editHomeZone">Home zone</label><input class="field-input" id="editHomeZone" value="${escapeHtml(user.homeZone)}"></div>
        <div class="field"><label class="field-label" for="editOfficeAddress">Office address</label><textarea class="field-textarea" id="editOfficeAddress">${escapeHtml(user.officeAddress)}</textarea></div>
        <div class="auth-field-grid">
          <div class="field"><label class="field-label" for="editOfficeEntryTime">Office entry</label><input class="field-input" id="editOfficeEntryTime" type="time" value="${user.officeEntryTime}"></div>
          <div class="field"><label class="field-label" for="editOfficeExitTime">Office exit</label><input class="field-input" id="editOfficeExitTime" type="time" value="${user.officeExitTime}"></div>
        </div>
      </div>
      <div class="modal-form-section">
        <div class="modal-form-title">Your car</div>
        <div class="auth-field-grid">
          <div class="field"><label class="field-label" for="editCarCompany">Car company</label><input class="field-input" id="editCarCompany" value="${escapeHtml(user.carCompany)}"></div>
          <div class="field"><label class="field-label" for="editCarModel">Car model</label><input class="field-input" id="editCarModel" value="${escapeHtml(user.carModel)}"></div>
        </div>
        <div class="field"><label class="field-label" for="editCarNumber">Car plate</label><input class="field-input" id="editCarNumber" value="${escapeHtml(user.carNumber)}"></div>
        <div class="field">
          <label class="field-label" for="editVacantSeats">Vacant seats</label>
          <select class="field-select" id="editVacantSeats">
            ${[2,3,4].map(n => `<option value="${n}" ${user.vacantSeats===n?'selected':''}>${n}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="editProfileError"></div>
      <button type="submit" id="editProfileBtn" class="btn btn-primary btn-block auth-submit">Save changes</button>
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