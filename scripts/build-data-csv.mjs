/**
 * Fetches survey data from the public Google Sheets CSV export and rebuilds dashboard.json.
 * Use this as an alternative to build-data.js when the service account key is unavailable.
 */

import { parse } from 'csv-parse/sync';
import { writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1q_UxDw5twrI5VCNUyE75t3LJMtZin8TeAtwyn__qxFg/export?format=csv&gid=0';

const fieldMap = JSON.parse(readFileSync(join(ROOT, 'data/field-map.json'), 'utf-8'));

// ─── Quote scoring (mirrors build-data.js) ────────────────────────────────────

const VIVID_WORDS = [
  'addict', 'distract', 'anxious', 'anxiety', 'mental health', 'worried',
  'struggling', 'harm', 'damage', 'social media', 'hours', 'behavior',
  'focus', 'attention', 'bully', 'sleep', 'stress', 'overwhelm',
  'constantly', 'concerned', 'frustrated', 'disappointed', 'scared',
  'research', 'evidence', 'inappropriate', 'limit', 'ban', 'policy',
  'never', 'always', 'every day', 'all day', 'cannot', "can't",
];

const EXCLUDE_QUOTES = [
  'I sometimes find out my child has been onscreen a lot',
  'These devices are not issued by school but they are required',
  'chrome book out at lunch',
  'I am looping back to use for Social Studies and Science',
];

// Substrings identifying quotes that should NOT be truncated
const NO_TRUNCATE_QUOTES = [
  'Kids are playing videogames, shopping, and exposed to inappropriate content',
];

// Extra text to append to specific quotes (keyed by NO_TRUNCATE substring match)
const APPEND_TO_QUOTES = {
  'Kids are playing videogames': '\n\n- AI cheating is rampant. Serious concern about the inequity of AI cheaters in HS getting away with it and taking the spots in college. Get rid of 1:1 all the way through 12th grade.',
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

// ─── Aggregation (mirrors build-data.js) ─────────────────────────────────────

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
    policies: {},
  };
}

function aggregateRow(bucket, getCell) {
  bucket.totalResponses++;

  const county = getCell('county');
  if (county) increment(bucket.byCounty, county);

  for (const field of fieldMap.sentimentFields) {
    const val = getCell(field);
    if (val && val in bucket.screenTimeSentiment) bucket.screenTimeSentiment[val]++;
  }

  const tooMuchAnyBand = BAND_FIELDS.some(({ field }) => getCell(field) === 'Too much');
  if (tooMuchAnyBand) bucket.anyTooMuch++;

  for (const { field, band } of BAND_FIELDS) {
    const val = getCell(field);
    if (val && val in bucket.byGradeBand[band]) bucket.byGradeBand[band][val]++;
  }

  const comms = getCell('commsRating') || getCell('communication');
  if (comms && comms in bucket.commsRating) bucket.commsRating[comms]++;

  const hasConcerns = getCell('hasConcerns');
  if (hasConcerns === 'Yes') {
    bucket.concernsTopLine.Yes++;
    const concernList = parseKnownOptions(getCell('concerns'), fieldMap.concernOptions);
    for (const concern of concernList) {
      if (concern !== 'Other') increment(bucket.concernsBreakdown, concern);
    }
  } else if (hasConcerns === 'No') {
    bucket.concernsTopLine.No++;
  }

  const policyList = parseKnownOptions(getCell('policies'), fieldMap.policyOptions);
  for (const policy of policyList) {
    if (policy !== 'Other') increment(bucket.policies, policy);
  }
}

function sortDesc(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([, a], [, b]) => b - a));
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
    policies: sortDesc(b.policies),
  };
}

// ─── Curated featured quotes (from generate-report.mjs) ──────────────────────

