// theme.js - Included in <head> to prevent FOUC (Flash of Unstyled Content)

function initTheme() {
  const savedTheme = localStorage.getItem('lovechat_theme');
  if (savedTheme === 'light') {
    document.documentElement.classList.add('light-theme');
  }
}

// Run immediately
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
          iconSun.style.display = 'block';
          iconMoon.style.display = 'none';
        } else {
          iconSun.style.display = 'none';
          iconMoon.style.display = 'block';
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
