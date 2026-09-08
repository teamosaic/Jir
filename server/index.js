const fs = require('fs');
const path = require('path');

const express = require('express');
const cors = require('cors');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const webDir = path.resolve(__dirname, '..', 'web');
app.use('/', express.static(webDir));

const PORT = Number(process.env.PORT || 7071);
const BASE_URL = process.env.BASE_URL || 'https://api.contentstack.io';
const API_KEY = process.env.API_KEY || '';
const MANAGEMENT_TOKEN = process.env.MANAGEMENT_TOKEN || '';
const DEFAULT_BRANCH = process.env.BRANCH || 'main';
const DEFAULT_LOCALE = process.env.LOCALE || 'en-us';
const CONTENT_TYPE_UID = process.env.CONTENT_TYPE_UID || 'event_card';
const ALLOWED_ENVIRONMENTS = (process.env.ALLOWED_ENVIRONMENTS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function configReady() {
  return Boolean(API_KEY && MANAGEMENT_TOKEN);
}

function buildHeaders(branch) {
  return {
    api_key: API_KEY,
    authorization: MANAGEMENT_TOKEN,
    'Content-Type': 'application/json',
    branch: branch || DEFAULT_BRANCH,
  };
}

function parseIsoDate(value) {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function getEventDate(entry) {
  const info = entry.event_information || {};
  return parseIsoDate(info.end_date) || parseIsoDate(info.start_date);
}

async function cmaGet(url, headers) {
  const response = await fetch(url, { method: 'GET', headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GET ${url} failed: ${response.status} ${text}`);
  }
  return response.json();
}

async function cmaPost(url, headers, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    return { ok: false, status: response.status, message: text };
  }
  return { ok: true, status: response.status, message: 'ok' };
}

async function getAllEventCards(branch, locale) {
  const headers = buildHeaders(branch);
  const allEntries = [];
  let skip = 0;
  const limit = 100;

  while (true) {
    const query = new URLSearchParams({
      locale,
      skip: String(skip),
      limit: String(limit),
      include_count: 'true',
      include_publish_details: 'true',
    });
    const url = `${BASE_URL}/v3/content_types/${CONTENT_TYPE_UID}/entries?${query.toString()}`;
    const data = await cmaGet(url, headers);
    const entries = data.entries || [];
    const count = data.count || 0;

    if (!entries.length) break;
    allEntries.push(...entries);

    skip += limit;
    if (skip >= count) break;
  }

  return allEntries;
}

function getPublishedEnvUids(entry) {
  const details = Array.isArray(entry.publish_details) ? entry.publish_details : [];
  const seen = new Set();
  for (const d of details) {
    if (d && d.environment) seen.add(d.environment);
  }
  return [...seen];
}

function computeCandidates({ entries, days, selectedEnvUids }) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = [];

  for (const entry of entries) {
    const eventDate = getEventDate(entry);
    if (!eventDate || eventDate >= cutoff) continue;

    const envs = selectedEnvUids.length ? selectedEnvUids : getPublishedEnvUids(entry);
    if (!envs.length) continue;

    for (const env of envs) {
      rows.push({
        uid: entry.uid || '',
        title: entry.title || '',
        environment: env,
        event_datetime: eventDate.toISOString(),
        age_days: Math.floor((Date.now() - eventDate.getTime()) / (24 * 60 * 60 * 1000)),
      });
    }
  }

  return { rows, cutoffIso: cutoff.toISOString() };
}

function enforceAllowedEnvironments(selected) {
  if (!ALLOWED_ENVIRONMENTS.length) return selected;
  return selected.filter((uid) => ALLOWED_ENVIRONMENTS.includes(uid));
}

function toCsv(rows) {
  if (!rows.length) {
    return 'uid,title,environment,event_datetime,age_days,status,message\n';
  }
  const headers = ['uid', 'title', 'environment', 'event_datetime', 'age_days', 'status', 'message'];
  const escape = (v) => {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replaceAll('"', '""')}"`;
    }
    return s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => escape(r[h])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, configReady: configReady(), contentType: CONTENT_TYPE_UID });
});

