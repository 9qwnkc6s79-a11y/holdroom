/**
 * Hatch inquiry endpoint.
 * Bound to a Google Sheet. Deploy as a web app: Execute as me, access Anyone.
 * Script property NOTIFY_TO overrides the notification address.
 *
 * Runtime: Apps Script V8.
 */

var SHEET_NAME = 'Inquiries';
var DEFAULT_NOTIFY = 'daniel.keene223@gmail.com';
var TIMEZONE = 'America/Chicago';
var MIN_FILL_MS = 3000;
var RATE_WINDOW_MS = 10 * 60 * 1000;
var RATE_PER_EMAIL = 5;
var RATE_OVERALL = 20;

var HEADERS = [
  'timestamp',
  'name',
  'email',
  'company',
  'role',
  'firm size',
  'phone',
  'use case',
  'timeline',
  'source',
  'source other',
  'tier',
  'message',
  'page URL',
  'user agent',
  'status'
];

var LIMITS = {
  name: 120,
  email: 254,
  company: 200,
  role: 120,
  firm_size: 40,
  phone: 40,
  use_case: 4000,
  timeline: 40,
  source: 40,
  source_other: 200,
  tier: 120,
  message: 4000,
  page_url: 1000,
  user_agent: 400,
  loaded_at: 20
};

var FIRM_SIZES = ['Under 50', '50–250', '250–1,000', '1,000+'];
var TIMELINES = ['Exploring', '0–3 months', '3–6 months', '6+ months'];
var SOURCES = ['Referral', 'Search', 'LinkedIn', 'Event', 'Other'];
var TIERS = [
  'Firm — $18k + $24k/yr',
  'Enterprise — $28k + $48k/yr',
  'Corporation — talk to us'
];

function doGet() {
  return jsonResponse({ ok: true, service: 'hatch-inquiry' });
}

function doPost(e) {
  try {
    return handlePost(e);
  } catch (err) {
    try {
      var raw = '';
      try {
        if (e && e.postData && e.postData.contents) raw = String(e.postData.contents).slice(0, 4000);
        else raw = JSON.stringify(e && e.parameter ? e.parameter : {});
      } catch (ignore) {
        raw = '';
      }
      MailApp.sendEmail({
        to: notifyAddress(),
        subject: 'Hatch inquiry failed before it could be saved',
        body: 'The inquiry endpoint threw before a normal save.\n\n' +
          String(err && err.stack ? err.stack : err) +
          '\n\nRaw submission (truncated):\n' + raw,
        name: 'Hatch'
      });
    } catch (mailErr) {
      // Nothing else we can do from here.
    }
    return jsonResponse({ ok: false, error: 'server' });
  }
}

function handlePost(e) {
  var data = parsePayload(e);
  if (!data) return jsonResponse({ ok: false, error: 'bad_body' });

  if (String(data.hp_field == null ? '' : data.hp_field).length > 0) {
    return jsonResponse({ ok: false, error: 'rejected' });
  }

  var tooLong = overLongField(data);
  if (tooLong) return jsonResponse({ ok: false, error: 'too_long', field: tooLong });

  var name = oneLine(data.name);
  var email = oneLine(data.email).toLowerCase();
  var company = oneLine(data.company);
  var role = oneLine(data.role);
  var phone = oneLine(data.phone);
  var useCase = cleanText(data.use_case);
  var sourceOther = cleanText(data.source_other);
  var message = cleanText(data.message);
  var pageUrl = oneLine(data.page_url);
  var userAgent = oneLine(data.user_agent);

  if (!name || !email || !company || !role || !useCase) {
    return jsonResponse({ ok: false, error: 'missing' });
  }
  if (!isEmail(email)) return jsonResponse({ ok: false, error: 'invalid_email' });

  var firmSize = canonicalChoice(FIRM_SIZES, data.firm_size);
  var timeline = canonicalChoice(TIMELINES, data.timeline);
  if (!firmSize || !timeline) return jsonResponse({ ok: false, error: 'bad_field' });

  var sourceRaw = oneLine(data.source);
  var source = '';
  if (sourceRaw) {
    source = canonicalChoice(SOURCES, sourceRaw);
    if (!source) return jsonResponse({ ok: false, error: 'bad_field' });
  }
  if (source !== 'Other') sourceOther = '';

  var tierRaw = oneLine(data.tier);
  var tier = 'Not sure yet';
  if (tierRaw && canonKey(tierRaw) !== 'not sure yet' && canonKey(tierRaw) !== 'not sure') {
    tier = canonicalChoice(TIERS, tierRaw);
    if (!tier) return jsonResponse({ ok: false, error: 'bad_field' });
  }

  if (!filledSlowEnough(data.loaded_at)) {
    return jsonResponse({ ok: false, error: 'too_fast' });
  }

  var allowed = withLock(function () {
    return rateLimitAllows(email);
  });
  if (!allowed) return jsonResponse({ ok: false, error: 'rate_limited' });

  var record = {
    timestamp: Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss z'),
    name: name,
    email: email,
    company: company,
    role: role,
    firmSize: firmSize,
    phone: phone,
    useCase: useCase,
    timeline: timeline,
    source: source,
    sourceOther: sourceOther,
    tier: tier,
    message: message,
    pageUrl: pageUrl,
    userAgent: userAgent,
    sheetUrl: ''
  };

  var sheetError = '';
  var saved = false;
  try {
    withLock(function () {
      record.sheetUrl = appendInquiry(record);
    });
    saved = true;
  } catch (sheetErr) {
    sheetError = String(sheetErr && sheetErr.message ? sheetErr.message : sheetErr);
  }

  var notified = false;
  try {
    sendNotification(record, sheetError);
    notified = true;
  } catch (notifyErr) {
    if (!saved) return jsonResponse({ ok: false, error: 'delivery_failed' });
  }

  if (saved || notified) {
    try {
      sendConfirmation(record);
    } catch (confirmErr) {
      // The inquiry is already stored or Daniel already has the notification.
    }
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ ok: false, error: 'delivery_failed' });
}

