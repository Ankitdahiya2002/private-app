/* ====================================================================
   CHAT PAGE — REAL-TIME SOCKET.IO CLIENT
   ==================================================================== */

// ── 1. Parse URL params ───────────────────────────────────────────────
const params   = new URLSearchParams(window.location.search);
const ME       = params.get('name')?.trim() || localStorage.getItem('privchat_name') || 'You';
const ROOM     = params.get('room')?.trim().toUpperCase() || localStorage.getItem('privchat_room') || '';

if (!ME || !ROOM) {
  window.location.href = '/';
}

localStorage.setItem('privchat_name', ME);
localStorage.setItem('privchat_room', ROOM);

// ── 2. State ──────────────────────────────────────────────────────────
let onlineUsers     = [];          // list of usernames currently in room
let typingTimers    = {};          // { username: timeoutId }
let typingUsers     = new Set();   // usernames currently typing
let contextTarget   = null;        // { id, sender, text } for context menu
let typingDebounce  = null;        // my own typing debounce
let isTypingActive  = false;
let lastMsgTs       = 0;           // timestamp of latest message (for seen)

// DOM references
const messagesArea   = document.getElementById('messages-area');
const emptyState     = document.getElementById('empty-state');
const msgInput       = document.getElementById('msg-input');
const btnSend        = document.getElementById('btn-send');
const typingBar      = document.getElementById('typing-bar');
const typingLabel    = document.getElementById('typing-label');
const onlineList     = document.getElementById('online-list');
const headerName     = document.getElementById('header-name');
const headerRoom     = document.getElementById('header-room');
const headerStatus   = document.getElementById('header-status');
const headerAvatar   = document.getElementById('header-avatar');
const headerOnlineDot= document.getElementById('header-online-dot');
const meNameDisplay  = document.getElementById('me-name-display');
const meAvatar       = document.getElementById('me-avatar');
const roomDisplay    = document.getElementById('room-display');
const contextMenu    = document.getElementById('context-menu');
const lightbox       = document.getElementById('lightbox');
const lightboxImg    = document.getElementById('lightbox-img');
const toastContainer = document.getElementById('toast-container');
const emojiPanel     = document.getElementById('emoji-panel');
const emojiTabs      = document.getElementById('emoji-tabs');
const emojiGrid      = document.getElementById('emoji-grid');
const btnEmoji       = document.getElementById('btn-emoji');

// ── 3. Initialise UI ──────────────────────────────────────────────────
meNameDisplay.textContent        = ME;
meAvatar.textContent             = initials(ME);
roomDisplay.textContent          = ROOM;
headerRoom.textContent           = ROOM;

// ── 4. Connect Socket.IO ──────────────────────────────────────────────
const socket = io({ transports: ['websocket', 'polling'] });

socket.on('connect', () => {
  socket.emit('join', { username: ME, room: ROOM });
  // Personalized welcome
  setTimeout(() => {
    if (ME.toLowerCase() === 'tanvi') {
      showToast('Welcome back, Tanvi 💕 He misses you!');
    } else {
      showToast(`You're in your private space 🔒💕`);
    }
  }, 600);
});

socket.on('disconnect', () => {
  showToast('⚠️ Connection lost. Reconnecting…');
  updateStatus(false);
});

socket.on('connect_error', () => {
  showToast('Could not connect to server.');
});

// ── 5. Socket events ──────────────────────────────────────────────────

/** Full message history on join */
socket.on('history', (messages) => {
  messagesArea.innerHTML = '';
  if (messages.length === 0) {
    messagesArea.appendChild(emptyState);
    return;
  }
  messages.forEach(m => renderMessage(m, false));
  scrollBottom(false);
  // mark visible messages as seen
  markSeen();
});

/** New real-time message */
socket.on('message', (msg) => {
  hideEmpty();
  renderMessage(msg, true);
  scrollBottom(true);
  if (msg.sender !== ME) markSeen();
});

/** Someone joined */
socket.on('user_joined', ({ username, online_users }) => {
  onlineUsers = online_users;
  updateOnlineList();
  updateHeader();
  showToast(`${username} joined the room ✨`);
});

