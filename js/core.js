import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

let currentAccessToken = null;
export function setAuthToken(t) { currentAccessToken = t; }
export function getAccessToken() { return currentAccessToken; }
export function getAnonKey() { return SUPABASE_ANON_KEY; }
export function getSupabaseUrl() { return SUPABASE_URL; }

export async function supabaseFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${currentAccessToken || SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!res.ok) throw new Error(`Supabase error ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

export async function supabaseAuthFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || data.error || `Auth error ${res.status}`);
  return data;
}

export async function geocodeAddress(address) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/geocode`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${currentAccessToken || SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({ address })
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.error || `Geocode error ${res.status}`);
  return result.data;
}

export async function callMatchingEngine(payload) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/matching-engine`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${currentAccessToken || SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY
    },
    body: JSON.stringify(payload)
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.error || `Matching engine error ${res.status}`);
  return result.data;
}

// ——— mappers ———
export function userToDb(u) {
  const p = {
    email: u.email, name: u.name, mobile: u.mobile,
    home_zone: u.homeZone, office_address: u.officeAddress,
    office_entry_time: u.officeEntryTime, office_exit_time: u.officeExitTime,
    car_company: u.carCompany, car_model: u.carModel, car_number: u.carNumber,
    vacant_seats: u.vacantSeats, updated_at: new Date().toISOString()
  };
  if (u.authId) p.auth_id = u.authId;
  if (typeof u.homeLat === 'number') p.home_lat = u.homeLat;
  if (typeof u.homeLng === 'number') p.home_lng = u.homeLng;
  if (typeof u.officeLat === 'number') p.office_lat = u.officeLat;
  if (typeof u.officeLng === 'number') p.office_lng = u.officeLng;
  return p;
}

export function userFromDb(row) {
  return {
    email: row.email, name: row.name, mobile: row.mobile,
    homeZone: row.home_zone, officeAddress: row.office_address,
    officeEntryTime: row.office_entry_time, officeExitTime: row.office_exit_time,
    carCompany: row.car_company, carModel: row.car_model, carNumber: row.car_number,
    vacantSeats: row.vacant_seats,
    homeLat: row.home_lat, homeLng: row.home_lng,
    officeLat: row.office_lat, officeLng: row.office_lng,
    authId: row.auth_id, createdAt: row.created_at, updatedAt: row.updated_at
  };
}

export function rideFromDb(row) {
  return {
    id: row.id, tripType: row.trip_type, driver: row.driver,
    passengers: row.passengers, group: row.group, status: row.status,
    pickupTime: row.pickup_time, dropoffTime: row.dropoff_time,
    pickupOrder: row.pickup_order || [], dropoffOrder: row.dropoff_order || [],
    cancellationReason: row.cancellation_reason,
    startedAt: row.started_at, completedAt: row.completed_at, cancelledAt: row.cancelled_at,
    date: row.date, createdAt: row.created_at
  };
}

// ——— store ———
export class DataStore {
  constructor() { this.cache = { users: [], rides: [], schedules: [], driverLog: {}, notifications: [] }; }

  async init() {
    if (!localStorage.getItem('nexar_sessions')) localStorage.setItem('nexar_sessions', JSON.stringify({}));
    const [usersRows, ridesRows, schedulesRows, driverLogRows] = await Promise.all([
      supabaseFetch('users?select=*'),
      supabaseFetch('rides?select=*'),
      supabaseFetch('schedules?select=*'),
      supabaseFetch('driver_log?select=*')
    ]);
    this.cache.users = usersRows.map(userFromDb);
    this.cache.rides = ridesRows.map(rideFromDb);
    this.cache.schedules = schedulesRows.map(r => ({
      date: r.date, type: r.type, ridesCount: r.rides_count, scheduledAt: r.scheduled_at
    }));
    this.cache.driverLog = {};
    driverLogRows.forEach(r => { this.cache.driverLog[`${r.user_email}_${r.month}`] = r.ride_count; });
  }

  getUsers() { return this.cache.users; }
  getUserByEmail(e) { return this.cache.users.find(u => u.email === e); }
  getRides() { return this.cache.rides; }
  getSchedules() { return this.cache.schedules; }
  getNotifications() { return this.cache.notifications || []; }
  getDriverCount(email, month) { return this.cache.driverLog[`${email}_${month}`] || 0; }

  async saveUser(user) {
    const rows = await supabaseFetch('users?on_conflict=email', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(userToDb(user))
    });
    const saved = userFromDb(rows[0]);
    const i = this.cache.users.findIndex(u => u.email === saved.email);
    if (i >= 0) this.cache.users[i] = saved; else this.cache.users.push(saved);
    return saved;
  }

  async updateRide(rideId, updates) {
    const db = {};
    if (updates.passengers !== undefined) db.passengers = updates.passengers;
    if (updates.group !== undefined) db.group = updates.group;
    if (updates.status !== undefined) db.status = updates.status;
    if (updates.cancellationReason !== undefined) db.cancellation_reason = updates.cancellationReason;
    const rows = await supabaseFetch(`rides?id=eq.${rideId}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(db)
    });
    if (!rows.length) return null;
    const saved = rideFromDb(rows[0]);
    const i = this.cache.rides.findIndex(r => r.id === rideId);
    if (i >= 0) this.cache.rides[i] = saved;
    return saved;
  }

  getSession() { return JSON.parse(localStorage.getItem('nexar_sessions') || '{}'); }
  saveSession(s) { localStorage.setItem('nexar_sessions', JSON.stringify(s)); }
  clearSession() { localStorage.removeItem('nexar_sessions'); }

  async loadNotifications(email) {
    const rows = await supabaseFetch(
      `notifications?user_email=eq.${encodeURIComponent(email)}&order=created_at.desc&limit=50`
    );
    this.cache.notifications = rows.map(r => ({
      id: r.id, userEmail: r.user_email, type: r.type,
      title: r.title, body: r.body, rideId: r.ride_id,
      read: r.read, createdAt: r.created_at
    }));
    return this.cache.notifications;
  }

  async markNotificationRead(id) {
    await supabaseFetch(`notifications?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ read: true })
    });
    const n = this.cache.notifications.find(x => x.id === id);
    if (n) n.read = true;
  }

  async markAllNotificationsRead(email) {
    await supabaseFetch(`notifications?user_email=eq.${encodeURIComponent(email)}&read=eq.false`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ read: true })
    });
    (this.cache.notifications || []).forEach(n => n.read = true);
  }
}

export async function tryRefreshToken(store) {
  const session = store.getSession();
  if (!session.refreshToken) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refreshToken })
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) return false;
    const newSession = {
      ...session,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || session.refreshToken,
      authId: data.user?.id || session.authId,
      loginTime: new Date().toISOString()
    };
    store.saveSession(newSession);
    setAuthToken(data.access_token);
    return true;
  } catch { return false; }
}

export class OnboardingManager {
  constructor(store) { this.store = store; }
  validateUserData(d) {
    const e = [];
    if (!d.email || !d.email.includes('@')) e.push('Valid email is required');
    if (!d.mobile || d.mobile.length < 10) e.push('Valid mobile number is required');
    if (!d.name || d.name.length < 2) e.push('Name is required');
    if (!d.homeZone) e.push('Home zone is required');
    if (!d.officeAddress) e.push('Office address is required');
    if (!d.officeEntryTime || !d.officeExitTime) e.push('Office timings are required');
    if (!d.carCompany || !d.carModel) e.push('Car details are required');
    if (!d.carNumber || !d.carNumber.match(/^[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}$/)) e.push('Valid car plate required (e.g., MH14KM1234)');
    if (d.vacantSeats < 2 || d.vacantSeats > 4) e.push('Vacant seats must be between 2 and 4');
    return e;
  }
  async saveUser(d) {
    return await this.store.saveUser({ ...d, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
}