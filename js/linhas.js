/**
 * Cadê o Ônibus? — Catálogo de Linhas de Ônibus por Cidade
 * Lógica client-side para busca instantânea, filtros por consórcio e paginação fluida.
 */

import {
  CITIES_CONFIG,
  CDN_BASE_URL,
  getCityConfig,
  normalizeCitySlug,
  getAllCities,
  getCitiesGrouped
} from './cities-config.js';

// Estado da Página
const state = {
  currentCitySlug: 'rio',
  cityConfig: null,
  rawLinesData: {},
  linesList: [],
  filteredLines: [],
  activeConsortium: 'ALL',
  searchQuery: '',
  sortBy: 'code_asc',
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

/**
 * Lê a cidade da query string (?cidade=sp ou ?cidade=rio)
 */
function initCityFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const cityParam = params.get('cidade') || params.get('c') || 'rio';
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
    heroDesc.textContent = `Consulte o trajeto, paradas, tabela de horários e rastreamento em tempo real dos ônibus de ${city.fullName}.`;
  }

  const currentCityBtnText = document.getElementById('current-city-name');
  if (currentCityBtnText) {
    currentCityBtnText.textContent = `${city.flag || '🚌'} ${city.name} (${city.state})`;
  }

  renderQuickCityPills();
}

/**
 * Renderiza atalhos rápidos das capitais mais populares
 */
function renderQuickCityPills() {
  const container = document.getElementById('city-quick-pills');
  if (!container) return;

  const popular = ['rio', 'sp', 'bh', 'curitiba', 'brasilia', 'porto_alegre', 'rio_intermunicipal', 'emtu'];
  
  container.innerHTML = popular.map(key => {
    const c = CITIES_CONFIG[key];
    if (!c) return '';
    const isActive = c.key === state.currentCitySlug;
    return `
      <a href="linhas.html?cidade=${c.key}" class="city-pill ${isActive ? 'active' : ''}" data-city="${c.key}">
        ${c.name}
      </a>
    `;
  }).join('');

  // Intercepta cliques nos pills para navegação sem reload completo
  container.querySelectorAll('.city-pill').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const city = btn.getAttribute('data-city');
      if (city && city !== state.currentCitySlug) {
        switchCity(city);
      }
    });
  });
}

/**
 * Troca de cidade dinamicamente sem recarregar a página
 */
export function switchCity(newSlug) {
  const norm = normalizeCitySlug(newSlug);
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
 * Carrega o arquivo `line_info.json` da cidade
 */
async function loadCityLines(citySlug) {
  const grid = document.getElementById('lines-grid');
  const emptyState = document.getElementById('lines-empty');
  const countBadge = document.getElementById('total-lines-badge');
  const metaCount = document.getElementById('results-count');

  if (grid) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
        <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 2rem; color: var(--primary); margin-bottom: 12px;"></i>
        <p>Carregando linhas de <strong>${state.cityConfig.name}</strong>...</p>
      </div>
    `;
  }

  try {
    const res = await fetch(`${CDN_BASE_URL}/${citySlug}/line_info.json`);
    if (!res.ok) throw new Error(`Não foi possível carregar as linhas (${res.status})`);

    const data = await res.json();
    state.rawLinesData = data;

    // Normaliza para array com código
    state.linesList = Object.entries(data).map(([codigo, info]) => {
      const consortiumName = info.consortiumName || info.operatorCompany || 'Municipal';
      const cleanDesc = info.description || info.agencyName || 'Itinerário não informado';
      const color = info.consortiumColor || getConsortiumColor(consortiumName);
      const textColor = info.textColor || '#ffffff';
      const price = info.price ? `R$ ${parseFloat(info.price).toFixed(2).replace('.', ',')}` : state.cityConfig.fare;

      return {
        codigo: String(codigo),
        description: cleanDesc,
        consortiumName: consortiumName,
        consortiumColor: color,
        textColor: textColor,
        price: price
      };
    });

    // Ordenação inicial natural (ex: 006, 007, 10, 100, 472, LECD133, SVB685)
    sortLinesList();
    state.filteredLines = [...state.linesList];

    if (countBadge) {
      countBadge.textContent = `${state.linesList.length} linhas cadastradas`;
    }

    renderConsortiumFilterPills();
    applyFilters();

  } catch (err) {
    console.error('Erro ao carregar linhas:', err);
    if (grid) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: var(--line-card-bg); border-radius: 16px; border: 1px solid var(--surface-border);">
          <div style="font-size: 2.5rem; margin-bottom: 12px;">⚠️</div>
          <h3 style="font-size: 1.3rem; margin-bottom: 8px;">Dados temporariamente indisponíveis</h3>
          <p style="color: var(--text-muted); max-width: 500px; margin: 0 auto 16px;">
            Não conseguimos carregar a lista de linhas de ${state.cityConfig.name}. Tente novamente em instantes.
          </p>
          <button class="btn-primary" onclick="window.location.reload()">
            <i class="fa-solid fa-rotate-right"></i> Tentar Novamente
          </button>
        </div>
      `;
    }
  }
}

/**
 * Ordena a lista de linhas
 */
function sortLinesList() {
  state.linesList.sort((a, b) => {
    return a.codigo.localeCompare(b.codigo, undefined, { numeric: true, sensitivity: 'base' });
  });
}

/**
 * Extrai consórcios únicos e cria pills de filtro
 */
