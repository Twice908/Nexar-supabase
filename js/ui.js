export const icons = {
  bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`,
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 22V12h6v10"/></svg>`,
  car: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  chevronRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
  chevronLeft: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
  walk: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="13" cy="4" r="2"/><path d="m10 22 2-7 3 3v6"/><path d="M9 15 6 8l4-1 3 4 4 2"/><path d="M6 8 4 4"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
};

export function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function initials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export function toast(message, variant = '') {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = 'toast' + (variant ? ` toast-${variant}` : '');
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    el.style.transition = 'all 200ms ease';
    setTimeout(() => el.remove(), 220);
  }, 3000);
}

// Bottom sheet
export function openSheet({ title, content, onClose }) {
  const root = document.getElementById('sheet-root');
  root.innerHTML = `
    <div class="sheet-backdrop" data-close></div>
    <div class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-grabber"></div>
      ${title ? `
        <div class="sheet-header">
          <span class="h3">${escapeHtml(title)}</span>
          <button class="icon-btn" data-close aria-label="Close">${icons.x}</button>
        </div>
      ` : ''}
      <div class="sheet-body">${content}</div>
    </div>
  `;
  const backdrop = root.querySelector('.sheet-backdrop');
  const sheet = root.querySelector('.sheet');

  requestAnimationFrame(() => {
    backdrop.classList.add('is-open');
    sheet.classList.add('is-open');
  });

  const close = () => {
    backdrop.classList.remove('is-open');
    sheet.classList.remove('is-open');
    setTimeout(() => { root.innerHTML = ''; onClose && onClose(); }, 320);
  };

  root.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', close));
  return { close, sheet };
}

// Full-screen modal
export function openModal({ title, content, onClose }) {
  const el = document.createElement('div');
  el.className = 'modal';
  el.innerHTML = `
    <div class="modal-header">
      <button class="icon-btn" data-close aria-label="Back">${icons.chevronLeft}</button>
      <span class="modal-title">${escapeHtml(title || '')}</span>
      <span style="width:36px"></span>
    </div>
    <div class="modal-body">${content}</div>
  `;
  document.getElementById('root').appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-open'));

  const close = () => {
    el.classList.remove('is-open');
    setTimeout(() => { el.remove(); onClose && onClose(); }, 320);
  };
  el.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  return { el, close };
}

export function theme() {
  return document.documentElement.getAttribute('data-theme') || 'light';
}

export function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('nexar_theme', t);
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', t === 'dark' ? '#0a0a0a' : '#ffffff');
}

export function toggleTheme() {
  setTheme(theme() === 'dark' ? 'light' : 'dark');
}