import { api } from '../api.js';
import { html, $, icon, toast, fmtAgo } from '../ui.js';
import { setPanelName } from '../app.js';

export async function render(root) {
  const [s, sys] = await Promise.all([api.get('/api/settings'), api.get('/api/system')]);
  const d = s.ddns;
  root.innerHTML = html`
    <div class="page-head"><div><h1>Panel settings</h1><p class="muted">Applies to the whole panel.</p></div></div>
    <form id="ps" class="panel">
      <h3>General</h3>
      <div class="form-grid">
        <label class="field"><span>Panel name</span><input name="panelName" value="${s.panelName}" maxlength="40"></label>
        <label class="field"><span>Public address players connect to</span>
          <div class="input-row"><input name="publicAddress" value="${s.publicAddress}" placeholder="e.g. play.thefinalhour.us"><button type="button" class="btn" id="detect">${icon('globe')}Detect</button></div>
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
    <form id="dd" class="panel">
      <h3>Domain &amp; dynamic DNS</h3>
      <p class="muted small">Keeps your game hostnames (for example <code>play.thefinalhour.us</code>) pointed at this PC's public IP, checking every 5 minutes.
        Needs the domain's DNS on Cloudflare. The panel itself is reached through a Cloudflare Tunnel; see <code>docs/domain-setup.md</code>.</p>
      <label class="switch field-switch"><input type="checkbox" name="enabled" ${d.enabled ? 'checked' : ''}><span></span>Keep DNS records updated</label>
      <div class="form-grid">
        <label class="field span-2"><span>Hostnames for game servers (comma-separated)</span><input name="hostnames" value="${d.hostnames.join(', ')}" placeholder="play.thefinalhour.us">
          <small class="hint">Created as "DNS only" A records. Don't list the panel's hostname here; the tunnel handles that one.</small></label>
        <label class="field span-2"><span>Cloudflare API token ${d.tokenSet ? html`<span class="pill pill-ok">set</span>` : html`<span class="pill pill-warn">not set</span>`}</span>
          <input name="token" type="password" autocomplete="off" placeholder="${d.tokenSet ? '•••••••• (leave blank to keep)' : 'Paste token'}">
          <small class="hint">Cloudflare dashboard → My Profile → API Tokens → Create Token → "Edit zone DNS" template → Zone: thefinalhour.us.</small></label>
      </div>
      ${d.lastCheck
        ? html`<div class="callout ${d.error ? 'callout-bad' : 'callout-ok'}">${icon(d.error ? 'alert' : 'check')}<div>
            ${d.error ? html`<strong>Problem:</strong> ${d.error}<br>` : ''}Public IP <code>${d.lastIp || '?'}</code> · checked ${fmtAgo(d.lastCheck)}${d.lastChange ? html` · last changed ${fmtAgo(d.lastChange)}` : ''}
            ${d.records.length ? html`<ul>${d.records.map((r) => html`<li><code>${r.hostname}</code>: ${r.result}${r.error ? ' (' + r.error + ')' : ''}</li>`)}</ul>` : ''}</div></div>`
        : ''}
      <div class="form-actions"><button class="btn btn-primary">Save</button><button type="button" class="btn" id="dd-run">${icon('refresh')}Update now</button>
        <button type="button" class="btn btn-ghost" id="dd-use">Use first hostname as public address</button></div>
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
  const dd = $('#dd');
  dd.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api.put('/api/settings', { ddns: { enabled: dd.enabled.checked, hostnames: dd.hostnames.value, token: dd.token.value } });
      toast('Saved', 'ok');
      render(root);
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  $('#dd-run').onclick = async (e) => {
    e.target.disabled = true;
    try {
      const r = await api.post('/api/settings/ddns/run');
      toast(r.error ? r.error : `DNS is pointing at ${r.lastIp}`, r.error ? 'error' : 'ok', 7000);
      render(root);
    } catch (err) {
      toast(err.message, 'error');
      e.target.disabled = false;
    }
  };
  $('#dd-use').onclick = async () => {
    const host = dd.hostnames.value.split(/[\s,]+/).filter(Boolean)[0];
    if (!host) return toast('Add a hostname first', 'warn');
    await api.put('/api/settings', { publicAddress: host }).then(() => { toast(`Public address set to ${host}`, 'ok'); render(root); }, (e) => toast(e.message, 'error'));
  };
  const clear = $('#clear-key');
  if (clear) clear.onclick = () => api.put('/api/settings', { clearCurseforgeKey: true }).then(() => render(root));
}
