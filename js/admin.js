// ============================================================
//  NEXUS ARENA — admin.js (panel de administración)
// ============================================================

import { db, auth } from './firebase.js';
import {
  collection, getDocs, addDoc, doc, updateDoc, deleteDoc,
  query, orderBy, where, serverTimestamp, getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ── Estado ──────────────────────────────────────────────────
let allTorneos       = [];
let allInscripciones = [];
let deleteCallback   = null;

// ── Auth ────────────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (user) {
    document.getElementById('loginScreen').style.display  = 'none';
    document.getElementById('adminPanel').style.display   = 'flex';
    initAdmin();
  } else {
    document.getElementById('loginScreen').style.display  = 'flex';
    document.getElementById('adminPanel').style.display   = 'none';
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

// Permite enviar con Enter en el login
document.getElementById('loginPassword').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btnLogin').click();
});

// ── Inicializar admin ────────────────────────────────────────
function initAdmin() {
  setupSidebarNav();
  loadDashboard();
  document.getElementById('adminDate').textContent =
    new Date().toLocaleDateString('es-AR', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  document.getElementById('btnSaveTorneo').addEventListener('click', saveTorneo);
}

// ── Sidebar navigation ───────────────────────────────────────
function setupSidebarNav() {
  document.querySelectorAll('.sidebar-link[data-section]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      showSection(link.dataset.section);
    });
  });
}

window.showSection = function(name) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));

  const section = document.getElementById(`section-${name}`);
  const link    = document.querySelector(`.sidebar-link[data-section="${name}"]`);

  if (section) section.classList.add('active');
  if (link)    link.classList.add('active');

  // Cargar datos según sección
  if (name === 'dashboard')      loadDashboard();
  if (name === 'torneos')        loadAdminTorneos();
  if (name === 'inscripciones')  loadInscripciones();
  if (name === 'nuevo-torneo')   {
    document.getElementById('formTorneoTitle').textContent = 'Nuevo Torneo';
    document.getElementById('editTorneoId').value = '';
  }
};

