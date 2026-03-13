// ============================================================
//  NEXUS ARENA — app.js  (versión corregida producción)
// ============================================================
import { db } from './firebase.js';
import {
  collection, getDocs, addDoc, doc, updateDoc,
  serverTimestamp, increment, onSnapshot, getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const WA_NUMBER = "5491157687215";

let GAMES_CATALOG  = [];
let torneos        = [];
let galardones     = [];
let reseñas        = [];
let encuestas      = [];
let activeFilter   = 'all';
let selectedTorneo = null;
let promoIndex     = 0;
let promoInterval  = null;
let chatOpen       = false;

// ── INIT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupNav();
  setupFilters();
  setupModal();
  setupReseñaModal();
  renderGamesGrid([]);
  loadAll();
  setTimeout(maybeShowPopup, 2500);
  setupChat();
  setTimeout(() => {
    const u = document.getElementById('chatUnread');
    if (u) u.style.display = 'flex';
  }, 4000);
});

// ── CARGA DE DATOS ───────────────────────────────────────────
async function loadAll() {
  try {
    const safe = (p) => p.catch(() => ({ docs: [] }));

    const [torneoSnap, galardonSnap, reseñaSnap, encuestaSnap, juegosSnap, configSnap] = await Promise.all([
      safe(getDocs(collection(db, 'torneos'))),
      safe(getDocs(collection(db, 'galardones'))),
      safe(getDocs(collection(db, 'resenas'))),
      safe(getDocs(collection(db, 'encuestas'))),
      safe(getDocs(collection(db, 'juegos_catalogo'))),
      safe(getDocs(collection(db, 'config'))),
    ]);

    torneos = torneoSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.fecha?.toDate?.()?.getTime() || 0) - (b.fecha?.toDate?.()?.getTime() || 0));

    GAMES_CATALOG = juegosSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

    const tickerDoc = configSnap.docs.find(d => d.id === 'ticker');
    if (tickerDoc) {
      const items = tickerDoc.data().items || [];
      if (items.length > 0) {
        const tickerInner = document.querySelector('.ticker-inner');
        if (tickerInner) {
          tickerInner.innerHTML = [...items, ...items].map(t => `<span>${t}</span>`).join('');
        }
      }
    }

    galardones = galardonSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.fecha?.toDate?.()?.getTime() || 0) - (a.fecha?.toDate?.()?.getTime() || 0));

    reseñas = reseñaSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(r => r.aprobada === true)
      .sort((a, b) => (b.fecha?.toDate?.()?.getTime() || 0) - (a.fecha?.toDate?.()?.getTime() || 0));

    encuestas = encuestaSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(e => e.activa === true);

    const activos = torneos.filter(t => t.estado === 'open' || t.estado === 'soon');
    const totalInscrip = torneos.reduce((s, t) => s + (t.cupos_ocupados || 0), 0);
    document.getElementById('statTorneos').textContent   = activos.length;
    document.getElementById('statInscrip').textContent   = totalInscrip;
    document.getElementById('statGanadores').textContent = galardones.length;

    renderGamesGrid(torneos);
    renderTorneos();
    renderPromoCarousel();
    renderGalardones();
    renderReseñas();
    renderEncuestas();

  } catch (err) {
    console.error('loadAll error:', err);
    const el = document.getElementById('loadingState');
    if (el) el.innerHTML = '<p style="color:var(--muted)">Error al cargar. Recargá la página.</p>';
  }
}

// ── GAMES GRID ───────────────────────────────────────────────
function renderGamesGrid(torneosActivos) {
  const grid = document.getElementById('gamesGrid');
  if (!grid) return;

  const torneosByJuego = {};
  torneosActivos.forEach(t => {
    if (t.juego_id) {
      torneosByJuego[t.juego_id] = t;
    } else {
      const match = GAMES_CATALOG.find(g =>
        (t.nombre || '').toLowerCase().includes(g.id) ||
        g.nombre.toLowerCase().includes((t.nombre || '').toLowerCase().split(' ')[0])
      );
      if (match) torneosByJuego[match.id] = t;
    }
  });

  grid.innerHTML = GAMES_CATALOG.map(game => {
    const torneo    = torneosByJuego[game.id];
    const hasTorneo = torneo && (torneo.estado === 'open' || torneo.estado === 'soon');
    const hasImg    = game.imagen && game.imagen.trim() !== '';
    return `
      <div class="game-card" onclick="openGameModal('${game.id}')">
        ${hasImg ? `<img class="game-card-img" src="${game.imagen}" alt="${game.nombre}"
            onerror="this.style.display='none';document.getElementById('gemoji-${game.id}').style.display='flex'">` : ''}
        <div class="game-card-emoji" id="gemoji-${game.id}" ${hasImg ? 'style="display:none"' : ''}>${game.emoji || '🎮'}</div>
        <div class="game-card-overlay"></div>
        <img class="game-card-logo" src="logo.png" alt="Nexus Arena">
        <span class="game-card-badge ${hasTorneo ? 'has-torneo' : 'no-torneo'}">
          ${hasTorneo ? '🔥 Torneo activo' : 'Sin torneo'}
        </span>
        <div class="game-card-title">${game.nombre}</div>
      </div>`;
  }).join('');
}

