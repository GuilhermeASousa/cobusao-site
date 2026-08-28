/**
 * Cadê o Ônibus? — Observatório de Planos Operacionais SMTR-Rio
 * Lógica 100% Client-Side para visualização, filtros, gráficos e comparador de períodos.
 */

// Estado Global do Observatório
const state = {
  summary: null,
  timeline: [],
  lines: [],
  filteredLines: [],
  datesCatalog: [],
  linesDetailMap: {},
  charts: {},
  currentModalLine: null,
  activeFilterConsortium: "ALL",
  activeFilterStatus: "ALL",
  currentDiffData: null,
  currentDiffFilter: "ALL",
  diffSortBy: "diff_desc",
  diffSearchQuery: "",
  modalTimelineOrder: "desc"
};

// Inicialização
document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  setupEventListeners();
  loadObservatorioData();
});

/* ==========================================================================
   1. Navegação por Abas
   ========================================================================== */
function setupTabs() {
  const tabs = document.querySelectorAll(".obs-tab-btn");
  tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      btn.classList.add("active");

      const targetId = `pane-${btn.getAttribute("data-tab")}`;
      document.querySelectorAll(".obs-pane").forEach(pane => pane.classList.remove("active"));

      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add("active");
    });
  });
}

/* ==========================================================================
   2. Carregamento de Dados dos JSONs Estáticos
   ========================================================================== */
async function loadObservatorioData() {
  try {
    // 1. Resumo Geral e KPIs
    const resSummary = await fetch("planos-data/dashboard_summary.json");
    if (resSummary.ok) {
      state.summary = await resSummary.json();
      renderOverviewKPIs(state.summary);
      renderHighlights(state.summary);
      renderExtinctionsList(state.summary.extinct_lines || []);
    }

    // 2. Linha do Tempo Agregada
    const resTimeline = await fetch("planos-data/timeline_stats.json");
    if (resTimeline.ok) {
      state.timeline = await resTimeline.json();
      renderTimelineChart(state.timeline);
      renderConsortiumChart(state.timeline);
    }

    // 3. Catálogo de Datas
    const resDates = await fetch("planos-data/dates_catalog.json");
    if (resDates.ok) {
      state.datesCatalog = await resDates.json();
      populateDiffDropdowns(state.datesCatalog);
      renderPlansCatalog(state.datesCatalog);
      
      const badgeEl = document.getElementById("obs-plans-badge");
      if (badgeEl) badgeEl.textContent = `${state.datesCatalog.length} Planos Operacionais Oficiais`;
    }

    // 4. Lista de Linhas
    const resLines = await fetch("planos-data/lines_summary.json");
    if (resLines.ok) {
      state.lines = await resLines.json();
      state.filteredLines = state.lines;
      renderLinesGrid(state.filteredLines);
    }

    // 5. Detalhes completos das linhas (em segundo plano para modal e diff instantâneo)
    fetch("planos-data/lines_detail.json")
      .then(res => res.ok ? res.json() : {})
      .then(data => {
        state.linesDetailMap = data;
        // Executa diff inicial se o comparador estiver aberto
        runClientDiff();
      })
      .catch(err => console.warn("Detalhes completos carregados sob demanda:", err));

  } catch (err) {
    console.error("Erro ao carregar dados do observatório:", err);
  }
}

/* ==========================================================================
   3. Renderização da Visão Geral (Overview)
   ========================================================================== */
function renderOverviewKPIs(data) {
  if (!data || !data.kpis) return;
  const k = data.kpis;

  setText("kpi-total-lines", k.total_lines_tracked || "-");
  setText("kpi-active-lines", k.active_lines || "-");
  setText("kpi-extinct-lines", k.extinct_lines || "-");
  setText("kpi-increased-lines", k.increased_lines || "-");
  setText("kpi-decreased-lines", k.decreased_lines || "-");
}

function renderHighlights(data) {
  if (!data) return;

  const renderList = (elementId, list, isPositive) => {
    const el = document.getElementById(elementId);
    if (!el || !list) return;

    el.innerHTML = list.slice(0, 6).map(item => {
      const pct = item.trip_change_pct;
      const pctStr = pct > 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;
      const badgeClass = isPositive ? "badge-status-gain" : "badge-status-loss";

      return `
        <div class="highlight-item" onclick="openLineModal('${item.line_code}')">
          <div>
            <span class="line-badge">${escapeHTML(item.display_code || item.line_code)}</span>
            <div class="line-sub">${escapeHTML(item.latest_name || "-")}</div>
          </div>
          <span class="badge ${badgeClass}">${pctStr}</span>
        </div>
      `;
    }).join("");
  };

  renderList("list-gainers", data.top_gainers, true);
  renderList("list-losers", data.top_losers, false);
}

