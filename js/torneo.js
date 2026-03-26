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

    // Actualizar Open Graph meta tags para preview en Facebook/WhatsApp
    actualizarOGTags(torneoData);

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
  const premio = t.precio === 0 ? 0 : (t.premio || Math.round(t.cupos_total * (t.precio || 0) * 0.8));

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

  // Premio — ocultar todo si es torneo gratuito
  const esGratis = t.precio === 0;
  const prizeBigEl    = document.getElementById('prizeBigWrap');
  const aliasBlockEl  = document.getElementById('aliasBlock');
  const aliasValEl    = document.getElementById('aliasVal');
  const terminosEl    = document.getElementById('terminosTC');
  const galardonEl    = document.getElementById('galardonNote');

  const precioEntradaWrap = document.getElementById('precioEntradaWrap');

  if (esGratis) {
    // Ocultar TODO lo de dinero
    if (prizeBigEl)        prizeBigEl.style.display        = 'none';
    if (aliasBlockEl)      aliasBlockEl.style.display      = 'none';
    if (terminosEl)        terminosEl.style.display        = 'none';
    if (precioEntradaWrap) precioEntradaWrap.style.display = 'none';

    // Mostrar banner especial de torneo gratuito
    const precioShowEl = document.getElementById('precioShow');
    if (precioShowEl) {
      precioShowEl.textContent = 'GRATIS';
      precioShowEl.style.color = 'var(--acid)';
    }
    // Nota HOF épica para torneos gratuitos
    if (galardonEl) {
      galardonEl.innerHTML = '<strong style="color:var(--acid)">Entrada libre.</strong> Ganá y tu nombre queda grabado para siempre en el Hall of Fame de Nexus Arena.';
    }
  } else {
    if (prizeBigEl)        prizeBigEl.style.display        = '';
    if (aliasBlockEl)      aliasBlockEl.style.display      = 'block';
    if (terminosEl)        terminosEl.style.display        = '';
    if (precioEntradaWrap) precioEntradaWrap.style.display = '';

    document.getElementById('premioBig').textContent  = '$' + premio.toLocaleString('es-AR');
    document.getElementById('precioShow').textContent = '$' + (t.precio || 0).toLocaleString('es-AR');
    if (aliasValEl) aliasValEl.textContent = t.alias_mp || 'Nexus.arena';
    if (terminosEl) terminosEl.textContent =
      '* El premio de $' + premio.toLocaleString('es-AR') + ' se acredita únicamente al llenarse el cupo de ' + t.cupos_total + ' jugadores. Sin cupo completo el monto puede variar proporcionalmente. Premio acreditado en hasta 48hs hábiles post-torneo. Evento privado.';
  }
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
  const premio = t.precio === 0 ? 0 : (t.premio || Math.round(t.cupos_total * (t.precio || 0) * 0.8));

  const fechaStr = t.fecha?.toDate
    ? t.fecha.toDate().toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';

  document.getElementById('modalTitle').textContent   = 'INSCRIPCIÓN — ' + t.nombre.toUpperCase();
  document.getElementById('modalGame').textContent    = t.nombre;
  document.getElementById('modalDate').textContent    = fechaStr;
  document.getElementById('modalMode').textContent    = t.modalidad === 'presencial' ? 'Presencial — Villa de Mayo' : 'Online';
  const esGratisModal = t.precio === 0;

  // Premio en modal — ocultar bloque completo si es gratis
  const modalPrizeBlock = document.querySelector('.modal-prize-block');
  const modalPrizeEl    = document.getElementById('modalPrize');
  if (esGratisModal) {
    if (modalPrizeBlock) modalPrizeBlock.style.display = 'none';
  } else {
    if (modalPrizeBlock) modalPrizeBlock.style.display = '';
    if (modalPrizeEl) modalPrizeEl.textContent = '$' + premio.toLocaleString('es-AR');
    document.getElementById('modalEntrada').textContent = '$' + (t.precio || 0).toLocaleString('es-AR');
    document.getElementById('modalPremioTC').textContent = '$' + premio.toLocaleString('es-AR');
    document.getElementById('modalCuposTC').textContent  = t.cupos_total;
  }

  // Términos del modal — ocultar si es gratis
  const modalTC = document.querySelector('.modal-terminos');
  if (modalTC) modalTC.style.display = esGratisModal ? 'none' : '';

  // Nota galardon en modal — cambiar si es gratis
  const modalGalardonNote = document.querySelector('.modal-galardon-note');
  if (modalGalardonNote && esGratisModal) {
    modalGalardonNote.innerHTML = '<strong style="color:var(--acid)">Entrada libre.</strong> Ganá y tu nombre queda grabado en el Hall of Fame de Nexus Arena.';
  }

  // Alias MP — ocultar si es gratis
  const aliasBlock = document.getElementById('modalAliasBlock');
  const aliasEl    = document.getElementById('modalAlias');
  if (aliasBlock) {
    if (esGratisModal) {
      aliasBlock.style.display = 'none';
    } else {
      aliasEl.textContent      = t.alias_mp || 'Nexus.arena';
      aliasBlock.style.display = 'block';
    }
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
  const tPrecio  = torneoData.precio || 0;
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


// ── OPEN GRAPH + COMPARTIR ───────────────────────────────────

function actualizarOGTags(t) {
  const base    = 'https://lacajamisteriosoficial-cloud.github.io/nexus-arena';
  const url     = `${base}/torneo.html?id=${t.id}`;
  const imagen  = t.imagen || `${base}/logo.png`;

  const fechaStr = t.fecha?.toDate
    ? t.fecha.toDate().toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : '';

  const esGratis = (t.precio || 0) === 0;
  const entradaStr = esGratis ? 'GRATIS' : `$${(t.precio).toLocaleString('es-AR')}`;
  const modalidad  = t.modalidad === 'presencial' ? 'Presencial — Villa de Mayo' : 'Online';

  const titulo = `${t.nombre} — NEXUS ARENA`;
  const desc   = `${fechaStr ? fechaStr + ' · ' : ''}${modalidad} · Entrada: ${entradaStr}. ¡Inscribite ahora en Nexus Arena!`;

  // Actualizar meta tags
  const setMeta = (id, attr, val) => {
    const el = document.getElementById(id);
    if (el) el.setAttribute(attr, val);
  };
  setMeta('ogTitle',       'content', titulo);
  setMeta('ogDescription', 'content', desc);
  setMeta('ogImage',       'content', imagen);
  setMeta('ogUrl',         'content', url);
  setMeta('twTitle',       'content', titulo);
  setMeta('twDescription', 'content', desc);
  setMeta('twImage',       'content', imagen);

  // Guardar URL para el botón compartir
  window._torneoShareUrl   = url;
  window._torneoShareTitulo = titulo;
  window._torneoShareDesc   = desc;
  window._torneoShareImagen = imagen;
}

window.compartirTorneo = function() {
  const url    = window._torneoShareUrl    || window.location.href;
  const titulo = window._torneoShareTitulo || document.title;
  const desc   = window._torneoShareDesc   || '';

  // Si el navegador soporta Web Share API (móvil)
  if (navigator.share) {
    navigator.share({ title: titulo, text: desc, url }).catch(() => {});
    return;
  }

  // Desktop: mostrar panel con opciones
  mostrarPanelCompartir(url, titulo);
};

function mostrarPanelCompartir(url, titulo) {
  // Eliminar panel anterior si existe
  document.getElementById('sharePanel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'sharePanel';
  panel.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,0.7);
    display:flex; align-items:center; justify-content:center;
    z-index:9999; padding:20px;
  `;

  const fbUrl  = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  const waUrl  = `https://wa.me/?text=${encodeURIComponent(titulo + '\n' + url)}`;

  panel.innerHTML = `
    <div style="background:var(--dark3);border:1px solid rgba(200,255,0,0.25);padding:36px;max-width:420px;width:100%;position:relative">
      <button onclick="document.getElementById('sharePanel').remove()"
        style="position:absolute;top:14px;right:14px;background:none;border:none;color:var(--muted);font-size:1.2rem;cursor:pointer;line-height:1">✕</button>

      <div style="font-family:'Bebas Neue',sans-serif;font-size:1.6rem;letter-spacing:3px;color:#fff;margin-bottom:6px">COMPARTIR TORNEO</div>
      <div style="font-size:0.75rem;color:var(--muted);margin-bottom:24px;letter-spacing:1px">Cuando pegás el link en Facebook, se muestra la imagen del torneo automáticamente.</div>

      <!-- Preview del link -->
      <div style="background:var(--dark);border:1px solid var(--gray);padding:14px 16px;margin-bottom:20px;font-size:0.78rem">
        <div style="color:var(--acid);font-size:0.65rem;letter-spacing:2px;margin-bottom:6px">LINK DEL TORNEO</div>
        <div style="color:#fff;word-break:break-all;font-family:monospace;font-size:0.72rem">${url}</div>
      </div>

      <!-- Botones -->
      <div style="display:flex;flex-direction:column;gap:10px">

        <!-- Facebook -->
        <a href="${fbUrl}" target="_blank" rel="noopener"
          style="display:flex;align-items:center;gap:14px;padding:14px 18px;background:#1877F2;color:#fff;text-decoration:none;font-family:'Barlow Condensed',sans-serif;font-size:0.9rem;letter-spacing:2px;font-weight:700;clip-path:polygon(7px 0%,100% 0%,calc(100% - 7px) 100%,0% 100%);transition:opacity 0.2s"
          onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
          COMPARTIR EN FACEBOOK
        </a>

        <!-- WhatsApp -->
        <a href="${waUrl}" target="_blank" rel="noopener"
          style="display:flex;align-items:center;gap:14px;padding:14px 18px;background:#25D366;color:#fff;text-decoration:none;font-family:'Barlow Condensed',sans-serif;font-size:0.9rem;letter-spacing:2px;font-weight:700;clip-path:polygon(7px 0%,100% 0%,calc(100% - 7px) 100%,0% 100%);transition:opacity 0.2s"
          onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
          ENVIAR POR WHATSAPP
        </a>

        <!-- Copiar link -->
        <button id="btnCopyLink"
          onclick="navigator.clipboard.writeText('${url}').then(()=>{this.textContent='¡Copiado!';this.style.borderColor='var(--acid)';this.style.color='var(--acid)';setTimeout(()=>{this.textContent='COPIAR LINK';this.style.borderColor='var(--gray)';this.style.color='var(--muted)'},2000})"
          style="display:flex;align-items:center;justify-content:center;gap:10px;padding:12px 18px;background:transparent;border:1px solid var(--gray);color:var(--muted);font-family:'Barlow Condensed',sans-serif;font-size:0.85rem;letter-spacing:2px;cursor:pointer;clip-path:polygon(7px 0%,100% 0%,calc(100% - 7px) 100%,0% 100%);transition:all 0.2s"
          onmouseover="this.style.borderColor='var(--text)';this.style.color='var(--text)'" onmouseout="this.style.borderColor='var(--gray)';this.style.color='var(--muted)'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          COPIAR LINK
        </button>
      </div>

      <p style="font-size:0.7rem;color:rgba(255,255,255,0.2);margin-top:16px;line-height:1.6">
        Al pegar el link en Facebook aparece automáticamente la imagen del torneo, el nombre y la descripción.
      </p>
    </div>
  `;

  panel.addEventListener('click', e => { if (e.target === panel) panel.remove(); });
  document.body.appendChild(panel);
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