/** Online users list (sent to joining user) */
socket.on('online_users', (users) => {
  onlineUsers = users;
  updateOnlineList();
  updateHeader();
});

/** Someone left */
socket.on('user_left', ({ username, online_users }) => {
  onlineUsers = online_users;
  updateOnlineList();
  updateHeader();
  showToast(`${username} left the room`);
});

/** Typing indicator from a friend */
socket.on('typing', ({ username }) => {
  if (username === ME) return;
  typingUsers.add(username);
  showTyping();

  clearTimeout(typingTimers[username]);
  typingTimers[username] = setTimeout(() => {
    typingUsers.delete(username);
    showTyping();
  }, 3000);
});

/** Friend stopped typing */
socket.on('stop_typing', ({ username }) => {
  if (username === ME) return;
  typingUsers.delete(username);
  clearTimeout(typingTimers[username]);
  showTyping();
});

/** Server acks a "seen" event — update tick on last sent message */
socket.on('seen', ({ reader, up_to_ts }) => {
  if (reader === ME) return;
  // Mark all sent bubbles up to this timestamp as seen
  document.querySelectorAll('.msg-row.sent[data-ts]').forEach(row => {
    if (Number(row.dataset.ts) <= Number(up_to_ts)) {
      const tick = row.querySelector('.bubble-tick');
      if (tick) tick.classList.add('seen');
    }
  });
  // Show seen avatar on very last message
  updateSeenAvatars(reader, up_to_ts);
});

/** Message deleted */
socket.on('delete_message', ({ msg_id }) => {
  const el = document.getElementById(`msg-${msg_id}`);
  if (el) {
    el.style.animation = 'msg-out 0.22s ease forwards';
    setTimeout(() => el.remove(), 230);
  }
});

// ── 6. Send message ───────────────────────────────────────────────────
function sendMessage(text, imageUrl) {
  if (!text && !imageUrl) return;
  const msg = {
    id:        crypto.randomUUID(),
    room:      ROOM,
    sender:    ME,
    text:      text || '',
    image_url: imageUrl || '',
    ts:        Date.now(),
  };
  socket.emit('message', msg);
  stopMyTyping();
}

btnSend.addEventListener('click', () => {
  const text = msgInput.value.trim();
  if (!text) return;
  sendMessage(text, '');
  spawnHearts();
  msgInput.value = '';
  autoResizeTextarea();
  btnSend.disabled = true;
});

msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    btnSend.click();
  }
});

msgInput.addEventListener('input', () => {
  autoResizeTextarea();
  btnSend.disabled = msgInput.value.trim().length === 0;
  // Typing indicator
  if (!isTypingActive) {
    isTypingActive = true;
    socket.emit('typing', { username: ME, room: ROOM });
  }
  clearTimeout(typingDebounce);
  typingDebounce = setTimeout(stopMyTyping, 2000);
});

function stopMyTyping() {
  if (isTypingActive) {
    isTypingActive = false;
    socket.emit('stop_typing', { username: ME, room: ROOM });
  }
  clearTimeout(typingDebounce);
}

function autoResizeTextarea() {
  msgInput.style.height = 'auto';
  msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
}

// ── 7. Image upload ───────────────────────────────────────────────────
const fileInput  = document.getElementById('file-input');
const btnImage   = document.getElementById('btn-image');

btnImage.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;

  if (file.size > 10 * 1024 * 1024) {
    showToast('Image too large — max 10 MB');
    return;
  }

  const formData = new FormData();
  formData.append('image', file);

  btnImage.disabled = true;
  showToast('Uploading image…');

  try {
    const res  = await fetch('/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.url) {
      sendMessage('', data.url);
      spawnHearts();
    } else {
      showToast('Upload failed: ' + (data.error || 'unknown error'));
    }
  } catch (err) {
    showToast('Upload error. Please try again.');
  } finally {
    btnImage.disabled = false;
    fileInput.value   = '';
  }
});

// ── 8. Render message ─────────────────────────────────────────────────
const _lastSenderTs = {}; // { sender: last rendered ts } for grouping

