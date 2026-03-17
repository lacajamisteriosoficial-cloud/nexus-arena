// ============================================================
//  NEXUS ARENA — admin.js (versión corregida producción)
// ============================================================

import { db, auth } from './firebase.js';
import {
  collection, getDocs, addDoc, doc, updateDoc, deleteDoc, setDoc,
  serverTimestamp, getDoc, increment
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// FIX: eliminados "query, orderBy, where" — no se usan y orderBy requiere índices
// compuestos que fallan con permission-denied para usuarios no autenticados.

// ── Estado global ────────────────────────────────────────────
let allTorneos       = [];
let allInscripciones = [];
let deleteCallback   = null;

// ── AUTH ─────────────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (user) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminPanel').style.display  = 'flex';
    initAdmin();
  } else {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('adminPanel').style.display  = 'none';
  }
});

document.getElementById('btnLogin').addEventListener('click', async () => {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';
  if (!email || !pass) {
    errEl.textContent = 'Completá email y contraseña.';
    errEl.style.display = 'block';
    return;
  }
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (err) {
    errEl.textContent = 'Email o contraseña incorrectos.';
    errEl.style.display = 'block';
  }
});

document.getElementById('btnLogout').addEventListener('click', () => signOut(auth));

document.getElementById('loginPassword').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btnLogin').click();
});

// ── INIT ─────────────────────────────────────────────────────
function initAdmin() {
  setupSidebarNav();
  loadDashboard();
  document.getElementById('adminDate').textContent =
    new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  document.getElementById('btnSaveTorneo').addEventListener('click', saveTorneo);

  const btnG = document.getElementById('btnSaveGalardon');
  if (btnG) btnG.addEventListener('click', saveGalardon);

  document.getElementById('btnConfirmDelete').addEventListener('click', () => {
    if (deleteCallback) deleteCallback();
  });
}

// ── SIDEBAR ──────────────────────────────────────────────────
function setupSidebarNav() {
  document.querySelectorAll('.sidebar-link[data-section]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      showSection(link.dataset.section);
    });
  });
}

// FIX: una sola función showSection, consolidada. El original tenía múltiples
// "patches" con _origShowSection que se pisaban en cadena y podían romper con
// imports en ciertos browsers.
window.showSection = function(name) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));

  const section = document.getElementById(`section-${name}`);
  const link    = document.querySelector(`.sidebar-link[data-section="${name}"]`);
  if (section) section.classList.add('active');
  if (link)    link.classList.add('active');

  const loaders = {
    dashboard:     loadDashboard,
    torneos:       loadAdminTorneos,
    inscripciones: loadInscripciones,
    galardones:    loadGalardones,
    resenas:       loadResenasAdmin,
    encuestas:     loadEncuestasAdmin,
    chat:          loadChatAdmin,
    catalogo:      loadCatalogo,
    config:        loadConfig,
  };
  if (loaders[name]) loaders[name]();

  if (name === 'nuevo-torneo') {
    document.getElementById('formTorneoTitle').textContent = 'Nuevo Torneo';
    document.getElementById('editTorneoId').value = '';
  }
};

// ── DASHBOARD ────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const [torneoSnap, inscripSnap] = await Promise.all([
      getDocs(collection(db, 'torneos')),
      getDocs(collection(db, 'inscripciones')),
    ]);

    allTorneos       = torneoSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    allInscripciones = inscripSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.fecha_inscripcion?.toDate?.()?.getTime() || 0) - (a.fecha_inscripcion?.toDate?.()?.getTime() || 0));

    const activos     = allTorneos.filter(t => t.estado !== 'finished').length;
    const confirmados = allInscripciones.filter(i => i.estado === 'confirmado');
    const recaudado   = confirmados.reduce((s, i) => {
      const t = allTorneos.find(x => x.id === i.torneo_id);
      return s + (t?.precio || 0);
    }, 0);
    const comision = Math.round(recaudado * 0.2);

    document.getElementById('dashTorneos').textContent   = activos;
    document.getElementById('dashInscrip').textContent   = allInscripciones.length;
    document.getElementById('dashRecaudado').textContent = `$${recaudado.toLocaleString('es-AR')}`;
    document.getElementById('dashComision').textContent  = `$${comision.toLocaleString('es-AR')}`;

    const recent = allInscripciones.slice(0, 10);
    const tbody  = document.getElementById('dashRecentBody');
    if (recent.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Sin inscripciones todavía.</td></tr>';
      return;
    }
    tbody.innerHTML = recent.map(i => `
      <tr>
        <td>${i.nombre}</td>
        <td><code style="color:var(--acid);font-size:0.8rem">${i.gamertag}</code></td>
        <td>${i.torneo_nombre}</td>
        <td>
            <div style="font-size:0.8rem">${i.whatsapp || i.contacto || ''}</div>
            <div style="font-size:0.72rem;color:var(--muted)">${i.mail || ''}</div>
            ${i.equipo_nombre ? `<div style="font-size:0.72rem;color:var(--acid)">${i.equipo_nombre}</div>` : ''}
          </td>
        <td>${badgeEstado(i.estado)}</td>
        <td>${formatFecha(i.fecha_inscripcion)}</td>
      </tr>`).join('');

  } catch (err) {
    console.error('loadDashboard error:', err);
  }
}

// ── TORNEOS ──────────────────────────────────────────────────
async function loadAdminTorneos() {
  const container = document.getElementById('torneosList');
  container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Cargando...</p></div>';
  try {
    const snap = await getDocs(collection(db, 'torneos'));
    allTorneos = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.fecha?.toDate?.()?.getTime() || 0) - (b.fecha?.toDate?.()?.getTime() || 0));

    if (allTorneos.length === 0) {
      container.innerHTML = '<p style="color:var(--muted);padding:20px 0">No hay torneos creados. <a href="#" onclick="showSection(\'nuevo-torneo\')" style="color:var(--acid)">Crear uno →</a></p>';
      return;
    }
    container.innerHTML = `<div class="admin-torneos-grid">${allTorneos.map(t => buildAdminCard(t)).join('')}</div>`;
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p style="color:var(--red)">Error al cargar torneos.</p>';
  }
}

