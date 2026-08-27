/**
 * Cadê o Ônibus? — Detalhes da Linha, Trajeto no Mapa e Ônibus em Tempo Real
 * Design System idêntico ao App Flutter: Setas direcionais com a cor da linha,
 * balão de informações oficial, filtro rigoroso de trajeto e polling automático de 15s.
 */

import {
  CITIES_CONFIG,
  CDN_BASE_URL,
  BACKEND_BASE_URL,
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

  state.citySlug = normalizeCitySlug(cityParam || 'rio');
  state.cityConfig = getCityConfig(state.citySlug);

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
  const breadcrumbLine = document.getElementById('breadcrumb-line');

  if (breadcrumbCity) {
    breadcrumbCity.href = `linhas.html?cidade=${state.citySlug}`;
    breadcrumbCity.textContent = `${state.cityConfig.name} (${state.cityConfig.state})`;
  }

  if (breadcrumbLine) {
    breadcrumbLine.textContent = `Linha ${state.lineCode}`;
  }

  document.title = `Linha ${state.lineCode} — Trajeto e Ônibus em Tempo Real (${state.cityConfig.name}) | Cadê o Ônibus?`;
}

/**
 * Carrega a lista completa de linhas da cidade para o autocomplete
 */
async function loadAllCityLinesForSearch() {
  try {
    const res = await fetch(`${CDN_BASE_URL}/${state.citySlug}/line_info.json`);
    if (res.ok) {
      state.allCityLines = await res.json();
    }
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
  state.stopsLayer = L.layerGroup().addTo(state.map);
  state.vehiclesLayer = L.layerGroup().addTo(state.map);

  window.addEventListener('resize', () => {
    if (state.map) state.map.invalidateSize();
  });
}

/**
 * Carrega os dados de uma linha específica (itinerário, paradas, horários)
 */
export async function loadLineData(lineCodeToLoad) {
  state.lineCode = (lineCodeToLoad || state.lineCode).trim();
  state.currentDirectionIdx = 0;
  state.vehicleMarkersMap.clear();

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
    // 1. Busca line_info para metadados
    let info = state.allCityLines[state.lineCode] || null;
    if (!info) {
      try {
        const resInfo = await fetch(`${CDN_BASE_URL}/${state.citySlug}/line_info.json`);
        if (resInfo.ok) {
          state.allCityLines = await resInfo.json();
          info = findLineInfoCanonical(state.lineCode, state.allCityLines);
        }
      } catch (e) {
        console.warn('Erro ao buscar line_info:', e);
      }
    }

    state.lineInfo = info || {
      description: `Linha ${state.lineCode}`,
      consortiumName: 'Municipal',
      consortiumColor: '#1C83E4',
      price: state.cityConfig.fare
    };

    // 2. Busca o JSON detalhado do trajeto
    const detailUrl = `${CDN_BASE_URL}/${state.citySlug}/detalhes/${encodeURIComponent(state.lineCode)}.json`;
    let resDetail = await fetch(detailUrl);

    if (!resDetail.ok) {
      const upperUrl = `${CDN_BASE_URL}/${state.citySlug}/detalhes/${encodeURIComponent(state.lineCode.toUpperCase())}.json`;
      resDetail = await fetch(upperUrl);
    }

    if (!resDetail.ok) {
      throw new Error(`Arquivo de trajeto não encontrado para a linha ${state.lineCode} (${resDetail.status})`);
    }

    const detailData = await resDetail.json();
    state.detailData = detailData;

    renderLineHeader();
    renderDirectionSwitcher();
    drawRouteAndStops();
    renderStopsTimeline();
    renderSchedulesTab();

    // Inicia rastreamento ao vivo com polling de 15 segundos
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
    const p = state.lineInfo.price ? `R$ ${parseFloat(state.lineInfo.price).toFixed(2).replace('.', ',')}` : state.cityConfig.fare;
    fareEl.textContent = p;
  }

  if (agencyEl) {
    agencyEl.textContent = state.cityConfig.fullName;
  }

  document.title = `Linha ${state.lineCode} (${state.lineInfo.description}) — Trajeto e Ônibus ao Vivo | Cadê o Ônibus?`;
}

/**
 * Renderiza o Seletor de Sentidos (Ida / Volta) com espaçamento correto lado a lado
 */