function renderMessage(msg, animate) {
  const isSent = msg.sender === ME;
  const side   = isSent ? 'sent' : 'recv';
  const ts     = Number(msg.ts);

  if (ts > lastMsgTs) lastMsgTs = ts;

  // ── Date separator ──
  const msgDate = new Date(ts);
  const dateKey = msgDate.toDateString();
  if (!messagesArea.querySelector(`[data-date="${dateKey}"]`)) {
    const sep = document.createElement('div');
    sep.className        = 'date-sep';
    sep.dataset.date     = dateKey;
    sep.textContent      = formatDate(msgDate);
    messagesArea.appendChild(sep);
  }

  // ── Determine grouping ──
  const prevSib  = messagesArea.lastElementChild;
  const sameUser = prevSib && prevSib.dataset.sender === msg.sender;

  // Outer wrapper
  const group = document.createElement('div');
  group.id           = `msg-${msg.id}`;
  group.className    = `msg-group`;
  group.dataset.id   = msg.id;
  group.dataset.sender = msg.sender;
  group.dataset.text   = msg.text || '';

  if (!animate) group.style.animation = 'none';

  // Sender name for recv (first in group only)
  if (!isSent && !sameUser) {
    const nameEl = document.createElement('div');
    nameEl.className   = 'bubble-sender-name';
    nameEl.textContent = msg.sender;
    group.appendChild(nameEl);
  }

  // ── Row ──
  const row = document.createElement('div');
  row.className    = `msg-row ${side}`;
  row.dataset.id   = msg.id;
  row.dataset.ts   = ts;
  row.dataset.sender = msg.sender;
  if (sameUser) row.classList.add('no-head');

  // Avatar (recv side, last in group only → we'll handle tail later)
  let avatarEl = null;
  if (!isSent) {
    avatarEl = document.createElement('div');
    avatarEl.className   = `avatar avatar--bubble`;
    avatarEl.textContent = initials(msg.sender);
    avatarEl.style.background = 'var(--grad-avatar)';
    avatarEl.style.visibility = sameUser ? 'hidden' : 'visible';
    row.appendChild(avatarEl);
  }

  // Bubble
  const bubble = document.createElement('div');
  if (msg.image_url) {
    bubble.className = `bubble bubble-image`;
    const img = document.createElement('img');
    img.src    = msg.image_url;
    img.alt    = `Image from ${msg.sender}`;
    img.loading = 'lazy';
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      openLightbox(msg.image_url);
    });
    bubble.appendChild(img);
  } else {
    bubble.className   = 'bubble';
    bubble.textContent = msg.text;
  }

  // Context menu on right-click / long-press
  setupContextMenu(bubble, msg);
  row.appendChild(bubble);

  // ── Tick icon for sent ──
  if (isSent) {
    const ph = document.createElement('div');
    ph.className = 'bubble-avatar-placeholder';
    row.appendChild(ph);
  }

  group.appendChild(row);

  // ── Meta (time + tick) ──
  const meta = document.createElement('div');
  meta.className = `bubble-meta`;

  const timeEl = document.createElement('span');
  timeEl.className   = 'bubble-time';
  timeEl.textContent = formatTime(msgDate);
  meta.appendChild(timeEl);

  if (isSent) {
    const tick = document.createElement('span');
    tick.className = `bubble-tick${msg.seen ? ' seen' : ''}`;
    tick.innerHTML = tickSVG();
    tick.title     = msg.seen ? 'Seen' : 'Delivered';
    meta.appendChild(tick);
  }

  group.appendChild(meta);

  // Seen row placeholder (only for sent)
  if (isSent) {
    const seenRow = document.createElement('div');
    seenRow.className = 'seen-row';
    seenRow.id        = `seen-row-${msg.id}`;
    group.appendChild(seenRow);
  }

  messagesArea.appendChild(group);

  // Remove empty state if present
  hideEmpty();
}

// ── 9. Seen receipts ──────────────────────────────────────────────────
function markSeen() {
  socket.emit('seen', { room: ROOM, reader: ME, up_to_ts: lastMsgTs });
}