window.openGameModal = function(gameId) {
  const game = GAMES_CATALOG.find(g => g.id === gameId);
  if (!game) return;

  const torneoDelJuego = torneos.filter(t => {
    const tn = (t.nombre || '').toLowerCase();
    const gn = game.nombre.toLowerCase();
    return tn.includes(game.id) || tn.includes(gn.split(' ')[0]) || gn.includes(tn.split(' ')[0]);
  }).filter(t => t.estado === 'open' || t.estado === 'soon');

  const modal   = document.getElementById('gameModal');
  const titleEl = document.getElementById('gameModalTitle');
  const bodyEl  = document.getElementById('gameModalBody');

  titleEl.textContent = game.nombre.toUpperCase();

  const modalHeader = modal.querySelector('.modal-header');
  if (game.imagen) {
    modalHeader.style.cssText = `
      background: linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.85) 100%),
                  url('${game.imagen}') center/cover no-repeat;
      min-height: 140px; align-items: flex-end; padding-bottom: 20px;
      border-bottom: 2px solid var(--acid);`;
  } else {
    const colorMap = { mobile: '#1a0a2e', console: '#0a1a2e', pc: '#0a2e1a', cross: '#2e1a0a' };
    const bg = colorMap[game.plataforma] || '#111';
    modalHeader.style.cssText = `
      background: linear-gradient(135deg, ${bg}, #111);
      min-height: 100px; align-items: center;
      border-bottom: 2px solid var(--acid);`;
  }

  if (torneoDelJuego.length === 0) {
    bodyEl.innerHTML = `
      <div class="game-modal-empty">
        <div class="game-modal-tag">SIN TORNEOS ACTIVOS</div>
        <p style="color:var(--muted);margin-bottom:6px">No hay torneos de <strong style="color:#fff">${game.nombre}</strong> en este momento.</p>
        <p style="color:var(--muted);font-size:0.82rem;margin-bottom:20px">Seguinos o escribinos para saber cuándo viene el próximo.</p>
        <button class="btn-secondary" onclick="document.getElementById('gameModal').classList.remove('active');toggleChat()">💬 Preguntar en el chat</button>
      </div>`;
  } else {
    bodyEl.innerHTML = `
      <div class="game-modal-tag" style="margin-bottom:16px">🔥 ${torneoDelJuego.length} TORNEO${torneoDelJuego.length > 1 ? 'S' : ''} DISPONIBLE${torneoDelJuego.length > 1 ? 'S' : ''}</div>
      ${torneoDelJuego.map(t => {
        const fechaStr = t.fecha?.toDate
          ? t.fecha.toDate().toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
          : '';
        const libre = t.cupos_total - (t.cupos_ocupados || 0);
        const pct   = t.cupos_total > 0 ? (t.cupos_ocupados / t.cupos_total) * 100 : 0;
        return `
          <div class="game-modal-torneo-card">
            <div style="color:var(--acid);font-family:'Barlow Condensed',sans-serif;font-size:0.78rem;letter-spacing:2px;margin-bottom:6px">📅 ${fechaStr}</div>
            <div style="color:#fff;font-family:'Barlow Condensed',sans-serif;font-size:1.15rem;font-weight:700;margin-bottom:10px">${t.subtitulo || t.nombre}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
              <span class="game-modal-tag-sm">${t.modalidad === 'presencial' ? '🏠 Presencial' : '🌐 Online'}</span>
              <span class="game-modal-tag-sm">${t.plataforma || ''}</span>
              <span class="game-modal-tag-sm" style="color:${libre <= 3 ? 'var(--red)' : 'var(--orange)'}">⚡ ${libre} cupos</span>
            </div>
            <div style="background:rgba(255,255,255,0.05);height:4px;margin-bottom:12px">
              <div style="height:100%;background:${pct >= 87 ? 'var(--red)' : pct >= 60 ? 'var(--orange)' : 'var(--acid)'};width:${pct}%;transition:width 0.5s"></div>
            </div>
            <button class="btn-inscribir available"
              onclick="window.location='torneo.html?id=${t.id}'"
              style="clip-path:polygon(7px 0%,100% 0%,calc(100% - 7px) 100%,0% 100%);width:100%;padding:11px;font-size:0.9rem">
              INSCRIBIRME →
            </button>
          </div>`;
      }).join('')}`;
  }
  modal.classList.add('active');
};

