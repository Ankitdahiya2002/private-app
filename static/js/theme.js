// theme.js - Light cream is the DEFAULT mode

function initTheme() {
  const savedTheme = localStorage.getItem('lovechat_theme');
  
  if (savedTheme === 'dark') {
    // Only switch to dark if user explicitly chose dark before
    document.documentElement.classList.remove('light-theme');
  } else {
    // Default: light cream mode (first visit or saved as light)
    document.documentElement.classList.add('light-theme');
  }
}

// Run immediately (before DOM loads to prevent flash)
initTheme();

// Wait for DOM to hook up the toggle button
document.addEventListener('DOMContentLoaded', () => {
  const toggleBtns = document.querySelectorAll('.theme-toggle-btn');
  if (!toggleBtns.length) return;

  function updateIcons() {
    const isLight = document.documentElement.classList.contains('light-theme');
    toggleBtns.forEach(btn => {
      const iconSun = btn.querySelector('.icon-sun');
      const iconMoon = btn.querySelector('.icon-moon');
      if (iconSun && iconMoon) {
        if (isLight) {
          // Light mode active → show Moon icon (to switch to dark)
          iconSun.style.display = 'none';
          iconMoon.style.display = 'block';
        } else {
          // Dark mode active → show Sun icon (to switch to light)
          iconSun.style.display = 'block';
          iconMoon.style.display = 'none';
        }
      }
    });
  }

  // Set initial icon state
  updateIcons();

  toggleBtns.forEach(toggleBtn => {
    toggleBtn.addEventListener('click', () => {
      document.documentElement.classList.toggle('light-theme');

      if (document.documentElement.classList.contains('light-theme')) {
        localStorage.setItem('lovechat_theme', 'light');
      } else {
        localStorage.setItem('lovechat_theme', 'dark');
      }

      updateIcons();
    });
  });
});
