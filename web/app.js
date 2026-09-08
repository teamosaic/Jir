const state = {
  csv: '',
  envs: [],
  loading: false,
};

const logBox = document.getElementById('logBox');
const summaryPill = document.getElementById('summaryPill');
const envContainer = document.getElementById('envContainer');

function log(msg) {
  const now = new Date().toLocaleTimeString();
  logBox.textContent += `[${now}] ${msg}\n`;
  logBox.scrollTop = logBox.scrollHeight;
}

function setBusy(isBusy) {
  state.loading = isBusy;
  for (const id of ['loadEnvsBtn', 'selectAllBtn', 'clearBtn', 'dryRunBtn', 'executeBtn', 'downloadBtn']) {
    document.getElementById(id).disabled = isBusy;
  }
}

function selectedEnvironments() {
  const checks = envContainer.querySelectorAll('input[type="checkbox"]:checked');
  return Array.from(checks).map((c) => c.value);
}

function payload() {
  return {
    branch: document.getElementById('branch').value.trim() || 'main',
    locale: document.getElementById('locale').value.trim() || 'en-us',
    days: Number(document.getElementById('days').value || 7),
    environments: selectedEnvironments(),
  };
}

function renderEnvs() {
  envContainer.innerHTML = '';
  if (!state.envs.length) {
    envContainer.innerHTML = '<p>No environments loaded yet.</p>';
    return;
  }

  for (const env of state.envs) {
    const row = document.createElement('label');
    row.className = 'env-item';
    row.innerHTML = `<input type="checkbox" value="${env.uid}" ${env.name.toLowerCase() === 'prd' ? 'checked' : ''}/> ${env.name} (${env.uid})`;
    envContainer.appendChild(row);
  }
}

async function callApi(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function loadEnvs() {
  setBusy(true);
  try {
    log('Loading environments...');
    const branch = document.getElementById('branch').value.trim() || 'main';
    const res = await fetch(`/api/environments?branch=${encodeURIComponent(branch)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    state.envs = data.environments || [];
    renderEnvs();
    log(`Loaded ${state.envs.length} environments.`);
  } catch (err) {
    log(`Error: ${err.message}`);
    alert(err.message);
  } finally {
    setBusy(false);
  }
}

async function runDry() {
  setBusy(true);
  try {
    summaryPill.textContent = 'Dry Run';
    log('Starting dry run...');
    const data = await callApi('/api/dry-run', payload());
    state.csv = data.csv || '';
    log(`Dry run done. Candidates: ${data.count}. Cutoff: ${data.cutoffIso}`);
  } catch (err) {
    log(`Error: ${err.message}`);
    alert(err.message);
  } finally {
    setBusy(false);
  }
}

async function runExecute() {
  const envs = selectedEnvironments();
  if (!envs.length) {
    alert('Select at least one environment.');
    return;
  }
  if (!confirm(`Unpublish old entries in ${envs.length} environment(s)?`)) return;

  setBusy(true);
  try {
    summaryPill.textContent = 'Execute';
    log('Starting real run...');
    const data = await callApi('/api/execute', payload());
    state.csv = data.csv || '';
    log(`Real run done. Processed: ${data.count}, Failed: ${data.failed}.`);
  } catch (err) {
    log(`Error: ${err.message}`);
    alert(err.message);
  } finally {
    setBusy(false);
  }
}

function downloadCsv() {
  if (!state.csv) {
    alert('No results available yet. Run dry run or real run first.');
    return;
  }

  const fileName = document.getElementById('fileName').value.trim() || 'event_card_unpublish_results.csv';
  const blob = new Blob([state.csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  log(`Downloaded ${fileName}`);
}

function selectAll(flag) {
  const checks = envContainer.querySelectorAll('input[type="checkbox"]');
  checks.forEach((c) => {
    c.checked = flag;
  });
}

document.getElementById('loadEnvsBtn').addEventListener('click', loadEnvs);
document.getElementById('selectAllBtn').addEventListener('click', () => selectAll(true));
document.getElementById('clearBtn').addEventListener('click', () => selectAll(false));
document.getElementById('dryRunBtn').addEventListener('click', runDry);
document.getElementById('executeBtn').addEventListener('click', runExecute);
document.getElementById('downloadBtn').addEventListener('click', downloadCsv);

log('Ready. Click Load to fetch environments.');
