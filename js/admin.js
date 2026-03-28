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
    jugadores:     loadJugadores,
    ranking:       loadRanking,
    temporadas:    loadTemporadas,
  };
  if (loaders[name]) loaders[name]();

  // Solo resetear el form si NO viene de editTorneo() — en ese caso el id ya fue seteado
  if (name === 'nuevo-torneo' && !window._editandoTorneo) {
    document.getElementById('formTorneoTitle').textContent = 'Nuevo Torneo';
    document.getElementById('editTorneoId').value = '';
  }
  window._editandoTorneo = false;
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
        <span class="atc-tag">${t.precio === 0 ? 'GRATIS' : '$' + (t.precio || 0).toLocaleString('es-AR')}</span>
      </div>
      <div class="atc-slots">🎟 ${t.cupos_ocupados || 0} / ${t.cupos_total} cupos · ${libre} libres</div>
      <div style="display:flex;align-items:center;gap:8px;margin:10px 0;padding:10px;background:rgba(200,255,0,0.04);border:1px solid rgba(200,255,0,0.12)">
        <span style="font-size:0.68rem;color:var(--muted);letter-spacing:1px;white-space:nowrap">CORREGIR:</span>
        <input type="number" id="fix-cupos-${t.id}" value="${t.cupos_ocupados || 0}" min="0" max="${t.cupos_total}"
          style="width:55px;background:var(--dark);border:1px solid var(--gray);color:#fff;padding:3px 6px;font-size:0.85rem;text-align:center">
        <button class="btn-tbl confirm" onclick="fixCupos('${t.id}')">✓ Aplicar</button>
        <button class="btn-tbl" onclick="sincCuposReales('${t.id}')" title="Cuenta inscriptos activos y corrige automáticamente" style="white-space:nowrap">Auto</button>
      </div>
      <div class="atc-actions">
        <button class="btn-tbl" onclick="editTorneo('${t.id}')">Editar</button>
        <a class="btn-tbl" href="torneo.html?id=${t.id}" target="_blank" style="text-decoration:none;display:inline-block">Ver</a>
        <button class="btn-tbl" onclick="abrirBracketAdmin('${t.id}', '${t.nombre}')">Bracket</button>
        <button class="btn-tbl" onclick="toggleEstado('${t.id}', '${t.estado}')">Estado</button>
        <button class="btn-tbl" onclick="generarFlyerTorneo('${t.id}')" title="Generar imagen 1200x630 para compartir en Facebook">Flyer</button>
        <button class="btn-tbl delete" onclick="confirmDelete('torneo', '${t.id}', '${t.nombre}')">Eliminar</button>
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
            <button class="btn-tbl delete" onclick="confirmDelete('inscripcion', '${i.id}', '${i.nombre}')">Eliminar</button>
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
  const precioRaw  = document.getElementById('tPrecio').value;
  const precio     = precioRaw === '' ? 0 : (parseInt(precioRaw) || 0);
  const emoji      = document.getElementById('tEmoji').value.trim() || '';
  const estado     = document.getElementById('tEstado').value;
  const desc       = document.getElementById('tDescripcion').value.trim();
  const imagen     = document.getElementById('tImagen').value.trim();
  const editId     = document.getElementById('editTorneoId').value;
  const errEl      = document.getElementById('formTorneoError');

  errEl.style.display = 'none';
  if (!nombre || !fechaVal || !plataforma || !cupos) {
    errEl.textContent = 'Completá los campos obligatorios (*)';
    errEl.style.display = 'block';
    return;
  }

  const aliasMP  = document.getElementById('tAliasMP')?.value.trim() || '';
  const premio   = parseInt(document.getElementById('tPremio')?.value) || 0;
  const jpe      = parseInt(document.getElementById('tJugadoresPorEquipo')?.value) || 1;
  const fotoEquipo = document.getElementById('tFotoEquipo')?.value.trim() || '';
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
    premio:               precio === 0 ? 0 : (premio || Math.round(cupos * precio * 0.8)),
    jugadores_por_equipo: jpe,
    foto_equipo:          fotoEquipo,
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
    document.getElementById('tPrecio').value        = (t.precio !== undefined ? t.precio : 0);
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
    const fotoEquipoEl = document.getElementById('tFotoEquipo');
    if (fotoEquipoEl) { fotoEquipoEl.value = t.foto_equipo || ''; previewFotoEquipo(t.foto_equipo || ''); }
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
    window._editandoTorneo = true;
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
  document.getElementById('tPrecio').value    = '0';
  document.getElementById('tPlatforma').value  = '';
  document.getElementById('tEstado').value    = 'open';
  const aliasReset = document.getElementById('tAliasMP');
  if (aliasReset) aliasReset.value = '';
  const premioReset = document.getElementById('tPremio');
  if (premioReset) premioReset.value = '';
  const jpeReset = document.getElementById('tJugadoresPorEquipo');
  if (jpeReset) jpeReset.value = '1';
  const fotoEquipoReset = document.getElementById('tFotoEquipo');
  if (fotoEquipoReset) { fotoEquipoReset.value = ''; previewFotoEquipo(''); }
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
        jugador:       'jugadores',
        temporada:     'temporadas',
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
        jugador:       loadJugadores,
        temporada:     loadTemporadas,
      };
      if (reloaders[tipo]) reloaders[tipo]();

    } catch (err) {
      console.error('confirmDelete error:', err);
      showToast('Error al eliminar', true);
    }
  };
};

