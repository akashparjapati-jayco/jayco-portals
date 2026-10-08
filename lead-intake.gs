// ============================================================
//  JAYCO SALES — Lead Intake & Mail Backend (Google Apps Script)
//  Backend for sales-crm.html. Deploy as a Web App (see the
//  "Setup" tab inside the portal for the step-by-step guide).
//
//  What it does
//   1. Reads enquiry emails from Gmail (label JAYCO-Enquiry, plus
//      IndiaMART / TradeIndia notification mails) every 10 minutes
//      and stores them in a "Jayco Lead Inbox" Google Sheet.
//   2. Lets the portal pull new leads (action=pull) and confirm them (ack).
//   3. Accepts website-form enquiries (action=lead) with a separate token.
//   4. Sends quotations / order confirmations / follow-ups from your
//      Gmail, with the PDF attached (action=send).
//   5. Emails you a daily follow-up digest (action=followups + trigger).
//
//  Run setup() once from the editor, then Deploy > New deployment > Web app
//  (Execute as: Me, Who has access: Anyone). Paste the /exec URL and the
//  KEY printed in the log into the portal's Settings.
// ============================================================

const ENQUIRY_LABEL = 'JAYCO-Enquiry';
const DONE_LABEL    = 'JAYCO-Captured';
const OWN_DOMAIN    = 'jaycohousing.com';          // mails from this domain are treated as staff forwards
const MARKETPLACES  = ['indiamart.com', 'tradeindia.com', 'exportersindia.com'];
const HEADERS = ['id', 'receivedAt', 'source', 'name', 'company', 'email', 'phone', 'city',
                 'subject', 'product', 'qty', 'body', 'attachments', 'synced'];

// ── One-time setup ───────────────────────────────────────────
function setup() {
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('KEY'))        p.setProperty('KEY', Utilities.getUuid().replace(/-/g, ''));
  if (!p.getProperty('WEBFORM_KEY')) p.setProperty('WEBFORM_KEY', Utilities.getUuid().replace(/-/g, '').slice(0, 16));
  if (!p.getProperty('SHEET_ID')) {
    const ss = SpreadsheetApp.create('Jayco Lead Inbox');
    ss.getSheets()[0].setName('Inbox').appendRow(HEADERS);
    p.setProperty('SHEET_ID', ss.getId());
  }
  [ENQUIRY_LABEL, DONE_LABEL].forEach(n => { if (!GmailApp.getUserLabelByName(n)) GmailApp.createLabel(n); });
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('scanInbox').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('sendDigest').timeBased().atHour(8).everyDays(1).create();
  Logger.log('KEY (paste in portal Settings): ' + p.getProperty('KEY'));
  Logger.log('WEBSITE FORM KEY: ' + p.getProperty('WEBFORM_KEY'));
  Logger.log('Inbox sheet: ' + SpreadsheetApp.openById(p.getProperty('SHEET_ID')).getUrl());
}