function updateSeenAvatars(reader, upToTs) {
  // Remove all existing seen avatars first
  document.querySelectorAll('.seen-row').forEach(r => r.innerHTML = '');

  // Find the last sent message at or before upToTs
  const sentRows = [...document.querySelectorAll('.msg-row.sent[data-ts]')]
    .filter(r => Number(r.dataset.ts) <= Number(upToTs));

  if (!sentRows.length) return;
  const lastRow  = sentRows[sentRows.length - 1];
  const msgId    = lastRow.dataset.id;
  const seenRow  = document.getElementById(`seen-row-${msgId}`);
  if (!seenRow) return;

  const av = document.createElement('div');
  av.className   = 'avatar avatar--sm';
  av.textContent = initials(reader);
  av.style.background = 'var(--grad-avatar)';
  av.title = `Seen by ${reader}`;

  const label = document.createElement('span');
  label.className   = 'seen-label';
  label.textContent = 'Seen';

  seenRow.appendChild(av);
  seenRow.appendChild(label);
}

// ── 10. Online users & header ─────────────────────────────────────────
function updateOnlineList() {
  onlineList.innerHTML = '';
  onlineUsers.forEach(name => {
    const li   = document.createElement('li');
    li.className = 'online-item';

    const dot  = document.createElement('span');
    dot.className = 'online-item-dot';

    const span = document.createElement('span');
    span.className   = 'online-item-name';
    span.textContent = name;

    li.appendChild(dot);
    li.appendChild(span);

    if (name === ME) {
      const you = document.createElement('span');
      you.className   = 'online-item-you';
      you.textContent = 'you';
      li.appendChild(you);
    }

    onlineList.appendChild(li);
  });
}

function updateHeader() {
  const others = onlineUsers.filter(u => u !== ME);

  if (others.length === 0) {
    headerName.textContent = `Room `;
    const roomSpan = document.createElement('span');
    roomSpan.id = 'header-room';
    roomSpan.textContent = ROOM;
    headerName.appendChild(roomSpan);
    headerStatus.textContent = 'Waiting for someone to join…';
    headerStatus.className   = 'header-status';
    headerAvatar.textContent = '💬';
    headerOnlineDot.className = 'online-dot';
    return;
  }

  // Show first other user
  const friend = others[0];
  const extra  = others.length - 1;

  headerName.textContent = friend + (extra > 0 ? ` +${extra} more` : '');
  headerAvatar.textContent = initials(friend);
  headerOnlineDot.className = 'online-dot is-online';
  headerStatus.className    = 'header-status is-online';
  headerStatus.textContent  = 'Active now';

  updateStatus(true);
}

function updateStatus(isOnline) {
  if (isOnline) {
    headerOnlineDot.classList.add('is-online');
    headerStatus.classList.add('is-online');
    headerStatus.classList.remove('is-typing');
    if (!headerStatus.classList.contains('is-typing')) {
      headerStatus.textContent = 'Active now';
    }
  } else {
    headerOnlineDot.classList.remove('is-online');
    headerStatus.classList.remove('is-online');
  }
}

// ── 11. Typing indicator ──────────────────────────────────────────────
function showTyping() {
  if (typingUsers.size === 0) {
    typingBar.style.display = 'none';
    headerStatus.classList.remove('is-typing');
    if (onlineUsers.some(u => u !== ME)) {
      headerStatus.textContent = 'Active now';
      headerStatus.className = 'header-status is-online';
    }
    return;
  }

  typingBar.style.display = 'flex';
  const names = [...typingUsers].join(', ');
  typingLabel.textContent = typingUsers.size === 1
    ? `${names} is typing…`
    : `${names} are typing…`;

  headerStatus.classList.add('is-typing');
  headerStatus.classList.remove('is-online');
  headerStatus.textContent = typingLabel.textContent;
}

