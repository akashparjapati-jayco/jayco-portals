// ============================================================
//  RECEIVABLES MANAGEMENT SYSTEM — Google Apps Script Backend
//  Pradip B Gandhi & Co LLP  |  v3 — Due Date & Cashflow
//  Backend for customer-portal.html — deploy as an Apps Script
//  Web App (see the "First-Time Setup" screen inside the portal).
// ============================================================

const SHEET_ID   = '1T_qeGE7iw2sb7lxjPyTNwZlDwEloXeSVGvX2Cg_hGGY';
const AUTH_TOKEN = 'A@2026';
const DEFAULT_DUE_DAYS = 45;  // fallback when no due date / credit days specified

const SHEETS = {
  CUSTOMERS  : 'Customers',
  BILLS      : 'Bills',
  PAYMENTS   : 'Payments',
  ALLOCATIONS: 'Allocations',
};

// ── Entry Point ──────────────────────────────────────────────
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    if (payload.token !== AUTH_TOKEN) return resp({ ok: false, error: 'Unauthorized' });
    const { action, data } = payload;
    let result;
    switch (action) {
      case 'getCustomers'   : result = getCustomers(); break;
      case 'saveCustomer'   : result = saveCustomer(data); break;
      case 'deleteCustomer' : result = deleteCustomer(data); break;
      case 'getBills'       : result = getBills(data); break;
      case 'saveBill'       : result = saveBill(data); break;
      case 'deleteBill'     : result = deleteBill(data); break;
      case 'getPayments'    : result = getPayments(data); break;
      case 'savePayment'    : result = savePayment(data); break;
      case 'deletePayment'  : result = deletePayment(data); break;
      case 'getAllocations'  : result = getAllocations(data); break;
      case 'getOutstanding' : result = getOutstanding(); break;
      case 'getCashflowForecast': result = getCashflowForecast(); break;
      case 'getStatement'   : result = getStatement(data); break;
      case 'getDashboard'   : result = getDashboard(); break;
      case 'importBills'    : result = importBills(data); break;
      case 'importPayments' : result = importPayments(data); break;
      case 'reAllocateAll'  : result = reAllocateAll(data); break;
      case 'debugSheetData' : result = debugSheetData(); break;
      default: result = { error: 'Unknown action' };
    }
    return resp({ ok: true, data: result });
  } catch (err) {
    return resp({ ok: false, error: err.message });
  }
}

function doGet(e) { return resp({ ok: true, message: 'CMS API v2 is live' }); }
function resp(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ── Sheet Helpers ─────────────────────────────────────────────
function getSheet(name) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}
// Canonical header map — converts any variant the user may have typed in the sheet
// to the field name our code expects. Case-insensitive, spaces/underscores ignored.
const HEADER_MAP = {
  'billid'        : 'billId',
  'custid'        : 'custId',
  'customerid'    : 'custId',
  'billno'        : 'billNo',
  'billnumber'    : 'billNo',
  'invoiceno'     : 'billNo',
  'billdate'      : 'billDate',
  'invoicedate'   : 'billDate',
  'duedate'       : 'dueDate',
  'dueon'         : 'dueDate',
  'totalamount'   : 'totalAmount',
  'invoiceamount' : 'totalAmount',
  'invoicevalue'  : 'totalAmount',
  'billamount'    : 'totalAmount',
  'total'         : 'totalAmount',
  // NOTE: 'amount' is intentionally NOT mapped to totalAmount
  // Payments sheet uses 'amount' as-is; Bills sheet uses 'totalAmount'
  'gstamount'     : 'gstAmount',
  'narration'     : 'narration',
  'description'   : 'narration',
  'remarks'       : 'narration',
  'status'        : 'status',
  'holdstatus'    : 'holdStatus',
  'expectedpaymentdate': 'expectedPaymentDate',
  'createdat'     : 'createdAt',
  'attachments'   : 'attachments',
  'payid'         : 'payId',
  'paydate'       : 'payDate',
  'paymentdate'   : 'payDate',
  'date'          : 'payDate',   // fallback for payment sheets
  'mode'          : 'mode',
  'paymentmode'   : 'mode',
  'refno'         : 'refNo',
  'referenceno'   : 'refNo',
  'utr'           : 'refNo',
  'allocid'       : 'allocId',
  'allocamount'   : 'allocAmount',
  'name'          : 'name',
  'customername'  : 'name',
  'gstin'         : 'gstin',
  'phone'         : 'phone',
  'email'         : 'email',
  'address'       : 'address',
  'creditdays'    : 'creditDays',
  'creditlimit'   : 'creditLimit',
  'active'        : 'active',
};