/* ==========================================================================
   4. Gráficos Chart.js
   ========================================================================== */
function renderTimelineChart(timeline) {
  const ctx = document.getElementById("chart-timeline");
  if (!ctx || !timeline || timeline.length === 0) return;

  const labels = timeline.map(t => formatDateBR(t.date));
  const tripsDU = timeline.map(t => t.total_trips_du);
  const activeLines = timeline.map(t => t.total_lines);

  if (state.charts.timeline) state.charts.timeline.destroy();

  state.charts.timeline = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Total de Viagens/Dia Útil",
          data: tripsDU,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.12)",
          fill: true,
          tension: 0.35,
          yAxisID: "y"
        },
        {
          label: "Linhas em Operação",
          data: activeLines,
          borderColor: "#10b981",
          borderDash: [4, 4],
          tension: 0.35,
          yAxisID: "y1"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top", labels: { usePointStyle: true } }
      },
      scales: {
        y: {
          type: "linear",
          position: "left",
          title: { display: true, text: "Viagens Diárias" }
        },
        y1: {
          type: "linear",
          position: "right",
          grid: { drawOnChartArea: false },
          title: { display: true, text: "Qtd. Linhas" }
        }
      }
    }
  });
}

function renderConsortiumChart(timeline) {
  const ctx = document.getElementById("chart-consortium");
  if (!ctx || !timeline || timeline.length === 0) return;

  const latest = timeline[timeline.length - 1];
  if (!latest || !latest.consortia) return;

  const labels = Object.keys(latest.consortia);
  const data = labels.map(c => {
    const item = latest.consortia[c];
    if (typeof item === "object") {
      return item.trips_du || item.lines || 0;
    }
    return item || 0;
  });

  const colors = labels.map(c => {
    const s = c.toLowerCase();
    if (s.includes("intersul")) return "#3b82f6";
    if (s.includes("internorte")) return "#10b981";
    if (s.includes("transcarioca")) return "#f59e0b";
    if (s.includes("santa cruz")) return "#ef4444";
    return "#8b5cf6";
  });

  if (state.charts.consortium) state.charts.consortium.destroy();

  state.charts.consortium = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: "transparent"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 12, usePointStyle: true } }
      }
    }
  });
}

/* ==========================================================================
   5. Grid de Linhas e Filtros
   ========================================================================== */
function setupEventListeners() {
  // Busca em tempo real na aba de Linhas
  const searchInput = document.getElementById("line-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      applyLineFilters();
    });
  }

  // Filtros de Consórcio
  document.querySelectorAll("[data-filter-cons]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-filter-cons]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.activeFilterConsortium = btn.getAttribute("data-filter-cons");
      applyLineFilters();
    });
  });

  // Filtros de Status
  document.querySelectorAll("[data-filter-status]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-filter-status]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.activeFilterStatus = btn.getAttribute("data-filter-status");
      applyLineFilters();
    });
  });

  // Botão Comparar
  const btnCompare = document.getElementById("btn-run-diff");
  if (btnCompare) {
    btnCompare.addEventListener("click", () => {
      runClientDiff();
    });
  }

  // Filtros do Comparador (Pills)
  document.querySelectorAll("[data-diff-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-diff-filter]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.currentDiffFilter = btn.getAttribute("data-diff-filter");
      renderDiffTableResults();
    });
  });

  // Campo de busca dentro do comparador
  const diffSearchInput = document.getElementById("diff-search-input");
  if (diffSearchInput) {
    diffSearchInput.addEventListener("input", (e) => {
      state.diffSearchQuery = (e.target.value || "").trim().toLowerCase();
      renderDiffTableResults();
    });
  }

  // Select "Ordenar por:" do comparador
  const diffSortSelect = document.getElementById("diff-sort-select");
  if (diffSortSelect) {
    diffSortSelect.addEventListener("change", (e) => {
      state.diffSortBy = e.target.value;
      renderDiffTableResults();
    });
  }

  // Clique nos cabeçalhos da tabela do comparador para ordenar interativamente
  document.querySelectorAll("#pane-comparador .sortable-th").forEach(th => {
    th.addEventListener("click", () => {
      const sortKey = th.getAttribute("data-sort-key");
      toggleDiffSortKey(sortKey);
    });
  });

  // Botão de inverter ordem no histórico do modal
  const btnToggleOrder = document.getElementById("btn-toggle-modal-order");
  if (btnToggleOrder) {
    btnToggleOrder.addEventListener("click", () => {
      state.modalTimelineOrder = state.modalTimelineOrder === "desc" ? "asc" : "desc";
      const label = document.getElementById("modal-order-label");
      if (label) {
        label.textContent = state.modalTimelineOrder === "desc" ? "Mais Recentes Primeiro" : "Mais Antigos Primeiro";
      }
      if (state.currentModalLine) {
        renderModalHistoryTable(state.currentModalLine.timeline || []);
      }
    });
  }

  // Fechar Modal
  const modalClose = document.getElementById("obs-modal-close-btn");
  const modalBackdrop = document.getElementById("obs-line-modal");
  if (modalClose) modalClose.addEventListener("click", closeLineModal);
  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", (e) => {
      if (e.target === modalBackdrop) closeLineModal();
    });
  }
}