app.get('/api/environments', async (req, res) => {
  try {
    if (!configReady()) return res.status(500).json({ error: 'Missing API_KEY or MANAGEMENT_TOKEN in .env' });
    const branch = req.query.branch || DEFAULT_BRANCH;
    const headers = buildHeaders(branch);
    const data = await cmaGet(`${BASE_URL}/v3/environments?include_count=true&limit=200`, headers);
    const envs = (data.environments || []).map((e) => ({ uid: e.uid, name: e.name }));
    const filtered = ALLOWED_ENVIRONMENTS.length
      ? envs.filter((e) => ALLOWED_ENVIRONMENTS.includes(e.uid))
      : envs;
    res.json({ environments: filtered });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.post('/api/dry-run', async (req, res) => {
  try {
    if (!configReady()) return res.status(500).json({ error: 'Missing API_KEY or MANAGEMENT_TOKEN in .env' });

    const days = Number(req.body.days || 7);
    const branch = req.body.branch || DEFAULT_BRANCH;
    const locale = req.body.locale || DEFAULT_LOCALE;
    const selected = Array.isArray(req.body.environments) ? req.body.environments : [];
    const selectedEnvUids = enforceAllowedEnvironments(selected);

    const entries = await getAllEventCards(branch, locale);
    const { rows, cutoffIso } = computeCandidates({ entries, days, selectedEnvUids });

    const outRows = rows.map((r) => ({ ...r, status: 'would_unpublish', message: 'dry-run' }));
    res.json({
      mode: 'dry-run',
      count: outRows.length,
      cutoffIso,
      rows: outRows,
      csv: toCsv(outRows),
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.post('/api/execute', async (req, res) => {
  try {
    if (!configReady()) return res.status(500).json({ error: 'Missing API_KEY or MANAGEMENT_TOKEN in .env' });

    const days = Number(req.body.days || 7);
    const branch = req.body.branch || DEFAULT_BRANCH;
    const locale = req.body.locale || DEFAULT_LOCALE;
    const selected = Array.isArray(req.body.environments) ? req.body.environments : [];
    const selectedEnvUids = enforceAllowedEnvironments(selected);

    const entries = await getAllEventCards(branch, locale);
    const { rows, cutoffIso } = computeCandidates({ entries, days, selectedEnvUids });

    const headers = buildHeaders(branch);
    const results = [];

    for (const row of rows) {
      const url = `${BASE_URL}/v3/content_types/${CONTENT_TYPE_UID}/entries/${row.uid}/unpublish`;
      const payload = { entry: { environment: row.environment, locales: [locale] } };
      const apiResult = await cmaPost(url, headers, payload);
      results.push({
        ...row,
        status: apiResult.ok ? 'unpublished' : 'failed',
        message: apiResult.message,
      });
    }

    const failed = results.filter((r) => r.status === 'failed').length;
    res.json({
      mode: 'execute',
      count: results.length,
      failed,
      cutoffIso,
      rows: results,
      csv: toCsv(results),
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.post('/api/schedule-template', (req, res) => {
  const branch = req.body.branch || DEFAULT_BRANCH;
  const locale = req.body.locale || DEFAULT_LOCALE;
  const days = Number(req.body.days || 7);
  const envs = Array.isArray(req.body.environments) ? enforceAllowedEnvironments(req.body.environments) : [];

  const envArgs = envs.map((e) => `--environment ${e}`).join(' ');
  const script = 'auto_unpublish_old_event_cards.py';
  const cmd = `python ${script} --branch ${branch} --locale ${locale} --days ${days} ${envArgs} --execute --output-log event_card_unpublish_scheduled_run.csv`;

  res.json({ command: cmd.trim() });
});

app.listen(PORT, () => {
  console.log(`Custom app server running on http://localhost:${PORT}`);
  if (!configReady()) {
    console.log('Warning: API_KEY or MANAGEMENT_TOKEN is missing in .env');
  }
});