function props_() { return PropertiesService.getScriptProperties(); }
function sheet_() { return SpreadsheetApp.openById(props_().getProperty('SHEET_ID')).getSheetByName('Inbox'); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// ── Gmail scan (time trigger) ────────────────────────────────
function scanInbox() {
  const done = GmailApp.getUserLabelByName(DONE_LABEL) || GmailApp.createLabel(DONE_LABEL);
  const queries = [
    'label:' + ENQUIRY_LABEL + ' -label:' + DONE_LABEL,
    '(from:indiamart.com OR from:tradeindia.com OR from:exportersindia.com) newer_than:7d -label:' + DONE_LABEL
  ];
  const seen = {};
  queries.forEach(q => {
    GmailApp.search(q, 0, 30).forEach(thread => {
      if (seen[thread.getId()]) return; seen[thread.getId()] = true;
      try { addThread_(thread); } catch (err) { Logger.log('Thread ' + thread.getId() + ': ' + err); }
      thread.addLabel(done);
    });
  });
}

function addThread_(thread) {
  const msgs = thread.getMessages();
  // first message that is not our own reply
  let m = msgs[0];
  for (let i = 0; i < msgs.length; i++) {
    if (!/jayco/i.test(msgs[i].getFrom()) || i === 0) { m = msgs[i]; break; }
  }
  const lead = parseMessage_(m);
  lead.id = thread.getId();
  appendRow_(lead);
}

function parseMessage_(m) {
  const from = m.getFrom();
  const body = m.getPlainBody() || '';
  let name = '', email = '';
  const mm = from.match(/^(.*?)\s*<([^>]+)>$/);
  if (mm) { name = mm[1].replace(/^"|"$/g, '').trim(); email = mm[2].trim(); } else { email = from.trim(); }
  const domain = (email.split('@')[1] || '').toLowerCase();
  let source = 'Email', info = {};

  if (MARKETPLACES.some(d => domain.endsWith(d))) {
    source = /tradeindia/.test(domain) ? 'TradeIndia' : 'IndiaMART';
    info = parseMarketplace_(body);
    if (info.email) email = info.email;
    if (info.name) name = info.name;
  } else if (domain === OWN_DOMAIN) {
    // a staff member forwarded a customer mail: take the original sender
    const fw = body.match(/From:\s*(.*?)\s*<([^>]+)>/i);
    if (fw) { name = fw[1].replace(/^"|"$/g, '').trim(); email = fw[2].trim(); }
  }
  info.phone = info.phone || (body.match(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/) || [''])[0];
  const atts = m.getAttachments().map(a => a.getName());
  return {
    receivedAt: Utilities.formatDate(m.getDate(), 'Asia/Kolkata', "yyyy-MM-dd'T'HH:mm:ss"),
    source: source, name: name, company: info.company || '', email: email, phone: info.phone || '',
    city: info.city || '', subject: m.getSubject(), product: info.product || '', qty: info.qty || '',
    body: body.replace(/\r/g, '').trim().slice(0, 4000), attachments: atts.join(', ')
  };
}

// IndiaMART / TradeIndia notification mails: "Label : value" lines
function parseMarketplace_(text) {
  const grab = names => {
    const re = new RegExp('(?:' + names + ')\\s*[:\\-]\\s*(.+)', 'i');
    const m = text.match(re); return m ? m[1].trim().split(/\s{2,}|\n/)[0] : '';
  };
  return {
    name:    grab('Buyer Name|Contact Person|Name'),
    company: grab('Company(?: Name)?|Organi[sz]ation|Firm'),
    email:   (text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [''])[0],
    phone:   grab('Mobile(?: No\\.?)?|Phone(?: No\\.?)?|Contact No\\.?'),
    city:    grab('City|Location|Address'),
    product: grab('Product(?: Name)?|Requirement|Looking for|Enquiry for|Subject'),
    qty:     grab('Quantity|Qty|Required Quantity')
  };
}

function appendRow_(lead) {
  const sh = sheet_();
  const ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0])) : [];
  if (ids.indexOf(String(lead.id)) >= 0) return;
  sh.appendRow(HEADERS.map(h => h === 'synced' ? false : (lead[h] === undefined ? '' : lead[h])));
}

// ── Web app ──────────────────────────────────────────────────
function doGet(e) {
  const q = (e && e.parameter) || {};
  if (q.action === 'ping') return json_({ ok: true, message: 'Jayco lead backend is live' });
  if (q.key !== props_().getProperty('KEY')) return json_({ ok: false, error: 'Unauthorized' });
  if (q.action === 'pull') return json_({ ok: true, leads: pull_() });
  return json_({ ok: false, error: 'Unknown action' });
}

