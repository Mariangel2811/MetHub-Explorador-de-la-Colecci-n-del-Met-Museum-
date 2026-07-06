const ARTIST_PAGE_SIZE = 12;

function renderArtistView(container, params, signal) {
  const state = { page: 1, allIds: [], total: 0 };

  const backWrap = document.createElement('div');
  backWrap.className = 'artist-back-wrap';
  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'btn btn-secondary';
  backBtn.textContent = '← Volver';
  backBtn.addEventListener('click', () => window.history.back());
  backWrap.appendChild(backBtn);
  container.appendChild(backWrap);

  const header = document.createElement('div');
  header.className = 'artist-header';
  header.appendChild(ViewHelpers.buildLoading('Cargando obras del artista...'));
  container.appendChild(header);

  const galleryGrid = document.createElement('div');
  galleryGrid.className = 'gallery-grid';

  const galleryNote = document.createElement('p');
  galleryNote.className = 'gallery-partial-note';
  galleryNote.hidden = true;

  const pagination = _buildPagination(() => _changePage(-1), () => _changePage(1));

  container.appendChild(galleryGrid);
  container.appendChild(galleryNote);
  container.appendChild(pagination.el);

  _search();

  async function _search() {
    try {
      // Use a plain q search (same strategy as explore view). The artistOrCulture
      // flag is a full-text hint in the Met API and actually reduces recall for
      // many artists (e.g. "Lambert Suavius" returns 0 results with it on).
      const result = await MetAPI.search({ q: params.name }, { signal });
      if (signal.aborted) return;

      state.allIds = result.objectIDs || [];
      state.total = result.total || 0;

      _renderHeader(header, params.name, state.total);

      if (state.allIds.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'empty-message';
        empty.textContent = `No se encontraron obras asociadas a "${params.name}" en la colección.`;
        galleryGrid.appendChild(empty);
        return;
      }

      await _loadPage();
    } catch (err) {
      if (err.name === 'AbortError' || signal.aborted) return;
      console.error('Vitrae: fallo al buscar obras del artista:', err);
      ViewHelpers.clearElement(header);
      header.appendChild(
        ViewHelpers.buildError(`No se pudieron cargar las obras del artista (${err.message || 'error de red'}).`, _search)
      );
    }
  }

  async function _loadPage() {
    isBusy = true;
    pagination.setBusy(true);
    ViewHelpers.clearElement(galleryGrid);
    galleryGrid.appendChild(ViewHelpers.buildLoading('Cargando obras...'));

    try {
      const start = (state.page - 1) * ARTIST_PAGE_SIZE;
      const pageIds = state.allIds.slice(start, start + ARTIST_PAGE_SIZE);
      const { artworks: resolvedArtworks, failedCount } = await MetAPI.resolveObjects(pageIds, { signal });
      const nameLower = params.name.toLowerCase();
      const artworks = resolvedArtworks.filter(
        (a) => a.artistDisplayName && a.artistDisplayName.toLowerCase().includes(nameLower)
      );
      if (signal.aborted) return;

      ViewHelpers.clearElement(galleryGrid);

      if (artworks.length === 0) {
        galleryGrid.appendChild(
          ViewHelpers.buildError('No se pudo cargar ninguna obra de esta página.', _loadPage)
        );
      } else {
        artworks.forEach((artwork) => {
          const card = document.createElement('artwork-card');
          card.setData(artwork);
          galleryGrid.appendChild(card);
        });

        // Si alguna obra trae bio del artista, la mostramos en la cabecera
        // (4.5.1: "si la API devuelve artistDisplayBio en alguna obra del
        // artista, mostrar esa bio como descripción").
        const withBio = artworks.find((a) => a.artistDisplayBio);
        if (withBio) _appendBio(header, withBio.artistDisplayBio);
      }

      galleryNote.hidden = failedCount === 0;
      if (failedCount > 0) {
        galleryNote.textContent = `${failedCount} obra(s) no pudieron cargarse y fueron omitidas.`;
      }

      pagination.setPage(state.page, Math.max(1, Math.ceil(state.allIds.length / ARTIST_PAGE_SIZE)));
    } finally {
      isBusy = false;
      pagination.setBusy(false);
    }
  }

  let isBusy = false; // 6.3: evita doble navegación de página mientras carga

  function _changePage(delta) {
    if (isBusy) return;
    const totalPages = Math.max(1, Math.ceil(state.allIds.length / ARTIST_PAGE_SIZE));
    const next = state.page + delta;
    if (next < 1 || next > totalPages) return;
    state.page = next;
    _loadPage();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function _renderHeader(headerEl, name, total) {
  ViewHelpers.clearElement(headerEl);

  const title = document.createElement('h1');
  title.textContent = name;
  headerEl.appendChild(title);

  const totalEl = document.createElement('p');
  totalEl.className = 'artist-total';
  totalEl.textContent = `${total.toLocaleString('es-AR')} obra(s) encontradas en la colección.`;
  headerEl.appendChild(totalEl);
}

function _appendBio(headerEl, bio) {
  if (headerEl.querySelector('.artist-bio')) return; // ya se agregó
  const bioEl = document.createElement('p');
  bioEl.className = 'artist-bio';
  bioEl.textContent = bio;
  headerEl.appendChild(bioEl);
}

function _buildPagination(onPrev, onNext) {
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
    },
  };
}
