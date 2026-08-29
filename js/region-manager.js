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
    this.initTheme();
    this.injectHeaderRegionButton();
    this.injectMobileMenu();
    this.createModal();
    this.updateNavigationLinks();
    this.bindGlobalTriggers();
    this.initHomeHeroSearch();
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

    // Se estiver na página de planos operacionais e trocar para uma cidade que não é Rio, redireciona para as linhas
    const isRio = normalized === 'rio' || normalized === 'rio_intermunicipal';
    if (window.location.pathname.includes('planos-operacionais.html') && !isRio) {
      window.location.href = `linhas.html?cidade=${normalized}`;
      return;
    }

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
        <i class="fa-solid fa-chevron-down pill-chevron"></i>
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
   * Injeta o menu hambúrguer e o Drawer lateral para celular
   */
  injectMobileMenu() {
    const headerInner = document.querySelector('.header-inner');
    if (!headerInner) return;

    let menuBtn = document.getElementById('btn-mobile-menu-toggle');
    if (!menuBtn) {
      menuBtn = document.createElement('button');
      menuBtn.id = 'btn-mobile-menu-toggle';
      menuBtn.className = 'btn-mobile-menu';
      menuBtn.type = 'button';
      menuBtn.setAttribute('aria-label', 'Abrir Menu de Navegação');
      menuBtn.innerHTML = `<i class="fa-solid fa-bars"></i>`;
      headerInner.appendChild(menuBtn);
    }

    let drawer = document.getElementById('cobusao-mobile-drawer');
    if (!drawer) {
      drawer = document.createElement('div');
      drawer.id = 'cobusao-mobile-drawer';
      drawer.className = 'mobile-drawer-backdrop';
      drawer.innerHTML = `
        <div class="mobile-drawer-content" role="dialog" aria-modal="true">
          <div class="mobile-drawer-header">
            <a class="brand" href="index.html">
              <img src="app-logo.png" alt="Cadê o Ônibus?" />
              <span>Cadê o Ônibus?</span>
            </a>
            <button type="button" class="btn-drawer-close" id="btn-close-mobile-drawer" aria-label="Fechar Menu">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div class="mobile-drawer-region-card">
            <div class="region-card-left">
              <span class="region-flag-lg" id="drawer-region-flag">🏖️</span>
              <div class="region-text-group">
                <span class="region-label-small">Região Selecionada</span>
                <h4 id="drawer-region-label">Rio de Janeiro (RJ)</h4>
              </div>
            </div>
            <button type="button" class="btn-drawer-switch-region" id="btn-drawer-switch-city">
              Trocar
            </button>
          </div>

          <nav class="mobile-drawer-nav">
            <a href="linhas.html" class="drawer-link" id="drawer-link-linhas">
              <i class="fa-solid fa-bus"></i>
              <span>Linhas de Ônibus</span>
            </a>
            <a href="https://web.cadeoonibus.api.br" target="_blank" class="drawer-link">
              <i class="fa-solid fa-globe"></i>
              <span>Versão Web (App no Navegador)</span>
            </a>
            <a href="planos-operacionais.html" id="drawer-planos-link" class="drawer-link">
              <i class="fa-solid fa-chart-line"></i>
              <span>Planos Operacionais</span>
            </a>

            <div class="drawer-nav-divider"></div>

            <a href="privacidade.html" class="drawer-link sub-link">
              <i class="fa-solid fa-shield-halved"></i>
              <span>Política de Privacidade</span>
            </a>
            <a href="termos-uso.html" class="drawer-link sub-link">
              <i class="fa-solid fa-file-contract"></i>
              <span>Termos de Uso</span>
            </a>
            <a href="suporte.html" class="drawer-link sub-link">
              <i class="fa-solid fa-circle-question"></i>
              <span>Suporte & Ajuda</span>
            </a>
          </nav>

          <div class="mobile-drawer-footer">
            <a class="btn-primary" style="width: 100%; justify-content: center; padding: 12px;" href="https://play.google.com/store/apps/details?id=com.guialshy.cadeoonibus" target="_blank">
              <i class="fa-brands fa-google-play"></i> Baixar App Grátis
            </a>
          </div>
        </div>
      `;
      document.body.appendChild(drawer);

      const closeBtn = drawer.querySelector('#btn-close-mobile-drawer');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.closeMobileDrawer();
        });
      }

      drawer.addEventListener('click', (e) => {
        if (e.target === drawer) {
          this.closeMobileDrawer();
        }
      });

      const switchBtn = drawer.querySelector('#btn-drawer-switch-city');
      if (switchBtn) {
        switchBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.closeMobileDrawer();
          setTimeout(() => this.openModal(), 150);
        });
      }
    }

    menuBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleMobileDrawer();
    });
  }

  toggleMobileDrawer() {
    const drawer = document.getElementById('cobusao-mobile-drawer');
    if (!drawer) return;
    if (drawer.classList.contains('open')) {
      this.closeMobileDrawer();
    } else {
      this.openMobileDrawer();
    }
  }

  openMobileDrawer() {
    const drawer = document.getElementById('cobusao-mobile-drawer');
    if (!drawer) return;
    drawer.classList.add('open');
    document.body.classList.add('mobile-drawer-open');
  }

  closeMobileDrawer() {
    const drawer = document.getElementById('cobusao-mobile-drawer');
    if (!drawer) return;
    drawer.classList.remove('open');
    document.body.classList.remove('mobile-drawer-open');
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

    // Atualiza também drawer mobile
    const drawerFlag = document.getElementById('drawer-region-flag');
    const drawerLabel = document.getElementById('drawer-region-label');
    if (drawerFlag) drawerFlag.textContent = config.flag || '📍';
    if (drawerLabel) drawerLabel.textContent = `${config.name} (${config.state})`;

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
      if (!link.classList.contains('preserve-link-city')) {
        link.href = `linhas.html?cidade=${this.activeCityKey}`;
      }
    });

    // 2. Link para "Planos Operacionais" -> só aparece quando for Rio de Janeiro
    document.querySelectorAll('a[href*="planos-operacionais.html"]').forEach(link => {
      if (isRio) {
        link.style.display = '';
        link.style.visibility = 'visible';
      } else {
        link.style.display = 'none';
        link.style.visibility = 'hidden';
      }
    });

    // 3. Atualiza link do drawer
    const drawerPlanos = document.getElementById('drawer-planos-link');
    if (drawerPlanos) {
      drawerPlanos.style.display = isRio ? 'flex' : 'none';
    }
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

    // Vincula acordeons de FAQ em qualquer página
    document.querySelectorAll('.faq-question').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.faq-item');
        if (item) {
          item.classList.toggle('open');
        }
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
   * Renderiza os cards das 14 regiões unificadas (idêntico ao app Flutter)
   */
  renderCityList() {
    const listContainer = document.getElementById('city-modal-list-container');
    if (!listContainer) return;

    const query = this.searchQuery.toLowerCase().trim();
    const hubs = STATE_HUBS;

    const filtered = hubs.filter(c => {
      // Filtro de Macro-região
      if (this.selectedFilterRegion !== 'Todas' && c.macroRegion !== this.selectedFilterRegion) {
        return false;
      }

      // Filtro de Busca
      if (query) {
        const nameMatch = (c.stateFullName || '').toLowerCase().includes(query);
        const ufMatch = (c.stateUf || '').toLowerCase().includes(query);
        const subtitleMatch = (c.coverageSubtitle || '').toLowerCase().includes(query);
        const keyMatch = (c.key || '').toLowerCase().includes(query);
        return nameMatch || ufMatch || subtitleMatch || keyMatch;
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
              <span class="city-item-title">${c.stateFullName}</span>
              <span class="city-item-badge-uf">${c.stateUf}</span>
              <span class="city-item-badge-macro">${c.macroRegion}</span>
            </div>
            <p class="city-item-subtitle">${c.coverageSubtitle}</p>
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

  /**
   * Inicializa o gerenciador de tema Claro / Escuro
   */
  initTheme() {
    try {
      const saved = localStorage.getItem('cobusao_theme');
      if (saved) {
        document.documentElement.setAttribute('data-theme', saved);
      }
    } catch (e) {}

    this.injectThemeButton();
    this.updateThemeButton();
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const isDark = current === 'dark' || (!current && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const newTheme = isDark ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    try {
      localStorage.setItem('cobusao_theme', newTheme);
    } catch (e) {}

    this.updateThemeButton();

    // Notifica outros scripts (ex: mapa Carto basemaps)
    window.dispatchEvent(new CustomEvent('cobusao-theme-changed', { detail: { theme: newTheme } }));
  }

  injectThemeButton() {
    let themeBtn = document.getElementById('btn-theme-toggle');
    const headerInner = document.querySelector('.header-inner');
    if (!themeBtn && headerInner) {
      themeBtn = document.createElement('button');
      themeBtn.id = 'btn-theme-toggle';
      themeBtn.className = 'header-theme-toggle';
      themeBtn.type = 'button';
      themeBtn.title = 'Alternar modo claro / escuro';
      themeBtn.innerHTML = `<i class="fa-solid fa-moon"></i>`;

      const regionBtn = document.getElementById('btn-header-region-selector');
      if (regionBtn && regionBtn.parentNode) {
        regionBtn.parentNode.insertBefore(themeBtn, regionBtn.nextSibling);
      } else {
        headerInner.appendChild(themeBtn);
      }
    }

    if (themeBtn) {
      themeBtn.onclick = () => this.toggleTheme();
    }
  }

  updateThemeButton() {
    const themeBtn = document.getElementById('btn-theme-toggle');
    if (!themeBtn) return;
    const current = document.documentElement.getAttribute('data-theme');
    const isDark = current === 'dark' || (!current && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    themeBtn.innerHTML = `<i class="fa-solid ${isDark ? 'fa-sun' : 'fa-moon'}"></i>`;
    themeBtn.title = isDark ? 'Alternar para Modo Claro' : 'Alternar para Modo Escuro';
  }

  /**
   * Inicializa o widget de busca rápida na Home
   */
  async initHomeHeroSearch() {
    const input = document.getElementById('hero-search-input');
    const dropdown = document.getElementById('hero-search-dropdown');
    if (!input || !dropdown) return;

    let cityLinesDict = {};

    const loadLinesForActiveCity = async () => {
      try {
        const res = await fetch(`https://cobusao-data.pages.dev/${this.activeCityKey}/line_info.json`);
        if (res.ok) {
          cityLinesDict = await res.json();
        }
      } catch (e) {}
    };

    await loadLinesForActiveCity();
    window.addEventListener('cobusao-region-changed', () => loadLinesForActiveCity());

    input.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        dropdown.style.display = 'none';
        return;
      }

      const matches = Object.entries(cityLinesDict).filter(([code, info]) => {
        return code.toLowerCase().includes(q) || (info.description && info.description.toLowerCase().includes(q));
      }).slice(0, 8);

      if (matches.length === 0) {
        dropdown.innerHTML = `
          <div style="padding: 12px 16px; color: var(--text-muted); font-size: 0.88rem;">
            Nenhuma linha encontrada para "${e.target.value}"
          </div>
        `;
        dropdown.style.display = 'block';
        return;
      }

      dropdown.innerHTML = matches.map(([code, info]) => {
        const desc = info.description || '';
        return `
          <a href="linha.html?cidade=${this.activeCityKey}&linha=${encodeURIComponent(code)}" class="hero-search-item">
            <span class="hero-search-badge">${code}</span>
            <span class="hero-search-desc">${desc}</span>
          </a>
        `;
      }).join('');

      dropdown.style.display = 'block';
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = input.value.toLowerCase().trim();
        const match = Object.entries(cityLinesDict).find(([code, info]) => {
          return code.toLowerCase() === q || code.toLowerCase().includes(q) || (info.description && info.description.toLowerCase().includes(q));
        });
        if (match) {
          window.location.href = `linha.html?cidade=${this.activeCityKey}&linha=${encodeURIComponent(match[0])}`;
        }
      }
    });

    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });
  }
}

// Instância única global
export const regionManager = new RegionManager();
window.CobusaoRegion = regionManager;
