// ============================================================
//  NEXUS ARENA — jugador.js  (perfil público de jugador)
// ============================================================
import { db } from './firebase.js';
import {
  collection, getDocs, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const params    = new URLSearchParams(window.location.search);
const jugadorId = params.get('id');

document.addEventListener('DOMContentLoaded', async () => {
  // Scroll nav
  window.addEventListener('scroll', () => {
    document.getElementById('nav')?.classList.toggle('scrolled', window.scrollY > 50);
  });

  if (!jugadorId) {
    mostrarError();
    return;
  }
  await cargarJugador();
});

async function cargarJugador() {
  try {
    const safe = p => p.catch(() => null);

    const [jugadorSnap, inscripSnap, torneosSnap] = await Promise.all([
      getDoc(doc(db, 'jugadores', jugadorId)),
      safe(getDocs(collection(db, 'inscripciones'))),
      safe(getDocs(collection(db, 'torneos'))),
    ]);

    if (!jugadorSnap.exists()) { mostrarError(); return; }

    const j = { id: jugadorSnap.id, ...jugadorSnap.data() };

    // Actualizar título
    document.title = 'NEXUS ARENA — ' + (j.gamertag || 'Jugador');

    // Avatar
    const avatarWrap = document.getElementById('jugadorAvatarWrap');
    if (j.foto) {
      const img = document.createElement('img');
      img.src = j.foto;
      img.className = 'jugador-avatar';
      img.alt = j.gamertag || '';
      img.onerror = function() {
        this.outerHTML = '<div class="jugador-avatar-placeholder">' + (j.gamertag || '?').charAt(0).toUpperCase() + '</div>';
      };
      avatarWrap.appendChild(img);
    } else {
      avatarWrap.innerHTML = '<div class="jugador-avatar-placeholder">' + (j.gamertag || '?').charAt(0).toUpperCase() + '</div>';
    }

    // Info básica
    document.getElementById('jugadorGamertag').textContent = j.gamertag || '—';
    document.getElementById('jugadorNombre').textContent   = j.nombre   || '';
    document.getElementById('jugadorPuntos').textContent   = j.ranking_points  || 0;
    document.getElementById('jugadorVictorias').textContent = j.victorias      || 0;
    document.getElementById('jugadorTorneos').textContent   = j.torneos_jugados || 0;

    // Ranking badge — calcular posición
    try {
      const todosSnap = await getDocs(collection(db, 'jugadores'));
      const todos = todosSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.ranking_points || 0) - (a.ranking_points || 0));
      const pos = todos.findIndex(x => x.id === jugadorId) + 1;
      if (pos > 0 && j.ranking_points > 0) {
        document.getElementById('jugadorRankingBadge').innerHTML =
          '<div class="ranking-badge" style="margin-bottom:12px">'
          + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>'
          + ' #' + pos + ' EN EL RANKING GLOBAL'
          + '</div>';
      }
    } catch (e) { /* silencioso */ }

    // Historial de torneos
    if (inscripSnap && torneosSnap) {
      const inscripciones = inscripSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(i => i.gamertag === j.gamertag || i.nombre === j.gamertag);

      const torneosMap = {};
      torneosSnap.docs.forEach(d => { torneosMap[d.id] = { id: d.id, ...d.data() }; });

      const historial = inscripciones
        .map(i => {
          const t = torneosMap[i.torneo_id];
          if (!t) return null;
          const esCampeon   = t.bracket?.ganador_final === j.gamertag;
          const esFinalista = t.bracket?.finalistas?.includes(j.gamertag) && !esCampeon;
          return {
            nombre:    t.nombre || i.torneo_nombre || '—',
            fecha:     t.fecha?.toDate ? t.fecha.toDate() : null,
            resultado: esCampeon ? 'campeon' : esFinalista ? 'finalista' : 'participante',
          };
        })
        .filter(Boolean)
        .sort((a, b) => (b.fecha?.getTime() || 0) - (a.fecha?.getTime() || 0));

      const grid = document.getElementById('historialGrid');
      if (historial.length === 0) {
        grid.innerHTML = '<p style="color:var(--muted);grid-column:1/-1">Sin torneos registrados todavía.</p>';
      } else {
        const labels = { campeon: 'Campeón', finalista: 'Finalista', participante: 'Participante' };
        grid.innerHTML = historial.map(h => {
          const fechaStr = h.fecha
            ? h.fecha.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
            : '';
          return '<div class="historial-card">'
            + '<div class="historial-torneo">' + h.nombre + '</div>'
            + (fechaStr ? '<div class="historial-fecha">' + fechaStr + '</div>' : '')
            + '<span class="historial-resultado ' + h.resultado + '">' + labels[h.resultado] + '</span>'
            + '</div>';
        }).join('');
      }
    }

    // Mostrar contenido
    document.getElementById('jugadorLoading').style.display = 'none';
    document.getElementById('jugadorContent').style.display = 'block';

  } catch (err) {
    console.error('cargarJugador error:', err);
    mostrarError();
  }
}

function mostrarError() {
  document.getElementById('jugadorLoading').style.display = 'none';
  document.getElementById('jugadorError').style.display   = 'block';
}
