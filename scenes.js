/* ============================================================
   scenes.js · animaciones propias de cada escena
   Cada hook recibe step(n, {animate}) y debe dejar la escena en el
   estado del paso n. Si animate es true, puede reproducir la transición
   hacia ese paso; si es false, debe pintar el estado final de inmediato.
   ============================================================ */
(() => {
  'use strict';
  const { $, $$, count } = Deck;
  const el = (tag, cls, css) => { const e = document.createElement(tag); if (cls) e.className = cls; if (css) e.style.cssText = css; return e; };
  const dec1 = (n) => n.toFixed(1).replace('.', ',') + ' %';
  const int = (n) => String(Math.round(n));

  /* ───────── piezas que se generan al cargar ───────── */
  // 2 · los 116 municipios de Cundinamarca sobre su mapa (trazados en cundinamarca.js, generado por
  // tools/build-map.mjs). Cada municipio es un trazado; --d ordena el encendido en diagonal, de arriba a la
  // izquierda hacia abajo a la derecha. Bogotá, D. C. no es uno de los 116: va aparte, con borde punteado.
  (() => {
    const box = $('#cmap'), C = window.CUNDI;
    if (!box || !C) return;
    const NS = 'http://www.w3.org/2000/svg';
    const sv = (tag, attrs) => { const e = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); return e; };
    const svg = sv('svg', { viewBox: `0 0 ${C.w} ${C.h}`, role: 'img', 'aria-label': 'Mapa de los 116 municipios de Cundinamarca' });
    C.mpios.forEach((m) => {
      const p = sv('path', { d: m.d, class: 'mp', 'fill-rule': 'evenodd', 'data-c': m.c });
      p.style.setProperty('--d', Math.round((m.x / C.w + m.y / C.h) * 12));
      svg.appendChild(p);
    });
    if (C.bogota) {
      svg.appendChild(sv('path', { d: C.bogota.d, class: 'bog', 'fill-rule': 'evenodd' }));
      const t = sv('text', { x: C.bogota.x, y: C.bogota.y - 4, class: 'bog-t' });
      [['Bogotá', 0], ['D. C.', 15]].forEach(([w, dy]) => { const ts = sv('tspan', { x: C.bogota.x, dy }); ts.textContent = w; t.appendChild(ts); });
      svg.appendChild(t);
    }
    box.appendChild(svg);
  })();

  // 3 · frecuencias: Black Marble publica a menudo; FIES municipal, solo dos años
  (() => {
    const r1 = $('#trk1'), r2 = $('#trk2');
    if (!r1 || !r2) return;
    const pos = (x) => `left:calc(150px + (100% - 150px) * ${x})`;
    for (let k = 0; k < 28; k++) r1.appendChild(el('span', 'tk', pos((k / 27).toFixed(3))));
    [0.18, 0.62].forEach((x) => r2.appendChild(el('span', 'tk big', pos(x))));
  })();

  // 9 · cronograma de referencia: 40 semanas
  (() => {
    const wk = $('#wk');
    if (!wk) return;
    for (let k = 0; k < 40; k++) { const i = el('i'); i.style.setProperty('--n', k); wk.appendChild(i); }
  })();

  /* ───────── 1 · portada: las cifras cuentan hacia arriba mientras crecen las barras ───────── */
  // Cundinamarca, hogares, inseguridad alimentaria moderada o grave (DANE): 2022, 2023, 2024 y 2025
  const SERIES = [['v22', 23.0], ['v23', 27.2], ['v24', 22.6], ['v25', 13.1]];
  const paintSeries = () => SERIES.forEach(([id, v]) => { $('#' + id).textContent = dec1(v); });
  Deck.hook('s-portada', {
    enter() {
      SERIES.forEach(([id, v], i) => setTimeout(() => count($('#' + id), v, 1100, dec1), 400 + i * 220));
    },
    step(n, ctx) { if (!ctx.animate && !ctx.entering) paintSeries(); },
    reset: paintSeries,
  });

  /* ───────── 5 · propuesta: el nodo del paso brilla y la compatibilidad late desde que aparece ───────── */
  Deck.hook('s-propuesta', {
    step(n) {
      $$('#s-propuesta .pn').forEach((p, i) => {
        p.classList.toggle('hot', n <= 5 && i === n);
        p.classList.toggle('gate', n >= 2 && i === 2);
      });
    },
    reset() { $$('#s-propuesta .pn').forEach((p) => p.classList.remove('hot', 'gate')); },
  });

  /* ───────── 8 · especificado: contadores ───────── */
  Deck.hook('s-especificado', {
    step(n, ctx) {
      const run = (id, to, ms) => count($('#' + id), to, ctx.animate || ctx.entering ? ms : 0, int);
      run('n48', 48, 1500);
      if (n >= 1) { run('n17', 17, 1200); run('n11', 11, 1000); }
      if (n >= 2) run('n5', 5, 800);
    },
    reset() { ['n48', 'n17', 'n11', 'n5'].forEach((id) => { $('#' + id).textContent = '0'; }); },
  });

  /* ───────── 9 · método: las fases se encienden una a una ───────── */
  Deck.hook('s-metodo', {
    enter() {
      const cols = $$('#s-metodo .mcol');
      const track = $('#s-metodo .mtrack');
      cols.forEach((c, i) => setTimeout(() => {
        c.classList.add('lit');
        track.style.setProperty('--p', (i / 3).toFixed(2));
      }, 700 + i * 650));
    },
    reset() {
      $$('#s-metodo .mcol').forEach((c) => c.classList.remove('lit'));
      $('#s-metodo .mtrack').style.setProperty('--p', 0);
    },
  });
})();
