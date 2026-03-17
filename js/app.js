function buildCard(t) {
  const pct   = t.cupos_total > 0 ? (t.cupos_ocupados / t.cupos_total) * 100 : 0;
  const libre = t.cupos_total - (t.cupos_ocupados || 0);

  const statusMap = {
    open:     { cls: 'status-open',     label: 'Inscripci\u00f3n Abierta' },
    soon:     { cls: 'status-soon',     label: 'Pr\u00f3ximamente' },
    full:     { cls: 'status-full',     label: 'Cupos llenos' },
    finished: { cls: 'status-finished', label: 'Finalizado' },
  };
  const platMap = { mobile: 'Mobile', console: 'Consola', pc: 'PC / Cross' };

  const st        = statusMap[t.estado] || statusMap.soon;
  const plt       = platMap[t.plataforma] || t.plataforma || '';
  const fillClass = pct >= 87 ? 'danger' : pct >= 60 ? 'warning' : '';
  const canJoin   = t.estado === 'open' && libre > 0;
  const btnLabel  = !canJoin
    ? (t.estado === 'full' ? 'Sin cupos' : t.estado === 'soon' ? 'A\u00fan no disponible' : 'Finalizado')
    : (libre <= 3 ? '\u00a1\u00daltimos ' + libre + ' cupos!' : 'Inscribirme');

  const fechaStr = t.fecha && t.fecha.toDate
    ? t.fecha.toDate().toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';

  const cardTop = t.imagen
    ? '<img src="' + t.imagen + '" alt="' + t.nombre + '" style="width:100%;height:100%;object-fit:cover;display:block" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">'
    + '<div class="card-game-bg ' + (t.plataforma || 'console') + '" style="display:none;position:absolute;inset:0">' + (t.emoji || '') + '</div>'
    : '<div class="card-game-bg ' + (t.plataforma || 'console') + '">' + (t.emoji || '') + '</div>';

  return '<div class="tournament-card" data-cat="' + (t.categoria || '') + '">'
    + '<div class="card-top" style="position:relative">'
    + cardTop
    + '<span class="card-status ' + st.cls + '">' + st.label + '</span>'
    + '<span class="card-platform">' + plt + '</span>'
    + '<div class="card-overlay"></div>'
    + '</div>'
    + '<div class="card-body">'
    + '<div class="card-date">' + fechaStr + '</div>'
    + '<div class="card-title">' + t.nombre + '</div>'
    + '<div class="card-subtitle">' + (t.subtitulo || '') + '</div>'
    + '<div class="card-meta">'
    + '<div class="meta-item"><span class="meta-label">Modalidad</span><span class="meta-value">' + (t.modalidad === 'presencial' ? 'Presencial' : 'Online') + '</span></div>'
    + '<div class="meta-item"><span class="meta-label">Cupos libres</span><span class="meta-value" style="' + (libre <= 3 ? 'color:var(--red)' : '') + '">' + libre + '</span></div>'
    + '</div>'
    + '<div class="slots-bar">'
    + '<div class="slots-info"><span>Cupos</span><span>' + (t.cupos_ocupados || 0) + ' / ' + t.cupos_total + '</span></div>'
    + '<div class="slots-track"><div class="slots-fill ' + fillClass + '" style="width:' + pct + '%"></div></div>'
    + '</div>'
    + '<div class="card-footer">'
    + '<button class="btn-inscribir ' + (canJoin ? 'available' : 'disabled') + '" '
    + (canJoin ? 'onclick="window.location=\'torneo.html?id=' + t.id + '\'"' : 'disabled') + '>' + btnLabel + '</button>'
    + '</div>'
    + '</div>'
    + '</div>';
}