// ── DASHBOARD ───────────────────────────────────────────────
async function loadDashboard() {
  try {
    const [torneoSnap, inscripSnap] = await Promise.all([
      getDocs(collection(db, 'torneos')),
      getDocs(query(collection(db, 'inscripciones'), orderBy('fecha_inscripcion', 'desc')))
    ]);

    allTorneos       = torneoSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    allInscripciones = inscripSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const activos      = allTorneos.filter(t => t.estado !== 'finished').length;
    const confirmados  = allInscripciones.filter(i => i.estado === 'confirmado');
    const recaudado    = confirmados.reduce((s, i) => {
      const t = allTorneos.find(x => x.id === i.torneo_id);
      return s + (t?.precio || 0);
    }, 0);
    const comision = Math.round(recaudado * 0.2);

    document.getElementById('dashTorneos').textContent   = activos;
    document.getElementById('dashInscrip').textContent   = allInscripciones.length;
    document.getElementById('dashRecaudado').textContent = `$${recaudado.toLocaleString('es-AR')}`;
    document.getElementById('dashComision').textContent  = `$${comision.toLocaleString('es-AR')}`;

    // Tabla recientes (últimas 10)
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
        <td>${i.contacto}</td>
        <td>${badgeEstado(i.estado)}</td>
        <td>${formatFecha(i.fecha_inscripcion)}</td>
      </tr>
    `).join('');

  } catch (err) {
    console.error('Error cargando dashboard:', err);
  }
}

// ── TORNEOS ADMIN ────────────────────────────────────────────
async function loadAdminTorneos() {
  const container = document.getElementById('torneosList');
  container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Cargando...</p></div>';

  try {
    const snap = await getDocs(query(collection(db, 'torneos'), orderBy('fecha', 'asc')));
    allTorneos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

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
  const libre   = t.cupos_total - (t.cupos_ocupados || 0);
  const fechaStr = t.fecha?.toDate
    ? t.fecha.toDate().toLocaleString('es-AR', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
    : t.fecha || '—';

  const statusMap = { open:'status-open', soon:'status-soon', full:'status-full', finished:'status-finished' };

  return `
    <div class="admin-torneo-card">
      <div class="atc-header">
        <div>
          <div class="atc-title">${t.emoji || '🎮'} ${t.nombre}</div>
        </div>
        <span class="card-status ${statusMap[t.estado] || ''}" style="position:static;clip-path:none;padding:3px 10px">${t.estado}</span>
      </div>
      <div class="atc-fecha">📅 ${fechaStr}</div>
      <div class="atc-meta">
        <span class="atc-tag">${t.plataforma}</span>
        <span class="atc-tag">${t.modalidad}</span>
        <span class="atc-tag">$${t.precio?.toLocaleString('es-AR')}</span>
      </div>
      <div class="atc-slots">🎟 ${t.cupos_ocupados || 0} / ${t.cupos_total} cupos · ${libre} libres</div>
      <div class="atc-actions">
        <button class="btn-tbl" onclick="editTorneo('${t.id}')">✏ Editar</button>
        <button class="btn-tbl" onclick="toggleEstado('${t.id}', '${t.estado}')">🔄 Estado</button>
        <button class="btn-tbl delete" onclick="confirmDelete('torneo', '${t.id}', '${t.nombre}')">🗑 Eliminar</button>
      </div>
    </div>
  `;
}

// ── INSCRIPCIONES ────────────────────────────────────────────
window.loadInscripciones = async function() {
  const tbody         = document.getElementById('inscripcionesBody');
  const filterTorneo  = document.getElementById('filterTorneo').value;
  const filterEstado  = document.getElementById('filterEstado').value;

  tbody.innerHTML = '<tr><td colspan="7" class="table-loading">Cargando...</td></tr>';

  try {
    let q = query(collection(db, 'inscripciones'), orderBy('fecha_inscripcion', 'desc'));
    const snap = await getDocs(q);
    let lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Poblar select de torneos
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
        <td>${i.contacto}</td>
        <td>${badgeEstado(i.estado)}</td>
        <td>${formatFecha(i.fecha_inscripcion)}</td>
        <td>
          <div class="tbl-actions">
            ${i.estado !== 'confirmado' ? `<button class="btn-tbl confirm" onclick="updateEstadoInscrip('${i.id}', 'confirmado')">✓ Confirmar</button>` : ''}
            ${i.estado !== 'cancelado'  ? `<button class="btn-tbl cancel"  onclick="updateEstadoInscrip('${i.id}', 'cancelado')">✕ Cancelar</button>`  : ''}
            <button class="btn-tbl delete" onclick="confirmDelete('inscripcion', '${i.id}', '${i.nombre}')">🗑</button>
          </div>
        </td>
      </tr>
    `).join('');

  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="7" class="table-loading" style="color:var(--red)">Error al cargar.</td></tr>';
  }
};

