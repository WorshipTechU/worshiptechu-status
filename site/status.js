(function () {
  'use strict';
  var HEAD = { up: 'all systems working', slow: 'some things are slow', down: 'something is down' };
  var WORD = { up: 'working', slow: 'slow', down: 'down', unknown: 'not checked yet' };
  var DAYWORD = { up: 'working', slow: 'some slow checks', down: 'had problems', none: 'no data' };
  var STALE_MIN = 20;
  var data = null;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function fmtDate(iso) {
    var d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''));
    return isNaN(d) ? iso : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function fmtTime(iso) {
    var d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function ago(iso) {
    var m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (m < 1) return 'last checked just now';
    if (m === 1) return 'last checked 1 min ago';
    if (m < 90) return 'last checked ' + m + ' min ago';
    var h = Math.round(m / 60);
    return 'last checked ' + (h < 48 ? h + ' hours ago' : Math.round(h / 24) + ' days ago');
  }
  function minutesOld() {
    return (Date.now() - new Date(data.generatedAt).getTime()) / 60000;
  }

  function renderSummary() {
    var box = document.getElementById('summary');
    var stale = minutesOld() > STALE_MIN;
    var state = stale ? 'slow' : data.overall;
    box.className = 'summary state-' + state;
    document.getElementById('headline').textContent = stale ? 'checks have paused' : HEAD[data.overall] || 'checking now';
    var line = ago(data.generatedAt);
    if (stale) line += '. we are looking into it, so this page may be behind.';
    document.getElementById('checked').textContent = line;
  }

  function renderIncident() {
    var box = document.getElementById('incident');
    var inc = data.incident;
    box.hidden = !inc;
    if (!inc) return;
    document.getElementById('incident-title').textContent = inc.title;
    var ul = document.getElementById('incident-updates');
    ul.textContent = '';
    (inc.updates || []).slice().reverse().forEach(function (u) {
      var li = el('li');
      if (u.at) li.appendChild(el('time', null, fmtTime(u.at)));
      li.appendChild(el('p', null, u.text));
      ul.appendChild(li);
    });
  }

  function renderServices() {
    var ul = document.getElementById('services');
    ul.textContent = '';
    if (!data.services.length) {
      ul.appendChild(el('li', 'muted', 'no checks have run yet.'));
      return;
    }
    data.services.forEach(function (s) {
      var li = el('li');
      var head = el('div', 'row-head');
      head.appendChild(el('h3', null, s.name));
      head.appendChild(el('span', 'badge ' + s.state, WORD[s.state] || WORD.unknown));
      li.appendChild(head);
      var bar = el('div', 'bar');
      bar.setAttribute('role', 'img');
      bar.setAttribute('aria-label', s.name + ', last 90 days' + (s.uptime != null ? ', ' + s.uptime + ' percent working' : ', no data yet'));
      s.days.forEach(function (d) {
        var seg = el('i', d.state);
        seg.title = fmtDate(d.date) + ': ' + (DAYWORD[d.state] || d.state);
        bar.appendChild(seg);
      });
      li.appendChild(bar);
      var scale = el('div', 'scale');
      scale.appendChild(el('span', null, '90 days ago'));
      scale.appendChild(el('span', null, s.uptime != null ? s.uptime + '% working' : ''));
      scale.appendChild(el('span', null, 'today'));
      li.appendChild(scale);
      ul.appendChild(li);
    });
  }

  function render() {
    renderSummary();
    renderIncident();
    renderServices();
  }

  function load() {
    fetch('status.json?t=' + Math.floor(Date.now() / 60000), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { data = j; render(); })
      .catch(function () {
        if (data) return renderSummary();
        document.getElementById('summary').className = 'summary state-slow';
        document.getElementById('headline').textContent = 'status is not loading';
        document.getElementById('checked').textContent = 'try again in a minute.';
      });
  }
  load();
  setInterval(load, 60000);
  setInterval(function () { if (data) renderSummary(); }, 30000);
})();
