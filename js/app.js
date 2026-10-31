/* ═══════════════ Marimic Party — app logic ═══════════════
 * Realtime multiplayer "pick a number" party game.
 * One host (big screen), unlimited players (phones, via QR code).
 * Firebase Realtime Database keeps everyone in sync.
 */
(function () {
  'use strict';

  var DEFAULT_ROUND_MS = 20_000;      // fallback round length
  var CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I/L/O/0/1
  var NUMBERS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  function durationOf(room) {
    return (room && room.durationMs) || DEFAULT_ROUND_MS;
  }

  /* ─────────── tiny helpers ─────────── */

  function $(sel) { return document.querySelector(sel); }

  function show(viewId) {
    ['view-landing', 'view-host', 'view-join', 'view-play', 'view-setup', 'view-error']
      .forEach(function (id) { $('#' + id).classList.toggle('hidden', id !== viewId); });
  }

  function goto(hash) { location.hash = hash; }

  function randomCode() {
    var out = '';
    for (var i = 0; i < 5; i++) {
      out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return out;
  }

  function randomId() {
    return 'p' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ─────────── firebase ─────────── */

  var db = null;
  var serverOffset = 0; // serverTime - localTime
  var playPickHandler = null; // set by the current play view, cleared on leave

  function firebaseReady() {
    var cfg = window.FIREBASE_CONFIG;
    if (!cfg || !cfg.apiKey || !cfg.databaseURL) return false;
    if (String(cfg.apiKey).indexOf('PASTE') === 0) return false;
    try {
      firebase.initializeApp(cfg);
      db = firebase.database();
      db.ref('.info/serverTimeOffset').on('value', function (snap) {
        serverOffset = snap.val() || 0;
      });
      return true;
    } catch (e) {
      console.error('Firebase init failed', e);
      return false;
    }
  }

  function now() { return Date.now() + serverOffset; }

  var TIMESTAMP = function () { return firebase.database.ServerValue.TIMESTAMP; };

  /* ─────────── shared view state ─────────── */

  var cleanupFns = [];   // unsubscribes / intervals from the current view

  function onCleanup(fn) { cleanupFns.push(fn); }

  function cleanup() {
    cleanupFns.forEach(function (fn) {
      try { fn(); } catch (e) { /* ignore */ }
    });
    cleanupFns = [];
  }

  function showError(title, message) {
    $('#error-title').textContent = title;
    $('#error-message').textContent = message;
    show('view-error');
  }

  /* ─────────── router ─────────── */

  function route() {
    cleanup();
    var parts = (location.hash || '#/').replace(/^#\/?/, '').split('/').filter(Boolean);
    var page = parts[0] || 'landing';

    if (!db && page !== 'landing') { show('view-setup'); return; }

    switch (page) {
      case 'host': viewHost((parts[1] || '').toUpperCase()); break;
      case 'join': viewJoin((parts[1] || '').toUpperCase()); break;
      case 'play': viewPlay((parts[1] || '').toUpperCase()); break;
      default:     viewLanding();
    }
  }

  /* ═══════════════ Landing ═══════════════ */

  function viewLanding() {
    show('view-landing');

    $('#btn-host').onclick = function () {
      createRoom().then(function (code) { goto('#/host/' + code); });
    };

    $('#join-code-form').onsubmit = function (e) {
      e.preventDefault();
      var code = $('#join-code-input').value.toUpperCase().trim();
      var err = $('#join-code-error');
      if (!/^[A-Z2-9]{4,8}$/.test(code)) {
        err.textContent = 'That does not look like a room code.';
        err.classList.remove('hidden');
        return;
      }
      err.classList.add('hidden');
      goto('#/join/' + code);
    };
  }

  function createRoom() {
    var code = randomCode();
    return db.ref('rooms/' + code).transaction(function (cur) {
      if (cur !== null) return;      // room already exists → abort, caller retries
      return { createdAt: TIMESTAMP(), status: 'lobby' };
    }).then(function (res) {
      if (res.committed) return code;
      return createRoom();           // astronomically rare collision
    });
  }

  /* ═══════════════ Host ═══════════════ */

  function viewHost(code) {
    if (!code) {
      // Deep-linked without a room: mint one, then reload this route.
      createRoom().then(function (c) { goto('#/host/' + c); });
      return;
    }

    show('view-host');
    $('#host-code').textContent = code;

    var roomRef = db.ref('rooms/' + code);
    var state = { room: null, qrUrl: null };

    // Room deleted from under us?
    roomRef.once('value').then(function (snap) {
      if (!snap.exists()) showError('Room not found', 'This game has ended or never existed.');
    });

    // Live room updates
    roomRef.on('value', function (snap) {
      state.room = snap.val();
      renderHost(state);
    }, function (err) {
      showError('Connection problem', err.message);
    });
    onCleanup(function () { roomRef.off(); });

    // Countdown ticker (also flips an active round to 'ended' when time is up)
    var tick = setInterval(function () {
      var r = state.room;
      if (!r) return;
      if (r.status === 'active' && r.startedAt && now() >= r.startedAt + durationOf(r)) {
        roomRef.update({ status: 'ended' });
      }
      renderHostCountdown(r);
    }, 250);
    onCleanup(function () { clearInterval(tick); });

    // Round length picker (only usable in the lobby)
    $('#host-duration').onclick = function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('button[data-sec]') : null;
      if (!btn || !btn.dataset.sec) return;
      if (!state.room || state.room.status !== 'lobby') return;
      roomRef.update({ durationMs: parseInt(btn.dataset.sec, 10) * 1000 });
    };

    // Controls
    $('#btn-start').onclick = function () {
      var players = state.room && state.room.players ? state.room.players : {};
      var up = {
        status: 'active',
        startedAt: TIMESTAMP(),
        durationMs: durationOf(state.room),
        numbers: null
      };
      Object.keys(players).forEach(function (pid) {
        up['players/' + pid + '/picked'] = null;
      });
      roomRef.update(up);
    };

    $('#btn-newround').onclick = function () {
      var players = state.room && state.room.players ? state.room.players : {};
      var up = { status: 'lobby', startedAt: null, numbers: null };
      Object.keys(players).forEach(function (pid) {
        up['players/' + pid + '/picked'] = null;
      });
      roomRef.update(up);
    };

    $('#btn-delete').onclick = function () {
      if (!confirm('Delete this room for everyone?')) return;
      roomRef.remove().then(function () { goto('#/'); });
    };

    function renderHost(s) {
      if (!s.room) return; // room vanished; the once() above handles messaging

      // QR code (render once per room)
      var url = joinUrl(code);
      if (s.qrUrl !== url && window.qrcode) {
        s.qrUrl = url;
        var qr = qrcode(0, 'M');
        qr.addData(url);
        qr.make();
        $('#host-qr').innerHTML = qr.createSvgTag(4, 2);
        var svg = $('#host-qr svg');
        if (svg) { svg.setAttribute('width', '232'); svg.setAttribute('height', '232'); }
      }

      // Status pill
      var pill = $('#host-status');
      pill.classList.remove('live', 'over');
      if (s.room.status === 'active') { pill.textContent = '🔴 Live'; pill.classList.add('live'); }
      else if (s.room.status === 'ended') { pill.textContent = '⏳ Round over'; pill.classList.add('over'); }
      else { pill.textContent = '⏸ Lobby'; }

      // Buttons
      $('#btn-start').classList.toggle('hidden', s.room.status !== 'lobby');
      $('#btn-newround').classList.toggle('hidden', s.room.status !== 'ended');
      $('#host-hint').classList.toggle('hidden', s.room.status !== 'lobby');
      $('#host-duration').classList.toggle('hidden', s.room.status !== 'lobby');

      // Highlight the chosen round length
      var seconds = Math.round(durationOf(s.room) / 1000);
      ['10', '20', '30'].forEach(function (sec) {
        $('#host-duration button[data-sec="' + sec + '"]').classList.toggle('active', sec === String(seconds));
      });

      renderHostCountdown(s.room);
      renderHostNumbers(s.room);
      renderHostPlayers(s.room);
    }

    function renderHostCountdown(r) {
      var el = $('#host-countdown');
      var active = r && r.status === 'active' && r.startedAt;
      el.classList.toggle('hidden', !active);
      if (!active) return;
      var secs = Math.max(0, Math.ceil((r.startedAt + durationOf(r) - now()) / 1000));
      el.textContent = '0:' + String(secs).padStart(2, '0');
      el.classList.toggle('urgent', secs <= 5);
    }
  }

  function renderHostNumbers(room) {
    var nums = room.numbers || {};
    var html = NUMBERS.map(function (n) {
      var hit = nums[n];
      var owner = hit ? escapeHtml(hit.name) : 'free';
      return '<div class="num-cell' + (hit ? ' taken' : '') + '">' + n +
             '<span class="owner">' + owner + '</span></div>';
    }).join('');
    $('#host-numbers').innerHTML = html;
  }

  function renderHostPlayers(room) {
    var list = $('#host-players');
    var players = room.players || {};
    var ids = Object.keys(players);
    $('#host-count').textContent = ids.length;

    if (!ids.length) {
      list.innerHTML = '<li class="muted">Nobody here yet — waiting for the first player to scan the QR code…</li>';
      return;
    }

    ids.sort(function (a, b) { return (players[a].at || 0) - (players[b].at || 0); });
    list.innerHTML = ids.map(function (pid) {
      var p = players[pid];
      var picked = p.picked === 0 || p.picked ? p.picked : null;
      return '<li class="' + (picked === null ? 'waiting' : '') + '">' + escapeHtml(p.name) +
             '<span class="pick">' + (picked === null ? '…' : '#' + picked) + '</span></li>';
    }).join('');
  }

  /* ═══════════════ Join (name entry) ═══════════════ */

  function viewJoin(code) {
    if (!code || !/^[A-Z2-9]{4,8}$/.test(code)) {
      showError('Invalid room code', 'Ask the host for the code shown next to the QR code.');
      return;
    }

    show('view-join');
    $('#join-room-label').textContent = code;

    var input = $('#join-name-input');
    input.value = sessionStorage.getItem('mp:name') || '';
    input.focus();

    $('#join-name-form').onsubmit = function (e) {
      e.preventDefault();
      var name = input.value.trim().slice(0, 20);
      var err = $('#join-name-error');
      if (!name) {
        err.textContent = 'Please enter a name.';
        err.classList.remove('hidden');
        return;
      }
      err.classList.add('hidden');

      // Verify the room exists before writing anything.
      db.ref('rooms/' + code).once('value').then(function (snap) {
        if (!snap.exists()) {
          showError('Room not found', 'No game with code ' + code + ' is running. Check the code and try again.');
          return;
        }
        var pid = playerIdFor(code);
        sessionStorage.setItem('mp:name', name);
        return db.ref('rooms/' + code + '/players/' + pid)
          .update({ name: name, at: TIMESTAMP() })
          .then(function () { goto('#/play/' + code); });
      }).catch(function (e2) {
        showError('Connection problem', e2.message);
      });
    };
  }

  function playerIdFor(code) {
    var key = 'mp:pid:' + code;
    var pid = sessionStorage.getItem(key);
    if (!pid) {
      pid = randomId();
      sessionStorage.setItem(key, pid);
    }
    return pid;
  }

  /* ═══════════════ Player ═══════════════ */

  function viewPlay(code) {
    var pid = sessionStorage.getItem('mp:pid:' + code);
    var name = sessionStorage.getItem('mp:name');
    if (!code || !pid || !name) { goto('#/join/' + code); return; }

    show('view-play');
    $('#play-code').textContent = code;

    var roomRef = db.ref('rooms/' + code);
    var state = { room: null, picking: false, message: null };

    function myPick(room) {
      var me = room && room.players && room.players[pid];
      if (me && (me.picked === 0 || me.picked)) return me.picked;
      return null;
    }

    roomRef.on('value', function (snap) {
      state.room = snap.val();
      if (!state.room) {
        showError('Game ended', 'The host deleted this room. Start a new game from the home screen.');
        return;
      }
      if (state.room.status !== 'active') state.message = null; // fresh round, fresh slate
      renderPlay();
    }, function (err) {
      showError('Connection problem', err.message);
    });
    onCleanup(function () { roomRef.off(); });

    var tick = setInterval(renderPlay, 250);
    onCleanup(function () { clearInterval(tick); });

    // Single delegated listener (registered once at boot) routes clicks here.
    playPickHandler = pick;
    onCleanup(function () { playPickHandler = null; });

    function pick(n) {
      var room = state.room;
      if (!room || state.picking || myPick(room) !== null) return;
      if (room.status !== 'active' || now() >= (room.startedAt || 0) + durationOf(room)) return;

      state.picking = true;
      state.message = null;
      renderPlay();

      // Atomic claim: only one player can win a given number.
      roomRef.child('numbers/' + n).transaction(function (cur) {
        if (cur !== null) return;                    // already taken → abort
        return { playerId: pid, name: name, at: TIMESTAMP() };
      }).then(function (res) {
        state.picking = false;
        if (res.committed) {
          // Record the pick on the player too (drives the host's player list).
          roomRef.child('players/' + pid + '/picked').set(n);
          state.message = { text: '🎉 You picked ' + n + '!', cls: 'good' };
        } else {
          var takenBy = res.snapshot.val();
          state.message = {
            text: '😮 ' + n + ' was just taken by ' + (takenBy ? takenBy.name : 'someone') + ' — pick another!',
            cls: 'bad'
          };
        }
        renderPlay();
      });
    }

    function renderPlay() {
      var room = state.room;
      if (!room) return;

      var players = room.players || {};
      $('#play-count').textContent = Object.keys(players).length;

      var chosen = myPick(room);
      var active = room.status === 'active' && room.startedAt;
      var remaining = active ? room.startedAt + durationOf(room) - now() : 0;
      var live = active && remaining > 0;

      // Countdown
      var cd = $('#play-countdown');
      cd.classList.toggle('hidden', !live);
      if (live) {
        var secs = Math.max(0, Math.ceil(remaining / 1000));
        cd.textContent = '0:' + String(secs).padStart(2, '0');
        cd.classList.toggle('urgent', secs <= 5);
      }

      // Status line
      var status = $('#play-status');
      var text, cls = '';
      if (chosen !== null) {
        text = '✅ You picked ' + chosen + '. Good luck!';
        cls = 'good';
      } else if (room.status === 'active' && !live) {
        text = "⏰ Time's up! Numbers are locked.";
      } else if (!live) {
        text = '⏳ Waiting for the host to start the game…';
      } else if (state.picking) {
        text = 'Picking…';
      } else if (state.message) {
        text = state.message.text;
        cls = state.message.cls;
      } else {
        text = '👉 Tap a number to claim it!';
      }
      status.textContent = text;
      status.className = 'play-status ' + cls;

      // Number grid
      var taken = room.numbers || {};
      $('#play-numbers').innerHTML = NUMBERS.map(function (n) {
        var isMine = chosen === n;
        var isTaken = !isMine && taken[n];
        var disabled = isTaken || !live || chosen !== null || state.picking;
        return '<button type="button" class="num-cell' + (isMine ? ' mine' : '') + '"' +
               ' data-num="' + n + '"' + (disabled ? ' disabled' : '') + '>' + n + '</button>';
      }).join('');
    }
  }

  /* ═══════════════ misc ═══════════════ */

  function joinUrl(code) {
    return location.origin + location.pathname + '#/join/' + code;
  }

  /* ─────────── boot ─────────── */

  if (firebaseReady()) {
    window.addEventListener('hashchange', route);

    // One delegated click listener for the player number grid.
    $('#play-numbers').addEventListener('click', function (e) {
      var btn = e.target.closest('button.num-cell');
      if (!btn || !btn.dataset.num || !playPickHandler) return;
      playPickHandler(parseInt(btn.dataset.num, 10));
    });

    route();
  } else {
    show('view-setup');
  }
})();