// Helper para botones con data-attributes (evita escaping de comillas)
window.confirmDeleteFromBtn = function(btn) {
  const tipo   = btn.dataset.tipo;
  const id     = btn.dataset.id;
  const nombre = btn.dataset.nombre || '';
  confirmDelete(tipo, id, nombre);
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

window.previewFotoEquipo = function(url) {
  const wrap = document.getElementById('fotoEquipoPreview');
  const img  = document.getElementById('fotoEquipoImg');
  if (!wrap || !img) return;
  if (url) {
    img.src             = url;
    wrap.style.display  = 'flex';
    img.onerror         = () => { wrap.style.display = 'none'; };
  } else {
    wrap.style.display  = 'none';
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
          <button class="btn-tbl delete" onclick="confirmDelete('galardon','${g.id}','${g.gamertag}')">Eliminar</button>
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
          <button class="btn-tbl delete" onclick="confirmDelete('resena','${r.id}','${r.nombre}')">Eliminar</button>
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
            <button class="btn-tbl delete" onclick="confirmDelete('encuesta','${e.id}','${(e.pregunta || '').substring(0, 30)}')">Eliminar</button>
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
          <button class="btn-tbl delete" onclick="confirmDelete('chat_mensajes','${m.id}','mensaje')">Borrar</button>
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
        <button class="btn-admin-primary" onclick="limpiarDuplicados()" style="background:var(--red);flex-shrink:0">Limpiar duplicados</button>
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
          <button class="btn-tbl confirm" onclick="saveJuego('${j.id}')">Guardar</button>
          <button class="btn-tbl delete" onclick="confirmDelete('juego','${j.id}','${nombre}')">Eliminar</button>
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

// ── BRACKET ADMIN ────────────────────────────────────────────
window.abrirBracketAdmin = async function(torneoId, torneoNombre) {
  const modal = document.getElementById('bracketModal');
  const body  = document.getElementById('bracketModalBody');
  const title = document.getElementById('bracketModalTitle');
  if (!modal || !body) return;

  title.textContent = 'BRACKET — ' + torneoNombre.toUpperCase();
  body.innerHTML = '<p style="color:var(--muted);padding:20px 0">Cargando...</p>';
  modal.classList.add('active');

  try {
    const [torneoSnap, inscripSnap] = await Promise.all([
      getDoc(doc(db, 'torneos', torneoId)),
      getDocs(collection(db, 'inscripciones')),
    ]);

    if (!torneoSnap.exists()) { body.innerHTML = '<p style="color:var(--red)">Torneo no encontrado.</p>'; return; }

    const t          = { id: torneoSnap.id, ...torneoSnap.data() };
    const inscriptos = inscripSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(i => i.torneo_id === torneoId && i.estado !== 'cancelado');
    const jpe        = t.jugadores_por_equipo || 1;
    const bracket    = t.bracket || {};

    // Armar equipos
    const equiposMap = {};
    inscriptos.forEach(i => {
      const nombre = (jpe > 1 && i.equipo_nombre) ? i.equipo_nombre : i.gamertag;
      if (!equiposMap[nombre]) equiposMap[nombre] = [];
      equiposMap[nombre].push(i.gamertag);
    });
    const equipos = Object.keys(equiposMap);

    if (equipos.length < 2) {
      body.innerHTML = '<p style="color:var(--muted);padding:20px 0">Se necesitan al menos 2 equipos/jugadores para el bracket.</p>';
      return;
    }

    // Armar partidos
    const partidos = [];
    for (let i = 0; i < equipos.length; i += 2) {
      if (equipos[i] && equipos[i+1]) {
        const key     = 'match_' + Math.floor(i/2);
        const ganador = bracket.ganadores ? bracket.ganadores[key] || '' : '';
        partidos.push({ eq1: equipos[i], eq2: equipos[i+1], key, ganador });
      }
    }

    const ganadorFinal = bracket.ganador_final || '';
    const finalistas   = bracket.finalistas || partidos.map(p => p.ganador || '?');

    let html = '<div style="display:flex;gap:24px;flex-wrap:wrap">';

    // Fase 1
    html += '<div style="flex:1;min-width:240px">';
    html += '<div style="font-size:0.65rem;letter-spacing:3px;color:var(--acid);margin-bottom:16px">FASE 1</div>';
    partidos.forEach((p, idx) => {
      html += '<div style="background:var(--dark);border:1px solid var(--gray);margin-bottom:8px;padding:0">';
      html += '<div style="padding:4px 12px;font-size:0.6rem;letter-spacing:2px;color:var(--muted);border-bottom:1px solid var(--gray)">PARTIDO ' + (idx+1) + '</div>';
      html += '<div style="display:flex;align-items:center;padding:8px 12px;gap:8px;border-bottom:1px solid rgba(255,255,255,0.05)">';
      html += '<span style="flex:1;font-family:Barlow Condensed,sans-serif;font-weight:700;color:' + (p.ganador===p.eq1?'var(--acid)':'#fff') + '">' + p.eq1 + '</span>';
      html += '<button class="btn-tbl confirm" style="font-size:0.65rem;padding:3px 8px" onclick="marcarGanadorBracket(&quot;' + torneoId + '&quot;,&quot;' + p.key + '&quot;,&quot;' + encodeURIComponent(p.eq1) + '&quot;)">Ganador</button></div>';
      html += '<div style="display:flex;align-items:center;padding:8px 12px;gap:8px">';
      html += '<span style="flex:1;font-family:Barlow Condensed,sans-serif;font-weight:700;color:' + (p.ganador===p.eq2?'var(--acid)':'#fff') + '">' + p.eq2 + '</span>';
      html += '<button class="btn-tbl confirm" style="font-size:0.65rem;padding:3px 8px" onclick="marcarGanadorBracket(&quot;' + torneoId + '&quot;,&quot;' + p.key + '&quot;,&quot;' + encodeURIComponent(p.eq2) + '&quot;)">Ganador</button></div>';
      if (p.ganador) html += '<div style="padding:4px 12px;font-size:0.65rem;color:var(--acid);background:rgba(200,255,0,0.05)">&#9733; ' + p.ganador + '</div>';
      html += '</div>';
    });
    html += '</div>';

    // Gran Final
    if (finalistas.length >= 2 && finalistas[0] !== '?' && finalistas[1] !== '?') {
      html += '<div style="min-width:240px;flex:1">';
      html += '<div style="font-size:0.65rem;letter-spacing:3px;color:var(--acid);margin-bottom:16px">GRAN FINAL</div>';
      html += '<div style="background:var(--dark);border:1px solid rgba(200,255,0,0.3);padding:0">';
      [0,1].forEach(fi => {
        const f = finalistas[fi];
        html += '<div style="display:flex;align-items:center;padding:10px 14px;gap:8px;' + (fi===0?'border-bottom:1px solid rgba(255,255,255,0.05)':'') + '">';
        html += '<span style="flex:1;font-family:Barlow Condensed,sans-serif;font-size:1.1rem;font-weight:700;color:' + (ganadorFinal===f?'var(--acid)':'#fff') + '">' + f + '</span>';
        html += '<button class="btn-tbl confirm" style="font-size:0.65rem" onclick="marcarGanadorFinal(this)" data-tid="' + torneoId + '" data-ganador="' + encodeURIComponent(f) + '" data-finalistas="' + encodeURIComponent(finalistas.join('|')) + '">Camp&eacute;on</button></div>';
      });
      if (ganadorFinal) html += '<div style="padding:6px 14px;font-size:0.7rem;color:var(--acid);background:rgba(200,255,0,0.08)">&#9733; CAMPEÓN: ' + ganadorFinal + '</div>';
      html += '</div></div>';
    }

    html += '</div>';
    html += '<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--gray);text-align:right">';
    html += '<button class="btn-admin-secondary" onclick="closeBracketModal()">Cerrar</button></div>';
    body.innerHTML = html;

  } catch (err) {
    console.error('abrirBracketAdmin:', err);
    body.innerHTML = '<p style="color:var(--red)">Error al cargar el bracket.</p>';
  }
};

window.marcarGanadorBracket = async function(torneoId, matchKey, ganadorEncoded) {
  const ganador = decodeURIComponent(ganadorEncoded);
  try {
    const snap = await getDoc(doc(db, 'torneos', torneoId));
    if (!snap.exists()) return;
    const bracket = snap.data().bracket || {};
    const ganadores = bracket.ganadores || {};
    ganadores[matchKey] = ganador;
    // Actualizar lista de finalistas
    const allGanadores = Object.values(ganadores).filter(Boolean);
    await updateDoc(doc(db, 'torneos', torneoId), {
      'bracket.ganadores': ganadores,
      'bracket.finalistas': allGanadores,
    });
    showToast('Ganador guardado: ' + ganador);
    // Reabrir modal para reflejar cambio
    const title = document.getElementById('bracketModalTitle');
    const nombre = title ? title.textContent.replace('BRACKET — ','') : '';
    abrirBracketAdmin(torneoId, nombre);
  } catch (err) {
    console.error(err);
    showToast('Error al guardar ganador', true);
  }
};

window.marcarGanadorFinal = async function(btn) {
  const torneoId      = btn.dataset.tid;
  const ganador       = decodeURIComponent(btn.dataset.ganador);
  const finalistasStr = decodeURIComponent(btn.dataset.finalistas).replace(/\|/g, ',');
  try {
    const finalistas = finalistasStr.split(',');
    await updateDoc(doc(db, 'torneos', torneoId), {
      'bracket.ganador_final': ganador,
      'bracket.finalistas':    finalistas,
    });

    // Asignar puntos automáticamente
    // Campeón: 100 pts · Finalista: 50 pts · Participante en bracket: 10 pts
    const PUNTOS = { campeon: 100, finalista: 50, participante: 10 };
    const jugSnap = await getDocs(collection(db, 'jugadores'));
    const jugadores = jugSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const updates = [];
    for (const j of jugadores) {
      const gt = j.gamertag || '';
      if (gt === ganador) {
        updates.push(updateDoc(doc(db, 'jugadores', j.id), {
          ranking_points:  (j.ranking_points  || 0) + PUNTOS.campeon,
          victorias:       (j.victorias       || 0) + 1,
          torneos_jugados: (j.torneos_jugados || 0) + 1,
        }));
      } else if (finalistas.includes(gt)) {
        updates.push(updateDoc(doc(db, 'jugadores', j.id), {
          ranking_points:  (j.ranking_points  || 0) + PUNTOS.finalista,
          torneos_jugados: (j.torneos_jugados || 0) + 1,
        }));
      }
    }
    if (updates.length > 0) await Promise.all(updates);

    showToast('Campeon: ' + ganador + (updates.length > 0 ? ' · Puntos asignados ✓' : ''));
    const title = document.getElementById('bracketModalTitle');
    const nombre = title ? title.textContent.replace('BRACKET — ','') : '';
    abrirBracketAdmin(torneoId, nombre);
  } catch (err) {
    console.error(err);
    showToast('Error al guardar campeon', true);
  }
};

window.closeBracketModal = function() {
  document.getElementById('bracketModal')?.classList.remove('active');
};

// ── JUGADORES ────────────────────────────────────────────────
async function loadJugadores() {
  const grid = document.getElementById('jugadoresGrid');
  if (!grid) return;
  grid.innerHTML = '<p style="color:var(--muted)">Cargando...</p>';
  try {
    const snap = await getDocs(collection(db, 'jugadores'));
    const jugadores = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.ranking_points || 0) - (a.ranking_points || 0));
    if (jugadores.length === 0) {
      grid.innerHTML = '<p style="color:var(--muted)">No hay jugadores registrados.</p>';
      return;
    }
    grid.innerHTML = jugadores.map(j => buildJugadorAdminCard(j)).join('');
  } catch (err) {
    console.error(err);
    grid.innerHTML = '<p style="color:var(--red)">Error al cargar jugadores.</p>';
  }
}

function buildJugadorAdminCard(j) {
  const inicial  = (j.gamertag || '?').charAt(0);
  const avatarSt = 'width:44px;height:44px;border-radius:50%;background:rgba(200,255,0,0.1);display:flex;align-items:center;justify-content:center;font-size:1.2rem;color:var(--acid)';
  const fotoHtml = j.foto
    ? '<img src="' + j.foto + '" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid var(--acid)" onerror="this.outerHTML=\'<div style=\\\'' + avatarSt + '\\\'>' + inicial + '</div>\'">'
    : '<div style="' + avatarSt + '">' + inicial + '</div>';
  const confirmCall = 'confirmDelete(&quot;jugador&quot;,&quot;' + j.id + '&quot;,&quot;' + (j.gamertag||'').replace(/"/g,'') + '&quot;)';
  return '<div class="admin-torneo-card" style="display:flex;align-items:center;gap:16px">'
    + fotoHtml
    + '<div style="flex:1">'
    + '<div class="atc-title" style="margin-bottom:4px">' + (j.gamertag || '\u2014') + '</div>'
    + '<div style="color:var(--muted);font-size:0.8rem">' + (j.nombre || '') + '</div>'
    + '</div>'
    + '<div style="text-align:right">'
    + '<div style="font-size:1.5rem;color:var(--acid);line-height:1;font-weight:700">' + (j.ranking_points || 0) + '</div>'
    + '<div style="font-size:0.65rem;letter-spacing:2px;color:var(--muted)">PUNTOS</div>'
    + '</div>'
    + '<div class="tbl-actions">'
    + '<a class="btn-tbl" href="jugador.html?id=' + j.id + '" target="_blank" style="text-decoration:none">Ver perfil</a>'
    + '<button class="btn-tbl delete" onclick="' + confirmCall + '">Eliminar</button>'
    + '</div>'
    + '</div>';
}

window.showNuevoJugador = function() {
  const gamertag = prompt('Gamertag del jugador:');
  if (!gamertag || !gamertag.trim()) return;
  const nombre = prompt('Nombre real (opcional):') || '';
  const foto   = prompt('URL de foto (opcional):') || '';
  addDoc(collection(db, 'jugadores'), {
    gamertag:       gamertag.trim(),
    nombre:         nombre.trim(),
    foto:           foto.trim(),
    ranking_points: 0,
    victorias:      0,
    torneos_jugados:0,
    fecha_registro: serverTimestamp(),
  }).then(() => {
    showToast('Jugador registrado ✓');
    loadJugadores();
  }).catch(err => {
    showToast('Error al registrar', true);
    console.error(err);
  });
};

// ── RANKING ───────────────────────────────────────────────────
async function loadRanking() {
  const tbody = document.getElementById('rankingBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Cargando...</td></tr>';
  try {
    const snap = await getDocs(collection(db, 'jugadores'));
    const jugadores = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.ranking_points || 0) - (a.ranking_points || 0));
    if (jugadores.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Sin jugadores registrados</td></tr>';
      return;
    }
    tbody.innerHTML = jugadores.map(function(j, idx) {
      const avatarSt = 'display:inline-flex;width:32px;height:32px;border-radius:50%;background:rgba(200,255,0,0.1);align-items:center;justify-content:center;color:var(--acid);vertical-align:middle;margin-right:8px';
      const fotoHtml = j.foto
        ? '<img src="' + j.foto + '" style="width:32px;height:32px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:8px" onerror="this.remove()">'
        : '<span style="' + avatarSt + '">' + (j.gamertag||'?').charAt(0) + '</span>';
      const posColor = idx===0 ? '#FFD700' : idx===1 ? '#C0C0C0' : idx===2 ? '#CD7F32' : 'var(--muted)';
      return '<tr>'
        + '<td style="font-size:1.2rem;font-weight:700;color:' + posColor + '">' + (idx+1) + '</td>'
        + '<td>' + fotoHtml + '</td>'
        + '<td style="font-weight:700;color:#fff">' + (j.gamertag||'\u2014') + '</td>'
        + '<td style="font-size:1.3rem;font-weight:700;color:var(--acid)">' + (j.ranking_points||0) + '</td>'
        + '<td>' + (j.victorias||0) + '</td>'
        + '<td>' + (j.torneos_jugados||0) + '</td>'
        + '</tr>';
    }).join('');
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Error al cargar</td></tr>';
  }
}

// ── TEMPORADAS ────────────────────────────────────────────────
async function loadTemporadas() {
  const list = document.getElementById('temporadasList');
  if (!list) return;
  list.innerHTML = '<p style="color:var(--muted)">Cargando...</p>';
  try {
    const snap = await getDocs(collection(db, 'temporadas'));
    const temps = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.fecha_inicio?.toDate?.()?.getTime()||0) - (a.fecha_inicio?.toDate?.()?.getTime()||0));
    if (temps.length === 0) {
      list.innerHTML = '<p style="color:var(--muted)">No hay temporadas. Creá la primera.</p>';
      return;
    }
    list.innerHTML = temps.map(t => {
      const inicio = t.fecha_inicio?.toDate ? t.fecha_inicio.toDate().toLocaleDateString('es-AR') : '—';
      const fin    = t.fecha_fin?.toDate    ? t.fecha_fin.toDate().toLocaleDateString('es-AR')    : 'En curso';
      return '<div class="admin-torneo-card" style="display:flex;align-items:center;gap:16px;padding:16px 20px">'
        + '<div style="flex:1">'
        + '<div class="atc-title">' + (t.nombre||'—') + '</div>'
        + '<div style="color:var(--muted);font-size:0.8rem;margin-top:4px">' + inicio + ' — ' + fin + '</div>'
        + '</div>'
        + '<span class="badge ' + (t.activa?'badge-confirmado':'badge-cancelado') + '">' + (t.activa?'Activa':'Cerrada') + '</span>'
        + '<button class="btn-tbl delete" data-tipo="temporada" data-id="' + t.id + '" data-nombre="' + (t.nombre||'').replace(/"/g,'&quot;') + '" onclick="confirmDeleteFromBtn(this)">Eliminar</button>'
        + '</div>';
    }).join('');
  } catch (err) {
    console.error(err);
    list.innerHTML = '<p style="color:var(--red)">Error al cargar.</p>';
  }
}