function buildAdminCard(t) {
  const libre    = t.cupos_total - (t.cupos_ocupados || 0);
  const fechaStr = t.fecha?.toDate
    ? t.fecha.toDate().toLocaleString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : t.fecha || '—';
  const statusMap = { open: 'status-open', soon: 'status-soon', full: 'status-full', finished: 'status-finished' };
  return `
    <div class="admin-torneo-card">
      <div class="atc-header">
        <div><div class="atc-title">${t.emoji || ''} ${t.nombre}</div></div>
        <span class="card-status ${statusMap[t.estado] || ''}" style="position:static;clip-path:none;padding:3px 10px">${t.estado}</span>
      </div>
      <div class="atc-fecha">${fechaStr}</div>
      <div class="atc-meta">
        <span class="atc-tag">${t.plataforma || ''}</span>
        <span class="atc-tag">${t.modalidad || ''}</span>
        <span class="atc-tag">$${(t.precio || 0).toLocaleString('es-AR')}</span>
      </div>
      <div class="atc-slots">🎟 ${t.cupos_ocupados || 0} / ${t.cupos_total} cupos · ${libre} libres</div>
      <div style="display:flex;align-items:center;gap:8px;margin:10px 0;padding:10px;background:rgba(200,255,0,0.04);border:1px solid rgba(200,255,0,0.12)">
        <span style="font-size:0.68rem;color:var(--muted);letter-spacing:1px;white-space:nowrap">✏ CORREGIR:</span>
        <input type="number" id="fix-cupos-${t.id}" value="${t.cupos_ocupados || 0}" min="0" max="${t.cupos_total}"
          style="width:55px;background:var(--dark);border:1px solid var(--gray);color:#fff;padding:3px 6px;font-size:0.85rem;text-align:center">
        <button class="btn-tbl confirm" onclick="fixCupos('${t.id}')">✓ Aplicar</button>
        <button class="btn-tbl" onclick="sincCuposReales('${t.id}')" title="Cuenta inscriptos activos y corrige automáticamente" style="white-space:nowrap">🔄 Auto</button>
      </div>
      <div class="atc-actions">
        <button class="btn-tbl" onclick="editTorneo('${t.id}')">✏ Editar</button>
        <a class="btn-tbl" href="torneo.html?id=${t.id}" target="_blank" style="text-decoration:none;display:inline-block">🔗 Ver</a>
        <button class="btn-tbl" onclick="toggleEstado('${t.id}', '${t.estado}')">🔄 Estado</button>
        <button class="btn-tbl delete" onclick="confirmDelete('torneo', '${t.id}', '${t.nombre}')">🗑 Eliminar</button>
      </div>
    </div>`;
}

// ── INSCRIPCIONES ────────────────────────────────────────────
window.loadInscripciones = async function() {
  const tbody        = document.getElementById('inscripcionesBody');
  const filterTorneo = document.getElementById('filterTorneo').value;
  const filterEstado = document.getElementById('filterEstado').value;
  tbody.innerHTML = '<tr><td colspan="7" class="table-loading">Cargando...</td></tr>';

  try {
    const snap = await getDocs(collection(db, 'inscripciones'));
    let lista = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.fecha_inscripcion?.toDate?.()?.getTime() || 0) - (a.fecha_inscripcion?.toDate?.()?.getTime() || 0));

    await populateTorneoFilter();

    if (filterTorneo !== 'all') lista = lista.filter(i => i.torneo_id === filterTorneo);
    if (filterEstado !== 'all') lista = lista.filter(i => i.estado    === filterEstado);

    if (lista.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="table-loading">Sin resultados.</td></tr>';
      return;
    }
    tbody.innerHTML = lista.map(i => `
      <tr>
        <td>${i.nombre}</td>
        <td><code style="color:var(--acid);font-size:0.8rem">${i.gamertag}</code></td>
        <td>${i.torneo_nombre}</td>
        <td>
            <div style="font-size:0.8rem">${i.whatsapp || i.contacto || ''}</div>
            <div style="font-size:0.72rem;color:var(--muted)">${i.mail || ''}</div>
            ${i.equipo_nombre ? `<div style="font-size:0.72rem;color:var(--acid)">${i.equipo_nombre}</div>` : ''}
          </td>
        <td>${badgeEstado(i.estado)}</td>
        <td>${formatFecha(i.fecha_inscripcion)}</td>
        <td>
          <div class="tbl-actions">
            ${i.estado !== 'confirmado' ? `<button class="btn-tbl confirm" onclick="updateEstadoInscrip('${i.id}', 'confirmado')">✓ Confirmar</button>` : ''}
            ${i.estado !== 'cancelado'  ? `<button class="btn-tbl cancel"  onclick="updateEstadoInscrip('${i.id}', 'cancelado')">✕ Cancelar</button>`  : ''}
            <button class="btn-tbl delete" onclick="confirmDelete('inscripcion', '${i.id}', '${i.nombre}')">🗑</button>
          </div>
        </td>
      </tr>`).join('');
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="7" class="table-loading" style="color:var(--red)">Error al cargar.</td></tr>';
  }
};

async function populateTorneoFilter() {
  const select = document.getElementById('filterTorneo');
  if (select.children.length > 1) return;
  const snap = await getDocs(collection(db, 'torneos'));
  snap.forEach(d => {
    const opt       = document.createElement('option');
    opt.value       = d.id;
    opt.textContent = d.data().nombre;
    select.appendChild(opt);
  });
}

window.updateEstadoInscrip = async function(id, estado) {
  try {
    await updateDoc(doc(db, 'inscripciones', id), { estado });
    showToast(`Inscripción marcada como ${estado}`);
    loadInscripciones();
  } catch (err) {
    showToast('Error al actualizar', true);
  }
};

