#!/usr/bin/env node
/**
 * Build data pipeline — fetches Knox County EdTech Survey responses from Google Sheets,
 * aggregates counts, and writes public/data/dashboard.json for the React frontend.
 *
 * Required env vars:
 *   GOOGLE_SERVICE_ACCOUNT_KEY  — base64-encoded JSON service account key
 *   GOOGLE_SHEET_ID             — ID of the Google Sheet (from URL)
 */

import { google } from 'googleapis';
import { writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const fieldMap = JSON.parse(readFileSync(join(ROOT, 'data/field-map.json'), 'utf-8'));

const keyB64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const sheetId = process.env.GOOGLE_SHEET_ID;

if (!keyB64 || !sheetId) {
  console.error('Missing required env vars: GOOGLE_SERVICE_ACCOUNT_KEY, GOOGLE_SHEET_ID');
  process.exit(1);
}

const keyJson = JSON.parse(Buffer.from(keyB64, 'base64').toString('utf-8'));
const auth = new google.auth.GoogleAuth({
  credentials: keyJson,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });

const VIVID_WORDS = [
  'addict', 'distract', 'anxious', 'anxiety', 'mental health', 'worried',
  'struggling', 'harm', 'damage', 'social media', 'hours', 'behavior',
  'focus', 'attention', 'bully', 'sleep', 'stress', 'overwhelm',
  'constantly', 'concerned', 'frustrated', 'disappointed', 'scared',
  'research', 'evidence', 'inappropriate', 'limit', 'ban', 'policy',
  'never', 'always', 'every day', 'all day', 'cannot', "can't",
];

// Substrings that uniquely identify quotes to exclude from display
const EXCLUDE_QUOTES = [
];

// Substrings identifying quotes that should NOT be truncated
const NO_TRUNCATE_QUOTES = [
];

// Extra text to append to specific quotes (keyed by NO_TRUNCATE substring match)
const APPEND_TO_QUOTES = {
};

const MAX_QUOTE_LEN = 360;

function truncateQuote(text) {
  const t = text.trim();
  if (NO_TRUNCATE_QUOTES.some(s => t.includes(s))) return t;
  if (t.length <= MAX_QUOTE_LEN) return t;
  const sub = t.slice(0, MAX_QUOTE_LEN);
  const paraEnd = Math.max(sub.lastIndexOf('.\n'), sub.lastIndexOf('!\n'), sub.lastIndexOf('?\n'));
  if (paraEnd > MAX_QUOTE_LEN * 0.35) return t.slice(0, paraEnd + 1).trim();
  const sentEnd = Math.max(sub.lastIndexOf('. '), sub.lastIndexOf('! '), sub.lastIndexOf('? '));
  if (sentEnd > MAX_QUOTE_LEN * 0.35) return t.slice(0, sentEnd + 1).trim();
  return sub.slice(0, sub.lastIndexOf(' ')).trim() + '\u2026';
}

function scoreQuote(text) {
  const trimmed = text.trim();
  const len = trimmed.length;
  if (len < 70) return 0;
  const lower = trimmed.toLowerCase();
  const lenScore = Math.min(len, 300) / 300 * 35 - Math.max(0, (len - 350) / 150) * 8;
  let score = lenScore;
  for (const word of VIVID_WORDS) {
    if (lower.includes(word)) score += 6;
  }
  if (/[.!?]$/.test(trimmed)) score += 5;
  return score;
}

const BAND_FIELDS = [
  { field: 'deviceTime_K-2', band: 'K-2' },
  { field: 'deviceTime_3-5', band: '3-5' },
  { field: 'deviceTime_6-8', band: '6-8' },
  { field: 'deviceTime_9-12', band: '9-12' },
];

const EMPTY_SENTIMENT = () => ({
  'Too much': 0, 'Just right': 0, 'Not enough': 0, 'No opinion': 0, "I don't know": 0,
});

function increment(obj, key) {
  if (!key) return;
  const k = key.trim();
  if (!k) return;
  obj[k] = (obj[k] || 0) + 1;
}

function parseKnownOptions(raw, knownOptions) {
  if (!raw) return [];
  return knownOptions.filter(opt => raw.includes(opt));
}

function emptyBucket() {
  return {
    totalResponses: 0,
    byCounty: {},
    screenTimeSentiment: EMPTY_SENTIMENT(),
    byGradeBand: {
      'K-2': EMPTY_SENTIMENT(),
      '3-5': EMPTY_SENTIMENT(),
      '6-8': EMPTY_SENTIMENT(),
      '9-12': EMPTY_SENTIMENT(),
    },
    commsRating: { 'Very poorly': 0, 'Poorly': 0, 'Neutral': 0, 'Well': 0, 'Very well': 0 },
    anyTooMuch: 0,
    concernsTopLine: { Yes: 0, No: 0 },
    concernsBreakdown: {},
    concernsByGradeBand: {
      'K-2': { topLine: { Yes: 0, No: 0 }, breakdown: {} },
      '3-5': { topLine: { Yes: 0, No: 0 }, breakdown: {} },
      '6-8': { topLine: { Yes: 0, No: 0 }, breakdown: {} },
      '9-12': { topLine: { Yes: 0, No: 0 }, breakdown: {} },
    },
    policies: {},
  };
}

function aggregateRow(bucket, row, getCell) {
  bucket.totalResponses++;

  const county = getCell(row, 'county');
  if (county) increment(bucket.byCounty, county);

  for (const field of fieldMap.sentimentFields) {
    const val = getCell(row, field);
    if (val && val in bucket.screenTimeSentiment) {
      bucket.screenTimeSentiment[val]++;
    }
  }

  const tooMuchAnyBand = BAND_FIELDS.some(({ field }) => getCell(row, field) === 'Too much');
  if (tooMuchAnyBand) bucket.anyTooMuch++;

  for (const { field, band } of BAND_FIELDS) {
    const val = getCell(row, field);
    if (val && val in bucket.byGradeBand[band]) {
      bucket.byGradeBand[band][val]++;
    }
  }

  const comms = getCell(row, 'commsRating') || getCell(row, 'communication');
  if (comms && comms in bucket.commsRating) {
    bucket.commsRating[comms]++;
  }

  const hasConcerns = getCell(row, 'hasConcerns');
  const concernList = hasConcerns === 'Yes'
    ? parseKnownOptions(getCell(row, 'concerns'), fieldMap.concernOptions)
    : [];

  if (hasConcerns === 'Yes') {
    bucket.concernsTopLine.Yes++;
    for (const concern of concernList) {
      if (concern !== 'Other') increment(bucket.concernsBreakdown, concern);
    }
  } else if (hasConcerns === 'No') {
    bucket.concernsTopLine.No++;
  }

  for (const { field, band } of BAND_FIELDS) {
    const val = getCell(row, field);
    if (!val) continue;
    if (hasConcerns === 'Yes') {
      bucket.concernsByGradeBand[band].topLine.Yes++;
      for (const concern of concernList) {
        if (concern !== 'Other') increment(bucket.concernsByGradeBand[band].breakdown, concern);
      }
    } else if (hasConcerns === 'No') {
      bucket.concernsByGradeBand[band].topLine.No++;
    }
  }

  const policyList = parseKnownOptions(getCell(row, 'policies'), fieldMap.policyOptions);
  for (const policy of policyList) {
    if (policy !== 'Other') increment(bucket.policies, policy);
  }
}

function sortBucket(b) {
  return {
    totalResponses: b.totalResponses,
    byCounty: sortDesc(b.byCounty),
    screenTimeSentiment: b.screenTimeSentiment,
    anyTooMuch: b.anyTooMuch,
    byGradeBand: b.byGradeBand,
    commsRating: b.commsRating,
    concernsTopLine: b.concernsTopLine,
    concernsBreakdown: sortDesc(b.concernsBreakdown),
    concernsByGradeBand: Object.fromEntries(
      Object.entries(b.concernsByGradeBand).map(([band, data]) => [
        band, { topLine: data.topLine, breakdown: sortDesc(data.breakdown) },
      ])
    ),
    policies: sortDesc(b.policies),
  };
}

function sortDesc(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([, a], [, b]) => b - a));
}

