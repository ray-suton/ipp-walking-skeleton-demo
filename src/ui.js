/*
 * IPP demo presentation helpers: DOM builder, inline SVG icons, org tiles/avatars, relative time.
 *
 * Classic script that publishes `IPPUI` on globalThis. Nothing here touches `document` at load time,
 * so the pure helpers (initials, toneIndex, timeAgo) can be unit-tested in Node.
 * All text is inserted as text nodes; there is no HTML-string injection anywhere.
 */
(function (root) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // 24x24 stroke icons, drawn for this project. Each icon is a list of [tag, attributes].
  const ICONS = {
    home: [['path', { d: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' }]],
    briefcase: [
      ['rect', { x: 3, y: 7, width: 18, height: 13, rx: 2 }],
      ['path', { d: 'M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 13h18' }],
    ],
    shield: [
      ['path', { d: 'M12 3 4.5 6v5.5c0 4.4 3.1 7.6 7.5 9.5 4.4-1.9 7.5-5.1 7.5-9.5V6z' }],
      ['path', { d: 'm9 12 2.2 2.2L15.5 10' }],
    ],
    cap: [
      ['path', { d: 'M2 9.5 12 4.5l10 5-10 5z' }],
      ['path', { d: 'M6 12v4.5c0 1.4 2.7 2.8 6 2.8s6-1.4 6-2.8V12M22 9.5V15' }],
    ],
    book: [
      ['path', { d: 'M2.5 5.5H8a4 4 0 0 1 4 4V20a3 3 0 0 0-3-3H2.5z' }],
      ['path', { d: 'M21.5 5.5H16a4 4 0 0 0-4 4V20a3 3 0 0 1 3-3h6.5z' }],
    ],
    search: [
      ['circle', { cx: 11, cy: 11, r: 7 }],
      ['path', { d: 'm20 20-3.6-3.6' }],
    ],
    pin: [
      ['path', { d: 'M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z' }],
      ['circle', { cx: 12, cy: 10, r: 2.5 }],
    ],
    monitor: [
      ['rect', { x: 3, y: 4, width: 18, height: 12, rx: 2 }],
      ['path', { d: 'M8 20h8M12 16v4' }],
    ],
    clock: [
      ['circle', { cx: 12, cy: 12, r: 9 }],
      ['path', { d: 'M12 7v5l3 2' }],
    ],
    check: [['path', { d: 'm5 12.5 4.5 4.5L19 7.5' }]],
    checkCircle: [
      ['circle', { cx: 12, cy: 12, r: 9 }],
      ['path', { d: 'm8.5 12.2 2.4 2.4 4.6-4.9' }],
    ],
    send: [['path', { d: 'm22 2-7 20-4-9-9-4zM22 2 11 13' }]],
    arrow: [['path', { d: 'M5 12h14M13 6l6 6-6 6' }]],
    x: [['path', { d: 'M18 6 6 18M6 6l12 12' }]],
    info: [
      ['circle', { cx: 12, cy: 12, r: 9 }],
      ['path', { d: 'M12 11v5M12 8h.01' }],
    ],
    alert: [['path', { d: 'M12 3 2 20h20zM12 10v4M12 17h.01' }]],
    lock: [
      ['rect', { x: 5, y: 11, width: 14, height: 10, rx: 2 }],
      ['path', { d: 'M8 11V8a4 4 0 0 1 8 0v3' }],
    ],
    reset: [['path', { d: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5' }]],
    pulse: [['path', { d: 'M3 12h4l3-8 4 16 3-8h4' }]],
    user: [
      ['circle', { cx: 12, cy: 8, r: 4 }],
      ['path', { d: 'M4 21a8 8 0 0 1 16 0' }],
    ],
    inbox: [
      ['path', { d: 'M22 12h-6l-2 3h-4l-2-3H2' }],
      ['path', { d: 'M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z' }],
    ],
    eye: [
      ['path', { d: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z' }],
      ['circle', { cx: 12, cy: 12, r: 3 }],
    ],
    layers: [['path', { d: 'm12 3 9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5' }]],
  };

  const PALETTE_SIZE = 6; // tone-0 … tone-5 are defined in styles.css

  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value == null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (value === true) el.setAttribute(key, '');
      else el.setAttribute(key, value);
    }
    for (const child of children.flat(Infinity)) {
      if (child == null || child === false) continue;
      el.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return el;
  }

  /** Inline SVG icon. Unknown names render an empty icon instead of breaking the page. */
  function icon(name, size) {
    const px = size || 18;
    const svg = document.createElementNS(SVG_NS, 'svg');
    const attrs = {
      viewBox: '0 0 24 24',
      width: px,
      height: px,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 1.8,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      focusable: 'false',
      class: 'icon',
    };
    for (const [key, value] of Object.entries(attrs)) svg.setAttribute(key, value);
    for (const [tag, shape] of ICONS[name] || []) {
      const part = document.createElementNS(SVG_NS, tag);
      for (const [key, value] of Object.entries(shape)) part.setAttribute(key, value);
      svg.append(part);
    }
    return svg;
  }

  const TITLES = new Set(['dr', 'prof', 'mr', 'ms', 'mrs', 'mx']);

  /** Up to two capital letters for a logo tile or avatar: "Evergreen Labs" -> "EL", "Dr. Sam Okafor" -> "SO". */
  function initials(name) {
    const words = (String(name || '').match(/[A-Za-z0-9]+/g) || []).filter((word, index, all) => !(index === 0 && all.length > 1 && TITLES.has(word.toLowerCase())));
    if (words.length === 0) return '?';
    const second = words[1] ? words[1][0] : words[0][1] || '';
    return (words[0][0] + second).toUpperCase();
  }

  /** Stable colour slot for a name, so the same organization always gets the same tile colour. */
  function toneIndex(name) {
    let hash = 0;
    for (const char of String(name || '').trim().toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return hash % PALETTE_SIZE;
  }

  function orgTile(name, size) {
    return h('span', { class: `tile tone-${toneIndex(name)}${size ? ` tile-${size}` : ''}`, 'aria-hidden': 'true' }, initials(name));
  }

  function avatar(name, size) {
    return h('span', { class: `avatar tone-${toneIndex(name)}${size ? ` avatar-${size}` : ''}`, 'aria-hidden': 'true' }, initials(name));
  }

  /** "just now", "5 min ago", "2 h ago", "yesterday", "3 days ago". */
  function timeAgo(iso, now) {
    const then = Date.parse(iso);
    if (Number.isNaN(then)) return '';
    const seconds = Math.max(0, Math.round(((now === undefined ? Date.now() : now) - then) / 1000));
    if (seconds < 10) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.floor(hours / 24);
    return days === 1 ? 'yesterday' : `${days} days ago`;
  }

  /** A <time> element whose text refreshes via refreshRelativeTimes(). */
  function timeEl(iso) {
    return h('time', { datetime: iso, 'data-rel': '' }, timeAgo(iso));
  }

  function refreshRelativeTimes(scope) {
    (scope || document).querySelectorAll('time[data-rel]').forEach((el) => {
      const text = timeAgo(el.getAttribute('datetime'));
      if (el.textContent !== text) el.textContent = text;
    });
  }

  root.IPPUI = Object.freeze({
    ICON_NAMES: Object.freeze(Object.keys(ICONS)),
    h,
    icon,
    initials,
    toneIndex,
    orgTile,
    avatar,
    timeAgo,
    timeEl,
    refreshRelativeTimes,
  });
})(globalThis);
