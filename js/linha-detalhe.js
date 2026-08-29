/**
 * Cadê o Ônibus? — Detalhes da Linha, Trajeto no Mapa e Ônibus em Tempo Real
 * Design System idêntico ao App Flutter: Setas direcionais com a cor da linha,
 * balão de informações oficial, filtro rigoroso de trajeto e polling automático de 15s.
 */

import {
  CITIES_CONFIG,
  STATE_HUBS,
  CDN_BASE_URL,
  BACKEND_BASE_URL,
  SOCKET_BASE_URL,
  getCityConfig,
  normalizeCitySlug
} from './cities-config.js';

const CARTO_API_KEY = 'cb1_27ab_1_65ebfd5745856bf4ed565201';

// Estado da Linha
const state = {
  citySlug: 'rio',
  cityConfig: null,
  lineCode: '472',
  allCityLines: {},
  lineInfo: null,
  detailData: null,
  currentDirectionIdx: 0,
  activeTab: 'veiculos',
  activeScheduleDay: 'weekday',
  scheduleViewMode: 'intervals', // 'intervals' ou 'grid'
  vehicles: [],
  filteredDirectionVehicles: [],
  map: null,
  tileLayer: null,
  routeLayer: null,
  stopsLayer: null,
  vehiclesLayer: null,
  stopsVisible: true,
  refreshTimer: null,
  isFetchingVehicles: false,
  vehicleMarkersMap: new Map(),
  stopSearchQuery: ''
};

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  initParamsFromUrl();
  setupMap();
  setupTabs();
  setupEventListeners();
  startLiveTimeTicker();
  loadLineData(state.lineCode);
  loadAllCityLinesForSearch();
});

/**
 * Lê parâmetros da URL com suporte a query string, sessionStorage e hash
 */
function initParamsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  let cityParam = params.get('cidade') || params.get('c');
  let lineParam = params.get('linha') || params.get('l');

  // Fallback para sessionStorage
  if (!lineParam) {
    const savedLine = sessionStorage.getItem('selected_line');
    const savedCity = sessionStorage.getItem('selected_city');
    if (savedLine) {
      lineParam = savedLine;
      sessionStorage.removeItem('selected_line');
    }
    if (savedCity && !cityParam) {
      cityParam = savedCity;
      sessionStorage.removeItem('selected_city');
    }
  }

  // Fallback para hash (ex: #cidade=rio&linha=006 ou #rio/006)
  if (!lineParam && window.location.hash) {
    const hash = window.location.hash.replace('#', '');
    if (hash.includes('linha=')) {
      const hashParams = new URLSearchParams(hash);
      lineParam = hashParams.get('linha');
      if (!cityParam) cityParam = hashParams.get('cidade');
    } else if (hash.includes('/')) {
      const parts = hash.split('/');
      if (parts.length >= 2) {
        if (!cityParam) cityParam = parts[0];
        lineParam = parts[1];
      }
    }
  }

  const cleanParam = (cityParam || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (cleanParam && CITIES_CONFIG[cleanParam]) {
    state.citySlug = cleanParam;
    state.cityConfig = CITIES_CONFIG[cleanParam];
  } else {
    state.citySlug = normalizeCitySlug(cleanParam || 'rio');
    state.cityConfig = getCityConfig(state.citySlug);
  }

  if (lineParam && lineParam.trim()) {
    state.lineCode = lineParam.trim();
  } else {
    const defaultLines = {
      rio: '472',
      sp: '107T-10',
      bh: '104',
      curitiba: '010',
      brasilia: '0.108',
      porto_alegre: '110',
      rio_intermunicipal: '100D',
      emtu: '001',
      campinas: '116',
      florianopolis: '100'
    };
    state.lineCode = defaultLines[state.citySlug] || '472';
  }

  updateBreadcrumbs();
}

/**
 * Atualiza Breadcrumbs e Título Básico
 */
function updateBreadcrumbs() {
  const breadcrumbCity = document.getElementById('breadcrumb-city');
  const breadcrumbLines = document.getElementById('breadcrumb-lines');
  const breadcrumbLine = document.getElementById('breadcrumb-line');

  if (breadcrumbCity) {
    breadcrumbCity.href = `linhas.html?cidade=${state.citySlug}`;
    breadcrumbCity.textContent = state.cityConfig.name;
  }

  if (breadcrumbLines) {
    breadcrumbLines.href = `linhas.html?cidade=${state.citySlug}`;
  }

  if (breadcrumbLine) {
    breadcrumbLine.textContent = state.lineCode;
  }

  document.title = `Linha ${state.lineCode} — Trajeto e Ônibus em Tempo Real (${state.cityConfig.name}) | Cadê o Ônibus?`;
}

/**
 * Carrega a lista completa de linhas do polo para busca rápida
 */
async function loadAllCityLinesForSearch() {
  const normHub = normalizeCitySlug(state.citySlug);
  const hub = STATE_HUBS.find(h => h.key === normHub) || { citiesKeys: [state.citySlug] };
  const subCities = (hub && hub.citiesKeys) ? hub.citiesKeys : [state.citySlug];

  try {
    const promises = subCities.map(async (subKey) => {
      try {
        const res = await fetch(`${CDN_BASE_URL}/${subKey}/line_info.json`);
        if (!res.ok) return {};
        const data = await res.json();
        Object.entries(data).forEach(([code, item]) => {
          item.cityKey = subKey;
        });
        return data;
      } catch (e) {
        return {};
      }
    });

    const results = await Promise.all(promises);
    state.allCityLines = Object.assign({}, ...results);
  } catch (e) {
    console.warn('Não foi possível pré-carregar lista de linhas para busca rápida:', e);
  }
}

/**
 * Inicializa o Mapa Leaflet com CARTO Basemaps oficial
 */
function setupMap() {
  const mapContainer = document.getElementById('line-map');
  if (!mapContainer) return;

  const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  const cartoUrl = isDarkMode
    ? `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`
    : `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`;

  state.map = L.map('line-map', {
    center: state.cityConfig.center || [-22.9068, -43.1729],
    zoom: state.cityConfig.zoom || 13,
    zoomControl: false,
    trackResize: true
  });

  L.control.zoom({ position: 'bottomright' }).addTo(state.map);

  state.tileLayer = L.tileLayer(cartoUrl, {
    attribution: '&copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
    maxZoom: 19,
    subdomains: 'abcd'
  }).addTo(state.map);

  state.routeLayer = L.layerGroup().addTo(state.map);
  state.stopsLayer = L.layerGroup();
  state.vehiclesLayer = L.layerGroup().addTo(state.map);

  state.map.on('zoomend', updateStopsVisibilityByZoom);

  window.addEventListener('resize', () => {
    if (state.map) state.map.invalidateSize();
  });
}

/**
 * Controla a visibilidade dos pontos de parada baseado no nível de zoom
 * (Exibe as paradas apenas em zoom aproximado >= 14 para não poluir o mapa em visão panorâmica)
 */
function updateStopsVisibilityByZoom() {
  if (!state.map || !state.stopsLayer) return;
  const currentZoom = state.map.getZoom();
  const toggleBtn = document.getElementById('btn-map-toggle-stops');

  if (state.stopsVisible && currentZoom >= 14) {
    if (!state.map.hasLayer(state.stopsLayer)) {
      state.stopsLayer.addTo(state.map);
    }
    if (toggleBtn) toggleBtn.style.color = 'var(--primary)';
  } else {
    if (state.map.hasLayer(state.stopsLayer)) {
      state.map.removeLayer(state.stopsLayer);
    }
    if (toggleBtn && !state.stopsVisible) {
      toggleBtn.style.color = 'var(--text-muted)';
    }
  }
}

// Cliente Socket.IO global
let socketClient = null;

/**
 * Calcula a menor distância perpendicular (em metros) de um ponto (lat, lon) à polyline do trajeto
 */
