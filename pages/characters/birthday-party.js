const SVG_NS = 'http://www.w3.org/2000/svg';

function node(name, attrs = {}) {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function hatsSvg() {
  const conePath = 'M10 51L31 5L54 51Q32 60 10 51Z';
  const svg = node('svg', {
    class: 'birthday-party-hats', viewBox: '0 0 64 64',
    preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true',
  });
  const artwork = node('g', { transform: 'translate(3 4)' });
  artwork.appendChild(node('path', {
    d: conePath, class: 'birthday-party-hat-shadow', transform: 'translate(2 3)',
  }));
  artwork.appendChild(node('path', { d: conePath, class: 'birthday-party-hat-cone' }));
  artwork.appendChild(node('path', { d: 'M18 34Q31 41 46 34', class: 'birthday-party-hat-pattern birthday-party-hat-blue' }));
  artwork.appendChild(node('path', { d: 'M13 45Q31 53 51 44', class: 'birthday-party-hat-pattern birthday-party-hat-gold' }));
  artwork.appendChild(node('path', { d: 'M8 50Q32 60 56 50', class: 'birthday-party-hat-brim' }));
  artwork.appendChild(node('circle', { cx: 31, cy: 5, r: 5.5, class: 'birthday-party-hat-pom' }));
  svg.appendChild(artwork);
  return svg;
}

export function mountBirthdayParty({ config, context, signal }) {
  const hatsHost = context?.portraitTopHost;
  const hats = hatsSvg();
  const opacity = String(config?.opacity ?? 0.86);
  hats.style.opacity = opacity;

  if (hatsHost) hatsHost.appendChild(hats);

  const remove = () => hats.remove();
  signal?.addEventListener('abort', remove, { once: true });
  return remove;
}