// ── 12. Context menu ──────────────────────────────────────────────────
function setupContextMenu(bubble, msg) {
  const show = (e) => {
    e.preventDefault();
    contextTarget = msg;

    // Only show "delete for everyone" if sender is me
    document.getElementById('ctx-delete-all').style.display =
      msg.sender === ME ? 'flex' : 'none';
    // Only show copy if it's a text message
    document.getElementById('ctx-copy').style.display =
      msg.text ? 'flex' : 'none';

    const x = Math.min(e.clientX, window.innerWidth  - 200);
    const y = Math.min(e.clientY, window.innerHeight - 140);
    contextMenu.style.left    = x + 'px';
    contextMenu.style.top     = y + 'px';
    contextMenu.style.display = 'block';
  };

  bubble.addEventListener('contextmenu', show);

  // Long-press for mobile
  let pressTimer;
  bubble.addEventListener('touchstart',  () => { pressTimer = setTimeout(() => show({ preventDefault(){}, clientX: 50, clientY: 200 }), 600); }, { passive: true });
  bubble.addEventListener('touchend',    () => clearTimeout(pressTimer), { passive: true });
  bubble.addEventListener('touchmove',   () => clearTimeout(pressTimer), { passive: true });
}

document.addEventListener('click', (e) => {
  if (!contextMenu.contains(e.target)) {
    contextMenu.style.display = 'none';
  }
});

document.getElementById('ctx-copy').addEventListener('click', () => {
  if (contextTarget?.text) {
    navigator.clipboard.writeText(contextTarget.text).then(() => showToast('Copied!'));
  }
  contextMenu.style.display = 'none';
});

document.getElementById('ctx-delete-me').addEventListener('click', () => {
  if (contextTarget) {
    socket.emit('delete_message', {
      room: ROOM, msg_id: contextTarget.id, delete_for: 'me'
    });
  }
  contextMenu.style.display = 'none';
});

document.getElementById('ctx-delete-all').addEventListener('click', () => {
  if (contextTarget) {
    socket.emit('delete_message', {
      room: ROOM, msg_id: contextTarget.id, delete_for: 'everyone'
    });
  }
  contextMenu.style.display = 'none';
});

// ── 13. Lightbox ──────────────────────────────────────────────────────
function openLightbox(src) {
  lightboxImg.src         = src;
  lightbox.style.display  = 'flex';
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  lightbox.style.display  = 'none';
  lightboxImg.src         = '';
  document.body.style.overflow = '';
}
document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) closeLightbox();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLightbox();
});

// ── 14. Sidebar (mobile) ──────────────────────────────────────────────
const sidebar  = document.getElementById('sidebar');

// Create overlay
const overlay  = document.createElement('div');
overlay.className = 'sidebar-overlay';
document.body.appendChild(overlay);

document.getElementById('sidebar-open-btn').addEventListener('click', () => {
  sidebar.classList.add('open');
  overlay.classList.add('show');
});
function closeSidebar() {
  sidebar.classList.remove('open');
  overlay.classList.remove('show');
}
document.getElementById('sidebar-close-btn').addEventListener('click', closeSidebar);
overlay.addEventListener('click', closeSidebar);

// ── 15. Leave room ────────────────────────────────────────────────────
document.getElementById('btn-leave').addEventListener('click', () => {
  socket.disconnect();
  
  // Show an instant visual feedback overlay so the UI doesn't feel stuck
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'var(--bg-primary)';
  overlay.style.zIndex = '99999';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.color = 'var(--text-secondary)';
  overlay.style.fontSize = '1.2rem';
  overlay.style.fontWeight = '500';
  overlay.style.animation = 'fade-in 0.2s ease forwards';
  overlay.innerHTML = '<div style="margin-bottom:1rem; font-size:2rem;">💕</div><div>Leaving room...</div>';
  document.body.appendChild(overlay);

  // Navigate back to the home page
  window.location.replace('/');
});

// ── 16. Copy room code ────────────────────────────────────────────────
document.getElementById('btn-copy-room').addEventListener('click', () => {
  navigator.clipboard.writeText(ROOM).then(() => showToast(`Room code "${ROOM}" copied!`));
});

// ── 17. Toast ─────────────────────────────────────────────────────────
function showToast(msg, duration = 2800) {
  const t = document.createElement('div');
  t.className   = 'toast';
  t.textContent = msg;
  toastContainer.appendChild(t);
  setTimeout(() => {
    t.classList.add('toast--out');
    t.addEventListener('animationend', () => t.remove());
  }, duration);
}

