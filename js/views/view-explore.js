const DEPARTMENT_PARAM = 'departmentId';
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_SLIDER_MIN = -2000; // 2000 a.C
const YEAR_SLIDER_MAX = CURRENT_YEAR;
const PAGE_SIZE = 12;

function renderExploreView(container, params, signal) {
  // Estado local de esta instancia de vista (se pierde al navegar,
  // que es justo lo esperado para filtros).
  const presetDeptId = ViewHelpers.readHashQueryParam('departmentId');

  const state = {
    q: '',
    departmentId: presetDeptId || '',
    yearMin: YEAR_SLIDER_MIN,
    yearMax: YEAR_SLIDER_MAX,
    isHighlight: false,
    hasImages: false,
    page: 1,
    allIds: [],
    total: 0,
  };

  const header = document.createElement('div');
  header.className = 'explore-header';
  const title = document.createElement('h1');
  title.textContent = 'Explorar la colección';
  header.appendChild(title);
  container.appendChild(header);

  const layout = document.createElement('div');
  layout.className = 'explore-layout';
  container.appendChild(layout);

  const filtersPanel = document.createElement('section');
  filtersPanel.className = 'filters-panel';
  filtersPanel.appendChild(ViewHelpers.buildLoading('Cargando filtros...'));
  layout.appendChild(filtersPanel);

  const aggregatesPanel = document.createElement('section');
  aggregatesPanel.className = 'aggregates-panel';
  layout.appendChild(aggregatesPanel);
  _renderAggregates(aggregatesPanel, null);

  const resultsSection = document.createElement('section');
  resultsSection.className = 'explore-results';
  container.appendChild(resultsSection);

  const galleryGrid = document.createElement('div');
  galleryGrid.className = 'gallery-grid';

  const galleryNote = document.createElement('p');
  galleryNote.className = 'gallery-partial-note';
  galleryNote.hidden = true;

  const pagination = _buildPaginationControls(() => _changePage(-1), () => _changePage(1));

  resultsSection.appendChild(galleryGrid);
  resultsSection.appendChild(galleryNote);
  resultsSection.appendChild(pagination.el);

  let controls = null;

  MetAPI.getDepartments({ signal })
    .then((data) => {
      if (signal.aborted) return;
      controls = _buildFiltersPanel(filtersPanel, data.departments, state, {
        onChange: () => _runSearch(true),
        onClear: () => _clearFilters(),
      });
      _runSearch(true);
    })
    .catch((err) => {
      if (err.name === 'AbortError' || signal.aborted) return;
      console.error('Vitrae: fallo al cargar departamentos para filtros:', err);
      ViewHelpers.clearElement(filtersPanel);
      filtersPanel.appendChild(
        ViewHelpers.buildError('No se pudo cargar el panel de filtros.', () =>
          renderExploreView(container, params, signal)
        )
      );
    });

  function _clearFilters() {
    state.q = '';
    state.departmentId = '';
    state.yearMin = YEAR_SLIDER_MIN;
    state.yearMax = YEAR_SLIDER_MAX;
    state.isHighlight = false;
    state.hasImages = false;
    if (controls) controls.resetInputs();
    _runSearch(true);
  }

  let isBusy = false; // 6.3: evita disparar una segunda búsqueda/página mientras una está en curso

  function _changePage(delta) {
    if (isBusy) return;
    const totalPages = Math.max(1, Math.ceil(state.allIds.length / PAGE_SIZE));
    const next = state.page + delta;
    if (next < 1 || next > totalPages) return;
    state.page = next;
    _loadCurrentPage();
  }

  async function _runSearch(resetPage) {
    if (resetPage) state.page = 1;
    isBusy = true;
    pagination.setBusy(true);

    ViewHelpers.clearElement(galleryGrid);
    galleryGrid.appendChild(ViewHelpers.buildLoading('Buscando obras...'));
    galleryNote.hidden = true;
    _renderAggregates(aggregatesPanel, null);

    try {
      const searchParams = { q: state.q || ' ' };
      if (state.hasImages) searchParams.hasImages = true;
      if (state.departmentId) searchParams[DEPARTMENT_PARAM] = state.departmentId;
      if (state.isHighlight) searchParams.isHighlight = true;
      if (state.yearMin !== YEAR_SLIDER_MIN || state.yearMax !== YEAR_SLIDER_MAX) {
        searchParams.dateBegin = state.yearMin;
        searchParams.dateEnd = state.yearMax;
      }

      const result = await MetAPI.search(searchParams, { signal });
      if (signal.aborted) return;

      state.allIds = result.objectIDs || [];
      state.total = result.total || 0;

      if (state.allIds.length === 0) {
        ViewHelpers.clearElement(galleryGrid);
        const empty = document.createElement('p');
        empty.className = 'empty-message';
        empty.textContent = 'No se encontraron obras con los filtros aplicados.';
        galleryGrid.appendChild(empty);
        _renderAggregates(aggregatesPanel, { total: 0, artworks: [] });
        pagination.setPage(1, 1);
        return;
      }

      await _loadCurrentPage();
    } catch (err) {
      if (err.name === 'AbortError' || signal.aborted) return;
      console.error('Vitrae: fallo en la búsqueda de #explore:', err);
      ViewHelpers.clearElement(galleryGrid);
      galleryGrid.appendChild(
        ViewHelpers.buildError(`No se pudo completar la búsqueda (${err.message || 'error de red'}).`, () =>
          _runSearch(resetPage)
        )
      );
    } finally {
      isBusy = false;
      pagination.setBusy(false);
    }
  }

  async function _loadCurrentPage() {
    isBusy = true;
    pagination.setBusy(true);
    ViewHelpers.clearElement(galleryGrid);
    galleryGrid.appendChild(ViewHelpers.buildLoading('Cargando obras...'));

    try {
      const startIdx = (state.page - 1) * PAGE_SIZE;
      const pageIds = state.allIds.slice(startIdx, startIdx + PAGE_SIZE);

      const { artworks, failedCount } = await MetAPI.resolveObjects(pageIds, { signal });
      if (signal.aborted) return;

      ViewHelpers.clearElement(galleryGrid);

      if (artworks.length === 0) {
        galleryGrid.appendChild(
          ViewHelpers.buildError('No se pudo cargar ninguna obra de esta página.', () => _loadCurrentPage())
        );
      } else {
        artworks.forEach((artwork) => {
          const card = document.createElement('artwork-card');
          card.setData(artwork);
          galleryGrid.appendChild(card);
        });
      }

      galleryNote.hidden = failedCount === 0;
      if (failedCount > 0) {
        galleryNote.textContent = `${failedCount} obra(s) no pudieron cargarse y fueron omitidas.`;
      }

      pagination.setPage(state.page, Math.max(1, Math.ceil(state.allIds.length / PAGE_SIZE)));
      _renderAggregates(aggregatesPanel, { total: state.total, artworks });
    } finally {
      isBusy = false;
      pagination.setBusy(false);
    }
  }
}

