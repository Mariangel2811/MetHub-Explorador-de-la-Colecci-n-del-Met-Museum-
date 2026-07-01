class LoadingState extends HTMLElement {
  static get observedAttributes() {
    return ['message'];
  }

  connectedCallback() {
    this.classList.add('loading-state');
    this._render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this._render();
  }

  _render() {
    while (this.firstChild) this.removeChild(this.firstChild);

    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    this.appendChild(spinner);

    const text = document.createElement('p');
    text.className = 'loading-text';
    text.textContent = this.getAttribute('message') || 'Cargando...';
    this.appendChild(text);
  }
}

customElements.define('loading-state', LoadingState);
