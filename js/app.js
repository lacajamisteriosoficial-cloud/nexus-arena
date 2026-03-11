// ============================================================
//  NEXUS ARENA — app.js v2
// ============================================================
import { db } from './firebase.js';
import {
  collection, getDocs, addDoc, doc, updateDoc,
  query, orderBy, serverTimestamp, increment,
  onSnapshot, where
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const WA_NUMBER = "5491157687215";

// Catálogo base de juegos (se puede editar desde el admin)
const GAMES_CATALOG_DEFAULT = [
  { id:'wildrift',    nombre:'Wild Rift',     emoji:'⚔️',  imagen:'', plataforma:'mobile' },
  { id:'pubgmobile',  nombre:'PUBG Mobile',   emoji:'🔫',  imagen:'', plataforma:'mobile' },
  { id:'fortnite',    nombre:'Fortnite',      emoji:'⚡',  imagen:'', plataforma:'pc' },
  { id:'fifa23',      nombre:'FC 24 / FIFA',  emoji:'⚽',  imagen:'', plataforma:'console' },
  { id:'gangbeasts',  nombre:'Gang Beasts',   emoji:'🥊',  imagen:'', plataforma:'console' },
  { id:'rocketleague',nombre:'Rocket League', emoji:'🚗',  imagen:'', plataforma:'pc' },
  { id:'fallguys',    nombre:'Fall Guys',     emoji:'🎊',  imagen:'', plataforma:'pc' },
  { id:'freefire',    nombre:'Free Fire',     emoji:'🔥',  imagen:'', plataforma:'mobile' },
  { id:'warzone',     nombre:'Warzone',       emoji:'💥',  imagen:'', plataforma:'pc' },
  { id:'mlbb',        nombre:'MLBB',          emoji:'🧙',  imagen:'', plataforma:'mobile' },
];
let GAMES_CATALOG = [...GAMES_CATALOG_DEFAULT];

let torneos = [];
let galardones = [];
let reseñas = [];
let encuestas = [];
let activeFilter = 'all';
let selectedTorneo = null;
let promoIndex = 0;
let promoInterval = null;
let chatOpen = false;
let chatInitialized = false;

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
    document.getElementById('chatUnread').style.display = 'flex';
  }, 4000);
});

async function loadAll() {
  try {
    const [torneoSnap, galardonSnap, reseñaSnap, encuestaSnap, juegosSnap] = await Promise.all([
      getDocs(query(collection(db, 'torneos'), orderBy('fecha', 'asc'))),
      getDocs(query(collection(db, 'galardones'), orderBy('fecha', 'desc'))),
      getDocs(query(collection(db, 'resenas'), orderBy('fecha', 'desc'))),
      getDocs(query(collection(db, 'encuestas'), where('activa','==',true))),
      getDocs(collection(db, 'juegos_catalogo')),
    ]);

    torneos   = torneoSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Aplicar personalizaciones del admin al catálogo
    const juegosFirebase = {};
    juegosSnap.docs.forEach(d => { juegosFirebase[d.id] = d.data(); });
    GAMES_CATALOG = GAMES_CATALOG_DEFAULT.map(g => ({
      ...g,
      ...(juegosFirebase[g.id] || {}),
      id: g.id,
    }));
    galardones = galardonSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    reseñas   = reseñaSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.aprobada === true);
    encuestas  = encuestaSnap.docs.map(d => ({ id: d.id, ...d.data() }));

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
    console.error('Error cargando datos:', err);
    document.getElementById('loadingState').innerHTML = '<p style="color:var(--muted)">Error al cargar. Recargá la página.</p>';
  }
}