function parsePayload(e) {
  var fromParams = {};
  if (e && e.parameter) {
    Object.keys(e.parameter).forEach(function (key) {
      fromParams[key] = e.parameter[key];
    });
  }

  var contents = e && e.postData && e.postData.contents ? String(e.postData.contents) : '';
  var type = e && e.postData && e.postData.type ? String(e.postData.type).toLowerCase() : '';

  if (contents && (type.indexOf('application/json') !== -1 || contents.trim().charAt(0) === '{')) {
    try {
      var parsed = JSON.parse(contents);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch (err) {
      if (type.indexOf('application/json') !== -1) return null;
    }
  }

  if (Object.keys(fromParams).length) return fromParams;

  if (contents && (type.indexOf('application/x-www-form-urlencoded') !== -1 || contents.indexOf('=') !== -1)) {
    return parseFormUrlEncoded(contents);
  }

  return fromParams;
}

function parseFormUrlEncoded(body) {
  var data = {};
  String(body).split('&').forEach(function (pair) {
    if (!pair) return;
    var idx = pair.indexOf('=');
    var rawKey = idx >= 0 ? pair.slice(0, idx) : pair;
    var rawVal = idx >= 0 ? pair.slice(idx + 1) : '';
    var key = safeDecode(rawKey.replace(/\+/g, ' '));
    var val = safeDecode(rawVal.replace(/\+/g, ' '));
    if (key) data[key] = val;
  });
  return data;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch (err) {
    return value;
  }
}

function overLongField(data) {
  var keys = Object.keys(LIMITS);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var raw = data[key] == null ? '' : String(data[key]);
    if (raw.length > LIMITS[key]) return key;
  }
  return '';
}

function filledSlowEnough(loadedAt) {
  var loaded = Number(loadedAt);
  if (!isFinite(loaded)) return false;
  var now = Date.now();
  if (loaded < Date.UTC(2020, 0, 1)) return false;
  if (loaded > now + 24 * 60 * 60 * 1000) return false;
  return now - loaded >= MIN_FILL_MS;
}

function rateLimitAllows(email) {
  try {
    var cache = CacheService.getScriptCache();
    if (!consumeQuota(cache, cacheKeyForEmail(email), RATE_PER_EMAIL)) return false;
    if (!consumeQuota(cache, 'inq_all', RATE_OVERALL)) return false;
    return true;
  } catch (err) {
    // Cache outages should not drop a real inquiry. MailApp quota still bounds a flood.
    return true;
  }
}

function consumeQuota(cache, key, limit) {
  var now = Date.now();
  var start = now;
  var count = 0;
  var raw = cache.get(key);
  if (raw) {
    var parts = String(raw).split('|');
    var parsedStart = Number(parts[0]);
    var parsedCount = Number(parts[1]);
    if (parsedStart && now - parsedStart < RATE_WINDOW_MS) {
      start = parsedStart;
      count = parsedCount || 0;
    }
  }
  if (count >= limit) return false;
  count += 1;
  var ttlSec = Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - start)) / 1000));
  cache.put(key, String(start) + '|' + String(count), ttlSec);
  return true;
}

function cacheKeyForEmail(email) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(email).toLowerCase());
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var n = bytes[i];
    if (n < 0) n += 256;
    hex += (n < 16 ? '0' : '') + n.toString(16);
  }
  return 'inq_e_' + hex.slice(0, 32);
}

