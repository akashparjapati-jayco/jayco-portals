/* JAYCO icon set — one line-icon style for every portal.
   Usage:  JI('dispatch')            -> '<svg …>' string
           <span data-ji="dispatch"></span>  (filled in automatically)
   Icons inherit the text colour (stroke="currentColor"). */
(function () {
  var P = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    inquiry: '<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/>',
    quote: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h4"/>',
    order: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>',
    neworder: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM12 11v6M9 14h6"/>',
    casting: '<path d="M3 21h18M5 21V10l5 3V10l5 3V7h4v14"/><path d="M8 17h2M13 17h2"/>',
    machining: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    paint: '<path d="M18 3H6v6h12z"/><path d="M12 9v3H8v9"/><path d="M18 6h3v5h-9"/>',
    inspect: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11l2 2 4-4"/>',
    dispatch: '<path d="M2 7h12v9H2zM14 10h4l3 3v3h-7"/><circle cx="6" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
    payment: '<path d="M7 4h11M7 9h11M14 4c3 0 3 5 0 5H7l8 11"/>',
    rupee: '<path d="M7 4h11M7 9h11M14 4c3 0 3 5 0 5H7l8 11"/>',
    wallet: '<path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7V6a2 2 0 0 1 2-2h11v3"/><circle cx="16.5" cy="13.5" r="1.2"/>',
    store: '<path d="M21 8 12 3 3 8l9 5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>',
    stock: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    customers: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 12 0v1M16 4a4 4 0 0 1 0 8M22 21v-1a6 6 0 0 0-4-5.6"/>',
    vendor: '<path d="M3 21V8l6-4v5l6-4v5l6-3v14z"/><path d="M7 17h2M12 17h2M17 17h2"/>',
    entry: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    board: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    costing: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M8 18h6"/>',
    parts: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3.1 14H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 20.9 10H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    report: '<path d="M3 3v18h18"/><path d="M7 16v-4M11 16V8M15 16v-6M19 16V6"/>',
    trend: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-7"/>',
    ledger: '<path d="M5 4a2 2 0 0 1 2-2h12v18H7a2 2 0 0 0-2 2z"/><path d="M5 20V4M9 6h6M9 10h6"/>',
    flow: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 6H15a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6.5"/>',
    reject: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
    layout: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    employees: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M5.5 16.5a3.5 3.5 0 0 1 7 0M15 10h3M15 13h3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    salary: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    alert: '<path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h0"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    upload: '<path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    import: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M12 11v6M9 14l3 3 3-3"/>',
    item: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    inout: '<path d="M7 3v14M3 7l4-4 4 4M17 21V7M13 17l4 4 4-4"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    statement: '<path d="M7 3h10a2 2 0 0 1 2 2v16l-3-2-2 2-2-2-2 2-2-2-3 2V5a2 2 0 0 1 2-2z"/><path d="M9 8h6M9 12h6"/>',
    forecast: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
    advance: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10"/>',
    back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    bearing: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="5.5" r="1"/><circle cx="12" cy="18.5" r="1"/><circle cx="5.5" cy="12" r="1"/><circle cx="18.5" cy="12" r="1"/>',
    pricelist: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><path d="M10 9h-1.5a1.5 1.5 0 0 0 0 3h1a1.5 1.5 0 0 1 0 3H8M9 8v1M9 15v1"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    pin: '<path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>'
  };
  function JI(name, size) {
    var p = P[name] || P.bearing, s = size || 18;
    return '<svg class="ji" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }
  function fill(root) {
    (root || document).querySelectorAll('[data-ji]:not([data-ji-done])').forEach(function (el) {
      el.innerHTML = JI(el.getAttribute('data-ji'), +el.getAttribute('data-ji-size') || undefined);
      el.setAttribute('data-ji-done', '1');
    });
  }
  window.JI = JI; window.JI.names = Object.keys(P); window.JI.fill = fill;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { fill(); }); else fill();
})();
