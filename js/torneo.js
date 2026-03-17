// ============================================================
//  NEXUS ARENA — torneo.js  (página de detalle)
// ============================================================
import { db } from './firebase.js';
import {
  collection, getDocs, doc, getDoc, addDoc, updateDoc,
  serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const WA_NUMBER = "5491157687215";

// Leer ?id= de la URL
const params    = new URLSearchParams(window.location.search);
const torneoId  = params.get('id');

let torneoData      = null;
let inscriptosData  = [];

// ── INIT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (!torneoId) {
    mostrarError('No se especificó un torneo.');
    return;
  }
  await cargarTorneo();
  setupModal();
});

// ── CARGA TORNEO ─────────────────────────────────────────────
async function cargarTorneo() {
  try {
    const [torneoSnap, inscripSnap] = await Promise.all([
      getDoc(doc(db, 'torneos', torneoId)),
      getDocs(collection(db, 'inscripciones')),
    ]);

    if (!torneoSnap.exists()) { mostrarError('El torneo no existe.'); return; }

    torneoData     = { id: torneoSnap.id, ...torneoSnap.data() };
    inscriptosData = inscripSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(i => i.torneo_id === torneoId && i.estado !== 'cancelado');

    renderHero();
    renderInfo();
    renderBracket();

    document.getElementById('heroLoading').style.display  = 'none';
    document.getElementById('heroContent').style.display  = 'block';
    document.getElementById('torneoMain').style.display   = 'block';

    // Actualizar título de la página
    document.title = `NEXUS ARENA — ${torneoData.nombre}`;

  } catch (err) {
    console.error('cargarTorneo error:', err);
    mostrarError('Error al cargar el torneo. Recargá la página.');
  }
}

// ── HERO ─────────────────────────────────────────────────────
function renderHero() {
  const t = torneoData;

  if (t.imagen) {
    document.getElementById('torneoHeroBg').style.backgroundImage = `url('${t.imagen}')`;
  }

  const estadoMap = { open:'INSCRIPCIÓN ABIERTA', soon:'PRÓXIMAMENTE', full:'CUPOS LLENOS', finished:'FINALIZADO' };
  document.getElementById('heroEstado').textContent    = estadoMap[t.estado] || t.estado.toUpperCase();
  document.getElementById('heroNombre').textContent    = t.nombre;
  document.getElementById('heroModalidad').textContent = t.modalidad === 'presencial' ? 'Presencial — Villa de Mayo' : 'Online';
  document.getElementById('heroPlataforma').textContent = t.plataforma || '—';

  const libre = t.cupos_total - (t.cupos_ocupados || 0);
  document.getElementById('heroCupos').textContent = `${t.cupos_ocupados || 0} / ${t.cupos_total} inscritos — ${libre} libres`;

  const fechaStr = t.fecha?.toDate
    ? t.fecha.toDate().toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : '—';
  document.getElementById('heroFecha').textContent = fechaStr;
}

// ── INFO + PRIZE ─────────────────────────────────────────────
function renderInfo() {
  const t     = torneoData;
  const libre = t.cupos_total - (t.cupos_ocupados || 0);
  const pct   = t.cupos_total > 0 ? (t.cupos_ocupados / t.cupos_total) * 100 : 0;
  const premio = t.premio || Math.round(t.cupos_total * (t.precio || 5000) * 0.8);

  // Descripcion
  if (t.descripcion) {
    document.getElementById('torneoDesc').textContent = t.descripcion;
  } else {
    document.getElementById('infoCard').style.display = 'none';
  }

  // Cupos
  document.getElementById('cuposTexto').textContent   = `${t.cupos_ocupados || 0} / ${t.cupos_total} inscritos`;
  document.getElementById('cuposLibres').textContent  = `${libre} libres`;
  document.getElementById('cuposBarFill').style.width = `${pct}%`;

  // Btn inscribir
  const btn = document.getElementById('btnInscribirPage');
  if (t.estado !== 'open' || libre <= 0) {
    btn.disabled     = true;
    btn.textContent  = t.estado === 'full' ? 'Cupos llenos' : t.estado === 'finished' ? 'Torneo finalizado' : 'No disponible aún';
  }

  // Premio
  document.getElementById('premioBig').textContent  = `$${premio.toLocaleString('es-AR')}`;
  document.getElementById('precioShow').textContent = `$${(t.precio || 5000).toLocaleString('es-AR')}`;

  // Alias — siempre visible
  const aliasValEl = document.getElementById('aliasVal');
  const aliasBlockEl = document.getElementById('aliasBlock');
  if (aliasValEl && aliasBlockEl) {
    aliasValEl.textContent    = t.alias_mp || 'Nexus.arena';
    aliasBlockEl.style.display = 'block';
  }

  // TC
  document.getElementById('terminosTC').textContent =
    `* El premio de $${premio.toLocaleString('es-AR')} se acredita únicamente al llenarse el cupo de ${t.cupos_total} jugadores. Sin cupo completo el monto puede variar proporcionalmente. Premio acreditado en hasta 48hs hábiles post-torneo. Evento privado.`;
}