async function populateTorneoFilter() {
  const select = document.getElementById('filterTorneo');
  if (select.children.length > 1) return; // ya cargado

  const snap = await getDocs(collection(db, 'torneos'));
  snap.forEach(d => {
    const opt = document.createElement('option');
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

// ── TORNEO FORM ──────────────────────────────────────────────
async function saveTorneo() {
  const nombre    = document.getElementById('tNombre').value.trim();
  const subtitulo = document.getElementById('tSubtitulo').value.trim();
  const fechaVal  = document.getElementById('tFecha').value;
  const plataforma= document.getElementById('tPlatforma').value;
  const modalidad = document.getElementById('tModalidad').value;
  const categoria = document.getElementById('tCategoria').value;
  const cupos     = parseInt(document.getElementById('tCupos').value);
  const precio    = parseInt(document.getElementById('tPrecio').value);
  const emoji     = document.getElementById('tEmoji').value.trim() || '🎮';
  const estado    = document.getElementById('tEstado').value;
  const desc      = document.getElementById('tDescripcion').value.trim();
  const editId    = document.getElementById('editTorneoId').value;
  const errEl     = document.getElementById('formTorneoError');

  errEl.style.display = 'none';

  if (!nombre || !fechaVal || !plataforma || !cupos || !precio) {
    errEl.textContent = 'Completá los campos obligatorios (*)';
    errEl.style.display = 'block';
    return;
  }

  const data = {
    nombre, subtitulo, plataforma, modalidad, categoria,
    cupos_total: cupos, precio, emoji, estado,
    descripcion: desc,
    fecha: new Date(fechaVal),
  };

  const btn = document.getElementById('btnSaveTorneo');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

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
    btn.disabled = false;
    btn.textContent = 'Guardar torneo';
  }
}

window.editTorneo = async function(id) {
  try {
    const snap = await getDoc(doc(db, 'torneos', id));
    if (!snap.exists()) return;
    const t = snap.data();

    document.getElementById('editTorneoId').value       = id;
    document.getElementById('tNombre').value            = t.nombre || '';
    document.getElementById('tSubtitulo').value         = t.subtitulo || '';
    document.getElementById('tPlatforma').value         = t.plataforma || '';
    document.getElementById('tModalidad').value         = t.modalidad || 'online';
    document.getElementById('tCategoria').value         = t.categoria || 'console';
    document.getElementById('tCupos').value             = t.cupos_total || '';
    document.getElementById('tPrecio').value            = t.precio || 5000;
    document.getElementById('tEmoji').value             = t.emoji || '🎮';
    document.getElementById('tEstado').value            = t.estado || 'open';
    document.getElementById('tDescripcion').value       = t.descripcion || '';

    if (t.fecha?.toDate) {
      const d = t.fecha.toDate();
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
  const nextIdx = (estados.indexOf(estadoActual) + 1) % estados.length;
  const next    = estados[nextIdx];

  try {
    await updateDoc(doc(db, 'torneos', id), { estado: next });
    showToast(`Estado → ${next}`);
    loadAdminTorneos();
  } catch (err) {
    showToast('Error al actualizar', true);
  }
};

window.resetTorneoForm = function() {
  ['tNombre','tSubtitulo','tFecha','tCupos','tEmoji','tDescripcion'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('tPrecio').value    = '5000';
  document.getElementById('tPlataforma').value = '';
  document.getElementById('tEstado').value    = 'open';
  document.getElementById('editTorneoId').value = '';
  document.getElementById('formTorneoTitle').textContent = 'Nuevo Torneo';
  document.getElementById('formTorneoError').style.display = 'none';
};

// ── DELETE MODAL ─────────────────────────────────────────────
window.confirmDelete = function(tipo, id, nombre) {
  document.getElementById('deleteTarget').textContent = `"${nombre}"`;
  document.getElementById('deleteModal').classList.add('active');

  deleteCallback = async () => {
    try {
      const colName = tipo === 'torneo' ? 'torneos' : 'inscripciones';
      await deleteDoc(doc(db, colName, id));
      showToast('Eliminado correctamente');
      closeDeleteModal();
      if (tipo === 'torneo')       loadAdminTorneos();
      if (tipo === 'inscripcion')  loadInscripciones();
    } catch (err) {
      showToast('Error al eliminar', true);
    }
  };
};

window.closeDeleteModal = function() {
  document.getElementById('deleteModal').classList.remove('active');
  deleteCallback = null;
};

document.getElementById('btnConfirmDelete').addEventListener('click', () => {
  if (deleteCallback) deleteCallback();
});

// ── HELPERS ─────────────────────────────────────────────────
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
  return d.toLocaleDateString('es-AR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
}

function showToast(msg, isError = false) {
  const t = document.createElement('div');
  t.className = `toast${isError ? ' error' : ''}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