// ---------------------------------------------------------------------
// Panel de filtros (sección 4.2.1)
// ---------------------------------------------------------------------

function _buildFiltersPanel(panelEl, departments, state, { onChange, onClear }) {
  ViewHelpers.clearElement(panelEl);

  const heading = document.createElement('h2');
  heading.textContent = 'Filtros';
  panelEl.appendChild(heading);

  // Búsqueda por texto (con debounce, para no disparar una petición por tecla)
  const searchGroup = document.createElement('div');
  searchGroup.className = 'filter-group';
  const searchLabel = document.createElement('label');
  searchLabel.textContent = 'Buscar';
  searchLabel.htmlFor = 'filter-q';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.id = 'filter-q';
  searchInput.placeholder = 'Título, artista, tema…';
  searchGroup.append(searchLabel, searchInput);
  panelEl.appendChild(searchGroup);

  let debounceTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.q = searchInput.value.trim();
      onChange();
    }, 400);
  });

  // Departamento
  const deptGroup = document.createElement('div');
  deptGroup.className = 'filter-group';
  const deptLabel = document.createElement('label');
  deptLabel.textContent = 'Departamento';
  deptLabel.htmlFor = 'filter-dept';
  const deptSelect = document.createElement('select');
  deptSelect.id = 'filter-dept';

  const anyOption = document.createElement('option');
  anyOption.value = '';
  anyOption.textContent = 'Todos los departamentos';
  deptSelect.appendChild(anyOption);

  departments.forEach((dept) => {
    const opt = document.createElement('option');
    opt.value = dept.departmentId;
    opt.textContent = dept.displayName;
    deptSelect.appendChild(opt);
  });

  deptSelect.value = state.departmentId || '';
  deptGroup.append(deptLabel, deptSelect);
  panelEl.appendChild(deptGroup);

  deptSelect.addEventListener('change', () => {
    state.departmentId = deptSelect.value;
    onChange();
  });

  // Rango de años (doble slider)
  const yearGroup = document.createElement('div');
  yearGroup.className = 'filter-group';
  const yearLabel = document.createElement('label');
  yearLabel.textContent = 'Período';
  yearGroup.appendChild(yearLabel);

  const yearDisplay = document.createElement('div');
  yearDisplay.className = 'year-range-display';
  const yearMinSpan = document.createElement('span');
  const yearSep = document.createElement('span');
  yearSep.textContent = '—';
  const yearMaxSpan = document.createElement('span');
  yearDisplay.append(yearMinSpan, yearSep, yearMaxSpan);
  yearGroup.appendChild(yearDisplay);

  const sliderWrap = document.createElement('div');
  sliderWrap.className = 'year-slider';

  const trackFill = document.createElement('div');
  trackFill.className = 'year-slider-fill';
  sliderWrap.appendChild(trackFill);

  const minRange = document.createElement('input');
  minRange.type = 'range';
  minRange.min = YEAR_SLIDER_MIN;
  minRange.max = YEAR_SLIDER_MAX;
  minRange.value = state.yearMin;
  minRange.className = 'year-range-input year-range-min';
  minRange.setAttribute('aria-label', 'Año inicial');

  const maxRange = document.createElement('input');
  maxRange.type = 'range';
  maxRange.min = YEAR_SLIDER_MIN;
  maxRange.max = YEAR_SLIDER_MAX;
  maxRange.value = state.yearMax;
  maxRange.className = 'year-range-input year-range-max';
  maxRange.setAttribute('aria-label', 'Año final');

  sliderWrap.append(minRange, maxRange);
  yearGroup.appendChild(sliderWrap);
  panelEl.appendChild(yearGroup);

  function _formatYear(y) {
    return y < 0 ? `${Math.abs(y)} a.C.` : `${y} d.C.`;
  }

  function _updateYearUI() {
    yearMinSpan.textContent = _formatYear(state.yearMin);
    yearMaxSpan.textContent = _formatYear(state.yearMax);
    const range = YEAR_SLIDER_MAX - YEAR_SLIDER_MIN;
    const leftPct = ((state.yearMin - YEAR_SLIDER_MIN) / range) * 100;
    const rightPct = ((state.yearMax - YEAR_SLIDER_MIN) / range) * 100;
    trackFill.style.left = `${leftPct}%`;
    trackFill.style.right = `${100 - rightPct}%`;
  }
  _updateYearUI();

  let yearDebounce = null;
  function _onYearInput() {
    let min = Number(minRange.value);
    let max = Number(maxRange.value);
    if (min > max) [min, max] = [max, min]; // evita que las cabezas se crucen
    state.yearMin = min;
    state.yearMax = max;
    _updateYearUI();

    clearTimeout(yearDebounce);
    yearDebounce = setTimeout(onChange, 400);
  }
  minRange.addEventListener('input', _onYearInput);
  maxRange.addEventListener('input', _onYearInput);

  // Checkboxes
  const highlightLabel = document.createElement('label');
  highlightLabel.className = 'filter-checkbox';
  const highlightInput = document.createElement('input');
  highlightInput.type = 'checkbox';
  highlightInput.checked = state.isHighlight;
  highlightLabel.append(highlightInput, document.createTextNode(' Solo obras destacadas'));
  panelEl.appendChild(highlightLabel);

  highlightInput.addEventListener('change', () => {
    state.isHighlight = highlightInput.checked;
    onChange();
  });

  const imagesLabel = document.createElement('label');
  imagesLabel.className = 'filter-checkbox';
  const imagesInput = document.createElement('input');
  imagesInput.type = 'checkbox';
  imagesInput.checked = state.hasImages;
  imagesLabel.append(imagesInput, document.createTextNode(' Solo con imagen'));
  panelEl.appendChild(imagesLabel);

  imagesInput.addEventListener('change', () => {
    state.hasImages = imagesInput.checked;
    onChange();
  });

  // Limpiar filtros
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'btn btn-secondary filter-clear-btn';
  clearBtn.textContent = 'Limpiar filtros';
  clearBtn.addEventListener('click', onClear);
  panelEl.appendChild(clearBtn);

  return {
    resetInputs() {
      searchInput.value = '';
      deptSelect.value = '';
      minRange.value = YEAR_SLIDER_MIN;
      maxRange.value = YEAR_SLIDER_MAX;
      highlightInput.checked = false;
      imagesInput.checked = false;
      _updateYearUI();
    },
  };
}

