/* ====================================================================
   LANDING PAGE LOGIC
   ==================================================================== */

const WORDS = [
  'SUNSET', 'ECLIPSE', 'NEBULA', 'AURORA', 'COSMOS', 'ZENITH',
  'STORM',  'PIXEL',  'PRISM',  'QUARTZ', 'VORTEX', 'CIPHER'
];

function randomCode() {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const num  = String(Math.floor(Math.random() * 90) + 10);
  return word + num;
}

// ── Restore saved values ─────────────────────────────────────────
const nameInput = document.getElementById('input-name');
const roomInput = document.getElementById('input-room');

nameInput.value = localStorage.getItem('privchat_name') || '';
roomInput.value = localStorage.getItem('privchat_room') || '';

// ── Auto-uppercase room code ─────────────────────────────────────
roomInput.addEventListener('input', () => {
  const pos = roomInput.selectionStart;
  roomInput.value = roomInput.value.toUpperCase();
  roomInput.setSelectionRange(pos, pos);
});

// ── Random room code ─────────────────────────────────────────────
document.getElementById('btn-random').addEventListener('click', () => {
  roomInput.value = randomCode();
  roomInput.focus();
});

// ── Form submission ──────────────────────────────────────────────
document.getElementById('join-form').addEventListener('submit', (e) => {
  e.preventDefault();

  const name = nameInput.value.trim();
  const room = roomInput.value.trim().toUpperCase();

  let valid = true;

  if (!name) {
    showError('err-name', 'Please enter your name.');
    valid = false;
  } else {
    clearError('err-name');
  }

  if (!room) {
    showError('err-room', 'Please enter or generate a room code.');
    valid = false;
  } else if (room.length < 4) {
    showError('err-room', 'Room code must be at least 4 characters.');
    valid = false;
  } else {
    clearError('err-room');
  }

  if (!valid) return;

  // Persist
  localStorage.setItem('privchat_name', name);
  localStorage.setItem('privchat_room', room);

  // Navigate
  window.location.href = `/chat?name=${encodeURIComponent(name)}&room=${encodeURIComponent(room)}`;
});

// ── Helpers ──────────────────────────────────────────────────────
function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}
function clearError(id) {
  const el = document.getElementById(id);
  if (el) el.textContent = '';
}