// ── PROMO CAROUSEL ───────────────────────────────────────────
function renderPromoCarousel() {
  const abiertos = torneos.filter(t => t.estado === 'open');
  if (abiertos.length === 0) return;

  const carousel = document.getElementById('promoCarousel');
  const track    = document.getElementById('promoTrack');
  const dots     = document.getElementById('promoDots');
  if (!carousel || !track || !dots) return;

  carousel.style.display = 'block';

  track.innerHTML = abiertos.map(t => {
    const fechaStr = t.fecha?.toDate
      ? t.fecha.toDate().toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '';
    const libre = t.cupos_total - (t.cupos_ocupados || 0);
    const imgOrEmoji = t.imagen
      ? `<img class="promo-slide-img" src="${t.imagen}" alt="${t.nombre}"
            onerror="this.outerHTML='<div class=\\'promo-slide-emoji\\'>${t.emoji || '🎮'}</div>'">`
      : `<div class="promo-slide-emoji">${t.emoji || '🎮'}</div>`;
    return `
      <div class="promo-slide">
        ${imgOrEmoji}
        <div class="promo-slide-content">
          <div class="promo-slide-game">${t.nombre}</div>
          <div class="promo-slide-date">📅 ${fechaStr}</div>
          <div class="promo-slide-meta">
            <span class="promo-meta-tag">${t.modalidad || 'online'}</span>
            <span class="promo-meta-tag">${t.plataforma || ''}</span>
          </div>
          <button class="promo-slide-btn" onclick="window.location='torneo.html?id=${t.id}'">INSCRIBIRME AHORA</button>
          <div class="promo-slots">⚡ Solo quedan ${libre} cupos</div>
        </div>
      </div>`;
  }).join('');

  dots.innerHTML = abiertos.map((_, i) =>
    `<div class="promo-dot ${i === 0 ? 'active' : ''}" onclick="goToSlide(${i})"></div>`
  ).join('');

  if (abiertos.length > 1) {
    if (promoInterval) clearInterval(promoInterval);
    promoInterval = setInterval(() => {
      promoIndex = (promoIndex + 1) % abiertos.length;
      goToSlide(promoIndex);
    }, 5000);
  }
}

window.goToSlide = function(idx) {
  promoIndex = idx;
  const track = document.getElementById('promoTrack');
  if (track) track.style.transform = `translateX(-${idx * 100}%)`;
  document.querySelectorAll('.promo-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
};

// ── TORNEOS ──────────────────────────────────────────────────
function renderTorneos() {
  const grid    = document.getElementById('tournamentsGrid');
  const loading = document.getElementById('loadingState');
  const empty   = document.getElementById('emptyState');

  if (loading) loading.style.display = 'none';
  if (!grid) return;

  if (torneos.length === 0) {
    if (empty) empty.style.display = 'block';
    return;
  }

  // El filtro 'presencial' busca en modalidad, los demás en categoria/plataforma
  const filtered = activeFilter === 'all'
    ? torneos
    : torneos.filter(t =>
        (t.categoria || '').includes(activeFilter) ||
        (t.plataforma || '').includes(activeFilter) ||
        (t.modalidad || '').includes(activeFilter)
      );

  if (filtered.length === 0) {
    grid.style.display = 'grid';
    grid.innerHTML = '<p style="color:var(--muted);padding:40px 0;grid-column:1/-1">No hay torneos en esta categoría.</p>';
    return;
  }

  grid.style.display = 'grid';
  grid.innerHTML = filtered.map(buildCard).join('');
}

function buildCard(t) {
  const pct   = t.cupos_total > 0 ? (t.cupos_ocupados / t.cupos_total) * 100 : 0;
  const libre = t.cupos_total - (t.cupos_ocupados || 0);

  const statusMap = {
    open:     { cls: 'status-open',     label: 'Inscripción Abierta' },
    soon:     { cls: 'status-soon',     label: 'Próximamente' },
    full:     { cls: 'status-full',     label: 'Cupos llenos' },
    finished: { cls: 'status-finished', label: 'Finalizado' },
  };
  const platMap = { mobile: '📱 Mobile', console: '🎮 PS5', pc: '🖥 Crossplay' };

  const st        = statusMap[t.estado] || statusMap.soon;
  const plt       = platMap[t.plataforma] || t.plataforma || '';
  const fillClass = pct >= 87 ? 'danger' : pct >= 60 ? 'warning' : '';
  const canJoin   = t.estado === 'open' && libre > 0;
  const btnLabel  = !canJoin
    ? (t.estado === 'full' ? 'Sin cupos' : t.estado === 'soon' ? 'Aún no disponible' : 'Finalizado')
    : (libre <= 3 ? `¡Últimos ${libre} cupos!` : 'Inscribirme');

  const fechaStr = t.fecha?.toDate
    ? t.fecha.toDate().toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';

  const cardTop = t.imagen
    ? `<img src="${t.imagen}" alt="${t.nombre}" style="width:100%;height:100%;object-fit:cover;display:block"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
       <div class="card-game-bg ${t.plataforma || 'console'}" style="display:none;position:absolute;inset:0">${t.emoji || '🎮'}</div>`
    : `<div class="card-game-bg ${t.plataforma || 'console'}">${t.emoji || '🎮'}</div>`;

  return `
    <div class="tournament-card" data-cat="${t.categoria || ''}">
      <div class="card-top" style="position:relative">
        ${cardTop}
        <span class="card-status ${st.cls}">${st.label}</span>
        <span class="card-platform">${plt}</span>
        <div class="card-overlay"></div>
      </div>
      <div class="card-body">
        <div class="card-date">📅 ${fechaStr}</div>
        <div class="card-title">${t.nombre}</div>
        <div class="card-subtitle">${t.subtitulo || ''}</div>
        <div class="card-meta">
          <div class="meta-item"><span class="meta-label">Modalidad</span><span class="meta-value">${t.modalidad === 'presencial' ? '🏠 Local' : '🌐 Online'}</span></div>
          <div class="meta-item"><span class="meta-label">Cupos libres</span><span class="meta-value" style="${libre <= 3 ? 'color:var(--red)' : ''}">${libre}</span></div>
        </div>
        <div class="slots-bar">
          <div class="slots-info"><span>Cupos</span><span>${t.cupos_ocupados || 0} / ${t.cupos_total}</span></div>
          <div class="slots-track"><div class="slots-fill ${fillClass}" style="width:${pct}%"></div></div>
        </div>
        <div class="card-footer">
          <button class="btn-inscribir ${canJoin ? 'available' : 'disabled'}"
            ${canJoin ? `onclick="window.location='torneo.html?id=${t.id}'"` : 'disabled'}>${btnLabel}</button>
        </div>
      </div>
    </div>`;
}

// ── MODAL INSCRIPCIÓN ────────────────────────────────────────
function setupModal() {
  document.getElementById('modalClose')?.addEventListener('click', closeModal);
  document.getElementById('modalOverlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });
  document.getElementById('btnSubmit')?.addEventListener('click', submitInscripcion);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); closeReseñaModal(); }
  });
}