window.showNuevaTemporada = function() {
  const nombre = prompt('Nombre de la temporada (ej: Season 2026):');
  if (!nombre || !nombre.trim()) return;
  addDoc(collection(db, 'temporadas'), {
    nombre:       nombre.trim(),
    activa:       true,
    fecha_inicio: serverTimestamp(),
    fecha_fin:    null,
  }).then(() => {
    showToast('Temporada creada ✓');
    loadTemporadas();
  }).catch(err => {
    showToast('Error al crear temporada', true);
    console.error(err);
  });
};

// ── STREAMING ────────────────────────────────────────────────
window.saveStreaming = async function() {
  const url    = document.getElementById('cfgStreamUrl')?.value.trim()   || '';
  const titulo = document.getElementById('cfgStreamTitulo')?.value.trim()|| '';
  const activo = document.getElementById('cfgStreamActivo')?.checked     || false;
  try {
    await setDoc(doc(db, 'config', 'streaming'), { url, titulo, activo });
    showToast(activo ? 'Stream activado ✓ — ya se ve en la página' : 'Streaming guardado ✓');
  } catch (err) {
    showToast('Error al guardar', true);
    console.error(err);
  }
};

window.desactivarStreaming = async function() {
  try {
    await setDoc(doc(db, 'config', 'streaming'), { url: '', titulo: '', activo: false });
    const el = document.getElementById('cfgStreamActivo');
    if (el) el.checked = false;
    showToast('Streaming desactivado ✓');
  } catch (err) {
    showToast('Error', true);
    console.error(err);
  }
};