function doPost(e) {
  try {
    let p = {};
    try { p = JSON.parse(e.postData.contents); } catch (x) { p = e.parameter || {}; p.data = p; }
    const action = p.action || (e.parameter && e.parameter.action) || 'lead';
    const d = p.data || {};
    const props = props_();

    if (action === 'lead') {            // website enquiry form — separate public token
      if ((p.key || d.key) !== props.getProperty('WEBFORM_KEY')) return json_({ ok: false, error: 'Unauthorized' });
      appendRow_({
        id: 'web-' + new Date().getTime(), receivedAt: Utilities.formatDate(new Date(), 'Asia/Kolkata', "yyyy-MM-dd'T'HH:mm:ss"),
        source: 'Website', name: d.name || '', company: d.company || '', email: d.email || '', phone: d.phone || '',
        city: d.city || '', subject: d.subject || 'Website enquiry', product: d.product || '', qty: d.qty || '',
        body: String(d.message || d.body || '').slice(0, 4000), attachments: ''
      });
      return json_({ ok: true });
    }
    if (p.key !== props.getProperty('KEY')) return json_({ ok: false, error: 'Unauthorized' });

    if (action === 'ack')       { ack_(d.ids || []); return json_({ ok: true }); }
    if (action === 'send')      { return json_({ ok: true, data: send_(d) }); }
    if (action === 'followups') { props.setProperty('FOLLOWUPS', JSON.stringify(d)); return json_({ ok: true }); }
    return json_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function pull_() {
  const sh = sheet_(), last = sh.getLastRow();
  if (last < 2) return [];
  const rows = sh.getRange(2, 1, last - 1, HEADERS.length).getValues(), out = [];
  rows.forEach(r => {
    const o = {}; HEADERS.forEach((h, i) => o[h] = r[i]);
    if (o.synced !== true && String(o.synced).toLowerCase() !== 'true') { o.id = String(o.id); delete o.synced; out.push(o); }
  });
  return out.slice(0, 100);
}

function ack_(ids) {
  const sh = sheet_(), last = sh.getLastRow();
  if (last < 2) return;
  const col = HEADERS.indexOf('synced') + 1;
  const vals = sh.getRange(2, 1, last - 1, 1).getValues();
  vals.forEach((r, i) => { if (ids.indexOf(String(r[0])) >= 0) sh.getRange(i + 2, col).setValue(true); });
}

// ── Mail ─────────────────────────────────────────────────────
function send_(d) {
  if (!d.to) throw new Error('No recipient');
  const attachments = (d.attachments || []).map(a =>
    Utilities.newBlob(Utilities.base64Decode(a.base64), a.mime || 'application/pdf', a.name));
  GmailApp.sendEmail(d.to, d.subject || 'Jayco Engineering India', d.text || '', {
    htmlBody: d.html || undefined, cc: d.cc || '', bcc: d.bcc || '', attachments: attachments,
    name: 'JAYCO Engineering India', replyTo: d.replyTo || ''
  });
  return { sentTo: d.to };
}

// Daily 8 AM digest of today's / overdue follow-ups (data pushed by the portal)
function sendDigest() {
  const p = props_();
  const raw = p.getProperty('FOLLOWUPS'); if (!raw) return;
  const d = JSON.parse(raw), to = d.digestTo || Session.getActiveUser().getEmail();
  const due = d.due || [], quotes = d.quotes || [];
  if (!due.length && !quotes.length) return;
  const row = (a, b, c) => '<tr><td style="padding:4px 10px;border-bottom:1px solid #eee">' + a +
    '</td><td style="padding:4px 10px;border-bottom:1px solid #eee">' + b + '</td><td style="padding:4px 10px;border-bottom:1px solid #eee">' + c + '</td></tr>';
  let html = '<div style="font-family:Arial,sans-serif;font-size:13px"><h3 style="margin:0 0 8px">Jayco — follow-ups for today</h3>';
  if (due.length) html += '<b>Leads to call (' + due.length + ')</b><table style="border-collapse:collapse">' +
    due.map(x => row(x.leadNo + ' · ' + x.company, x.stage + ' · ' + (x.owner || ''), x.nextFollowUp + (x.overdue ? ' <b style="color:#c00">overdue</b>' : ''))).join('') + '</table><br>';
  if (quotes.length) html += '<b>Quotations awaiting reply (' + quotes.length + ')</b><table style="border-collapse:collapse">' +
    quotes.map(x => row(x.quoteNo + ' · ' + x.customer, x.total, x.days + ' days since sent')).join('') + '</table>';
  html += '</div>';
  GmailApp.sendEmail(to, 'Jayco follow-ups — ' + due.length + ' lead(s), ' + quotes.length + ' quote(s)', 'Open the Jayco Sales portal to see follow-ups.', { htmlBody: html, name: 'Jayco Sales Portal' });
}
