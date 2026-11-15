// ============================================================
//  JAYCO — Customer PO auto-filing: Gmail → Microsoft Teams (SharePoint)
//
//  Runs inside the office@jaycohousing.com Google account (Apps Script).
//  info@jaycohousing.com mail is delivered into the same mailbox
//  (label "09 Mailbox/Info"), so one script covers both addresses.
//
//  Every 10 minutes it:
//   1. Finds new mails to office@ / info@ with attachments.
//   2. Decides whether each mail is a customer Purchase Order
//      (subject / file name / Gmail "Purchase Order" label).
//   3. Works out the customer folder from the sender's domain.
//   4. Uploads the PO files to the JAYCO Family team's Files:
//        Family/PO From Customers/<Customer>/<FY>/<Customer> - DD.MM.YYYY - <file>
//      Unknown senders go to
//        Family/PO From Customers/_Auto Saved/<FY>/<Sender>/...
//   5. Labels the Gmail thread "PO Filed - SharePoint", writes a row in the
//      "JAYCO PO Upload Log" Google Sheet, and (optional) posts to a Teams channel.
//
//  Setup: see po-to-teams/README.md. Secrets live in Script Properties only,
//  never in this file (this repository is public).
// ============================================================

// ── Settings you may change ──────────────────────────────────
const CFG = {
  SP_HOSTNAME:   'jaycoeng.sharepoint.com',
  SP_SITE_PATH:  '/sites/JAYCOFamily',          // the "JAYCO Family" team site
  BASE_FOLDER:   'Family/PO From Customers',     // path inside the team's Documents library
  UNKNOWN_FOLDER:'_Auto Saved',                  // where POs from unmapped senders go
  MAILBOXES:     ['office@jaycohousing.com', 'info@jaycohousing.com'],
  OWN_DOMAINS:   ['jaycohousing.com', 'jaycoeng.onmicrosoft.com'],
  OWN_ADDRESSES: ['jaycohousings@gmail.com'],
  GMAIL_PO_LABEL:'Purchase Order',               // existing label, treated as a strong PO signal
  DONE_LABEL:    'PO Filed - SharePoint',
  REVIEW_LABEL:  'PO Filed - Check Customer',    // filed under _Auto Saved: someone should map the customer
  LOOKBACK:      'newer_than:3d',                // window for the 10-minute scan
  MAX_THREADS:   60,
  MAX_RUN_MS:    4.5 * 60 * 1000,                // Apps Script hard limit is 6 min
  TZ:            'Asia/Kolkata',
  MIN_IMAGE_BYTES: 40 * 1024                     // smaller images are usually logos/signatures
};