// ── GAMES GRID ───────────────────────────────────────────────
function renderGamesGrid(torneosActivos) {
  const grid = document.getElementById('gamesGrid');
  const torneosByJuego = {};
  torneosActivos.forEach(t => {
    if (t.juego_id) torneosByJuego[t.juego_id] = t;
    else {
      // fallback: match by name
      const match = GAMES_CATALOG.find(g =>
        t.nombre?.toLowerCase().includes(g.id) ||
        g.nombre.toLowerCase().includes((t.nombre||'').toLowerCase().split(' ')[0])
      );
      if (match) torneosByJuego[match.id] = t;
    }
  });

  grid.innerHTML = GAMES_CATALOG.map(game => {
    const torneo = torneosByJuego[game.id];
    const hasTorneo = torneo && (torneo.estado === 'open' || torneo.estado === 'soon');
    const hasImg = game.imagen && game.imagen.trim() !== '';
    return `
      <div class="game-card" onclick="openGameModal('${game.id}')">
        ${hasImg
          ? `<img class="game-card-img" src="${game.imagen}" alt="${game.nombre}" onerror="this.style.display='none';document.getElementById('gemoji-${game.id}').style.display='flex'">`
          : ''
        }
        <div class="game-card-emoji" id="gemoji-${game.id}" ${hasImg ? 'style="display:none"' : ''}>${game.emoji}</div>
        <div class="game-card-overlay"></div>
        <span class="game-card-badge ${hasTorneo ? 'has-torneo' : 'no-torneo'}">
          ${hasTorneo ? '🔥 Torneo activo' : 'Sin torneo'}
        </span>
        <div class="game-card-title">${game.nombre}</div>
      </div>
    `;
  }).join('');
}

window.openGameModal = function(gameId) {
  const game = GAMES_CATALOG.find(g => g.id === gameId);
  if (!game) return;

  const torneoDelJuego = torneos.filter(t =>
    t.nombre?.toLowerCase().includes(game.id) ||
    game.nombre.toLowerCase().includes((t.nombre||'').toLowerCase().split(' ')[0])
  ).filter(t => t.estado === 'open' || t.estado === 'soon');

  document.getElementById('gameModalTitle').textContent = game.nombre.toUpperCase();

  if (torneoDelJuego.length === 0) {
    document.getElementById('gameModalBody').innerHTML = `
      <div style="text-align:center;padding:20px">
        <div style="font-size:4rem;margin-bottom:16px">${game.emoji}</div>
        <p style="color:var(--muted);margin-bottom:8px">No hay torneos disponibles de <strong style="color:#fff">${game.nombre}</strong> en este momento.</p>
        <p style="color:var(--muted);font-size:0.85rem">Seguinos en Instagram o preguntá en el chat para saber cuándo viene el próximo.</p>
        <div style="margin-top:20px;display:flex;gap:10px;justify-content:center">
          <a href="#" target="_blank" class="btn-primary" style="text-decoration:none;display:inline-block">Instagram</a>
          <button class="btn-secondary" onclick="document.getElementById('gameModal').classList.remove('active');toggleChat()">Chat</button>
        </div>
      </div>
    `;
  } else {
    document.getElementById('gameModalBody').innerHTML = `
      <p style="color:var(--muted);margin-bottom:20px">Torneos disponibles para <strong style="color:var(--acid)">${game.nombre}</strong>:</p>
      ${torneoDelJuego.map(t => {
        const fechaStr = t.fecha?.toDate
          ? t.fecha.toDate().toLocaleString('es-AR', { weekday:'long', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
          : '';
        const libre = t.cupos_total - (t.cupos_ocupados || 0);
        return `
          <div style="background:var(--dark);border:1px solid var(--gray);padding:16px;margin-bottom:10px">
            <div style="color:var(--acid);font-family:'Barlow Condensed',sans-serif;font-size:0.8rem;letter-spacing:2px;margin-bottom:4px">📅 ${fechaStr}</div>
            <div style="color:#fff;font-family:'Barlow Condensed',sans-serif;font-size:1.1rem;margin-bottom:8px">${t.subtitulo||''}</div>
            <div style="display:flex;gap:12px;margin-bottom:12px">
              <span style="font-size:0.75rem;color:var(--muted);border:1px solid var(--gray);padding:2px 8px;font-family:'Barlow Condensed',sans-serif">${t.modalidad||'online'}</span>
              <span style="font-size:0.75rem;color:var(--orange);font-family:'Barlow Condensed',sans-serif">${libre} cupos libres</span>
            </div>
            <button class="btn-inscribir available" onclick="document.getElementById('gameModal').classList.remove('active');openModal('${t.id}')" style="clip-path:polygon(7px 0%,100% 0%,calc(100% - 7px) 100%,0% 100%);width:100%;padding:10px">INSCRIBIRME</button>
          </div>
        `;
      }).join('')}
    `;
  }
  document.getElementById('gameModal').classList.add('active');
};

