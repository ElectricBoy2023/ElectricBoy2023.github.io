const API = 'https://api.scratch.mit.edu';
const state = { username: '', projects: [], projectOffset: 0, currentProject: null, player: 'scratch' };

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function api(path) {
  const r = await fetch(API + path);
  if (!r.ok) throw new Error(`Scratch API returned HTTP ${r.status}`);
  return r.json();
}

function setLoading(on) { $('#loading').classList.toggle('hidden', !on); }
function setError(msg) { $('#error').textContent = msg; $('#error').classList.toggle('hidden', !msg); }
function formatDate(s) { if (!s) return 'Unknown'; return new Date(s).toLocaleDateString(undefined, {year:'numeric',month:'long',day:'numeric'}); }

async function loadUser(username) {
  username = username.trim();
  if (!username) return;
  state.username = username;
  state.projects = [];
  state.projectOffset = 0;
  $('#profileView').classList.add('hidden');
  setError(''); setLoading(true);
  try {
    const [user, followers, following, messageCount] = await Promise.all([
      api(`/users/${encodeURIComponent(username)}`),
      api(`/users/${encodeURIComponent(username)}/followers?limit=40&offset=0`),
      api(`/users/${encodeURIComponent(username)}/following?limit=40&offset=0`),
      api(`/users/${encodeURIComponent(username)}/messages/count`).catch(() => null)
    ]);
    renderProfile(user, messageCount);
    renderUsers('#followersGrid', followers);
    renderUsers('#followingGrid', following);
    $('#profileView').classList.remove('hidden');
    await loadProjects();
  } catch (e) {
    setError(`Couldn't load @${username}. ${e.message}`);
  } finally { setLoading(false); }
}

function renderProfile(user, messageCount) {
  const p = user.profile || {};
  $('#avatar').src = p['90x90'] || p.images?.['90x90'] || `https://cdn2.scratch.mit.edu/get_image/user/${user.id}_90x90.png`;
  $('#displayName').textContent = user.username;
  $('#joinDate').textContent = `Joined ${formatDate(user.history?.joined)}`;
  $('#status').textContent = p.status || '';
  $('#bio').textContent = p.bio || '';
  $('#scratchProfile').href = `https://scratch.mit.edu/users/${encodeURIComponent(user.username)}/`;
  const facts = [`🆔 ${user.id}`, `🌍 ${p.country || 'Unknown country'}`, user.scratchteam ? '🛡️ Scratch Team' : '👤 Scratcher'];
  if (messageCount?.count != null) facts.push(`📬 ${messageCount.count} messages`);
  $('#facts').innerHTML = facts.map(x => `<span class="fact">${esc(x)}</span>`).join('');
}

async function loadProjects() {
  const batch = await api(`/users/${encodeURIComponent(state.username)}/projects?limit=40&offset=${state.projectOffset}`);
  state.projects.push(...batch);
  state.projectOffset += batch.length;
  renderProjects();
  $('#loadMore').style.display = batch.length < 40 ? 'none' : '';
}

function renderProjects() {
  $('#projectGrid').innerHTML = state.projects.map(p => `
    <article class="project">
      <img loading="lazy" src="${esc(p.images?.['282x218'] || p.image)}" alt="${esc(p.title)} thumbnail">
      <div class="project-body">
        <h4>${esc(p.title)}</h4>
        <div class="stats">👁 ${p.stats?.views ?? 0} &nbsp; ❤️ ${p.stats?.loves ?? 0} &nbsp; ⭐ ${p.stats?.favorites ?? 0} &nbsp; 🔀 ${p.stats?.remixes ?? 0}</div>
        <div class="stats">Shared ${esc(formatDate(p.history?.shared))}</div>
        <button class="ghost play-project" data-id="${esc(p.id)}" data-title="${esc(p.title)}">▶ Play</button>
      </div>
    </article>`).join('');
}

function renderUsers(selector, users) {
  $(selector).innerHTML = (users || []).map(u => `
    <a class="user" href="?user=${encodeURIComponent(u.username)}" style="text-decoration:none;color:inherit">
      <img src="${esc(u.profile?.images?.['60x60'])}" alt="">
      <div><strong>${esc(u.username)}</strong><small>${esc(u.profile?.country || 'Unknown')}</small></div>
    </a>`).join('') || '<p class="muted">No public users returned.</p>';
}

function openPlayer(id, title) {
  state.currentProject = { id, title };
  $('#playerTitle').textContent = title;
  $('#playerAuthor').textContent = `by @${state.username}`;
  $('#projectLink').href = `https://scratch.mit.edu/projects/${id}/`;
  $('#playerModal').classList.remove('hidden');
  $('#playerModal').setAttribute('aria-hidden', 'false');
  setPlayer(state.player);
}

function setPlayer(type) {
  state.player = type;
  if (!state.currentProject) return;
  const id = state.currentProject.id;
  $('#projectFrame').src = type === 'turbowarp'
    ? `https://turbowarp.org/${id}/embed`
    : `https://scratch.mit.edu/projects/${id}/embed`;
  document.querySelectorAll('.player-toggle').forEach(b => b.classList.toggle('active', b.dataset.player === type));
}

function closePlayer() {
  $('#playerModal').classList.add('hidden');
  $('#playerModal').setAttribute('aria-hidden', 'true');
  $('#projectFrame').src = 'about:blank';
}

async function downloadScrunch() {
  const button = $('#downloadScrunch');
  const status = $('#downloadStatus');
  button.disabled = true;
  status.textContent = 'Preparing Scrunch.zip...';
  try {
    const zip = new JSZip();
    const files = [
      ['index.html', 'index.html'],
      ['styles.css', 'styles.css'],
      ['app.js', 'app.js']
    ];

    for (const [path, name] of files) {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Couldn't download ${path} (HTTP ${response.status})`);
      zip.file(name, await response.text());
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Scrunch.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Scrunch.zip is ready! 🍊';
  } catch (e) {
    status.textContent = `Download failed: ${e.message}`;
  } finally {
    button.disabled = false;
  }
}

$('#searchForm').addEventListener('submit', e => { e.preventDefault(); loadUser($('#usernameInput').value); });
$('#loadMore').addEventListener('click', () => loadProjects().catch(e => setError(e.message)));
$('#projectGrid').addEventListener('click', e => {
  const button = e.target.closest('.play-project');
  if (!button) return;
  openPlayer(Number(button.dataset.id), button.dataset.title);
});
$('#downloadScrunch').addEventListener('click', downloadScrunch);
$('#closePlayer').addEventListener('click', closePlayer);
$('#closeBackdrop').addEventListener('click', closePlayer);
document.querySelectorAll('.player-toggle').forEach(b => b.addEventListener('click', () => setPlayer(b.dataset.player)));
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  ['projects','followers','following'].forEach(x => $(`#${x}Tab`).classList.toggle('hidden', x !== b.dataset.tab));
}));

const initial = new URLSearchParams(location.search).get('user');
if (initial) { $('#usernameInput').value = initial; loadUser(initial); }

window.openPlayer = openPlayer;