// ── 18. Helpers ───────────────────────────────────────────────────────
function initials(name) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase() || '?';
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(date) {
  const now   = new Date();
  const today = now.toDateString();
  const yest  = new Date(now - 86400000).toDateString();
  if (date.toDateString() === today) return 'Today';
  if (date.toDateString() === yest)  return 'Yesterday';
  return date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
}

function tickSVG() {
  return `<svg width="14" height="10" viewBox="0 0 16 10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="1 5 5 9 15 1"/>
    <polyline points="6 5 10 9" opacity="0.5"/>
  </svg>`;
}

function scrollBottom(smooth) {
  messagesArea.scrollTo({
    top:      messagesArea.scrollHeight,
    behavior: smooth ? 'smooth' : 'instant',
  });
}

function hideEmpty() {
  emptyState.style.display = 'none';
}

// ── 19. Delete animation (CSS) ────────────────────────────────────────
const style = document.createElement('style');
style.textContent = `
  @keyframes msg-out {
    from { opacity: 1; transform: scale(1); max-height: 200px; }
    to   { opacity: 0; transform: scale(0.85); max-height: 0; padding: 0; margin: 0; }
  }
`;
document.head.appendChild(style);

// ── 20. Emoji Picker ──────────────────────────────────────────────────
const EMOJI_CATEGORIES = [
  {
    icon: '❤️', label: 'Love',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🫠','🖤','🤍','💕','💞','💓','💗','💖','💘','💝','💟','❣️','💔','😍',
      '🥰','😘','😗','😙','😚','💏','💑','👫','💍','🌹','🌷','🌸','💐','💌','🧨','🌟','✨','👋🏽',
    ],
  },
  {
    icon: '😄', label: 'Happy',
    emojis: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥳','🤩','🤑','😋','😛','😜','🤪',
      '😝','🤗','🦗','🥰','😎','🤓','😕','🤔','🤫','🤤','😐','😑','🤭','😶','🙄','😬','🤥','😪',
    ],
  },
  {
    icon: '🎉', label: 'Fun',
    emojis: [
      '🎉','🎈','🎆','🎇','🎁','🎀','🧨','🎨','🎵','🎶','🎼','🎤','🎭','🎪','🎬','🎡','🎢','🎠','🎫',
      '🦄','🌈','⭐','🌟','✨','💫','💥','💦','💧','🔥','🌀','🌈','👏','🙌','👌','✌️','🤞','🤏',
    ],
  },
  {
    icon: '🐶', label: 'Animals',
    emojis: [
      '🐶','🐱','🐇','🐼','🐨','🐻','🦁','🐯','🦊','🐺','🦋','🐎','🦄','🐮','🐷','🐑','🐔','🐧','🦆',
      '🦚','🦜','🐥','🐣','🐿️','🐰','🐢','🐍','🐬','🐠','🦋','🐝','🦋','🦌','🦏',
    ],
  },
  {
    icon: '🍔', label: 'Food',
    emojis: [
      '🍓','🍒','🍑','🍐','🍏','🍎','🍇','🍉','🍊','🍋','🍌','🍯','🍰','🎂','🍩','🍫','🍬','🧁','🍨',
      '🍦','🍧','🧠','🍞','🥐','🍳','🍔','🍕','🍷','🍸','☕','🍵','🥤',
    ],
  },
  {
    icon: '🌙', label: 'Sky',
    emojis: [
      '☀️','🌙','🌟','🌠','⭐','⚡','🌈','🌤️','☁️','🌥️','❄️','🌦️','🌧️','🌨️','🌪️','🌫️','🌍','🌎','🌏',
      '🌋','🌌','🌊','🏔️','🏖️','🏕️','🏜️','🏝️','🌇','🌆','🌅',
    ],
  },
  {
    icon: '👋', label: 'Hands',
    emojis: [
      '👋','🤚','👌','✌️','🤞','🤏','👆','👇','☝️','👈','👉','👍','👎','✊','🤛','🤜','👊','✋','🤟',
      '🤙','🙌','👐','👇','🤲','🙏','🤌','🤏','�﫶','✍️','💅','🦶','💪',
    ],
  },
];