function _canonicalHeader(h) {
  // Strip spaces, underscores, slashes; lowercase
  const key = String(h).toLowerCase().replace(/[\s_\/\-]/g, '');
  return HEADER_MAP[key] || h;  // fall back to original if not in map
}

function sheetToObjects(sh) {
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  // Normalise headers
  const headers = data[0].map(_canonicalHeader);
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      const v = row[i];
      // Convert Google Sheets Date objects to YYYY-MM-DD strings
      if (v instanceof Date && !isNaN(v)) {
        const y = v.getFullYear(), m = String(v.getMonth()+1).padStart(2,'0'), d = String(v.getDate()).padStart(2,'0');
        obj[h] = `${y}-${m}-${d}`;
      } else {
        obj[h] = v;
      }
    });
    return obj;
  });
}
function genId(prefix) {
  return prefix + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
}

// Default due date = billDate + DEFAULT_DUE_DAYS (45). User can always override per-bill.
function _calcDueDate(billDate) {
  if (!billDate) return '';
  const d = new Date(billDate);
  if (isNaN(d)) return '';
  d.setDate(d.getDate() + DEFAULT_DUE_DAYS);
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}

// ── SETUP (run once) ──────────────────────────────────────────
function setupSheets() {
  const configs = [
    { name: SHEETS.CUSTOMERS,    headers: ['custId','name','gstin','phone','email','address','creditDays','creditLimit','active','createdAt'] },
    { name: SHEETS.BILLS,        headers: ['billId','custId','billNo','billDate','dueDate','totalAmount','narration','status','holdStatus','expectedPaymentDate','createdAt','attachments'] },
    { name: SHEETS.PAYMENTS,     headers: ['payId','custId','payDate','amount','mode','refNo','narration','createdAt'] },
    { name: SHEETS.ALLOCATIONS,  headers: ['allocId','payId','billId','custId','allocAmount','createdAt'] },
  ];
  const ss = SpreadsheetApp.openById(SHEET_ID);
  configs.forEach(cfg => {
    let sh = ss.getSheetByName(cfg.name);
    if (!sh) {
      sh = ss.insertSheet(cfg.name);
      sh.appendRow(cfg.headers);
      sh.getRange(1, 1, 1, cfg.headers.length).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
  });
  return 'Setup complete';
}

// ══════════════════════════════════════════════════════════════
//  CUSTOMERS
// ══════════════════════════════════════════════════════════════
function getCustomers() { return sheetToObjects(getSheet(SHEETS.CUSTOMERS)); }

function saveCustomer(d) {
  const sh = getSheet(SHEETS.CUSTOMERS);
  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  const idx = headers.indexOf('custId');
  if (d.custId) {
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][idx]) === String(d.custId)) {
        headers.forEach((h, c) => { if (d[h] !== undefined) sh.getRange(i+1, c+1).setValue(d[h]); });
        return { custId: d.custId };
      }
    }
    // Same class of bug as saveBill: fail loudly instead of silently
    // falling through to create a duplicate customer.
    throw new Error('Customer not found (custId ' + d.custId + ') — nothing was saved.');
  }
  const custId = genId('CUST');
  sh.appendRow([custId, d.name, d.gstin||'', d.phone||'', d.email||'', d.address||'',
                d.creditDays||0, d.creditLimit||0, true, new Date().toISOString()]);
  return { custId };
}

function deleteCustomer(d) {
  const sh = getSheet(SHEETS.CUSTOMERS);
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === d.custId) { sh.deleteRow(i+1); return { deleted: true }; }
  }
  return { deleted: false };
}

// ══════════════════════════════════════════════════════════════
//  BILLS
// ══════════════════════════════════════════════════════════════
function getBills(d) {
  const bills = sheetToObjects(getSheet(SHEETS.BILLS));
  if (d && d.custId) return bills.filter(b => b.custId === d.custId);
  return bills;
}