function appendInquiry(record) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('No spreadsheet. Open the script from Extensions > Apps Script on the inquiries Sheet.');
  }
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  ensureHeader(sheet);
  sheet.appendRow([
    record.timestamp,
    sheetSafe(record.name),
    sheetSafe(record.email),
    sheetSafe(record.company),
    sheetSafe(record.role),
    sheetSafe(record.firmSize),
    sheetSafe(record.phone),
    sheetSafe(record.useCase),
    sheetSafe(record.timeline),
    sheetSafe(record.source),
    sheetSafe(record.sourceOther),
    sheetSafe(record.tier),
    sheetSafe(record.message),
    sheetSafe(record.pageUrl),
    sheetSafe(record.userAgent),
    'new'
  ]);
  return ss.getUrl();
}

function ensureHeader(sheet) {
  var first = sheet.getLastRow() === 0 ? '' : String(sheet.getRange(1, 1).getValue());
  if (first === HEADERS[0]) return;
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    return;
  }
  sheet.insertRowBefore(1);
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
}

function sendNotification(record, sheetError) {
  var subject = sheetError
    ? 'Hatch inquiry — sheet write failed — ' + record.company
    : 'Hatch inquiry — ' + record.company;
  MailApp.sendEmail({
    to: notifyAddress(),
    replyTo: record.email,
    subject: oneLine(subject).slice(0, 180),
    body: notificationBody(record, sheetError),
    name: 'Hatch'
  });
}

function notificationBody(record, sheetError) {
  var lines = [
    'New Hatch inquiry',
    '',
    'Timestamp: ' + record.timestamp,
    'Name: ' + record.name,
    'Email: ' + record.email,
    'Company: ' + record.company,
    'Role: ' + record.role,
    'Firm size: ' + record.firmSize,
    'Phone: ' + record.phone,
    'Timeline: ' + record.timeline,
    'Source: ' + record.source,
    'Source other: ' + record.sourceOther,
    'Tier: ' + record.tier,
    'Page URL: ' + record.pageUrl,
    'User agent: ' + record.userAgent,
    'Status: new',
    '',
    'Use case:',
    record.useCase,
    '',
    'Message:',
    record.message || ''
  ];
  if (sheetError) {
    lines.push('', 'Sheet write FAILED. The row was not saved.', sheetError);
  } else {
    lines.push('', 'Saved to the Inquiries sheet.');
  }
  if (record.sheetUrl) lines.push(record.sheetUrl);
  return lines.join('\n');
}

function sendConfirmation(record) {
  MailApp.sendEmail({
    to: record.email,
    replyTo: notifyAddress(),
    subject: 'We received your Hatch inquiry',
    body: confirmationBody(record),
    name: 'Hatch'
  });
}

function confirmationBody(record) {
  return [
    'Hi ' + firstName(record.name) + ',',
    '',
    'Thanks for reaching out about Hatch. This confirms we received your inquiry for ' + record.company + '.',
    '',
    'I read every inquiry myself and will reply to you at this address.',
    '',
    'If you want to add anything, just reply to this email.',
    '',
    'What you sent:',
    'Use case: ' + record.useCase,
    'Timeline: ' + record.timeline,
    'Firm size: ' + record.firmSize,
    '',
    'Daniel Keene',
    'Hatch · hatchsystems.ai'
  ].join('\n');
}

function notifyAddress() {
  try {
    var value = PropertiesService.getScriptProperties().getProperty('NOTIFY_TO');
    value = oneLine(value);
    if (value && isEmail(value)) return value;
  } catch (err) {
    // Fall through to the default.
  }
  return DEFAULT_NOTIFY;
}

function firstName(name) {
  var parts = String(name || '').trim().split(/\s+/);
  return parts[0] || 'there';
}

function isEmail(value) {
  if (!value || value.length > LIMITS.email) return false;
  return /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(value);
}

function oneLine(value) {
  return String(value == null ? '' : value).replace(/[\r\n\t]+/g, ' ').trim();
}

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\u0000/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function canonKey(value) {
  return String(value == null ? '' : value)
    .replace(/\u2013|\u2014/g, '-')
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function canonicalChoice(list, value) {
  var key = canonKey(value);
  if (!key) return '';
  for (var i = 0; i < list.length; i++) {
    if (canonKey(list[i]) === key) return list[i];
  }
  return '';
}

function sheetSafe(value) {
  var text = String(value == null ? '' : value);
  if (/^[=+\-@]/.test(text)) return "'" + text;
  return text;
}

function withLock(fn) {
  var lock = LockService.getScriptLock();
  var got = false;
  try {
    lock.waitLock(15000);
    got = true;
  } catch (err) {
    got = false;
  }
  try {
    return fn();
  } finally {
    if (got) lock.releaseLock();
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