// ── BRACKET ──────────────────────────────────────────────────
function renderBracket() {
  const t   = torneoData;
  const jpe = t.jugadores_por_equipo || 1;
  const bracket = t.bracket || null;

  if (inscriptosData.length === 0 && !bracket) return;

  document.getElementById('bracketSection').style.display = 'block';

  // Armar equipos desde inscriptos o desde bracket guardado
  const equipos = bracket
    ? bracket.equipos
    : armarEquiposAutomatico(inscriptosData, jpe);

  renderEquiposGrid(equipos, jpe);
  renderBracketVisual(equipos, bracket, t);
}

function armarEquiposAutomatico(inscriptos, jpe) {
  // Separar: los que tienen equipo y los que no
  const conEquipo  = {};
  const sinEquipo  = [];

  inscriptos.forEach(i => {
    if (i.equipo_opt === 'con' && i.equipo_nombre) {
      const key = i.equipo_nombre.toLowerCase().trim();
      if (!conEquipo[key]) conEquipo[key] = { nombre: i.equipo_nombre, jugadores: [] };
      conEquipo[key].jugadores.push(i);
    } else {
      sinEquipo.push(i);
    }
  });

  const equipos = Object.values(conEquipo);

  // Distribuir los sin equipo en equipos existentes con lugar o crear nuevos
  sinEquipo.forEach(j => {
    // Buscar equipo con lugar
    const equipoConLugar = equipos.find(e => e.jugadores.length < jpe);
    if (equipoConLugar) {
      equipoConLugar.jugadores.push(j);
    } else {
      equipos.push({ nombre: `Equipo ${equipos.length + 1}`, jugadores: [j], auto: true });
    }
  });

  // Numerar equipos sin nombre asignado
  equipos.forEach((e, i) => {
    if (e.auto || !e.nombre) e.nombre = `Equipo ${i + 1}`;
  });

  return equipos;
}

function renderEquiposGrid(equipos, jpe) {
  const grid = document.getElementById('equiposGrid');
  if (!grid || equipos.length === 0) return;

  grid.innerHTML = equipos.map((eq, idx) => {
    const slots = [];
    for (let i = 0; i < jpe; i++) {
      const jugador = eq.jugadores?.[i];
      if (jugador) {
        slots.push(`<li>${jugador.gamertag || jugador.nombre}</li>`);
      } else {
        slots.push(`<li class="equipo-slot-empty">Lugar libre</li>`);
      }
    }
    return `
      <div class="equipo-card">
        <div class="equipo-card-header">
          <div class="equipo-card-num">${String(idx + 1).padStart(2,'0')}</div>
          <div class="equipo-card-name">${eq.nombre}</div>
        </div>
        <ul class="equipo-card-players">${slots.join('')}</ul>
      </div>`;
  }).join('');
}

