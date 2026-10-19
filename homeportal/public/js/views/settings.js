import { api } from '../api.js';
import { html, $, icon, toast } from '../ui.js';
import { setPanelName } from '../app.js';

export async function render(root) {
  const [s, sys] = await Promise.all([api.get('/api/settings'), api.get('/api/system')]);
  root.innerHTML = html`
    <div class="page-head"><div><h1>Panel settings</h1><p class="muted">Applies to the whole panel.</p></div></div>
    <form id="ps" class="panel">
      <h3>General</h3>
      <div class="form-grid">
        <label class="field"><span>Panel name</span><input name="panelName" value="${s.panelName}" maxlength="40"></label>
        <label class="field"><span>Public address players connect to</span>
          <div class="input-row"><input name="publicAddress" value="${s.publicAddress}" placeholder="e.g. 203.0.113.7 or mc.example.com"><button type="button" class="btn" id="detect">${icon('globe')}Detect</button></div>
          <small class="hint">Your public IP, a dynamic DNS name (DuckDNS, No-IP) or a Tailscale IP. Shown as the "Connect" address on each server.</small></label>
      </div>
      <h3>CurseForge</h3>
      <div class="form-grid">
        <label class="field span-2"><span>API key ${s.curseforgeKeySet ? html`<span class="pill pill-ok">set</span>` : html`<span class="pill pill-warn">not set</span>`}</span>
          <input name="curseforgeApiKey" type="password" autocomplete="off" placeholder="${s.curseforgeKeySet ? '•••••••• (leave blank to keep)' : 'Paste your key'}">
          <small class="hint">Free from <a href="https://console.curseforge.com/" target="_blank" rel="noopener">console.curseforge.com</a> → sign in → API Keys. Needed to browse/install modpacks and ARK mods.</small></label>
      </div>
      <div class="form-actions"><button class="btn btn-primary">Save settings</button>${s.curseforgeKeySet ? html`<button type="button" class="btn btn-ghost" id="clear-key">Remove API key</button>` : ''}</div>
    </form>
    <div class="panel">
      <h3>This PC</h3>
      <dl class="kv">
        <div><dt>Host</dt><dd>${sys.hostname} (${sys.platform})</dd></div>
        <div><dt>CPU</dt><dd>${sys.cpuModel} · ${sys.cores} threads</dd></div>
        <div><dt>LAN addresses</dt><dd>${sys.lanAddresses.join(', ') || '—'}</dd></div>
        <div><dt>Panel port</dt><dd>${sys.panelPort}</dd></div>
        <div><dt>Server files</dt><dd class="mono">${s.serversDir}</dd></div>
        <div><dt>Backups</dt><dd class="mono">${s.backupsDir}</dd></div>
        <div><dt>Java runtimes</dt><dd>${sys.java.length ? sys.java.map((j) => 'Java ' + j).join(', ') : 'none yet (downloaded automatically)'}</dd></div>
        <div><dt>Node.js</dt><dd>${sys.node}</dd></div>
      </dl>
      <p class="muted small">Folders and the panel port are set in <code>config.json</code> next to the panel (restart the panel after editing).</p>
    </div>`.s;
  const f = $('#ps');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    try {
      await api.put('/api/settings', d);
      setPanelName(d.panelName || 'HomePortal');
      toast('Settings saved', 'ok');
      render(root);
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  $('#detect').onclick = async () => {
    try {
      f.publicAddress.value = (await api.get('/api/system/public-ip')).ip;
      toast('Detected — press Save to keep it', 'ok');
    } catch (err) {
      toast(`Couldn't detect: ${err.message}`, 'error');
    }
  };
  const clear = $('#clear-key');
  if (clear) clear.onclick = () => api.put('/api/settings', { clearCurseforgeKey: true }).then(() => render(root));
}