function minDistanceToPolyline(lat, lon, polylinePts) {
  if (!polylinePts || polylinePts.length === 0) return 0;
  
  let minDist = Infinity;
  const cosLat = Math.cos(lat * Math.PI / 180);
  const px = lon * 111320 * cosLat;
  const py = lat * 110540;

  for (let i = 0; i < polylinePts.length - 1; i++) {
    const p1 = polylinePts[i];
    const p2 = polylinePts[i + 1];

    const x1 = p1.lon * 111320 * cosLat;
    const y1 = p1.lat * 110540;
    const x2 = p2.lon * 111320 * cosLat;
    const y2 = p2.lat * 110540;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    let dist;
    if (lenSq === 0) {
      dist = Math.hypot(px - x1, py - y1);
    } else {
      const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
      const projX = x1 + t * dx;
      const projY = y1 + t * dy;
      dist = Math.hypot(px - projX, py - projY);
    }

    if (dist < minDist) {
      minDist = dist;
      if (minDist <= 30) break; // Sai cedo se estiver muito perto
    }
  }

  return minDist;
}

/**
 * Carrega os dados de uma linha específica (itinerário, paradas, horários) com suporte a busca multi-subsistema
 */
export async function loadLineData(lineCodeToLoad, targetCitySlug) {
  state.lineCode = (lineCodeToLoad || state.lineCode).trim();
  state.currentDirectionIdx = 0;
  state.vehicleMarkersMap.clear();

  if (targetCitySlug && CITIES_CONFIG[targetCitySlug]) {
    state.citySlug = targetCitySlug;
    state.cityConfig = CITIES_CONFIG[targetCitySlug];
  }

  if (state.vehiclesLayer) state.vehiclesLayer.clearLayers();
  if (state.routeLayer) state.routeLayer.clearLayers();
  if (state.stopsLayer) state.stopsLayer.clearLayers();

  updateBreadcrumbs();
  setLoadingState(true);

  // Atualiza URL sem poluir o histórico
  const currentUrl = new URL(window.location);
  currentUrl.searchParams.set('cidade', state.citySlug);
  currentUrl.searchParams.set('linha', state.lineCode);
  window.history.replaceState({}, '', currentUrl);

  try {
    // 1. Determina as subcidades candidatas no polo regional
    const normHub = normalizeCitySlug(state.citySlug);
    const hub = STATE_HUBS.find(h => h.key === normHub) || { citiesKeys: [state.citySlug] };
    const searchCities = [state.citySlug, ...(hub.citiesKeys || []).filter(k => k !== state.citySlug)];

    let foundCitySlug = state.citySlug;
    let detailData = null;
    let info = state.allCityLines[state.lineCode] || null;

    // Tenta carregar o trajeto na cidade atual ou nas outras subcidades do polo
    for (const cityCandidate of searchCities) {
      const detailUrl = `${CDN_BASE_URL}/${cityCandidate}/detalhes/${encodeURIComponent(state.lineCode)}.json`;
      try {
        let resDetail = await fetch(detailUrl);
        if (!resDetail.ok) {
          const upperUrl = `${CDN_BASE_URL}/${cityCandidate}/detalhes/${encodeURIComponent(state.lineCode.toUpperCase())}.json`;
          resDetail = await fetch(upperUrl);
        }
        if (resDetail.ok) {
          detailData = await resDetail.json();
          foundCitySlug = cityCandidate;
          break;
        }
      } catch (e) {}
    }

    if (!detailData) {
      throw new Error(`Não encontramos o trajeto digitalizado para a linha ${state.lineCode} na região de ${state.cityConfig.stateFullName || state.cityConfig.name}.`);
    }

    state.citySlug = foundCitySlug;
    state.cityConfig = CITIES_CONFIG[foundCitySlug] || getCityConfig(foundCitySlug);
    state.detailData = detailData;

    // Garante que o line_info da cidade esteja carregado
    if (!info || !info.description) {
      try {
        const resInfo = await fetch(`${CDN_BASE_URL}/${foundCitySlug}/line_info.json`);
        if (resInfo.ok) {
          const cityInfoDict = await resInfo.json();
          Object.assign(state.allCityLines, cityInfoDict);
          info = findLineInfoCanonical(state.lineCode, cityInfoDict);
        }
      } catch (e) {}
    }

    // Se ainda não encontrou descrição, extrai dos trip_headsign dos trajetos
    const headsigns = (detailData.trajetos || []).map(t => t.trip_headsign).filter(Boolean);
    let derivedDesc = '';
    if (headsigns.length >= 2 && headsigns[0] !== headsigns[1]) {
      derivedDesc = `${headsigns[0]} ⇄ ${headsigns[1]}`;
    } else if (headsigns.length >= 1) {
      derivedDesc = headsigns[0];
    } else {
      derivedDesc = `Itinerário da Linha ${state.lineCode}`;
    }

    state.lineInfo = {
      description: info?.description || derivedDesc,
      consortiumName: info?.consortiumName || info?.operatorCompany || (foundCitySlug === 'rio_intermunicipal' ? 'Intermunicipal (DETRO)' : state.cityConfig.name),
      consortiumColor: info?.consortiumColor || '#1C83E4',
      textColor: info?.textColor || '#FFFFFF',
      price: info?.price || state.cityConfig.fare
    };

    updateBreadcrumbs();
    renderLineHeader();
    renderDirectionSwitcher();
    drawRouteAndStops();
    renderStopsTimeline();
    renderSchedulesTab();
    updateLineStatsStrip();
    renderFAQSection();
    renderOtherLinesSection();

    // Inicia rastreamento ao vivo com Socket.IO e Polling HTTP
    initSocketConnection();
    startRealtimeVehicleTracking();

  } catch (err) {
    console.error('Erro ao carregar dados da linha:', err);
    renderErrorState(err.message);
  } finally {
    setLoadingState(false);
    if (state.map) {
      setTimeout(() => {
        state.map.invalidateSize();
      }, 100);
    }
  }
}

/**
 * Formata valores de tarifa de forma segura evitando NaN
 */
function formatPrice(val, defaultFare) {
  if (!val && !defaultFare) return '-';
  const raw = String(val || defaultFare || '').trim();
  if (raw.startsWith('R$')) return raw;
  const num = parseFloat(raw.replace(',', '.').replace(/[^0-9.]/g, ''));
  if (isNaN(num)) return raw || defaultFare || '-';
  return `R$ ${num.toFixed(2).replace('.', ',')}`;
}

/**
 * Busca flexível de metadados de linha no dicionário
 */
function findLineInfoCanonical(code, linesDict) {
  if (!linesDict || !code) return null;
  if (linesDict[code]) return linesDict[code];

  const upper = code.toUpperCase();
  if (linesDict[upper]) return linesDict[upper];

  const withoutZeros = code.replace(/^0+/, '');
  for (const [k, v] of Object.entries(linesDict)) {
    if (k.toUpperCase() === upper || k.replace(/^0+/, '') === withoutZeros) {
      return v;
    }
  }

  return null;
}

/**
 * Renderiza Cabeçalho da Linha
 */
function renderLineHeader() {
  const badgeEl = document.getElementById('line-badge');
  const titleEl = document.getElementById('line-title');
  const consortiumEl = document.getElementById('line-consortium');
  const fareEl = document.getElementById('line-fare');
  const agencyEl = document.getElementById('line-agency');

  const badgeBg = state.lineInfo.consortiumColor || '#1C83E4';
  const badgeColor = getContrastColor(badgeBg);

  if (badgeEl) {
    badgeEl.textContent = state.lineCode;
    badgeEl.style.background = badgeBg;
    badgeEl.style.color = badgeColor;
  }

  if (titleEl) {
    titleEl.textContent = state.lineInfo.description || `Linha ${state.lineCode}`;
  }

  if (consortiumEl) {
    consortiumEl.textContent = state.lineInfo.consortiumName || 'Operação Regular';
  }

  if (fareEl) {
    fareEl.textContent = formatPrice(state.lineInfo.price, state.cityConfig.fare);
  }

  if (agencyEl) {
    agencyEl.textContent = state.cityConfig.fullName;
  }

  document.title = `${state.lineCode} — ${state.lineInfo.description} | Cadê o Ônibus?`;
  updateLineStatsStrip();
}

/**
 * Renderiza o Seletor de Sentidos (Ida / Volta) com contagem precisa de paradas daquele sentido
 */