function saveBill(d) {
  const sh = getSheet(SHEETS.BILLS);
  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  const idx = headers.indexOf('billId');

  // Compute due date: explicit dueDate wins; else billDate + DEFAULT_DUE_DAYS
  const dueDate = d.dueDate || _calcDueDate(d.billDate);

  if (d.billId) {
    // UPDATE existing bill — re-run FIFO for this customer after update
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][idx]) === String(d.billId)) {
        const payload = { ...d, dueDate };
        headers.forEach((h, c) => { if (payload[h] !== undefined) sh.getRange(i+1, c+1).setValue(payload[h]); });
        _fullReAllocate(d.custId);
        return { billId: d.billId };
      }
    }
    // billId was supplied but no row matched it — fail loudly instead of
    // silently falling through to INSERT below, which used to create a
    // duplicate bill with the update's data while leaving the real bill
    // untouched (e.g. an attachment added here would vanish on reload,
    // since it was written to a phantom row instead of the real one).
    throw new Error('Bill not found (billId ' + d.billId + ') — nothing was saved. The bill may have been deleted, or its row edited directly in the sheet.');
  }

  // INSERT new bill
  const billId = genId('BILL');
  sh.appendRow([billId, d.custId, d.billNo, d.billDate, dueDate,
                d.totalAmount||0, d.narration||'', 'open',
                d.holdStatus || '', d.expectedPaymentDate || '',
                new Date().toISOString(), d.attachments || '[]']);

  // KEY FIX: After adding a new bill, re-run full FIFO for this customer
  // so any existing unallocated (advance) payments get applied to this new bill
  _fullReAllocate(d.custId);

  return { billId };
}

function deleteBill(d) {
  // Find customer before deleting
  const bills = sheetToObjects(getSheet(SHEETS.BILLS));
  const bill  = bills.find(b => b.billId === d.billId);
  const custId = bill ? bill.custId : null;

  // Remove allocations for this bill
  const ash = getSheet(SHEETS.ALLOCATIONS);
  const arows = ash.getDataRange().getValues();
  for (let i = arows.length - 1; i >= 1; i--) {
    if (arows[i][2] === d.billId) ash.deleteRow(i+1);
  }
  const sh = getSheet(SHEETS.BILLS);
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === d.billId) { sh.deleteRow(i+1); break; }
  }
  // Re-run full FIFO for customer so remaining payments re-allocate correctly
  if (custId) _fullReAllocate(custId);
  return { deleted: true };
}

// ══════════════════════════════════════════════════════════════
//  PAYMENTS + FIFO ALLOCATION
// ══════════════════════════════════════════════════════════════
function savePayment(d) {
  const sh = getSheet(SHEETS.PAYMENTS);
  const payId = genId('PAY');
  sh.appendRow([payId, d.custId, d.payDate, d.amount, d.mode||'', d.refNo||'', d.narration||'', new Date().toISOString()]);
  // Run full re-allocation so this new payment is ordered correctly with others
  _fullReAllocate(d.custId);
  return { payId };
}

function deletePayment(d) {
  // Find customer first
  const pays = sheetToObjects(getSheet(SHEETS.PAYMENTS));
  const pay  = pays.find(p => p.payId === d.payId);
  const custId = pay ? pay.custId : null;

  // Delete the payment row
  const sh = getSheet(SHEETS.PAYMENTS);
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === d.payId) { sh.deleteRow(i+1); break; }
  }
  // Re-run full FIFO for customer
  if (custId) _fullReAllocate(custId);
  return { deleted: true };
}

// ══════════════════════════════════════════════════════════════
//  CORE FIFO ENGINE
//  _fullReAllocate  — single customer, used on save/delete
//  reAllocateAll    — ALL customers in one fast batch pass
//
//  PERFORMANCE: reAllocateAll reads each sheet ONCE, computes
//  everything in memory, clears Allocations sheet once, writes
//  all rows in a single setValues() call. No row-by-row loops.
// ══════════════════════════════════════════════════════════════

function toDateStr(v) {
  if (!v) return '';
  if (v instanceof Date) {
    return v.getFullYear() + '-' + String(v.getMonth()+1).padStart(2,'0') + '-' + String(v.getDate()).padStart(2,'0');
  }
  return String(v).slice(0, 10);
}

