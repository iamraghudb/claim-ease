// Generates lightweight SVG "photos" for seeded documents so the gallery has
// something to show without bundling binary assets.

const PALETTES = [
  ['#1e3a8a', '#3b82f6'],
  ['#065f46', '#10b981'],
  ['#7c2d12', '#f97316'],
  ['#4c1d95', '#a78bfa'],
  ['#134e4a', '#2dd4bf'],
  ['#78350f', '#fbbf24'],
];

export function placeholderImage(label: string, seed = 0): string {
  const [a, b] = PALETTES[Math.abs(seed) % PALETTES.length];
  const safe = label.replace(/[<>&"]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="480" height="320" fill="url(#g)"/>
<g fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="3"><rect x="150" y="90" width="180" height="120" rx="12"/><circle cx="240" cy="150" r="34"/><rect x="200" y="78" width="40" height="14" rx="4"/></g>
<text x="240" y="262" text-anchor="middle" font-family="system-ui,sans-serif" font-size="20" fill="#fff" font-weight="600">${safe}</text>
<text x="240" y="290" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" fill="rgba(255,255,255,0.75)">Simulated photo · ClaimEase demo</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
