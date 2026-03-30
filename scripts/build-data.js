#!/usr/bin/env node
/**
 * Build data pipeline — fetches PA Unplugged EdTech Survey responses from Google Sheets,
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
  'I sometimes find out my child has been onscreen a lot',
  'These devices are not issued by school but they are required',
  'chrome book out at lunch',
  'Kids are playing videogames, shopping, and exposed to inappropriate content',
  'I am looping back to use for Social Studies and Science',
];

const MAX_QUOTE_LEN = 360;

function truncateQuote(text) {
  const t = text.trim();
  if (t.length <= MAX_QUOTE_LEN) return t;
  const sub = t.slice(0, MAX_QUOTE_LEN);
  // Prefer paragraph boundary (sentence end before a newline)
  const paraEnd = Math.max(sub.lastIndexOf('.\n'), sub.lastIndexOf('!\n'), sub.lastIndexOf('?\n'));
  if (paraEnd > MAX_QUOTE_LEN * 0.35) return t.slice(0, paraEnd + 1).trim();
  // Fall back to inline sentence boundary
  const sentEnd = Math.max(sub.lastIndexOf('. '), sub.lastIndexOf('! '), sub.lastIndexOf('? '));
  if (sentEnd > MAX_QUOTE_LEN * 0.35) return t.slice(0, sentEnd + 1).trim();
  return sub.slice(0, sub.lastIndexOf(' ')).trim() + '\u2026';
}

function scoreQuote(text) {
  const trimmed = text.trim();
  const len = trimmed.length;
  if (len < 70) return 0;
  const lower = trimmed.toLowerCase();
  // Peak score around 200-300 chars; penalise very long responses
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

  // Overall screen time sentiment (all bands combined)
  for (const field of fieldMap.sentimentFields) {
    const val = getCell(row, field);
    if (val && val in bucket.screenTimeSentiment) {
      bucket.screenTimeSentiment[val]++;
    }
  }

  // Track if any band said "Too much" (per unique respondent)
  const tooMuchAnyBand = BAND_FIELDS.some(({ field }) => getCell(row, field) === 'Too much');
  if (tooMuchAnyBand) bucket.anyTooMuch++;

  // Per-band sentiment
  for (const { field, band } of BAND_FIELDS) {
    const val = getCell(row, field);
    if (val && val in bucket.byGradeBand[band]) {
      bucket.byGradeBand[band][val]++;
    }
  }

  // School communication rating
  // NOTE: sheet column may be 'commsRating' or 'communication' depending on Apps Script
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

  // Attribute concerns to each grade band the respondent has children in
  for (const { field, band } of BAND_FIELDS) {
    const val = getCell(row, field);
    if (!val) continue; // respondent has no child in this band
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

    let district = getCell(row, 'district');
    if (!district || district.toLowerCase().includes('other')) {
      district = getCell(row, 'districtOther');
    }
    if (district) {
      if (!byDistrict[district]) byDistrict[district] = emptyBucket();
      aggregateRow(byDistrict[district], row, getCell);
    }

    const detail = getCell(row, 'concernDetails');
    if (detail) {
      const truncated = truncateQuote(detail);
      if (EXCLUDE_QUOTES.some(ex => truncated.includes(ex))) continue;
      const score = scoreQuote(truncated);
      if (score > 0) quotePool.push({ text: truncated, county: getCell(row, 'county') || null, district: district || null, score });
    }
  }

  quotePool.sort((a, b) => b.score - a.score);

  // Hand-curated statewide featured quotes — 20 voices, one per county,
  // selected for broad relatability and impact with maximum geographic diversity.
  const featuredQuotes = [
    { text: "My biggest concern is school devices undermining screen time policies at home. My 5th grader exclusively has homework on her Chromebook; it's difficult to police where homework ends and YouTube time begins.", county: 'Philadelphia' },
    { text: "My daughter spends way too much time on screens at school. Much of her curriculum is screen based. She\u2019s exhausted and unregulated when she gets home.", county: 'Allegheny' },
    { text: "I\u2019m very concerned about the lack of evidence of growth using ed tech vs \u201cold school methods\u201d. The data suggests their is no growth using the ed tech and could argue it is creating a disconnect between student and teacher/classroom. The more we rely on AI and Ed Tech, the more detrimental to the development of our children.", county: 'Montgomery' },
    { text: "Despite district filters and automated device usage reports sent to me, my 8th grader spends a huge amount of time playing games, watching YouTube shorts, and checking professional sports statistics while at school. When he comes home, I spend time sitting with him helping him stay on track while he gets his online school work completed.", county: 'Bucks' },
    { text: "The district\u2019s reliance on devices is misguided. Routine screen use is not synonymous with academic rigor or future readiness. Students do not need constant exposure to technology to succeed in a digital world \u2014 they need strong literacy, critical thinking, attention, and interpersonal skills.", county: 'Delaware' },
    { text: "I would like screens banned in elementary school ideally but at minimum a return to shared bank that they visit on a rotation. I think it\u2019s terrible that my kids use screens more than they have gym in a week.", county: 'Chester' },
    { text: "Our school district allows YouTube, which is not something our children have access to at home. Our district also uses Aristotle, however it works haphazardly. This past fall, my 12 year old came across and Ai chat site through his school issued Chromebook.", county: 'Lancaster' },
    { text: "My 6 year old son in kindergarten told me today that \u201cmost of his friends watch YouTube on the school iPad\u201d \n6\u2026 years\u2026 old\u2026 in kindergarten.", county: 'Westmoreland' },
    { text: "We were not given an option of wanting a device. We are also responsible for any damages that may occur to said device throughout the year. Students also bring device home throughout the summer further undermining our strict no device policy at home.", county: 'Luzerne' },
    { text: "I genuinely have no idea how much time my daughter is in her iPad every day. The school doesn\u2019t communicate it well. We used to do screens on a regular basis at home but we have stopped because of how much ambiguity there is with her school usage.", county: 'Cumberland' },
    { text: "My son\u2019s teacher told us that there is no way for the school to block everything inappropriate. As parents, I feel as if the school is undoing a lot of our hard work when it comes to limiting screen time and ensuring we know what they are accessing.", county: 'Lackawanna' },
    { text: "As a parent, I am not allowed to put any monitoring software on the school device. This makes me extremely uncomfortable as my children are allowed to utilize youtube and other websites where harmful content can easily be found.", county: 'Beaver' },
    { text: "We are very concerned that screens are overused and that schools are not following practices that are best for children from multiple standpoints (mental, physical, social, educational, safety, ets.)\n\nThe devices have restricted some parental access to their students\u2019 work and assessments. This is a huge concern.", county: 'Chester' },
    { text: "The programs that are intended to remediate and re-teach are all \u201ccheatable.\u201d I\u2019m a teacher, and students know how to \u201cAI\u201d answers for everything online. Also, screen-work leads to students having less pride and care for their work.", county: 'Lehigh' },
    { text: "I do not think that kindergarteners should have computers or personal screen time AT ALL. Starting later (even third or fourth grade) would be better. I have looked at the \u201ceducational\u201d programs my children use at school, and most, especially the reading apps, have no educational value at all in my opinion.", county: 'Centre' },
    { text: "The School District of Philadelphia issue chromebooks to families during COVID but then kept them in place afterwards without asking families if we wanted to take that on. We\u2019re now responsible for these devices and we don\u2019t want to be. Additionally, the protections aren\u2019t great and parents can\u2019t put controls on them.", county: 'Philadelphia' },
    { text: "I\u2019m concerned about auto-correct on Google correcting all of my son\u2019s work before he submits it. Most of his assignments and projects are done on Google Slides. He is in high school and spends a lot of time at school using his Chromebook to watch Youtube and read the news.", county: 'Northampton' },
    { text: "Data privacy is my only concern. Use of third-party services are so tempting for schools that do not have the budgets or skills to build the technology they want to use or teach in-house.", county: 'Erie' },
    { text: "Children are not taught how to read/write/type before being given chromebooks to use for school assignments. Kindergarteners should not have Chromebooks at all!", county: 'Monroe' },
    { text: "Some grade levels are allowed to have their screens at lunch, which is of major concern to me.", county: 'Lebanon' },
  ];
  console.log(`Quote pool: ${quotePool.length} scored, using ${featuredQuotes.length} hand-curated featured quotes`);

  // Top 6 quotes per county (pool already sorted by score descending)
  const quotesByCounty = {};
  for (const q of quotePool) {
    if (!q.county) continue;
    if (!quotesByCounty[q.county]) quotesByCounty[q.county] = [];
    if (quotesByCounty[q.county].length < 6) {
      quotesByCounty[q.county].push({ text: q.text, county: q.county });
    }
  }

  // Top quotes per district (pool already sorted by score descending)
  const quotesByDistrict = {};
  for (const q of quotePool) {
    if (!q.district) continue;
    if (!quotesByDistrict[q.district]) quotesByDistrict[q.district] = [];
    quotesByDistrict[q.district].push({ text: q.text, county: q.county });
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