let emojiOpen        = false;
let activeEmojiCat   = 0;

function buildEmojiPanel() {
  // Build tabs
  emojiTabs.innerHTML = '';
  EMOJI_CATEGORIES.forEach((cat, i) => {
    const tab = document.createElement('button');
    tab.className  = 'emoji-tab' + (i === activeEmojiCat ? ' active' : '');
    tab.title      = cat.label;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', i === activeEmojiCat);
    tab.textContent = cat.icon;
    tab.addEventListener('click', () => {
      activeEmojiCat = i;
      buildEmojiGrid(i);
      emojiTabs.querySelectorAll('.emoji-tab').forEach((t, ti) => {
        t.classList.toggle('active', ti === i);
        t.setAttribute('aria-selected', ti === i);
      });
    });
    emojiTabs.appendChild(tab);
  });

  buildEmojiGrid(activeEmojiCat);
}

function buildEmojiGrid(catIndex) {
  const cat = EMOJI_CATEGORIES[catIndex];
  emojiGrid.innerHTML = '';
  cat.emojis.forEach(em => {
    const btn = document.createElement('button');
    btn.className  = 'emoji-btn';
    btn.textContent = em;
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-label', em);
    btn.addEventListener('click', () => insertEmoji(em));
    emojiGrid.appendChild(btn);
  });
}

function insertEmoji(em) {
  const start = msgInput.selectionStart;
  const end   = msgInput.selectionEnd;
  const val   = msgInput.value;
  msgInput.value = val.slice(0, start) + em + val.slice(end);
  msgInput.selectionStart = msgInput.selectionEnd = start + em.length;
  msgInput.focus();
  // Trigger input event to enable send button
  msgInput.dispatchEvent(new Event('input'));
  autoResizeTextarea();
}

function toggleEmojiPanel() {
  emojiOpen = !emojiOpen;
  if (emojiOpen) {
    if (!emojiGrid.children.length) buildEmojiPanel();
    emojiPanel.style.display = 'block';
    // Force re-animation
    emojiPanel.style.animation = 'none';
    emojiPanel.offsetHeight; // reflow
    emojiPanel.style.animation = '';
    btnEmoji.classList.add('emoji-active');
    btnEmoji.setAttribute('aria-expanded', 'true');
  } else {
    emojiPanel.style.display = 'none';
    btnEmoji.classList.remove('emoji-active');
    btnEmoji.setAttribute('aria-expanded', 'false');
  }
}

btnEmoji.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleEmojiPanel();
});

// Close emoji panel on outside click
document.addEventListener('click', (e) => {
  if (emojiOpen && !emojiPanel.contains(e.target) && e.target !== btnEmoji) {
    emojiOpen = false;
    emojiPanel.style.display = 'none';
    btnEmoji.classList.remove('emoji-active');
    btnEmoji.setAttribute('aria-expanded', 'false');
  }
});

// ── 21. Floating Heart Particles ──────────────────────────────────────
const HEARTS  = ['❤️', '💕', '💖', '💗', '💝', '🌹', '💞', '💓', '✨', '🌸'];
let heartInterval = null;

function spawnHeart() {
  const el     = document.createElement('div');
  el.className = 'heart-particle';
  el.textContent = HEARTS[Math.floor(Math.random() * HEARTS.length)];

  const chatPanel  = document.getElementById('chat-panel');
  const rect       = chatPanel.getBoundingClientRect();
  const x          = rect.left + Math.random() * rect.width;
  const startY     = rect.bottom - 60;
  const dur        = 3500 + Math.random() * 3000;
  const size       = 12 + Math.random() * 14;

  el.style.left              = x + 'px';
  el.style.top               = startY + 'px';
  el.style.fontSize          = size + 'px';
  el.style.animationDuration = dur + 'ms';

  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// Spawn hearts when a message is sent
function spawnHearts() {
  const count = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    setTimeout(() => spawnHeart(), i * 120);
  }
}
