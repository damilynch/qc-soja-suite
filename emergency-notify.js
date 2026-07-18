/**
 * SOJ QC — Emergency notification watcher.
 * Included on every page except /emergency/ itself via:
 *   <script src="/emergency-notify.js" defer></script>
 *
 * HONEST LIMITATION: this only works while the app is OPEN (foreground or
 * backgrounded tab/installed app). It cannot wake up a fully closed app —
 * that requires a real push server (e.g. Web Push + a push provider), which
 * is a separate, bigger upgrade. This polls every 45 seconds while running.
 */
(function () {
  'use strict';

  // ====== CONFIG — paste your Emergency Apps Script Web App URL here ======
  var EMERGENCY_API_URL = 'https://script.google.com/macros/s/AKfycbzZJ5LEnQGUAC8ChcZ--oxUfUkJMYG8jg-IRUu2i_KcqFD6GByKk5ahTIrbMXz8sjDNMQ/exec';
  // ==========================================================================

  var POLL_INTERVAL_MS = 45000;
  var SINCE_KEY = 'soj-qc-emergency-since';
  var PERM_ASKED_KEY = 'soj-qc-emergency-perm-asked';

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ---------- Permission opt-in banner (shown once, low-key) ----------
  function maybeAskPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return;
    if (localStorage.getItem(PERM_ASKED_KEY)) return;

    var style = document.createElement('style');
    style.textContent =
      '#soj-emg-permban{position:fixed;left:16px;right:16px;top:16px;z-index:99998;max-width:480px;margin:0 auto;' +
      'background:rgba(255,255,255,0.95);backdrop-filter:blur(10px);border:1.5px solid rgba(220,38,38,0.25);' +
      'border-radius:16px;box-shadow:0 10px 30px rgba(220,38,38,0.18);padding:14px 16px;' +
      'font-family:-apple-system,Inter,"Segoe UI",sans-serif;display:flex;gap:10px;align-items:center;}' +
      '#soj-emg-permban p{margin:0;font-size:12.5px;color:#1E2233;font-weight:600;flex:1;}' +
      '#soj-emg-permban button{border:none;border-radius:9px;font-size:12px;font-weight:700;padding:7px 12px;cursor:pointer;font-family:inherit;}' +
      '#soj-emg-permban .yes{background:linear-gradient(135deg,#DC2626,#F97316);color:#fff;}' +
      '#soj-emg-permban .no{background:#fff;border:1.5px solid #E4E1F5 !important;color:#6B7280;}';
    document.head.appendChild(style);

    var el = document.createElement('div');
    el.id = 'soj-emg-permban';
    el.innerHTML =
      '<p>🚨 Enable emergency alerts on this device?</p>' +
      '<button class="yes">Enable</button>' +
      '<button class="no">Not now</button>';
    document.body.appendChild(el);

    el.querySelector('.yes').addEventListener('click', function () {
      Notification.requestPermission().finally(function () {
        localStorage.setItem(PERM_ASKED_KEY, '1');
        el.remove();
      });
    });
    el.querySelector('.no').addEventListener('click', function () {
      localStorage.setItem(PERM_ASKED_KEY, '1');
      el.remove();
    });
  }

  // ---------- In-page red banner: single carousel, not a stack ----------
  var emergencyQueue = [];
  var currentIdx = 0;
  var autoAdvanceTimer = null;

  function ensureStyles() {
    if (document.getElementById('soj-emg-style')) return;
    var style = document.createElement('style');
    style.id = 'soj-emg-style';
    style.textContent =
      '#soj-emg-alert-container{position:fixed;left:16px;right:16px;bottom:16px;z-index:99999;max-width:480px;margin:0 auto;' +
      'background:linear-gradient(135deg,#DC2626,#F97316);color:#fff;border-radius:16px;' +
      'box-shadow:0 14px 36px rgba(220,38,38,0.4);padding:16px 18px;overflow:hidden;' +
      'font-family:-apple-system,Inter,"Segoe UI",sans-serif;}' +
      '.soj-emg-inner{animation:soj-emg-slide .35s ease;}' +
      '@keyframes soj-emg-slide{from{transform:translateX(24px);opacity:0}to{transform:translateX(0);opacity:1}}' +
      '#soj-emg-alert-container .pager{font-size:11px;font-weight:800;letter-spacing:0.5px;opacity:0.85;margin:0 0 6px;}' +
      '#soj-emg-alert-container .t{font-size:13.5px;font-weight:800;margin:0 0 4px;}' +
      '#soj-emg-alert-container .b{font-size:13px;line-height:1.5;margin:0 0 12px;opacity:0.95;}' +
      '#soj-emg-alert-container .actions{display:flex;gap:8px;}' +
      '#soj-emg-alert-container button{background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:9px;' +
      'font-size:12px;font-weight:700;padding:7px 14px;cursor:pointer;}' +
      '#soj-emg-alert-container button.next{background:rgba(255,255,255,0.9);color:#B91C1C;}' +
      '@media (min-width:640px){#soj-emg-alert-container{left:auto;right:24px;width:380px;}}';
    document.head.appendChild(style);
  }

  function renderCurrent() {
    var container = document.getElementById('soj-emg-alert-container');

    if (emergencyQueue.length === 0) {
      if (container) container.remove();
      clearInterval(autoAdvanceTimer);
      autoAdvanceTimer = null;
      return;
    }

    ensureStyles();
    if (!container) {
      container = document.createElement('div');
      container.id = 'soj-emg-alert-container';
      document.body.appendChild(container);
    }
    if (currentIdx >= emergencyQueue.length) currentIdx = 0;
    var em = emergencyQueue[currentIdx];
    var total = emergencyQueue.length;

    container.innerHTML =
      '<div class="soj-emg-inner">' +
      (total > 1 ? '<p class="pager">🚨 ALERT ' + (currentIdx + 1) + ' OF ' + total + '</p>' : '') +
      '<p class="t">EMERGENCY — ' + esc(em.location) + '</p>' +
      '<p class="b">' + esc(em.description) + '<br><span style="opacity:0.8;">Reported by ' + esc(em.reportedBy) + '</span></p>' +
      '<div class="actions">' +
      (total > 1 ? '<button class="next">Next →</button>' : '') +
      '<button class="dismiss">Dismiss</button>' +
      '</div></div>';

    var nextBtn = container.querySelector('.next');
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        currentIdx = (currentIdx + 1) % emergencyQueue.length;
        renderCurrent();
        startAutoAdvance(); // reset the timer so it doesn't jump right after a manual click
      });
    }
    container.querySelector('.dismiss').addEventListener('click', function () {
      emergencyQueue.splice(currentIdx, 1);
      if (currentIdx >= emergencyQueue.length) currentIdx = 0;
      renderCurrent();
    });
  }

  function startAutoAdvance() {
    clearInterval(autoAdvanceTimer);
    if (emergencyQueue.length <= 1) return;
    autoAdvanceTimer = setInterval(function () {
      currentIdx = (currentIdx + 1) % emergencyQueue.length;
      renderCurrent();
    }, 6000);
  }

  function addEmergencies(list) {
    if (!list || !list.length) return;
    list.forEach(function (em) { emergencyQueue.push(em); });
    renderCurrent();
    startAutoAdvance();
  }

  // ---------- OS-level notification, if permission granted ----------
  function showOsNotification(emergency) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    var body = emergency.description + ' — reported by ' + emergency.reportedBy;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(function (reg) {
        reg.showNotification('🚨 Emergency — ' + emergency.location, {
          body: body,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag: 'soj-qc-emergency',
          requireInteraction: true
        });
      });
    } else {
      new Notification('🚨 Emergency — ' + emergency.location, { body: body });
    }
  }

  // ---------- Polling loop ----------
  function poll() {
    if (EMERGENCY_API_URL.indexOf('PASTE_YOUR') === 0) return; // not configured yet
    var since = localStorage.getItem(SINCE_KEY) || '0';
    fetch(EMERGENCY_API_URL + '?action=checkEmergency&since=' + since)
      .then(function (res) { return res.json(); })
      .then(function (result) {
        if (!result || !result.ok) return;
        if (result.emergencies && result.emergencies.length) {
          result.emergencies.forEach(function (em) { showOsNotification(em); });
          addEmergencies(result.emergencies);
        }
        localStorage.setItem(SINCE_KEY, String(result.serverNow || Date.now()));
      })
      .catch(function () { /* silent — don't nag the user about a failed poll */ });
  }

  // First poll just establishes the "since" baseline without alerting on
  // pre-existing history; skip alerting on the very first run.
  function primeBaseline() {
    if (EMERGENCY_API_URL.indexOf('PASTE_YOUR') === 0) return;
    if (localStorage.getItem(SINCE_KEY)) { poll(); return; }
    fetch(EMERGENCY_API_URL + '?action=checkEmergency&since=0')
      .then(function (res) { return res.json(); })
      .then(function (result) {
        localStorage.setItem(SINCE_KEY, String((result && result.serverNow) || Date.now()));
      })
      .catch(function () {});
  }

  maybeAskPermission();
  primeBaseline();
  setInterval(poll, POLL_INTERVAL_MS);
})();