// A mail/file "looks like a PO" if it matches PO_RE and not SKIP_RE.
const PO_RE = /(purchase[\s_.-]*order|work[\s_.-]*order|service[\s_.-]*order|\bp\.?\s?o\.?\b|\d\s*po\s*\d|\bpo[\s#:._-]*(no|num|number)?[\s#:._-]*\d|\bw\.?o\.?[\s#:._-]*\d|\border\s*(copy|confirmation|no|number)\b|\bamend(ed|ment)?\s*po\b)/i;
const SKIP_RE = /(quotation|\bquote\b|\brfq\b|enquiry|inquiry|invoice|\btax\s*inv|proforma|\bpi\b|inspection|\bqap\b|debit\s*note|credit\s*note|ledger|statement|payment|remittance|\bgrn\b|e-?way\s*bill|lorry\s*receipt|\blr\b|dispatch\s*clearance|tds|gst\s*return|newsletter)/i;
const FILE_TYPES = /\.(pdf|xlsx?|xlsm|csv|docx?|jpe?g|png|tiff?|zip)$/i;
const FREE_MAIL = /^(gmail|yahoo|hotmail|outlook|live|rediffmail|rediff|icloud|ymail|aol|zoho|proton(mail)?)\./i;
const LOG_HEADERS = ['processedAt', 'messageId', 'receivedAt', 'mailbox', 'from', 'subject', 'customer',
                     'matchedBy', 'file', 'sharepointPath', 'sharepointUrl', 'status'];
const MAP_HEADERS = ['domain', 'customerFolder', 'notes'];

// ════════════════════════════════════════════════════════════
//  1. One-time setup — run from the editor after filling Script Properties
// ════════════════════════════════════════════════════════════
function setup() {
  const p = PropertiesService.getScriptProperties();
  ['TENANT_ID', 'CLIENT_ID', 'CLIENT_SECRET'].forEach(k => {
    if (!p.getProperty(k)) throw new Error('Script Property ' + k + ' is missing. See README step 3.');
  });
  // Log sheet
  if (!p.getProperty('LOG_SHEET_ID')) {
    const ss = SpreadsheetApp.create('JAYCO PO Upload Log');
    ss.getSheets()[0].setName('Log').appendRow(LOG_HEADERS);
    ss.insertSheet('Customers').appendRow(MAP_HEADERS);
    p.setProperty('LOG_SHEET_ID', ss.getId());
  }
  // Gmail labels
  [CFG.DONE_LABEL, CFG.REVIEW_LABEL].forEach(n => { if (!GmailApp.getUserLabelByName(n)) GmailApp.createLabel(n); });
  // SharePoint: resolve the library and prove we can write to it
  const driveId = resolveDriveId_(true);
  const folders = listCustomerFolders_(true);
  // Trigger
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'scanForPOs')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('scanForPOs').timeBased().everyMinutes(10).create();

  Logger.log('SharePoint library OK (drive ' + driveId + '), ' + folders.length + ' customer folders found.');
  Logger.log('Log sheet: ' + SpreadsheetApp.openById(p.getProperty('LOG_SHEET_ID')).getUrl());
  Logger.log('Trigger installed: scanForPOs every 10 minutes. Set DRY_RUN=false in Script Properties to go live.');
}

/** Writes every existing customer folder name into the Customers tab, to help you map domains. */
function exportCustomerFolders() {
  const names = listCustomerFolders_(true);
  const sh = sheet_('Customers');
  sh.getRange(1, 5).setValue('Existing SharePoint customer folders (copy into column B)');
  sh.getRange(2, 5, Math.max(names.length, 1), 1).setValues(names.length ? names.map(n => [n]) : [['(none)']]);
  Logger.log(names.length + ' folders written to Customers!E');
}

/** Files POs from the last 30 days that were missed (safe to run again: already-filed mails are skipped). */
function backfillLast30Days() { scan_('newer_than:30d', 300); }

/** Shows what would be filed, without uploading anything. */
function testDryRun() { scan_(CFG.LOOKBACK, CFG.MAX_THREADS, true); }

// ════════════════════════════════════════════════════════════
//  2. The scan (time trigger)
// ════════════════════════════════════════════════════════════
function scanForPOs() { scan_(CFG.LOOKBACK, CFG.MAX_THREADS); }

function scan_(window, maxThreads, forceDry) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;                  // previous run still busy
  const started = Date.now();
  const dry = forceDry || String(props_().getProperty('DRY_RUN') || 'true').toLowerCase() !== 'false';
  try {
    const to = CFG.MAILBOXES.map(m => 'to:' + m + ' OR cc:' + m + ' OR deliveredto:' + m).join(' OR ');
    const q = 'has:attachment ' + window + ' -in:sent -in:chats -in:spam -in:trash (' + to + ')';
    const done = {};                                 // "messageId|file name" already uploaded
    if (!dry) loggedUploads_().forEach(k => { done[k] = true; });
    const doneLabel = GmailApp.getUserLabelByName(CFG.DONE_LABEL) || GmailApp.createLabel(CFG.DONE_LABEL);
    const reviewLabel = GmailApp.getUserLabelByName(CFG.REVIEW_LABEL) || GmailApp.createLabel(CFG.REVIEW_LABEL);
    const mapping = domainMap_();
    let folders = null;                              // fetched lazily, only if a PO is found
    let filed = 0;

    const threads = GmailApp.search(q, 0, maxThreads);
    for (const thread of threads) {
      if (Date.now() - started > CFG.MAX_RUN_MS) { Logger.log('Time budget reached; rest next run.'); break; }
      const hasPoLabel = thread.getLabels().some(l => l.getName() === CFG.GMAIL_PO_LABEL);
      let threadFiled = false, threadNeedsReview = false;

      for (const msg of thread.getMessages()) {
        const id = msg.getId();
        const from = msg.getFrom();
        const fromEmail = emailOf_(from);
        if (isOwn_(fromEmail) && !/^\s*(fw|fwd)\s*:/i.test(msg.getSubject())) continue;  // our own replies
        const files = poAttachments_(msg, hasPoLabel).filter(a => !done[id + '|' + a.getName()]);
        if (!files.length) continue;

        if (!folders) folders = listCustomerFolders_(false);
        const sender = senderForCustomer_(msg, fromEmail);
        const cust = resolveCustomer_(sender, mapping, folders);
        const received = msg.getDate();
        const fy = financialYear_(received);
        const dateStr = Utilities.formatDate(received, CFG.TZ, 'dd.MM.yyyy');
        const folderPath = cust.known
          ? [CFG.BASE_FOLDER, cust.folder, fy].join('/')
          : [CFG.BASE_FOLDER, CFG.UNKNOWN_FOLDER, fy, cust.folder].join('/');
        const mailbox = mailboxOf_(msg);

        for (const att of files) {
          const name = safeName_(cust.folder + ' - ' + dateStr + ' - ' + att.getName());
          const path = folderPath + '/' + name;
          if (dry) {
            Logger.log('[DRY RUN] ' + msg.getSubject() + '  →  ' + path + '  (' + cust.matchedBy + ')');
            continue;
          }
          let url = '', status = 'uploaded';
          try { url = uploadToSharePoint_(path, att.copyBlob()); }
          catch (e) { status = 'ERROR: ' + e.message; }
          appendLog_([new Date(), id, received, mailbox, from, msg.getSubject(), cust.folder,
                      cust.matchedBy, att.getName(), path, url, status]);
          if (status === 'uploaded') {
            done[id + '|' + att.getName()] = true;
            filed++; threadFiled = true; if (!cust.known) threadNeedsReview = true;
            notifyTeams_(cust, msg, name, url);
          }
        }
        if (!cust.known && !dry) rememberUnknownDomain_(sender.domain, cust.folder, mapping);
      }
      if (threadFiled) thread.addLabel(doneLabel);
      if (threadNeedsReview) thread.addLabel(reviewLabel);
    }
    Logger.log((dry ? '[DRY RUN] ' : '') + 'Scan finished: ' + threads.length + ' threads checked, ' + filed + ' files filed.');
  } finally {
    lock.releaseLock();
  }
}

