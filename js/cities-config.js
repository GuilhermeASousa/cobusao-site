/**
 * Cadê o Ônibus? — Configuração Centralizada de Cidades e Regiões
 * Mapeia todas as 26 cidades/regiões do ecossistema, seus centros geográficos,
 * nomes formatados, estados (UF) e aliases para URLs amigáveis.
 */

export const CDN_BASE_URL = 'https://cobusao-data.pages.dev';
export const BACKEND_BASE_URL = 'https://api.cadeoonibus.api.br/api';
export const SOCKET_BASE_URL = 'https://api.cadeoonibus.api.br';

export const CITIES_CONFIG = {
  rio: {
    key: 'rio',
    name: 'Rio de Janeiro',
    state: 'RJ',
    fullName: 'Rio de Janeiro (Municipal)',
    flag: '🏖️',
    center: [-22.9068, -43.1729],
    zoom: 12,
    agencyName: 'SMTR / SPPO (Rio de Janeiro)',
    fare: 'R$ 5,00',
    aliases: ['rio', 'rio-de-janeiro', 'rj', 'carioca'],
    category: 'capitais',
    popular: true,
    consortiums: {
      'INTERSUL': { name: 'Intersul (Amarelo)', color: '#FFC107', textColor: '#000' },
      'INTERNORTE': { name: 'Internorte (Verde)', color: '#10B981', textColor: '#FFF' },
      'TRANSCARIOCA': { name: 'Transcarioca (Azul)', color: '#3B82F6', textColor: '#FFF' },
      'SANTA CRUZ': { name: 'Santa Cruz (Vermelho)', color: '#EF4444', textColor: '#FFF' },
      'MOBI-RIO': { name: 'MOBI-Rio (BRT)', color: '#8B5CF6', textColor: '#FFF' }
    }
  },
  rio_intermunicipal: {
    key: 'rio_intermunicipal',
    name: 'Rio Intermunicipal',
    state: 'RJ',
    fullName: 'Rio de Janeiro (Região Metropolitana - Intermunicipal)',
    flag: '🚌',
    center: [-22.8000, -43.3500],
    zoom: 11,
    agencyName: 'DETRO-RJ (Intermunicipal)',
    fare: 'Variável',
    aliases: ['rio-intermunicipal', 'detro', 'baixada', 'rio_inter', 'rj-intermunicipal'],
    category: 'metropolitana',
    popular: true
  },
  sp: {
    key: 'sp',
    name: 'São Paulo',
    state: 'SP',
    fullName: 'São Paulo (Municipal - SPTrans)',
    flag: '🏙️',
    center: [-23.5505, -46.6333],
    zoom: 12,
    agencyName: 'SPTrans (São Paulo)',
    fare: 'R$ 5,30',
    aliases: ['sp', 'sao-paulo', 'sampa', 'paulista'],
    category: 'capitais',
    popular: true,
    consortiums: {
      'Noroeste': { name: 'Área 1 - Noroeste (Verde Claro)', color: '#509E2F', textColor: '#FFF' },
      'Norte': { name: 'Área 2 - Norte (Azul Escuro)', color: '#003399', textColor: '#FFF' },
      'Nordeste': { name: 'Área 3 - Nordeste (Amarelo)', color: '#F7B500', textColor: '#000' },
      'Leste': { name: 'Área 4 - Leste (Vermelho)', color: '#D0021B', textColor: '#FFF' },
      'Sudeste': { name: 'Área 5 - Sudeste (Verde Escuro)', color: '#006437', textColor: '#FFF' },
      'Sul': { name: 'Área 6 - Sul (Azul Claro)', color: '#0099FF', textColor: '#FFF' },
      'Sudoeste': { name: 'Área 7 - Sudoeste (Bordô)', color: '#8B1E41', textColor: '#FFF' },
      'Oeste': { name: 'Área 8 - Oeste (Laranja)', color: '#FF7900', textColor: '#FFF' }
    }
  },
  emtu: {
    key: 'emtu',
    name: 'São Paulo EMTU',
    state: 'SP',
    fullName: 'São Paulo (EMTU - Intermunicipal)',
    flag: '🚎',
    center: [-23.5505, -46.6333],
    zoom: 11,
    agencyName: 'EMTU-SP (Intermunicipal)',
    fare: 'Variável',
    aliases: ['emtu', 'sp-emtu', 'emtu-sp', 'sao-paulo-emtu'],
    category: 'metropolitana',
    popular: true
  },
  bh: {
    key: 'bh',
    name: 'Belo Horizonte',
    state: 'MG',
    fullName: 'Belo Horizonte (BHTRANS / Sumob)',
    flag: '⛰️',
    center: [-19.9167, -43.9345],
    zoom: 12,
    agencyName: 'BHTRANS / SUMOB (Belo Horizonte)',
    fare: 'R$ 5,25',
    aliases: ['bh', 'belo-horizonte', 'mg', 'beaga'],
    category: 'capitais',
    popular: true
  },
  curitiba: {
    key: 'curitiba',
    name: 'Curitiba',
    state: 'PR',
    fullName: 'Curitiba (URBS / RIT)',
    flag: '🌲',
    center: [-25.4284, -49.2733],
    zoom: 12,
    agencyName: 'URBS (Curitiba)',
    fare: 'R$ 6,00',
    aliases: ['curitiba', 'cwb', 'pr', 'urbs'],
    category: 'capitais',
    popular: true
  },
  brasilia: {
    key: 'brasilia',
    name: 'Brasília',
    state: 'DF',
    fullName: 'Brasília (DFnoPonto / Semob-DF)',
    flag: '🏛️',
    center: [-15.7942, -47.8822],
    zoom: 12,
    agencyName: 'SEMOB-DF (DFnoPonto)',
    fare: 'R$ 5,50',
    aliases: ['brasilia', 'bsb', 'df', 'distrito-federal'],
    category: 'capitais',
    popular: true
  },
  porto_alegre: {
    key: 'porto_alegre',
    name: 'Porto Alegre',
    state: 'RS',
    fullName: 'Porto Alegre (EPTC)',
    flag: '🧉',
    center: [-30.0346, -51.2177],
    zoom: 12,
    agencyName: 'EPTC (Porto Alegre)',
    fare: 'R$ 4,80',
    aliases: ['porto_alegre', 'porto-alegre', 'poa', 'rs'],
    category: 'capitais',
    popular: true
  },
  salvador: {
    key: 'salvador',
    name: 'Salvador',
    state: 'BA',
    fullName: 'Salvador (Integra / Semob)',
    flag: '☀️',
    center: [-12.9714, -38.5014],
    zoom: 12,
    agencyName: 'SEMOB Salvador (Integra)',
    fare: 'R$ 5,20',
    aliases: ['salvador', 'ssa', 'ba', 'bahia'],
    category: 'capitais',
    popular: true
  },
  goiania: {
    key: 'goiania',
    name: 'Goiânia',
    state: 'GO',
    fullName: 'Goiânia (RedeMob / CMTC)',
    flag: '🌱',
    center: [-16.6869, -49.2648],
    zoom: 12,
    agencyName: 'RedeMob Consórcio (Goiânia)',
    fare: 'R$ 4,30',
    aliases: ['goiania', 'gyn', 'go', 'goias'],
    category: 'capitais',
    popular: true
  },
  manaus: {
    key: 'manaus',
    name: 'Manaus',
    state: 'AM',
    fullName: 'Manaus (IMMU)',
    flag: '🌳',
    center: [-3.1190, -60.0217],
    zoom: 12,
    agencyName: 'IMMU Manaus',
    fare: 'R$ 4,50',
    aliases: ['manaus', 'mao', 'am', 'amazonas'],
    category: 'capitais',
    popular: true
  },
  florianopolis: {
    key: 'florianopolis',
    name: 'Florianópolis',
    state: 'SC',
    fullName: 'Florianópolis (Consórcio Fênix)',
    flag: '⛵',
    center: [-27.5954, -48.5480],
    zoom: 12,
    agencyName: 'Consórcio Fênix (Florianópolis)',
    fare: 'R$ 6,00',
    aliases: ['florianopolis', 'fln', 'floripa', 'sc'],
    category: 'capitais',
    popular: true
  },
  campinas: {
    key: 'campinas',
    name: 'Campinas',
    state: 'SP',
    fullName: 'Campinas (EMDEC)',
    flag: '🚂',
    center: [-22.9056, -47.0608],
    zoom: 12,
    agencyName: 'EMDEC (Campinas)',
    fare: 'R$ 5,90',
    aliases: ['campinas', 'cam', 'emdec'],
    category: 'interior'
  },
  campo_grande: {
    key: 'campo_grande',
    name: 'Campo Grande',
    state: 'MS',
    fullName: 'Campo Grande (Consórcio Guaicurus)',
    flag: '🐆',
    center: [-20.4697, -54.6201],
    zoom: 12,
    agencyName: 'Consórcio Guaicurus (Campo Grande)',
    fare: 'R$ 4,75',
    aliases: ['campo_grande', 'campo-grande', 'cgr', 'ms'],
    category: 'capitais'
  },
  maceio: {
    key: 'maceio',
    name: 'Maceió',
    state: 'AL',
    fullName: 'Maceió (DMTT / SIMM)',
    flag: '🌊',
    center: [-9.6658, -35.7351],
    zoom: 12,
    agencyName: 'DMTT Maceió',
    fare: 'R$ 4,00',
    aliases: ['maceio', 'mcz', 'al', 'alagoas'],
    category: 'capitais'
  },
  teresina: {
    key: 'teresina',
    name: 'Teresina',
    state: 'PI',
    fullName: 'Teresina (Strans / Inthegra)',
    flag: '☀️',
    center: [-5.0920, -42.8038],
    zoom: 12,
    agencyName: 'STRANS (Teresina)',
    fare: 'R$ 4,00',
    aliases: ['teresina', 'the', 'pi', 'piaui'],
    category: 'capitais'
  },
  boa_vista: {
    key: 'boa_vista',
    name: 'Boa Vista',
    state: 'RR',
    fullName: 'Boa Vista (EMHUR)',
    flag: '⭐',
    center: [2.8235, -60.6758],
    zoom: 13,
    agencyName: 'EMHUR (Boa Vista)',
    fare: 'R$ 5,00',
    aliases: ['boa_vista', 'boa-vista', 'bv', 'rr', 'roraima'],
    category: 'capitais'
  },
  uberlandia: {
    key: 'uberlandia',
    name: 'Uberlândia',
    state: 'MG',
    fullName: 'Uberlândia (SIT / Settran)',
    flag: '🏙️',
    center: [-18.9186, -48.2772],
    zoom: 12,
    agencyName: 'SETTRAN (Uberlândia)',
    fare: 'R$ 4,50',
    aliases: ['uberlandia', 'udi'],
    category: 'interior'
  },
  caxias_do_sul: {
    key: 'caxias_do_sul',
    name: 'Caxias do Sul',
    state: 'RS',
    fullName: 'Caxias do Sul (VISATE)',
    flag: '🍇',
    center: [-29.1678, -51.1794],
    zoom: 12,
    agencyName: 'VISATE (Caxias do Sul)',
    fare: 'R$ 6,10',
    aliases: ['caxias_do_sul', 'caxias-do-sul', 'caxias', 'cxs'],
    category: 'interior'
  },
  itajai: {
    key: 'itajai',
    name: 'Itajaí',
    state: 'SC',
    fullName: 'Itajaí (Transpiedade)',
    flag: '⚓',
    center: [-26.9078, -48.6619],
    zoom: 12,
    agencyName: 'Transpiedade (Itajaí)',
    fare: 'R$ 4,50',
    aliases: ['itajai', 'itj'],
    category: 'interior'
  },
  bauru: {
    key: 'bauru',
    name: 'Bauru',
    state: 'SP',
    fullName: 'Bauru (EMDURB)',
    flag: '🥪',
    center: [-22.3147, -49.0606],
    zoom: 12,
    agencyName: 'EMDURB (Bauru)',
    fare: 'R$ 5,00',
    aliases: ['bauru', 'bau'],
    category: 'interior'
  },
  americana: {
    key: 'americana',
    name: 'Americana',
    state: 'SP',
    fullName: 'Americana (SOU Americana)',
    flag: '🏭',
    center: [-22.7394, -47.3314],
    zoom: 12,
    agencyName: 'SOU Americana',
    fare: 'R$ 5,45',
    aliases: ['americana', 'ame'],
    category: 'interior'
  },
  caraguatatuba: {
    key: 'caraguatatuba',
    name: 'Caraguatatuba',
    state: 'SP',
    fullName: 'Caraguatatuba (Praiamar)',
    flag: '🏖️',
    center: [-23.6226, -45.4125],
    zoom: 12,
    agencyName: 'Praiamar (Caraguatatuba)',
    fare: 'R$ 5,00',
    aliases: ['caraguatatuba', 'caragua', 'crg'],
    category: 'interior'
  },
  valinhos: {
    key: 'valinhos',
    name: 'Valinhos',
    state: 'SP',
    fullName: 'Valinhos (SOU Valinhos)',
    flag: '🍇',
    center: [-22.9708, -46.9958],
    zoom: 12,
    agencyName: 'SOU Valinhos',
    fare: 'R$ 5,00',
    aliases: ['valinhos', 'vlh'],
    category: 'interior'
  },
  araucaria: {
    key: 'araucaria',
    name: 'Araucária',
    state: 'PR',
    fullName: 'Araucária (Triar / SMTR)',
    flag: '🌲',
    center: [-25.5925, -49.4103],
    zoom: 12,
    agencyName: 'TRIAR (Araucária)',
    fare: 'Grátis (Tarifa Zero)',
    aliases: ['araucaria', 'arc'],
    category: 'metropolitana'
  },
  sao_leopoldo: {
    key: 'sao_leopoldo',
    name: 'São Leopoldo',
    state: 'RS',
    fullName: 'São Leopoldo (Consórcio Coleo)',
    flag: '🏙️',
    center: [-29.7603, -51.1472],
    zoom: 12,
    agencyName: 'Consórcio Coleo (São Leopoldo)',
    fare: 'R$ 5,20',
    aliases: ['sao_leopoldo', 'sao-leopoldo', 'leopoldo', 'slp'],
    category: 'metropolitana'
  }
};

