const app = new Framework7({ el: '#app', name: 'WSign', theme: 'ios' });

const $ = (id) => document.getElementById(id);
const DB_NAME = 'WSignDB';
const STORE = 'certificates';
let currentJob = null;
let currentDownloadUrl = null;

function serverBase() {
  return ($('serverUrl').value || localStorage.getItem('wsignServer') || '').trim().replace(/\/$/, '');
}

function loadSettings() {
  $('serverUrl').value = localStorage.getItem('wsignServer') || '';
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function renderCertificates() {
  const list = $('certList').querySelector('ul');
  const select = $('certificateSelect');
  const certs = await dbAll();
  list.innerHTML = '';
  select.innerHTML = '<option value="">Choose a certificate…</option>';
  for (const cert of certs) {
    const li = document.createElement('li');
    li.innerHTML = `<div class="item-content"><div class="item-inner"><div class="item-title">${escapeHtml(cert.name)}</div><div class="item-after"><button class="button color-red remove-cert" data-id="${cert.id}">Remove</button></div></div></div>`;
    list.appendChild(li);
    const option = document.createElement('option');
    option.value = cert.id;
    option.textContent = cert.name;
    select.appendChild(option);
  }
  document.querySelectorAll('.remove-cert').forEach(btn => btn.addEventListener('click', async () => {
    await dbDelete(Number(btn.dataset.id));
    await renderCertificates();
  }));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

async function addCertificate() {
  const p12 = await chooseFile($('p12Picker'));
  if (!p12) return;
  const profile = await chooseFile($('mobileprovisionPicker'));
  if (!profile) return;

  let password = '';
  while (true) {
    password = window.prompt('Enter the P12 password. It will not be saved in WSign:');
    if (password === null) return;
    try {
      await validateCertificate(serverBase(), p12, profile, password);
      break;
    } catch (error) {
      if (error.status === 401 || error.status === 422) {
        app.dialog.alert('The P12 password is incorrect. Try again.', 'WSign');
        continue;
      }
      app.dialog.alert(error.message || 'The certificate could not be validated.', 'WSign');
      return;
    }
  }

  const name = window.prompt('Certificate name:', p12.name.replace(/\.p12$/i, '')) || p12.name;
  await dbPut({ name, p12, mobileprovision: profile });
  await renderCertificates();
  app.dialog.alert('Certificate added. The password was not stored.', 'WSign');
}

function chooseFile(input) {
  return new Promise(resolve => {
    input.value = '';
    const handler = () => {
      input.removeEventListener('change', handler);
      resolve(input.files[0] || null);
    };
    input.addEventListener('change', handler);
    input.click();
  });
}

async function validateCertificate(base, p12, profile, password) {
  if (!base) throw new Error('Set a WSign server in Settings first.');
  const body = new FormData();
  body.append('p12', p12, p12.name);
  body.append('mobileprovision', profile, profile.name);
  body.append('p12_password', password);
  const response = await fetch(`${base}/api/v1/certificates/validate`, { method: 'POST', body });
  if (!response.ok) {
    const error = new Error(await response.text() || `Server returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function signIpa() {
  const base = serverBase();
  if (!base) return app.dialog.alert('Set a WSign server in Settings first.', 'WSign');
  const ipa = $('ipaFile').files[0];
  if (!ipa) return app.dialog.alert('Choose an IPA first.', 'WSign');
  const certId = Number($('certificateSelect').value);
  if (!certId) return app.dialog.alert('Choose a certificate first.', 'WSign');
  const cert = (await dbAll()).find(x => x.id === certId);
  if (!cert) return app.dialog.alert('That certificate is no longer available.', 'WSign');

  let password = window.prompt('Enter the P12 password for this certificate.');
  if (password === null) return;

  $('jobCard').classList.remove('hidden');
  $('downloadButton').classList.add('hidden');
  $('discardButton').classList.add('hidden');
  setProgress(5, 'Preparing upload…');

  const body = new FormData();
  body.append('ipa', ipa, ipa.name);
  body.append('p12', cert.p12, cert.p12.name);
  body.append('mobileprovision', cert.mobileprovision, cert.mobileprovision.name);
  body.append('p12_password', password);
  if ($('bundleId').value.trim()) body.append('bundle_id', $('bundleId').value.trim());
  if ($('appName').value.trim()) body.append('app_name', $('appName').value.trim());

  let response = await fetch(`${base}/api/v1/sign`, { method: 'POST', body });
  if (response.status === 401 || response.status === 422) {
    while (true) {
      password = window.prompt('The P12 password was rejected. Enter it again:');
      if (password === null) { $('jobCard').classList.add('hidden'); return; }
      body.set('p12_password', password);
      response = await fetch(`${base}/api/v1/sign`, { method: 'POST', body });
      if (response.status !== 401 && response.status !== 422) break;
    }
  }
  if (!response.ok) {
    $('jobStatus').textContent = await response.text() || `Server error (${response.status})`;
    return;
  }

  const result = await response.json();
  currentJob = result.job_id;
  setProgress(25, 'Signing…');
  await pollJob(base, currentJob);
}

async function pollJob(base, jobId) {
  for (;;) {
    const response = await fetch(`${base}/api/v1/jobs/${encodeURIComponent(jobId)}`);
    if (!response.ok) throw new Error(`Job status failed (${response.status})`);
    const job = await response.json();
    const progress = Math.max(25, Math.min(100, Number(job.progress || 0)));
    setProgress(progress, job.message || job.status || 'Signing…');
    if (job.status === 'complete') {
      currentDownloadUrl = job.download_url;
      $('downloadButton').classList.remove('hidden');
      $('discardButton').classList.remove('hidden');
      $('jobTitle').textContent = 'Ready';
      $('jobStatus').textContent = 'The signed IPA will expire after 15 minutes or when discarded.';
      return;
    }
    if (job.status === 'failed') {
      $('jobTitle').textContent = 'Signing failed';
      $('jobStatus').textContent = job.message || 'The server could not sign this IPA.';
      return;
    }
    await new Promise(r => setTimeout(r, 1500));
  }
}

function setProgress(percent, text) {
  $('jobProgress').querySelector('span').style.width = `${percent}%`;
  $('jobStatus').textContent = text;
}

async function discardJob() {
  const base = serverBase();
  if (!base || !currentJob) return;
  await fetch(`${base}/api/v1/jobs/${encodeURIComponent(currentJob)}`, { method: 'DELETE' });
  currentJob = null;
  currentDownloadUrl = null;
  $('jobCard').classList.add('hidden');
}

$('saveSettings').addEventListener('click', () => {
  const value = $('serverUrl').value.trim().replace(/\/$/, '');
  localStorage.setItem('wsignServer', value);
  app.dialog.alert(value ? 'Server saved.' : 'Server cleared.', 'WSign');
});
$('addCertificate').addEventListener('click', addCertificate);
$('signButton').addEventListener('click', () => signIpa().catch(e => app.dialog.alert(e.message, 'WSign')));
$('discardButton').addEventListener('click', () => discardJob().catch(e => app.dialog.alert(e.message, 'WSign')));
$('downloadButton').addEventListener('click', () => {
  if (currentDownloadUrl) window.location.href = currentDownloadUrl;
});

loadSettings();
renderCertificates().catch(e => console.error(e));