// ════════════════════════════════════════════════════════════
//  3. Deciding what is a PO
// ════════════════════════════════════════════════════════════
function poAttachments_(msg, hasPoLabel) {
  const subject = msg.getSubject() || '';
  const subjectIsPo = looksLikePo_(subject);
  const subjectIsOther = SKIP_RE.test(subject) && !/purchase[\s_.-]*order/i.test(subject);
  const body = subjectIsPo || hasPoLabel ? '' : (msg.getPlainBody() || '').slice(0, 1500);
  const bodyIsPo = /(purchase\s*order|p\.?o\.?\s*(copy|attached)|pfa\s*(the\s*)?p\.?o\b|work\s*order)/i.test(body);

  return msg.getAttachments({ includeInlineImages: false, includeAttachments: true }).filter(att => {
    const n = att.getName() || '';
    if (!FILE_TYPES.test(n)) return false;
    if (/\.(jpe?g|png)$/i.test(n) && att.getSize() < CFG.MIN_IMAGE_BYTES) return false;
    if (SKIP_RE.test(n) && !looksLikePo_(n)) return false;      // e.g. "Tax Invoice 123.pdf"
    if (looksLikePo_(n)) return true;                           // file name says PO
    if (subjectIsOther) return false;
    return subjectIsPo || bodyIsPo || hasPoLabel;
  });
}