function renderBracketVisual(equipos, bracketGuardado, t) {
  const grid = document.getElementById('bracketGrid');
  if (!grid) return;

  // Si hay menos de 2 equipos, no mostrar bracket
  if (equipos.length < 2) {
    grid.innerHTML = '<p style="color:var(--muted);padding:20px 6vw">El bracket se arma cuando haya suficientes equipos inscritos.</p>';
    return;
  }

  // Bracket simple: 4 equipos → 2 semis + 1 final
  // Generalizable: pares de equipos compiten, ganadores van a la final
  const partidos  = [];
  for (let i = 0; i < equipos.length; i += 2) {
    const eq1 = equipos[i];
    const eq2 = equipos[i + 1];
    if (eq1 && eq2) {
      const key = `match_${i/2}`;
      const ganador = bracketGuardado?.ganadores?.[key] || null;
      partidos.push({ eq1, eq2, key, ganador });
    }
  }

  // Final
  const finalistasSaved = bracketGuardado?.finalistas || [];

  // HTML
  const fase1HTML = partidos.map((p, idx) => `
    <div class="bracket-match" style="margin-bottom:16px">
      <div style="padding:6px 14px;font-family:'Barlow Condensed',sans-serif;font-size:0.65rem;letter-spacing:2px;color:var(--muted);border-bottom:1px solid var(--gray)">
        FASE 1 — PARTIDO ${idx + 1}
      </div>
      <div class="bracket-team ${p.ganador === p.eq1.nombre ? 'winner' : p.ganador ? 'loser' : ''}">
        <span class="bracket-team-name">${p.eq1.nombre}</span>
      </div>
      <div class="bracket-team ${p.ganador === p.eq2.nombre ? 'winner' : p.ganador ? 'loser' : ''}">
        <span class="bracket-team-name">${p.eq2.nombre}</span>
      </div>
    </div>`).join('');

  const finalistas = finalistasSaved.length > 0
    ? finalistasSaved
    : partidos.map(p => p.ganador || '?');

  const ganadorFinal = bracketGuardado?.ganador_final || null;

  const finalHTML = finalistas.length >= 2 ? `
    <div class="bracket-match final">
      <div style="padding:6px 14px;font-family:'Barlow Condensed',sans-serif;font-size:0.65rem;letter-spacing:2px;color:var(--acid);border-bottom:1px solid var(--gray)">
        GRAN FINAL
      </div>
      <div class="bracket-team ${ganadorFinal === finalistas[0] ? 'winner' : ganadorFinal ? 'loser' : (finalistas[0] === '?' ? 'tbd' : '')}">
        <span class="bracket-team-name">${finalistas[0] === '?' ? 'Por definir' : finalistas[0]}</span>
        ${ganadorFinal === finalistas[0] ? '<span style="color:var(--acid);font-size:1rem">&#9733;</span>' : ''}
      </div>
      <div class="bracket-team ${ganadorFinal === finalistas[1] ? 'winner' : ganadorFinal ? 'loser' : (finalistas[1] === '?' ? 'tbd' : '')}">
        <span class="bracket-team-name">${finalistas[1] === '?' ? 'Por definir' : finalistas[1]}</span>
        ${ganadorFinal === finalistas[1] ? '<span style="color:var(--acid);font-size:1rem">&#9733;</span>' : ''}
      </div>
    </div>` : '';

  grid.innerHTML = `
    <div class="bracket-col">
      <div class="bracket-col-title">FASE 1 — CLASIFICATORIAS</div>
      <div class="bracket-matches">${fase1HTML}</div>
    </div>
    <div class="bracket-connector">→</div>
    <div class="bracket-col" style="max-width:280px">
      <div class="bracket-col-title">GRAN FINAL</div>
      <div class="bracket-matches">${finalHTML}</div>
    </div>`;
}

