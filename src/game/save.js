// Single-player save game in localStorage.
const KEY = 'ark2015.save.v1';
const SETTINGS_KEY = 'ark2015.settings.v1';
const OPTIONS_KEY = 'ark2015.options.v1';

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
}

export class SaveSystem {
  exists() { return !!read(KEY); }
  load() { return read(KEY); }
  save(data) { return write(KEY, { version: 1, savedAt: Date.now(), ...data }); }
  wipe() { try { localStorage.removeItem(KEY); } catch (_) { /* storage unavailable */ } }
  loadSettings() { return read(SETTINGS_KEY); }
  saveSettings(s) { write(SETTINGS_KEY, s); }
  loadOptions() { return read(OPTIONS_KEY); }
  saveOptions(o) { write(OPTIONS_KEY, o); }
}
