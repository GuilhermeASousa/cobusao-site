/**
 * Cadê o Ônibus? — Catálogo de Linhas por Cidade/Região
 * Client-Side Explorer com pesquisa instantânea, filtros por consórcio,
 * modal de troca de cidade e integração direta com as 26 regiões GTFS.
 */

import {
  CITIES_CONFIG,
  STATE_HUBS,
  CDN_BASE_URL,
  getCityConfig,
  normalizeCitySlug
} from './cities-config.js';
import { regionManager } from './region-manager.js';

// Estado global da listagem
const state = {
  currentCitySlug: 'rio',
  cityConfig: null,
  rawLinesData: {},
  linesList: [],
  filteredLines: [],
  activeConsortium: 'ALL',
  searchQuery: '',
  renderedCount: 48,
  batchSize: 48
};

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  initCityFromUrl();
  setupEventListeners();
  setupCityModal();
  loadCityLines(state.currentCitySlug);
});

// Escuta alterações de região vindas de outras partes do site
window.addEventListener('cobusao-region-changed', (e) => {
  if (e.detail && e.detail.cityKey && e.detail.cityKey !== state.currentCitySlug) {
    switchCity(e.detail.cityKey);
  }
});

// Expõe globalmente para o regionManager
window.cobusaoReloadCityLines = switchCity;

/**
 * Lê a cidade da query string (?cidade=sp ou ?cidade=rio) ou da região ativa do storage
 */
function initCityFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const cityParam = params.get('cidade') || params.get('c') || regionManager.getActiveCity() || 'rio';
  const queryParam = params.get('q') || params.get('busca') || '';

  state.currentCitySlug = normalizeCitySlug(cityParam);
  state.cityConfig = getCityConfig(state.currentCitySlug);
  if (queryParam) {
    state.searchQuery = queryParam;
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = queryParam;
  }

  updatePageMeta(state.cityConfig);
}

/**
 * Atualiza títulos e metas da página de acordo com a cidade
 */
function updatePageMeta(city) {
  document.title = `Linhas de Ônibus de ${city.name} - ${city.state} | Cadê o Ônibus?`;
  
  const heroTitle = document.getElementById('hero-title');
  if (heroTitle) {
    heroTitle.innerHTML = `Linhas de Ônibus — ${city.name} <span style="font-weight:400; color:var(--text-muted);">(${city.state})</span>`;
  }

  const heroDesc = document.getElementById('hero-desc');
  if (heroDesc) {
    const subtitle = city.coverageSubtitle ? ` (${city.coverageSubtitle})` : '';
    heroDesc.textContent = `Consulte o trajeto, paradas, tabela de horários e rastreamento em tempo real das linhas de ${city.name} e região${subtitle}.`;
  }

  const currentCityBtnText = document.getElementById('current-city-name');
  const heroCityFlag = document.getElementById('hero-city-flag');
  if (heroCityFlag) {
    heroCityFlag.textContent = city.flag || '📍';
  }
  if (currentCityBtnText) {
    currentCityBtnText.textContent = `${city.name} (${city.state})`;
  }
}

/**
 * Renderiza atalhos rápidos das capitais mais populares
 */
function renderQuickCityPills() {
  const container = document.getElementById('quick-cities-pills');
  if (!container) return;

  const popularKeys = ['rio', 'sp', 'bh', 'curitiba', 'brasilia', 'porto_alegre', 'florianopolis', 'salvador', 'goiania'];
  
  container.innerHTML = popularKeys.map(key => {
    const c = CITIES_CONFIG[key];
    if (!c) return '';
    const isActive = c.key === state.currentCitySlug;
    return `
      <button class="quick-city-pill ${isActive ? 'active' : ''}" data-city="${c.key}">
        ${c.name}
      </button>
    `;
  }).join('');

  container.querySelectorAll('.quick-city-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetSlug = btn.getAttribute('data-city');
      if (targetSlug && targetSlug !== state.currentCitySlug) {
        switchCity(targetSlug);
      }
    });
  });
}

/**
 * Alterna a cidade atual dinamicamente
 */