// ── Fast batch FIFO for ALL customers ────────────────────────
// Called from the UI "Re-Allocate All" button.
// Reads every sheet once, does all computation in memory,
// then writes Allocations and Bill statuses in two batch calls.
function reAllocateAll(d) {
  const now     = new Date().toISOString();
  const bsh     = getSheet(SHEETS.BILLS);
  const ash     = getSheet(SHEETS.ALLOCATIONS);
  const psh     = getSheet(SHEETS.PAYMENTS);

  // ── 1. Read all data once ──
  const allBills    = sheetToObjects(bsh);
  const allPayments = sheetToObjects(psh);
  const allocHeaders = ['allocId','payId','billId','custId','allocAmount','createdAt'];

  // ── 2. Group bills and payments by custId ──
  const billsByCust = {}, paysByCust = {};
  allBills.forEach(b => {
    const cid = String(b.custId);
    if (!billsByCust[cid]) billsByCust[cid] = [];
    billsByCust[cid].push(b);
  });
  allPayments.forEach(p => {
    const cid = String(p.custId);
    if (!paysByCust[cid]) paysByCust[cid] = [];
    paysByCust[cid].push(p);
  });

  // ── 3. Compute all allocations in memory ──
  const allAllocRows = [];  // will become the new Allocations sheet body
  const billStatusMap = {}; // billId → new status string

  const custIds = [...new Set([...Object.keys(billsByCust), ...Object.keys(paysByCust)])];
  custIds.forEach(custId => {
    const bills    = (billsByCust[custId] || []).sort((a,b) => toDateStr(a.billDate).localeCompare(toDateStr(b.billDate)));
    const payments = (paysByCust[custId]  || []).sort((a,b) => toDateStr(a.payDate).localeCompare(toDateStr(b.payDate)));

    // Track remaining balance per bill
    const balances = {};
    bills.forEach(b => balances[String(b.billId)] = parseFloat(b.totalAmount || 0));

    // FIFO: for each payment, apply to oldest bills first (no date restriction —
    // opening balances and advance payments should allocate against any open bill)
    payments.forEach(pay => {
      let remaining = parseFloat(pay.amount || 0);
      for (const bill of bills) {
        if (remaining <= 0.005) break;
        const bid = String(bill.billId);
        const bal = balances[bid];
        if (bal <= 0.005) continue;
        const apply = Math.min(remaining, bal);
        balances[bid] -= apply;
        remaining     -= apply;
        allAllocRows.push([
          'ALLOC-' + String(Math.random()).slice(2,10),
          String(pay.payId), bid, custId, apply, now
        ]);
      }
    });

    // Compute status for each bill
    bills.forEach(b => {
      const bid   = String(b.billId);
      const total = parseFloat(b.totalAmount || 0);
      const bal   = balances[bid];
      billStatusMap[bid] = bal <= 0.005 ? 'closed' : bal < total - 0.005 ? 'partial' : 'open';
    });
  });

  // ── 4. Rewrite Allocations sheet in one batch ──
  const lastAllocRow = ash.getLastRow();
  if (lastAllocRow > 1) ash.deleteRows(2, lastAllocRow - 1);
  if (allAllocRows.length > 0) {
    ash.getRange(2, 1, allAllocRows.length, allocHeaders.length).setValues(allAllocRows);
  }

  // ── 5. Update bill statuses in one batch ──
  const bData    = bsh.getDataRange().getValues();
  const bHeaders = bData[0].map(_canonicalHeader);
  const statusCol = bHeaders.indexOf('status');
  const billIdCol = bHeaders.indexOf('billId');
  if (statusCol >= 0 && billIdCol >= 0) {
    var statusUpdates = [];
    for (let i = 1; i < bData.length; i++) {
      const bid = String(bData[i][billIdCol]);
      if (billStatusMap[bid]) statusUpdates.push({ row: i+1, status: billStatusMap[bid] });
    }
    statusUpdates.forEach(u => bsh.getRange(u.row, statusCol+1).setValue(u.status));
  }

  return {
    done: custIds.length,
    allocations: allAllocRows.length,
    billCustSample: Object.keys(billsByCust).slice(0,5),
    payCustSample:  Object.keys(paysByCust).slice(0,5),
    totalBills: allBills.length,
    totalPays: allPayments.length
  };
}

