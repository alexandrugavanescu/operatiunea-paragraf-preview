/* Operațiunea paragraf — comportament în pagină (fără dependențe). */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var money = function (n) {
    return new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' lei';
  };
  // Romanian plural: 1 carte, 2–19 cărți, 20+ de cărți
  var pl = function (n, one, few) {
    if (n === 1) return '1 ' + one;
    var m = n % 100;
    return n + ' ' + (n === 0 || (m >= 1 && m <= 19) ? few : 'de ' + few);
  };
  var el = function (tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  };

  /* ---------- Register of the class agents (kept only in this browser) ---------- */
  var REG_KEY = 'op-agenti-v1';
  var Register = {
    empty: function () { return { v: 1, klass: '', school: '', year: '', next: 1, students: [] }; },
    clean: function (o) {
      var r = Register.empty();
      if (!o || typeof o !== 'object') return r;
      var str = function (v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; };
      r.klass = str(o.klass, 40); r.school = str(o.school, 120); r.year = str(o.year, 20);
      var list = Array.isArray(o.students) ? o.students.slice(0, 60) : [];
      list.forEach(function (st) {
        if (!st || typeof st.name !== 'string' || !st.name.trim()) return;
        var cases = Array.isArray(st.cases) ? st.cases.map(function (c) { return parseInt(c, 10); }).filter(function (c) { return c > 0; }) : [];
        r.students.push({ id: r.next++, name: st.name.trim().slice(0, 80), cases: cases.filter(function (c, i) { return cases.indexOf(c) === i; }) });
      });
      return r;
    },
    load: function () {
      try { var raw = window.localStorage.getItem(REG_KEY); if (raw) return Register.clean(JSON.parse(raw)); } catch (e) { /* storage blocked */ }
      return Register.empty();
    },
    save: function (r) {
      try { window.localStorage.setItem(REG_KEY, JSON.stringify(r)); return true; } catch (e) { return false; }
    }
  };
  var rankFor = function (n, th) { return n >= th.comisar ? 'comisar' : (n >= th.inspector ? 'inspector' : 'stagiar'); };
  var STARS = { stagiar: 1, inspector: 2, comisar: 3 };
  var solvedOf = function (st, cases) {
    var ids = cases.map(function (c) { return c.id; });
    return st.cases.filter(function (c) { return ids.indexOf(c) !== -1; });
  };

  /* Prints a holder element alone on the page, then removes it. */
  function printHolder(holder, bodyClass, pageCss) {
    document.body.appendChild(holder);
    var style = document.createElement('style');
    style.textContent = pageCss;
    document.head.appendChild(style);
    document.body.classList.add(bodyClass);
    var done = false;
    var cleanup = function () {
      if (done) return; done = true;
      document.body.classList.remove(bodyClass);
      holder.remove(); style.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    var imgs = $$('img', holder);
    Promise.all(imgs.map(function (img) {
      return img.complete ? Promise.resolve() : new Promise(function (r) { img.onload = img.onerror = r; });
    })).then(function () { window.print(); setTimeout(cleanup, 1500); });
  }

  /* ---------- Mobile navigation ---------- */
  function initNav() {
    var btn = $('[data-nav-toggle]');
    var panel = $('#mobile-nav');
    if (!btn || !panel) return;
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      panel.hidden = open;
      $('[data-open-label]', btn).hidden = !open;
      $('[data-close-label]', btn).hidden = open;
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) { btn.click(); btn.focus(); }
    });
  }

  /* ---------- Small helpers ---------- */
  function initDismiss() {
    $$('[data-dismiss]').forEach(function (b) {
      b.addEventListener('click', function () { var a = b.closest('[data-flash]'); if (a) a.remove(); });
    });
  }

  function initPasswordToggles() {
    $$('[data-toggle-password]').forEach(function (b) {
      b.addEventListener('click', function () {
        var input = b.parentElement.querySelector('input');
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        b.setAttribute('aria-pressed', String(show));
        b.setAttribute('aria-label', show ? 'Ascunde parola' : 'Arată parola');
      });
    });
  }

  function initConfirm() {
    document.addEventListener('submit', function (e) {
      var form = e.target;
      var submitter = e.submitter;
      var msg = (submitter && submitter.getAttribute('data-confirm')) || form.getAttribute('data-confirm');
      if (msg && !window.confirm(msg)) e.preventDefault();
    });
  }

  function initAutoSubmit() {
    $$('[data-autosubmit]').forEach(function (el) {
      el.addEventListener('change', function () { el.form && el.form.submit(); });
    });
  }

  function initPrint() {
    $$('[data-print]').forEach(function (b) { b.addEventListener('click', function () { window.print(); }); });
  }

  function initSelectAll() {
    $$('[data-select-all]').forEach(function (master) {
      var name = master.getAttribute('data-select-all');
      master.addEventListener('change', function () {
        $$('input[name="' + name + '"]').forEach(function (c) { c.checked = master.checked; });
      });
    });
  }

  /* ---------- Order form ---------- */
  function initOrder() {
    var form = $('[data-order-form]');
    if (!form) return;
    var rules = {
      discount: parseFloat(form.dataset.discount || '0'),
      threshold: parseFloat(form.dataset.threshold || '0'),
      fee: form.dataset.fee === '' ? null : parseFloat(form.dataset.fee),
      minFree: parseInt(form.dataset.minfree || '0', 10)
    };
    var rows = $$('[data-book-row]', form);

    rows.forEach(function (row) {
      var input = $('input', row);
      $$('[data-step]', row).forEach(function (b) {
        b.addEventListener('click', function () {
          var v = parseInt(input.value || '0', 10) || 0;
          v = Math.max(0, Math.min(2000, v + parseInt(b.dataset.step, 10)));
          input.value = v;
          recalc();
        });
      });
      input.addEventListener('input', recalc);
    });

    function recalc() {
      var subtotal = 0, qty = 0, free = 0, complete = true, any = false;
      rows.forEach(function (row) {
        var input = $('input', row);
        var q = Math.max(0, parseInt(input.value || '0', 10) || 0);
        var priceAttr = row.dataset.price;
        row.classList.toggle('is-selected', q > 0);
        var freeTag = $('[data-free]', row);
        var gets = rules.minFree > 0 && q >= rules.minFree;
        if (freeTag) freeTag.hidden = !gets;
        if (q <= 0) return;
        any = true;
        qty += q;
        if (gets) free += 1;
        if (priceAttr === '') { complete = false; } else { subtotal += parseFloat(priceAttr) * q; }
      });
      subtotal = Math.round(subtotal * 100) / 100;
      var discount = Math.round(subtotal * rules.discount) / 100;
      var after = Math.round((subtotal - discount) * 100) / 100;
      var freeShip = rules.threshold > 0 && after > rules.threshold;
      var shipping = !any ? 0 : (freeShip ? 0 : rules.fee);
      var total = shipping === null ? after : after + shipping;

      var set = function (key, text) { var el = $('[data-sum="' + key + '"]', form); if (el) el.textContent = text; };
      set('qty', qty + (qty === 1 ? ' exemplar' : ' exemplare'));
      set('subtotal', money(subtotal));
      set('discount', '− ' + money(discount));
      set('shipping', !any ? '—' : (shipping === null ? 'se confirmă' : (shipping === 0 ? 'gratuit' : money(shipping))));
      set('total', money(total) + (complete ? '' : ' *'));
      var incomplete = $('[data-sum-incomplete]', form);
      if (incomplete) incomplete.hidden = complete;
      var freeLine = $('[data-perk="free"]', form);
      if (freeLine) {
        freeLine.classList.toggle('is-on', free > 0);
        $('span', freeLine).textContent = free > 0
          ? (free === 1 ? '1 volum gratuit' : free + ' volume gratuite')
          : 'Volum gratuit la minimum ' + rules.minFree + ' exemplare dintr-un titlu';
      }
      var shipLine = $('[data-perk="ship"]', form);
      if (shipLine && rules.threshold > 0) {
        shipLine.classList.toggle('is-on', freeShip);
        var missing = Math.max(0, rules.threshold - after);
        $('span', shipLine).textContent = freeShip ? 'Transport gratuit' : 'Mai adaugă ' + money(missing + 0.01) + ' pentru transport gratuit';
        var bar = $('.progress span', shipLine.parentElement);
        if (bar) bar.style.width = Math.min(100, (after / rules.threshold) * 100) + '%';
      }
      var pointsLine = $('[data-perk="points"]', form);
      var rate = parseInt(form.dataset.points || '0', 10) || 0;
      if (pointsLine && rate > 0) {
        var pts = qty * rate;
        pointsLine.classList.toggle('is-on', pts > 0);
        $('span', pointsLine).textContent = pts > 0
          ? 'Comanda îți aduce ' + pts + (pts === 1 ? ' punct' : (pts % 100 >= 1 && pts % 100 <= 19 ? ' puncte' : ' de puncte')) + ' după confirmare'
          : (rate === 1 ? '1 punct' : rate + ' puncte') + ' pentru fiecare exemplar, după confirmare';
      }
      var submit = $('[data-order-submit]', form);
      if (submit) submit.disabled = !any;
    }
    recalc();
  }

  /* ---------- Diplomas (generated in the browser, names never leave the device) ---------- */
  function initDiplomas() {
    var form = $('[data-diploma-form]');
    if (!form) return;
    var tpl = $('#diploma-template');
    var preview = $('[data-diploma-preview]');
    var countEl = $('[data-diploma-count]');
    var countReg = $('[data-diploma-count-reg]');
    var cases = JSON.parse(form.dataset.cases || '[]');
    var th = JSON.parse(form.dataset.thresholds || '{}');
    var rankNames = JSON.parse(form.dataset.ranks || '{}');
    var reg = Register.load();
    var modeBox = $('[data-diploma-mode]', form);
    var f = form.elements;

    if (reg.students.length && modeBox) {
      modeBox.hidden = false;
      $('[data-register-count]', modeBox).textContent = pl(reg.students.length, 'agent', 'agenți');
      if (form.dataset.preferRegister === '1') f.mode.value = 'register';
      if (reg.klass && !f.klass.value) f.klass.value = reg.klass;
      if (reg.school) f.school.value = reg.school;
      if (reg.year) f.year.value = reg.year;
    }
    function mode() { return reg.students.length && f.mode && f.mode.value === 'register' ? 'register' : 'names'; }
    function names() {
      return (f.names.value || '').split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 200);
    }
    function people() {
      if (mode() === 'register') {
        return reg.students.map(function (st) { return { name: st.name, solved: solvedOf(st, cases) }; });
      }
      return names().map(function (n) { return { name: n, solved: null }; });
    }
    function fill(node, person) {
      var year = f.year.value.trim();
      var book = f.book && f.book.value ? f.book.options[f.book.selectedIndex].text : '';
      var klass = f.klass.value.trim(), school = f.school.value.trim();
      var details = [];
      if (klass) details.push('din clasa ' + klass);
      if (school) details.push(school);
      var club = 'Clubul de lectură „Operațiunea paragraf” al Editurii Paralela 45';
      var set = function (k, text) { var x = $('[data-d="' + k + '"]', node); if (x) { x.textContent = text || ''; x.hidden = !text; } };
      set('name', person ? person.name : 'Numele elevului');
      set('details', details.join(', '));
      set('teacher', f.teacher.value.trim());
      set('date', f.date.value ? new Date(f.date.value + 'T12:00:00').toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
      if (person && person.solved) {
        var n = person.solved.length;
        var rank = rankFor(n, th);
        var rname = rankNames[rank] || '';
        node.classList.add('diploma--rank', 'diploma--' + rank);
        set('title', 'DIPLOMĂ DE ' + rname.toUpperCase());
        set('reason', n
          ? 'care a obținut gradul de ' + rname.toLowerCase() + ', rezolvând ' + (n === 1 ? 'un caz' : pl(n, 'caz', 'cazuri')) + ' de lectură în ' + club + (year ? ', în anul școlar ' + year : '') + '.'
          : 'care a intrat în ' + club + ' cu gradul de detectiv stagiar' + (year ? ', în anul școlar ' + year : '') + '.');
        var titles = cases.filter(function (c) { return person.solved.indexOf(c.id) !== -1; }).map(function (c) { return '„' + c.title + '”'; });
        set('cases', titles.length ? 'Cazuri rezolvate: ' + titles.join(', ') + '.' : '');
        set('badge', '★'.repeat(STARS[rank] || 1) + ' ' + rname.toUpperCase());
      } else {
        set('title', 'DIPLOMĂ DE PARTICIPARE');
        set('reason', 'pentru participarea la ' + club + (year ? ', în anul școlar ' + year : '') + (book ? ', pentru lectura cărții „' + book + '”' : '') + '.');
        set('cases', '');
        set('badge', '');
      }
      return node;
    }
    function render() {
      var reg_ = mode() === 'register';
      $$('[data-names-only]', form).forEach(function (x) { x.hidden = reg_; });
      $$('[data-register-only]', form).forEach(function (x) { x.hidden = !reg_; });
      var list = people();
      if (countEl) countEl.textContent = pl(list.length, 'diplomă', 'diplome');
      if (countReg) countReg.textContent = pl(list.length, 'diplomă', 'diplome');
      preview.innerHTML = '';
      preview.appendChild(fill(tpl.content.firstElementChild.cloneNode(true), list[0] || (reg_ ? null : null)));
    }
    form.addEventListener('input', render);
    form.addEventListener('change', render);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var list = people();
      var err = $('[data-names-error]', form);
      if (!list.length) { if (err) err.hidden = false; if (mode() === 'names') f.names.focus(); return; }
      if (err) err.hidden = true;
      var holder = el('div', 'diploma-print');
      list.forEach(function (p) { holder.appendChild(fill(tpl.content.firstElementChild.cloneNode(true), p)); });
      printHolder(holder, 'printing-diplomas', '@page { size: A4 landscape; margin: 0; }');
    });
    render();
  }

  /* ---------- Agents of the class: register, ranks and ID cards ---------- */
  function initAgents() {
    var root = $('[data-agents]');
    if (!root) return;
    var cases = JSON.parse(root.dataset.cases || '[]');
    var th = JSON.parse(root.dataset.thresholds || '{}');
    var rankNames = JSON.parse(root.dataset.ranks || '{}');
    var reg = Register.load();
    var meta = $('[data-agents-meta]', root);
    var add = $('[data-agents-add]', root);
    var rows = $('[data-agents-rows]', root);
    var errBox = $('[data-agents-error]', root);
    var tpl = $('#agent-card-template');
    var preview = $('[data-agents-preview]', root);

    ['klass', 'school', 'year'].forEach(function (k) { if (reg[k]) meta.elements[k].value = reg[k]; });
    if (!reg.year) reg.year = meta.elements.year.value.trim();
    if (!reg.school) reg.school = meta.elements.school.value.trim();

    function persist() {
      var ok = Register.save(reg);
      errBox.hidden = ok;
      if (!ok) errBox.textContent = 'Browserul nu permite salvarea registrului. Descarcă-l ca fișier, ca să nu pierzi ce ai completat.';
    }
    function card(st, idx) {
      var node = tpl.content.firstElementChild.cloneNode(true);
      var solved = st ? solvedOf(st, cases) : [];
      var rank = rankFor(solved.length, th);
      var set = function (k, text) { $('[data-a="' + k + '"]', node).textContent = text; };
      set('name', st ? st.name : 'Numele agentului');
      set('klass', [reg.klass ? 'Clasa ' + reg.klass : '', reg.school].filter(Boolean).join(' · '));
      set('rank', '★'.repeat(STARS[rank]) + ' ' + (rankNames[rank] || ''));
      $('[data-a="rank"]', node).className = 'agent-card__rank agent-card__rank--' + rank;
      set('no', 'AGENT NR. ' + String(idx + 1).padStart(3, '0'));
      set('year', reg.year);
      var box = $('[data-a="stamps"]', node);
      cases.forEach(function (c, i) {
        var on = solved.indexOf(c.id) !== -1;
        var stamp = el('span', 'agent-stamp' + (on ? ' is-on' : ''));
        stamp.appendChild(el('i', null, on ? 'REZOLVAT' : 'CAZUL ' + (i + 1)));
        stamp.appendChild(el('b', null, c.short));
        stamp.title = c.title;
        box.appendChild(stamp);
      });
      box.style.setProperty('--n', String(Math.max(3, cases.length)));
      return node;
    }
    function render() {
      rows.innerHTML = '';
      reg.students.forEach(function (st) {
        var tr = document.createElement('tr');
        var th0 = document.createElement('th');
        th0.scope = 'row';
        var name = el('input', 'agents-name');
        name.value = st.name; name.maxLength = 80; name.setAttribute('aria-label', 'Numele agentului');
        name.dataset.id = st.id;
        th0.appendChild(name);
        tr.appendChild(th0);
        cases.forEach(function (c) {
          var td = el('td', 'agents-table__case');
          var label = el('label', 'stampbox');
          var cb = el('input');
          cb.type = 'checkbox'; cb.dataset.id = st.id; cb.dataset.case = c.id;
          cb.checked = st.cases.indexOf(c.id) !== -1;
          label.appendChild(cb);
          label.appendChild(el('span', 'sr-only', 'Cazul „' + c.title + '” rezolvat de ' + st.name));
          label.appendChild(el('span', 'stampbox__mark'));
          td.appendChild(label);
          tr.appendChild(td);
        });
        var rank = rankFor(solvedOf(st, cases).length, th);
        var tdr = el('td');
        tdr.appendChild(el('span', 'rank-badge rank-badge--' + rank, (rankNames[rank] || '')));
        tr.appendChild(tdr);
        var tdx = el('td', 'num');
        var rm = el('button', 'btn btn--sm btn--ghost');
        rm.type = 'button'; rm.dataset.remove = st.id; rm.setAttribute('aria-label', 'Scoate din registru: ' + st.name);
        rm.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
        tdx.appendChild(rm);
        tr.appendChild(tdx);
        rows.appendChild(tr);
      });
      var n = reg.students.length;
      $('[data-agents-summary]', root).textContent = pl(n, 'agent', 'agenți');
      $('[data-agents-empty]', root).hidden = n > 0;
      $('[data-agents-table]', root).hidden = n === 0;
      ['[data-agents-print]', '[data-agents-export]', '[data-agents-clear]'].forEach(function (sel) { $(sel, root).disabled = n === 0; });
      renderPreview();
    }
    function renderPreview() {
      preview.innerHTML = '';
      preview.appendChild(card(reg.students[0] || null, 0));
    }
    meta.addEventListener('input', function () {
      reg.klass = meta.elements.klass.value.trim().slice(0, 40);
      reg.school = meta.elements.school.value.trim().slice(0, 120);
      reg.year = meta.elements.year.value.trim().slice(0, 20);
      persist(); renderPreview();
    });
    meta.addEventListener('submit', function (e) { e.preventDefault(); });
    add.addEventListener('submit', function (e) {
      e.preventDefault();
      var list = (add.elements.names.value || '').split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);
      var room = 60 - reg.students.length;
      list.slice(0, Math.max(0, room)).forEach(function (n) { reg.students.push({ id: reg.next++, name: n.slice(0, 80), cases: [] }); });
      add.elements.names.value = '';
      errBox.hidden = list.length <= room;
      if (list.length > room) errBox.textContent = 'Registrul are cel mult 60 de agenți. ' + pl(list.length - Math.max(0, room), 'nume nu a', 'nume nu au') + ' fost adăugate.';
      persist(); render();
    });
    rows.addEventListener('change', function (e) {
      var cb = e.target.closest('input[type=checkbox][data-case]');
      if (!cb) return;
      var st = reg.students.filter(function (x) { return x.id === +cb.dataset.id; })[0];
      if (!st) return;
      var c = +cb.dataset.case;
      st.cases = st.cases.filter(function (x) { return x !== c; });
      if (cb.checked) st.cases.push(c);
      persist();
      var rank = rankFor(solvedOf(st, cases).length, th);
      var badge = $('.rank-badge', cb.closest('tr'));
      badge.className = 'rank-badge rank-badge--' + rank;
      badge.textContent = rankNames[rank] || '';
      renderPreview();
    });
    rows.addEventListener('input', function (e) {
      var inp = e.target.closest('.agents-name');
      if (!inp) return;
      var st = reg.students.filter(function (x) { return x.id === +inp.dataset.id; })[0];
      if (st && inp.value.trim()) { st.name = inp.value.trim().slice(0, 80); persist(); renderPreview(); }
    });
    rows.addEventListener('click', function (e) {
      var b = e.target.closest('[data-remove]');
      if (!b) return;
      reg.students = reg.students.filter(function (x) { return x.id !== +b.dataset.remove; });
      persist(); render();
    });
    $('[data-agents-print]', root).addEventListener('click', function () {
      if (!reg.students.length) return;
      var holder = el('div', 'card-print');
      var sheet = null;
      reg.students.forEach(function (st, i) {
        if (i % 10 === 0) { sheet = el('div', 'card-sheet'); holder.appendChild(sheet); }
        sheet.appendChild(card(st, i));
      });
      printHolder(holder, 'printing-cards', '@page { size: A4 portrait; margin: 10mm; }');
    });
    $('[data-agents-export]', root).addEventListener('click', function () {
      var blob = new Blob([JSON.stringify({ v: 1, klass: reg.klass, school: reg.school, year: reg.year, students: reg.students.map(function (s) { return { name: s.name, cases: s.cases }; }) }, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'registrul-agentilor' + (reg.klass ? '-' + reg.klass.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') : '') + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    });
    $('[data-agents-import]', root).addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var data = null;
        try { data = JSON.parse(String(reader.result)); } catch (err) { data = null; }
        var fresh = Register.clean(data);
        if (!data || !fresh.students.length) {
          errBox.hidden = false; errBox.textContent = 'Fișierul nu pare un registru de agenți salvat din această pagină.';
          return;
        }
        if (reg.students.length && !window.confirm('Înlocuiești registrul actual (' + pl(reg.students.length, 'agent', 'agenți') + ') cu cel din fișier?')) return;
        reg = fresh;
        ['klass', 'school', 'year'].forEach(function (k) { meta.elements[k].value = reg[k]; });
        persist(); render();
      };
      reader.readAsText(file);
      e.target.value = '';
    });
    $('[data-agents-clear]', root).addEventListener('click', function () {
      if (!window.confirm('Golești registrul de pe acest dispozitiv? Dacă nu l-ai descărcat, numele și ștampilele se pierd.')) return;
      reg.students = [];
      persist(); render();
    });
    render();
  }

  /* ---------- Exchanging points for books ---------- */
  function initRedeem() {
    var form = $('[data-redeem-form]');
    if (!form) return;
    var balance = parseInt(form.dataset.balance || '0', 10) || 0;
    var rows = $$('[data-redeem-row]', form);
    rows.forEach(function (row) {
      var input = $('input', row);
      $$('[data-step]', row).forEach(function (b) {
        b.addEventListener('click', function () {
          var v = parseInt(input.value || '0', 10) || 0;
          input.value = Math.max(0, Math.min(100, v + parseInt(b.dataset.step, 10)));
          recalc();
        });
      });
      input.addEventListener('input', recalc);
    });
    function recalc() {
      var books = 0, cost = 0;
      rows.forEach(function (row) {
        var q = Math.max(0, parseInt($('input', row).value || '0', 10) || 0);
        row.classList.toggle('is-selected', q > 0);
        books += q; cost += q * (parseInt(row.dataset.cost, 10) || 0);
      });
      var set = function (k, t) { var x = $('[data-sum="' + k + '"]', form); if (x) x.textContent = t; };
      set('books', pl(books, 'carte', 'cărți'));
      set('cost', pl(cost, 'punct', 'puncte'));
      set('left', pl(Math.max(0, balance - cost), 'punct', 'puncte'));
      var over = cost > balance;
      $('[data-redeem-over]', form).hidden = !over;
      $('[data-redeem-submit]', form).disabled = books === 0 || over;
    }
    recalc();
  }

  /* ---------- Case file projection ---------- */
  function initCase() {
    var root = $('[data-case]');
    if (!root) return;
    var cards = $$('[data-case-card]', root);
    var i = 0;
    var count = $('[data-case-count]', root);
    var prev = $('[data-case-prev]', root);
    var next = $('[data-case-next]', root);
    var reveal = $('[data-case-reveal]', root);
    function show(n) {
      i = Math.max(0, Math.min(cards.length - 1, n));
      cards.forEach(function (c, k) { c.hidden = k !== i; });
      if (count) count.textContent = (i + 1) + ' / ' + cards.length;
      if (prev) prev.disabled = i === 0;
      if (next) next.disabled = i === cards.length - 1;
      var ans = $('[data-case-answer]', cards[i]);
      if (reveal) { reveal.hidden = !ans; if (ans) { ans.hidden = true; reveal.textContent = 'Arată răspunsul'; } }
    }
    if (prev) prev.addEventListener('click', function () { show(i - 1); });
    if (next) next.addEventListener('click', function () { show(i + 1); });
    if (reveal) reveal.addEventListener('click', function () {
      var ans = $('[data-case-answer]', cards[i]);
      if (!ans) return;
      ans.hidden = !ans.hidden;
      reveal.textContent = ans.hidden ? 'Arată răspunsul' : 'Ascunde răspunsul';
    });
    var fs = $('[data-case-fullscreen]', root);
    if (fs) {
      if (!document.documentElement.requestFullscreen) { fs.hidden = true; }
      fs.addEventListener('click', function () {
        if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.target.closest('input, textarea, select')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); show(i + 1); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); show(i - 1); }
      if ((e.key === 'r' || e.key === 'R') && reveal && !reveal.hidden) reveal.click();
    });
    if (cards.length) show(0);
  }

  /* ---------- Admin: case editor & cover preview ---------- */
  function initCaseEditor() {
    var editor = $('[data-case-editor]');
    if (!editor) return;
    var tpl = $('#case-row-template');
    var list = $('[data-case-rows]', editor);
    $('[data-case-add]', editor).addEventListener('click', function () {
      var row = tpl.content.firstElementChild.cloneNode(true);
      list.appendChild(row);
      $('textarea', row).focus();
    });
    list.addEventListener('click', function (e) {
      var b = e.target.closest('[data-case-remove]');
      if (b) b.closest('.case-row').remove();
    });
  }

  function initCoverPreview() {
    $$('[data-cover-input]').forEach(function (input) {
      var img = document.getElementById(input.getAttribute('data-cover-input'));
      input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        if (!f || !img) return;
        img.src = URL.createObjectURL(f);
        img.hidden = false;
      });
    });
  }

  /* ---------- Admin: reading kit editor ---------- */
  function initKitEditor() {
    var form = $('[data-kit-editor]');
    if (!form) return;
    var panel = form.closest('section') || document;
    var total = $('[data-kit-total]', form);
    function sum() {
      if (!total) return;
      var t = $$('[data-kit-minutes]', form).reduce(function (acc, i) { return acc + (parseInt(i.value || '0', 10) || 0); }, 0);
      total.textContent = t + ' / 50 min';
      total.classList.toggle('is-ok', t === 50);
      total.classList.toggle('is-off', t > 0 && t !== 50);
    }
    $$('[data-add-row]', form).forEach(function (b) {
      b.addEventListener('click', function () {
        var sec = b.getAttribute('data-add-row');
        var tpl = $('template[data-row-template="' + sec + '"]', panel);
        var row = tpl.content.firstElementChild.cloneNode(true);
        $('[data-rows="' + sec + '"]', form).appendChild(row);
        var first = $('input, textarea', row);
        if (first) first.focus();
        sum();
      });
    });
    form.addEventListener('click', function (e) {
      var b = e.target.closest('[data-remove-row]');
      if (b) { b.closest('.kit-row').remove(); sum(); }
    });
    form.addEventListener('input', function (e) { if (e.target.matches('[data-kit-minutes]')) sum(); });
    sum();
  }

  document.addEventListener('DOMContentLoaded', function () {
    initNav();
    initDismiss();
    initPasswordToggles();
    initConfirm();
    initAutoSubmit();
    initPrint();
    initSelectAll();
    initOrder();
    initDiplomas();
    initAgents();
    initRedeem();
    initCase();
    initCaseEditor();
    initCoverPreview();
    initKitEditor();
  });
})();
