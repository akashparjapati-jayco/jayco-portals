/* JAYCO staff password lock — for portals that have no sign-in of their own.
   Asked once per browser session. Only a SHA-256 hash of the password is stored here.
   Usage: <script src="jayco-lock.js" data-portal="Casting Control"></script> (as early as possible in <body>). */
(function () {
  var HASH = '09f70ef9826f4e1e95e5dc932e345f9c5827190321831847d66c360c91b3627d'; // sha256('jayco-staff|' + password)
  var KEY = 'jayco_staff_ok';
  var me = document.currentScript;
  var name = (me && me.getAttribute('data-portal')) || 'Staff Portal';
  try { if (sessionStorage.getItem(KEY) === HASH) return; } catch (e) {}

  var css = '#jlock{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;padding:20px;' +
    'background:radial-gradient(900px 500px at 50% -10%,#FDECEB,transparent),#F3F4F6;font-family:Montserrat,system-ui,sans-serif}' +
    '#jlock .b{width:100%;max-width:380px;background:#fff;border:1px solid #E1E4E9;border-top:5px solid #E5322D;border-radius:8px;padding:30px 28px;box-shadow:0 30px 80px -24px rgba(16,24,40,.25);text-align:center}' +
    '#jlock img{height:30px;margin:0 auto 18px;display:block}' +
    '#jlock h2{margin:0;font-size:20px;font-weight:800;color:#16181D}' +
    '#jlock p{margin:6px 0 18px;font-size:13px;color:#545B66}' +
    '#jlock input{width:100%;box-sizing:border-box;border:1px solid #D5D8DD;border-radius:6px;padding:11px 12px;font:inherit;font-size:15px;text-align:center;outline:none}' +
    '#jlock input:focus{border-color:#E5322D;box-shadow:0 0 0 3px rgba(229,50,45,.18)}' +
    '#jlock button{width:100%;margin-top:12px;border:0;border-radius:6px;padding:12px;background:#E5322D;color:#fff;font:inherit;font-weight:700;font-size:14px;cursor:pointer}' +
    '#jlock button:hover{background:#B8211C}' +
    '#jlock .e{min-height:18px;margin-top:10px;font-size:12.5px;color:#B91C1C;font-weight:600}' +
    '#jlock a{display:inline-block;margin-top:6px;font-size:12px;color:#545B66}';
  function build() {
    if (document.getElementById('jlock')) return;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var d = document.createElement('div'); d.id = 'jlock';
    d.innerHTML = '<form class="b" autocomplete="on"><img src="assets/jayco-logo.png" alt="JAYCO"><h2></h2><p>Enter the staff password to continue.</p>' +
      '<input type="password" id="jlockPwd" autocomplete="current-password" placeholder="Staff password" autofocus>' +
      '<button type="submit">Unlock</button><div class="e" id="jlockErr"></div><a href="index.html">← All Portals</a></form>';
    d.querySelector('h2').textContent = name;
    document.body.appendChild(d);
    document.documentElement.style.overflow = 'hidden';
    var inp = d.querySelector('#jlockPwd'); setTimeout(function () { inp.focus(); }, 50);
    d.querySelector('form').onsubmit = function (e) {
      e.preventDefault();
      var v = inp.value;
      crypto.subtle.digest('SHA-256', new TextEncoder().encode('jayco-staff|' + v)).then(function (buf) {
        var hex = Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
        if (hex === HASH) {
          try { sessionStorage.setItem(KEY, HASH); } catch (e2) {}
          document.documentElement.style.overflow = '';
          d.remove();
        } else {
          d.querySelector('#jlockErr').textContent = 'Incorrect password.';
          inp.value = ''; inp.focus();
        }
      });
    };
  }
  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})();