// ── PROMO CAROUSEL ───────────────────────────────────────────
function renderPromoCarousel() {
  const abiertos = torneos.filter(t => t.estado === 'open');
  if (abiertos.length === 0) return;

  const carousel = document.getElementById('promoCarousel');
  const track    = document.getElementById('promoTrack');
  const dots     = document.getElementById('promoDots');

  carousel.style.display = 'block';

  track.innerHTML = abiertos.map(t => {
    const fechaStr = t.fecha?.toDate
      ? t.fecha.toDate().toLocaleString('es-AR', { weekday:'long', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
      : '';
    const libre = t.cupos_total - (t.cupos_ocupados || 0);
    const imgOrEmoji = t.imagen
      ? `<img class="promo-slide-img" src="${t.imagen}" alt="${t.nombre}" onerror="this.outerHTML='<div class=\\'promo-slide-emoji\\'>${t.emoji||'🎮'}</div>'">`
      : `<div class="promo-slide-emoji">${t.emoji||'🎮'}</div>`;

    return `
      <div class="promo-slide">
        ${imgOrEmoji}
        <div class="promo-slide-content">
          <div class="promo-slide-game">${t.nombre}</div>
          <div class="promo-slide-date">📅 ${fechaStr}</div>
          <div class="promo-slide-meta">
            <span class="promo-meta-tag">${t.modalidad||'online'}</span>
            <span class="promo-meta-tag">${t.plataforma||''}</span>
          </div>
          <button class="promo-slide-btn" onclick="openModal('${t.id}')">INSCRIBIRME AHORA</button>
          <div class="promo-slots">⚡ Solo quedan ${libre} cupos</div>
        </div>
      </div>
    `;
  }).join('');

  dots.innerHTML = abiertos.map((_, i) =>
    `<div class="promo-dot ${i===0?'active':''}" onclick="goToSlide(${i})"></div>`
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
  document.getElementById('promoTrack').style.transform = `translateX(-${idx * 100}%)`;
  document.querySelectorAll('.promo-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
};

// ── TORNEOS ──────────────────────────────────────────────────
function renderTorneos() {
  const grid    = document.getElementById('tournamentsGrid');
  const loading = document.getElementById('loadingState');
  const empty   = document.getElementById('emptyState');

  loading.style.display = 'none';

  if (torneos.length === 0) { empty.style.display = 'block'; return; }

  const filtered = activeFilter === 'all'
    ? torneos
    : torneos.filter(t => (t.categoria||'').includes(activeFilter));

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
    open:     { cls:'status-open',     label:'Inscripción Abierta' },
    soon:     { cls:'status-soon',     label:'Próximamente' },
    full:     { cls:'status-full',     label:'Cupos llenos' },
    finished: { cls:'status-finished', label:'Finalizado' },
  };
  const platMap = { mobile:'📱 Mobile', console:'🎮 PS5', pc:'🖥 Crossplay' };

  const st        = statusMap[t.estado] || statusMap.soon;
  const plt       = platMap[t.plataforma] || t.plataforma;
  const fillClass = pct >= 87 ? 'danger' : pct >= 60 ? 'warning' : '';
  const canJoin   = t.estado === 'open' && libre > 0;
  const btnLabel  = !canJoin
    ? (t.estado === 'full' ? 'Sin cupos' : t.estado === 'soon' ? 'Aún no disponible' : 'Finalizado')
    : (libre <= 3 ? `¡Últimos ${libre} cupos!` : 'Inscribirme');

  const fechaStr = t.fecha?.toDate
    ? t.fecha.toDate().toLocaleString('es-AR', { weekday:'long', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
    : '';

  const cardTop = t.imagen
    ? `<img src="${t.imagen}" alt="${t.nombre}" style="width:100%;height:100%;object-fit:cover;display:block" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
       <div class="card-game-bg ${t.plataforma||'console'}" style="display:none;position:absolute;inset:0">${t.emoji||'🎮'}</div>`
    : `<div class="card-game-bg ${t.plataforma||'console'}">${t.emoji||'🎮'}</div>`;

  return `
    <div class="tournament-card" data-cat="${t.categoria||''}">
      <div class="card-top" style="position:relative">
        ${cardTop}
        <span class="card-status ${st.cls}">${st.label}</span>
        <span class="card-platform">${plt}</span>
        <div class="card-overlay"></div>
      </div>
      <div class="card-body">
        <div class="card-date">📅 ${fechaStr}</div>
        <div class="card-title">${t.nombre}</div>
        <div class="card-subtitle">${t.subtitulo||''}</div>
        <div class="card-meta">
          <div class="meta-item"><span class="meta-label">Modalidad</span><span class="meta-value">${t.modalidad==='presencial'?'🏠 Local':'🌐 Online'}</span></div>
          <div class="meta-item"><span class="meta-label">Cupos libres</span><span class="meta-value" style="${libre<=3?'color:var(--red)':''}">${libre}</span></div>
        </div>
        <div class="slots-bar">
          <div class="slots-info"><span>Cupos</span><span>${t.cupos_ocupados||0} / ${t.cupos_total}</span></div>
          <div class="slots-track"><div class="slots-fill ${fillClass}" style="width:${pct}%"></div></div>
        </div>
        <div class="card-footer">
          <button class="btn-inscribir ${canJoin?'available':'disabled'}"
            ${canJoin?`onclick="openModal('${t.id}')"`:' disabled'}>${btnLabel}</button>
        </div>
      </div>
    </div>`;
}

// ── MODAL INSCRIPCIÓN ────────────────────────────────────────
function setupModal() {
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });
  document.getElementById('btnSubmit').addEventListener('click', submitInscripcion);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeReseñaModal(); } });
}

