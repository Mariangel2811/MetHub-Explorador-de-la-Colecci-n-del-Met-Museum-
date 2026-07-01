const COMPARE_MAX_RESULTS = 6;
const COMPARE_DEBOUNCE_MS = 400;

function renderCompareView(container, params, signal) {
  const title = document.createElement('h1');
  title.textContent = 'Comparador';
  container.appendChild(title);

  const panelsWrap = document.createElement('div');
  panelsWrap.className = 'compare-panels';
  container.appendChild(panelsWrap);

  const tableWrap = document.createElement('div');
  tableWrap.className = 'compare-table-wrap';
  tableWrap.hidden = true;
  container.appendChild(tableWrap);

  function _updateTable() {
    const artworkA = panelA.getArtwork();
    const artworkB = panelB.getArtwork();

    if (!artworkA || !artworkB) {
      tableWrap.hidden = true;
      ViewHelpers.clearElement(tableWrap);
      return;
    }

    tableWrap.hidden = false;
    ViewHelpers.clearElement(tableWrap);
    tableWrap.appendChild(_buildComparisonTable(artworkA, artworkB));
  }

  function _onSelectionChanged() {
    panelA.refreshDisabledAgainst(panelB.getArtwork()?.objectID ?? null);
    panelB.refreshDisabledAgainst(panelA.getArtwork()?.objectID ?? null);
    _updateTable();
  }

  const panelA = _buildComparePanel('A', signal, _onSelectionChanged);
  const panelB = _buildComparePanel('B', signal, _onSelectionChanged);
  panelsWrap.append(panelA.el, panelB.el);

  const presetId = ViewHelpers.readHashQueryParam('presetId');
  if (presetId) {
    MetAPI.getObject(presetId, { signal })
      .then((artwork) => {
        if (signal.aborted) return;
        panelA.setArtwork(artwork);
        _onSelectionChanged();
      })
      .catch((err) => {
        if (err.name === 'AbortError' || signal.aborted) return;
        console.error('Vitrae: fallo al precargar la obra en el comparador:', err);
        // No es crítico: el panel A simplemente queda en su buscador inicial.
      });
  }
}

/**
 * Construye un panel del comparador (A o B) con su propio estado
 * interno: modo búsqueda (input + cascada de mini-tarjetas) o modo
 * selección (obra fijada + botón "Cambiar").
 */
function _buildComparePanel(label, signal, onSelectionChanged) {
  const el = document.createElement('section');
  el.className = 'compare-panel';

  const heading = document.createElement('h2');
  heading.textContent = `Obra ${label}`;
  el.appendChild(heading);

  const body = document.createElement('div');
  body.className = 'compare-panel-body';
  el.appendChild(body);

  let currentArtwork = null;
  let lastDisabledId = null;
  let searchRequestId = 0;
  let debounceTimer = null;
  let lastCascadeArtworks = []; // para poder refrescar el disabled sin re-buscar

  _renderSearchMode();

  function _renderSearchMode() {
    ViewHelpers.clearElement(body);

    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'compare-search-input';
    input.placeholder = 'Busca una obra por nombre, artista, tema…';
    body.appendChild(input);

    const resultsArea = document.createElement('div');
    resultsArea.className = 'compare-results';
    body.appendChild(resultsArea);

    const hint = document.createElement('p');
    hint.className = 'compare-hint';
    hint.textContent = 'Busca y elige una obra para comparar.';
    resultsArea.appendChild(hint);

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const term = input.value.trim();

      if (!term) {
        lastCascadeArtworks = [];
        ViewHelpers.clearElement(resultsArea);
        resultsArea.appendChild(hint);
        return;
      }

      debounceTimer = setTimeout(() => _runSearch(term, resultsArea), COMPARE_DEBOUNCE_MS);
    });
  }

  async function _runSearch(term, resultsArea) {
    const requestId = ++searchRequestId;

    ViewHelpers.clearElement(resultsArea);
    resultsArea.appendChild(ViewHelpers.buildLoading('Buscando...'));

    try {
      const searchResult = await MetAPI.search({ q: term, hasImages: true }, { signal });
      if (signal.aborted || requestId !== searchRequestId) return;

      const ids = (searchResult.objectIDs || []).slice(0, COMPARE_MAX_RESULTS);

      if (ids.length === 0) {
        ViewHelpers.clearElement(resultsArea);
        const empty = document.createElement('p');
        empty.className = 'compare-hint';
        empty.textContent = 'No se encontraron obras con ese término.';
        resultsArea.appendChild(empty);
        lastCascadeArtworks = [];
        return;
      }

      const { artworks } = await MetAPI.resolveObjects(ids, { signal });
      if (signal.aborted || requestId !== searchRequestId) return;

      lastCascadeArtworks = artworks;
      _renderCascade(resultsArea, artworks);
    } catch (err) {
      if (err.name === 'AbortError' || signal.aborted || requestId !== searchRequestId) return;
      console.error(`Vitrae: fallo en la búsqueda del panel ${label}:`, err);
      ViewHelpers.clearElement(resultsArea);
      resultsArea.appendChild(
        ViewHelpers.buildError('No se pudo completar la búsqueda.', () => _runSearch(term, resultsArea))
      );
    }
  }

  function _renderCascade(resultsArea, artworks) {
    ViewHelpers.clearElement(resultsArea);

    artworks.forEach((artwork) => {
      const isDisabled = lastDisabledId != null && artwork.objectID === lastDisabledId;
      resultsArea.appendChild(_buildMiniCard(artwork, isDisabled, () => {
        if (isDisabled) return;
        setArtwork(artwork);
        onSelectionChanged();
      }));
    });
  }

  function setArtwork(artwork) {
    currentArtwork = artwork;
    _renderSelectedMode();
  }

  function _renderSelectedMode() {
    ViewHelpers.clearElement(body);

    const preview = document.createElement('div');
    preview.className = 'compare-selected-preview';

    const frame = document.createElement('div');
    frame.className = 'artwork-frame compare-selected-frame';
    const img = document.createElement('img');
    img.src = currentArtwork.primaryImageSmall || '';
    img.alt = currentArtwork.title || 'Obra sin título';
    frame.appendChild(img);
    preview.appendChild(frame);

    const info = document.createElement('div');
    const t = document.createElement('h3');
    t.textContent = currentArtwork.title || 'Sin título';
    const a = document.createElement('p');
    a.className = 'artwork-artist';
    a.textContent = currentArtwork.artistDisplayName || 'Artista desconocido';
    info.append(t, a);
    preview.appendChild(info);

    body.appendChild(preview);

    const changeBtn = document.createElement('button');
    changeBtn.type = 'button';
    changeBtn.className = 'btn btn-secondary';
    changeBtn.textContent = 'Cambiar';
    changeBtn.addEventListener('click', () => {
      currentArtwork = null;
      _renderSearchMode();
      onSelectionChanged();
    });
    body.appendChild(changeBtn);
  }

  return {
    el,
    getArtwork: () => currentArtwork,
    setArtwork,
    refreshDisabledAgainst(otherId) {
      lastDisabledId = otherId;
      // Si el panel sigue en modo búsqueda y ya tiene una cascada
      // renderizada, la re-pintamos para reflejar el nuevo disabled
      // sin tener que volver a pegarle a la API.
      if (!currentArtwork && lastCascadeArtworks.length > 0) {
        const resultsArea = body.querySelector('.compare-results');
        if (resultsArea) _renderCascade(resultsArea, lastCascadeArtworks);
      }
    },
  };
}