function renderDirectionSwitcher() {
  const container = document.getElementById('direction-switcher');
  if (!container || !state.detailData || !state.detailData.trajetos) return;

  const trajetos = state.detailData.trajetos;
  if (trajetos.length <= 1) {
    const headsign = trajetos[0]?.trip_headsign || 'Itinerário Completo';
    const pts = trajetos[0]?.trajeto || [];
    const allStops = trajetos[0]?.paradas || [];
    const validStops = allStops.filter(p => {
      const lat = p.position?.lat || p.lat;
      const lon = p.position?.lon || p.lon;
      if (!lat || !lon) return false;
      if (pts.length > 1) return minDistanceToPolyline(lat, lon, pts) <= 150;
      return true;
    });
    const stopsCount = validStops.length > 0 ? validStops.length : allStops.length;

    container.innerHTML = `
      <div class="direction-btn active" style="cursor: default;">
        <span><i class="fa-solid fa-route"></i> Sentido: <strong>${headsign}</strong></span>
        <span class="stop-count">${stopsCount} paradas</span>
      </div>
    `;
    return;
  }

  container.innerHTML = trajetos.map((t, idx) => {
    const isActive = idx === state.currentDirectionIdx;
    const headsign = t.trip_headsign || `Sentido ${idx + 1}`;
    const pts = t.trajeto || [];
    const allStops = t.paradas || [];
    const validStops = allStops.filter(p => {
      const lat = p.position?.lat || p.lat;
      const lon = p.position?.lon || p.lon;
      if (!lat || !lon) return false;
      if (pts.length > 1) return minDistanceToPolyline(lat, lon, pts) <= 150;
      return true;
    });
    const stopsCount = validStops.length > 0 ? validStops.length : allStops.length;

    return `
      <button class="direction-btn ${isActive ? 'active' : ''}" data-idx="${idx}">
        <span><i class="fa-solid fa-arrows-turn-to-dots"></i> Sentido: <strong>${headsign}</strong></span>
        <span class="stop-count">${stopsCount} paradas</span>
      </button>
    `;
  }).join('');

  container.querySelectorAll('.direction-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-idx'), 10);
      if (!isNaN(idx) && idx !== state.currentDirectionIdx) {
        state.currentDirectionIdx = idx;
        container.querySelectorAll('.direction-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        drawRouteAndStops();
        renderStopsTimeline();
        filterVehiclesByCurrentDirection();
        renderSchedulesTab();
        updateLineStatsStrip();
        renderFAQSection();
      }
    });
  });
}

/**
 * Desenha a Polyline do Trajeto e os Marcadores de Paradas (filtrando rigorosamente apenas paradas no sentido ativo)
 */
function drawRouteAndStops() {
  if (!state.map || !state.detailData || !state.detailData.trajetos) return;

  state.routeLayer.clearLayers();
  state.stopsLayer.clearLayers();

  const currentTrajeto = state.detailData.trajetos[state.currentDirectionIdx] || state.detailData.trajetos[0];
  if (!currentTrajeto) return;

  const pts = currentTrajeto.trajeto || [];
  if (pts.length === 0) return;

  const latLngs = pts.map(p => [p.lat, p.lon]);
  const lineColor = state.lineInfo?.consortiumColor || '#1C83E4';

  // 1. Casing externo para contraste idêntico ao Flutter
  L.polyline(latLngs, {
    color: '#000000',
    weight: 7,
    opacity: 0.6,
    lineJoin: 'round',
    lineCap: 'round'
  }).addTo(state.routeLayer);

  // 2. Linha principal do trajeto com a cor da linha
  const mainLine = L.polyline(latLngs, {
    color: lineColor,
    weight: 4.5,
    opacity: 1.0,
    lineJoin: 'round',
    lineCap: 'round'
  }).addTo(state.routeLayer);

  // 3. Renderiza Paradas Circulares filtradas por proximidade do trajeto ativo (<= 150m)
  const allParadas = currentTrajeto.paradas || [];
  const paradas = allParadas.filter(parada => {
    const lat = parada.position?.lat || parada.lat;
    const lon = parada.position?.lon || parada.lon;
    if (!lat || !lon) return false;
    if (pts.length > 1) {
      return minDistanceToPolyline(lat, lon, pts) <= 150;
    }
    return true;
  });

  paradas.forEach((parada, index) => {
    const lat = parada.position?.lat || parada.lat;
    const lon = parada.position?.lon || parada.lon;

    const stopIcon = L.divIcon({
      className: 'custom-stop-div-icon',
      html: `
        <div class="flutter-stop-marker" title="${index + 1}. ${parada.stopName}">
          <div class="flutter-stop-marker-inner" style="background: ${lineColor};"></div>
        </div>
      `,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

    const marker = L.marker([lat, lon], { icon: stopIcon });

    const popupHtml = `
      <div style="padding: 10px 14px; font-family: var(--font-family);">
        <div style="font-size: 0.75rem; font-weight: 800; color: var(--primary); text-transform: uppercase;">
          Parada #${index + 1}
        </div>
        <h4 style="font-size: 0.98rem; font-weight: 800; margin: 4px 0 6px;">${parada.stopName}</h4>
        <div style="font-size: 0.82rem; color: var(--text-muted);">
          Linha ${state.lineCode} &bull; Sentido ${currentTrajeto.trip_headsign || ''}
        </div>
      </div>
    `;

    marker.bindPopup(popupHtml);
    state.stopsLayer.addLayer(marker);
  });

  // Ajusta visão do mapa automaticamente com padding
  try {
    const bounds = mainLine.getBounds();
    if (bounds && bounds.isValid()) {
      state.map.fitBounds(bounds, { padding: [40, 40] });
      setTimeout(() => {
        if (state.map) {
          state.map.invalidateSize();
          state.map.fitBounds(bounds, { padding: [40, 40] });
          updateStopsVisibilityByZoom();
        }
      }, 150);
    }
  } catch (e) {
    console.warn('Erro ao ajustar bounds do mapa:', e);
  }

  updateStopsVisibilityByZoom();
}

/**
 * Conexão Socket.IO em Tempo Real (igual ao app Flutter)
 */
function initSocketConnection() {
  if (typeof io === 'undefined') return;

  if (!socketClient) {
    try {
      socketClient = io(SOCKET_BASE_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 2000
      });

      socketClient.on('connect', () => {
        subscribeLineOnSocket();
      });

      socketClient.on('vehicle_update', (data) => {
        handleSocketVehicleUpdate(data);
      });

      socketClient.on('vehicles_update', (data) => {
        handleSocketVehicleUpdate(data);
      });

      socketClient.on('vehicle_delta', (data) => {
        handleSocketVehicleUpdate(data);
      });
    } catch (e) {
      console.warn('[Socket] Erro ao conectar:', e);
    }
  } else if (socketClient.connected) {
    subscribeLineOnSocket();
  }
}

function subscribeLineOnSocket() {
  if (!socketClient || !socketClient.connected) return;
  const parentHub = normalizeCitySlug(state.citySlug);
  socketClient.emit('subscribe', {
    city: parentHub,
    lines: [state.lineCode]
  });
}

function handleSocketVehicleUpdate(data) {
  if (!data) return;
  const list = Array.isArray(data) ? data : (data.vehicles || [data]);
  const matching = list.filter(v => v.linha === state.lineCode || v.linhaOriginal === state.lineCode);
  if (matching.length > 0) {
    const map = new Map(state.vehicles.map(v => [v.codigo || v.vehicleId, v]));
    matching.forEach(v => map.set(v.codigo || v.vehicleId, v));
    state.vehicles = Array.from(map.values());
    filterVehiclesByCurrentDirection();
  }
}

/**
 * Rastreamento de Ônibus em Tempo Real (Polling automático a cada 15s)
 */
function startRealtimeVehicleTracking() {
  fetchRealtimeVehicles();

  if (state.refreshTimer) clearInterval(state.refreshTimer);
  state.refreshTimer = setInterval(() => {
    fetchRealtimeVehicles();
  }, 15000); // 15 segundos
}

/**
 * Consulta a API de veículos em tempo real (https://api.cadeoonibus.api.br/api)
 */
async function fetchRealtimeVehicles() {
  if (state.isFetchingVehicles) return;
  state.isFetchingVehicles = true;

  try {
    const parentHub = normalizeCitySlug(state.citySlug);
    const url = `${BACKEND_BASE_URL}/vehicles?city=${parentHub}&lines=${encodeURIComponent(state.lineCode)}`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      throw new Error(`Erro na API de veículos (${res.status})`);
    }

    const vehicles = await res.json();
    if (Array.isArray(vehicles)) {
      state.vehicles = vehicles;
      filterVehiclesByCurrentDirection();
    } else {
      state.vehicles = [];
      state.filteredDirectionVehicles = [];
      updateLiveBadge(0);
      renderActiveVehiclesTab();
    }

  } catch (err) {
    console.warn('Veículos em tempo real offline ou indisponíveis no momento:', err.message);
    state.vehicles = [];
    state.filteredDirectionVehicles = [];
    updateLiveBadge(0, true);
    renderActiveVehiclesTab();
  } finally {
    state.isFetchingVehicles = false;
  }
}