function looksLikePo_(text) {
  const t = String(text || '');
  if (/purchase[\s_.-]*order|work[\s_.-]*order/i.test(t)) return true;
  return PO_RE.test(t) && !SKIP_RE.test(t);
}

// ════════════════════════════════════════════════════════════
//  4. Working out the customer
// ════════════════════════════════════════════════════════════
function senderForCustomer_(msg, fromEmail) {
  // Staff forwards ("Fwd: ...") — use the original sender written in the forwarded header.
  if (isOwn_(fromEmail)) {
    const m = (msg.getPlainBody() || '').match(/From:\s*([^\n<]*)<([^>\s]+@[^>\s]+)>/i);
    if (m) return { email: m[2].toLowerCase(), name: m[1].replace(/["']/g, '').trim(), domain: domainOf_(m[2]) };
  }
  const name = String(msg.getFrom()).replace(/<.*>/, '').replace(/["']/g, '').trim();
  return { email: fromEmail, name: name, domain: domainOf_(fromEmail) };
}

function resolveCustomer_(sender, mapping, folders) {
  const d = sender.domain;
  // a) your mapping sheet (exact domain, then parent domain: mail.abc.co.in → abc.co.in)
  const parts = d.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts.slice(i).join('.');
    if (mapping[key]) return { folder: mapping[key], known: true, matchedBy: 'mapping:' + key };
  }
  // b) existing SharePoint customer folder whose name matches the domain (gallantt.com → "Gallantt Ispat Ltd")
  if (!FREE_MAIL.test(d)) {
    const stem = domainStem_(d);
    if (stem.length >= 3) {
      const hit = folders.find(f => squash_(f).indexOf(stem) === 0) || folders.find(f => squash_(f).indexOf(stem) >= 0)
               || folders.find(f => initials_(f) === stem);
      if (hit) return { folder: hit, known: true, matchedBy: 'folder-name' };
    }
  }
  // c) unknown → _Auto Saved/<FY>/<Name>
  const guess = FREE_MAIL.test(d) ? (sender.name || sender.email) : titleCase_(domainStem_(d));
  return { folder: safeName_(guess || 'Unknown Sender'), known: false, matchedBy: 'unknown' };
}

function domainStem_(domain) {
  // abc.co.in → abc, mail.xyz-steel.com → xyzsteel
  const p = String(domain || '').toLowerCase().split('.');
  const sld = /^(co|com|net|org|gov|ac|edu|ind|nic|firm|gen)$/;
  let i = p.length - 2;
  if (i > 0 && sld.test(p[i])) i--;
  return (p[Math.max(i, 0)] || '').replace(/[^a-z0-9]/g, '');
}
function squash_(s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); }
function initials_(s) {
  return String(s).toLowerCase().replace(/\(.*?\)/g, ' ').split(/[^a-z0-9]+/)
    .filter(w => w && !/^(pvt|private|ltd|limited|llp|inc|the|and|of)$/.test(w)).map(w => w[0]).join('');
}
function titleCase_(s) { return String(s).replace(/\b\w/g, c => c.toUpperCase()); }

function domainMap_() {
  const out = {};
  const sh = sheet_('Customers');
  const rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues() : [];
  rows.forEach(r => {
    const dom = String(r[0] || '').trim().toLowerCase().replace(/^@/, '');
    const folder = String(r[1] || '').trim();
    if (dom && folder) out[dom] = folder;
  });
  return out;
}

function rememberUnknownDomain_(domain, guess, mapping) {
  if (!domain || FREE_MAIL.test(domain) || mapping[domain] !== undefined) return;
  const sh = sheet_('Customers');
  const existing = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0]).toLowerCase()) : [];
  if (existing.indexOf(domain) < 0) sh.appendRow([domain, '', 'NEW — filed under _Auto Saved/' + guess + '. Type the customer folder name in column B.']);
  mapping[domain] = '';
}