export function switchCity(newCitySlug) {
  const norm = normalizeCitySlug(newCitySlug);
  if (norm === state.currentCitySlug && state.linesList.length > 0) return;

  state.currentCitySlug = norm;
  state.cityConfig = getCityConfig(norm);
  state.activeConsortium = 'ALL';
  state.searchQuery = '';
  state.renderedCount = state.batchSize;

  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';

  // Atualiza URL
  const url = new URL(window.location);
  url.searchParams.set('cidade', norm);
  window.history.pushState({}, '', url);

  updatePageMeta(state.cityConfig);
  loadCityLines(norm);

  // Fecha modal de cidades se estiver aberto
  closeCityModal();
}

/**
 * Extrai o código numérico base de linhas para identificar variantes reais (ex: 01DC -> 1, 0001 -> 1)
 */
function getBaseLineCode(code) {
  const upper = (code || '').trim().toUpperCase();
  const match = upper.match(/^(\d+)[A-Z]{2}$/);
  if (match) {
    return match[1].replace(/^0+/, '');
  }
  return upper.replace(/^0+/, '');
}

/**
 * Carrega o arquivo `line_info.json` de todos os subsistemas do polo regional (ex: Rio + DETRO, SP + EMTU + Campinas)
 */
async function loadCityLines(citySlug) {
  const grid = document.getElementById('lines-grid');
  const emptyState = document.getElementById('lines-empty');
  const countBadge = document.getElementById('total-lines-badge');
  const metaCount = document.getElementById('results-count');

  const normHub = normalizeCitySlug(citySlug);
  const hub = STATE_HUBS.find(h => h.key === normHub);
  const subCitiesKeys = (hub && hub.citiesKeys && hub.citiesKeys.length > 0) ? hub.citiesKeys : [citySlug];

  if (grid) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
        <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 2rem; color: var(--primary); margin-bottom: 12px;"></i>
        <p>Carregando catálogo unificado de <strong>${state.cityConfig.stateFullName || state.cityConfig.name}</strong>...</p>
      </div>
    `;
  }

  try {
    // Busca os dados de todas as subcidades do polo em paralelo
    const fetchPromises = subCitiesKeys.map(async (subKey) => {
      try {
        const res = await fetch(`${CDN_BASE_URL}/${subKey}/line_info.json`);
        if (!res.ok) return { subKey, data: {} };
        const data = await res.json();
        return { subKey, data };
      } catch (e) {
        console.warn(`Erro ao carregar linhas da subcidade ${subKey}:`, e);
        return { subKey, data: {} };
      }
    });

    const responses = await Promise.all(fetchPromises);

    const mergedList = [];
    const rawMap = {};

    responses.forEach(({ subKey, data }) => {
      const subConfig = CITIES_CONFIG[subKey] || state.cityConfig;

      Object.entries(data).forEach(([codigo, info]) => {
        rawMap[codigo] = info;

        let consortiumName = info.consortiumName || info.operatorCompany;
        if (!consortiumName || consortiumName === 'Municipal') {
          if (subKey === 'rio_intermunicipal') {
            consortiumName = 'Intermunicipal (DETRO)';
          } else if (subKey === 'emtu') {
            consortiumName = 'EMTU Metropolitano';
          } else if (subKey !== normHub) {
            consortiumName = subConfig.name;
          } else {
            consortiumName = 'Municipal';
          }
        }

        const cleanDesc = info.description || info.agencyName || 'Itinerário não informado';
        const color = info.consortiumColor || getConsortiumColor(consortiumName, subConfig);
        const textColor = info.textColor || '#ffffff';
        const price = info.price ? `R$ ${parseFloat(info.price).toFixed(2).replace('.', ',')}` : subConfig.fare;

        mergedList.push({
          codigo: String(codigo),
          cityKey: subKey,
          agencyName: info.agencyName || subConfig.agencyName,
          description: cleanDesc,
          consortiumName: consortiumName,
          consortiumColor: color,
          textColor: textColor,
          price: price
        });
      });
    });

    // Deduplicação inteligente de variantes reais (ex: 01 e 01DC) mantendo todas as linhas de números diferentes intactas
    const deduplicatedMap = new Map();

    mergedList.forEach(item => {
      const normDesc = item.description.toLowerCase().replace(/\s+/g, ' ').trim();
      const code = item.codigo.trim().toUpperCase();
      const baseCode = getBaseLineCode(code);
      const groupKey = `${item.cityKey}__${baseCode}__${normDesc}`;

      if (deduplicatedMap.has(groupKey)) {
        const existing = deduplicatedMap.get(groupKey);
        const existingCode = existing.codigo.trim().toUpperCase();

        if (code.length > existingCode.length) {
          deduplicatedMap.set(groupKey, item);
        }
      } else {
        deduplicatedMap.set(groupKey, item);
      }
    });

    state.rawLinesData = rawMap;
    state.linesList = Array.from(deduplicatedMap.values());

    // Ordenação inicial natural (ex: 006, 007, 10, 100, 472, LECD133, SVB685)
    sortLinesList();
    state.filteredLines = [...state.linesList];

    if (countBadge) {
      countBadge.textContent = `${state.linesList.length} linhas disponíveis`;
    }

    renderConsortiumFilters();
    applyFilters();

  } catch (err) {
    console.error('Erro ao carregar linhas da cidade:', err);
    if (grid) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: var(--line-card-bg); border-radius: 16px; border: 1px solid var(--surface-border);">
          <div style="font-size: 2.5rem; margin-bottom: 12px;">⚠️</div>
          <h3 style="margin-bottom: 8px;">Erro ao carregar linhas de ${state.cityConfig.name}</h3>
          <p style="color: var(--text-muted); max-width: 480px; margin: 0 auto 16px;">
            Não conseguimos buscar a base de dados desta cidade no momento. Verifique sua conexão.
          </p>
          <button class="btn-primary" onclick="location.reload()">Tentar novamente</button>
        </div>
      `;
    }
  }
}