function renderConsortiumFilterPills() {
  const container = document.getElementById('consortium-pills');
  if (!container) return;

  const counts = { ALL: state.linesList.length };
  state.linesList.forEach(line => {
    const c = line.consortiumName || 'Outros';
    counts[c] = (counts[c] || 0) + 1;
  });

  const consortiums = Object.keys(counts).filter(c => c !== 'ALL');
  // Ordena por quantidade de linhas
  consortiums.sort((a, b) => counts[b] - counts[a]);

  let html = `
    <button class="consortium-pill ${state.activeConsortium === 'ALL' ? 'active' : ''}" data-consortium="ALL">
      Todos <span class="badge-count">${counts.ALL}</span>
    </button>
  `;

  html += consortiums.map(c => {
    const isActive = state.activeConsortium === c;
    return `
      <button class="consortium-pill ${isActive ? 'active' : ''}" data-consortium="${c}">
        ${c} <span class="badge-count">${counts[c]}</span>
      </button>
    `;
  }).join('');

  container.innerHTML = html;

  container.querySelectorAll('.consortium-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeConsortium = btn.getAttribute('data-consortium') || 'ALL';
      container.querySelectorAll('.consortium-pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      applyFilters();
    });
  });
}

/**
 * Aplica os filtros de busca e consórcio
 */
function applyFilters() {
  const q = state.searchQuery.toLowerCase().trim();

  state.filteredLines = state.linesList.filter(line => {
    // Filtro por consórcio
    if (state.activeConsortium !== 'ALL' && line.consortiumName !== state.activeConsortium) {
      return false;
    }

    // Filtro por termo de busca (número da linha ou itinerário)
    if (q) {
      const codeMatch = line.codigo.toLowerCase().includes(q);
      const descMatch = line.description.toLowerCase().includes(q);
      const consortiumMatch = line.consortiumName.toLowerCase().includes(q);
      return codeMatch || descMatch || consortiumMatch;
    }

    return true;
  });

  // Reseta contador para paginação
  state.renderedCount = state.batchSize;
  renderLinesGrid();
}

/**
 * Renderiza os cards das linhas no grid
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
    const detailUrl = `linha.html?cidade=${state.currentCitySlug}&linha=${encodeURIComponent(line.codigo)}`;
    const badgeBg = line.consortiumColor || 'var(--primary)';
    const badgeColor = getContrastColor(badgeBg);

    return `
      <a href="${detailUrl}" class="line-card">
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
  const modal = document.getElementById('city-modal');
  const closeBtn = document.getElementById('btn-close-city-modal');
  const searchInput = document.getElementById('modal-city-search');
  const container = document.getElementById('city-modal-groups');

  if (openBtn) {
    openBtn.addEventListener('click', openCityModal);
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', closeCityModal);
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeCityModal();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderCityModalList(e.target.value);
    });
  }

  renderCityModalList('');
}

function openCityModal() {
  const modal = document.getElementById('city-modal');
  const searchInput = document.getElementById('modal-city-search');
  if (modal) {
    modal.classList.add('open');
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
      renderCityModalList('');
    }
  }
}

function closeCityModal() {
  const modal = document.getElementById('city-modal');
  if (modal) modal.classList.remove('open');
}

function renderCityModalList(query) {
  const container = document.getElementById('city-modal-groups');
  if (!container) return;

  const q = (query || '').toLowerCase().trim();
  const grouped = getCitiesGrouped();

  let html = '';

  for (const [key, group] of Object.entries(grouped)) {
    const matchingItems = group.items.filter(c => {
      if (!q) return true;
      return c.name.toLowerCase().includes(q) ||
             c.state.toLowerCase().includes(q) ||
             c.fullName.toLowerCase().includes(q);
    });

    if (matchingItems.length > 0) {
      html += `<div class="city-group-title">${group.title}</div>`;
      html += '<div class="city-modal-grid">';
      html += matchingItems.map(c => `
        <a href="linhas.html?cidade=${c.key}" class="city-modal-item" data-city="${c.key}">
          <span>${c.flag || '📍'}</span>
          <span>${c.name}</span>
          <span class="uf-tag">${c.state}</span>
        </a>
      `).join('');
      html += '</div>';
    }
  }

  if (!html) {
    html = `
      <div style="text-align:center; padding: 30px; color: var(--text-muted);">
        Nenhuma cidade encontrada para "<strong>${query}</strong>".
      </div>
    `;
  }

  container.innerHTML = html;

  container.querySelectorAll('.city-modal-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const city = item.getAttribute('data-city');
      if (city) switchCity(city);
    });
  });
}

/**
 * Utilitário: Cor do Consórcio padrão
 */
function getConsortiumColor(name) {
  const lower = (name || '').toLowerCase();
  if (lower.includes('intersul') || lower.includes('amarelo')) return '#f59e0b';
  if (lower.includes('internorte') || lower.includes('verde')) return '#10b981';
  if (lower.includes('transcarioca') || lower.includes('azul')) return '#3b82f6';
  if (lower.includes('santa cruz') || lower.includes('vermelho')) return '#ef4444';
  if (lower.includes('mobi') || lower.includes('brt')) return '#8b5cf6';
  if (lower.includes('noroeste')) return '#509E2F';
  if (lower.includes('leste')) return '#D0021B';
  return '#2563eb';
}

/**
 * Utilitário: Garante alto contraste de texto (preto ou branco) para badges
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