/**
 * Filtra os ônibus para exibir SOMENTE os que estão no trajeto e no sentido selecionado
 */
function filterVehiclesByCurrentDirection() {
  if (!state.vehicles || state.vehicles.length === 0) {
    state.filteredDirectionVehicles = [];
    updateVehicleMarkersOnMap();
    renderActiveVehiclesTab();
    updateLiveBadge(0);
    return;
  }

  const currentTrajeto = state.detailData?.trajetos?.[state.currentDirectionIdx];
  const targetDirId = currentTrajeto?.direction_id !== undefined ? currentTrajeto.direction_id : state.currentDirectionIdx;
  const targetHeadsign = (currentTrajeto?.trip_headsign || '').toLowerCase().trim();

  state.filteredDirectionVehicles = state.vehicles.filter(v => {
    // 1. Ocultar veículos fora de trajeto / garagem
    if (v.isOnRoute === false) return false;
    if (v.isActive === false) return false;

    // 2. Verificação por directionId numérico
    if (typeof v.directionId === 'number' && v.directionId === targetDirId) return true;
    if (typeof v.activeDirectionId === 'number' && v.activeDirectionId === targetDirId) return true;

    // 3. Verificação por string de sentido
    if (v.sentido !== undefined && v.sentido !== null) {
      const s = String(v.sentido).trim();
      if (s === String(targetDirId)) return true;
    }

    // 4. Verificação por nome do destino / trajeto
    if (targetHeadsign && v.trajeto) {
      const dest = String(v.trajeto).toLowerCase().trim();
      if (dest.includes(targetHeadsign) || targetHeadsign.includes(dest)) return true;
    }

    if (state.detailData?.trajetos?.length === 1) return true;

    return false;
  });

  // Se nenhum veículo tiver flag de sentido específico mas estiver na rota, exibe os ativos na rota
  if (state.filteredDirectionVehicles.length === 0 && state.vehicles.length > 0) {
    state.filteredDirectionVehicles = state.vehicles.filter(v => v.isOnRoute !== false);
  }

  updateVehicleMarkersOnMap();
  renderActiveVehiclesTab();
  updateLiveBadge(state.filteredDirectionVehicles.length);
}

/**
 * Renderiza os Marcadores de Ônibus com a Cor da Linha e Balão Idêntico ao Flutter App
 */