/**
 * Ordenação Alfanumérica Natural das Linhas
 */
function sortLinesList() {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  state.linesList.sort((a, b) => collator.compare(a.codigo, b.codigo));
}

/**
 * Renderiza os Filtros por Consórcio
 */
function renderConsortiumFilters() {
  const container = document.getElementById('consortium-pills');
  if (!container) return;

  const countsMap = {};
  state.linesList.forEach(line => {
    const c = line.consortiumName;
    countsMap[c] = (countsMap[c] || 0) + 1;
  });

  const sortedConsortiums = Object.entries(countsMap).sort((a, b) => b[1] - a[1]);

  let html = `
    <button class="filter-pill ${state.activeConsortium === 'ALL' ? 'active' : ''}" data-consortium="ALL">
      Todos <span class="count-tag">${state.linesList.length}</span>
    </button>
  `;

  html += sortedConsortiums.map(([name, count]) => {
    const isActive = state.activeConsortium === name;
    return `
      <button class="filter-pill ${isActive ? 'active' : ''}" data-consortium="${name}">
        ${name} <span class="count-tag">${count}</span>
      </button>
    `;
  }).join('');

  container.innerHTML = html;

  container.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = btn.getAttribute('data-consortium');
      state.activeConsortium = c;
      container.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFilters();
    });
  });
}

/**
 * Aplica Filtro de Busca e Consórcio
 */
function applyFilters() {
  const q = state.searchQuery.toLowerCase().trim();
  const activeC = state.activeConsortium;

  state.filteredLines = state.linesList.filter(line => {
    // 1. Filtro de Consórcio
    if (activeC !== 'ALL' && line.consortiumName !== activeC) {
      return false;
    }

    // 2. Filtro de Texto
    if (q) {
      const codeMatch = line.codigo.toLowerCase().includes(q);
      const descMatch = line.description.toLowerCase().includes(q);
      const consMatch = line.consortiumName.toLowerCase().includes(q);
      if (!codeMatch && !descMatch && !consMatch) return false;
    }

    return true;
  });

  state.renderedCount = state.batchSize;
  renderLinesGrid();
}

/**
 * Renderiza o Grid de Cards de Linhas
 */