// ════════════════════════════════════════════════════════════
//  5. Microsoft Graph (app-only, Sites.Selected)
// ════════════════════════════════════════════════════════════
function graphToken_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('graph_token');
  if (hit) return hit;
  const p = props_();
  const res = UrlFetchApp.fetch('https://login.microsoftonline.com/' + p.getProperty('TENANT_ID') + '/oauth2/v2.0/token', {
    method: 'post',
    payload: {
      client_id: p.getProperty('CLIENT_ID'),
      client_secret: p.getProperty('CLIENT_SECRET'),
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials'
    },
    muteHttpExceptions: true
  });
  const j = JSON.parse(res.getContentText());
  if (!j.access_token) throw new Error('Microsoft sign-in failed: ' + (j.error_description || res.getContentText()).slice(0, 300));
  cache.put('graph_token', j.access_token, Math.min(3000, (j.expires_in || 3600) - 300));
  return j.access_token;
}

function graph_(method, url, body, contentType) {
  const opt = { method: method, headers: { Authorization: 'Bearer ' + graphToken_() }, muteHttpExceptions: true };
  if (body !== undefined) {
    opt.payload = (typeof body === 'string' || (body && body.getBytes)) ? body : JSON.stringify(body);
    opt.contentType = contentType || 'application/json';
  }
  const full = /^https:/.test(url) ? url : 'https://graph.microsoft.com/v1.0' + url;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = UrlFetchApp.fetch(full, opt);
    const code = res.getResponseCode();
    if (code === 429 || code >= 500) { Utilities.sleep(2000 * Math.pow(2, attempt)); continue; }
    const text = res.getContentText();
    if (code >= 400) throw new Error('Graph ' + code + ': ' + text.slice(0, 300));
    return text ? JSON.parse(text) : {};
  }
  throw new Error('Graph kept returning busy/errors for ' + url);
}

function resolveDriveId_(fresh) {
  const p = props_();
  if (!fresh && p.getProperty('SP_DRIVE_ID')) return p.getProperty('SP_DRIVE_ID');
  const site = graph_('get', '/sites/' + CFG.SP_HOSTNAME + ':' + CFG.SP_SITE_PATH + '?$select=id,webUrl');
  const drive = graph_('get', '/sites/' + site.id + '/drive?$select=id,webUrl');
  p.setProperty('SP_DRIVE_ID', drive.id);
  return drive.id;
}

function encPath_(path) { return path.split('/').map(encodeURIComponent).join('/'); }

function listCustomerFolders_(fresh) {
  const cache = CacheService.getScriptCache();
  if (!fresh) { const c = cache.get('cust_folders'); if (c) return JSON.parse(c); }
  const driveId = resolveDriveId_(false);
  let url = '/drives/' + driveId + '/root:/' + encPath_(CFG.BASE_FOLDER) + ':/children?$select=name,folder&$top=999';
  const names = [];
  while (url) {
    const page = graph_('get', url);
    (page.value || []).forEach(it => { if (it.folder && it.name.charAt(0) !== '_') names.push(it.name); });
    url = page['@odata.nextLink'] || '';
  }
  // longer names first so "Shyam SEL & Power Limited" wins over "Shyam"
  names.sort((a, b) => b.length - a.length);
  cache.put('cust_folders', JSON.stringify(names), 6 * 3600);
  return names;
}