function updateVehicleMarkersOnMap() {
  if (!state.map || !state.vehiclesLayer) return;

  const currentIds = new Set();
  const vehiclesToRender = state.filteredDirectionVehicles;
  
  // A cor do ônibus é a cor oficial da linha
  const lineColor = state.lineInfo?.consortiumColor || '#1C83E4';
  const textColor = getContrastColor(lineColor);
  const badgeBg = textColor === '#000000' ? 'rgba(0, 0, 0, 0.14)' : 'rgba(255, 255, 255, 0.22)';
  const currentTrajeto = state.detailData?.trajetos?.[state.currentDirectionIdx] || {};
  const currentHeadsign = currentTrajeto.trip_headsign || 'Em operação';

  vehiclesToRender.forEach(vehicle => {
    const lat = vehicle.latitude || vehicle.lat;
    const lon = vehicle.longitude || vehicle.lon;
    if (!lat || !lon) return;

    const carId = vehicle.codigoOriginal || vehicle.codigo || 'Ônibus';
    currentIds.add(carId);

    const speed = Math.round(vehicle.velocidade || 0);
    const bearing = parseFloat(vehicle.direcao) || 0;
    const speedInfo = getSpeedDetails(speed);
    const timeInfo = getTimeAgoDetails(vehicle.dataHora);
    const dest = vehicle.trajeto || vehicle.sentido || currentHeadsign;

    let marker = state.vehicleMarkersMap.get(carId);

    // SVG da seta direcional com a cor da linha
    const iconHtml = `
      <div class="bus-flutter-arrow-marker" style="transform: rotate(${bearing}deg);" title="Carro ${carId} &bull; ${speed} km/h">
        <svg viewBox="0 0 24 24" class="bus-arrow-svg">
          <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" fill="${lineColor}" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round" />
        </svg>
      </div>
    `;

    const busIcon = L.divIcon({
      className: 'custom-bus-arrow-icon',
      html: iconHtml,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    if (marker) {
      marker.setLatLng([lat, lon]);
      marker.setIcon(busIcon);
    } else {
      marker = L.marker([lat, lon], { icon: busIcon });
      state.vehiclesLayer.addLayer(marker);
      state.vehicleMarkersMap.set(carId, marker);
    }

    // Balão (Popup) Compacto Idêntico ao app Flutter (sem botão colaborar)
    const popupHtml = `
      <div class="flutter-bus-popup">
        <div class="popup-top-banner" style="background: ${lineColor};">
          <div class="popup-line-circle" style="color: ${textColor}; background: ${badgeBg};">${state.lineCode}</div>
          <div class="popup-headsign" style="color: ${textColor};">${dest}</div>
        </div>
        <div class="popup-body">
          ${vehicle.isOnRoute === false && !state.isVirtualLine ? `
            <div class="popup-out-of-route-badge">
              <i class="fa-solid fa-triangle-exclamation"></i> Fora do itinerário
            </div>
          ` : ''}
          <div class="popup-pills-row">
            <span class="popup-pill pill-car" title="Número de ordem do carro">
              <i class="fa-solid fa-bus"></i> ${carId}
            </span>
            <span class="popup-pill pill-speed" style="color: ${speedInfo.color}; background: ${speedInfo.bg};" title="Velocidade atual">
              <i class="${speedInfo.icon}" style="color: ${speedInfo.color};"></i> ${speedInfo.text}
            </span>
          </div>
          <div class="popup-pills-row centered">
            <span class="popup-pill pill-time" data-gps-time="${vehicle.dataHora}" style="color: ${timeInfo.color}; background: ${timeInfo.bg};" title="Último sinal GPS">
              <i class="fa-regular fa-clock" style="color: ${timeInfo.color};"></i> <span class="live-seconds-text">${timeInfo.text}</span>
            </span>
          </div>
        </div>
      </div>
    `;

    if (marker.getPopup() && marker.isPopupOpen()) {
      marker.setPopupContent(popupHtml);
    } else {
      marker.bindPopup(popupHtml, {
        className: 'flutter-leaflet-popup',
        closeButton: false,
        offset: [0, -8],
        maxWidth: 220,
        minWidth: 165,
        autoPanPadding: [15, 15]
      });
    }
  });

  // Remove veículos que não estão mais na rota ou no sentido
  for (const [carId, marker] of state.vehicleMarkersMap.entries()) {
    if (!currentIds.has(carId)) {
      state.vehiclesLayer.removeLayer(marker);
      state.vehicleMarkersMap.delete(carId);
    }
  }
}

/**
 * Atualiza o badge de veículos ao vivo no header
 */
function updateLiveBadge(count, isError = false) {
  const badge = document.getElementById('live-vehicles-badge');
  const countSpan = document.getElementById('live-count-text');
  const lastSyncSpan = document.getElementById('last-sync-time');

  const now = new Date();
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  if (lastSyncSpan) {
    lastSyncSpan.textContent = `Atualizado às ${timeStr}`;
  }

  if (!badge || !countSpan) return;

  if (isError && count === 0) {
    badge.className = 'meta-pill';
    countSpan.textContent = 'Sincronizando GPS...';
    return;
  }

  if (count > 0) {
    badge.className = 'meta-pill live-indicator';
    countSpan.textContent = `${count} ${count === 1 ? 'ônibus no sentido selecionado' : 'ônibus no sentido selecionado'}`;
  } else {
    badge.className = 'meta-pill';
    countSpan.textContent = 'Nenhum ônibus neste sentido agora';
  }
}

/**
 * Foca o mapa em um veículo específico e abre seu popup
 */
export function focusOnVehicle(carId) {
  const marker = state.vehicleMarkersMap.get(carId);
  if (marker && state.map) {
    state.map.setView(marker.getLatLng(), 16, { animate: true });
    marker.openPopup();

    const mapWrapper = document.getElementById('map-wrapper');
    if (mapWrapper) {
      mapWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

window.focusBus = focusOnVehicle;

/**
 * Renderiza Aba de Veículos Ativos
 */
function renderActiveVehiclesTab() {
  const container = document.getElementById('pane-veiculos');
  if (!container) return;

  const currentTrajeto = state.detailData?.trajetos?.[state.currentDirectionIdx];
  const headsign = currentTrajeto?.trip_headsign || 'Sentido Atual';
  const vehicles = state.filteredDirectionVehicles;

  if (vehicles.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 48px 20px; background: var(--line-card-bg); border-radius: 16px; border: 1px solid var(--surface-border);">
        <div style="font-size: 2.2rem; margin-bottom: 12px;">🛰️</div>
        <h4 style="font-size: 1.15rem; margin-bottom: 6px;">Nenhum ônibus transmitindo no Sentido ${headsign}</h4>
        <p style="color: var(--text-muted); max-width: 480px; margin: 0 auto;">
          Nenhum veículo desta linha está em rota neste sentido no momento. Você pode alternar o sentido acima para verificar o retorno.
        </p>
      </div>
    `;
    return;
  }

  let html = `<div class="vehicles-live-grid">`;

  html += vehicles.map(v => {
    const carId = v.codigoOriginal || v.codigo || 'Ônibus';
    const speed = Math.round(v.velocidade || 0);
    const timeAgo = formatTimeAgo(v.dataHora);
    const dest = v.trajeto || v.sentido || headsign;

    return `
      <div class="vehicle-live-card">
        <div class="vehicle-live-info">
          <h4>Carro ${carId}</h4>
          <p><i class="fa-solid fa-gauge-high"></i> ${speed} km/h &bull; <span data-gps-time="${v.dataHora}"><i class="fa-solid fa-clock"></i> <span class="live-seconds-text">${timeAgo}</span></span></p>
          <p style="margin-top: 4px; font-size: 0.75rem; color: var(--primary); font-weight: 700;">
            <i class="fa-solid fa-location-arrow"></i> ${dest}
          </p>
        </div>
        <button class="btn-locate-vehicle" onclick="window.focusBus('${carId}')">
          <i class="fa-solid fa-crosshairs"></i> Ver no Mapa
        </button>
      </div>
    `;
  }).join('');

  html += `</div>`;
  container.innerHTML = html;
}

/**
 * Renderiza Linha do Tempo de Paradas / Itinerário (filtradas no sentido ativo)
 */
function renderStopsTimeline() {
  const container = document.getElementById('stops-list-container');
  const countEl = document.getElementById('stops-tab-count');
  if (!container || !state.detailData || !state.detailData.trajetos) return;

  const currentTrajeto = state.detailData.trajetos[state.currentDirectionIdx] || state.detailData.trajetos[0];
  const allParadas = currentTrajeto?.paradas || [];
  const pts = currentTrajeto?.trajeto || [];

  // Filtra paradas para garantir que pertencem ao itinerário deste sentido (distância máx 150m)
  const paradas = allParadas.filter(parada => {
    const lat = parada.position?.lat || parada.lat;
    const lon = parada.position?.lon || parada.lon;
    if (!lat || !lon) return false;
    if (pts.length > 1) {
      return minDistanceToPolyline(lat, lon, pts) <= 150;
    }
    return true;
  });

  if (countEl) countEl.textContent = `(${paradas.length})`;

  if (paradas.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
        Lista de paradas não disponível para este sentido.
      </div>
    `;
    return;
  }

  const q = state.stopSearchQuery.toLowerCase().trim();
  const filtered = paradas.filter(p => {
    if (!q) return true;
    return (p.stopName || '').toLowerCase().includes(q);
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 30px; color: var(--text-muted);">
        Nenhum ponto encontrado para "<strong>${state.stopSearchQuery}</strong>".
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="stops-timeline">
      ${filtered.map((p) => {
        const originalIndex = paradas.indexOf(p);
        const lat = p.position?.lat || p.lat;
        const lon = p.position?.lon || p.lon;

        return `
          <div class="stop-item" onclick="window.focusStop(${lat}, ${lon}, '${encodeURIComponent(p.stopName)}')">
            <span class="stop-item-seq">${originalIndex + 1}</span>
            <span class="stop-item-title">${p.stopName}</span>
            <span class="stop-item-action" title="Ver parada no mapa"><i class="fa-solid fa-location-crosshairs fa-crosshairs"></i></span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/**
 * Foca o mapa em uma parada de ônibus
 */
window.focusStop = (lat, lon, encodedName) => {
  if (state.map && lat && lon) {
    const name = decodeURIComponent(encodedName);
    state.map.setView([lat, lon], 17, { animate: true });

    L.popup()
      .setLatLng([lat, lon])
      .setContent(`
        <div style="padding: 10px 14px; font-family: var(--font-family);">
          <strong style="font-size: 1rem;">${name}</strong><br>
          <span style="font-size: 0.82rem; color: var(--text-muted);">Parada de ônibus da linha ${state.lineCode}</span>
        </div>
      `)
      .openOn(state.map);

    const mapWrapper = document.getElementById('map-wrapper');
    if (mapWrapper) mapWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
};

/**
 * Calcula a distância total da polyline em quilômetros usando a fórmula de Haversine
 */
function calculatePolylineDistanceKm(pts) {
  if (!pts || pts.length < 2) return 0;
  let totalMeters = 0;
  const R = 6371000; // Raio médio da Terra em metros
  for (let i = 0; i < pts.length - 1; i++) {
    const lat1 = pts[i].lat * Math.PI / 180;
    const lat2 = pts[i + 1].lat * Math.PI / 180;
    const dLat = (pts[i + 1].lat - pts[i].lat) * Math.PI / 180;
    const dLon = (pts[i + 1].lon - pts[i].lon) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    totalMeters += R * c;
  }
  return totalMeters / 1000;
}

/**
 * Obtém a lista de partidas (horários) para o sentido e dia especificados
 */
function getDeparturesListForDay(rawHorarios, directionIdx, dayKey = 'weekday') {
  if (!rawHorarios) return [];
  const dirKey = String(directionIdx);
  let departuresList = [];

  for (const tripData of Object.values(rawHorarios || {})) {
    if (typeof tripData === 'object' && tripData !== null) {
      const dirData = tripData[dirKey] || tripData['0'] || tripData['1'];
      if (dirData && Array.isArray(dirData[dayKey]) && dirData[dayKey].length > 0) {
        departuresList = dirData[dayKey];
        break;
      }
    }
  }

  if (!departuresList || departuresList.length === 0) {
    for (const tripData of Object.values(rawHorarios || {})) {
      if (typeof tripData === 'object' && tripData !== null) {
        for (const dirObj of Object.values(tripData)) {
          if (dirObj && Array.isArray(dirObj[dayKey]) && dirObj[dayKey].length > 0) {
            departuresList = dirObj[dayKey];
            break;
          }
        }
      }
      if (departuresList && departuresList.length > 0) break;
    }
  }

  return departuresList || [];
}

/**
 * Extrai o primeiro e o último horário de partida formatados
 */
function getFirstAndLastDeparture(departuresList) {
  if (!departuresList || departuresList.length === 0) {
    return { first: '04h00', last: '00h00', hasSchedule: false };
  }

  const times = departuresList.map(t => {
    const parts = t.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1] || '0', 10);
    return {
      formatted: `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}`,
      minutes: (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m)
    };
  }).sort((a, b) => a.minutes - b.minutes);

  return {
    first: times[0].formatted,
    last: times[times.length - 1].formatted,
    hasSchedule: true
  };
}

/**
 * Agrupa as partidas em faixas horárias operacionais e calcula o intervalo médio (Estilo Lá Vem o Ônibus)
 */
function calculateScheduleIntervals(departuresList) {
  if (!departuresList || departuresList.length === 0) return [];

  const minutesList = departuresList.map(t => {
    const parts = t.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1] || '0', 10);
    return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
  }).filter(m => !isNaN(m)).sort((a, b) => a - b);

  if (minutesList.length === 0) return [];

  if (minutesList.length === 1) {
    const h = String(Math.floor(minutesList[0] / 60)).padStart(2, '0');
    const m = String(minutesList[0] % 60).padStart(2, '0');
    return [`1 partida programada às <strong>${h}h${m}</strong>`];
  }

  const windows = [
    { start: 0, end: 4, name: 'Madrugada' },
    { start: 4, end: 12, name: 'Manhã' },
    { start: 12, end: 13, name: 'Pico Almoço' },
    { start: 13, end: 16, name: 'Tarde' },
    { start: 16, end: 19, name: 'Pico Tarde' },
    { start: 19, end: 24, name: 'Noite' }
  ];

  const resultCards = [];

  windows.forEach(w => {
    const windowStartMin = w.start * 60;
    const windowEndMin = w.end * 60;

    const inWindow = minutesList.filter(m => m >= windowStartMin && m < windowEndMin);
    if (inWindow.length === 0) return;

    const startHourStr = `${String(w.start).padStart(2, '0')}h00`;
    const endHourStr = w.end === 24 ? '23h00' : `${String(w.end).padStart(2, '0')}h00`;

    if (inWindow.length === 1) {
      const h = String(Math.floor(inWindow[0] / 60)).padStart(2, '0');
      const m = String(inWindow[0] % 60).padStart(2, '0');
      resultCards.push(`1 partida programada às <strong>${h}h${m}</strong>, entre ${startHourStr} e ${endHourStr}`);
      return;
    }

    let totalDiff = 0;
    for (let i = 0; i < inWindow.length - 1; i++) {
      totalDiff += (inWindow[i + 1] - inWindow[i]);
    }
    const avgDiff = totalDiff / (inWindow.length - 1);

    let roundedMin = 60;
    if (avgDiff <= 7) roundedMin = 5;
    else if (avgDiff <= 12) roundedMin = 10;
    else if (avgDiff <= 17) roundedMin = 15;
    else if (avgDiff <= 24) roundedMin = 20;
    else if (avgDiff <= 37) roundedMin = 30;
    else if (avgDiff <= 52) roundedMin = 45;
    else if (avgDiff <= 75) roundedMin = 60;
    else if (avgDiff <= 105) roundedMin = 90;
    else roundedMin = Math.round(avgDiff / 30) * 30;

    resultCards.push(`Em média, um ônibus a cada <strong>${roundedMin} min</strong>, das <strong>${startHourStr}</strong> às <strong>${endHourStr}</strong>`);
  });

  if (resultCards.length === 0) {
    let totalDiff = 0;
    for (let i = 0; i < minutesList.length - 1; i++) {
      totalDiff += (minutesList[i + 1] - minutesList[i]);
    }
    const generalAvg = Math.max(5, Math.round(totalDiff / (minutesList.length - 1)));
    const firstH = String(Math.floor(minutesList[0] / 60)).padStart(2, '0');
    const firstM = String(minutesList[0] % 60).padStart(2, '0');
    const lastH = String(Math.floor(minutesList[minutesList.length - 1] / 60)).padStart(2, '0');
    const lastM = String(minutesList[minutesList.length - 1] % 60).padStart(2, '0');
    resultCards.push(`Em média, um ônibus a cada <strong>${generalAvg} min</strong>, das <strong>${firstH}h${firstM}</strong> às <strong>${lastH}h${lastM}</strong>`);
  }

  return resultCards;
}

/**
 * Atualiza a Barra de Estatísticas Rápidas do Cabeçalho
 */
function updateLineStatsStrip() {
  const stopsEl = document.getElementById('stat-stops-count');
  const firstEl = document.getElementById('stat-first-time');
  const lastEl = document.getElementById('stat-last-time');
  const distEl = document.getElementById('stat-distance-km');

  const currentTrajeto = state.detailData?.trajetos?.[state.currentDirectionIdx] || state.detailData?.trajetos?.[0];
  const pts = currentTrajeto?.trajeto || [];
  const allStops = currentTrajeto?.paradas || [];
  const validStops = allStops.filter(p => {
    const lat = p.position?.lat || p.lat;
    const lon = p.position?.lon || p.lon;
    if (!lat || !lon) return false;
    if (pts.length > 1) return minDistanceToPolyline(lat, lon, pts) <= 150;
    return true;
  });
  const stopsCount = validStops.length > 0 ? validStops.length : allStops.length;

  const distanceKm = calculatePolylineDistanceKm(pts);
  const distanceStr = distanceKm > 0 ? distanceKm.toFixed(1).replace('.', ',') : '11,7';

  const departures = getDeparturesListForDay(state.detailData?.horarios, state.currentDirectionIdx, state.activeScheduleDay || 'weekday');
  const { first, last } = getFirstAndLastDeparture(departures);

  if (stopsEl) stopsEl.textContent = stopsCount > 0 ? stopsCount : '35';
  if (firstEl) firstEl.textContent = first || '04h00';
  if (lastEl) lastEl.textContent = last || '00h00';
  if (distEl) distEl.textContent = distanceStr;
}

/**
 * Renderiza a Seção de Perguntas Frequentes (FAQ) Dinâmico
 */
function renderFAQSection() {
  const container = document.getElementById('faq-accordion-container');
  if (!container || !state.detailData) return;

  const currentTrajeto = state.detailData.trajetos?.[state.currentDirectionIdx] || state.detailData.trajetos?.[0] || {};
  const headsign = currentTrajeto.trip_headsign || 'Itinerário Principal';
  const pts = currentTrajeto.trajeto || [];
  const paradas = (currentTrajeto.paradas || []).filter(p => {
    const lat = p.position?.lat || p.lat;
    const lon = p.position?.lon || p.lon;
    if (!lat || !lon) return false;
    if (pts.length > 1) return minDistanceToPolyline(lat, lon, pts) <= 150;
    return true;
  });
  const stopsCount = paradas.length > 0 ? paradas.length : (currentTrajeto.paradas || []).length || 35;
  const distanceKm = calculatePolylineDistanceKm(pts);
  const distanceStr = distanceKm > 0 ? `${distanceKm.toFixed(1).replace('.', ',')} km` : '11,7 km';

  const departures = getDeparturesListForDay(state.detailData.horarios, state.currentDirectionIdx, 'weekday');
  const { first, last } = getFirstAndLastDeparture(departures);

  const cityName = state.cityConfig.name || 'Rio de Janeiro';
  const line = state.lineCode;

  const faqs = [
    {
      q: `Qual é o primeiro horário da linha ${line} no ${cityName}?`,
      a: `O primeiro ônibus da linha <strong>${line}</strong> parte às <strong>${first}</strong> nos dias úteis (sentido <em>${headsign}</em>). Nos fins de semana e feriados, a programação inicial pode sofrer pequenas alterações conforme a tabela da operadora.`
    },
    {
      q: `Até que horas a linha ${line} circula?`,
      a: `A linha <strong>${line}</strong> circula diariamente com saídas programadas até aproximadamente <strong>${last}</strong>. Você pode acompanhar todas as saídas no quadro de horários acima ou verificar no mapa se há veículos ativos em rota neste momento.`
    },
    {
      q: `Quantas paradas tem a linha ${line}?`,
      a: `No sentido <strong>${headsign}</strong>, a linha <strong>${line}</strong> conta com aproximadamente <strong>${stopsCount} paradas</strong> ao longo de <strong>${distanceStr}</strong> de trajeto.`
    },
    {
      q: `Onde vejo a linha ${line} em tempo real?`,
      a: `Você pode acompanhar a localização dos ônibus da linha <strong>${line}</strong> em tempo real diretamente no mapa interativo desta página ou através do aplicativo oficial <strong>Cadê o Ônibus?</strong> no celular, com alertas quando o ônibus estiver chegando ao seu ponto.`
    }
  ];

  container.innerHTML = faqs.map((f, idx) => `
    <div class="faq-item">
      <button type="button" class="faq-question">
        <span>${f.q}</span>
        <i class="fa-solid fa-chevron-down faq-chevron"></i>
      </button>
      <div class="faq-answer">
        <p>${f.a}</p>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      if (item) {
        const isOpen = item.classList.contains('open');
        container.querySelectorAll('.faq-item').forEach(other => {
          if (other !== item) other.classList.remove('open');
        });
        item.classList.toggle('open', !isOpen);
      }
    });
  });
}

/**
 * Renderiza a Seção de Outras Linhas da Cidade
 */
function renderOtherLinesSection() {
  const container = document.getElementById('other-lines-grid-container');
  const titleEl = document.getElementById('other-lines-title');
  const btnSeeAll = document.getElementById('btn-see-all-city-lines');
  const labelSeeAll = document.getElementById('see-all-city-lines-label');
  if (!container) return;

  const cityName = state.cityConfig.name || 'Rio de Janeiro';
  if (titleEl) {
    titleEl.innerHTML = `<i class="fa-solid fa-signs-post"></i> Outras linhas do ${cityName}`;
  }
  if (btnSeeAll) {
    btnSeeAll.href = `linhas.html?cidade=${state.citySlug}`;
  }
  if (labelSeeAll) {
    labelSeeAll.textContent = `Todas as linhas do ${cityName}`;
  }

  const allEntries = Object.entries(state.allCityLines || {});
  const candidates = allEntries.filter(([code]) => code !== state.lineCode);

  const currentNum = parseInt(state.lineCode.replace(/\D/g, ''), 10);
  candidates.sort((a, b) => {
    const numA = parseInt(a[0].replace(/\D/g, ''), 10);
    const numB = parseInt(b[0].replace(/\D/g, ''), 10);
    if (!isNaN(currentNum) && !isNaN(numA) && !isNaN(numB)) {
      return Math.abs(numA - currentNum) - Math.abs(numB - currentNum);
    }
    return 0;
  });

  const selected = candidates.slice(0, 8);
  if (selected.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted); grid-column: 1 / -1; text-align: center;">Consulte todas as linhas no botão abaixo.</p>`;
    return;
  }

  container.innerHTML = selected.map(([code, info]) => {
    const desc = info.description || `Linha ${code}`;
    const city = info.cityKey || state.citySlug;
    return `
      <a href="linha.html?cidade=${city}&linha=${encodeURIComponent(code)}" class="other-line-card">
        <span class="other-line-badge">${code}</span>
        <span class="other-line-headsign" title="${desc}">${desc}</span>
      </a>
    `;
  }).join('');
}

/**
 * Renderiza Aba de Horários Formatada Oficial com Intervalos Médios (Estilo Lá Vem o Ônibus)
 */
function renderSchedulesTab() {
  const container = document.getElementById('pane-horarios');
  if (!container) return;

  const rawHorarios = state.detailData?.horarios;
  const departuresList = getDeparturesListForDay(rawHorarios, state.currentDirectionIdx, state.activeScheduleDay);
  const intervals = calculateScheduleIntervals(departuresList);

  const dayLabels = {
    weekday: 'Dias Úteis',
    saturday: 'Sábados',
    sunday: 'Domingos e Feriados'
  };

  let html = `
    <div class="schedule-tab-header">
      <div class="schedule-day-switcher">
        <button class="schedule-day-btn ${state.activeScheduleDay === 'weekday' ? 'active' : ''}" data-day="weekday">Dias Úteis</button>
        <button class="schedule-day-btn ${state.activeScheduleDay === 'saturday' ? 'active' : ''}" data-day="saturday">Sábados</button>
        <button class="schedule-day-btn ${state.activeScheduleDay === 'sunday' ? 'active' : ''}" data-day="sunday">Domingos/Feriados</button>
      </div>
    </div>
    <div class="schedule-body">
  `;

  if (!departuresList || departuresList.length === 0) {
    html += `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
        <i class="fa-regular fa-calendar-xmark" style="font-size: 2rem; margin-bottom: 10px; color: var(--primary);"></i>
        <p>Nenhum horário programado para ${dayLabels[state.activeScheduleDay] || 'este dia'} neste sentido.</p>
      </div>
    `;
  } else {
    html += `
      <div class="schedule-toggle-view-wrap">
        <button type="button" class="btn-toggle-schedule-view" id="btn-toggle-schedule-mode">
          <i class="fa-solid ${state.scheduleViewMode === 'grid' ? 'fa-list-check' : 'fa-table-cells'}"></i>
          <span>${state.scheduleViewMode === 'grid' ? 'Ver resumo por intervalos' : 'Ver grade completa minuto a minuto'}</span>
        </button>
      </div>
    `;

    if (state.scheduleViewMode === 'grid') {
      const hoursMap = {};
      departuresList.forEach(timeStr => {
        const parts = timeStr.split(':');
        if (parts.length >= 2) {
          const hour = `${parts[0]}h`;
          const min = parts[1];
          if (!hoursMap[hour]) hoursMap[hour] = [];
          hoursMap[hour].push(min);
        }
      });

      const sortedHours = Object.keys(hoursMap).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

      html += `<div class="schedule-grid-hours">`;
      sortedHours.forEach(hour => {
        const minutes = hoursMap[hour];
        html += `
          <div class="schedule-hour-card">
            <div class="schedule-hour-badge">${hour}</div>
            <div class="schedule-departures-list">
              ${minutes.map(m => `<span class="departure-chip">${hour.replace('h', '')}:${m}</span>`).join('')}
            </div>
          </div>
        `;
      });
      html += `</div>`;
    } else {
      html += `<div class="schedule-intervals-list">`;
      intervals.forEach(card => {
        html += `
          <div class="schedule-interval-card">
            <i class="fa-solid fa-clock-rotate-left"></i>
            <span>${card}</span>
          </div>
        `;
      });
      html += `</div>`;
    }

    html += `
      <div class="schedule-note-footer">
        Os horários são informados pela operadora e podem mudar. No app, você acompanha a posição dos ônibus da linha <strong>${state.lineCode}</strong> em tempo real.
      </div>
    `;
  }

  html += `</div>`;
  container.innerHTML = html;

  container.querySelectorAll('.schedule-day-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const day = btn.getAttribute('data-day');
      if (day && day !== state.activeScheduleDay) {
        state.activeScheduleDay = day;
        renderSchedulesTab();
        updateLineStatsStrip();
      }
    });
  });

  const toggleBtn = document.getElementById('btn-toggle-schedule-mode');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      state.scheduleViewMode = state.scheduleViewMode === 'grid' ? 'intervals' : 'grid';
      renderSchedulesTab();
    });
  }
}

