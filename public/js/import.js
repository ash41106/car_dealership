(function () {
  'use strict';
  var S = window.S, $ = S.$, esc = S.esc, f = $('#imp'), out = $('#im-out'), go = $('#im-go'), msg = $('.form-msg', f), ready = false;
  $('#im-file').addEventListener('change', function (e) {
    var file = e.target.files[0]; if (!file) return;
    if (file.size > 3.5 * 1024 * 1024) { msg.className = 'form-msg bad'; msg.textContent = 'File is too large (max 3.5 MB).'; return; }
    var r = new FileReader(); r.onload = function () { $('#im-csv').value = r.result; ready = false; go.disabled = true; }; r.readAsText(file);
  });
  $('#im-csv').addEventListener('input', function () { ready = false; go.disabled = true; });
  function run(dry) {
    var csv = $('#im-csv').value.trim(); if (!csv) { msg.className = 'form-msg bad'; msg.textContent = 'Choose a CSV file or paste CSV text first.'; $('#im-csv').focus(); return; }
    msg.className = 'form-msg'; msg.textContent = dry ? 'Checking...' : 'Importing...';
    S.api('/api/staff/leads/import', 'POST', { csv: csv, source: $('#im-src').value, dryRun: dry }).then(function (r) {
      msg.className = 'form-msg good'; msg.textContent = (dry ? 'Preview: ' : 'Done: ') + r.created + ' to create, ' + r.duplicates + ' duplicates, ' + (r.errors || []).length + ' errors.';
      var rows = r.preview || [], keys = rows.length ? Object.keys(rows[0]).filter(function (k) { return typeof rows[0][k] !== 'object'; }) : [];
      out.innerHTML = (rows.length ? '<div class="tbl-w"><table class="tbl dense imp-t"><thead><tr>' + keys.map(function (k) { return '<th>' + esc(S.pretty(k)) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (x) { return '<tr>' + keys.map(function (k) { return '<td>' + esc(x[k]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' : '') +
        ((r.errors || []).length ? '<h3 class="h4">Rows with errors</h3><div class="tbl-w"><table class="tbl dense"><thead><tr><th>Row</th><th>Problem</th></tr></thead><tbody>' + r.errors.map(function (e) { return '<tr><td>' + esc(e.row) + '</td><td>' + esc(e.message) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '');
      if (dry) { ready = r.created > 0; go.disabled = !ready; } else { go.disabled = true; S.toast('Imported ' + r.created + ' leads'); }
    }).catch(function (e) { msg.className = 'form-msg bad'; msg.textContent = S.errText(e); });
  }
  f.addEventListener('submit', function (e) { e.preventDefault(); run(true); });
  go.addEventListener('click', function () { if (ready) run(false); });
})();