// ── FORM TORNEO ──────────────────────────────────────────────
async function saveTorneo() {
  const nombre     = document.getElementById('tNombre').value.trim();
  const subtitulo  = document.getElementById('tSubtitulo').value.trim();
  const fechaVal   = document.getElementById('tFecha').value;
  const plataforma = document.getElementById('tPlatforma').value;
  const modalidad  = document.getElementById('tModalidad').value;
  const categoria  = document.getElementById('tCategoria').value;
  const cupos      = parseInt(document.getElementById('tCupos').value);
  const precio     = parseInt(document.getElementById('tPrecio').value);
  const emoji      = document.getElementById('tEmoji').value.trim() || '';
  const estado     = document.getElementById('tEstado').value;
  const desc       = document.getElementById('tDescripcion').value.trim();
  const imagen     = document.getElementById('tImagen').value.trim();
  const editId     = document.getElementById('editTorneoId').value;
  const errEl      = document.getElementById('formTorneoError');

  errEl.style.display = 'none';
  if (!nombre || !fechaVal || !plataforma || !cupos || !precio) {
    errEl.textContent = 'Completá los campos obligatorios (*)';
    errEl.style.display = 'block';
    return;
  }

  const aliasMP  = document.getElementById('tAliasMP')?.value.trim() || '';
  const premio   = parseInt(document.getElementById('tPremio')?.value) || 0;
  const jpe      = parseInt(document.getElementById('tJugadoresPorEquipo')?.value) || 1;
  const frasePagoTitulo     = document.getElementById('tFrasePagoTitulo')?.value.trim() || '';
  const frasePagoDesc       = document.getElementById('tFrasePagoDesc')?.value.trim() || '';
  const fraseCompetirTitulo = document.getElementById('tFraseCompetirTitulo')?.value.trim() || '';
  const fraseCompetirDesc   = document.getElementById('tFraseCompetirDesc')?.value.trim() || '';

  const data = {
    nombre, subtitulo, plataforma, modalidad, categoria,
    cupos_total: cupos, precio, emoji, estado,
    descripcion: desc, imagen: imagen || '',
    fecha: new Date(fechaVal),
    alias_mp:             aliasMP,
    premio:               premio || Math.round(cupos * precio * 0.8),
    jugadores_por_equipo: jpe,
    frase_pago_titulo:      frasePagoTitulo,
    frase_pago_desc:        frasePagoDesc,
    frase_competir_titulo:  fraseCompetirTitulo,
    frase_competir_desc:    fraseCompetirDesc,
  };

  const btn = document.getElementById('btnSaveTorneo');
  btn.disabled = true; btn.textContent = 'Guardando...';

  try {
    if (editId) {
      await updateDoc(doc(db, 'torneos', editId), data);
      showToast('Torneo actualizado ✓');
    } else {
      data.cupos_ocupados = 0;
      await addDoc(collection(db, 'torneos'), data);
      showToast('Torneo creado ✓');
    }
    resetTorneoForm();
    showSection('torneos');
  } catch (err) {
    console.error(err);
    errEl.textContent = 'Error al guardar. Revisá la consola.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar torneo';
  }
}

window.editTorneo = async function(id) {
  try {
    const snap = await getDoc(doc(db, 'torneos', id));
    if (!snap.exists()) return;
    const t = snap.data();

    document.getElementById('editTorneoId').value   = id;
    document.getElementById('tNombre').value        = t.nombre || '';
    document.getElementById('tSubtitulo').value     = t.subtitulo || '';
    document.getElementById('tPlatforma').value     = t.plataforma || '';
    document.getElementById('tModalidad').value     = t.modalidad || 'online';
    document.getElementById('tCategoria').value     = t.categoria || 'console';
    document.getElementById('tCupos').value         = t.cupos_total || '';
    document.getElementById('tPrecio').value        = t.precio || 5000;
    document.getElementById('tEmoji').value         = t.emoji || '';
    document.getElementById('tEstado').value        = t.estado || 'open';
    document.getElementById('tDescripcion').value   = t.descripcion || '';
    document.getElementById('tImagen').value        = t.imagen || '';
    const aliasEl = document.getElementById('tAliasMP');
    if (aliasEl) aliasEl.value = t.alias_mp || '';
    const premioEl = document.getElementById('tPremio');
    if (premioEl) premioEl.value = t.premio || '';
    const jpeEl = document.getElementById('tJugadoresPorEquipo');
    if (jpeEl) jpeEl.value = t.jugadores_por_equipo || 1;
    const fpt  = document.getElementById('tFrasePagoTitulo');
    const fpd  = document.getElementById('tFrasePagoDesc');
    const fct  = document.getElementById('tFraseCompetirTitulo');
    const fcd  = document.getElementById('tFraseCompetirDesc');
    if (fpt) fpt.value = t.frase_pago_titulo     || '';
    if (fpd) fpd.value = t.frase_pago_desc       || '';
    if (fct) fct.value = t.frase_competir_titulo || '';
    if (fcd) fcd.value = t.frase_competir_desc   || '';
    previewImagen(t.imagen || '');

    if (t.fecha?.toDate) {
      const d     = t.fecha.toDate();
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
      document.getElementById('tFecha').value = local.toISOString().slice(0, 16);
    }

    document.getElementById('formTorneoTitle').textContent = 'Editar Torneo';
    showSection('nuevo-torneo');
  } catch (err) {
    console.error(err);
    showToast('Error al cargar torneo', true);
  }
};

window.toggleEstado = async function(id, estadoActual) {
  const estados = ['open', 'soon', 'full', 'finished'];
  const next    = estados[(estados.indexOf(estadoActual) + 1) % estados.length];
  try {
    await updateDoc(doc(db, 'torneos', id), { estado: next });
    showToast(`Estado → ${next}`);
    loadAdminTorneos();
  } catch (err) {
    showToast('Error al actualizar', true);
  }
};

