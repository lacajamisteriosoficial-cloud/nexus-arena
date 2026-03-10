// ============================================================
//  NEXUS ARENA — app.js (página pública)
// ============================================================

import { db } from './firebase.js';
import {
  collection, getDocs, addDoc, doc, updateDoc,
  query, orderBy, where, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ── TU NÚMERO DE WHATSAPP (con código de país, sin +) ──────
const WA_NUMBER = "5491100000000"; // 🔴 Cambiá este número

// ── Estado global ───────────────────────────────────────────
let torneos = [];
let selectedTorneo = null;
let activeFilter = 'all';

// ── Inicializar ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadTorneos();
  setupFilters();
  setupModal();
  setupNav();
});

// ── Cargar torneos desde Firebase ───────────────────────────
async function loadTorneos() {
  const grid      = document.getElementById('tournamentsGrid');
  const loading   = document.getElementById('loadingState');
  const emptyEl   = document.getElementById('emptyState');

  try {
    const q = query(
      collection(db, 'torneos'),
      orderBy('fecha', 'asc')
    );
    const snap = await getDocs(q);

    torneos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Filtrar solo torneos no finalizados para el contador del hero
    const activos = torneos.filter(t => t.estado !== 'finished');
    const totalInscrip = torneos.reduce((sum, t) => sum + (t.cupos_ocupados || 0), 0);

    updateHeroStats(activos.length, totalInscrip);

    loading.style.display = 'none';

    if (torneos.length === 0) {
      emptyEl.style.display = 'block';
      return;
    }

    grid.style.display = 'grid';
    renderTorneos(torneos);

  } catch (err) {
    console.error('Error cargando torneos:', err);
    loading.innerHTML = '<p style="color:var(--muted)">Error al cargar torneos. Recargá la página.</p>';
  }
}

// ── Renderizar tarjetas ──────────────────────────────────────
function renderTorneos(lista) {
  const grid = document.getElementById('tournamentsGrid');
  const filtered = activeFilter === 'all'
    ? lista
    : lista.filter(t => (t.categoria || '').includes(activeFilter));

  if (filtered.length === 0) {
    grid.innerHTML = '<p style="color:var(--muted);padding:40px 0">No hay torneos en esta categoría.</p>';
    return;
  }

  grid.innerHTML = filtered.map(t => buildCard(t)).join('');
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

  const platMap = {
    mobile:  '📱 Mobile',
    console: '🎮 PS5',
    pc:      '🖥 Crossplay',
  };

  const st  = statusMap[t.estado] || statusMap.soon;
  const plt = platMap[t.plataforma] || t.plataforma;

  const fillClass = pct >= 87 ? 'danger' : pct >= 60 ? 'warning' : '';

  const canJoin = t.estado === 'open' && libre > 0;
  const btnLabel = !canJoin
    ? (t.estado === 'full' ? 'Sin cupos' : t.estado === 'soon' ? 'Aún no disponible' : 'Finalizado')
    : (libre <= 3 ? `¡Últimos ${libre} cupos!` : 'Inscribirme');

  const fechaStr = t.fecha?.toDate
    ? t.fecha.toDate().toLocaleString('es-AR', { weekday:'long', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
    : t.fecha || '';

  const pozo = Math.round((t.cupos_total * t.precio) * 0.8);

  return `
    <div class="tournament-card" data-cat="${t.categoria || ''}">
      <div class="card-top">
        <div class="card-game-bg ${t.plataforma || 'console'}">${t.emoji || '🎮'}</div>
        <span class="card-status ${st.cls}">${st.label}</span>
        <span class="card-platform">${plt}</span>
        <div class="card-overlay"></div>
      </div>
      <div class="card-body">
        <div class="card-date">📅 ${fechaStr}</div>
        <div class="card-title">${t.nombre}</div>
        <div class="card-subtitle">${t.subtitulo || ''}</div>
        <div class="card-meta">
          <div class="meta-item">
            <span class="meta-label">Entrada</span>
            <span class="meta-value">$${t.precio?.toLocaleString('es-AR')}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Pozo aprox.</span>
            <span class="meta-value prize">$${pozo.toLocaleString('es-AR')}+</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Modalidad</span>
            <span class="meta-value">${t.modalidad === 'presencial' ? '🏠 Local' : '🌐 Online'}</span>
          </div>
        </div>
        <div class="slots-bar">
          <div class="slots-info">
            <span>Cupos ocupados</span>
            <span>${t.cupos_ocupados || 0} / ${t.cupos_total}</span>
          </div>
          <div class="slots-track">
            <div class="slots-fill ${fillClass}" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="card-footer">
          <button
            class="btn-inscribir ${canJoin ? 'available' : 'disabled'}"
            ${canJoin ? `onclick="openModal('${t.id}')"` : 'disabled'}
          >${btnLabel}</button>
          <button class="btn-info" title="Ver descripción" onclick="showDesc('${t.id}')">ℹ</button>
        </div>
      </div>
    </div>
  `;
}

// ── Filtros ──────────────────────────────────────────────────
function setupFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      renderTorneos(torneos);
    });
  });
}