function renderLinesGrid() {
  const grid = document.getElementById('lines-grid');
  const emptyState = document.getElementById('lines-empty');
  const metaCount = document.getElementById('results-count');
  const loadMoreBtn = document.getElementById('btn-load-more');

  if (!grid) return;

  if (metaCount) {
    metaCount.textContent = `Mostrando ${Math.min(state.renderedCount, state.filteredLines.length)} de ${state.filteredLines.length} linhas`;
  }

  if (state.filteredLines.length === 0) {
    grid.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  const visibleLines = state.filteredLines.slice(0, state.renderedCount);

  grid.innerHTML = visibleLines.map(line => {
    const targetCity = line.cityKey || state.currentCitySlug;
    const detailUrl = `linha.html?cidade=${targetCity}&linha=${encodeURIComponent(line.codigo)}`;
    const badgeBg = line.consortiumColor || 'var(--primary)';
    const badgeColor = getContrastColor(badgeBg);

    return `
      <a href="${detailUrl}" class="line-card" data-city="${targetCity}" data-code="${line.codigo}">
        <div class="line-card-header">
          <span class="line-badge" style="background: ${badgeBg}; color: ${badgeColor};">
            ${line.codigo}
          </span>
          <span class="line-consortium-tag" title="${line.consortiumName}">
            ${line.consortiumName}
          </span>
        </div>

        <div class="line-card-body">
          <div class="line-description" title="${line.description}">
            ${line.description}
          </div>
        </div>

        <div class="line-card-footer">
          <span class="line-fare">${line.price}</span>
          <span class="line-view-action">
            Ver mapa & ao vivo <i class="fa-solid fa-arrow-right"></i>
          </span>
        </div>
      </a>
    `;
  }).join('');

  // Controle do botão Carregar Mais
  if (loadMoreBtn) {
    if (state.renderedCount < state.filteredLines.length) {
      loadMoreBtn.style.display = 'inline-flex';
      loadMoreBtn.textContent = `Carregar mais linhas (+${Math.min(state.batchSize, state.filteredLines.length - state.renderedCount)})`;
    } else {
      loadMoreBtn.style.display = 'none';
    }
  }
}

/**
 * Listeners de Busca e Interações
 */
function setupEventListeners() {
  const searchInput = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear-btn');
  const loadMoreBtn = document.getElementById('btn-load-more');
  const grid = document.getElementById('lines-grid');

  // Grava linha selecionada em sessionStorage ao clicar no card
  if (grid) {
    grid.addEventListener('click', (e) => {
      const card = e.target.closest('.line-card');
      if (card) {
        const city = card.getAttribute('data-city');
        const code = card.getAttribute('data-code');
        if (city && code) {
          sessionStorage.setItem('selected_city', city);
          sessionStorage.setItem('selected_line', code);
        }
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      if (clearBtn) {
        clearBtn.style.display = state.searchQuery ? 'block' : 'none';
      }
      applyFilters();
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (state.filteredLines.length > 0) {
          const top = state.filteredLines[0];
          sessionStorage.setItem('selected_city', state.currentCitySlug);
          sessionStorage.setItem('selected_line', top.codigo);
          window.location.href = `linha.html?cidade=${state.currentCitySlug}&linha=${encodeURIComponent(top.codigo)}`;
        }
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      state.searchQuery = '';
      clearBtn.style.display = 'none';
      applyFilters();
    });
  }

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      state.renderedCount += state.batchSize;
      renderLinesGrid();
    });
  }

  // Escuta voltar/avançar no navegador
  window.addEventListener('popstate', () => {
    initCityFromUrl();
    loadCityLines(state.currentCitySlug);
  });
}

/**
 * Modal de Seleção de Cidades
 */
function setupCityModal() {
  const openBtn = document.getElementById('btn-open-city-modal');
  if (openBtn) {
    openBtn.addEventListener('click', () => regionManager.openModal());
  }
}

function getConsortiumColor(name) {
  if (!state.cityConfig || !state.cityConfig.consortiums) return 'var(--primary)';
  const n = (name || '').toUpperCase();
  for (const [k, v] of Object.entries(state.cityConfig.consortiums)) {
    if (n.includes(k)) return v.color;
  }
  return 'var(--primary)';
}

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