// ── Debug: see what custIds exist in Bills vs Payments ───────
function debugSheetData() {
  const bills = sheetToObjects(getSheet(SHEETS.BILLS));
  const pays  = sheetToObjects(getSheet(SHEETS.PAYMENTS));
  const billCustIds = [...new Set(bills.map(b=>String(b.custId)))];
  const payCustIds  = [...new Set(pays.map(p=>String(p.custId)))];
  const common = billCustIds.filter(id => payCustIds.includes(id));
  const b0 = bills[0]||{}, p0 = pays[0]||{};
  return {
    billCount: bills.length, payCount: pays.length,
    billCustIds: billCustIds.slice(0,15),
    payCustIds:  payCustIds.slice(0,15),
    commonCustIds: common,
    firstBill:    JSON.stringify({billId:b0.billId, custId:b0.custId, type:typeof b0.custId}),
    firstPayment: JSON.stringify({payId:p0.payId,   custId:p0.custId, type:typeof p0.custId}),
  };
}

// ── Single-customer FIFO (used on individual save/delete) ────
// Still efficient for one customer — reads sheets once,
// replaces only that customer's allocation rows in one batch.
function _fullReAllocate(custId) {
  const now  = new Date().toISOString();
  const bsh  = getSheet(SHEETS.BILLS);
  const ash  = getSheet(SHEETS.ALLOCATIONS);
  const cid  = String(custId);

  const bills    = sheetToObjects(bsh).filter(b => String(b.custId) === cid)
                     .sort((a,b) => toDateStr(a.billDate).localeCompare(toDateStr(b.billDate)));
  const payments = sheetToObjects(getSheet(SHEETS.PAYMENTS)).filter(p => String(p.custId) === cid)
                     .sort((a,b) => toDateStr(a.payDate).localeCompare(toDateStr(b.payDate)));

  // Remove existing allocations for this customer in one pass (reverse to preserve indices)
  const aData = ash.getDataRange().getValues();
  const custColIdx = aData[0].map(_canonicalHeader).indexOf('custId');
  const rowsToDelete = [];
  for (let i = 1; i < aData.length; i++) {
    if (String(aData[i][custColIdx]) === cid) rowsToDelete.push(i + 1);
  }
  for (let i = rowsToDelete.length - 1; i >= 0; i--) ash.deleteRow(rowsToDelete[i]);

  // Compute new allocations
  const balances = {};
  bills.forEach(b => balances[String(b.billId)] = parseFloat(b.totalAmount || 0));

  // FIFO: allocate each payment against oldest open bills
  const newRows = [];
  payments.forEach(pay => {
    let remaining = parseFloat(pay.amount || 0);
    for (const bill of bills) {
      if (remaining <= 0.005) break;
      const bid = String(bill.billId);
      const bal = balances[bid];
      if (bal <= 0.005) continue;
      const apply = Math.min(remaining, bal);
      balances[bid] -= apply;
      remaining     -= apply;
      newRows.push(['ALLOC-' + String(Math.random()).slice(2,10), String(pay.payId), bid, cid, apply, now]);
    }
  });

  if (newRows.length > 0) {
    ash.getRange(ash.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
  }

  // Update bill statuses
  const bData    = bsh.getDataRange().getValues();
  const bHeaders = bData[0].map(_canonicalHeader);
  const statusCol = bHeaders.indexOf('status');
  const billIdCol = bHeaders.indexOf('billId');
  for (let i = 1; i < bData.length; i++) {
    const bid = String(bData[i][billIdCol]);
    if (!balances.hasOwnProperty(bid)) continue;
    const total  = parseFloat(bData[i][bHeaders.indexOf('totalAmount')] || 0);
    const bal    = balances[bid];
    const status = bal <= 0.005 ? 'closed' : bal < total - 0.005 ? 'partial' : 'open';
    bsh.getRange(i + 1, statusCol + 1).setValue(status);
  }
}

function getPayments(d) {
  const pays = sheetToObjects(getSheet(SHEETS.PAYMENTS));
  if (d && d.custId) return pays.filter(p => p.custId === d.custId);
  return pays;
}

function getAllocations(d) {
  const allocs = sheetToObjects(getSheet(SHEETS.ALLOCATIONS));
  if (d && d.payId)  return allocs.filter(a => a.payId  === d.payId);
  if (d && d.billId) return allocs.filter(a => a.billId === d.billId);
  if (d && d.custId) return allocs.filter(a => a.custId === d.custId);
  return allocs;
}

// ══════════════════════════════════════════════════════════════
//  REPORTS
//  KEY FIX: Outstanding = Bills total − Payments total (net)
//  Advance credit (unallocated payment) reduces outstanding.
//  Aging is computed from DUE DATE (not bill date) — bills not yet
//  due fall into "upcoming" rather than an aging bucket.
// ══════════════════════════════════════════════════════════════

// Helper: compute net outstanding per customer from raw data
// Returns { custId → { netOutstanding, advance, billsTotal, paymentsTotal, openBills[] } }
// KEY FIX: Google Sheets returns Date objects via JSON serialization.
// We always normalise to midnight LOCAL time before comparing to avoid
// timezone-offset errors that make a bill appear "not yet due" when it is.
function _normDate(v) {
  if (!v) return null;
  let d;
  if (v instanceof Date) {
    d = new Date(v.getFullYear(), v.getMonth(), v.getDate());
  } else {
    const s = String(v).slice(0, 10); // "YYYY-MM-DD"
    const parts = s.split('-');
    if (parts.length === 3) d = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
    else d = new Date(v);
  }
  if (isNaN(d)) return null;
  d.setHours(0,0,0,0);
  return d;
}

function _computeNetPosition(custBills, custPays, allocs) {
  const today = new Date();
  today.setHours(0,0,0,0);

  // Allocated per bill
  const allocMap = {};
  allocs.forEach(a => { allocMap[a.billId] = (allocMap[a.billId]||0) + parseFloat(a.allocAmount||0); });

  // Total payments per customer
  const payTotalMap = {};
  custPays.forEach(p => { payTotalMap[p.custId] = (payTotalMap[p.custId]||0) + parseFloat(p.amount||0); });

  // Total allocated per customer
  const allocTotalMap = {};
  allocs.forEach(a => { allocTotalMap[a.custId] = (allocTotalMap[a.custId]||0) + parseFloat(a.allocAmount||0); });

  const result = {};
  custBills.forEach(b => {
    const cId    = b.custId;
    const total  = parseFloat(b.totalAmount||0);
    const paid   = allocMap[b.billId] || 0;
    const bal    = total - paid;
    const due    = _normDate(b.dueDate);
    const daysPastDue = due ? Math.floor((today - due) / 86400000) : 0;  // negative = not yet due
    if (!result[cId]) result[cId] = { billsTotal:0, openBillsTotal:0, openBills:[], upcoming:0, b0:0, b31:0, b61:0, b90:0 };
    result[cId].billsTotal += total;
    if (b.status !== 'closed' && bal > 0.005) {
      result[cId].openBillsTotal += bal;
      result[cId].openBills.push({ ...b, balance: bal, daysPastDue });
      if (daysPastDue < 0)        result[cId].upcoming += bal;   // not yet due
      else if (daysPastDue<=30)   result[cId].b0  += bal;        // 0-30 overdue
      else if (daysPastDue<=60)   result[cId].b31 += bal;        // 31-60 overdue
      else if (daysPastDue<=90)   result[cId].b61 += bal;        // 61-90 overdue
      else                        result[cId].b90 += bal;        // 90+ overdue
    }
  });

  // Compute advance credit = payments received − total allocated to bills
  // This is the unallocated excess sitting as advance
  Object.keys(result).forEach(cId => {
    const totalPaid   = payTotalMap[cId] || 0;
    const totalAlloc  = allocTotalMap[cId] || 0;
    const advance     = Math.max(0, totalPaid - totalAlloc);  // unallocated credit
    result[cId].advance      = advance;
    result[cId].paymentsTotal= totalPaid;
    // Net outstanding = what bills say is open MINUS any advance credit sitting with customer
    result[cId].netOutstanding = Math.max(0, result[cId].openBillsTotal - advance);
  });

  return result;
}

function getOutstanding() {
  const customers = sheetToObjects(getSheet(SHEETS.CUSTOMERS));
  const bills     = sheetToObjects(getSheet(SHEETS.BILLS));
  const payments  = sheetToObjects(getSheet(SHEETS.PAYMENTS));
  const allocs    = sheetToObjects(getSheet(SHEETS.ALLOCATIONS));
  const custMap   = {};
  customers.forEach(c => custMap[c.custId] = c);

  const positions = _computeNetPosition(bills, payments, allocs);
  const result = [];

  Object.entries(positions).forEach(([custId, pos]) => {
    const c = custMap[custId] || {};
    if (pos.netOutstanding < 0.01 && pos.advance <= 0.01) return;
    result.push({
      custId, name: c.name||'Unknown', gstin: c.gstin||'',
      creditDays: c.creditDays||0, creditLimit: c.creditLimit||0,
      upcoming: pos.upcoming,
      b0_30 : pos.b0,
      b31_60: pos.b31,
      b61_90: pos.b61,
      b90plus: pos.b90,
      total: pos.netOutstanding,
      openBillsTotal: pos.openBillsTotal,
      advance: pos.advance,
      bills: pos.openBills,
    });
  });

  return result.sort((a, b) => b.total - a.total);
}

// ══════════════════════════════════════════════════════════════
//  CASHFLOW FORECAST — forward-looking buckets by due date
//  Helps answer: "how much cash is expected, and when?"
// ══════════════════════════════════════════════════════════════
function getCashflowForecast() {
  const bills = sheetToObjects(getSheet(SHEETS.BILLS));
  const allocs = sheetToObjects(getSheet(SHEETS.ALLOCATIONS));
  const today = new Date(); today.setHours(0,0,0,0);

  const allocMap = {};
  allocs.forEach(a => { allocMap[a.billId] = (allocMap[a.billId]||0) + parseFloat(a.allocAmount||0); });

  const buckets = {
    overdue:    { label: 'Overdue',          amount: 0, count: 0 },
    thisWeek:   { label: 'This Week',        amount: 0, count: 0 },
    nextWeek:   { label: 'Next Week',        amount: 0, count: 0 },
    thisMonth:  { label: 'Rest of This Month', amount: 0, count: 0 },
    nextMonth:  { label: 'Next Month',       amount: 0, count: 0 },
    later:      { label: 'Later',            amount: 0, count: 0 },
  };

  const endOfThisWeek  = new Date(today); endOfThisWeek.setDate(today.getDate() + (7 - today.getDay()));
  const endOfNextWeek  = new Date(endOfThisWeek); endOfNextWeek.setDate(endOfThisWeek.getDate() + 7);
  const endOfThisMonth = new Date(today.getFullYear(), today.getMonth()+1, 0);
  const endOfNextMonth = new Date(today.getFullYear(), today.getMonth()+2, 0);

  bills.forEach(b => {
    if (b.status === 'closed') return;
    const total = parseFloat(b.totalAmount||0);
    const paid  = allocMap[b.billId] || 0;
    const bal   = total - paid;
    if (bal <= 0.005) return;
    const due = _normDate(b.dueDate);
    if (!due) { buckets.later.amount += bal; buckets.later.count++; return; }

    if (due < today)                    { buckets.overdue.amount   += bal; buckets.overdue.count++;   }
    else if (due <= endOfThisWeek)      { buckets.thisWeek.amount  += bal; buckets.thisWeek.count++;  }
    else if (due <= endOfNextWeek)      { buckets.nextWeek.amount  += bal; buckets.nextWeek.count++;  }
    else if (due <= endOfThisMonth)     { buckets.thisMonth.amount += bal; buckets.thisMonth.count++; }
    else if (due <= endOfNextMonth)     { buckets.nextMonth.amount += bal; buckets.nextMonth.count++; }
    else                                { buckets.later.amount     += bal; buckets.later.count++;     }
  });

  const total = Object.values(buckets).reduce((s,b)=>s+b.amount,0);
  return { buckets, total };
}

function getStatement(d) {
  const bills    = sheetToObjects(getSheet(SHEETS.BILLS)).filter(b => b.custId === d.custId);
  const payments = sheetToObjects(getSheet(SHEETS.PAYMENTS)).filter(p => p.custId === d.custId);
  const allocs   = sheetToObjects(getSheet(SHEETS.ALLOCATIONS)).filter(a => a.custId === d.custId);

  const payAllocMap = {};
  allocs.forEach(a => {
    if (!payAllocMap[a.payId]) payAllocMap[a.payId] = [];
    payAllocMap[a.payId].push({ billId: a.billId, amount: parseFloat(a.allocAmount||0) });
  });
  const billAllocMap = {};
  allocs.forEach(a => { billAllocMap[a.billId] = (billAllocMap[a.billId]||0) + parseFloat(a.allocAmount||0); });

  const billsOut = bills.map(b => ({
    type: 'bill', date: b.billDate, ref: b.billNo, narration: b.narration||'',
    debit: parseFloat(b.totalAmount||0), credit: 0,
    allocated: billAllocMap[b.billId]||0,
    balance: parseFloat(b.totalAmount||0) - (billAllocMap[b.billId]||0),
    status: b.status, billId: b.billId
  }));

  const paysOut = payments.map(p => {
    const allocations = payAllocMap[p.payId] || [];
    const totalAllocated = allocations.reduce((s, a) => s + a.amount, 0);
    const payAmt = parseFloat(p.amount||0);
    const advance = Math.max(0, payAmt - totalAllocated);  // unallocated portion of this payment
    return {
      type: 'payment', date: p.payDate, ref: p.refNo||'', narration: p.narration||p.mode||'',
      debit: 0, credit: payAmt, allocations, advance, payId: p.payId
    };
  });

  // Merge and sort chronologically
  const combined = [...billsOut, ...paysOut].sort((a, b) => {
    const dt = new Date(a.date) - new Date(b.date);
    if (dt !== 0) return dt;
    // Within same date: bills before payments
    return (a.type === 'bill' ? 0 : 1) - (b.type === 'bill' ? 0 : 1);
  });

  // Running balance — Dr increases balance, Cr reduces it
  let runBal = 0;
  combined.forEach(row => {
    runBal += row.debit - row.credit;
    row.runningBalance = runBal;
  });

  return { rows: combined, closingBalance: runBal };
}

function getDashboard() {
  const customers  = sheetToObjects(getSheet(SHEETS.CUSTOMERS));
  const bills      = sheetToObjects(getSheet(SHEETS.BILLS));
  const payments   = sheetToObjects(getSheet(SHEETS.PAYMENTS));
  const allocs     = sheetToObjects(getSheet(SHEETS.ALLOCATIONS));
  const outstanding= getOutstanding();

  const totalOut  = outstanding.reduce((s, c) => s + c.total, 0);
  const overdue   = outstanding.reduce((s, c) => s + c.b0_30 + c.b31_60 + c.b61_90 + c.b90plus, 0);
  const b90plus   = outstanding.reduce((s, c) => s + c.b90plus, 0);
  const upcoming  = outstanding.reduce((s, c) => s + (c.upcoming||0), 0);

  const today     = new Date();
  const thisMonth = today.getMonth(); const thisYear = today.getFullYear();
  const billsThisMonth = bills.filter(b => {
    const d = new Date(b.billDate); return d.getMonth()===thisMonth && d.getFullYear()===thisYear;
  }).reduce((s, b) => s + parseFloat(b.totalAmount||0), 0);

  const monthly = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth()-i, 1);
    monthly[d.toLocaleString('default',{month:'short',year:'2-digit'})] = 0;
  }
  payments.forEach(p => {
    const key = new Date(p.payDate).toLocaleString('default',{month:'short',year:'2-digit'});
    if (monthly[key] !== undefined) monthly[key] += parseFloat(p.amount||0);
  });

  return {
    totalOutstanding: totalOut,
    overdue, b90plus, billsThisMonth, upcoming,
    totalCustomers: customers.length,
    topDebtors: outstanding.slice(0, 5),
    monthlyCollection: Object.entries(monthly).map(([m,v])=>({month:m,amount:v})),
    agingSummary: {
      upcoming: outstanding.reduce((s,c)=>s+(c.upcoming||0),0),
      b0_30:   outstanding.reduce((s,c)=>s+c.b0_30,0),
      b31_60:  outstanding.reduce((s,c)=>s+c.b31_60,0),
      b61_90:  outstanding.reduce((s,c)=>s+c.b61_90,0),
      b90plus: outstanding.reduce((s,c)=>s+c.b90plus,0),
    }
  };
}

// ══════════════════════════════════════════════════════════════
//  IMPORT
// ══════════════════════════════════════════════════════════════
function importBills(d) {
  const results = { inserted:0, errors:[] };
  (d.rows||[]).forEach((row,i) => {
    try { saveBill(row); results.inserted++; }
    catch(e) { results.errors.push({row:i+1,error:e.message}); }
  });
  return results;
}

function importPayments(d) {
  const results = { inserted:0, errors:[] };
  (d.rows||[]).forEach((row,i) => {
    try { savePayment(row); results.inserted++; }
    catch(e) { results.errors.push({row:i+1,error:e.message}); }
  });
  return results;
}