window.openModal = function(torneoId) {
  const t = torneos.find(x => x.id === torneoId);
  if (!t) { console.warn('openModal: torneo no encontrado, id:', torneoId); return; }

  const libre = t.cupos_total - (t.cupos_ocupados || 0);
  if (t.estado !== 'open' || libre <= 0) {
    alert('Este torneo ya no tiene cupos disponibles.');
    return;
  }

  selectedTorneo = t;

  const fechaStr = t.fecha?.toDate
    ? t.fecha.toDate().toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';
  const premio = t.premio || Math.round(t.cupos_total * (t.precio || 5000) * 0.8);

  document.getElementById('modalTitle').textContent   = 'INSCRIPCIÓN — ' + t.nombre.toUpperCase();
  document.getElementById('modalGame').textContent    = t.nombre;
  document.getElementById('modalDate').textContent    = fechaStr;
  document.getElementById('modalMode').textContent    = t.modalidad === 'presencial' ? 'Presencial — Villa de Mayo' : 'Online';
  document.getElementById('modalPrize').textContent   = `$${premio.toLocaleString('es-AR')}`;
  document.getElementById('modalEntrada').textContent = `$${(t.precio || 5000).toLocaleString('es-AR')}`;
  document.getElementById('modalPremioTC').textContent = `$${premio.toLocaleString('es-AR')}`;
  document.getElementById('modalCuposTC').textContent  = t.cupos_total;

  // Alias MP
  const aliasBlock = document.getElementById('modalAliasBlock');
  const aliasEl    = document.getElementById('modalAlias');
  if (aliasBlock && aliasEl) {
    if (t.alias_mp) {
      aliasEl.textContent      = t.alias_mp;
      aliasBlock.style.display = 'block';
    } else {
      aliasBlock.style.display = 'none';
    }
  }

  // Equipo (solo si hay jugadores_por_equipo > 1)
  const jpe = t.jugadores_por_equipo || 1;
  const equipoSection = document.getElementById('equipoSectionTitle');
  const equipoBlock   = document.getElementById('equipoBlock');
  if (equipoSection && equipoBlock) {
    if (jpe > 1) {
      equipoSection.style.display = 'block';
      equipoBlock.style.display   = 'block';
    } else {
      equipoSection.style.display = 'none';
      equipoBlock.style.display   = 'none';
    }
  }

  // Reset inputs
  ['inputNombre', 'inputGamertag', 'inputWhatsapp', 'inputMail', 'inputEquipo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  // Reset equipo radio
  const radioSin = document.querySelector('input[name="equipoOpt"][value="sin"]');
  if (radioSin) { radioSin.checked = true; toggleEquipoInput('sin'); }

  document.getElementById('formError').style.display  = 'none';
  document.getElementById('btnSubmit').disabled       = false;
  document.getElementById('btnSubmit').textContent    = 'CONFIRMAR INSCRIPCIÓN →';
  document.getElementById('modalOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
};

function closeModal() {
  document.getElementById('modalOverlay')?.classList.remove('active');
  document.body.style.overflow = '';
  selectedTorneo = null;
}

async function submitInscripcion() {
  const nombre    = document.getElementById('inputNombre')?.value.trim();
  const gamertag  = document.getElementById('inputGamertag')?.value.trim();
  const whatsapp  = document.getElementById('inputWhatsapp')?.value.trim();
  const mail      = document.getElementById('inputMail')?.value.trim();
  // contacto legacy = whatsapp (para compatibilidad con admin existente)
  const contacto  = whatsapp || document.getElementById('inputContacto')?.value.trim() || '';
  const errEl     = document.getElementById('formError');
  const btn       = document.getElementById('btnSubmit');

  errEl.style.display = 'none';

  if (!nombre || !gamertag || !whatsapp || !mail) {
    errEl.textContent = 'Completá todos los campos para continuar.';
    errEl.style.display = 'block';
    return;
  }
  if (!mail.includes('@')) {
    errEl.textContent = 'Ingresá un mail válido.';
    errEl.style.display = 'block';
    return;
  }

  // Equipo
  const jpe = selectedTorneo?.jugadores_por_equipo || 1;
  let equipoNombre = null;
  let equipoOpt    = 'sin';
  if (jpe > 1) {
    const radioCon = document.querySelector('input[name="equipoOpt"][value="con"]');
    equipoOpt = radioCon?.checked ? 'con' : 'sin';
    if (equipoOpt === 'con') {
      equipoNombre = document.getElementById('inputEquipo')?.value.trim();
      if (!equipoNombre) {
        errEl.textContent = 'Escribí el nombre de tu equipo.';
        errEl.style.display = 'block';
        return;
      }
    }
  }

  if (!selectedTorneo) {
    errEl.textContent = 'Error: cerrá el modal y volvé a intentar.';
    errEl.style.display = 'block';
    return;
  }

  // *** FIX CRÍTICO: guardar datos locales ANTES de operaciones async y ANTES de closeModal ***
  // closeModal() pone selectedTorneo = null, si se llama antes de usar estos datos → crash
  const torneoId     = selectedTorneo.id;
  const torneoNombre = selectedTorneo.nombre;
  const torneoPrecio = selectedTorneo.precio || 5000;

  btn.disabled    = true;
  btn.textContent = 'Guardando...';

  try {
    // Verificar cupos en tiempo real (evita doble inscripción si dos personas acceden a la vez)
    const torneoSnap = await getDoc(doc(db, 'torneos', torneoId));
    if (!torneoSnap.exists()) throw new Error('El torneo ya no existe.');

    const torneoActual = torneoSnap.data();
    const libreActual  = torneoActual.cupos_total - (torneoActual.cupos_ocupados || 0);

    if (torneoActual.estado !== 'open' || libreActual <= 0) {
      errEl.textContent = 'Lo sentimos, los cupos se agotaron. Intentá con otro torneo.';
      errEl.style.display = 'block';
      btn.disabled    = false;
      btn.textContent = 'CONFIRMAR INSCRIPCIÓN →';
      loadAll();
      return;
    }

    await addDoc(collection(db, 'inscripciones'), {
      nombre,
      gamertag,
      contacto,
      whatsapp: whatsapp || '',
      mail:     mail || '',
      equipo_nombre: equipoNombre || '',
      equipo_opt:    equipoOpt,
      torneo_id:         torneoId,
      torneo_nombre:     torneoNombre,
      estado:            'pendiente',
      fecha_inscripcion: serverTimestamp(),
    });

    await updateDoc(doc(db, 'torneos', torneoId), {
      cupos_ocupados: increment(1),
    });

    // Cerrar modal DESPUÉS de guardar todo, datos locales ya seguros arriba
    closeModal();

    const msg =
      `¡Hola! Quiero inscribirme al torneo de *${torneoNombre}*.\n\n` +
      `👤 Nombre: ${nombre}\n🎮 Gamertag: ${gamertag}\n📞 Contacto: ${contacto}\n\n` +
      `¿Cómo coordino el pago de $${torneoPrecio.toLocaleString('es-AR')}?`;

    setTimeout(() => {
      alert(`¡Listo, ${nombre}! 🎮\nTe mandamos a WhatsApp para coordinar el pago.`);
      window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
      loadAll();
    }, 300);

  } catch (err) {
    console.error('submitInscripcion error:', err);
    errEl.textContent = `Error: ${err.code || err.message}`;
    errEl.style.display = 'block';
    btn.disabled    = false;
    btn.textContent = 'CONFIRMAR INSCRIPCIÓN →';
  }
}

// ── GALARDONES ───────────────────────────────────────────────
function renderGalardones() {
  const loading = document.getElementById('galardonesLoading');
  const grid    = document.getElementById('galardonesGrid');
  const empty   = document.getElementById('galardonesEmpty');

  if (loading) loading.style.display = 'none';
  if (!grid) return;

  if (galardones.length === 0) {
    if (empty) empty.style.display = 'block';
    return;
  }

  grid.style.display = 'grid';
  grid.innerHTML = galardones.map((g, i) => {
    const fechaStr = g.fecha?.toDate
      ? g.fecha.toDate().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
      : g.fecha || '';

    const fotoHtml = g.foto
      ? `<img class="galardon-foto" src="${g.foto}" alt="${g.gamertag}"
            onerror="this.outerHTML='<div class=\\'galardon-foto-default\\'>${g.gamertag?.charAt(0) || '?'}</div>'">`
      : `<div class="galardon-foto-default">${g.gamertag?.charAt(0) || '?'}</div>`;

    const bgHtml = g.bg_imagen
      ? `<img class="galardon-bg" src="${g.bg_imagen}" alt="">`
      : `<div class="galardon-bg-default">${g.juego_emoji || '🎮'}</div>`;

    return `
      <div class="galardon-card ${i === 0 ? 'featured' : ''}">
        <div class="galardon-top">
          ${bgHtml}
          <div class="galardon-overlay"></div>
          <div class="galardon-crown">${i === 0 ? '👑' : '🏅'}</div>
          ${fotoHtml}
        </div>
        <div class="galardon-body">
          <div class="galardon-torneo">${g.torneo_nombre || ''}</div>
          <div class="galardon-name">${g.gamertag || ''}</div>
          <div class="galardon-fecha">${fechaStr}</div>
          <div class="galardon-stars">★★★★★</div>
          <div class="galardon-badge-wrap"><span class="galardon-badge">🏆 CAMPEÓN</span></div>
        </div>
      </div>`;
  }).join('');
}

// ── RESEÑAS ──────────────────────────────────────────────────
function renderReseñas() {
  const grid = document.getElementById('resenasGrid');
  if (!grid) return;

  if (reseñas.length === 0) {
    grid.innerHTML = '<div class="resena-empty">Aún no hay reseñas. ¡Sé el primero en comentar!</div>';
    return;
  }

  grid.innerHTML = reseñas.map(r => {
    const stars    = '★'.repeat(r.estrellas || 5) + '☆'.repeat(5 - (r.estrellas || 5));
    const fechaStr = r.fecha?.toDate ? r.fecha.toDate().toLocaleDateString('es-AR') : '';
    return `
      <div class="resena-card">
        <div class="resena-header">
          <div><div class="resena-autor">${r.nombre}</div><div class="resena-juego">${r.juego}</div></div>
          <div class="resena-stars">${stars}</div>
        </div>
        <div class="resena-texto">${r.texto}</div>
        <div class="resena-fecha">${fechaStr}</div>
      </div>`;
  }).join('');
}

window.openReseñaModal = function() {
  document.getElementById('reseñaModal')?.classList.add('active');
  document.body.style.overflow = 'hidden';
};

window.closeReseñaModal = function() {
  document.getElementById('reseñaModal')?.classList.remove('active');
  document.body.style.overflow = '';
};

function setupReseñaModal() {
  document.querySelectorAll('#starRating .star').forEach(star => {
    star.addEventListener('click', () => {
      const val   = parseInt(star.dataset.val);
      const input = document.getElementById('reseñaStars');
      if (input) input.value = val;
      document.querySelectorAll('#starRating .star').forEach((s, i) => {
        s.classList.toggle('active', i < val);
      });
    });
  });
}

window.submitReseña = async function() {
  const nombre = document.getElementById('reseñaNombre').value.trim();
  const juego  = document.getElementById('reseñaJuego').value.trim();
  const stars  = parseInt(document.getElementById('reseñaStars').value);
  const texto  = document.getElementById('reseñaTexto').value.trim();
  const errEl  = document.getElementById('reseñaError');

  errEl.style.display = 'none';
  if (!nombre || !juego || !texto || stars === 0) {
    errEl.textContent = 'Completá todos los campos y elegí una puntuación.';
    errEl.style.display = 'block';
    return;
  }

  try {
    await addDoc(collection(db, 'resenas'), {
      nombre, juego, texto, estrellas: stars,
      fecha: serverTimestamp(), aprobada: false,
    });
    closeReseñaModal();
    alert('¡Gracias por tu reseña! Se publicará una vez que sea revisada.');
  } catch (err) {
    console.error('submitReseña error:', err);
    errEl.textContent = 'Error al enviar. Intentá de nuevo.';
    errEl.style.display = 'block';
  }
};

// ── ENCUESTAS ────────────────────────────────────────────────
function renderEncuestas() {
  const container = document.getElementById('encuestasContainer');
  if (!container) return;

  if (encuestas.length === 0) {
    container.innerHTML = '<div class="encuesta-empty"><p style="color:var(--muted)">No hay encuestas activas en este momento.</p></div>';
    return;
  }
  container.innerHTML = `<div class="encuestas-grid">${encuestas.map(e => buildEncuesta(e)).join('')}</div>`;
}

function buildEncuesta(e) {
  const total = (e.opciones || []).reduce((s, o) => s + (o.votos || 0), 0);
  const voted = localStorage.getItem('voted_' + e.id);

  const opcionesHtml = (e.opciones || []).map((op, idx) => {
    const pct = total > 0 ? Math.round((op.votos || 0) / total * 100) : 0;
    return `
      <div class="encuesta-opcion ${voted ? 'voted' : ''}" onclick="${!voted ? `votarEncuesta('${e.id}',${idx})` : ''}">
        <div class="encuesta-opcion-fill" style="width:${voted ? pct : 0}%"></div>
        <div class="encuesta-opcion-text">
          <span>${op.texto}</span>
          ${voted ? `<span class="encuesta-pct">${pct}%</span>` : ''}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="encuesta-card" id="encuesta-${e.id}">
      <div class="encuesta-pregunta">${e.pregunta}</div>
      <div class="encuesta-opciones">${opcionesHtml}</div>
      <div class="encuesta-total">${total} voto${total !== 1 ? 's' : ''}</div>
    </div>`;
}

window.votarEncuesta = async function(encuestaId, opcionIdx) {
  if (localStorage.getItem('voted_' + encuestaId)) return;
  try {
    const encuesta = encuestas.find(e => e.id === encuestaId);
    if (!encuesta) return;
    const opciones = [...encuesta.opciones];
    opciones[opcionIdx].votos = (opciones[opcionIdx].votos || 0) + 1;
    await updateDoc(doc(db, 'encuestas', encuestaId), { opciones });
    localStorage.setItem('voted_' + encuestaId, '1');
    encuesta.opciones = opciones;
    renderEncuestas();
  } catch (err) {
    console.error('votarEncuesta error:', err);
  }
};

// ── POPUP PROMO ──────────────────────────────────────────────
function maybeShowPopup() {
  const abiertos = torneos.filter(t => t.estado === 'open');
  if (abiertos.length === 0) return;
  if (sessionStorage.getItem('popup_shown')) return;

  const t       = abiertos[0];
  const libre   = t.cupos_total - (t.cupos_ocupados || 0);
  const fechaStr = t.fecha?.toDate
    ? t.fecha.toDate().toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';

  const imgHtml = t.imagen
    ? `<img class="promo-popup-img" src="${t.imagen}" alt="${t.nombre}"
          onerror="this.outerHTML='<div class=\\'promo-popup-emoji\\'>${t.emoji || '🎮'}</div>'">`
    : `<div class="promo-popup-emoji">${t.emoji || '🎮'}</div>`;

  const inner = document.getElementById('promoPopupInner');
  if (!inner) return;

  inner.innerHTML = `
    ${imgHtml}
    <div class="promo-popup-content">
      <div class="promo-popup-tag">🔥 Inscripciones abiertas</div>
      <div class="promo-popup-title">${t.nombre}</div>
      <div class="promo-popup-date">📅 ${fechaStr}</div>
      <div class="promo-popup-slots">⚡ Solo quedan ${libre} cupos disponibles</div>
      <button class="promo-popup-btn" onclick="window.location='torneo.html?id=${t.id}'">INSCRIBIRME AHORA →</button>
    </div>`;

  document.getElementById('promoPopup').style.display = 'flex';
  sessionStorage.setItem('popup_shown', '1');
}

window.closePromoPopup = function(e) {
  if (e && e.target !== document.getElementById('promoPopup') && e.target !== e.currentTarget) return;
  const popup = document.getElementById('promoPopup');
  if (popup) popup.style.display = 'none';
};

// ── CHAT ─────────────────────────────────────────────────────
const FAQ = [
  { q: '¿Cuánto sale la entrada?',      a: 'El precio de entrada varía por torneo. Lo ves cuando te querés inscribir. Generalmente desde $5.000.' },
  { q: '¿Cómo pago?',                   a: 'Por transferencia bancaria (acreditación hasta 48hs hábiles) o efectivo según disponibilidad. Te coordinamos por WhatsApp.' },
  { q: '¿Cuándo cobro si gano?',        a: 'El premio se acredita dentro de las 48hs hábiles de finalizado el torneo. Transferencia o efectivo.' },
  { q: '¿Qué pasa si no puedo jugar?',  a: 'No hay devoluciones, pero podés ceder tu lugar a otra persona antes de que cierren las inscripciones.' },
  { q: '¿Cómo me anoto?',              a: 'Hacé clic en "Inscribirme" en el torneo que te interese, completá el formulario y coordiná el pago por WhatsApp.' },
  { q: '¿Cómo sé cuánto es el premio?', a: 'El premio se determina al cerrar las inscripciones. A más jugadores, más grande es el pozo.' },
];

function setupChat() {
  const msgs = document.getElementById('chatMessages');
  const faqs = document.getElementById('chatFaqs');
  if (!msgs || !faqs) return;

  addChatMsg('bot', '¡Hola! 👋 Soy el asistente de <strong>Nexus Arena</strong>. ¿En qué te puedo ayudar?');
  setTimeout(() => addChatMsg('bot', 'Elegí una pregunta frecuente o escribí lo que necesitás 👇'), 800);

  faqs.innerHTML = FAQ.map((f, i) =>
    `<button class="chat-faq-btn" onclick="answerFaq(${i})">${f.q}</button>`
  ).join('');
}

window.answerFaq = function(idx) {
  addChatMsg('user', FAQ[idx].q);
  setTimeout(() => addChatMsg('bot', FAQ[idx].a), 500);
};

window.sendChatMsg = async function() {
  const input = document.getElementById('chatInput');
  const msg   = input?.value.trim();
  if (!msg) return;

  input.value = '';
  addChatMsg('user', msg);

  const match = FAQ.find(f =>
    f.q.toLowerCase().split(' ').some(w => w.length > 3 && msg.toLowerCase().includes(w))
  );

  if (match) {
    setTimeout(() => addChatMsg('bot', match.a), 600);
  } else {
    setTimeout(() => addChatMsg('bot', 'Entendido 👀 Conectando con un operador de <strong>Nexus Arena</strong>... aguardá un momento en el chat.'), 600);

    setTimeout(async () => {
      try {
        await addDoc(collection(db, 'chat_mensajes'), {
          texto: msg, fecha: serverTimestamp(), respondido: false, leido: false,
        });
      } catch (e) { /* silencioso */ }
    }, 800);

    setTimeout(() => {
      try {
        const unsub = onSnapshot(collection(db, 'chat_mensajes'), snap => {
          snap.docChanges().forEach(change => {
            if (change.type === 'modified') {
              const d = change.doc.data();
              if (d.respuesta && !d.respuesta_mostrada) {
                addChatMsg('operator', `<strong>Nexus Arena:</strong> ${d.respuesta}`);
                updateDoc(change.doc.ref, { respuesta_mostrada: true }).catch(() => {});
                unsub();
              }
            }
          });
        });
      } catch (e) { /* silencioso */ }
    }, 1000);
  }
};

function addChatMsg(type, html) {
  const msgs = document.getElementById('chatMessages');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = `chat-msg ${type}`;
  div.innerHTML = html;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

window.toggleChat = function() {
  const widget = document.getElementById('chatWidget');
  if (!widget) return;
  chatOpen = !chatOpen;
  widget.classList.toggle('open', chatOpen);
  if (chatOpen) {
    document.getElementById('chatUnread').style.display = 'none';
    document.getElementById('chatInput')?.focus();
  }
};

// ── FILTERS ──────────────────────────────────────────────────
function setupFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      renderTorneos();
    });
  });
}

// ── NAV ──────────────────────────────────────────────────────
function setupNav() {
  window.addEventListener('scroll', () => {
    document.getElementById('nav')?.classList.toggle('scrolled', window.scrollY > 50);
  });
}

window.scrollToId = function(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
};

// ── EQUIPO TOGGLE ────────────────────────────────────────────
window.toggleEquipoInput = function(val) {
  const group = document.getElementById('inputEquipoGroup');
  if (group) group.style.display = val === 'con' ? 'block' : 'none';
};

// ── COPY ALIAS ───────────────────────────────────────────────
window.copyAlias = function() {
  const el = document.getElementById('modalAlias');
  if (!el) return;
  navigator.clipboard.writeText(el.textContent).then(() => {
    const btn = document.querySelector('.modal-alias-copy');
    if (btn) { btn.textContent = '¡Copiado!'; setTimeout(() => btn.textContent = 'Copiar', 1500); }
  }).catch(() => {});
};