window.resetTorneoForm = function() {
  ['tNombre', 'tSubtitulo', 'tFecha', 'tCupos', 'tEmoji', 'tDescripcion', 'tImagen'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('tPrecio').value    = '5000';
  document.getElementById('tPlatforma').value  = '';
  document.getElementById('tEstado').value    = 'open';
  const aliasReset = document.getElementById('tAliasMP');
  if (aliasReset) aliasReset.value = '';
  const premioReset = document.getElementById('tPremio');
  if (premioReset) premioReset.value = '';
  const jpeReset = document.getElementById('tJugadoresPorEquipo');
  if (jpeReset) jpeReset.value = '1';
  ['tFrasePagoTitulo','tFrasePagoDesc','tFraseCompetirTitulo','tFraseCompetirDesc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('editTorneoId').value = '';
  document.getElementById('formTorneoTitle').textContent = 'Nuevo Torneo';
  document.getElementById('formTorneoError').style.display = 'none';
};

// ── DELETE MODAL — FIX: una sola definición completa ─────────
// El original tenía DOS definiciones (línea ~393 y línea ~676) que se
// sobreescribían entre sí. La segunda solo manejaba algunos tipos de
// colección. Esta versión maneja todos de una sola vez.
window.confirmDelete = function(tipo, id, nombre) {
  document.getElementById('deleteTarget').textContent = `"${nombre}"`;
  document.getElementById('deleteModal').classList.add('active');

  deleteCallback = async () => {
    try {
      const colMap = {
        torneo:        'torneos',
        inscripcion:   'inscripciones',
        galardon:      'galardones',
        resena:        'resenas',
        encuesta:      'encuestas',
        chat_mensajes: 'chat_mensajes',
        juego:         'juegos_catalogo',
      };
      const colName = colMap[tipo] || tipo;

      // FIX: restar cupo al torneo si se borra inscripción pendiente o confirmada
      if (tipo === 'inscripcion') {
        try {
          const inscSnap = await getDoc(doc(db, 'inscripciones', id));
          if (inscSnap.exists()) {
            const insc = inscSnap.data();
            if (insc.estado !== 'cancelado' && insc.torneo_id) {
              await updateDoc(doc(db, 'torneos', insc.torneo_id), {
                cupos_ocupados: increment(-1),
              });
            }
          }
        } catch (e) { /* silencioso */ }
      }

      await deleteDoc(doc(db, colName, id));
      showToast('Eliminado correctamente');
      closeDeleteModal();

      const reloaders = {
        torneo:        loadAdminTorneos,
        inscripcion:   loadInscripciones,
        galardon:      loadGalardones,
        resena:        loadResenasAdmin,
        encuesta:      loadEncuestasAdmin,
        chat_mensajes: loadChatAdmin,
        juego:         loadCatalogo,
      };
      if (reloaders[tipo]) reloaders[tipo]();

    } catch (err) {
      console.error('confirmDelete error:', err);
      showToast('Error al eliminar', true);
    }
  };
};

window.closeDeleteModal = function() {
  document.getElementById('deleteModal').classList.remove('active');
  deleteCallback = null;
};

// ── PREVIEW IMAGEN ───────────────────────────────────────────
window.previewImagen = function(url) {
  const wrap   = document.getElementById('imgPreviewWrap');
  const img    = document.getElementById('imgPreview');
  const label  = document.getElementById('imgPreviewNombre');
  const nombre = document.getElementById('tNombre').value || 'Torneo';
  if (url) {
    img.src            = url;
    label.textContent  = nombre.toUpperCase();
    wrap.style.display = 'block';
    img.onerror        = () => { wrap.style.display = 'none'; };
  } else {
    wrap.style.display = 'none';
  }
};

// ── HELPERS ──────────────────────────────────────────────────
function badgeEstado(estado) {
  const map = {
    pendiente:  '<span class="badge badge-pendiente">Pendiente</span>',
    confirmado: '<span class="badge badge-confirmado">Confirmado</span>',
    cancelado:  '<span class="badge badge-cancelado">Cancelado</span>',
  };
  return map[estado] || estado;
}

function formatFecha(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function showToast(msg, isError = false) {
  const t = document.createElement('div');
  t.className   = `toast${isError ? ' error' : ''}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ── GALARDONES ───────────────────────────────────────────────
async function loadGalardones() {
  const container = document.getElementById('galardonesAdminList');
  container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Cargando...</p></div>';
  try {
    const snap  = await getDocs(collection(db, 'galardones'));
    const lista = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.fecha?.toDate?.()?.getTime() || 0) - (a.fecha?.toDate?.()?.getTime() || 0));

    if (lista.length === 0) {
      container.innerHTML = '<p style="color:var(--muted);padding:20px 0">No hay campeones registrados aún.</p>';
      return;
    }
    container.innerHTML = `<div class="admin-torneos-grid">${lista.map(g => `
      <div class="admin-torneo-card">
        <div class="atc-header">
          <div class="atc-title">${g.juego_emoji || ''} ${g.gamertag}</div>
        </div>
        <div class="atc-fecha">${g.torneo_nombre}</div>
        ${g.foto ? `<img src="${g.foto}" style="width:60px;height:60px;border-radius:50%;object-fit:cover;margin:8px 0;border:2px solid var(--acid)">` : ''}
        <div class="atc-actions">
          <button class="btn-tbl delete" onclick="confirmDelete('galardon','${g.id}','${g.gamertag}')">🗑 Eliminar</button>
        </div>
      </div>`).join('')}</div>`;
  } catch (err) {
    container.innerHTML = '<p style="color:var(--red)">Error al cargar.</p>';
  }
}

async function saveGalardon() {
  const gamertag = document.getElementById('gGamertag').value.trim();
  const torneo   = document.getElementById('gTorneo').value.trim();
  const emoji    = document.getElementById('gEmoji').value.trim() || '';
  const fechaVal = document.getElementById('gFecha').value;
  const foto     = document.getElementById('gFoto').value.trim();
  const bg       = document.getElementById('gBg').value.trim();
  const errEl    = document.getElementById('formGalardonError');

  errEl.style.display = 'none';
  if (!gamertag || !torneo) {
    errEl.textContent = 'Completá gamertag y torneo.';
    errEl.style.display = 'block';
    return;
  }
  try {
    await addDoc(collection(db, 'galardones'), {
      gamertag, torneo_nombre: torneo, juego_emoji: emoji,
      foto: foto || '', bg_imagen: bg || '',
      fecha: fechaVal ? new Date(fechaVal) : serverTimestamp(),
    });
    showToast('Campeón registrado ✓');
    ['gGamertag', 'gTorneo', 'gEmoji', 'gFecha', 'gFoto', 'gBg'].forEach(id => {
      document.getElementById(id).value = '';
    });
    showSection('galardones');
  } catch (err) {
    errEl.textContent = 'Error al guardar.';
    errEl.style.display = 'block';
  }
}

// ── RESEÑAS ──────────────────────────────────────────────────
async function loadResenasAdmin() {
  const tbody = document.getElementById('resenasAdminBody');
  tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Cargando...</td></tr>';
  try {
    const snap  = await getDocs(collection(db, 'resenas'));
    const lista = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.fecha?.toDate?.()?.getTime() || 0) - (a.fecha?.toDate?.()?.getTime() || 0));

    if (lista.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Sin reseñas.</td></tr>';
      return;
    }
    tbody.innerHTML = lista.map(r => `
      <tr>
        <td>${r.nombre}</td>
        <td>${r.juego}</td>
        <td style="color:#FFD700">${'★'.repeat(r.estrellas || 5)}</td>
        <td style="max-width:200px;font-size:0.8rem;color:var(--muted)">${(r.texto || '').substring(0, 80)}...</td>
        <td>${r.aprobada ? '<span class="badge badge-confirmado">Aprobada</span>' : '<span class="badge badge-pendiente">Pendiente</span>'}</td>
        <td><div class="tbl-actions">
          ${!r.aprobada ? `<button class="btn-tbl confirm" onclick="aprobarResena('${r.id}')">✓ Aprobar</button>` : ''}
          <button class="btn-tbl delete" onclick="confirmDelete('resena','${r.id}','${r.nombre}')">🗑</button>
        </div></td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-loading" style="color:var(--red)">Error.</td></tr>';
  }
}

window.aprobarResena = async function(id) {
  try {
    await updateDoc(doc(db, 'resenas', id), { aprobada: true });
    showToast('Reseña aprobada ✓');
    loadResenasAdmin();
  } catch (err) {
    showToast('Error', true);
  }
};

// ── ENCUESTAS ────────────────────────────────────────────────
async function loadEncuestasAdmin() {
  const container = document.getElementById('encuestasAdminList');
  container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Cargando...</p></div>';
  try {
    const snap  = await getDocs(collection(db, 'encuestas'));
    const lista = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.fecha?.toDate?.()?.getTime() || 0) - (a.fecha?.toDate?.()?.getTime() || 0));

    if (lista.length === 0) {
      container.innerHTML = '<p style="color:var(--muted);padding:20px 0">No hay encuestas. Creá una con el botón de arriba.</p>';
      return;
    }
    container.innerHTML = lista.map(e => {
      const total = (e.opciones || []).reduce((s, o) => s + (o.votos || 0), 0);
      return `
        <div class="admin-torneo-card" style="margin-bottom:2px">
          <div class="atc-header">
            <div class="atc-title">${e.pregunta}</div>
            <span class="badge ${e.activa ? 'badge-confirmado' : 'badge-cancelado'}">${e.activa ? 'Activa' : 'Inactiva'}</span>
          </div>
          ${(e.opciones || []).map(o => {
            const pct = total > 0 ? Math.round((o.votos || 0) / total * 100) : 0;
            return `<div style="margin:4px 0;font-size:0.85rem;color:var(--muted)">${o.texto} — <span style="color:var(--acid)">${o.votos || 0} votos (${pct}%)</span></div>`;
          }).join('')}
          <div style="font-size:0.75rem;color:var(--muted);margin:8px 0">${total} votos totales</div>
          <div class="atc-actions">
            <button class="btn-tbl" onclick="toggleEncuesta('${e.id}',${e.activa})">${e.activa ? '⏸ Desactivar' : '▶ Activar'}</button>
            <button class="btn-tbl delete" onclick="confirmDelete('encuesta','${e.id}','${(e.pregunta || '').substring(0, 30)}')">🗑 Eliminar</button>
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    container.innerHTML = '<p style="color:var(--red)">Error al cargar.</p>';
  }
}

window.showNuevaEncuesta = function() {
  document.getElementById('nuevaEncuestaForm').style.display = 'block';
};

window.saveEncuesta = async function() {
  const pregunta    = document.getElementById('encPregunta').value.trim();
  const opcionesRaw = document.getElementById('encOpciones').value.trim();
  const errEl       = document.getElementById('encError');
  errEl.style.display = 'none';

  if (!pregunta || !opcionesRaw) {
    errEl.textContent = 'Completá pregunta y opciones.';
    errEl.style.display = 'block';
    return;
  }
  const opciones = opcionesRaw.split('\n').filter(l => l.trim()).map(t => ({ texto: t.trim(), votos: 0 }));
  if (opciones.length < 2) {
    errEl.textContent = 'Necesitás al menos 2 opciones.';
    errEl.style.display = 'block';
    return;
  }
  try {
    await addDoc(collection(db, 'encuestas'), { pregunta, opciones, activa: true, fecha: serverTimestamp() });
    showToast('Encuesta creada ✓');
    document.getElementById('encPregunta').value = '';
    document.getElementById('encOpciones').value = '';
    document.getElementById('nuevaEncuestaForm').style.display = 'none';
    loadEncuestasAdmin();
  } catch (err) {
    errEl.textContent = 'Error al guardar.';
    errEl.style.display = 'block';
  }
};

window.toggleEncuesta = async function(id, activa) {
  try {
    await updateDoc(doc(db, 'encuestas', id), { activa: !activa });
    showToast(activa ? 'Encuesta desactivada' : 'Encuesta activada ✓');
    loadEncuestasAdmin();
  } catch (err) {
    showToast('Error', true);
  }
};

// ── CHAT ADMIN ───────────────────────────────────────────────
async function loadChatAdmin() {
  const container = document.getElementById('chatAdminList');
  container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Cargando mensajes...</p></div>';
  try {
    const snap  = await getDocs(collection(db, 'chat_mensajes'));
    const lista = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.fecha?.toDate?.()?.getTime() || 0) - (a.fecha?.toDate?.()?.getTime() || 0));

    if (lista.length === 0) {
      container.innerHTML = '<p style="color:var(--muted);padding:20px 0">No hay mensajes de usuarios.</p>';
      return;
    }
    container.innerHTML = lista.map(m => `
      <div class="admin-torneo-card" style="margin-bottom:2px;border-left:3px solid ${m.respondido ? 'var(--acid)' : 'var(--orange)'}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
          <span style="font-family:'Barlow Condensed',sans-serif;font-size:0.75rem;letter-spacing:2px;color:${m.respondido ? 'var(--acid)' : 'var(--orange)'}">${m.respondido ? 'RESPONDIDO' : 'SIN RESPONDER'}</span>
          <span style="font-size:0.75rem;color:var(--muted)">${formatFecha(m.fecha)}</span>
        </div>
        <div style="color:#fff;margin-bottom:12px;font-size:0.9rem">${m.texto}</div>
        ${m.respuesta ? `<div style="color:var(--acid);font-size:0.85rem;margin-bottom:12px">↩ ${m.respuesta}</div>` : ''}
        ${!m.respondido ? `
          <div style="display:flex;gap:8px;margin-top:8px">
            <input type="text" class="form-input" id="resp-${m.id}" placeholder="Escribí tu respuesta..." style="flex:1;clip-path:none">
            <button class="btn-admin-primary" onclick="responderChat('${m.id}')">Enviar</button>
          </div>` : ''}
        <div class="atc-actions" style="margin-top:8px">
          <button class="btn-tbl delete" onclick="confirmDelete('chat_mensajes','${m.id}','mensaje')">🗑 Borrar</button>
        </div>
      </div>`).join('');
  } catch (err) {
    container.innerHTML = '<p style="color:var(--red)">Error al cargar.</p>';
  }
}

window.responderChat = async function(id) {
  const input = document.getElementById('resp-' + id);
  const resp  = input?.value.trim();
  if (!resp) return;
  try {
    await updateDoc(doc(db, 'chat_mensajes', id), { respuesta: resp, respondido: true });
    showToast('Respuesta enviada ✓');
    loadChatAdmin();
  } catch (err) {
    showToast('Error', true);
  }
};

// ── CATÁLOGO DE JUEGOS ───────────────────────────────────────
async function loadCatalogo() {
  const grid = document.getElementById('catalogoGrid');
  grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Cargando...</p></div>';
  try {
    const snap   = await getDocs(collection(db, 'juegos_catalogo'));
    const juegos = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

    const nombres       = juegos.map(j => (j.nombre || '').toLowerCase().trim());
    const hayDuplicados = nombres.length !== new Set(nombres).size;

    if (juegos.length === 0) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:40px 0;color:var(--muted)">
          <p style="margin-bottom:16px">No hay juegos en el catálogo todavía.</p>
          <button class="btn-admin-primary" onclick="openNuevoJuego()">+ Agregar el primer juego</button>
        </div>`;
      return;
    }

    let html = juegos.map(j => buildJuegoCard(j)).join('');
    if (hayDuplicados) {
      html = `<div style="grid-column:1/-1;background:rgba(255,23,68,0.1);border:1px solid var(--red);padding:16px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
        <div><strong style="color:var(--red)">⚠️ Hay juegos duplicados en Firebase</strong><br>
        <span style="font-size:0.8rem;color:var(--muted)">Esto causa que aparezcan repetidos en la página pública.</span></div>
        <button class="btn-admin-primary" onclick="limpiarDuplicados()" style="background:var(--red);flex-shrink:0">🗑 Limpiar duplicados</button>
      </div>` + html;
    }
    grid.innerHTML = html;
  } catch (err) {
    grid.innerHTML = '<p style="color:var(--red)">Error al cargar catálogo.</p>';
    console.error(err);
  }
}

function buildJuegoCard(j) {
  const imagen = j.imagen || '';
  const emoji  = j.emoji || '';
  const nombre = j.nombre || 'Sin nombre';
  const posX   = j.posX ?? 50;
  const posY   = j.posY ?? 50;
  const zoom   = j.zoom  ?? 100;

  const previewStyle = imagen
    ? `background:url('${imagen}') ${posX}% ${posY}% / ${zoom}% auto no-repeat; height:160px; border-bottom:1px solid var(--gray);`
    : `height:160px; background:var(--dark); display:flex; align-items:center; justify-content:center; font-size:3.5rem; border-bottom:1px solid var(--gray);`;

  return `
    <div class="admin-torneo-card" id="jcard-${j.id}" style="padding:0;overflow:hidden">
      <div id="jpreview-${j.id}" style="${previewStyle}">${imagen ? '' : emoji}</div>
      <div style="padding:14px">
        <div class="form-group" style="margin-bottom:8px">
          <label class="form-label" style="font-size:0.6rem">Nombre</label>
          <input type="text" class="form-input" id="jnombre-${j.id}" value="${nombre}">
        </div>
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <div class="form-group" style="flex:1;margin-bottom:0">
            <label class="form-label" style="font-size:0.6rem">Emoji</label>
            <input type="text" class="form-input" id="jemoji-${j.id}" value="${emoji}" maxlength="4">
          </div>
          <div class="form-group" style="flex:2;margin-bottom:0">
            <label class="form-label" style="font-size:0.6rem">Plataforma</label>
            <select class="form-input form-select" id="jplat-${j.id}">
              <option value="mobile"  ${j.plataforma === 'mobile'  ? 'selected' : ''}>Mobile</option>
              <option value="console" ${j.plataforma === 'console' ? 'selected' : ''}>Consola</option>
              <option value="pc"      ${j.plataforma === 'pc'      ? 'selected' : ''}>PC</option>
              <option value="cross"   ${j.plataforma === 'cross'   ? 'selected' : ''}>Crossplay</option>
            </select>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:8px">
          <label class="form-label" style="font-size:0.6rem">URL de portada</label>
          <input type="text" class="form-input" id="jimagen-${j.id}" value="${imagen}" placeholder="https://i.imgur.com/..."
            oninput="livePreviewJuego('${j.id}')">
        </div>
        ${imagen ? `
        <div class="img-editor-controls">
          <span class="img-editor-label">↔ POS X</span>
          <input type="range" class="img-slider" id="jposX-${j.id}" min="0" max="100" value="${posX}" oninput="livePreviewJuego('${j.id}')">
          <span class="img-editor-label">↕ POS Y</span>
          <input type="range" class="img-slider" id="jposY-${j.id}" min="0" max="100" value="${posY}" oninput="livePreviewJuego('${j.id}')">
        </div>
        <div class="img-editor-controls">
          <span class="img-editor-label">🔍 ZOOM</span>
          <input type="range" class="img-slider" id="jzoom-${j.id}" min="50" max="200" value="${zoom}" oninput="livePreviewJuego('${j.id}')">
          <button class="img-editor-btn" onclick="resetImgEditor('${j.id}')">Reset</button>
        </div>` : ''}
        <div class="atc-actions" style="margin-top:8px">
          <button class="btn-tbl confirm" onclick="saveJuego('${j.id}')">💾 Guardar</button>
          <button class="btn-tbl delete" onclick="confirmDelete('juego','${j.id}','${nombre}')">🗑 Eliminar</button>
        </div>
      </div>
    </div>`;
}

window.livePreviewJuego = function(id) {
  const img  = document.getElementById('jimagen-' + id)?.value.trim() || '';
  const posX = document.getElementById('jposX-'   + id)?.value ?? 50;
  const posY = document.getElementById('jposY-'   + id)?.value ?? 50;
  const zoom = document.getElementById('jzoom-'   + id)?.value ?? 100;
  const prev = document.getElementById('jpreview-' + id);
  if (!prev) return;
  if (img) {
    prev.style.cssText = `background:url('${img}') ${posX}% ${posY}% / ${zoom}% auto no-repeat; height:160px; border-bottom:1px solid var(--gray);`;
    prev.textContent = '';
  } else {
    const emoji = document.getElementById('jemoji-' + id)?.value || '';
    prev.style.cssText = `height:160px; background:var(--dark); display:flex; align-items:center; justify-content:center; font-size:3.5rem; border-bottom:1px solid var(--gray);`;
    prev.textContent = emoji;
  }
};

window.resetImgEditor = function(id) {
  const posX = document.getElementById('jposX-' + id);
  const posY = document.getElementById('jposY-' + id);
  const zoom = document.getElementById('jzoom-' + id);
  if (posX) posX.value = 50;
  if (posY) posY.value = 50;
  if (zoom) zoom.value = 100;
  livePreviewJuego(id);
};

window.saveJuego = async function(id) {
  const nombre     = document.getElementById('jnombre-' + id)?.value.trim();
  const emoji      = document.getElementById('jemoji-'  + id)?.value.trim();
  const imagen     = document.getElementById('jimagen-' + id)?.value.trim();
  const plataforma = document.getElementById('jplat-'   + id)?.value;
  const posX       = parseInt(document.getElementById('jposX-' + id)?.value ?? 50);
  const posY       = parseInt(document.getElementById('jposY-' + id)?.value ?? 50);
  const zoom       = parseInt(document.getElementById('jzoom-' + id)?.value ?? 100);

  if (!nombre) { showToast('El nombre es obligatorio', true); return; }
  try {
    await setDoc(doc(db, 'juegos_catalogo', id), { nombre, emoji, imagen, plataforma, posX, posY, zoom });
    showToast(`${nombre} guardado ✓`);
    loadCatalogo();
  } catch (err) {
    console.error(err);
    showToast('Error al guardar', true);
  }
};

window.limpiarDuplicados = async function() {
  if (!confirm('¿Eliminar todos los juegos duplicados? Se mantiene uno por nombre.')) return;
  try {
    const snap   = await getDocs(collection(db, 'juegos_catalogo'));
    const juegos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const vistos = {};
    const aEliminar = [];
    juegos.forEach(j => {
      const key = (j.nombre || '').toLowerCase().trim();
      if (!vistos[key]) {
        vistos[key] = j;
      } else {
        const actual = vistos[key];
        if (!actual.imagen && j.imagen) { aEliminar.push(actual.id); vistos[key] = j; }
        else { aEliminar.push(j.id); }
      }
    });
    await Promise.all(aEliminar.map(id => deleteDoc(doc(db, 'juegos_catalogo', id))));
    showToast(`${aEliminar.length} duplicados eliminados ✓`);
    loadCatalogo();
  } catch (err) {
    console.error(err);
    showToast('Error al limpiar', true);
  }
};

window.openNuevoJuego = function() {
  document.getElementById('nuevoJuegoModal').classList.add('active');
  document.body.style.overflow = 'hidden';
  ['njNombre', 'njEmoji', 'njImagen'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const plat = document.getElementById('njPlat');
  if (plat) plat.value = 'mobile';
  document.getElementById('njError').style.display = 'none';
};

window.closeNuevoJuego = function() {
  document.getElementById('nuevoJuegoModal').classList.remove('active');
  document.body.style.overflow = '';
};

window.saveNuevoJuego = async function() {
  const nombre     = document.getElementById('njNombre')?.value.trim();
  const emoji      = document.getElementById('njEmoji')?.value.trim() || '';
  const imagen     = document.getElementById('njImagen')?.value.trim() || '';
  const plataforma = document.getElementById('njPlat')?.value || 'mobile';
  const errEl      = document.getElementById('njError');

  errEl.style.display = 'none';
  if (!nombre) { errEl.textContent = 'El nombre es obligatorio.'; errEl.style.display = 'block'; return; }

  const id = nombre.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20) + '_' + Date.now().toString(36);
  try {
    await setDoc(doc(db, 'juegos_catalogo', id), { nombre, emoji, imagen, plataforma });
    showToast(`${nombre} agregado ✓`);
    closeNuevoJuego();
    loadCatalogo();
  } catch (err) {
    console.error(err);
    errEl.textContent = 'Error al guardar. Intentá de nuevo.';
    errEl.style.display = 'block';
  }
};

// ── CONFIG / TICKER ──────────────────────────────────────────
async function loadConfig() {
  // Delegar en loadConfigSection que ya tiene toda la lógica
  loadConfigSection();
}

window.saveTicker = async function() {
  const raw   = document.getElementById('tickerItems')?.value || '';
  const items = raw.split('\n').map(s => s.trim()).filter(Boolean);
  if (items.length === 0) { showToast('Agregá al menos un item', true); return; }
  try {
    await setDoc(doc(db, 'config', 'ticker'), { items });
    showToast('Ticker guardado ✓');
  } catch (err) {
    showToast('Error al guardar', true);
    console.error(err);
  }
};

// ── CONFIG HOMEPAGE ─────────────────────────────────────────
window.saveHomepage = async function() {
  const data = {
    hero_badge:     document.getElementById('cfgHeroBadge')?.value.trim()    || '',
    hero_sub:       document.getElementById('cfgHeroSub')?.value.trim()      || '',
    hero_cta1:      document.getElementById('cfgHeroCta1')?.value.trim()     || '',
    hero_cta2:      document.getElementById('cfgHeroCta2')?.value.trim()     || '',
    footer_tagline: document.getElementById('cfgFooterTagline')?.value.trim()|| '',
  };
  try {
    await setDoc(doc(db, 'config', 'homepage'), data);
    showToast('Homepage guardada ✓');
  } catch (err) {
    showToast('Error al guardar', true);
    console.error(err);
  }
};

// ── CONFIG SECCIONES ─────────────────────────────────────────
window.saveSecciones = async function() {
  const data = {
    juegos:        document.getElementById('secJuegos')?.checked       ?? true,
    torneos:       document.getElementById('secTorneos')?.checked      ?? true,
    galardones:    document.getElementById('secGalardones')?.checked   ?? true,
    resenas:       document.getElementById('secResenas')?.checked      ?? true,
    encuestas:     document.getElementById('secEncuestas')?.checked    ?? true,
    como_funciona: document.getElementById('secComoFunciona')?.checked ?? true,
    reglas:        document.getElementById('secReglas')?.checked       ?? true,
  };
  try {
    await setDoc(doc(db, 'config', 'secciones'), data);
    showToast('Secciones guardadas ✓');
  } catch (err) {
    showToast('Error al guardar', true);
    console.error(err);
  }
};

// Carga los valores actuales de config al entrar a la sección
async function loadConfigSection() {
  try {
    const safe = p => p.catch(() => null);
    const [hpSnap, secSnap, tickerSnap] = await Promise.all([
      safe(getDoc(doc(db, 'config', 'homepage'))),
      safe(getDoc(doc(db, 'config', 'secciones'))),
      safe(getDoc(doc(db, 'config', 'ticker'))),
    ]);

    if (hpSnap && hpSnap.exists()) {
      const hp = hpSnap.data();
      const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
      set('cfgHeroBadge',     hp.hero_badge);
      set('cfgHeroSub',       hp.hero_sub);
      set('cfgHeroCta1',      hp.hero_cta1);
      set('cfgHeroCta2',      hp.hero_cta2);
      set('cfgFooterTagline', hp.footer_tagline);
    }

    if (secSnap && secSnap.exists()) {
      const sec = secSnap.data();
      const setChk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val !== false; };
      setChk('secJuegos',       sec.juegos);
      setChk('secTorneos',      sec.torneos);
      setChk('secGalardones',   sec.galardones);
      setChk('secResenas',      sec.resenas);
      setChk('secEncuestas',    sec.encuestas);
      setChk('secComoFunciona', sec.como_funciona);
      setChk('secReglas',       sec.reglas);
    }

    if (tickerSnap && tickerSnap.exists()) {
      const el = document.getElementById('tickerItems');
      if (el) el.value = (tickerSnap.data().items || []).join('\n');
    }
  } catch (err) {
    console.error('loadConfigSection error:', err);
  }
}