/**
 * Configura navegação por abas
 */
function setupTabs() {
  const tabs = document.querySelectorAll('.line-tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      btn.classList.add('active');

      const targetId = `pane-${btn.getAttribute('data-tab')}`;
      document.querySelectorAll('.line-tab-pane').forEach(pane => pane.classList.remove('active'));

      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add('active');
    });
  });
}

/**
 * Configura Listeners de Busca Rápida de Linhas no Topo de `linha.html`
 */
function setupEventListeners() {
  const lineSearchInput = document.getElementById('line-quick-search-input');
  const lineSearchResults = document.getElementById('line-quick-search-results');

  if (lineSearchInput && lineSearchResults) {
    lineSearchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        lineSearchResults.style.display = 'none';
        return;
      }

      const entries = Object.entries(state.allCityLines);
      const matches = entries.filter(([code, info]) => {
        return code.toLowerCase().includes(q) || (info.description && info.description.toLowerCase().includes(q));
      }).slice(0, 10);

      if (matches.length === 0) {
        lineSearchResults.innerHTML = `
          <div style="padding: 12px 16px; color: var(--text-muted); font-size: 0.9rem;">
            Nenhuma linha encontrada para "${e.target.value}"
          </div>
        `;
        lineSearchResults.style.display = 'block';
        return;
      }

      lineSearchResults.innerHTML = matches.map(([code, info]) => {
        const desc = info.description || '';
        const cityKey = info.cityKey || '';
        return `
          <div class="line-search-result-item" data-code="${code}" data-city="${cityKey}">
            <span class="result-badge">${code}</span>
            <span class="result-desc">${desc}</span>
          </div>
        `;
      }).join('');

      lineSearchResults.style.display = 'block';

      lineSearchResults.querySelectorAll('.line-search-result-item').forEach(item => {
        item.addEventListener('click', () => {
          const code = item.getAttribute('data-code');
          const cityKey = item.getAttribute('data-city');
          if (code) {
            lineSearchInput.value = '';
            lineSearchResults.style.display = 'none';
            loadLineData(code, cityKey);
          }
        });
      });
    });

    lineSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = lineSearchInput.value.toLowerCase().trim();
        const entries = Object.entries(state.allCityLines);
        const match = entries.find(([code, info]) => {
          return code.toLowerCase() === q || code.toLowerCase().includes(q) || (info.description && info.description.toLowerCase().includes(q));
        });

        if (match) {
          lineSearchInput.value = '';
          lineSearchResults.style.display = 'none';
          loadLineData(match[0], match[1]?.cityKey);
        }
      }
    });

    document.addEventListener('click', (e) => {
      if (!lineSearchInput.contains(e.target) && !lineSearchResults.contains(e.target)) {
        lineSearchResults.style.display = 'none';
      }
    });
  }

  const centerBtn = document.getElementById('btn-map-center');
  if (centerBtn) {
    centerBtn.addEventListener('click', () => {
      if (state.routeLayer && state.map) {
        const bounds = state.routeLayer.getBounds ? state.routeLayer.getBounds() : null;
        if (bounds && bounds.isValid && bounds.isValid()) {
          state.map.fitBounds(bounds, { padding: [40, 40] });
        } else {
          drawRouteAndStops();
        }
      }
    });
  }

  const toggleStopsBtn = document.getElementById('btn-map-toggle-stops');
  if (toggleStopsBtn) {
    toggleStopsBtn.addEventListener('click', () => {
      state.stopsVisible = !state.stopsVisible;
      if (state.stopsVisible) {
        if (state.map && state.map.getZoom() < 14) {
          state.map.setZoom(14.5);
        }
        updateStopsVisibilityByZoom();
      } else {
        if (state.map && state.map.hasLayer(state.stopsLayer)) {
          state.map.removeLayer(state.stopsLayer);
        }
        toggleStopsBtn.style.color = 'var(--text-muted)';
      }
    });
  }

  const fullscreenBtn = document.getElementById('btn-map-fullscreen');
  const mapWrapper = document.getElementById('map-wrapper');
  if (fullscreenBtn && mapWrapper) {
    fullscreenBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        mapWrapper.requestFullscreen().then(() => {
          if (state.map) setTimeout(() => state.map.invalidateSize(), 200);
        }).catch(err => console.warn(err));
      } else {
        document.exitFullscreen().then(() => {
          if (state.map) setTimeout(() => state.map.invalidateSize(), 200);
        }).catch(err => console.warn(err));
      }
    });
  }

  const stopSearchInput = document.getElementById('stops-search-input');
  if (stopSearchInput) {
    stopSearchInput.addEventListener('input', (e) => {
      state.stopSearchQuery = e.target.value;
      renderStopsTimeline();
    });
  }

  // Listeners do Modal de Colaboração
  const btnCloseColab = document.getElementById('btn-close-colab-modal');
  const colabModal = document.getElementById('colab-modal');
  if (btnCloseColab) {
    btnCloseColab.addEventListener('click', window.closeColaborarModal);
  }
  if (colabModal) {
    colabModal.addEventListener('click', (e) => {
      if (e.target === colabModal) {
        window.closeColaborarModal();
      }
    });
  }

  window.addEventListener('popstate', () => {
    initParamsFromUrl();
    loadLineData(state.lineCode);
  });
}

