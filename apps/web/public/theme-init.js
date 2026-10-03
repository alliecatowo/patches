// Resolve the stored theme preference before first paint so there is no flash of the
// wrong theme — `src/lib/theme.ts` owns the storage key/shape and stays the source of
// truth; this inline copy only needs to agree with it on the key name and valid values.
(function () {
  var STORAGE_KEY = 'patches.web.theme.v1';
  var VALID = ['system', 'patches', 'dark', 'light', 'paper', 'mono', 'hacker', 'pastel'];
  var THEME_COLORS = {
    patches: '#282a36',
    dark: '#1e1e2e',
    light: '#eff1f5',
    paper: '#f7f2e8',
    mono: '#000000',
    hacker: '#001400',
    pastel: '#24273a',
  };
  var theme = 'system';
  try {
    var stored = window.localStorage.getItem(STORAGE_KEY);
    if (VALID.indexOf(stored) !== -1) {
      theme = stored;
    }
  } catch {
    // Storage inaccessible (private browsing) — fall back to 'system'.
  }
  document.documentElement.setAttribute('data-theme', theme);

  var effectiveColor = '#282a36';
  if (theme === 'system') {
    var prefersDark =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    effectiveColor = prefersDark ? '#1e1e2e' : '#eff1f5';
  } else if (THEME_COLORS[theme]) {
    effectiveColor = THEME_COLORS[theme];
  }
  var meta = document.getElementById('meta-theme-color');
  if (meta) meta.setAttribute('content', effectiveColor);
})();
