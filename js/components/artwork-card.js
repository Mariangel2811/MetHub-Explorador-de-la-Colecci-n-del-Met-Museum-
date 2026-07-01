class ArtworkCard extends HTMLElement {
  connectedCallback() {
    this.classList.add('artwork-card');
    this.tabIndex = 0;
    this.setAttribute('role', 'button');
  }

  setData(artwork) {
    while (this.firstChild) this.removeChild(this.firstChild);

    const frame = document.createElement('div');
    frame.className = 'artwork-frame';

    const img = document.createElement('img');
    img.src = artwork.primaryImageSmall || '';
    img.alt = artwork.title || 'Obra sin título';
    img.loading = 'lazy';
    if (!artwork.primaryImageSmall) img.classList.add('no-image');
    frame.appendChild(img);
    this.appendChild(frame);

    const body = document.createElement('div');
    body.className = 'artwork-card-body';

    const titleEl = document.createElement('h3');
    titleEl.textContent = artwork.title || 'Sin título';
    body.appendChild(titleEl);

    const artistEl = document.createElement('p');
    artistEl.className = 'artwork-artist';
    artistEl.textContent = artwork.artistDisplayName || 'Artista desconocido';
    body.appendChild(artistEl);

    const metaEl = document.createElement('p');
    metaEl.className = 'artwork-meta';
    metaEl.textContent = `${artwork.objectDate || '—'} · ${artwork.department || '—'}`;
    body.appendChild(metaEl);

    this.appendChild(body);

    const goToDetail = () => window.appRouter.navigate(`detail/${artwork.objectID}`);
    this.onclick = goToDetail;
    this.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        goToDetail();
      }
    };
  }
}

customElements.define('artwork-card', ArtworkCard);