// ── CORRECCIÓN MANUAL DE CUPOS ───────────────────────────────

// Aplica el número que escribiste manualmente en el input
window.fixCupos = async function(torneoId) {
  const input = document.getElementById('fix-cupos-' + torneoId);
  const valor = parseInt(input?.value);
  if (isNaN(valor) || valor < 0) { showToast('Valor inválido', true); return; }
  try {
    await updateDoc(doc(db, 'torneos', torneoId), { cupos_ocupados: valor });
    showToast('Cupos corregidos a ' + valor + ' ✓');
    loadAdminTorneos();
  } catch (err) {
    console.error(err);
    showToast('Error al corregir cupos', true);
  }
};

// Cuenta los inscriptos activos (no cancelados) en Firestore y sincroniza automáticamente
window.sincCuposReales = async function(torneoId) {
  try {
    const snap = await getDocs(collection(db, 'inscripciones'));
    const activos = snap.docs
      .map(d => d.data())
      .filter(i => i.torneo_id === torneoId && i.estado !== 'cancelado')
      .length;
    await updateDoc(doc(db, 'torneos', torneoId), { cupos_ocupados: activos });
    showToast('Sincronizado: ' + activos + ' inscripto' + (activos !== 1 ? 's' : '') + ' activo' + (activos !== 1 ? 's' : '') + ' ✓');
    loadAdminTorneos();
  } catch (err) {
    console.error(err);
    showToast('Error al sincronizar', true);
  }
};