/** Uploads a blob to <library>/<path>. Missing folders are created automatically. Returns the web URL. */
function uploadToSharePoint_(path, blob) {
  const driveId = resolveDriveId_(false);
  const bytes = blob.getBytes();
  const base = '/drives/' + driveId + '/root:/' + encPath_(path) + ':';
  if (bytes.length <= 4 * 1024 * 1024) {
    const item = graph_('put', base + '/content?@microsoft.graph.conflictBehavior=rename', bytes, blob.getContentType() || 'application/octet-stream');
    return item.webUrl || '';
  }
  // Large file: upload session in 320 KiB-aligned chunks
  const session = graph_('post', base + '/createUploadSession', { item: { '@microsoft.graph.conflictBehavior': 'rename' } });
  const CHUNK = 327680 * 10;
  let item = {};
  for (let start = 0; start < bytes.length; start += CHUNK) {
    const end = Math.min(start + CHUNK, bytes.length);
    const res = UrlFetchApp.fetch(session.uploadUrl, {
      method: 'put', payload: bytes.slice(start, end), contentType: 'application/octet-stream',
      headers: { 'Content-Range': 'bytes ' + start + '-' + (end - 1) + '/' + bytes.length }, muteHttpExceptions: true
    });
    if (res.getResponseCode() >= 400) throw new Error('Upload chunk failed ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
    if (res.getContentText()) item = JSON.parse(res.getContentText());
  }
  return item.webUrl || '';
}

// ════════════════════════════════════════════════════════════
//  6. Optional Teams channel notification (Teams "Workflows" webhook)
// ════════════════════════════════════════════════════════════
function notifyTeams_(cust, msg, fileName, url) {
  const hook = props_().getProperty('TEAMS_WEBHOOK_URL');
  if (!hook) return;
  const card = {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4',
        body: [
          { type: 'TextBlock', weight: 'Bolder', size: 'Medium', text: 'New PO filed: ' + cust.folder + (cust.known ? '' : ' (check customer)') },
          { type: 'FactSet', facts: [
            { title: 'From', value: msg.getFrom() },
            { title: 'Subject', value: msg.getSubject() },
            { title: 'File', value: fileName }
          ] }
        ],
        actions: url ? [{ type: 'Action.OpenUrl', title: 'Open in Teams Files', url: url }] : []
      }
    }]
  };
  try { UrlFetchApp.fetch(hook, { method: 'post', contentType: 'application/json', payload: JSON.stringify(card), muteHttpExceptions: true }); }
  catch (e) { Logger.log('Teams notify failed: ' + e.message); }
}

// ════════════════════════════════════════════════════════════
//  7. Helpers
// ════════════════════════════════════════════════════════════
function props_() { return PropertiesService.getScriptProperties(); }
function sheet_(name) {
  const ss = SpreadsheetApp.openById(props_().getProperty('LOG_SHEET_ID'));
  return ss.getSheetByName(name) || ss.insertSheet(name);
}
function appendLog_(row) { sheet_('Log').appendRow(row); }
function loggedUploads_() {
  const sh = sheet_('Log');
  if (sh.getLastRow() < 2) return [];
  const rows = sh.getRange(2, 2, sh.getLastRow() - 1, 11).getValues();   // messageId … status
  return rows.filter(r => String(r[10]) === 'uploaded').map(r => String(r[0]) + '|' + String(r[7]));
}
function emailOf_(from) { const m = String(from).match(/<([^>]+)>/); return (m ? m[1] : String(from)).trim().toLowerCase(); }
function domainOf_(email) { return String(email).split('@').pop().toLowerCase().trim(); }
function isOwn_(email) {
  return CFG.OWN_ADDRESSES.indexOf(email) >= 0 || CFG.OWN_DOMAINS.indexOf(domainOf_(email)) >= 0;
}
function mailboxOf_(msg) {
  const all = (msg.getTo() + ',' + msg.getCc()).toLowerCase();
  const hits = CFG.MAILBOXES.filter(m => all.indexOf(m) >= 0);
  return hits.length ? hits.join(', ') : CFG.MAILBOXES[0];
}
/** Indian financial year: April–March → "2026-2027". */
function financialYear_(date) {
  const y = Number(Utilities.formatDate(date, CFG.TZ, 'yyyy'));
  const m = Number(Utilities.formatDate(date, CFG.TZ, 'M'));
  return m >= 4 ? y + '-' + (y + 1) : (y - 1) + '-' + y;
}
/** SharePoint-safe file/folder name. */
function safeName_(s) {
  return String(s).replace(/[\\/:*?"<>|#%]/g, ' ').replace(/\s+/g, ' ').replace(/\s+\./g, '.').replace(/^[\s.]+|[\s.]+$/g, '').slice(0, 180) || 'file';
}
