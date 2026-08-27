/**
 * Cadê o Ônibus? — Gerenciador Global de Região & Seletor de Cidades
 * Mantém a região selecionada sincronizada em todas as páginas,
 * renderiza o modal de seleção idêntico ao CityPickerSheet do Flutter
 * e atualiza os links e menus do site dinamicamente.
 */

import {
  CITIES_CONFIG,
  STATE_HUBS,
  getCityConfig,
  normalizeCitySlug
} from './cities-config.js';

const STORAGE_KEY = 'cobusao_active_city';
const DEFAULT_CITY = 'rio';

class RegionManager {
  constructor() {
    this.activeCityKey = this.loadActiveCity();
    this.modalEl = null;
    this.selectedFilterRegion = 'Todas';
    this.searchQuery = '';
    
    // Inicializa quando o DOM estiver pronto
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  loadActiveCity() {
    // 1. Checa se há parâmetro na URL (?cidade=sp)
    const urlParams = new URLSearchParams(window.location.search);
    const cityParam = urlParams.get('cidade') || urlParams.get('c');
    if (cityParam) {
      const normalized = normalizeCitySlug(cityParam);
      localStorage.setItem(STORAGE_KEY, normalized);
      return normalized;
    }

    // 2. Checa o localStorage
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && CITIES_CONFIG[saved]) {
        return saved;
      }
    } catch (e) {
      console.warn('[RegionManager] Não foi possível ler o localStorage:', e);
    }

