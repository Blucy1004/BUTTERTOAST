'use strict';
(() => {
  // Fixed, bundled geometry only. Profile metadata selects a preset, never SVG markup or a URL.
  const paths = Object.freeze({
    columns: 'M3 4h18v16H3zM12 4v16',
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
    close: 'm6 6 12 12M6 18 18 6',
    'arrow-left': 'M19 12H5m6-6-6 6 6 6',
    'arrow-right': 'M5 12h14m-6-6 6 6-6 6',
    'arrow-up': 'M12 19V5m-6 6 6-6 6 6',
    'arrow-down': 'M12 5v14m-6-6 6 6 6-6',
    'arrow-up-right': 'M6 18 18 6M6 6h12v12',
    'arrow-down-left': 'M18 6 6 18M6 6v12h12',
    'chevron-right': 'm9 5 7 7-7 7',
    reload: 'M20 7v5h-5M20 12a8 8 0 1 0-2.3 5.7',
    undo: 'M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12',
    menu: 'M4 6h16M4 12h16M4 18h16',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    search: 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0ZM15 15l6 6',
    star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z',
    settings: 'm9 3-.6 2.4-2 .9-2.1-.7-1.8 3.1 1.7 1.7v2.3l-1.7 1.7 1.8 3.1 2.3-.6 1.9 1.1.5 2.5h3.6l.6-2.5 1.9-1.1 2.3.6 1.8-3.1-1.7-1.7v-2.3l1.7-1.7-1.8-3.1-2.1.7-2-.9L13 3ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    switch: 'M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4',
    pin: 'M8 3h8l-1 7 4 4H5l4-4ZM12 14v7',
    volume: 'M11 4 6 8H3v8h3l5 4ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14',
    muted: 'M11 4 6 8H3v8h3l5 4ZM16 9l6 6M16 15l6-6',
    user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 6 0 0 1 16 0v2',
    toast: 'M6 21a1 1 0 0 1-1-1V11a4 4 0 0 1-2-3.5C3 4.5 6.5 3 12 3s9 1.5 9 4.5A4 4 0 0 1 19 11v9a1 1 0 0 1-1 1ZM9 14h6M9 17h6',
    sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5',
    moon: 'M20.5 14A8.5 8.5 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z',
    cloud: 'M7 19h11c2.2 0 4-1.8 4-4s-1.8-4-4-4h-.2C17.3 7.6 15 5 11.5 5 8.5 5 6 7 5.3 9.8 3.3 10.4 2 12.1 2 14.3 2 17 4.2 19 7 19Z',
    leaf: 'M20 3C9 2 3 6 4 13c.5 4 4 7 8 6 7-1 9-7 8-16ZM3 21 16 8'
  });
  const avatars = ['toast', 'sun', 'moon', 'cloud', 'star', 'leaf'];
  function create(name) {
    const key = Object.hasOwn(paths, name) ? name : 'user';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [attribute, value] of Object.entries({ viewBox:'0 0 24 24', width:'24', height:'24', fill:'none', stroke:'currentColor', 'stroke-width':'1.75', 'stroke-linecap':'round', 'stroke-linejoin':'round', 'aria-hidden':'true', focusable:'false', class:'icon', 'data-icon-name':key })) svg.setAttribute(attribute, value);
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', paths[key]); svg.append(path); return svg;
  }
  window.icons = Object.freeze({
    create,
    set: (element, name) => element.replaceChildren(create(name)),
    profile: key => create(avatars.includes(key) ? key : 'toast')
  });
  for (const element of document.querySelectorAll('[data-icon]')) window.icons.set(element, element.dataset.icon);
})();