function toggleDiffSortKey(key) {
  const current = state.diffSortBy;
  let next = "diff_desc";

  if (key === "code") {
    next = current === "line_asc" ? "line_desc" : "line_asc";
  } else if (key === "name") {
    next = current === "name_asc" ? "name_desc" : "name_asc";
  } else if (key === "consortium") {
    next = current === "consortium_asc" ? "consortium_desc" : "consortium_asc";
  } else if (key === "trips1") {
    next = current === "trips1_desc" ? "trips1_asc" : "trips1_desc";
  } else if (key === "trips2") {
    next = current === "trips2_desc" ? "trips2_asc" : "trips2_desc";
  } else if (key === "delta") {
    next = current === "diff_desc" ? "diff_asc" : (current === "diff_asc" ? "pct_desc" : "diff_desc");
  }

  state.diffSortBy = next;
  const select = document.getElementById("diff-sort-select");
  if (select) select.value = next;

  renderDiffTableResults();
}

function applyLineFilters() {
  const query = (document.getElementById("line-search-input")?.value || "").trim().toLowerCase();
  const queryClean = query.replace(/\s+/g, "");

  state.filteredLines = state.lines.filter(line => {
    // 1. Busca por código, alias ou nome
    if (query) {
      const codeNorm = (line.normalized_code || line.line_code || "").toLowerCase().replace(/\s+/g, "");
      const displayNorm = (line.display_code || "").toLowerCase().replace(/\s+/g, "");
      const nameNorm = (line.latest_name || "").toLowerCase();
      const aliasesStr = (line.aliases || []).join(" ").toLowerCase().replace(/\s+/g, "");

      const matchesSearch = codeNorm.includes(queryClean) ||
                            displayNorm.includes(queryClean) ||
                            aliasesStr.includes(queryClean) ||
                            nameNorm.includes(query);

      if (!matchesSearch) return false;
    }

    // 2. Filtro de Consórcio
    if (state.activeFilterConsortium !== "ALL") {
      const cons = (line.latest_consortium || "").toUpperCase();
      if (!cons.includes(state.activeFilterConsortium)) return false;
    }

    // 3. Filtro de Status
    if (state.activeFilterStatus === "ACTIVE" && line.is_active !== 1) return false;
    if (state.activeFilterStatus === "EXTINCT" && line.is_active !== 0) return false;
    if (state.activeFilterStatus === "INCREASED" && line.trip_change_pct <= 0) return false;
    if (state.activeFilterStatus === "DECREASED" && line.trip_change_pct >= 0) return false;

    return true;
  });

  renderLinesGrid(state.filteredLines);
}