    return DEFAULT_CITY;
  }

  getActiveCity() {
    return this.activeCityKey;
  }

  getActiveConfig() {
    return getCityConfig(this.activeCityKey);
  }

  init() {
    this.injectHeaderRegionButton();
    this.createModal();
    this.updateNavigationLinks();
    this.bindGlobalTriggers();
  }

  /**
   * Atualiza a cidade ativa, salva no localStorage e notifica a aplicação
   */
  setCity(cityKey, options = { triggerNavigation: false }) {
    const normalized = normalizeCitySlug(cityKey);
    this.activeCityKey = normalized;

    try {
      localStorage.setItem(STORAGE_KEY, normalized);
    } catch (e) {
      console.warn('[RegionManager] Erro ao salvar no localStorage:', e);
    }

    this.updateHeaderButton();
    this.updateNavigationLinks();
    this.closeModal();

    // Dispara evento customizado para outros scripts ouvirem
    const event = new CustomEvent('cobusao-region-changed', {
      detail: {
        cityKey: normalized,
        config: getCityConfig(normalized)
      }
    });
    window.dispatchEvent(event);

    // Se estiver na página de linhas e tiver a função de reload, recarrega
    if (window.location.pathname.includes('linhas.html')) {
      if (options.triggerNavigation || !window.cobusaoReloadCityLines) {
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set('cidade', normalized);
        window.location.href = currentUrl.toString();
      }
    }
  }

  /**
   * Injeta o botão de região no Header caso não exista
   */
  injectHeaderRegionButton() {
    const nav = document.querySelector('.site-nav');
    const headerInner = document.querySelector('.header-inner');
    if (!headerInner) return;

    let regionBtn = document.getElementById('btn-header-region-selector');
    if (!regionBtn) {
      regionBtn = document.createElement('button');
      regionBtn.id = 'btn-header-region-selector';
      regionBtn.className = 'header-region-pill';
      regionBtn.type = 'button';
      regionBtn.title = 'Trocar região / cidade';
      regionBtn.innerHTML = `
        <span class="pill-dot"></span>
        <span class="pill-flag" id="header-region-flag">🏖️</span>
        <span class="pill-text" id="header-region-label">Rio de Janeiro</span>
        <svg class="pill-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
      `;

      // Insere antes da navegação
      if (nav) {
        headerInner.insertBefore(regionBtn, nav);
      } else {
        headerInner.appendChild(regionBtn);
      }
    }

    regionBtn.onclick = () => this.openModal();
    this.updateHeaderButton();
  }

  /**
   * Atualiza a label e ícone do botão de região do cabeçalho
   */
  updateHeaderButton() {
    const config = this.getActiveConfig();
    const flagEl = document.getElementById('header-region-flag');
    const labelEl = document.getElementById('header-region-label');

    if (flagEl) flagEl.textContent = config.flag || '📍';
    if (labelEl) labelEl.textContent = `${config.name} (${config.state})`;

    // Atualiza também seletor na página inicial se existir
    const homeCurrentCity = document.getElementById('home-current-city-name');
    if (homeCurrentCity) {
      homeCurrentCity.textContent = `${config.flag || '📍'} ${config.name} (${config.state})`;
    }
  }

  /**
   * Atualiza os links do menu do site com base na região ativa
   */
  updateNavigationLinks() {
    const isRio = this.activeCityKey === 'rio' || this.activeCityKey === 'rio_intermunicipal';

    // 1. Link para "Linhas de Ônibus" -> sempre leva para a cidade ativa
    document.querySelectorAll('a[href*="linhas.html"]').forEach(link => {
      // Se não for um link com cidade explícita pré-definida em um card de outra cidade
      if (!link.classList.contains('preserve-link-city')) {
        link.href = `linhas.html?cidade=${this.activeCityKey}`;
      }
    });

    // 2. Link para "Planos Operacionais (Rio)"
    document.querySelectorAll('a[href*="planos-operacionais.html"]').forEach(link => {
      if (isRio) {
        link.style.display = '';
        link.classList.remove('nav-link-disabled');
        link.removeAttribute('title');
      } else {
        // Se estiver em outra cidade, mantemos acessível com um aviso ou badge sutil
        link.style.display = '';
        link.setAttribute('title', 'Exclusivo para o sistema SPPO do Rio de Janeiro');
      }
    });
  }

  /**
   * Vincula gatilhos adicionais que possam existir na página (ex: botões de trocar região)
   */
  bindGlobalTriggers() {
    document.querySelectorAll('[data-open-region-modal]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.openModal();
      });
    });
  }

  /**
   * Cria o modal de seleção de cidades (estilo Flutter CityPickerSheet)
   */
  createModal() {
    if (document.getElementById('cobusao-city-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'cobusao-city-modal';
    modal.className = 'city-modal-backdrop';
    modal.style.display = 'none';

    modal.innerHTML = `
      <div class="city-modal-card" role="dialog" aria-modal="true">
        <!-- Drag Handle decorativo -->
        <div class="city-modal-handle"></div>

        <!-- Header -->
        <div class="city-modal-header">
          <div class="city-modal-icon-badge">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon>
              <line x1="8" y1="2" x2="8" y2="18"></line>
              <line x1="16" y1="6" x2="16" y2="22"></line>
            </svg>
          </div>
          <div class="city-modal-title-wrap">
            <h2>Selecione sua Região</h2>
            <p>Escolha o estado ou região atendida</p>
          </div>
          <button class="city-modal-close" type="button" id="city-modal-close-btn" aria-label="Fechar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <!-- Campo de Busca -->
        <div class="city-modal-search-row">
          <div class="city-search-box">
            <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input type="text" id="city-search-input" placeholder="Buscar estado, cidade ou região (ex: RJ, Baixada, SP)..." autocomplete="off" />
            <button type="button" class="clear-search-btn" id="city-search-clear" style="display:none;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>

        <!-- Chips de Macro-Região -->
        <div class="city-modal-regions-bar">
          <button type="button" class="region-chip active" data-region="Todas">Todas</button>
          <button type="button" class="region-chip" data-region="Sudeste">Sudeste</button>
          <button type="button" class="region-chip" data-region="Sul">Sul</button>
          <button type="button" class="region-chip" data-region="Nordeste">Nordeste</button>
          <button type="button" class="region-chip" data-region="Centro-Oeste">Centro-Oeste</button>
          <button type="button" class="region-chip" data-region="Norte">Norte</button>
        </div>

        <!-- Lista de Cidades / Estados -->
        <div class="city-modal-list" id="city-modal-list-container">
          <!-- Renderizado dinamicamente -->
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.modalEl = modal;

    // Listeners do modal
    const closeBtn = modal.querySelector('#city-modal-close-btn');
    closeBtn.addEventListener('click', () => this.closeModal());

    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modalEl && this.modalEl.style.display !== 'none') {
        this.closeModal();
      }
    });

    const searchInput = modal.querySelector('#city-search-input');
    const searchClear = modal.querySelector('#city-search-clear');

    searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      searchClear.style.display = this.searchQuery ? 'flex' : 'none';
      this.renderCityList();
    });

    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      this.searchQuery = '';
      searchClear.style.display = 'none';
      searchInput.focus();
      this.renderCityList();
    });

    modal.querySelectorAll('.region-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        modal.querySelectorAll('.region-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.selectedFilterRegion = chip.getAttribute('data-region');
        this.renderCityList();
      });
    });
  }

  /**
   * Renderiza os cards das cidades respeitando o filtro e a pesquisa
   */
  renderCityList() {
    const listContainer = document.getElementById('city-modal-list-container');
    if (!listContainer) return;

    const query = this.searchQuery.toLowerCase().trim();
    const allCities = Object.values(CITIES_CONFIG);

    const filtered = allCities.filter(c => {
      // Filtro de Macro-região
      if (this.selectedFilterRegion !== 'Todas' && c.macroRegion !== this.selectedFilterRegion) {
        return false;
      }

      // Filtro de Busca
      if (query) {
        const nameMatch = (c.name || '').toLowerCase().includes(query);
        const stateMatch = (c.stateFullName || '').toLowerCase().includes(query);
        const ufMatch = (c.state || '').toLowerCase().includes(query);
        const subtitleMatch = (c.coverageSubtitle || '').toLowerCase().includes(query);
        const aliasMatch = (c.aliases || []).some(a => a.toLowerCase().includes(query));
        return nameMatch || stateMatch || ufMatch || subtitleMatch || aliasMatch;
      }

      return true;
    });

    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div class="city-empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
          <p>Nenhuma região encontrada para "<strong>${this.searchQuery}</strong>"</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = filtered.map(c => {
      const isCurrent = c.key === this.activeCityKey;

      return `
        <div class="city-item-card ${isCurrent ? 'active' : ''}" data-city-key="${c.key}">
          <div class="city-item-flag">
            ${c.flag || '🚌'}
          </div>
          <div class="city-item-content">
            <div class="city-item-header">
              <span class="city-item-title">${c.stateFullName || c.name}</span>
              <span class="city-item-badge-uf">${c.state}</span>
              <span class="city-item-badge-macro">${c.macroRegion}</span>
            </div>
            <p class="city-item-subtitle">${c.coverageSubtitle || c.name}</p>
          </div>
          <div class="city-item-action">
            ${isCurrent ? `
              <div class="city-item-check" title="Região Selecionada">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
            ` : `
              <svg class="city-item-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
            `}
          </div>
        </div>
      `;
    }).join('');

    // Adiciona listener de clique em cada card
    listContainer.querySelectorAll('.city-item-card').forEach(card => {
      card.addEventListener('click', () => {
        const key = card.getAttribute('data-city-key');
        this.setCity(key, { triggerNavigation: true });
      });
    });
  }

  openModal() {
    this.createModal();
    this.renderCityList();
    if (this.modalEl) {
      this.modalEl.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      const input = this.modalEl.querySelector('#city-search-input');
      if (input) {
        setTimeout(() => input.focus(), 80);
      }
    }
  }

  closeModal() {
    if (this.modalEl) {
      this.modalEl.style.display = 'none';
      document.body.style.overflow = '';
    }
  }
}

// Instância única global
export const regionManager = new RegionManager();
window.CobusaoRegion = regionManager;