async function main() {
  console.log('Fetching sheet data...');

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'A:AZ',
  });

  const rows = response.data.values;
  if (!rows || rows.length < 2) {
    console.log('No data found in sheet.');
    writeOutput({ ...emptyBucket(), byDistrict: {}, districts: [] });
    return;
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);
  console.log(`Found ${dataRows.length} response rows`);
  console.log('Sheet headers:', headers.join(', '));

  const colIndex = {};
  headers.forEach((h, i) => { colIndex[h] = i; });

  function getCell(row, colName) {
    const idx = colIndex[colName];
    return idx !== undefined ? (row[idx] || '').trim() : '';
  }

  const global = emptyBucket();
  const byDistrict = {};
  const bySchoolType = {};
  const quotePool = [];

  for (const row of dataRows) {
    if (!row || row.every(c => !c)) continue;

    aggregateRow(global, row, getCell);

    const schoolType = getCell(row, 'schoolType');
    if (schoolType) {
      if (!bySchoolType[schoolType]) bySchoolType[schoolType] = emptyBucket();
      aggregateRow(bySchoolType[schoolType], row, getCell);
    }

    let district = getCell(row, 'district') || getCell(row, 'county');
    if (!district || district.toLowerCase().includes('other')) {
      district = getCell(row, 'districtOther');
    }
    if (district) {
      if (!byDistrict[district]) byDistrict[district] = emptyBucket();
      aggregateRow(byDistrict[district], row, getCell);
    }

    const detail = getCell(row, 'concernDetails');
    if (detail) {
      const isFullLength = NO_TRUNCATE_QUOTES.some(s => detail.includes(s));
      let truncated = isFullLength ? detail.trim() : truncateQuote(detail);
      if (isFullLength) {
        for (const [key, extra] of Object.entries(APPEND_TO_QUOTES)) {
          if (truncated.includes(key)) truncated += extra;
        }
      }
      if (EXCLUDE_QUOTES.some(ex => truncated.includes(ex))) continue;
      const score = scoreQuote(truncated);
      if (isFullLength) {
        quotePool.push({ text: truncated, county: getCell(row, 'county') || null, district: district || null, score: 999, wide: true });
      } else if (score > 0) {
        quotePool.push({ text: truncated, county: getCell(row, 'county') || null, district: district || null, score });
      }
    }
  }

  quotePool.sort((a, b) => b.score - a.score);

  // Featured quotes — replace these with real Knox County responses once survey data comes in
 const featuredQuotes = quotePool
  .filter(q => {
    const row = dataRows.find(r => {
      const detail = getCell(r, 'concernDetails');
      return detail && q.text.startsWith(detail.trim().slice(0, 40));
    });
    if (!row) return false;
    return getCell(row, 'featuredQuote') === 'Yes';
  })
  .map(q => ({ text: q.text, county: q.district || q.county }));

  console.log(`Quote pool: ${quotePool.length} scored, using ${featuredQuotes.length} featured quotes`);

  const quotesByCounty = {};
  const wideQuotesByCounty = {};
  for (const q of quotePool) {
    if (!q.county) continue;
    if (q.wide) {
      if (!wideQuotesByCounty[q.county]) wideQuotesByCounty[q.county] = [];
      wideQuotesByCounty[q.county].push({ text: q.text, county: q.county, wide: true });
      continue;
    }
    if (!quotesByCounty[q.county]) quotesByCounty[q.county] = [];
    if (quotesByCounty[q.county].length < 6) {
      quotesByCounty[q.county].push({ text: q.text, county: q.county });
    }
  }
  for (const [county, wides] of Object.entries(wideQuotesByCounty)) {
    if (!quotesByCounty[county]) quotesByCounty[county] = [];
    quotesByCounty[county].push(...wides);
  }

  const quotesByDistrict = {};
  const wideQuotesByDistrict = {};
  for (const q of quotePool) {
    if (!q.district) continue;
    if (q.wide) {
      if (!wideQuotesByDistrict[q.district]) wideQuotesByDistrict[q.district] = [];
      wideQuotesByDistrict[q.district].push({ text: q.text, county: q.county, wide: true });
      continue;
    }
    if (!quotesByDistrict[q.district]) quotesByDistrict[q.district] = [];
    quotesByDistrict[q.district].push({ text: q.text, county: q.county });
  }
  for (const [dist, wides] of Object.entries(wideQuotesByDistrict)) {
    if (!quotesByDistrict[dist]) quotesByDistrict[dist] = [];
    quotesByDistrict[dist].push(...wides);
  }

  const commsTotal = Object.values(global.commsRating).reduce((a, b) => a + b, 0);
  console.log(`Comms rating responses: ${commsTotal}`, global.commsRating);
  console.log('School types found:', Object.entries(bySchoolType).map(([k, v]) => `${k}: ${v.totalResponses}`).join(', '));

  const districts = Object.entries(byDistrict)
    .sort(([, a], [, b]) => b.totalResponses - a.totalResponses)
    .map(([name]) => name);

  const sortedByDistrict = {};
  for (const name of districts) {
    sortedByDistrict[name] = sortBucket(byDistrict[name]);
  }

  const sortedBySchoolType = {};
  for (const [type, bucket] of Object.entries(bySchoolType)) {
    sortedBySchoolType[type] = sortBucket(bucket);
  }

  writeOutput({ ...sortBucket(global), byDistrict: sortedByDistrict, districts, bySchoolType: sortedBySchoolType, featuredQuotes, quotesByCounty, quotesByDistrict });
}

function writeOutput(data) {
  const output = {
    generated: new Date().toISOString(),
    totalResponses: data.totalResponses || 0,
    byCounty: data.byCounty || {},
    anyTooMuch: data.anyTooMuch || 0,
    screenTimeSentiment: data.screenTimeSentiment || {},
    byGradeBand: data.byGradeBand || {},
    commsRating: data.commsRating || {},
    concernsTopLine: data.concernsTopLine || {},
    concernsBreakdown: data.concernsBreakdown || {},
    concernsByGradeBand: data.concernsByGradeBand || {},
    policies: data.policies || {},
    districts: data.districts || [],
    byDistrict: data.byDistrict || {},
    bySchoolType: data.bySchoolType || {},
    featuredQuotes: data.featuredQuotes || [],
    quotesByCounty: data.quotesByCounty || {},
    quotesByDistrict: data.quotesByDistrict || {},
  };

  const outPath = join(ROOT, 'public/data/dashboard.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Written to ${outPath}`);
  console.log(`Total responses: ${output.totalResponses}`);
  console.log(`Districts: ${output.districts.length} (${output.districts.slice(0, 5).join(', ')}...)`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
