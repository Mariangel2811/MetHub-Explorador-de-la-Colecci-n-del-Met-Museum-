
class NavBar extends HTMLElement {
  constructor() {
    super();
    this._links = {};
  }

  connectedCallback() {
    this.classList.add('nav-bar');

    const brand = document.createElement('a');
    brand.href = '#home';
    brand.className = 'nav-brand';
    brand.textContent = 'Vitrae';
    this.appendChild(brand);

    const list = document.createElement('ul');
    list.className = 'nav-links';

    const items = [
      { route: 'explore', label: 'Explorar' },
      { route: 'departments', label: 'Departamentos' },
      { route: 'compare', label: 'Comparar' },
    ];

    items.forEach(({ route, label }) => {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = `#${route}`;
      link.textContent = label;
      li.appendChild(link);
      list.appendChild(li);
      this._links[route] = link;
    });

    this.appendChild(list);
  }

  setActive(routeName) {
    const section = routeName.split('/')[0];

    Object.entries(this._links).forEach(([route, link]) => {
      link.classList.toggle('active', route === section);
    });


    this.querySelector('.nav-brand').classList.toggle('active', section === 'home');
  }
}

customElements.define('nav-bar', NavBar);