function renderLinesGrid(lines) {
  const grid = document.getElementById("obs-lines-grid");
  const countEl = document.getElementById("lines-results-count");
  if (countEl) countEl.textContent = `${lines.length} linhas encontradas`;
  if (!grid) return;

  if (lines.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Nenhuma linha encontrada para estes filtros.</div>`;
    return;
  }

  grid.innerHTML = lines.slice(0, 120).map(l => {
    const consClass = getConsortiumClass(l.latest_consortium);
    const statusBadge = l.is_active === 1
      ? `<span class="badge badge-status-active">Ativa</span>`
      : `<span class="badge badge-status-extinct">Extinta</span>`;

    let depSub = "";
    if (l.latest_dep_circ_du > 0) {
      depSub = `<span style="font-size:0.72rem; color:var(--text-muted); display:block;">(${l.latest_dep_circ_du} circ.)</span>`;
    } else if (l.latest_dep_ida_du > 0 || l.latest_dep_volta_du > 0) {
      depSub = `<span style="font-size:0.72rem; color:var(--text-muted); display:block;">(${l.latest_dep_ida_du}i / ${l.latest_dep_volta_du}v)</span>`;
    }

    return `
      <div class="line-card" onclick="openLineModal('${l.line_code}')">
        <div class="line-card-header">
          <span class="line-num">${escapeHTML(l.display_code || l.line_code)}</span>
          ${statusBadge}
        </div>
        <div class="line-card-name">${escapeHTML(l.latest_name || "Itinerário não especificado")}</div>
        <div class="line-card-meta">
          <span class="badge ${consClass}">${escapeHTML(l.latest_consortium || "Consórcio -")}</span>
          <div>
            <span class="line-stat-val">${l.latest_trips_weekday || 0}</span> viagens/dia
            ${depSub}
          </div>
        </div>
      </div>
    `;
  }).join("");
}

/* ==========================================================================
   6. Comparador de Períodos (100% Client-Side)
   ========================================================================== */
function populateDiffDropdowns(catalog) {
  const sel1 = document.getElementById("diff-select-1");
  const sel2 = document.getElementById("diff-select-2");
  if (!sel1 || !sel2 || catalog.length < 2) return;

  const options = catalog.map(p => `<option value="${p.date}">${formatDateBR(p.date)} — ${p.title || p.plan_id}</option>`).join("");
  sel1.innerHTML = options;
  sel2.innerHTML = options;

  sel1.selectedIndex = 0;
  sel2.selectedIndex = catalog.length - 1;
}

async function runClientDiff() {
  const d1 = document.getElementById("diff-select-1")?.value;
  const d2 = document.getElementById("diff-select-2")?.value;
  if (!d1 || !d2) return;

  // Garante que os detalhes estão carregados
  if (Object.keys(state.linesDetailMap).length === 0) {
    try {
      const res = await fetch("planos-data/lines_detail.json");
      if (res.ok) state.linesDetailMap = await res.json();
    } catch (e) {
      console.error("Falha ao carregar dados detalhados para o diff:", e);
      return;
    }
  }

  const added = [];
  const removed = [];
  const increased = [];
  const decreased = [];
  const unchanged = [];
  const seenCanonicalKeys = new Set();

  for (const [code, details] of Object.entries(state.linesDetailMap)) {
    const canonicalKey = details.line_code || details.normalized_code || code;
    if (seenCanonicalKeys.has(canonicalKey)) continue;
    seenCanonicalKeys.add(canonicalKey);

    const timeline = details.timeline || [];
    const entry1 = timeline.find(t => t.date === d1);
    const entry2 = timeline.find(t => t.date === d2);

    if (!entry1 && entry2) {
      added.push({
        code,
        display_code: details.display_code || code,
        name: entry2.route_name || details.latest_name,
        consortium: entry2.consortium || details.latest_consortium,
        trips1: 0,
        trips2: entry2.trips_du,
        delta: entry2.trips_du,
        delta_pct: 100,
        status: "added"
      });
    } else if (entry1 && !entry2) {
      removed.push({
        code,
        display_code: details.display_code || code,
        name: entry1.route_name || details.latest_name,
        consortium: entry1.consortium || details.latest_consortium,
        trips1: entry1.trips_du,
        trips2: 0,
        delta: -entry1.trips_du,
        delta_pct: -100,
        status: "removed"
      });
    } else if (entry1 && entry2) {
      const diff = entry2.trips_du - entry1.trips_du;
      const pct = entry1.trips_du > 0 ? (diff / entry1.trips_du) * 100 : 0;
      const row = {
        code,
        display_code: details.display_code || code,
        name: entry2.route_name || entry1.route_name || details.latest_name,
        consortium: entry2.consortium || entry1.consortium || details.latest_consortium,
        trips1: entry1.trips_du,
        trips2: entry2.trips_du,
        delta: diff,
        delta_pct: pct
      };

      if (diff > 0) {
        row.status = "increased";
        increased.push(row);
      } else if (diff < 0) {
        row.status = "decreased";
        decreased.push(row);
      } else {
        row.status = "unchanged";
        unchanged.push(row);
      }
    }
  }

  state.currentDiffData = {
    date1: d1,
    date2: d2,
    added,
    removed,
    increased,
    decreased,
    unchanged
  };

  setText("diff-count-added", added.length);
  setText("diff-count-removed", removed.length);
  setText("diff-count-increased", increased.length);
  setText("diff-count-decreased", decreased.length);

  renderDiffTableResults();
}

function renderDiffTableResults() {
  if (!state.currentDiffData) return;
  const { added, removed, increased, decreased, unchanged, date1, date2 } = state.currentDiffData;
  const tbody = document.getElementById("tbody-diff-results");
  if (!tbody) return;

  let list = [];
  if (state.currentDiffFilter === "ALL") {
    list = [...added, ...removed, ...increased, ...decreased];
  } else if (state.currentDiffFilter === "ADDED") {
    list = [...added];
  } else if (state.currentDiffFilter === "REMOVED") {
    list = [...removed];
  } else if (state.currentDiffFilter === "INCREASED") {
    list = [...increased];
  } else if (state.currentDiffFilter === "DECREASED") {
    list = [...decreased];
  }

  // 1. Filtragem por busca
  if (state.diffSearchQuery) {
    const q = state.diffSearchQuery;
    list = list.filter(item => {
      const code = (item.code || "").toLowerCase();
      const displayCode = (item.display_code || "").toLowerCase();
      const name = (item.name || "").toLowerCase();
      const consortium = (item.consortium || "").toLowerCase();
      return code.includes(q) || displayCode.includes(q) || name.includes(q) || consortium.includes(q);
    });
  }

  // 2. Ordenação
  const sort = state.diffSortBy || "diff_desc";
  list.sort((a, b) => {
    if (sort === "diff_desc") return b.delta - a.delta;
    if (sort === "diff_asc") return a.delta - b.delta;
    if (sort === "pct_desc") return b.delta_pct - a.delta_pct;
    if (sort === "pct_asc") return a.delta_pct - b.delta_pct;
    if (sort === "line_asc") return naturalCompare(a.display_code || a.code, b.display_code || b.code, true);
    if (sort === "line_desc") return naturalCompare(a.display_code || a.code, b.display_code || b.code, false);
    if (sort === "abs_diff") return Math.abs(b.delta) - Math.abs(a.delta);
    if (sort === "name_asc") return (a.name || "").localeCompare(b.name || "", "pt-BR");
    if (sort === "name_desc") return (b.name || "").localeCompare(a.name || "", "pt-BR");
    if (sort === "consortium_asc") return (a.consortium || "").localeCompare(b.consortium || "", "pt-BR");
    if (sort === "consortium_desc") return (b.consortium || "").localeCompare(a.consortium || "", "pt-BR");
    if (sort === "trips1_desc") return b.trips1 - a.trips1;
    if (sort === "trips1_asc") return a.trips1 - b.trips1;
    if (sort === "trips2_desc") return b.trips2 - a.trips2;
    if (sort === "trips2_asc") return a.trips2 - b.trips2;
    return b.delta - a.delta;
  });

  // Atualiza cabeçalhos de data
  setText("th-diff-date-1", formatDateBR(date1));
  setText("th-diff-date-2", formatDateBR(date2));

  // Atualiza indicadores de ordenação nos cabeçalhos da tabela
  updateDiffHeaderSortIcons(sort);

  // Contador de resultados
  const countEl = document.getElementById("diff-results-count");
  if (countEl) {
    countEl.textContent = `Exibindo ${list.length} de ${added.length + removed.length + increased.length + decreased.length} alterações`;
  }

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 28px; color: var(--text-muted);"><i class="fa-solid fa-magnifying-glass" style="margin-right:6px;"></i> Nenhuma alteração encontrada para estes filtros.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(item => {
    let badgeClass = "badge-status-loss";
    let badgeText = `${item.delta > 0 ? "+" : ""}${item.delta} viagens`;

    if (item.status === "added") {
      badgeClass = "badge-status-gain";
      badgeText = `<i class="fa-solid fa-plus"></i> Linha Criada (+${item.trips2} vg)`;
    } else if (item.status === "removed") {
      badgeClass = "badge-status-extinct";
      badgeText = `<i class="fa-solid fa-ban"></i> Extinta (-${item.trips1} vg)`;
    } else if (item.status === "increased") {
      badgeClass = "badge-status-gain";
      badgeText = `<i class="fa-solid fa-arrow-up"></i> +${item.delta} (+${item.delta_pct.toFixed(0)}%)`;
    } else if (item.status === "decreased") {
      badgeClass = "badge-status-loss";
      badgeText = `<i class="fa-solid fa-arrow-down"></i> ${item.delta} (${item.delta_pct.toFixed(0)}%)`;
    }

    const rowClass = item.status === "increased" || item.status === "added" ? "row-highlight-gain" : (item.status === "decreased" || item.status === "removed" ? "row-highlight-loss" : "");

    return `
      <tr class="${rowClass}" onclick="openLineModal('${item.code}')" style="cursor: pointer;">
        <td><strong><span class="line-badge" style="font-size:0.9rem;">${escapeHTML(item.display_code || item.code)}</span></strong></td>
        <td>${escapeHTML(item.name || "-")}</td>
        <td><span class="badge ${getConsortiumClass(item.consortium)}">${escapeHTML(item.consortium || "-")}</span></td>
        <td>${item.trips1 !== undefined ? item.trips1 : "-"}</td>
        <td><strong>${item.trips2 !== undefined ? item.trips2 : "-"}</strong></td>
        <td><span class="badge ${badgeClass}">${badgeText}</span></td>
      </tr>
    `;
  }).join("");
}

function updateDiffHeaderSortIcons(sort) {
  const iconMap = {
    code: { asc: "line_asc", desc: "line_desc" },
    name: { asc: "name_asc", desc: "name_desc" },
    consortium: { asc: "consortium_asc", desc: "consortium_desc" },
    trips1: { asc: "trips1_asc", desc: "trips1_desc" },
    trips2: { asc: "trips2_asc", desc: "trips2_desc" },
    delta: { asc: "diff_asc", desc: "diff_desc" }
  };

  document.querySelectorAll("#pane-comparador .sortable-th").forEach(th => {
    const key = th.getAttribute("data-sort-key");
    const icon = th.querySelector(".sort-icon");
    if (!icon || !iconMap[key]) return;

    if (sort === iconMap[key].asc) {
      icon.className = "fa-solid fa-sort-up sort-icon active";
    } else if (sort === iconMap[key].desc) {
      icon.className = "fa-solid fa-sort-down sort-icon active";
    } else {
      icon.className = "fa-solid fa-sort sort-icon";
    }
  });
}

function naturalCompare(a, b, asc = true) {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const cmp = collator.compare(String(a || ''), String(b || ''));
  return asc ? cmp : -cmp;
}

/* ==========================================================================
   7. Modal de Detalhes da Linha
   ========================================================================== */
async function openLineModal(lineCode) {
  let line = state.linesDetailMap[lineCode];

  // Se não estiver carregado na memória, tenta carregar o JSON
  if (!line && Object.keys(state.linesDetailMap).length === 0) {
    try {
      const res = await fetch("planos-data/lines_detail.json");
      if (res.ok) {
        state.linesDetailMap = await res.json();
        line = state.linesDetailMap[lineCode];
      }
    } catch (e) {}
  }

  // Tenta encontrar por alias ou normalized_code caso a chave primária seja diferente
  if (!line && state.linesDetailMap) {
    const qCode = String(lineCode).toUpperCase().replace(/\s+/g, "");
    line = Object.values(state.linesDetailMap).find(l => {
      const pCode = (l.line_code || "").toUpperCase().replace(/\s+/g, "");
      const nCode = (l.normalized_code || "").toUpperCase().replace(/\s+/g, "");
      const aliases = (l.aliases || []).map(a => String(a).toUpperCase().replace(/\s+/g, ""));
      return pCode === qCode || nCode === qCode || aliases.includes(qCode);
    });
  }

  if (!line) {
    alert("Dados detalhados desta linha não puderam ser carregados.");
    return;
  }

  state.currentModalLine = line;
  setText("modal-line-code", line.display_code || line.line_code);
  setText("modal-line-name", line.latest_name || "-");
  setText("modal-line-consortium", line.latest_consortium || "-");
  setText("modal-line-trips", `${line.latest_trips_weekday || 0} viagens/dia`);

  const depBadge = document.getElementById("modal-line-departures");
  if (depBadge) {
    if (line.latest_dep_circ_du > 0) {
      depBadge.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> ${line.latest_dep_circ_du} partidas circulares/dia`;
      depBadge.style.display = "inline-flex";
    } else if (line.latest_dep_ida_du > 0 || line.latest_dep_volta_du > 0) {
      const tot = line.latest_dep_total_du || (line.latest_dep_ida_du + line.latest_dep_volta_du);
      depBadge.innerHTML = `<i class="fa-solid fa-route"></i> ${line.latest_dep_ida_du} Ida / ${line.latest_dep_volta_du} Volta • <strong>${tot} partidas totais/dia</strong>`;
      depBadge.style.display = "inline-flex";
    } else {
      depBadge.style.display = "none";
    }
  }

  const modalBackdrop = document.getElementById("obs-line-modal");
  if (modalBackdrop) modalBackdrop.classList.add("open");

  renderModalChart(line.timeline || []);
  renderModalHistoryTable(line.timeline || []);
}

