import { useEffect, useRef, useCallback } from 'react';
import type { Map as LeafletMap, LayerGroup } from 'leaflet';
import { formatTime } from './nusmods';

export interface MapMarker {
  lat:        number;
  lng:        number;
  label:      string;
  color:      string;
  venue:      string;
  moduleCode: string;
  lessonType: string;
  startTime:  string;
  endTime:    string;
}

interface Cluster {
  lat:     number;
  lng:     number;
  markers: MapMarker[];
}

interface Props { markers: MapMarker[] }

const NUS_CENTER: [number, number] = [1.2966, 103.7764];

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/** Cluster markers whose screen distance is within `thresholdPx` pixels. */
function cluster(markers: MapMarker[], zoom: number): Cluster[] {
  // Degrees per pixel at this zoom (Web Mercator approximation at NUS latitude)
  const degPerPx = 360 / (256 * Math.pow(2, zoom));
  const threshold = degPerPx * 40; // 40px cluster radius

  const clusters: Cluster[] = [];
  const used = new Set<number>();

  for (let i = 0; i < markers.length; i++) {
    if (used.has(i)) continue;
    const group: MapMarker[] = [markers[i]];
    used.add(i);
    for (let j = i + 1; j < markers.length; j++) {
      if (used.has(j)) continue;
      const dlat = markers[i].lat - markers[j].lat;
      const dlng = markers[i].lng - markers[j].lng;
      if (Math.sqrt(dlat * dlat + dlng * dlng) < threshold) {
        group.push(markers[j]);
        used.add(j);
      }
    }
    const lat = group.reduce((s, m) => s + m.lat, 0) / group.length;
    const lng = group.reduce((s, m) => s + m.lng, 0) / group.length;
    clusters.push({ lat, lng, markers: group });
  }
  return clusters;
}

function makePinIcon(L: typeof import('leaflet'), color: string, label: string) {
  const initials = escapeHtml(label.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase());
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
    <filter id="s"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.45)"/></filter>
    <path d="M16 0C7.2 0 0 7.2 0 16c0 12 16 24 16 24S32 28 32 16C32 7.2 24.8 0 16 0z" fill="${color}" filter="url(#s)"/>
    <circle cx="16" cy="16" r="10" fill="rgba(0,0,0,0.22)"/>
    <text x="16" y="20.5" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif" font-size="9" font-weight="700" fill="white">${initials}</text>
  </svg>`;
  return L.divIcon({ html: svg, className: '', iconSize: [32, 40], iconAnchor: [16, 40], popupAnchor: [0, -44] });
}

function makeClusterIcon(L: typeof import('leaflet'), markers: MapMarker[], count: number) {
  // Pie-chart style: split circle into arcs by color
  const size = count === 2 ? 36 : count <= 4 ? 42 : 48;
  const r = size / 2;
  const inner = r * 0.55;
  const colors = [...new Set(markers.map(m => m.color))];

  let arcs = '';
  if (colors.length === 1) {
    arcs = `<circle cx="${r}" cy="${r}" r="${r - 2}" fill="${colors[0]}" opacity="0.92"/>`;
  } else {
    let startAngle = -Math.PI / 2;
    const perColor = markers.reduce<Record<string, number>>((acc, m) => {
      acc[m.color] = (acc[m.color] ?? 0) + 1; return acc;
    }, {});
    for (const [color, n] of Object.entries(perColor)) {
      const angle = (n / markers.length) * 2 * Math.PI;
      const x1 = r + (r - 2) * Math.cos(startAngle);
      const y1 = r + (r - 2) * Math.sin(startAngle);
      const x2 = r + (r - 2) * Math.cos(startAngle + angle);
      const y2 = r + (r - 2) * Math.sin(startAngle + angle);
      const large = angle > Math.PI ? 1 : 0;
      arcs += `<path d="M${r},${r} L${x1},${y1} A${r - 2},${r - 2} 0 ${large},1 ${x2},${y2} Z" fill="${color}" opacity="0.92"/>`;
      startAngle += angle;
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <filter id="cs"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.5)"/></filter>
    <g filter="url(#cs)">${arcs}</g>
    <circle cx="${r}" cy="${r}" r="${inner}" fill="#22262d"/>
    <text x="${r}" y="${r + 4}" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif" font-size="${count > 9 ? 11 : 13}" font-weight="700" fill="#edf0f4">${count}</text>
  </svg>`;
  return L.divIcon({ html: svg, className: 'cluster-icon', iconSize: [size, size], iconAnchor: [r, r], popupAnchor: [0, -r - 4] });
}