// ---------------------------------------------------------------------
// Panel de agregados en vivo (sección 4.2.2)
// ---------------------------------------------------------------------

function _renderAggregates(panelEl, data) {
  ViewHelpers.clearElement(panelEl);

  const heading = document.createElement('h2');
  heading.textContent = 'Agregados';
  panelEl.appendChild(heading);

  const note = document.createElement('p');
  note.className = 'aggregates-note';
  note.textContent = 'Agregados calculados sobre los visibles. Total se refiere al search completo.';
  panelEl.appendChild(note);

  const list = document.createElement('dl');
  list.className = 'aggregates-list';

  const rows = data
    ? [
        ['Total de resultados', data.total.toLocaleString('es-AR')],
        ['Cargados', String(data.artworks.length)],
        ['Departamento dominante', _mostFrequent(data.artworks, (a) => a.department)],
        ['Siglo más frecuente', _mostFrequentCentury(data.artworks)],
        ['Cultura más frecuente', _mostFrequent(data.artworks, (a) => a.culture)],
      ]
    : [
        ['Total de resultados', '—'],
        ['Cargados', '—'],
        ['Departamento dominante', '—'],
        ['Siglo más frecuente', '—'],
        ['Cultura más frecuente', '—'],
      ];

  rows.forEach(([label, value]) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    list.append(dt, dd);
  });

  panelEl.appendChild(list);
}