function closeLineModal() {
  const modalBackdrop = document.getElementById("obs-line-modal");
  if (modalBackdrop) modalBackdrop.classList.remove("open");
}

function renderModalChart(timeline) {
  const ctx = document.getElementById("chart-modal-line");
  if (!ctx || timeline.length === 0) return;

  const chronological = [...timeline].sort((a, b) => a.date.localeCompare(b.date));
  const labels = chronological.map(t => formatDateBR(t.date));
  const du = chronological.map(t => t.trips_du);
  const sab = chronological.map(t => t.trips_sab);
  const dom = chronological.map(t => t.trips_dom);

  if (state.charts.modal) state.charts.modal.destroy();

  state.charts.modal = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Dias Úteis",
          data: du,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.15)",
          fill: true,
          tension: 0.3
        },
        {
          label: "Sábados",
          data: sab,
          borderColor: "#10b981",
          borderDash: [4, 4],
          tension: 0.3
        },
        {
          label: "Domingos",
          data: dom,
          borderColor: "#f59e0b",
          borderDash: [2, 2],
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top", labels: { usePointStyle: true } }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

function renderModalHistoryTable(timeline) {
  const tbody = document.getElementById("tbody-modal-timeline");
  if (!tbody) return;

  if (!timeline || timeline.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: var(--text-muted);">Nenhum histórico operacional registrado.</td></tr>`;
    return;
  }

  // 1. Cria cópia cronológica (mais antiga para mais recente) para calcular variações com precisão
  const chronological = [...timeline].sort((a, b) => a.date.localeCompare(b.date));

  // 2. Calcula as métricas de variação para cada plano relativo ao plano anterior imediato
  const enriched = chronological.map((curr, idx) => {
    const prev = idx > 0 ? chronological[idx - 1] : null;
    const deltaDU = prev ? curr.trips_du - prev.trips_du : 0;
    const deltaPct = prev && prev.trips_du > 0 ? (deltaDU / prev.trips_du) * 100 : (curr.trips_du > 0 && !prev ? 100 : 0);
    const deltaSab = prev ? curr.trips_sab - prev.trips_sab : 0;
    const deltaDom = prev ? curr.trips_dom - prev.trips_dom : 0;
    const deltaKm = prev && prev.km_du ? (curr.km_du || 0) - prev.km_du : 0;

    return {
      ...curr,
      hasPrev: !!prev,
      prevDate: prev ? prev.date : null,
      deltaDU,
      deltaPct,
      deltaSab,
      deltaDom,
      deltaKm
    };
  });

  // 3. Ordena para exibição conforme preferência do usuário (padrão: mais recentes primeiro)
  const displayList = state.modalTimelineOrder === "desc" 
    ? [...enriched].reverse() 
    : [...enriched];

  tbody.innerHTML = displayList.map(row => {
    let deltaBadge = "";
    let rowClass = "";

    if (!row.hasPrev) {
      deltaBadge = `<span class="badge badge-subtle" title="Primeiro plano registrado desta linha"><i class="fa-solid fa-flag-checkered"></i> Base Inicial</span>`;
    } else if (row.deltaDU > 0) {
      rowClass = "row-highlight-gain";
      deltaBadge = `<span class="badge badge-status-gain" title="+${row.deltaDU} viagens/DU (+${row.deltaPct.toFixed(1)}%) vs plano de ${formatDateBR(row.prevDate)}"><i class="fa-solid fa-arrow-up"></i> +${row.deltaDU} (+${row.deltaPct.toFixed(0)}%)</span>`;
    } else if (row.deltaDU < 0) {
      rowClass = "row-highlight-loss";
      deltaBadge = `<span class="badge badge-status-loss" title="${row.deltaDU} viagens/DU (${row.deltaPct.toFixed(1)}%) vs plano de ${formatDateBR(row.prevDate)}"><i class="fa-solid fa-arrow-down"></i> ${row.deltaDU} (${row.deltaPct.toFixed(0)}%)</span>`;
    } else {
      deltaBadge = `<span class="badge badge-subtle" style="opacity:0.75;" title="Mesmo volume de viagens em dias úteis do plano anterior"><i class="fa-solid fa-equals"></i> Estável</span>`;
    }

    // Variação secundária para sábados e domingos
    let sabExtra = "";
    if (row.hasPrev && row.deltaSab !== 0) {
      const color = row.deltaSab > 0 ? "color:#10b981;" : "color:#ef4444;";
      sabExtra = ` <span style="${color} font-size:0.75rem; font-weight:700;">(${row.deltaSab > 0 ? '+' : ''}${row.deltaSab})</span>`;
    }

    let domExtra = "";
    if (row.hasPrev && row.deltaDom !== 0) {
      const color = row.deltaDom > 0 ? "color:#10b981;" : "color:#ef4444;";
      domExtra = ` <span style="${color} font-size:0.75rem; font-weight:700;">(${row.deltaDom > 0 ? '+' : ''}${row.deltaDom})</span>`;
    }

    let duDeparturesSub = "";
    if (row.dep_circ_du > 0) {
      duDeparturesSub = `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;"><i class="fa-solid fa-arrows-rotate"></i> ${row.dep_circ_du} circ.</div>`;
    } else if (row.dep_ida_du > 0 || row.dep_volta_du > 0) {
      const tot = row.dep_total_du || (row.dep_ida_du + row.dep_volta_du);
      const isAsym = row.dep_ida_du !== row.dep_volta_du;
      const colorStyle = isAsym ? "color:var(--primary); font-weight:600;" : "color:var(--text-muted);";
      duDeparturesSub = `<div style="font-size:0.75rem; ${colorStyle} margin-top:2px;" title="${row.dep_ida_du} ida / ${row.dep_volta_du} volta (${tot} partidas totais no dia útil)">${row.dep_ida_du} ida / ${row.dep_volta_du} volta <span style="opacity:0.75;">(${tot}p)</span></div>`;
    }

    let sabDeparturesSub = "";
    if (row.dep_circ_sab > 0) {
      sabDeparturesSub = `<div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px;">${row.dep_circ_sab} circ.</div>`;
    } else if (row.dep_ida_sab > 0 || row.dep_volta_sab > 0) {
      const totSab = row.dep_total_sab || (row.dep_ida_sab + row.dep_volta_sab);
      sabDeparturesSub = `<div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px;">${row.dep_ida_sab}i / ${row.dep_volta_sab}v (${totSab}p)</div>`;
    }

    let domDeparturesSub = "";
    if (row.dep_circ_dom > 0) {
      domDeparturesSub = `<div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px;">${row.dep_circ_dom} circ.</div>`;
    } else if (row.dep_ida_dom > 0 || row.dep_volta_dom > 0) {
      const totDom = row.dep_total_dom || (row.dep_ida_dom + row.dep_volta_dom);
      domDeparturesSub = `<div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px;">${row.dep_ida_dom}i / ${row.dep_volta_dom}v (${totDom}p)</div>`;
    }

    return `
      <tr class="${rowClass}">
        <td><strong>${formatDateBR(row.date)}</strong></td>
        <td>
          <div style="font-weight:800; font-size:0.95rem; color:var(--text);">${row.trips_du}</div>
          ${duDeparturesSub}
        </td>
        <td>${deltaBadge}</td>
        <td>
          <div><strong>${row.trips_sab}</strong>${sabExtra}</div>
          ${sabDeparturesSub}
        </td>
        <td>
          <div><strong>${row.trips_dom}</strong>${domExtra}</div>
          ${domDeparturesSub}
        </td>
        <td>${row.km_du ? row.km_du.toFixed(1) + ' km' : "-"}</td>
        <td><span class="badge ${getConsortiumClass(row.consortium)}">${escapeHTML(row.consortium || "-")}</span></td>
        <td class="modal-table-route" title="${escapeHTML(row.route_name || "")}">${escapeHTML(row.route_name || "-")}</td>
      </tr>
    `;
  }).join("");
}

/* ==========================================================================
   8. Lista de Extinções e Catálogo
   ========================================================================== */
function renderExtinctionsList(extinctList) {
  const tbody = document.getElementById("tbody-extinct-lines");
  if (!tbody) return;

  if (extinctList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 24px; color: var(--text-muted);">Nenhuma linha extinta registrada.</td></tr>`;
    return;
  }

  tbody.innerHTML = extinctList.map(l => `
    <tr onclick="openLineModal('${l.line_code}')" style="cursor: pointer;">
      <td><strong>${escapeHTML(l.display_code || l.line_code)}</strong></td>
      <td>${escapeHTML(l.latest_name || "-")}</td>
      <td><span class="badge ${getConsortiumClass(l.latest_consortium)}">${escapeHTML(l.latest_consortium || "-")}</span></td>
      <td>${formatDateBR(l.last_seen_date)}</td>
      <td>${l.max_trips_weekday || "-"}</td>
    </tr>
  `).join("");
}

function renderPlansCatalog(catalog) {
  const tbody = document.getElementById("tbody-plans-catalog");
  if (!tbody) return;

  tbody.innerHTML = catalog.map(p => `
    <tr>
      <td><strong>${formatDateBR(p.date)}</strong></td>
      <td>${escapeHTML(p.title || p.plan_id)}</td>
      <td><span class="badge badge-status-gain">${p.entries || 0} Linhas</span></td>
      <td><a href="https://transportes.prefeitura.rio/linhas-de-onibus/" target="_blank" class="btn-sm">Ver na SMTR ↗</a></td>
    </tr>
  `).join("");
}

/* ==========================================================================
   Utilitários
   ========================================================================== */
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function formatDateBR(dateStr) {
  if (!dateStr) return "-";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function escapeHTML(str) {
  if (!str) return "";
  return String(str).replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

function getConsortiumClass(consortium) {
  if (!consortium) return "badge-intersul";
  const s = consortium.toLowerCase();
  if (s.includes("intersul")) return "badge-intersul";
  if (s.includes("internorte")) return "badge-internorte";
  if (s.includes("transcarioca")) return "badge-transcarioca";
  if (s.includes("santa cruz")) return "badge-santacruz";
  return "badge-intersul";
}