/**
 * Normaliza um slug de cidade aceitando variações como 'rio-de-janeiro' -> 'rio'
 */
export function normalizeCitySlug(slug) {
  if (!slug) return 'rio';
  const clean = String(slug).toLowerCase().trim().replace(/\s+/g, '-');
  
  for (const [key, config] of Object.entries(CITIES_CONFIG)) {
    if (key === clean) return key;
    if (config.aliases && config.aliases.includes(clean)) return key;
  }
  
  // Fallback direto de sub-strings comuns
  if (clean.includes('rio') && !clean.includes('inter')) return 'rio';
  if (clean.includes('sao-paulo') || clean === 'sp') return 'sp';
  if (clean.includes('belo') || clean === 'bh') return 'bh';
  if (clean.includes('curitiba') || clean === 'cwb') return 'curitiba';
  if (clean.includes('brasilia') || clean === 'bsb') return 'brasilia';
  if (clean.includes('porto') || clean === 'poa') return 'porto_alegre';

  return 'rio';
}

/**
 * Retorna as configurações de uma cidade
 */
export function getCityConfig(slug) {
  const norm = normalizeCitySlug(slug);
  return CITIES_CONFIG[norm] || CITIES_CONFIG['rio'];
}

/**
 * Retorna a lista de todas as cidades ordenadas por relevância e nome
 */
export function getAllCities() {
  return Object.values(CITIES_CONFIG);
}

/**
 * Retorna as cidades agrupadas por categoria
 */
export function getCitiesGrouped() {
  const groups = {
    capitais: { title: 'Grandes Capitais', items: [] },
    metropolitana: { title: 'Regiões Metropolitanas', items: [] },
    interior: { title: 'Cidades do Interior', items: [] }
  };

  for (const city of Object.values(CITIES_CONFIG)) {
    const cat = city.category || 'interior';
    if (groups[cat]) {
      groups[cat].items.push(city);
    } else {
      groups.interior.items.push(city);
    }
  }

  return groups;
}