/** Valor más frecuente de keyFn(item) entre los items, ignorando vacíos. */
function _mostFrequent(items, keyFn) {
  const counts = new Map();
  items.forEach((item) => {
    const value = keyFn(item);
    if (!value) return;
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  if (counts.size === 0) return '—';
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function _mostFrequentCentury(artworks) {
  const centuries = artworks
    .map((a) => {
      const year = a.objectBeginDate ?? a.objectEndDate;
      return typeof year === 'number' ? _yearToCenturyLabel(year) : null;
    })
    .filter(Boolean);

  const counts = new Map();
  centuries.forEach((c) => counts.set(c, (counts.get(c) || 0) + 1));
  if (counts.size === 0) return '—';
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function _yearToCenturyLabel(year) {
  if (year === 0) return 'Siglo I a.C.';
  const isBC = year < 0;
  const absYear = Math.abs(year);
  const century = Math.ceil(absYear / 100);
  return `Siglo ${_toRoman(century)}${isBC ? ' a.C.' : ''}`;
}

function _toRoman(num) {
  const map = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let n = num;
  let result = '';
  for (const [value, symbol] of map) {
    while (n >= value) {
      result += symbol;
      n -= value;
    }
  }
  return result;
}

// ---------------------------------------------------------------------
// Paginación (sección 4.2.3)
// ---------------------------------------------------------------------

function _buildPaginationControls(onPrev, onNext) {
  const el = document.createElement('div');
  el.className = 'pagination';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'btn btn-secondary';
  prevBtn.textContent = '← Anterior';
  prevBtn.addEventListener('click', onPrev);

  const indicator = document.createElement('span');
  indicator.className = 'pagination-indicator';

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn btn-secondary';
  nextBtn.textContent = 'Siguiente →';
  nextBtn.addEventListener('click', onNext);

  el.append(prevBtn, indicator, nextBtn);

  return {
    el,
    setPage(page, totalPages) {
      indicator.textContent = `Página ${page} de ${totalPages}`;
      prevBtn.disabled = page <= 1;
      nextBtn.disabled = page >= totalPages;
    },
    setBusy(busy) {
      if (busy) {
        prevBtn.disabled = true;
        nextBtn.disabled = true;
      }
      // Al terminar, setPage() vuelve a calcular el disabled correcto según los límites reales de la paginación.
    },
  };
}