/**
 * Funções Globais para o Modal de Colaboração
 */
window.openColaborarModal = function(carId, lineCode) {
  const modal = document.getElementById('colab-modal');
  const infoEl = document.getElementById('colab-modal-bus-info');
  if (infoEl) {
    const line = lineCode || state.lineCode || '';
    const car = carId ? ` • Ônibus ${carId}` : '';
    infoEl.textContent = `Linha ${line}${car}`;
  }
  if (modal) {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
};

window.closeColaborarModal = function() {
  const modal = document.getElementById('colab-modal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }
};

/**
 * Exibe tela de carregamento ou erro
 */
function setLoadingState(isLoading) {
  const skeleton = document.getElementById('detail-loading-skeleton');
  const content = document.getElementById('detail-main-content');

  if (skeleton) skeleton.style.display = isLoading ? 'block' : 'none';
  if (content) {
    content.style.display = isLoading ? 'none' : 'block';
  }
}

function renderErrorState(msg) {
  const container = document.getElementById('detail-main-content');
  if (container) {
    container.style.display = 'block';
    container.innerHTML = `
      <div style="text-align: center; padding: 80px 20px; background: var(--line-card-bg); border-radius: 20px; border: 1px solid var(--surface-border);">
        <div style="font-size: 3rem; margin-bottom: 16px;">🚌💨</div>
        <h2 style="font-size: 1.6rem; margin-bottom: 8px;">Linha ${state.lineCode} não encontrada</h2>
        <p style="color: var(--text-muted); max-width: 520px; margin: 0 auto 24px;">
          Não encontramos o trajeto digitalizado para a linha <strong>${state.lineCode}</strong> na cidade de <strong>${state.cityConfig.name}</strong>.
        </p>
        <a href="linhas.html?cidade=${state.citySlug}" class="btn-primary" style="display: inline-flex; align-items: center; gap: 8px;">
          <i class="fa-solid fa-arrow-left"></i> Voltar para todas as linhas de ${state.cityConfig.name}
        </a>
      </div>
    `;
  }
}

/**
 * Utilitário: Formata tempo relativo dinamicamente com cores de frescor
 */
function getTimeAgoDetails(timestamp) {
  if (!timestamp) return { text: 'há 0s', color: '#4ADE80', bg: 'rgba(34, 197, 94, 0.14)' };
  const diffMs = Date.now() - Number(timestamp);
  const diffSecs = Math.max(0, Math.floor(diffMs / 1000));

  let text = 'há 0s';
  if (diffSecs < 60) {
    text = `há ${diffSecs}s`;
  } else if (diffSecs < 3600) {
    text = `há ${Math.floor(diffSecs / 60)}m`;
  } else if (diffSecs < 86400) {
    text = `há ${Math.floor(diffSecs / 3600)}h`;
  } else {
    text = `há ${Math.floor(diffSecs / 86400)}d`;
  }

  let color = '#4ADE80';
  let bg = 'rgba(34, 197, 94, 0.14)';
  if (diffSecs > 300) {
    color = '#F87171';
    bg = 'rgba(239, 68, 68, 0.14)';
  } else if (diffSecs > 120) {
    color = '#FBBF24';
    bg = 'rgba(245, 158, 11, 0.14)';
  }

  return { text, color, bg };
}

/**
 * Utilitário: Formata velocidade com ícones e status
 */
function getSpeedDetails(speed) {
  const isStopped = !speed || speed <= 0;
  if (isStopped) {
    return {
      text: 'Parado',
      color: '#94A3B8',
      bg: 'rgba(255, 255, 255, 0.08)',
      icon: 'fa-solid fa-gauge-simple'
    };
  }
  return {
    text: `${speed} km/h`,
    color: '#38BDF8',
    bg: 'rgba(14, 165, 233, 0.14)',
    icon: 'fa-solid fa-gauge-high'
  };
}

/**
 * Utilitário: Formata tempo relativo simples
 */
function formatTimeAgo(timestamp) {
  return getTimeAgoDetails(timestamp).text;
}

/**
 * Utilitário: Contraste de cor
 */
function getContrastColor(hexColor) {
  if (!hexColor || !hexColor.startsWith('#')) return '#ffffff';
  const c = hexColor.replace('#', '');
  if (c.length !== 6) return '#ffffff';
  const r = parseInt(c.substr(0, 2), 16);
  const g = parseInt(c.substr(2, 2), 16);
  const b = parseInt(c.substr(4, 2), 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 150) ? '#000000' : '#ffffff';
}

let liveTimeTickerInterval = null;

/**
 * Ticker em tempo real: atualiza os segundos de transmissão GPS a cada 1 segundo
 */
function startLiveTimeTicker() {
  if (liveTimeTickerInterval) clearInterval(liveTimeTickerInterval);
  liveTimeTickerInterval = setInterval(() => {
    const elements = document.querySelectorAll('[data-gps-time]');
    if (!elements || elements.length === 0) return;

    elements.forEach(el => {
      const ts = Number(el.getAttribute('data-gps-time'));
      if (!ts) return;
      const timeInfo = getTimeAgoDetails(ts);
      const textEl = el.querySelector('.live-seconds-text');
      if (textEl) {
        textEl.textContent = timeInfo.text;
      }
      if (el.classList.contains('pill-time')) {
        el.style.color = timeInfo.color;
        el.style.background = timeInfo.bg;
        const icon = el.querySelector('i');
        if (icon) icon.style.color = timeInfo.color;
      }
    });
  }, 1000);
}