function _buildMiniCard(artwork, isDisabled, onClick) {
  const card = document.createElement('article');
  card.className = 'compare-mini-card' + (isDisabled ? ' is-disabled' : '');
  card.tabIndex = isDisabled ? -1 : 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-disabled', String(isDisabled));

  const img = document.createElement('img');
  img.src = artwork.primaryImageSmall || '';
  img.alt = artwork.title || 'Obra sin título';
  img.loading = 'lazy';
  card.appendChild(img);

  const info = document.createElement('div');
  info.className = 'compare-mini-card-info';
  const t = document.createElement('p');
  t.className = 'compare-mini-card-title';
  t.textContent = artwork.title || 'Sin título';
  const a = document.createElement('p');
  a.className = 'compare-mini-card-artist';
  a.textContent = artwork.artistDisplayName || 'Artista desconocido';
  info.append(t, a);
  card.appendChild(info);

  if (isDisabled) {
    const note = document.createElement('p');
    note.className = 'compare-mini-card-note';
    note.textContent = 'Ya está seleccionada en el otro panel';
    card.appendChild(note);
  } else {
    card.addEventListener('click', onClick);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    });
  }

  return card;
}

// ---------------------------------------------------------------------
// Tabla comparativa (sección 4.6.5)
// ---------------------------------------------------------------------

function _artworkYear(artwork) {
  const year = artwork.objectEndDate ?? artwork.objectBeginDate;
  return typeof year === 'number' ? year : null;
}

function _buildComparisonTable(artworkA, artworkB) {
  const wrap = document.createElement('div');

  const table = document.createElement('table');
  table.className = 'compare-table';

  const yearA = _artworkYear(artworkA);
  const yearB = _artworkYear(artworkB);

  const rows = [
    ['Artista', artworkA.artistDisplayName || 'Artista desconocido', artworkB.artistDisplayName || 'Artista desconocido'],
    ['Año', yearA != null ? String(yearA) : '—', yearB != null ? String(yearB) : '—'],
    ['Departamento', artworkA.department || '—', artworkB.department || '—'],
    ['Técnica', artworkA.medium || '—', artworkB.medium || '—'],
    ['Clasificación', artworkA.classification || '—', artworkB.classification || '—'],
    ['Cultura', artworkA.culture || '—', artworkB.culture || '—'],
    ['¿Es obra destacada?', artworkA.isHighlight ? 'Sí' : 'No', artworkB.isHighlight ? 'Sí' : 'No'],
    ['¿Dominio público?', artworkA.isPublicDomain ? 'Sí' : 'No', artworkB.isPublicDomain ? 'Sí' : 'No'],
  ];

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Atributo', artworkA.title || 'Obra A', artworkB.title || 'Obra B'].forEach((text) => {
    const th = document.createElement('th');
    th.textContent = text;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  rows.forEach(([label, valueA, valueB]) => {
    const tr = document.createElement('tr');
    if (valueA !== valueB) tr.classList.add('is-different');

    const th = document.createElement('th');
    th.textContent = label;
    tr.appendChild(th);

    [valueA, valueB].forEach((value) => {
      const td = document.createElement('td');
      td.textContent = value;
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  wrap.appendChild(table);

  if (yearA != null && yearB != null) {
    const diff = document.createElement('p');
    diff.className = 'compare-year-diff';
    diff.textContent = `Diferencia de ${Math.abs(yearA - yearB).toLocaleString('es-AR')} años entre ambas obras.`;
    wrap.appendChild(diff);
  }

  return wrap;
}