// ── Modal de inscripción ─────────────────────────────────────
function setupModal() {
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });
  document.getElementById('btnSubmit').addEventListener('click', submitInscripcion);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

window.openModal = function(torneoId) {
  const t = torneos.find(x => x.id === torneoId);
  if (!t) return;
  selectedTorneo = t;

  const fechaStr = t.fecha?.toDate
    ? t.fecha.toDate().toLocaleString('es-AR', { weekday:'long', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
    : t.fecha || '';

  document.getElementById('modalTitle').textContent = 'INSCRIPCIÓN — ' + t.nombre.toUpperCase();
  document.getElementById('modalGame').textContent  = t.nombre;
  document.getElementById('modalDate').textContent  = fechaStr;
  document.getElementById('modalMode').textContent  = t.modalidad === 'presencial' ? 'Presencial — Villa de Mayo' : 'Online';

  document.getElementById('inputNombre').value   = '';
  document.getElementById('inputGamertag').value = '';
  document.getElementById('inputContacto').value = '';
  document.getElementById('formError').style.display = 'none';
  document.getElementById('btnSubmit').disabled = false;
  document.getElementById('btnSubmit').textContent = 'CONFIRMAR INSCRIPCIÓN →';

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
    errEl.style.display = 'block';
    return;
  }

  if (!selectedTorneo) return;

  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    // Guardar en Firestore
    await addDoc(collection(db, 'inscripciones'), {
      nombre,
      gamertag,
      contacto,
      torneo_id:     selectedTorneo.id,
      torneo_nombre: selectedTorneo.nombre,
      estado:        'pendiente',
      fecha_inscripcion: serverTimestamp(),
    });

    // Incrementar cupos ocupados
    await updateDoc(doc(db, 'torneos', selectedTorneo.id), {
      cupos_ocupados: increment(1)
    });

    closeModal();

    // Armar mensaje de WhatsApp
    const msg = `¡Hola! Quiero inscribirme al torneo de *${selectedTorneo.nombre}*.\n\n` +
                `👤 Nombre: ${nombre}\n` +
                `🎮 Gamertag: ${gamertag}\n` +
                `📞 Contacto: ${contacto}\n\n` +
                `¿Cómo coordino el pago de $${selectedTorneo.precio?.toLocaleString('es-AR')}?`;

    setTimeout(() => {
      alert(`¡Perfecto, ${nombre}! 🎮\nTe mandamos a WhatsApp para coordinar el pago y confirmar tu cupo.`);
      window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
      loadTorneos(); // Refrescar cupos
    }, 300);

  } catch (err) {
    console.error(err);
    errEl.textContent = 'Error al guardar. Intentá de nuevo.';
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'CONFIRMAR INSCRIPCIÓN →';
  }
}

window.showDesc = function(torneoId) {
  const t = torneos.find(x => x.id === torneoId);
  if (t?.descripcion) alert(t.descripcion);
};

// ── Stats hero ───────────────────────────────────────────────
function updateHeroStats(torneoCount, inscripCount) {
  const el1 = document.getElementById('statTorneos');
  const el2 = document.getElementById('statInscrip');
  if (el1) el1.textContent = torneoCount;
  if (el2) el2.textContent = inscripCount;
}

// ── Nav scroll ───────────────────────────────────────────────
function setupNav() {
  window.addEventListener('scroll', () => {
    document.getElementById('nav')?.classList.toggle('scrolled', window.scrollY > 50);
  });
}

// ── Scroll suave ─────────────────────────────────────────────
window.scrollTo = function(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
};