function singlePopupHtml(markers: MapMarker[]): string {
  return markers.map(m => {
    const label = escapeHtml(m.label);
    const venue = escapeHtml(m.venue);
    const moduleCode = escapeHtml(m.moduleCode);
    const lessonType = escapeHtml(m.lessonType);
    return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;min-width:170px;">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">
        <span style="width:10px;height:10px;border-radius:50%;background:${m.color};display:inline-block;flex-shrink:0"></span>
        <strong style="font-size:13px;color:#edf0f4">${label}</strong>
      </div>
      <div style="font-size:12px;color:#b2bac5;line-height:1.7">
        <div>${venue}</div>
        <div>${moduleCode} - ${lessonType}</div>
        <div>${formatTime(m.startTime)}-${formatTime(m.endTime)}</div>
      </div>
    </div>`;
  }).join('<hr style="margin:7px 0;border-color:#3a414b">');
}

function clusterPopupHtml(markers: MapMarker[]): string {
  const byVenue = markers.reduce<Record<string, MapMarker[]>>((acc, m) => {
    (acc[m.venue] ??= []).push(m); return acc;
  }, {});
  return Object.entries(byVenue).map(([venue, ms]) => `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;min-width:180px;margin-bottom:6px;">
      <div style="font-size:11px;color:#9aa2ad;margin-bottom:4px;">${escapeHtml(venue)}</div>
      ${ms.map(m => `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
          <span style="width:8px;height:8px;border-radius:50%;background:${m.color};flex-shrink:0"></span>
          <span style="font-size:12px;color:#edf0f4">${escapeHtml(m.label)}</span>
          <span style="font-size:11px;color:#b2bac5;margin-left:auto">${escapeHtml(m.moduleCode)}</span>
        </div>`).join('')}
    </div>`
  ).join('<hr style="margin:6px 0;border-color:#3a414b">');
}

export default function MapView({ markers }: Props) {
  const divRef   = useRef<HTMLDivElement>(null);
  const mapRef   = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const LRef     = useRef<typeof import('leaflet') | null>(null);
  const markersRef = useRef<MapMarker[]>(markers);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const redraw = useCallback(() => {
    const layer = layerRef.current;
    const L     = LRef.current;
    const map   = mapRef.current;
    if (!layer || !L || !map) return;

    layer.clearLayers();
    const zoom     = map.getZoom();
    const clusters = cluster(markersRef.current, zoom);

    for (const c of clusters) {
      const isSingle = c.markers.length === 1;
      const icon = isSingle
        ? makePinIcon(L, c.markers[0].color, c.markers[0].label)
        : makeClusterIcon(L, c.markers, c.markers.length);

      const popup = isSingle
        ? singlePopupHtml(c.markers)
        : clusterPopupHtml(c.markers);

      L.marker([c.lat, c.lng], { icon }).bindPopup(popup).addTo(layer);
    }
  }, []);

  // Init map once
  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    let cancelled = false;

    import('leaflet').then(L => {
      if (cancelled || !divRef.current || mapRef.current) return;
      LRef.current = L;

      const map = L.map(divRef.current, {
        center: NUS_CENTER,
        zoom: 15,
        dragging: true,
        touchZoom: true,
        scrollWheelZoom: true,
      });
      map.dragging.enable();
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors', maxZoom: 19,
      }).addTo(map);

      const layer = L.layerGroup().addTo(map);
      layerRef.current = layer;
      mapRef.current   = map;

      // Re-cluster on zoom
      map.on('zoomend', redraw);
      resizeObserverRef.current = new ResizeObserver(() => {
        map.invalidateSize({ pan: false });
      });
      resizeObserverRef.current.observe(divRef.current);

      // Initial draw
      requestAnimationFrame(() => map.invalidateSize({ pan: false }));
      redraw();
    });

    return () => {
      cancelled = true;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      mapRef.current?.remove();
      mapRef.current  = null;
      layerRef.current = null;
      LRef.current    = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Redraw when markers change
  useEffect(() => {
    markersRef.current = markers;
    redraw();
  }, [markers, redraw]);

  return <div ref={divRef} className="w-full h-full" />;
}