// ── INSCRIPCION ───────────────────────────────────────────────
window.abrirInscripcion = function() {
  if (!torneoData) return;

  const t      = torneoData;
  const libre  = t.cupos_total - (t.cupos_ocupados || 0);
  const premio = t.premio || Math.round(t.cupos_total * (t.precio || 5000) * 0.8);

  const fechaStr = t.fecha?.toDate
    ? t.fecha.toDate().toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';

  document.getElementById('modalTitle').textContent   = 'INSCRIPCIÓN — ' + t.nombre.toUpperCase();
  document.getElementById('modalGame').textContent    = t.nombre;
  document.getElementById('modalDate').textContent    = fechaStr;
  document.getElementById('modalMode').textContent    = t.modalidad === 'presencial' ? 'Presencial — Villa de Mayo' : 'Online';
  document.getElementById('modalPrize').textContent   = `$${premio.toLocaleString('es-AR')}`;
  document.getElementById('modalEntrada').textContent = `$${(t.precio || 5000).toLocaleString('es-AR')}`;
  document.getElementById('modalPremioTC').textContent = `$${premio.toLocaleString('es-AR')}`;
  document.getElementById('modalCuposTC').textContent  = t.cupos_total;

  const aliasBlock = document.getElementById('modalAliasBlock');
  const aliasEl    = document.getElementById('modalAlias');
  if (aliasBlock && aliasEl) {
    aliasEl.textContent      = t.alias_mp || 'Nexus.arena';
    aliasBlock.style.display = 'block';
  }

  const jpe = t.jugadores_por_equipo || 1;
  const equipoSection = document.getElementById('equipoSectionTitle');
  const equipoBlock   = document.getElementById('equipoBlock');
  // Mostrar siempre la sección de equipo — cualquier jugador puede tener o no equipo
  if (equipoSection) equipoSection.style.display = 'block';
  if (equipoBlock)   equipoBlock.style.display   = 'block';

  ['inputNombre','inputGamertag','inputWhatsapp','inputMail','inputEquipo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const radioSin = document.querySelector('input[name="equipoOpt"][value="sin"]');
  if (radioSin) { radioSin.checked = true; toggleEquipoInput('sin'); }

  document.getElementById('formError').style.display  = 'none';
  document.getElementById('btnSubmit').disabled       = false;
  document.getElementById('btnSubmit').textContent    = 'CONFIRMAR INSCRIPCIÓN →';
  document.getElementById('modalOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
};

function setupModal() {
  document.getElementById('modalClose')?.addEventListener('click', closeModal);
  document.getElementById('modalOverlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });
  document.getElementById('btnSubmit')?.addEventListener('click', submitInscripcion);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

function closeModal() {
  document.getElementById('modalOverlay')?.classList.remove('active');
  document.body.style.overflow = '';
}

async function submitInscripcion() {
  const nombre   = document.getElementById('inputNombre')?.value.trim();
  const gamertag = document.getElementById('inputGamertag')?.value.trim();
  const whatsapp = document.getElementById('inputWhatsapp')?.value.trim();
  const mail     = document.getElementById('inputMail')?.value.trim();
  const errEl    = document.getElementById('formError');
  const btn      = document.getElementById('btnSubmit');

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

  const jpe = torneoData?.jugadores_por_equipo || 1;
  let equipoNombre = null;
  let equipoOpt    = 'sin';
  // Siempre leer la opción de equipo (sección siempre visible)
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

  // Guardar datos locales antes de cualquier async
  const tId      = torneoData.id;
  const tNombre  = torneoData.nombre;
  const tPrecio  = torneoData.precio || 5000;
  const tAlias   = torneoData.alias_mp || 'a confirmar';

  btn.disabled = true; btn.textContent = 'Guardando...';

  try {
    // Verificar cupos en tiempo real
    const snap = await getDoc(doc(db, 'torneos', tId));
    if (!snap.exists()) throw new Error('El torneo ya no existe.');
    const actual = snap.data();
    const libre  = actual.cupos_total - (actual.cupos_ocupados || 0);
    if (actual.estado !== 'open' || libre <= 0) {
      errEl.textContent = 'Los cupos se agotaron. Intentá con otro torneo.';
      errEl.style.display = 'block';
      btn.disabled = false; btn.textContent = 'CONFIRMAR INSCRIPCIÓN →';
      return;
    }

    await addDoc(collection(db, 'inscripciones'), {
      nombre, gamertag,
      contacto:  whatsapp,
      whatsapp,  mail,
      equipo_nombre: equipoNombre || '',
      equipo_opt:    equipoOpt,
      torneo_id:     tId,
      torneo_nombre: tNombre,
      estado:        'pendiente',
      fecha_inscripcion: serverTimestamp(),
    });

    await updateDoc(doc(db, 'torneos', tId), { cupos_ocupados: increment(1) });

    closeModal();

    // Mensaje WA profesional
    const equipoLinea = equipoNombre
      ? `Equipo: ${equipoNombre}`
      : `Equipo: Sin equipo (me asignan uno)`;

    const lineas = [
      `Hola! Me quiero inscribir al torneo de *${tNombre}*.`,
      ``,
      `*Mis datos:*`,
      `Nombre: ${nombre}`,
      `Gamertag: ${gamertag}`,
      `WhatsApp: ${whatsapp}`,
      `Mail: ${mail}`,
      equipoLinea,
      ``,
      `*Pago:*`,
      `Monto: $${tPrecio.toLocaleString('es-AR')}`,
      `Alias MP: *${tAlias}*`,
      ``,
      `Adjunto el comprobante de transferencia.`,
    ];

    setTimeout(() => {
      alert(`Inscripcion registrada, ${nombre}. Te redirigimos a WhatsApp para enviar el comprobante de pago.`);
      window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(lineas.join('\n'))}`, '_blank');
      cargarTorneo(); // refrescar cupos
    }, 300);

  } catch (err) {
    console.error('submitInscripcion error:', err);
    errEl.textContent = `Error: ${err.code || err.message}`;
    errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'CONFIRMAR INSCRIPCIÓN →';
  }
}

// ── HELPERS ──────────────────────────────────────────────────
window.toggleEquipoInput = function(val) {
  const group = document.getElementById('inputEquipoGroup');
  if (group) group.style.display = val === 'con' ? 'block' : 'none';
};

window.copyAlias = function() {
  const el = document.getElementById('modalAlias') || document.getElementById('aliasVal');
  if (!el) return;
  navigator.clipboard.writeText(el.textContent).then(() => {
    document.querySelectorAll('.alias-copy-btn, .modal-alias-copy').forEach(btn => {
      btn.textContent = '¡Copiado!';
      setTimeout(() => btn.textContent = 'Copiar', 1500);
    });
  }).catch(() => {});
};

function mostrarError(msg) {
  document.getElementById('heroLoading').innerHTML =
    `<p style="color:var(--red)">${msg}</p><a href="index.html" style="color:var(--acid)">← Volver al inicio</a>`;
}

// Nav scroll
window.addEventListener('scroll', () => {
  document.getElementById('nav')?.classList.toggle('scrolled', window.scrollY > 50);
});

// ── MODAL 2 PASOS ─────────────────────────────────────────────

window.irPaso2 = function() {
  // Validar equipo si eligió "con equipo"
  const radioCon = document.querySelector('input[name="equipoOpt"][value="con"]');
  if (radioCon?.checked) {
    const nombre = document.getElementById('inputEquipo')?.value.trim();
    if (!nombre) {
      document.getElementById('inputEquipo')?.focus();
      return;
    }
  }

  // Armar resumen
  const alias    = document.getElementById('modalAlias')?.textContent || '—';
  const entrada  = document.getElementById('modalEntrada')?.textContent || '—';
  const radioCon2 = document.querySelector('input[name="equipoOpt"][value="con"]');
  const equipo   = radioCon2?.checked
    ? (document.getElementById('inputEquipo')?.value.trim() || '—')
    : 'Sin equipo (se asigna automático)';

  document.getElementById('resumenPaso2').innerHTML =
    `<strong>Alias MP:</strong> ${alias} &nbsp;|&nbsp; <strong>Entrada:</strong> ${entrada}<br>
     <strong>Equipo:</strong> ${equipo}`;

  document.getElementById('modalStep1').style.display = 'none';
  document.getElementById('modalStep2').style.display = 'block';
  document.getElementById('stepDot1').classList.remove('active');
  document.getElementById('stepDot2').classList.add('active');
};

window.irPaso1 = function() {
  document.getElementById('modalStep2').style.display = 'none';
  document.getElementById('modalStep1').style.display = 'block';
  document.getElementById('stepDot2').classList.remove('active');
  document.getElementById('stepDot1').classList.add('active');
  document.getElementById('formError').style.display = 'none';
};
