/* ============================================================
   Pitch ante jurados · motor de la presentación interactiva
   Escenas con pasos: cada elemento .rv declara en qué paso aparece
   (data-s="n"; sin atributo = al entrar). Las animaciones propias de
   cada escena viven en scenes.js y se registran con Deck.hook().

   Dos grupos de escenas:
   · principal (las diez de la exposición): → ← avanzan y retroceden
   · respaldo (data-group="backup", letras A–J): se abren con A–J (el F, con Mayús+F: la F sola es pantalla completa)
     y se cierran con Esc o R, que devuelven al punto de la exposición.
   ============================================================ */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Movimiento: activo por defecto aunque el sistema pida reducirlo (es una presentación y en
  // muchos equipos las animaciones de Windows están apagadas). ?motion=off lo apaga,
  // ?motion=system respeta la preferencia del sistema y la tecla V lo alterna en vivo.
  const motionParam = (location.search.match(/[?&]motion=(\w+)/) || [])[1];
  let reduce = motionParam === 'off' || (motionParam === 'system' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  document.documentElement.setAttribute('data-motion', reduce ? 'off' : 'on');
  const printMode = /[?&]print=1/.test(location.search);
  if (printMode) document.documentElement.setAttribute('data-print', '');
  // la versión pública no lleva notas de estudio ni nombres (los quita el script de compilación)
  const speed = Math.max(0.05, Math.min(1, +((location.search.match(/[?&]scale=([\d.]+)/) || [])[1]) || 1));

  const stage = $('#stage');
  const scenes = $$('.scene');
  const mainCount = scenes.filter((s) => !s.dataset.group).length;
  const isBackup = (i) => i >= mainCount;
  const letter = (i) => String.fromCharCode(65 + i - mainCount);
  const hooks = {};
  let cur = -1;
  let step = 0;
  let returnTo = null;

  /* ───── turnos: A (violeta) presenta las escenas 1 a 4 y la 10. Las escenas 5 a 9 no tienen asignación y la barra las deja como están.
     Para asignarlas, añadir por ejemplo 5: 'B' (ámbar) ───── */
  const PRESENTER = { 1: 'A', 2: 'A', 3: 'A', 4: 'A', 10: 'A' };
  /* tiempo suggerido por escena (s) para el modo recorrido; suma 550 s = 9:10 */
  const BUDGET = [45, 40, 80, 70, 55, 60, 50, 35, 70, 45];

  /* ───── ritmo ─────
     fluid  (por defecto): al entrar a una escena, sus pasos se encadenan solos;
            una pulsación de → salta al siguiente paso o escena sin esperar.
     manual (Mayús+M):     un paso por pulsación, como diapositivas clásicas.
     tour   (Mayús+P):     recorrido sin manos; también cambia de escena y se
            detiene al terminar o al abrir un respaldo.
     DWELL = milisegundos que se queda en un paso antes de pasar al siguiente. */
  const DWELL_DEFAULT = 3000;
  const DWELL = {
    's-portada': {},
    's-porque': { 0: 2800, 1: 2800, 2: 3400 },
    's-problema': { 0: 2400, 1: 6500, 2: 11000, 3: 6500, 4: 6500, 5: 16000 }, // una fila por frase del guion (~2,5 palabras por segundo)
    's-vacio': { 0: 17000, 1: 10000, 2: 15000, 3: 4000 }, // un paso por párrafo del guion (~2,5 palabras por segundo)
    's-propuesta': { 0: 2000, 1: 2000, 2: 2000, 3: 2000, 4: 2000, 5: 2400, 6: 3200 },
    's-funciona': { 0: 2600, 1: 4200, 2: 4200, 3: 3400 },
    's-alcance': { 0: 3000, 1: 3600, 2: 3400 },
    's-especificado': { 0: 2600, 1: 2800, 2: 3000 },
    's-metodo': { 0: 3200, 1: 3200, 2: 3600 },
    's-cierre': { 0: 3200, 1: 3400, 2: 2800 },
  };
  const HOLD_DEFAULT = 5200; // pausa tras el último paso, solo en modo tour
  let fluid = true;
  let tour = false;
  let timer = null;
  let hold = false; // el usuario retrocedió a propósito: no se reanuda solo hasta que avance
  let flashT;
  // un error en una animación nunca debe detener el encadenado de pasos
  const safe = (fn) => { try { return fn(); } catch (err) { console.error(err); } };
  if (/[?&]auto=0/.test(location.search)) fluid = false;
  if (/[?&]tour=1/.test(location.search)) tour = true;

  /* ───── escalado del escenario ───── */
  function fit() {
    const k = Math.min(innerWidth / 1280, innerHeight / 720);
    stage.style.setProperty('--k', k.toFixed(4));
  }
  addEventListener('resize', fit);
  fit();

  /* ───── partículas de fondo (idle) ───── */
  function particles() {
    const box = $('.ambient');
    if (!box || reduce || box.querySelector('.pt')) return;
    const colors = ['rgba(15,118,110,.55)', 'rgba(43,179,163,.6)', 'rgba(37,99,235,.4)', 'rgba(91,75,219,.4)'];
    for (let n = 0; n < 20; n++) {
      const b = document.createElement('b');
      b.className = 'pt' + (n % 3 === 0 ? ' ring' : '');
      const d = 16 + Math.random() * 18;
      b.style.cssText = `--x:${(Math.random() * 100).toFixed(1)}%;--s:${(6 + Math.random() * 16).toFixed(0)}px;--d:${d.toFixed(1)}s;--t:${(-Math.random() * d).toFixed(1)}s;--sw:${(Math.random() * 90 - 45).toFixed(0)}px;--c:${colors[n % colors.length]}`;
      box.appendChild(b);
    }
  }
  particles();

  /* ───── letras sueltas para los títulos .split ───── */
  function splitLetters(el) {
    let n = 0;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((c) => {
        if (c.nodeType === 3) {
          const frag = document.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach((w) => {
            if (!w) return;
            if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(' ')); return; }
            const word = document.createElement('span');
            word.style.cssText = 'display:inline-block;white-space:nowrap';
            Array.from(w).forEach((ch) => {
              const s = document.createElement('span');
              s.className = 'ch';
              s.style.setProperty('--c', n++);
              s.textContent = ch;
              word.appendChild(s);
            });
            frag.appendChild(word);
          });
          c.replaceWith(frag);
        } else if (c.nodeType === 1) walk(c);
      });
    };
    el.setAttribute('aria-label', el.textContent.trim());
    walk(el);
    Array.from(el.querySelectorAll('.ch')).forEach((s) => s.setAttribute('aria-hidden', 'true'));
  }
  $$('.split').forEach(splitLetters);

  /* ───── preparación de cada escena ───── */
  scenes.forEach((sc) => {
    sc._rv = $$('.rv', sc);
    const declared = +sc.dataset.steps || 0;
    const inEls = Math.max(0, ...sc._rv.map((e) => +e.dataset.s || 0));
    sc._max = Math.max(declared, inEls);
    const seen = {};
    sc._rv.forEach((e) => {
      const s = +e.dataset.s || 0;
      seen[s] = (seen[s] || 0);
      e.style.setProperty('--i', e.dataset.i !== undefined ? e.dataset.i : seen[s]);
      seen[s]++;
    });
  });

  /* ───── HUD ───── */
  const progressMain = $('#progress');
  const progressBack = $('#progress-b');
  const count = $('#count');
  const live = $('#live');
  const hint = $('#hint');
  const backBtn = $('#back');
  const playBtn = $('#play');
  const playUse = $('#play-use');
  const modeEl = $('#mode');
  const hintDefault = hint.textContent;
  const notesEl = $('#notes');
  const ntBody = $('#nt-body');
  const ntTitle = $('#nt-title');
  const ntTime = $('#nt-time');
  const ntStep = $('#nt-step');
  let notesOpen = false;
  let ntFor = -1;
  const pad = (n) => String(n).padStart(2, '0');

  const segs = scenes.map((sc, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', `Ir a «${sc.dataset.title}»`);
    if (!isBackup(i) && PRESENTER[i + 1]) b.dataset.who = PRESENTER[i + 1];
    b.innerHTML = (isBackup(i) ? `<span>${letter(i)}</span>` : '') + '<i></i>';
    b.addEventListener('click', (e) => { e.stopPropagation(); go(i, 0); });
    (isBackup(i) && progressBack ? progressBack : progressMain).appendChild(b);
    return b;
  });
  if (backBtn) backBtn.addEventListener('click', (e) => { e.stopPropagation(); closeBackup(); });
  const ntClose = $('#nt-close');
  if (ntClose) ntClose.addEventListener('click', (e) => { e.stopPropagation(); toggleNotes(false); });
  if (playBtn) playBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleTour(); });

  function updateHud() {
    const bk = isBackup(cur);
    document.body.dataset.mode = bk ? 'backup' : 'main';
    segs.forEach((b, i) => {
      const sc = scenes[i];
      let p = 0;
      if (i < cur) p = 1;
      else if (i === cur) p = sc._max ? (step + 1) / (sc._max + 1) : 1;
      b.lastElementChild.style.width = (p * 100).toFixed(1) + '%';
      b.lastElementChild.style.opacity = i < cur ? .55 : 1;
      if (i === cur) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    count.textContent = bk ? `Respaldo ${letter(cur)}` : `${pad(cur + 1)} / ${pad(mainCount)}`;
    const manualScene = !tour && scenes[cur] && scenes[cur].hasAttribute('data-manual');
    modeEl.textContent = tour ? 'recorrido' : (fluid && !manualScene ? 'auto' : 'manual');
    modeEl.classList.toggle('manual', !tour && (!fluid || manualScene));
    playBtn.classList.toggle('on', tour);
    playBtn.setAttribute('aria-pressed', String(tour));
    playUse.setAttribute('href', tour ? '#i-pause' : '#i-play');
  }

  /* ───── notas de estudio (tecla N): solo para ensayar ─────
     Cada escena trae su guion en <template class="notes">. Los párrafos con
     data-s se iluminan al llegar a ese paso de la animación. */
  function renderNotes() {
    if (!notesOpen) return;
    const sc = scenes[cur];
    if (ntFor !== cur) {
      ntFor = cur;
      const tpl = sc.querySelector('template.notes');
      ntBody.replaceChildren();
      ntTitle.textContent = isBackup(cur) ? sc.dataset.title : `${pad(cur + 1)} · ${sc.dataset.title}`;
      if (!tpl) {
        ntTime.textContent = '';
        ntBody.textContent = 'Sin notas para esta diapositiva.';
      } else {
        const d = tpl.dataset;
        ntTime.textContent = d.time ? (/^[0-9]/.test(d.time) ? '⏱ ' + d.time : d.time) : '';
        [['Úsala si preguntan por', d.when], ['Idea clave', d.key]].forEach(([label, text]) => {
          if (!text) return;
          const p = document.createElement('p');
          p.className = 'nt-lead';
          const b = document.createElement('b');
          b.textContent = label;
          p.append(b, text);
          ntBody.appendChild(p);
        });
        ntBody.appendChild(tpl.content.cloneNode(true));
      }
      ntBody.scrollTop = 0;
    }
    ntStep.textContent = sc._max ? `paso ${step}/${sc._max}` : '';
    const ps = $$('p[data-s]', ntBody);
    const reached = ps.map((p) => +p.dataset.s).filter((n) => n <= step);
    const act = reached.length ? Math.max(...reached) : -1;
    ps.forEach((p) => {
      const n = +p.dataset.s;
      p.classList.toggle('on', n === act);
      p.classList.toggle('dn', n < act);
      p.classList.toggle('up', n > act);
    });
    const el = $('p.on', ntBody);
    if (el) ntBody.scrollTo({ top: Math.max(0, el.offsetTop - 70), behavior: reduce ? 'auto' : 'smooth' });
  }
  function toggleNotes(on = !notesOpen) {
    notesOpen = on;
    notesEl.classList.toggle('open', on);
    notesEl.setAttribute('aria-hidden', String(!on));
    ntFor = -1;
    renderNotes();
  }

  /* ───── pasos automáticos y recorrido ───── */
  function clearTimer() { clearTimeout(timer); timer = null; }

  function schedule() {
    clearTimer();
    if (hold || (!fluid && !tour)) return;
    const sc = scenes[cur];
    if (sc.hasAttribute('data-manual') && !tour) return; // escena manual: un paso por pulsación
    if (step < sc._max) {
      const ms = ((DWELL[sc.id] && DWELL[sc.id][step]) || DWELL_DEFAULT) * (tour ? speed : 1);
      timer = setTimeout(() => { timer = null; setStep(step + 1); }, ms);
    } else if (tour) {
      if (cur < bounds()[1]) {
        const budget = ((BUDGET[cur] || 40) * 1000 * speed);
        const ms = Math.max(speed < 1 ? 400 : HOLD_DEFAULT, budget - (Date.now() - (sc._enteredAt || 0)));
        timer = setTimeout(() => { timer = null; go(cur + 1, 0); }, ms);
      } else setTour(false); // el recorrido termina en la última escena
    }
  }

  /* red de seguridad: si el encadenado se detuviera por cualquier motivo
     (pestaña dormida, error, foco perdido), se retoma solo. No actúa si el
     usuario retrocedió a propósito ni en modo manual. */
  function watchdog() {
    if (cur < 0 || hold || timer !== null || (!fluid && !tour)) return;
    const sc = scenes[cur];
    if (step < sc._max || (tour && cur < bounds()[1])) schedule();
  }
  setInterval(watchdog, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) watchdog(); });
  addEventListener('focus', watchdog);

  function setTour(on) {
    tour = on;
    if (on) { fluid = true; hold = false; }
    updateHud();
    schedule();
  }

  function flash(msg) {
    clearTimeout(flashT);
    hint.textContent = msg;
    hint.classList.add('show');
    flashT = setTimeout(() => hint.classList.remove('show'), 1900);
  }
  function toggleTour() {
    setTour(!tour);
    flash(tour ? 'Recorrido automático activado · Mayús+P para pausar' : 'Recorrido en pausa');
  }
  function toggleMotion() {
    reduce = !reduce;
    document.documentElement.setAttribute('data-motion', reduce ? 'off' : 'on');
    particles();
    flash(reduce ? 'Movimiento reducido · V para activarlo' : 'Movimiento activado');
  }
  function toggleManual() {
    fluid = !fluid;
    if (!fluid) tour = false; else hold = false;
    updateHud();
    schedule();
    flash(fluid ? 'Pasos automáticos' : 'Modo manual: un paso por pulsación · Mayús+M para volver');
  }

  /* ───── navegación ───── */
  function hashFor() {
    const tag = isBackup(cur) ? letter(cur).toLowerCase() : String(cur + 1);
    return `#${tag}${step ? '/' + step : ''}`;
  }

  function setStep(s, ctx = {}) {
    const sc = scenes[cur];
    const prev = step;
    step = clamp(s, 0, sc._max);
    sc._rv.forEach((e) => e.classList.toggle('on', (+e.dataset.s || 0) <= step));
    sc.dataset.step = step;
    sc.style.setProperty('--step', step);
    const h = hooks[sc.id];
    if (h && h.step) {
      safe(() => h.step(step, {
        prev,
        entering: !!ctx.entering,
        animate: ctx.animate !== undefined ? ctx.animate : step === prev + 1,
      }));
    }
    safe(updateHud);
    safe(renderNotes);
    if (ctx.entering) live.textContent = sc.dataset.title;
    try { history.replaceState(null, '', location.search + hashFor()); } catch (_) { /* file:// restringido */ }
    if (ctx.noAuto) { hold = true; clearTimer(); } else { hold = false; schedule(); }
  }

  function go(i, s = 0, opts = {}) {
    i = clamp(i, 0, scenes.length - 1);
    clearTimer();
    if (i === cur) { setStep(s, { animate: false, noAuto: opts.noAuto }); return; }
    if (!isBackup(i)) returnTo = null;
    const out = scenes[cur];
    if (out) {
      out.classList.remove('active');
      if (hooks[out.id] && hooks[out.id].leave) safe(() => hooks[out.id].leave());
      clearTimeout(out._t);
      out._t = setTimeout(() => {
        out._rv.forEach((e) => e.classList.remove('on'));
        out.dataset.step = 0;
        out.style.setProperty('--step', 0);
        if (hooks[out.id] && hooks[out.id].reset) safe(() => hooks[out.id].reset());
      }, 720);
    }
    const sc = scenes[i];
    clearTimeout(sc._t);
    cur = i;
    step = 0;
    sc._enteredAt = Date.now();
    sc.classList.add('active');
    document.body.dataset.theme = sc.dataset.theme || 'light';
    document.body.dataset.scene = sc.id;
    if (hooks[sc.id] && hooks[sc.id].enter) safe(() => hooks[sc.id].enter());
    // fija el estado inicial (oculto) antes de revelar, para que las transiciones arranquen
    // sin depender de que el navegador pinte fotogramas (no llegan si la ventana está tapada)
    void sc.offsetWidth;
    setStep(s, { entering: true, animate: s === 0, noAuto: opts.noAuto });
  }

  function bounds() { return isBackup(cur) ? [mainCount, scenes.length - 1] : [0, mainCount - 1]; }

  function next() {
    const sc = scenes[cur];
    const hi = bounds()[1];
    if (step < sc._max) setStep(step + 1);
    else if (cur < hi) go(cur + 1, 0);
  }
  function prev() {
    const lo = bounds()[0];
    if (tour) setTour(false); // retroceder es tomar el control: el recorrido se pausa
    if (step > 0) setStep(step - 1, { animate: false, noAuto: true });
    else if (cur > lo) go(cur - 1, scenes[cur - 1]._max, { noAuto: true });
  }

  /* respaldo: se abre desde cualquier punto y regresa al mismo punto */
  function openBackup(n) {
    const target = mainCount + n;
    if (target >= scenes.length) return;
    if (tour) setTour(false); // durante una pregunta, nada avanza solo hacia otra escena
    if (!isBackup(cur)) returnTo = { i: cur, s: step };
    go(target, 0);
  }
  function closeBackup() {
    if (!isBackup(cur)) return;
    const r = returnTo || { i: mainCount - 1, s: 0 };
    returnTo = null;
    go(r.i, r.s);
  }

  /* ───── entrada del usuario ───── */
  function dismissHint() { hint.classList.remove('show'); }
  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.repeat) return; // mantener una tecla pulsada no debe saltar diapositivas
    const k = e.key;
    // un botón con foco (p. ej. tras un clic) no debe activarse también con Espacio o Enter
    const ae = document.activeElement;
    if (k !== 'Tab' && ae && ae !== document.body && ae.closest && ae.closest('#stage button')) ae.blur();
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k)) { e.preventDefault(); next(); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); prev(); }
    else if (k === 'Home') { e.preventDefault(); go(isBackup(cur) ? mainCount : 0, 0); }
    else if (k === 'End') { e.preventDefault(); go(isBackup(cur) ? scenes.length - 1 : mainCount - 1, 0); }
    else if (k === 'F' && e.shiftKey) openBackup(5); // Mayús+F: respaldo F (F sola es pantalla completa)
    else if (k === 'f' || k === 'F') {
      if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
    } else if (e.shiftKey && (k === 'p' || k === 'P')) toggleTour();
    else if (e.shiftKey && (k === 'm' || k === 'M')) toggleManual();
    else if (k === 'v' || k === 'V') toggleMotion();
    else if (k === 'n' || k === 'N') toggleNotes();
    else if (/^[0-9]$/.test(k)) {
      const n = k === '0' ? 9 : +k - 1;
      if (n < mainCount) go(n, 0);
    } else if (/^[a-eg-jA-EG-J]$/.test(k)) openBackup(k.toLowerCase().charCodeAt(0) - 97);
    else if (k === 'Escape') { if (notesOpen) toggleNotes(false); else closeBackup(); }
    else if (k === 'r' || k === 'R') closeBackup();
    else return;
    dismissHint();
  });

  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('#stage button');
    if (b) setTimeout(() => b.blur(), 0);
  }, true);

  // un clic en el 40 % izquierdo de la pantalla retrocede; en el resto, avanza
  const LEFT_ZONE = 0.4;
  addEventListener('click', (e) => {
    if (e.target.closest('a, button, .notes-modal')) return;
    if (e.clientX < innerWidth * LEFT_ZONE) prev(); else next();
    dismissHint();
  });

  let tx = 0, ty = 0;
  addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { dx < 0 ? next() : prev(); }
  }, { passive: true });

  // cursor discreto cuando no se usa
  let cursorT;
  addEventListener('mousemove', () => {
    document.body.classList.remove('hide-cursor');
    clearTimeout(cursorT);
    cursorT = setTimeout(() => document.body.classList.add('hide-cursor'), 2600);
  });

  /* ───── arranque: #3, #3/2, #a o #b/2 ───── */
  function fromHash() {
    const m = location.hash.match(/^#(?:(\d+)|([a-jA-J]))(?:\/(\d+))?$/);
    if (!m) return [0, 0];
    const s = +m[3] || 0;
    if (m[2]) return [Math.min(mainCount + m[2].toLowerCase().charCodeAt(0) - 97, scenes.length - 1), s];
    return [clamp(+m[1] - 1, 0, mainCount - 1), s];
  }
  addEventListener('hashchange', () => {
    const [i, s] = fromHash();
    if (i !== cur || s !== step) go(i, s);
  });

  /* ───── API para scenes.js ───── */
  window.Deck = {
    $, $$, sleep, clamp, reduce, printMode,
    hook(id, obj) { hooks[id] = obj; },
    // contador animado; `from` permite pasar de un valor a otro
    count(el, to, ms = 1300, fmt = (n) => new Intl.NumberFormat('es-CO').format(Math.round(n)), from = 0) {
      cancelAnimationFrame(el._raf);
      if (!ms || reduce || printMode) { el.textContent = fmt(to); return; }
      const t0 = performance.now();
      const tick = (t) => {
        const p = clamp((t - t0) / ms, 0, 1);
        el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - p, 3)));
        if (p < 1) el._raf = requestAnimationFrame(tick);
      };
      el._raf = requestAnimationFrame(tick);
    },
    _scenes: scenes,
    _hooks: hooks,
  };

  /* modo impresión: cada escena queda en su paso final y se pasa por todas */
  function startPrint() {
    scenes.forEach((sc) => {
      sc.classList.add('active');
      sc._rv.forEach((e) => e.classList.add('on'));
      sc.dataset.step = sc._max;
      sc.style.setProperty('--step', sc._max);
      document.body.dataset.theme = 'light';
      const h = hooks[sc.id];
      if (h && h.enter) safe(() => h.enter());
      if (h && h.step) safe(() => h.step(sc._max, { prev: sc._max, entering: true, animate: false }));
    });
    document.body.dataset.printed = '1';
  }

  window.addEventListener('load', () => {
    if (printMode) { startPrint(); return; }
    const [i, s] = fromHash();
    go(i, s);
    if (/[?&]notes=on(?:&|$)/.test(location.search)) toggleNotes(true);
    if (tour) setTour(true);
    if (i === 0 && s === 0) {
      setTimeout(() => { hint.textContent = hintDefault; hint.classList.add('show'); }, 2400);
      setTimeout(dismissHint, 9000);
    }
    cursorT = setTimeout(() => document.body.classList.add('hide-cursor'), 4000);
  });
})();