function renderDirectionSwitcher() {
  const container = document.getElementById('direction-switcher');
  if (!container || !state.detailData || !state.detailData.trajetos) return;

  const trajetos = state.detailData.trajetos;
  if (trajetos.length <= 1) {
    const headsign = trajetos[0]?.trip_headsign || 'Itinerário Completo';
    const stopsCount = trajetos[0]?.paradas?.length || 0;
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
    const stopsCount = t.paradas?.length || 0;

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
      }
    });
  });
}

/**
 * Desenha a Polyline do Trajeto e os Marcadores de Paradas
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

  // 3. Renderiza Paradas Circulares (Idênticas ao BusStopMarkerIcon do Flutter)
  const paradas = currentTrajeto.paradas || [];
  paradas.forEach((parada, index) => {
    const lat = parada.position?.lat || parada.lat;
    const lon = parada.position?.lon || parada.lon;
    if (!lat || !lon) return;

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
        }
      }, 150);
    }
  } catch (e) {
    console.warn('Erro ao ajustar bounds do mapa:', e);
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
    const url = `${BACKEND_BASE_URL}/vehicles?city=${state.citySlug}&lines=${encodeURIComponent(state.lineCode)}`;
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
    const timeAgo = formatTimeAgo(vehicle.dataHora);
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

    // Balão (Popup) idêntico ao app Flutter (sem botão colaborar)
    const popupHtml = `
      <div class="flutter-bus-popup">
        <div class="popup-top-banner" style="background: ${lineColor};">
          <div class="popup-line-circle">${state.lineCode}</div>
          <div class="popup-headsign">${dest}</div>
        </div>
        <div class="popup-body">
          <div class="popup-pill-row">
            <span class="popup-pill pill-car"><i class="fa-solid fa-bus"></i> ${carId}</span>
            <span class="popup-pill pill-speed"><i class="fa-solid fa-gauge-high"></i> ${speed} km/h</span>
          </div>
          <div class="popup-pill-row" style="justify-content: center; margin-top: 2px;">
            <span class="popup-pill pill-time"><i class="fa-regular fa-clock"></i> ${timeAgo}</span>
          </div>
        </div>
      </div>
    `;

    marker.bindPopup(popupHtml, {
      className: 'flutter-leaflet-popup',
      closeButton: false,
      offset: [0, -8]
    });
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
          <p><i class="fa-solid fa-gauge-high"></i> ${speed} km/h &bull; <i class="fa-solid fa-clock"></i> ${timeAgo}</p>
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
 * Renderiza Linha do Tempo de Paradas / Itinerário
 */