window.openModal = function(torneoId) {
  const t = torneos.find(x => x.id === torneoId);
  if (!t) return;
  selectedTorneo = t;

  const fechaStr = t.fecha?.toDate
    ? t.fecha.toDate().toLocaleString('es-AR', { weekday:'long', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
    : '';

  const libre = t.cupos_total - (t.cupos_ocupados || 0);
  const pozo  = Math.round(t.cupos_total * (t.precio||5000) * 0.8);

  document.getElementById('modalTitle').textContent   = 'INSCRIPCIÓN — ' + t.nombre.toUpperCase();
  document.getElementById('modalGame').textContent    = t.nombre;
  document.getElementById('modalDate').textContent    = fechaStr;
  document.getElementById('modalMode').textContent    = t.modalidad === 'presencial' ? 'Presencial — Villa de Mayo' : 'Online';
  document.getElementById('modalPrize').textContent   = `Pozo aprox. $${pozo.toLocaleString('es-AR')} (si se llena)`;
  document.getElementById('modalEntrada').textContent = `$${(t.precio||5000).toLocaleString('es-AR')}`;

  ['inputNombre','inputGamertag','inputContacto'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('formError').style.display  = 'none';
  document.getElementById('btnSubmit').disabled       = false;
  document.getElementById('btnSubmit').textContent    = 'CONFIRMAR INSCRIPCIÓN →';

  document.getElementById('modalOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
};

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  document.body.style.overflow = '';
  selectedTorneo = null;
}

async function submitInscripcion() {
  const nombre   = document.getElementById('inputNombre').value.trim();
  const gamertag = document.getElementById('inputGamertag').value.trim();
  const contacto = document.getElementById('inputContacto').value.trim();
  const errEl    = document.getElementById('formError');
  const btn      = document.getElementById('btnSubmit');

  errEl.style.display = 'none';
  if (!nombre || !gamertag || !contacto) {
    errEl.textContent = 'Completá todos los campos para continuar.';
    errEl.style.display = 'block'; return;
  }
  if (!selectedTorneo) return;

  btn.disabled = true; btn.textContent = 'Guardando...';

  try {
    await addDoc(collection(db, 'inscripciones'), {
      nombre, gamertag, contacto,
      torneo_id: selectedTorneo.id,
      torneo_nombre: selectedTorneo.nombre,
      estado: 'pendiente',
      fecha_inscripcion: serverTimestamp(),
    });
    await updateDoc(doc(db, 'torneos', selectedTorneo.id), { cupos_ocupados: increment(1) });

    closeModal();

    const msg = `¡Hola! Quiero inscribirme al torneo de *${selectedTorneo.nombre}*.\n\n` +
      `👤 Nombre: ${nombre}\n🎮 Gamertag: ${gamertag}\n📞 Contacto: ${contacto}\n\n` +
      `¿Cómo coordino el pago de $${(selectedTorneo.precio||5000).toLocaleString('es-AR')}?`;

    setTimeout(() => {
      alert(`¡Listo, ${nombre}! 🎮\nTe mandamos a WhatsApp para coordinar el pago.`);
      window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
      loadAll();
    }, 300);
  } catch (err) {
    errEl.textContent = 'Error al guardar. Intentá de nuevo.';
    errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'CONFIRMAR INSCRIPCIÓN →';
  }
}

// ── GALARDONES ───────────────────────────────────────────────
function renderGalardones() {
  const loading = document.getElementById('galardonesLoading');
  const grid    = document.getElementById('galardonesGrid');
  const empty   = document.getElementById('galardonesEmpty');

  loading.style.display = 'none';

  if (galardones.length === 0) { empty.style.display = 'block'; return; }

  grid.style.display = 'grid';
  grid.innerHTML = galardones.map((g, i) => {
    const fechaStr = g.fecha?.toDate
      ? g.fecha.toDate().toLocaleDateString('es-AR', { day:'numeric', month:'long', year:'numeric' })
      : g.fecha || '';

    const fotoHtml = g.foto
      ? `<img class="galardon-foto" src="${g.foto}" alt="${g.gamertag}" onerror="this.outerHTML='<div class=\\'galardon-foto-default\\'>${g.gamertag?.charAt(0)||'?'}</div>'">`
      : `<div class="galardon-foto-default">${g.gamertag?.charAt(0)||'?'}</div>`;

    const bgHtml = g.bg_imagen
      ? `<img class="galardon-bg" src="${g.bg_imagen}" alt="">`
      : `<div class="galardon-bg-default">${g.juego_emoji||'🎮'}</div>`;

    return `
      <div class="galardon-card ${i===0?'featured':''}">
        <div class="galardon-top">
          ${bgHtml}
          <div class="galardon-overlay"></div>
          <div class="galardon-crown">${i===0?'👑':'🏅'}</div>
          ${fotoHtml}
        </div>
        <div class="galardon-body">
          <div class="galardon-torneo">${g.torneo_nombre||''}</div>
          <div class="galardon-name">${g.gamertag||''}</div>
          <div class="galardon-fecha">${fechaStr}</div>
          <div class="galardon-stars">★★★★★</div>
          <div class="galardon-badge-wrap">
            <span class="galardon-badge">🏆 CAMPEÓN</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ── RESEÑAS ──────────────────────────────────────────────────
function renderReseñas() {
  const grid = document.getElementById('resenasGrid');

  if (reseñas.length === 0) {
    grid.innerHTML = '<div class="resena-empty">Aún no hay reseñas. ¡Sé el primero en comentar!</div>';
    return;
  }

  grid.innerHTML = reseñas.map(r => {
    const stars = '★'.repeat(r.estrellas||5) + '☆'.repeat(5-(r.estrellas||5));
    const fechaStr = r.fecha?.toDate
      ? r.fecha.toDate().toLocaleDateString('es-AR')
      : '';
    return `
      <div class="resena-card">
        <div class="resena-header">
          <div><div class="resena-autor">${r.nombre}</div><div class="resena-juego">${r.juego}</div></div>
          <div class="resena-stars">${stars}</div>
        </div>
        <div class="resena-texto">${r.texto}</div>
        <div class="resena-fecha">${fechaStr}</div>
      </div>
    `;
  }).join('');
}

window.openReseñaModal = function() {
  document.getElementById('reseñaModal').classList.add('active');
  document.body.style.overflow = 'hidden';
};

window.closeReseñaModal = function() {
  document.getElementById('reseñaModal').classList.remove('active');
  document.body.style.overflow = '';
};

function setupReseñaModal() {
  document.querySelectorAll('#starRating .star').forEach(star => {
    star.addEventListener('click', () => {
      const val = parseInt(star.dataset.val);
      document.getElementById('reseñaStars').value = val;
      document.querySelectorAll('#starRating .star').forEach((s,i) => {
        s.classList.toggle('active', i < val);
      });
    });
  });
}

window.submitReseña = async function() {
  const nombre  = document.getElementById('reseñaNombre').value.trim();
  const juego   = document.getElementById('reseñaJuego').value.trim();
  const stars   = parseInt(document.getElementById('reseñaStars').value);
  const texto   = document.getElementById('reseñaTexto').value.trim();
  const errEl   = document.getElementById('reseñaError');

  errEl.style.display = 'none';
  if (!nombre || !juego || !texto || stars === 0) {
    errEl.textContent = 'Completá todos los campos y elegí una puntuación.';
    errEl.style.display = 'block'; return;
  }

  try {
    await addDoc(collection(db, 'resenas'), {
      nombre, juego, texto, estrellas: stars,
      fecha: serverTimestamp(), aprobada: false,
    });
    closeReseñaModal();
    alert('¡Gracias por tu reseña! Se publicará una vez que sea revisada.');
  } catch (err) {
    errEl.textContent = 'Error al enviar. Intentá de nuevo.';
    errEl.style.display = 'block';
  }
};

// ── ENCUESTAS ────────────────────────────────────────────────
function renderEncuestas() {
  const container = document.getElementById('encuestasContainer');

  if (encuestas.length === 0) {
    container.innerHTML = '<div class="encuesta-empty"><p style="color:var(--muted)">No hay encuestas activas en este momento.</p></div>';
    return;
  }

  container.innerHTML = `<div class="encuestas-grid">${encuestas.map(e => buildEncuesta(e)).join('')}</div>`;
}

function buildEncuesta(e) {
  const total = (e.opciones||[]).reduce((s, o) => s + (o.votos||0), 0);
  const voted = localStorage.getItem('voted_' + e.id);

  const opcionesHtml = (e.opciones||[]).map((op, idx) => {
    const pct = total > 0 ? Math.round((op.votos||0)/total*100) : 0;
    return `
      <div class="encuesta-opcion ${voted?'voted':''}" onclick="${!voted?`votarEncuesta('${e.id}',${idx})`:''}">
        <div class="encuesta-opcion-fill" style="width:${voted?pct:0}%"></div>
        <div class="encuesta-opcion-text">
          <span>${op.texto}</span>
          ${voted?`<span class="encuesta-pct">${pct}%</span>`:''}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="encuesta-card" id="encuesta-${e.id}">
      <div class="encuesta-pregunta">${e.pregunta}</div>
      <div class="encuesta-opciones">${opcionesHtml}</div>
      <div class="encuesta-total">${total} voto${total!==1?'s':''}</div>
    </div>
  `;
}

window.votarEncuesta = async function(encuestaId, opcionIdx) {
  if (localStorage.getItem('voted_' + encuestaId)) return;
  try {
    const encuesta = encuestas.find(e => e.id === encuestaId);
    if (!encuesta) return;
    const opciones = [...encuesta.opciones];
    opciones[opcionIdx].votos = (opciones[opcionIdx].votos||0) + 1;
    await updateDoc(doc(db, 'encuestas', encuestaId), { opciones });
    localStorage.setItem('voted_' + encuestaId, '1');
    encuesta.opciones = opciones;
    renderEncuestas();
  } catch (err) { console.error(err); }
};

// ── POPUP PROMO ──────────────────────────────────────────────
function maybeShowPopup() {
  const abiertos = torneos.filter(t => t.estado === 'open');
  if (abiertos.length === 0) return;
  if (sessionStorage.getItem('popup_shown')) return;

  const t = abiertos[0];
  const libre = t.cupos_total - (t.cupos_ocupados || 0);
  const fechaStr = t.fecha?.toDate
    ? t.fecha.toDate().toLocaleString('es-AR', { weekday:'long', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
    : '';

  const imgHtml = t.imagen
    ? `<img class="promo-popup-img" src="${t.imagen}" alt="${t.nombre}" onerror="this.outerHTML='<div class=\\'promo-popup-emoji\\'>${t.emoji||'🎮'}</div>'">`
    : `<div class="promo-popup-emoji">${t.emoji||'🎮'}</div>`;

  document.getElementById('promoPopupInner').innerHTML = `
    ${imgHtml}
    <div class="promo-popup-content">
      <div class="promo-popup-tag">🔥 Inscripciones abiertas</div>
      <div class="promo-popup-title">${t.nombre}</div>
      <div class="promo-popup-date">📅 ${fechaStr}</div>
      <div class="promo-popup-slots">⚡ Solo quedan ${libre} cupos disponibles</div>
      <button class="promo-popup-btn" onclick="closePromoPopup();openModal('${t.id}')">INSCRIBIRME AHORA →</button>
    </div>
  `;

  document.getElementById('promoPopup').style.display = 'flex';
  sessionStorage.setItem('popup_shown', '1');
}

window.closePromoPopup = function(e) {
  if (e && e.target !== document.getElementById('promoPopup') && e.target !== e.currentTarget) return;
  document.getElementById('promoPopup').style.display = 'none';
};

// ── CHAT ─────────────────────────────────────────────────────
const FAQ = [
  { q:'¿Cuánto sale la entrada?',   a:'El precio de entrada varía por torneo. Lo ves cuando te querés inscribir. Generalmente desde $5.000.' },
  { q:'¿Cómo pago?',                a:'Por transferencia bancaria (acreditación hasta 48hs hábiles) o efectivo según disponibilidad. Te coordinamos por WhatsApp.' },
  { q:'¿Cuándo cobro si gano?',     a:'El premio se acredita dentro de las 48hs hábiles de finalizado el torneo. Transferencia o efectivo.' },
  { q:'¿Qué pasa si no puedo jugar?', a:'No hay devoluciones, pero podés ceder tu lugar a otra persona antes de que cierren las inscripciones.' },
  { q:'¿Cómo me anoto?',            a:'Hacé clic en "Inscribirme" en el torneo que te interese, completá el formulario y coordiná el pago por WhatsApp.' },
  { q:'¿Cómo sé cuánto es el premio?', a:'El premio se determina al cerrar las inscripciones. A más jugadores, más grande es el pozo.' },
];

function setupChat() {
  const msgs = document.getElementById('chatMessages');
  const faqs = document.getElementById('chatFaqs');

  // Mensaje de bienvenida
  addChatMsg('bot', '¡Hola! 👋 Soy el asistente de <strong>Nexus Arena</strong>. ¿En qué te puedo ayudar?');
  setTimeout(() => addChatMsg('bot', 'Elegí una pregunta frecuente o escribí lo que necesitás 👇'), 800);

  // FAQ buttons
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
  const msg   = input.value.trim();
  if (!msg) return;

  input.value = '';
  addChatMsg('user', msg);

  // Buscar en FAQ
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
          texto: msg,
          fecha: serverTimestamp(),
          respondido: false,
          leido: false,
        });
      } catch(e) { /* silencioso */ }
    }, 800);

    // Escuchar respuesta del admin en tiempo real
    setTimeout(() => {
      try {
        const q = query(
          collection(db, 'chat_mensajes'),
          orderBy('fecha', 'desc')
        );
        const unsub = onSnapshot(q, snap => {
          snap.docChanges().forEach(change => {
            if (change.type === 'modified') {
              const d = change.doc.data();
              if (d.respuesta && !d.respuesta_mostrada) {
                addChatMsg('operator', `<strong>Nexus Arena:</strong> ${d.respuesta}`);
                updateDoc(change.doc.ref, { respuesta_mostrada: true });
                unsub();
              }
            }
          });
        });
      } catch(e) {}
    }, 1000);
  }
};

function addChatMsg(type, html) {
  const msgs = document.getElementById('chatMessages');
  const div  = document.createElement('div');
  div.className = `chat-msg ${type}`;
  div.innerHTML = html;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

window.toggleChat = function() {
  const widget = document.getElementById('chatWidget');
  chatOpen = !chatOpen;
  widget.classList.toggle('open', chatOpen);
  if (chatOpen) {
    document.getElementById('chatUnread').style.display = 'none';
    document.getElementById('chatInput').focus();
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
  document.getElementById(id)?.scrollIntoView({ behavior:'smooth' });
};