const featuredQuotes = [
  { text: "My biggest concern is school devices undermining screen time policies at home. My 5th grader exclusively has homework on her Chromebook; it's difficult to police where homework ends and YouTube time begins.", county: 'Philadelphia' },
  { text: "My daughter spends way too much time on screens at school. Much of her curriculum is screen based. She\u2019s exhausted and unregulated when she gets home.", county: 'Allegheny' },
  { text: "My daughter was able to access an inappropriate website with a chat feature. When I alerted the school they fixed it and said their protection software had expired and they forgot to renew it\u2026", county: 'Montgomery' },
  { text: "Despite district filters and automated device usage reports sent to me, my 8th grader spends a huge amount of time playing games, watching YouTube shorts, and checking professional sports statistics while at school. When he comes home, I spend time sitting with him helping him stay on track while he gets his online school work completed.", county: 'Bucks' },
  { text: "My daughter says teachers don\u2019t teach, they just say \u201cgo to [insert app] on ipad, watch the video and answer the questions.\u201d She says as a result of this, teachers don\u2019t know how to teach the material they\u2019ve been tasked with teaching when kids have a question.", county: 'Delaware' },
  { text: "Our school district allows YouTube, which is not something our children have access to at home. Our district also uses Aristotle, however it works haphazardly. This past fall, my 12 year old came across and Ai chat site through his school issued Chromebook.", county: 'Lancaster' },
  { text: "My 6 year old son in kindergarten told me today that \u201cmost of his friends watch YouTube on the school iPad\u201d \n6\u2026 years\u2026 old\u2026 in kindergarten.", county: 'Westmoreland' },
  { text: "We were not given an option of wanting a device. We are also responsible for any damages that may occur to said device throughout the year. Students also bring device home throughout the summer further undermining our strict no device policy at home.", county: 'Luzerne' },
  { text: "I genuinely have no idea how much time my daughter is in her iPad every day. The school doesn\u2019t communicate it well. We used to do screens on a regular basis at home but we have stopped because of how much ambiguity there is with her school usage.", county: 'Cumberland' },
  { text: "My son\u2019s teacher told us that there is no way for the school to block everything inappropriate. As parents, I feel as if the school is undoing a lot of our hard work when it comes to limiting screen time and ensuring we know what they are accessing.", county: 'Lackawanna' },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('Fetching sheet CSV...');
const res = await fetch(SHEET_URL);
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const csv = await res.text();

const records = parse(csv, { columns: true, skip_empty_lines: true, relax_quotes: true });
console.log(`Parsed ${records.length} rows`);

// Map CSV column headers to internal field names
const colMap = fieldMap.columns;
function getCell(row, field) {
  // Try direct match first, then look up via colMap
  if (row[field] !== undefined) return (row[field] || '').trim();
  const mapped = Object.entries(colMap).find(([, v]) => v === field)?.[0];
  return mapped ? (row[mapped] || '').trim() : '';
}

const global = emptyBucket();
const byDistrict = {};
const bySchoolType = {};
const quotePool = [];

for (const row of records) {
  if (Object.values(row).every(v => !v)) continue;

  const gc = (field) => getCell(row, field);
  aggregateRow(global, gc);

  const schoolType = gc('schoolType');
  if (schoolType) {
    if (!bySchoolType[schoolType]) bySchoolType[schoolType] = emptyBucket();
    aggregateRow(bySchoolType[schoolType], gc);
  }

  let district = gc('district');
  if (!district || district.toLowerCase().includes('other')) district = gc('districtOther');
  if (district) {
    if (!byDistrict[district]) byDistrict[district] = emptyBucket();
    aggregateRow(byDistrict[district], gc);
  }

  const detail = gc('concernDetails');
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
      quotePool.push({ text: truncated, county: gc('county') || null, district: district || null, score: 999, wide: true });
    } else if (score > 0) {
      quotePool.push({ text: truncated, county: gc('county') || null, district: district || null, score });
    }
  }
}

quotePool.sort((a, b) => b.score - a.score);
console.log(`Quote pool: ${quotePool.length} scored`);

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
  if (quotesByCounty[q.county].length < 6) quotesByCounty[q.county].push({ text: q.text, county: q.county });
}
// Append wide quotes at the end
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

const districts = Object.entries(byDistrict)
  .sort(([, a], [, b]) => b.totalResponses - a.totalResponses)
  .map(([name]) => name);

const sortedByDistrict = {};
for (const name of districts) sortedByDistrict[name] = sortBucket(byDistrict[name]);

const sortedBySchoolType = {};
for (const [type, bucket] of Object.entries(bySchoolType)) sortedBySchoolType[type] = sortBucket(bucket);

const output = {
  generated: new Date().toISOString(),
  ...sortBucket(global),
  districts,
  byDistrict: sortedByDistrict,
  bySchoolType: sortedBySchoolType,
  featuredQuotes,
  quotesByCounty,
  quotesByDistrict,
};

const outPath = join(ROOT, 'public/data/dashboard.json');
writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(`Written to ${outPath}`);
console.log(`Total responses: ${output.totalResponses}`);
console.log(`Counties: ${Object.keys(output.byCounty).length}, Districts: ${districts.length}`);