function renderStopsTimeline() {
  const container = document.getElementById('stops-list-container');
  const countEl = document.getElementById('stops-tab-count');
  if (!container || !state.detailData || !state.detailData.trajetos) return;

  const currentTrajeto = state.detailData.trajetos[state.currentDirectionIdx] || state.detailData.trajetos[0];
  const paradas = currentTrajeto?.paradas || [];

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
            <span class="stop-item-title">${p.stopName}</span>
            <span class="stop-item-seq">Ponto ${originalIndex + 1}</span>
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
 * Renderiza Aba de Horários Formatada Oficial
 */
function renderSchedulesTab() {
  const container = document.getElementById('pane-horarios');
  if (!container) return;

  const rawHorarios = state.detailData?.horarios;
  if (!rawHorarios || Object.keys(rawHorarios).length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 48px 20px; background: var(--line-card-bg); border-radius: 16px; border: 1px solid var(--surface-border);">
        <div style="font-size: 2.2rem; margin-bottom: 12px;">📅</div>
        <h4 style="font-size: 1.15rem; margin-bottom: 6px;">Quadro de Horários Estimado</h4>
        <p style="color: var(--text-muted); max-width: 500px; margin: 0 auto 16px;">
          Esta linha opera com frequência contínua baseada em intervalos no transporte público de ${state.cityConfig.name}. Acompanhe os ônibus no mapa acima para saber o momento exato de chegada.
        </p>
      </div>
    `;
    return;
  }

  const dirKey = String(state.currentDirectionIdx);
  let departuresList = [];

  for (const tripData of Object.values(rawHorarios)) {
    if (typeof tripData === 'object' && tripData !== null) {
      const dirData = tripData[dirKey] || tripData['0'] || tripData['1'];
      if (dirData && dirData[state.activeScheduleDay]) {
        departuresList = dirData[state.activeScheduleDay];
        break;
      }
    }
  }

  if (!departuresList || departuresList.length === 0) {
    for (const tripData of Object.values(rawHorarios)) {
      if (typeof tripData === 'object' && tripData !== null) {
        for (const dirObj of Object.values(tripData)) {
          if (dirObj && Array.isArray(dirObj[state.activeScheduleDay]) && dirObj[state.activeScheduleDay].length > 0) {
            departuresList = dirObj[state.activeScheduleDay];
            break;
          }
        }
      }
      if (departuresList && departuresList.length > 0) break;
    }
  }

  const hoursMap = {};
  (departuresList || []).forEach(timeStr => {
    if (!timeStr) return;
    const parts = timeStr.split(':');
    const hour = parts[0] ? `${parts[0].padStart(2, '0')}h` : '00h';
    const min = parts[1] || '00';
    if (!hoursMap[hour]) hoursMap[hour] = [];
    hoursMap[hour].push(min);
  });

  const sortedHours = Object.keys(hoursMap).sort();
  const totalDepartures = departuresList ? departuresList.length : 0;

  const currentTrajeto = state.detailData?.trajetos?.[state.currentDirectionIdx];
  const headsign = currentTrajeto?.trip_headsign || 'Itinerário';

  let html = `
    <div class="schedule-container">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; margin-bottom: 20px;">
        <div>
          <h3 style="font-size: 1.25rem; font-weight: 800; color: var(--text); margin-bottom: 4px;">
            Partidas Programadas — Sentido ${headsign}
          </h3>
          <p style="color: var(--text-muted); font-size: 0.88rem; margin: 0;">
            Total de <strong>${totalDepartures} partidas registradas</strong> no planejamento operacional.
          </p>
        </div>

        <div class="schedule-day-tabs">
          <button class="schedule-day-btn ${state.activeScheduleDay === 'weekday' ? 'active' : ''}" data-day="weekday">
            <i class="fa-solid fa-calendar-day"></i> Dias Úteis
          </button>
          <button class="schedule-day-btn ${state.activeScheduleDay === 'saturday' ? 'active' : ''}" data-day="saturday">
            <i class="fa-solid fa-calendar-check"></i> Sábado
          </button>
          <button class="schedule-day-btn ${state.activeScheduleDay === 'sunday' ? 'active' : ''}" data-day="sunday">
            <i class="fa-solid fa-umbrella-beach"></i> Domingo e Feriados
          </button>
        </div>
      </div>
  `;

  if (sortedHours.length === 0) {
    html += `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
        Nenhum horário programado para este dia da semana neste sentido.
      </div>
    `;
  } else {
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
  }

  html += `</div>`;
  container.innerHTML = html;

  container.querySelectorAll('.schedule-day-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const day = btn.getAttribute('data-day');
      if (day && day !== state.activeScheduleDay) {
        state.activeScheduleDay = day;
        renderSchedulesTab();
      }
    });
  });
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
        return `
          <div class="line-search-result-item" data-code="${code}">
            <span class="result-badge">${code}</span>
            <span class="result-desc">${desc}</span>
          </div>
        `;
      }).join('');

      lineSearchResults.style.display = 'block';

      lineSearchResults.querySelectorAll('.line-search-result-item').forEach(item => {
        item.addEventListener('click', () => {
          const code = item.getAttribute('data-code');
          if (code) {
            lineSearchInput.value = '';
            lineSearchResults.style.display = 'none';
            loadLineData(code);
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
          loadLineData(match[0]);
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
        state.stopsLayer.addTo(state.map);
        toggleStopsBtn.style.color = 'var(--primary)';
      } else {
        state.map.removeLayer(state.stopsLayer);
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

  window.addEventListener('popstate', () => {
    initParamsFromUrl();
    loadLineData(state.lineCode);
  });
}

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
 * Utilitário: Formata tempo relativo ("há 15 seg", "há 2 min")
 */
function formatTimeAgo(timestamp) {
  if (!timestamp) return 'Agora';
  const diffMs = Date.now() - Number(timestamp);
  const diffSecs = Math.floor(diffMs / 1000);

  if (diffSecs < 10) return 'Agora mesmo';
  if (diffSecs < 60) return `Há ${diffSecs} seg`;
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `Há ${diffMins} min`;
  return 'Há mais de 1h';
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