// ── REGLAS EDITABLES ─────────────────────────────────────────
let reglaRows = [];

function renderReglaRows() {
  const list = document.getElementById('reglasAdminList');
  if (!list) return;
  list.innerHTML = reglaRows.map((r, i) =>
    '<div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:center">'
    + '<input type="text" class="form-input" placeholder="Título (ej: Pago previo)" value="' + (r.titulo||'').replace(/"/g,'&quot;') + '" oninput="reglaRows[' + i + '].titulo=this.value" style="margin:0">'
    + '<input type="text" class="form-input" placeholder="Descripción" value="' + (r.texto||'').replace(/"/g,'&quot;') + '" oninput="reglaRows[' + i + '].texto=this.value" style="margin:0">'
    + '<button class="btn-tbl delete" onclick="reglaRows.splice(' + i + ',1);renderReglaRows()" style="padding:8px 10px;height:auto">X</button>'
    + '</div>'
  ).join('');
}

window.addReglaRow = function() {
  if (reglaRows.length >= 8) { showToast('Máximo 8 reglas', true); return; }
  reglaRows.push({ titulo: '', texto: '' });
  renderReglaRows();
};

window.saveReglas = async function() {
  const items = reglaRows.filter(r => r.titulo.trim());
  try {
    await setDoc(doc(db, 'config', 'reglas'), { items });
    showToast('Reglas guardadas ✓');
  } catch (err) {
    showToast('Error al guardar', true);
    console.error(err);
  }
};

// ── FOOTER / REDES ────────────────────────────────────────────
window.saveFooter = async function() {
  const data = {
    wa_number:      document.getElementById('cfgWA')?.value.trim()   || '',
    instagram_url:  document.getElementById('cfgIG')?.value.trim()   || '',
    copy_text:      document.getElementById('cfgCopy')?.value.trim() || '',
    note_text:      document.getElementById('cfgNote')?.value.trim() || '',
  };
  try {
    await setDoc(doc(db, 'config', 'footer'), data);
    showToast('Footer guardado ✓');
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
    const [hpSnap, secSnap, tickerSnap, reglasSnap, footerSnap, streamSnap] = await Promise.all([
      safe(getDoc(doc(db, 'config', 'homepage'))),
      safe(getDoc(doc(db, 'config', 'secciones'))),
      safe(getDoc(doc(db, 'config', 'ticker'))),
      safe(getDoc(doc(db, 'config', 'reglas'))),
      safe(getDoc(doc(db, 'config', 'footer'))),
      safe(getDoc(doc(db, 'config', 'streaming'))),
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

    if (reglasSnap && reglasSnap.exists()) {
      reglaRows = (reglasSnap.data().items || []).map(r => ({ titulo: r.titulo||'', texto: r.texto||'' }));
    } else {
      reglaRows = [
        { titulo: 'Pago previo obligatorio', texto: 'La inscripción se confirma únicamente con el pago. Sin pago no hay cupo.' },
        { titulo: 'Sin devoluciones',        texto: 'Una vez confirmada la inscripción no se devuelve. Podés ceder tu lugar antes del cierre.' },
        { titulo: 'Puntualidad',             texto: '10 minutos de gracia. Pasado ese tiempo perdés la ronda por W/O.' },
        { titulo: 'Juego limpio',            texto: 'Cero tolerancia con hacks. Si se detecta trampa, eliminado sin devolución.' },
        { titulo: 'Premio a confirmar',      texto: 'El monto final se determina al cerrar inscripciones según total de participantes.' },
        { titulo: 'Acreditación hasta 48hs', texto: 'Los premios se pagan en hasta 48hs hábiles. Efectivo según stock, consultá antes.' },
      ];
    }
    renderReglaRows();

    if (footerSnap && footerSnap.exists()) {
      const ft = footerSnap.data();
      const setV = (id, val) => { const el = document.getElementById(id); if (el) el.value = val||''; };
      setV('cfgWA',   ft.wa_number);
      setV('cfgIG',   ft.instagram_url);
      setV('cfgCopy', ft.copy_text);
      setV('cfgNote', ft.note_text);
    }
    if (streamSnap && streamSnap.exists()) {
      const st = streamSnap.data();
      const setV = (id, val) => { const el = document.getElementById(id); if (el) el.value = val||''; };
      setV('cfgStreamUrl',    st.url);
      setV('cfgStreamTitulo', st.titulo);
      const chk = document.getElementById('cfgStreamActivo');
      if (chk) chk.checked = st.activo === true;
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


// ── MÚSICA — Admin ────────────────────────────────────────────
window.saveMusica = async function() {
  const archivo = document.getElementById('cfgMusicaArchivo')?.value.trim() || 'music/background.mp3';
  const titulo  = document.getElementById('cfgMusicaTitulo')?.value.trim()  || 'NEXUS ARENA';
  const volumen = parseInt(document.getElementById('cfgMusicaVolumen')?.value || 30);
  const activa  = document.getElementById('cfgMusicaActiva')?.checked ?? true;
  const loop    = document.getElementById('cfgMusicaLoop')?.checked ?? true;
  try {
    await setDoc(doc(db, 'config', 'musica'), { archivo, titulo, volumen, activa, loop });
    showToast('Música guardada ✓');
  } catch (err) {
    console.error(err);
    showToast('Error al guardar música', true);
  }
};

// Cargar config música al entrar a Config
const _origLoadConfig = window.loadConfig || null;

// ── FLYER GENERATOR — Preview para Facebook ───────────────────
// Genera un PNG 1200x630 con Canvas para usar como OG image
window.generarFlyerTorneo = async function(torneoId) {
  const snap = await getDoc(doc(db, 'torneos', torneoId));
  if (!snap.exists()) { showToast('Torneo no encontrado', true); return; }
  const t = { id: snap.id, ...snap.data() };

  const W = 1200, H = 630;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Fondo negro
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);

  // Grid decorativo
  ctx.strokeStyle = 'rgba(200,255,0,0.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  // Intentar cargar imagen del juego
  const drawContent = () => {
    // Franja ácida izquierda
    ctx.fillStyle = '#C8FF00';
    ctx.fillRect(0, 0, 8, H);

    // Degradado lateral derecho decorativo
    const grad = ctx.createLinearGradient(W * 0.5, 0, W, 0);
    grad.addColorStop(0, 'rgba(200,255,0,0)');
    grad.addColorStop(1, 'rgba(200,255,0,0.06)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Badge INSCRIPCIÓN ABIERTA
    if (t.estado === 'open') {
      ctx.fillStyle = '#C8FF00';
      ctx.fillRect(60, 48, 260, 34);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 14px "Arial Narrow", Arial';
      ctx.letterSpacing = '3px';
      ctx.fillText('INSCRIPCIÓN ABIERTA', 76, 71);
    }

    // Nombre del torneo
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 88px "Arial Black", Arial';
    const nombre = (t.nombre || 'TORNEO').toUpperCase();
    // Wrap si es muy largo
    if (ctx.measureText(nombre).width > 680) {
      ctx.font = 'bold 64px "Arial Black", Arial';
    }
    ctx.fillText(nombre, 60, 220);

    // Línea ácida bajo el título
    ctx.fillStyle = '#C8FF00';
    ctx.fillRect(60, 238, Math.min(ctx.measureText(nombre).width, 680), 4);

    // Fecha
    const fechaStr = t.fecha?.toDate
      ? t.fecha.toDate().toLocaleString('es-AR', { weekday:'long', day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' })
      : '';
    ctx.fillStyle = 'rgba(200,255,0,0.85)';
    ctx.font = '28px Arial';
    ctx.fillText(fechaStr.toUpperCase(), 60, 296);

    // Metadata — plataforma, modalidad, entrada
    const platMap = { mobile:'Mobile', console:'Consola', pc:'PC / Cross' };
    const plat = platMap[t.plataforma] || t.plataforma || '';
    const mod  = t.modalidad === 'presencial' ? 'Presencial' : 'Online';
    const precio = (t.precio || 0) === 0 ? 'GRATIS' : '$' + (t.precio).toLocaleString('es-AR');

    const tags = [plat, mod, precio].filter(Boolean);
    let tagX = 60;
    tags.forEach(tag => {
      const tw = ctx.measureText(tag).width + 28;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(tagX, 330, tw, 36);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.strokeRect(tagX, 330, tw, 36);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px Arial';
      ctx.fillText(tag, tagX + 14, 354);
      tagX += tw + 8;
    });

    // Cupos
    const libre = t.cupos_total - (t.cupos_ocupados || 0);
    ctx.fillStyle = libre <= 3 ? '#ff1744' : '#C8FF00';
    ctx.font = 'bold 20px Arial';
    ctx.fillText(`${libre} CUPOS DISPONIBLES`, 60, 415);

    // NEXUS ARENA branding abajo
    ctx.fillStyle = '#C8FF00';
    ctx.font = 'bold 52px "Arial Black", Arial';
    ctx.fillText('NEXUS', 60, 560);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(' ARENA', 60 + ctx.measureText('NEXUS').width, 560);

    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '16px Arial';
    ctx.fillText('lacajamisteriosoficial-cloud.github.io/nexus-arena', 60, 592);

    // Botón de descarga
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `nexus-arena-${(t.nombre || 'torneo').toLowerCase().replace(/[^a-z0-9]/g,'-')}.png`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Flyer descargado ✓ Subilo a Imgur y pegá la URL como imagen del torneo');
    }, 'image/png');
  };

  // Si hay imagen del juego, dibujarla a la derecha
  if (t.imagen) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Imagen a la derecha, con degradado encima
      ctx.drawImage(img, W * 0.48, 0, W * 0.52, H);
      const fadeGrad = ctx.createLinearGradient(W * 0.48, 0, W * 0.75, 0);
      fadeGrad.addColorStop(0, '#0a0a0a');
      fadeGrad.addColorStop(1, 'rgba(10,10,10,0)');
      ctx.fillStyle = fadeGrad;
      ctx.fillRect(W * 0.48, 0, W * 0.27, H);
      drawContent();
    };
    img.onerror = () => drawContent();
    img.src = t.imagen;
  } else {
    drawContent();
  }
};

// ── MÚSICA — cargar config al abrir Config ────────────────────
const _origLoadConfigSection = window.loadConfigSection;
window.loadConfigSection = async function() {
  if (_origLoadConfigSection) await _origLoadConfigSection();
  try {
    const snap = await getDoc(doc(db, 'config', 'musica'));
    if (!snap.exists()) return;
    const m = snap.data();
    const arch = document.getElementById('cfgMusicaArchivo');
    const tit  = document.getElementById('cfgMusicaTitulo');
    const vol  = document.getElementById('cfgMusicaVolumen');
    const volV = document.getElementById('cfgMusicaVolVal');
    const act  = document.getElementById('cfgMusicaActiva');
    if (arch) arch.value     = m.archivo  || 'music/background.mp3';
    if (tit)  tit.value      = m.titulo   || '';
    if (vol)  { vol.value    = m.volumen  ?? 30; }
    if (volV) volV.textContent = (m.volumen ?? 30) + '%';
    if (act)  act.checked    = m.activa   !== false;
    const loopEl = document.getElementById('cfgMusicaLoop');
    if (loopEl) loopEl.checked = m.loop !== false;
  } catch(e) { /* no hay config todavía */ }
};

// ── NOTIFICADOR DE INSCRIPTOS ─────────────────────────────────
let _notificarInscriptos = [];
let _notificarTorneo     = null;

window.toggleNotificarPanel = function() {
  const panel = document.getElementById('notificarPanel');
  if (!panel) return;
  const visible = panel.style.display !== 'none';
  panel.style.display = visible ? 'none' : 'block';
  if (!visible) construirNotificarPanel();
};

async function construirNotificarPanel() {
  const filterTorneo = document.getElementById('filterTorneo')?.value;
  const lista  = document.getElementById('notificarLista');
  const countEl = document.getElementById('notificarCount');
  if (!lista) return;
  lista.innerHTML = '<p style="color:var(--muted);font-size:0.85rem">Cargando...</p>';
  try {
    if (!filterTorneo || filterTorneo === 'all') {
      lista.innerHTML = '<p style="color:var(--orange);font-size:0.85rem">Seleccioná un torneo específico en el filtro para notificar.</p>';
      document.getElementById('notificarMensaje').value = '';
      return;
    }
    const torneoSnap = await getDoc(doc(db, 'torneos', filterTorneo));
    _notificarTorneo = torneoSnap.exists() ? { id: torneoSnap.id, ...torneoSnap.data() } : null;
    const inscSnap = await getDocs(collection(db, 'inscripciones'));
    _notificarInscriptos = inscSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(i => i.torneo_id === filterTorneo && i.estado === 'confirmado' && (i.whatsapp || i.contacto));
    if (_notificarInscriptos.length === 0) {
      lista.innerHTML = '<p style="color:var(--muted);font-size:0.85rem">No hay inscriptos confirmados con WhatsApp en este torneo.</p>';
      if (countEl) countEl.textContent = '';
      document.getElementById('notificarMensaje').value = '';
      return;
    }
    regenerarMensaje();
    renderNotificarLista();
    if (countEl) countEl.textContent = `${_notificarInscriptos.length} inscripto${_notificarInscriptos.length !== 1 ? 's' : ''} confirmado${_notificarInscriptos.length !== 1 ? 's' : ''}`;
  } catch (err) {
    lista.innerHTML = '<p style="color:var(--red);font-size:0.85rem">Error al cargar.</p>';
  }
}

window.regenerarMensaje = function() {
  const t = _notificarTorneo;
  if (!t) return;
  const fechaStr = t.fecha?.toDate
    ? t.fecha.toDate().toLocaleString('es-AR', { weekday:'long', day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' })
    : '(fecha a confirmar)';
  const esPago = (t.precio || 0) > 0;
  const lineaPago = esPago
    ? `💳 *Pago:* $${(t.precio).toLocaleString('es-AR')}` + (t.alias_mp ? `\n📲 *Alias MP:* ${t.alias_mp}` : '')
    : `✅ *Entrada libre* — sin costo`;
  const msg =
    `🎮 *NEXUS ARENA — ${t.nombre.toUpperCase()}*\n\n` +
    `¡Hola! Tu inscripción fue *confirmada*. Estos son los datos del torneo:\n\n` +
    `📅 *Fecha:* ${fechaStr}\n` +
    `🕹️ *Plataforma:* ${t.plataforma || 'a confirmar'}\n` +
    `🌐 *Modalidad:* ${t.modalidad === 'presencial' ? 'Presencial — Villa de Mayo' : 'Online'}\n` +
    lineaPago + `\n\n` +
    `📋 *Próximos pasos:*\n` +
    `• Te enviamos el bracket y los datos de la sala por este medio antes del torneo.\n` +
    `• Estar disponible 15 minutos antes del inicio.\n` +
    `• Ante cualquier duda respondé este mensaje.\n\n` +
    `¡Mucha suerte! 🏆\n— Nexus Arena`;
  const textarea = document.getElementById('notificarMensaje');
  if (textarea) textarea.value = msg;
  if (_notificarInscriptos.length > 0) renderNotificarLista();
};

function renderNotificarLista() {
  const lista = document.getElementById('notificarLista');
  if (!lista || _notificarInscriptos.length === 0) return;
  lista.innerHTML =
    `<div style="font-size:0.65rem;letter-spacing:3px;color:var(--acid);margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--gray)">${_notificarInscriptos.length} INSCRIPTOS — CLIC EN ENVIAR PARA ABRIR WHATSAPP</div>` +
    _notificarInscriptos.map((i) => {
      const numero = (i.whatsapp || i.contacto || '').replace(/\D/g, '');
      const waNum  = numero.startsWith('54') ? numero : '549' + numero.replace(/^0/, '');
      return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--dark);border:1px solid var(--gray);margin-bottom:2px;flex-wrap:wrap">` +
        `<span style="font-family:'Barlow Condensed',sans-serif;font-size:0.95rem;font-weight:700;color:#fff;min-width:140px">${i.gamertag}</span>` +
        `<span style="font-size:0.8rem;color:var(--muted);flex:1">${i.nombre} · ${i.whatsapp || i.contacto || '—'}</span>` +
        `<button class="btn-admin-primary" style="clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%);padding:7px 18px;font-size:0.75rem" onclick="enviarWA('${waNum}')">Enviar →</button>` +
        `</div>`;
    }).join('');
}

window.enviarWA = function(numero) {
  const mensaje = document.getElementById('notificarMensaje')?.value || '';
  if (!mensaje.trim()) { showToast('El mensaje está vacío', true); return; }
  if (!numero || numero.length < 10) { showToast('Número inválido', true); return; }
  window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`, '_blank');
};

const _origLoadInscr = window.loadInscripciones;
window.loadInscripciones = async function() {
  if (_origLoadInscr) await _origLoadInscr();
  const filterTorneo = document.getElementById('filterTorneo')?.value;
  const btn = document.getElementById('btnNotificar');
  if (btn) btn.style.display = (filterTorneo && filterTorneo !== 'all') ? 'inline-flex' : 'none';
  const panel = document.getElementById('notificarPanel');
  if (panel) panel.style.display = 'none';
};

// ── MODO PRUEBA ───────────────────────────────────────────────
const MP = {
  torneoId:null, botIds:[], inscripIds:[],
  galardonId:null, bots:[], campeon:null, finalistas:[],
};
const BOT_NAMES = ['BotNexus_01','BotNexus_02','BotNexus_03','BotNexus_04','BotNexus_05','BotNexus_06','BotNexus_07','BotNexus_08','BotNexus_09','BotNexus_10','BotNexus_11','BotNexus_12','BotNexus_13','BotNexus_14','BotNexus_15','BotNexus_16'];

function mpLog(msg, ok=true) {
  const el = document.getElementById('mpLog');
  if (!el) return;
  if (el.textContent.includes('no iniciaste')) el.innerHTML = '';
  el.innerHTML += `<div style="color:${ok?'var(--acid)':'var(--red)'}">› ${msg}</div>`;
}
function mpReset() {
  Object.assign(MP,{torneoId:null,botIds:[],inscripIds:[],galardonId:null,bots:[],campeon:null,finalistas:[]});
  const log=document.getElementById('mpLog'); if(log) log.innerHTML='';
  const lnk=document.getElementById('mpLinks'); if(lnk) lnk.innerHTML='';
  ['mpBracketCard','mpResultadosCard'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
}
window.mpCrearTorneo = async function() {
  mpReset();
  const nombre=document.getElementById('mpNombre')?.value.trim()||'TEST — Torneo Prueba';
  const cantBots=parseInt(document.getElementById('mpCantBots')?.value||8);
  const precio=parseInt(document.getElementById('mpPrecio')?.value||0);
  const plataforma=document.getElementById('mpPlataforma')?.value||'mobile';
  mpLog('Creando torneo de prueba...');
  try {
    const tRef=await addDoc(collection(db,'torneos'),{nombre,subtitulo:'Torneo de prueba',fecha:serverTimestamp(),estado:'open',precio,cupos_total:cantBots,cupos_ocupados:0,plataforma,modalidad:'online',categoria:plataforma,emoji:'🤖',imagen:'',descripcion:'Generado por Modo Prueba.',alias_mp:precio>0?'test.prueba':'',premio:precio*cantBots*0.8,jugadores_por_equipo:1,test_mode:true,bracket:{}});
    MP.torneoId=tRef.id; mpLog(`Torneo: "${nombre}"`);
    for(const gt of BOT_NAMES.slice(0,cantBots)){
      const jRef=await addDoc(collection(db,'jugadores'),{gamertag:gt,nombre:gt+' (bot)',foto:'',ranking_points:0,victorias:0,torneos_jugados:0,fecha_registro:serverTimestamp(),test_mode:true});
      MP.botIds.push(jRef.id); MP.bots.push({id:jRef.id,gamertag:gt});
    }
    mpLog(`${cantBots} bots ✓`);
    for(const bot of MP.bots){
      const iRef=await addDoc(collection(db,'inscripciones'),{nombre:bot.gamertag,gamertag:bot.gamertag,contacto:'bot@test.com',whatsapp:'1100000000',mail:'bot@test.com',torneo_id:MP.torneoId,torneo_nombre:nombre,estado:'confirmado',fecha_inscripcion:serverTimestamp(),test_mode:true});
      MP.inscripIds.push(iRef.id);
    }
    await updateDoc(doc(db,'torneos',MP.torneoId),{cupos_ocupados:cantBots});
    mpLog(`${cantBots} inscripciones ✓`);
    const lnk=document.getElementById('mpLinks');
    if(lnk) lnk.innerHTML=`<a href="torneo.html?id=${MP.torneoId}" target="_blank" class="btn-admin-secondary" style="text-decoration:none;font-size:0.75rem">Ver torneo →</a><a href="index.html" target="_blank" class="btn-admin-secondary" style="text-decoration:none;font-size:0.75rem">Ver página →</a>`;
    mpLog('✓ Bracket en Paso 2');
    await mpRenderBracket();
    const bc=document.getElementById('mpBracketCard'); if(bc) bc.style.display='block';
  } catch(err){ mpLog('Error: '+err.message,false); }
};
async function mpRenderBracket() {
  const content=document.getElementById('mpBracketContent');
  if(!content||!MP.torneoId) return;
  const snap=await getDoc(doc(db,'torneos',MP.torneoId));
  const bracket=snap.data()?.bracket||{};
  const gans=bracket.ganadores||{};
  const ganadorFinal=bracket.ganador_final||'';
  const finalistas=bracket.finalistas||[];
  const partidos=[];
  for(let i=0;i<MP.bots.length;i+=2){
    if(MP.bots[i]&&MP.bots[i+1]){
      const key='match_'+Math.floor(i/2);
      partidos.push({eq1:MP.bots[i].gamertag,eq2:MP.bots[i+1].gamertag,key,ganador:gans[key]||''});
    }
  }
  let html='<div style="display:flex;gap:16px;flex-wrap:wrap"><div style="flex:1;min-width:240px">';
  html+='<div style="font-size:0.65rem;letter-spacing:3px;color:var(--orange);margin-bottom:12px">FASE 1</div>';
  partidos.forEach((p,idx)=>{
    html+=`<div style="background:var(--dark);border:1px solid var(--gray);margin-bottom:8px"><div style="padding:3px 10px;font-size:0.6rem;letter-spacing:2px;color:var(--muted);border-bottom:1px solid var(--gray)">PARTIDO ${idx+1}</div>`;
    [p.eq1,p.eq2].forEach(eq=>{
      html+=`<div style="display:flex;align-items:center;padding:7px 10px;gap:8px;border-bottom:1px solid rgba(255,255,255,0.04)"><span style="flex:1;font-family:'Barlow Condensed',sans-serif;font-weight:700;color:${p.ganador===eq?'var(--orange)':'#fff'}">${eq}</span><button class="btn-tbl confirm" style="font-size:0.65rem;padding:3px 8px" onclick="mpMarcarGanador('${p.key}','${encodeURIComponent(eq)}')">Ganador</button></div>`;
    });
    if(p.ganador) html+=`<div style="padding:3px 10px;font-size:0.65rem;color:var(--orange);background:rgba(255,109,0,0.05)">★ ${p.ganador}</div>`;
    html+=`</div>`;
  });
  html+='</div>';
  if(finalistas.length>=2){
    html+='<div style="min-width:240px;flex:1"><div style="font-size:0.65rem;letter-spacing:3px;color:var(--orange);margin-bottom:12px">GRAN FINAL</div><div style="background:var(--dark);border:1px solid rgba(255,109,0,0.4)">';
    [0,1].forEach(fi=>{
      const f=finalistas[fi]||'?';
      html+=`<div style="display:flex;align-items:center;padding:10px 12px;gap:8px;${fi===0?'border-bottom:1px solid rgba(255,255,255,0.06)':''}"><span style="flex:1;font-family:'Barlow Condensed',sans-serif;font-size:1.05rem;font-weight:700;color:${ganadorFinal===f?'var(--orange)':'#fff'}">${f}</span>`;
      if(f!=='?') html+=`<button class="btn-tbl confirm" onclick="mpMarcarCampeon('${encodeURIComponent(f)}','${encodeURIComponent(finalistas.join('|'))}')">Campeón</button>`;
      html+=`</div>`;
    });
    if(ganadorFinal) html+=`<div style="padding:5px 12px;font-size:0.7rem;color:var(--orange);background:rgba(255,109,0,0.08)">★ CAMPEÓN: ${ganadorFinal}</div>`;
    html+='</div></div>';
  }
  html+='</div>';
  content.innerHTML=html;
}
window.mpMarcarGanador=async function(k,ge){if(!MP.torneoId)return;const g=decodeURIComponent(ge);try{const s=await getDoc(doc(db,'torneos',MP.torneoId));const gs={...(s.data()?.bracket?.ganadores||{}),[k]:g};await updateDoc(doc(db,'torneos',MP.torneoId),{'bracket.ganadores':gs,'bracket.finalistas':Object.values(gs).filter(Boolean)});await mpRenderBracket();}catch(e){showToast('Error',true);}};
window.mpMarcarCampeon=async function(ge,fe){if(!MP.torneoId)return;const g=decodeURIComponent(ge);const fs=decodeURIComponent(fe).split('|');try{await updateDoc(doc(db,'torneos',MP.torneoId),{'bracket.ganador_final':g,'bracket.finalistas':fs});MP.campeon=g;MP.finalistas=fs;await mpRenderBracket();showToast('Campeón: '+g);}catch(e){showToast('Error',true);}};
window.mpSimularAleatorio=async function(){if(!MP.torneoId||MP.bots.length===0){showToast('Primero creá el torneo',true);return;}mpLog('Simulando...');try{const gs={},gf=[];for(let i=0;i<MP.bots.length;i+=2){if(MP.bots[i]&&MP.bots[i+1]){const k='match_'+Math.floor(i/2);const w=Math.random()>0.5?MP.bots[i].gamertag:MP.bots[i+1].gamertag;gs[k]=w;gf.push(w);}}const camp=gf[Math.floor(Math.random()*gf.length)];const fs=gf.slice(0,2);await updateDoc(doc(db,'torneos',MP.torneoId),{'bracket.ganadores':gs,'bracket.finalistas':fs,'bracket.ganador_final':camp});MP.campeon=camp;MP.finalistas=fs;await mpRenderBracket();mpLog(`Campeón: ${camp} ✓`);showToast('Simulado ✓');}catch(err){mpLog('Error: '+err.message,false);}};
window.mpFinalizarTorneo=async function(){if(!MP.torneoId){showToast('Primero creá el torneo',true);return;}const sn=await getDoc(doc(db,'torneos',MP.torneoId));const br=sn.data()?.bracket||{};const camp=br.ganador_final||MP.campeon;if(!camp){showToast('Marcá un campeón',true);return;}const fs=br.finalistas||[];mpLog('Asignando puntos...');try{const P={campeon:100,finalista:50,participante:10};const js=await getDocs(collection(db,'jugadores'));const ups=js.docs.map(d=>({id:d.id,...d.data()})).filter(j=>j.test_mode).map(j=>{const gt=j.gamertag||'';const pts=gt===camp?P.campeon:fs.includes(gt)?P.finalista:P.participante;const vic=gt===camp?1:0;return updateDoc(doc(db,'jugadores',j.id),{ranking_points:(j.ranking_points||0)+pts,victorias:(j.victorias||0)+vic,torneos_jugados:(j.torneos_jugados||0)+1});});await Promise.all(ups);await updateDoc(doc(db,'torneos',MP.torneoId),{estado:'finished'});const gRef=await addDoc(collection(db,'galardones'),{gamertag:camp,torneo_nombre:sn.data()?.nombre||'TEST',fecha:serverTimestamp(),emoji:'🤖',foto:'',test_mode:true});MP.galardonId=gRef.id;mpLog(`✓ Campeón: ${camp} | Galardón creado | Puntos asignados`);const js2=await getDocs(collection(db,'jugadores'));const bots=js2.docs.map(d=>({id:d.id,...d.data()})).filter(j=>j.test_mode).sort((a,b)=>(b.ranking_points||0)-(a.ranking_points||0));const rc=document.getElementById('mpResultadosCard');const rco=document.getElementById('mpResultadosContent');if(rc&&rco){rc.style.display='block';rco.innerHTML=`<div style="padding:16px;background:rgba(200,255,0,0.05);border:1px solid rgba(200,255,0,0.15)"><strong style="color:var(--acid)">★ Campeón: ${camp}</strong> — todo funcionó correctamente.<br><span style="color:var(--muted);font-size:0.82rem">Verificá ranking, Hall of Fame y perfil de jugadores. Luego limpiá.</span></div><div style="margin-top:12px;border:1px solid var(--gray)">`+bots.slice(0,6).map((j,i)=>`<div style="display:flex;align-items:center;gap:12px;padding:8px 14px;border-bottom:1px solid rgba(42,42,42,0.5)"><span style="font-size:1rem;font-weight:700;min-width:20px;color:${i===0?'#FFD700':i===1?'#C0C0C0':i===2?'#CD7F32':'var(--muted)'}">${i+1}</span><span style="flex:1;font-family:'Barlow Condensed',sans-serif;color:#fff">${j.gamertag}</span><span style="color:var(--acid);font-weight:700">${j.ranking_points||0} pts</span><a href="jugador.html?id=${j.id}" target="_blank" class="btn-tbl" style="font-size:0.65rem;text-decoration:none">Ver perfil</a></div>`).join('')+'</div>';}mpLog('===== COMPLETADO =====');}catch(err){mpLog('Error: '+err.message,false);}};
window.mpLimpiar=async function(){if(!confirm('¿Borrar todos los datos test_mode:true?'))return;const logEl=document.getElementById('mpLimpiezaLog');if(logEl)logEl.textContent='Borrando...';try{let total=0;for(const col of['torneos','inscripciones','jugadores','galardones']){const s=await getDocs(collection(db,col));for(const d of s.docs.filter(d=>d.data().test_mode===true)){await deleteDoc(doc(db,col,d.id));total++;}}if(logEl)logEl.innerHTML=`<span style="color:var(--acid)">✓ ${total} documentos eliminados.</span>`;showToast(`Limpieza: ${total} docs ✓`);mpReset();const log=document.getElementById('mpLog');if(log)log.innerHTML='<span style="color:var(--muted)">Limpiado. Podés hacer otra prueba.</span>';}catch(err){if(logEl)logEl.innerHTML=`<span style="color:var(--red)">Error: ${err.message}</span>`;showToast('Error: '+err.message,true);}};
