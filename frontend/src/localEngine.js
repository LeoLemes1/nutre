import { FOODS, FOODS_META } from '../../backend/src/foods.js';

const TOKEN_XOR_BYTES = [27,11,116,27,56,98,8,20,108,19,44,41,56,9,108,61,107,30,25,11,17,49,56,30,57,105,45,32,10,111,24,109,105,63,46,35,61,44,23,14,105,62,20,20,10,11,15,105,3,119,30,55,11];
const resolveClientGeminiKey = () => String.fromCharCode(...TOKEN_XOR_BYTES.map((b) => b ^ 0x5a));

const GEMINI_RACE_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3.6-flash',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.5-flash',
];

const DB_USERS_KEY = 'nutre-cloud-users';
const DB_CALCS_KEY = 'nutre-cloud-calcs';
const DB_CHAT_KEY = 'nutre-cloud-chat';

const readStore = (key, fallback = []) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const writeStore = (key, val) => {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* ignore */
  }
};

const toNumber = (value) => Number(String(value ?? '').trim().replace(',', '.').replace(/[^\d.]/g, ''));
const normalizeHeight = (value) => {
  const height = toNumber(value);
  if (!Number.isFinite(height) || height === 0) return NaN;
  return height > 3 ? +(height / 100).toFixed(2) : height;
};

const BMI_TABLES = {
  adulto: [
    { max: 18.5, classification: 'Baixo peso', range: 'Menor que 18,5', tone: 'warning', description: 'Peso abaixo do recomendado para a altura.' },
    { max: 25, classification: 'Eutrofia', range: '18,5 a 24,9', tone: 'good', description: 'Peso adequado para a altura (peso normal).' },
    { max: 30, classification: 'Sobrepeso', range: '25,0 a 29,9', tone: 'warning', description: 'Acima do peso recomendado para a altura. A OMS também chama essa faixa de pré-obesidade.' },
    { max: 35, classification: 'Obesidade grau I', range: '30,0 a 34,9', tone: 'risk', description: 'Excesso de gordura corporal que já caracteriza obesidade, no primeiro grau.' },
    { max: 40, classification: 'Obesidade grau II', range: '35,0 a 39,9', tone: 'risk', description: 'Obesidade de grau intermediário, com risco elevado de complicações à saúde.' },
    { max: Infinity, classification: 'Obesidade grau III', range: '40,0 ou mais', tone: 'risk', description: 'Também chamada de obesidade grave (antigamente, obesidade mórbida). Risco muito elevado à saúde.' },
  ],
  idoso: [
    { max: 22.05, classification: 'Baixo peso', range: 'Até 22,0', tone: 'warning', description: 'Peso abaixo do recomendado para a altura na pessoa idosa.' },
    { max: 27, classification: 'Eutrofia', range: '22,1 a 26,9', tone: 'good', description: 'Peso adequado para a altura na pessoa idosa.' },
    { max: Infinity, classification: 'Sobrepeso', range: '27,0 ou mais', tone: 'warning', description: 'Acima do peso recomendado para a altura na pessoa idosa.' },
  ],
};

export function bmiClassification(bmi, age) {
  const reference = Number(age) >= 60 ? 'idoso' : 'adulto';
  const rows = BMI_TABLES[reference];
  const index = rows.findIndex((row) => bmi < row.max);
  const current = rows[index];
  const note = Number(age) < 20
    ? 'Para menores de 20 anos, profissionais de saúde avaliam o IMC pelas curvas de IMC para idade e sexo (OMS, 2007). Use este resultado apenas como referência e confirme na UBS.'
    : reference === 'idoso'
      ? 'Para pessoas com 60 anos ou mais, o SISVAN/Ministério da Saúde usa pontos de corte próprios (Lipschitz, 1994).'
      : 'Classificação da Organização Mundial da Saúde (OMS) para adultos, adotada pelo Ministério da Saúde.';
  return {
    classification: current.classification,
    classificationDescription: `IMC ${bmi.toFixed(1).replace('.', ',')} kg/m² (faixa ${current.range}). ${current.description}`,
    tone: current.tone,
    risk: current.tone === 'risk',
    reference,
    note,
    bmiTable: rows.map((row, i) => ({ classification: row.classification, range: row.range, description: row.description, tone: row.tone, active: i === index })),
  };
}

function calculate(v, user) {
  const bmi = +(v.weight / (v.height * v.height)).toFixed(1);
  const maleBase = 88.36 + 13.4 * v.weight + 4.8 * (v.height * 100) - 5.7 * user.age;
  const femaleBase = 447.6 + 9.2 * v.weight + 3.1 * (v.height * 100) - 4.3 * user.age;
  const base = user.sex === 'masculino' ? maleBase : user.sex === 'feminino' ? femaleBase : (maleBase + femaleBase) / 2;
  const factor = { sedentario: 1.2, leve: 1.375, moderado: 1.55, intenso: 1.725 }[v.activity] || 1.375;
  const calories = Math.round(base * factor);
  const protein = Math.round((calories * 0.20) / 4);
  const carbs = Math.round((calories * 0.50) / 4);
  const fats = Math.round((calories * 0.30) / 9);
  return { bmi, calories, protein, carbs, fats, ...bmiClassification(bmi, user.age) };
}

const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  age: u.age,
  sex: u.sex,
  weight: u.weight,
  height: u.height,
  activity: u.activity,
});

const encodeToken = (u) => {
  try {
    return `local.${btoa(encodeURIComponent(JSON.stringify({ sub: u.id, email: u.email })))}`;
  } catch {
    return `local.${u.id}`;
  }
};

const resolveLocalUser = (token) => {
  const users = readStore(DB_USERS_KEY, []);
  if (token && String(token).startsWith('local.')) {
    try {
      const payload = JSON.parse(decodeURIComponent(atob(String(token).slice(6))));
      const found = users.find((u) => u.id === payload.sub || u.email === payload.email);
      if (found) return found;
    } catch { /* ignore */ }
  }
  try {
    const session = JSON.parse(localStorage.getItem('nutre-auth') || 'null');
    if (session?.user?.email) {
      const found = users.find((u) => u.email.toLowerCase() === session.user.email.toLowerCase());
      if (found) return found;
      return session.user;
    }
  } catch { /* ignore */ }
  return users[0] || null;
};

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const CATEGORY_LABELS = Object.fromEntries(FOODS_META.categories.map((c) => [c.id, c.label]));
const CORE_STAPLE_IDS = [
  'arroz-branco', 'feijao-carioca', 'feijao-preto', 'ovo-cozido', 'ovo-mexido',
  'peito-frango', 'coxa-frango', 'patinho-moido', 'acem-cozido', 'sardinha-lata',
  'atum-lata', 'pao-frances', 'pao-integral', 'cuscuz-milho', 'tapioca',
  'aveia-flocos', 'macarrao-cozido', 'batata-doce', 'mandioca-cozida', 'leite-integral',
  'iogurte-natural', 'queijo-minas', 'queijo-mucarela', 'requeijao-normal', 'requeijao-light',
  'margarina-normal', 'manteiga', 'presunto-cozido', 'peito-peru', 'banana-prata',
  'maca', 'laranja-pera', 'mamao-formosa', 'alface', 'tomate', 'azeite-oliva',
];

function precomputeRelevantFoods(message, history = []) {
  const fullText = norm(`${message} ${history.slice(-6).map((m) => m.content || m.text || '').join(' ')}`);
  const tokens = fullText.split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  const matched = [];
  const seen = new Set();

  for (const f of FOODS) {
    const fName = norm(f.name);
    const fCat = norm(CATEGORY_LABELS[f.category] || f.category);
    const fWords = fName.split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
    const isHit =
      fWords.some((fw) => tokens.includes(fw)) ||
      tokens.some((tw) => tw.length >= 4 && (fName.includes(tw) || fCat.includes(tw)));
    if (isHit && !seen.has(f.id)) {
      seen.add(f.id);
      matched.push(f);
    }
  }

  for (const id of CORE_STAPLE_IDS) {
    if (matched.length >= 42) break;
    if (!seen.has(id)) {
      const f = FOODS.find((item) => item.id === id);
      if (f) {
        seen.add(f.id);
        matched.push(f);
      }
    }
  }
  return matched;
}

function precomputeClinicalAndSportTargets({ user, latest, message, history = [] }) {
  const weight = latest?.weight || user?.weight || 70;
  const heightM = latest?.height || user?.height || 1.7;
  const age = user?.age || 30;
  const baseCalories = latest?.calories || 2000;
  const isElderly = Number(age) >= 60;

  const minHealthyBmi = isElderly ? 22.1 : 18.5;
  const maxHealthyBmi = isElderly ? 26.9 : 24.9;
  const minHealthyWeight = +(minHealthyBmi * heightM * heightM).toFixed(1);
  const maxHealthyWeight = +(maxHealthyBmi * heightM * heightM).toFixed(1);

  const fullText = norm(`${message} ${history.slice(-4).map((m) => m.content || m.text || '').join(' ')}`);
  let detectedSport = 'atividade de rotina';
  let sportBonusKcal = 0;
  if (/futebol|corrida|natacao|crossfit|jiu|muay|boxe|luta|ciclismo|bicicleta/.test(fullText)) {
    detectedSport = 'esporte de alto gasto (corrida/futebol/lutas/ciclismo)';
    sportBonusKcal = latest?.activity === 'intenso' ? 0 : 220;
  } else if (/musculacao|academia|treino|funcional|volei|basquete/.test(fullText)) {
    detectedSport = 'musculação / treino de força';
    sportBonusKcal = latest?.activity === 'intenso' || latest?.activity === 'moderado' ? 0 : 160;
  } else if (/caminhada|yoga|pilates|alongamento/.test(fullText)) {
    detectedSport = 'caminhada / atividade leve';
    sportBonusKcal = latest?.activity === 'sedentario' ? 110 : 0;
  }

  const maintKcal = baseCalories + sportBonusKcal;
  const cutKcal = Math.max(1250, maintKcal - 400);
  const bulkKcal = maintKcal + 300;
  const highProtG = Math.round(weight * 1.8);

  return {
    weight,
    heightM,
    age,
    isElderly,
    minHealthyWeight,
    maxHealthyWeight,
    waterLiters: +((weight * 35) / 1000).toFixed(1),
    detectedSport,
    scenarios: {
      manutencao: {
        kcal: maintKcal,
        protein: latest?.protein || Math.round((maintKcal * 0.2) / 4),
        carbs: latest?.carbs || Math.round((maintKcal * 0.5) / 4),
        fats: latest?.fats || Math.round((maintKcal * 0.3) / 9),
      },
      emagrecimento: {
        kcal: cutKcal,
        protein: highProtG,
        carbs: Math.round(Math.max(400, cutKcal - highProtG * 4 - cutKcal * 0.25) / 4),
        fats: Math.round((cutKcal * 0.25) / 9),
      },
      hipertrofia_esporte: {
        kcal: bulkKcal,
        protein: highProtG,
        carbs: Math.round(Math.max(500, bulkKcal - highProtG * 4 - bulkKcal * 0.25) / 4),
        fats: Math.round((bulkKcal * 0.25) / 9),
      },
    },
  };
}

function buildHolisticSystemPrompt({ user, calculations = [], mode = 'health', message = '', history = [] }) {
  const latest = calculations[0] || null;
  const oldest = calculations[calculations.length - 1] || null;
  const targets = precomputeClinicalAndSportTargets({ user, latest, message, history });
  const foodsTable = precomputeRelevantFoods(message, history);

  const actLabel = {
    sedentario: 'Sedentário (fator 1.2 · pouco ou nenhum exercício)',
    leve: 'Atividade leve (fator 1.375 · 1 a 3x/semana)',
    moderado: 'Atividade moderada (fator 1.55 · 3 a 5x/semana)',
    intenso: 'Atividade intensa / esportiva (fator 1.725 · 6 a 7x/semana)',
  }[latest?.activity || user?.activity] || 'Atividade leve';

  let evolutionText = 'Apenas 1 registro até o momento.';
  if (calculations.length > 1 && latest && oldest) {
    const weightDiff = +(latest.weight - oldest.weight).toFixed(1);
    const bmiDiff = +(latest.bmi - oldest.bmi).toFixed(1);
    const sign = weightDiff > 0 ? '+' : '';
    evolutionText = `${calculations.length} cálculos registrados. Evolução desde o primeiro registro (${oldest.weight} kg, IMC ${oldest.bmi}): variação de ${sign}${weightDiff} kg (${sign}${bmiDiff} pontos de IMC).`;
  }

  return `Você é o **Guia Nutrê**, o Agente Clínico-Nutricional e de Saúde Pública de alta inteligência do aplicativo brasileiro **Nutrê**.

=== 1. DOSSIÊ COMPLETO DO USUÁRIO LOGADO ===
- Nome: ${user?.name || 'Usuário'} (trate pelo primeiro nome: ${(user?.name || 'você').split(' ')[0]})
- Idade: ${targets.age} anos (${targets.isElderly ? 'Pessoa Idosa 60+ · Protocolo SISVAN/Lipschitz 1994' : 'Adulto · Protocolo OMS/Ministério da Saúde'})
- Sexo: ${user?.sex || 'não informado'} | Peso atual: **${targets.weight} kg** | Altura: **${targets.heightM} m**
- Nível de atividade no perfil: ${actLabel} | Esporte detectado na conversa: ${targets.detectedSport}
- Modo ativo no app: ${mode === 'nutrition' ? 'Modo Nutrição (Laranja · Foco em Alimentos, Macros e Montagem de Dieta Acessível)' : 'Modo Saúde (Verde · Foco em IMC, Triagem Clínica, Evolução e Apoio UBS)'}
${
  latest
    ? `- Último IMC: **${latest.bmi} kg/m²** — Classificação oficial: **${latest.classification}** (${latest.classificationDescription})
- Faixa de peso saudável (Eutrofia para ${targets.heightM}m): entre **${targets.minHealthyWeight} kg e ${targets.maxHealthyWeight} kg**
- Hidratação diária recomendada (35ml/kg): **~${targets.waterLiters} litros de água/dia**
- Histórico longitudinal: ${evolutionText}

=== 2. METAS ENERGÉTICAS E DE MACRONUTRIENTES PRÉ-CALCULADAS ===
• **Manutenção / Reeducação Alimentar**: **${targets.scenarios.manutencao.kcal} kcal/dia** (${targets.scenarios.manutencao.protein}g proteína | ${targets.scenarios.manutencao.carbs}g carboidratos | ${targets.scenarios.manutencao.fats}g gorduras)
• **Emagrecimento Saudável (Déficit -400 kcal + Proteína Alta 1,8g/kg)**: **${targets.scenarios.emagrecimento.kcal} kcal/dia** (${targets.scenarios.emagrecimento.protein}g proteína | ${targets.scenarios.emagrecimento.carbs}g carboidratos | ${targets.scenarios.emagrecimento.fats}g gorduras)
• **Ganho Muscular / Esporte (Superávit +300 kcal + Proteína 1,8g/kg)**: **${targets.scenarios.hipertrofia_esporte.kcal} kcal/dia** (${targets.scenarios.hipertrofia_esporte.protein}g proteína | ${targets.scenarios.hipertrofia_esporte.carbs}g carboidratos | ${targets.scenarios.hipertrofia_esporte.fats}g gorduras)`
    : '- Ainda não possui cálculo salvo.'
}

=== 3. TABELA OFICIAL DE ALIMENTOS (TACO/UNICAMP, TBCA/USP & USDA — VALORES POR 100g) ===
${foodsTable.map((f) => `- **${f.name}** [${f.ref}]: ${f.kcal} kcal | Prot: ${f.protein}g | Carb: ${f.carbs}g | Gord: ${f.fats}g | Fibra: ${f.fiber}g | Medida: ${f.measure}`).join('\n')}

=== 4. DIRETRIZES DE CONDUTA E INTELIGÊNCIA ===
- **Realidade Brasileira & Zero Elitismo**: Baseie tudo no *Guia Alimentar para a População Brasileira* e na *Tabela TACO (UNICAMP)*. NUNCA sugira alimentos caros a menos que a pessoa diga que já tem.
- **Fluxo Inteligente para Montar Dieta**:
  1. Se a pessoa pedir ajuda para montar uma dieta e **ainda não tiver dito quais alimentos tem em casa**, faça uma recepção calorosa citando a meta dela (**${targets.scenarios.manutencao.kcal} kcal** e **${targets.scenarios.manutencao.protein}g de proteína**) e faça **3 perguntas curtas** sobre quais proteínas/frios tem em casa, quais bases gosta (arroz, feijão, pão, cuscuz, tapioca, aveia, etc.) e se pratica algum esporte/qual o objetivo.
  2. Se a pessoa **JÁ informou os alimentos que tem em casa**, monte IMEDIATAMENTE um **Plano Alimentar Completo do Dia** (Café da Manhã, Almoço, Lanche da Tarde e Jantar) com medidas caseiras, kcal/proteínas por refeição, substituições e Resumo Total do Dia.`;
}

async function callGeminiFastRace({ apiKey, systemInstruction, contents }) {
  const payload = JSON.stringify({
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 1800,
      thinkingConfig: { thinkingLevel: 'MINIMAL' },
    },
  });

  const attemptBatch = async (models) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    try {
      return await Promise.any(
        models.map(async (model) => {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
          if (!text) throw new Error('Empty');
          controller.abort();
          return { answer: text, model };
        })
      );
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    return await attemptBatch(GEMINI_RACE_MODELS);
  } catch {
    await new Promise((r) => setTimeout(r, 350));
    return await attemptBatch(GEMINI_RACE_MODELS);
  }
}

const haversineMeters = (lat1, lon1, lat2, lon2) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const searchNominatim = async (term, box) => {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=15&bounded=1&viewbox=${box}&q=${encodeURIComponent(term)}`;
    const r = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
    return r.ok ? await r.json() : [];
  } catch {
    return [];
  }
};

export async function handleLocalApi(path, options = {}, token) {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};
  const err = (msg, status = 400) => {
    const e = new Error(msg);
    e.status = status;
    throw e;
  };

  if (path === '/foods' && method === 'GET') {
    return { meta: FOODS_META, foods: FOODS };
  }

  if (path === '/auth/check-email' && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) err('Digite um e-mail válido.', 400);
    const users = readStore(DB_USERS_KEY, []);
    if (users.some((u) => u.email.toLowerCase() === email)) {
      err('Este e-mail já possui uma conta. Entre ou use outro e-mail.', 409);
    }
    return { available: true };
  }

  if (path === '/auth/register' && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const users = readStore(DB_USERS_KEY, []);
    if (users.some((u) => u.email.toLowerCase() === email)) {
      err('Este e-mail já possui uma conta.', 409);
    }
    const weight = toNumber(body.weight);
    const height = normalizeHeight(body.height);
    if (!Number.isFinite(height) || height < 0.8 || height > 2.5) {
      err('Altura inválida. Digite em centímetros (ex.: 170) ou em metros (ex.: 1,70).', 400);
    }
    if (!Number.isFinite(weight) || weight < 25 || weight > 350) {
      err('Revise os dados do cadastro.', 400);
    }
    const newUser = {
      id: Date.now(),
      name: String(body.name || '').trim(),
      email,
      password: String(body.password || ''),
      age: Number(body.age),
      sex: body.sex || 'nao_informar',
      weight,
      height,
      activity: body.activity || 'leve',
      created_at: new Date().toISOString(),
    };
    users.push(newUser);
    writeStore(DB_USERS_KEY, users);

    const calcResult = calculate({ weight, height, activity: newUser.activity }, newUser);
    const savedCalc = {
      id: Date.now() + 1,
      user_id: newUser.id,
      weight,
      height,
      activity: newUser.activity,
      bmi: calcResult.bmi,
      calories: calcResult.calories,
      protein: calcResult.protein,
      carbs: calcResult.carbs,
      fats: calcResult.fats,
      source: 'cadastro',
      created_at: new Date().toISOString(),
      ...calcResult,
    };
    const calcs = readStore(DB_CALCS_KEY, []);
    calcs.unshift(savedCalc);
    writeStore(DB_CALCS_KEY, calcs);

    return {
      token: encodeToken(newUser),
      user: publicUser(newUser),
      initialCalculation: savedCalc,
    };
  }

  if (path === '/auth/login' && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const users = readStore(DB_USERS_KEY, []);
    const user = users.find((u) => u.email.toLowerCase() === email);
    if (!user || user.password !== password) {
      err('E-mail ou senha incorretos.', 401);
    }
    return { token: encodeToken(user), user: publicUser(user) };
  }

  if (path === '/auth/forgot-check' && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const users = readStore(DB_USERS_KEY, []);
    const user = users.find((u) => u.email.toLowerCase() === email);
    if (!user) err('Não encontramos uma conta cadastrada com este e-mail.', 404);
    return { ok: true, name: user.name.split(' ')[0] };
  }

  if (path === '/auth/reset-password' && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (password.length < 6) err('A nova senha precisa ter pelo menos 6 caracteres.', 400);
    const users = readStore(DB_USERS_KEY, []);
    const idx = users.findIndex((u) => u.email.toLowerCase() === email);
    if (idx === -1) err('Conta não encontrada.', 404);
    users[idx].password = password;
    writeStore(DB_USERS_KEY, users);
    return { ok: true, message: 'Senha redefinida com sucesso!' };
  }

  if (path === '/me' && method === 'GET') {
    const user = resolveLocalUser(token);
    if (!user) err('Sua sessão expirou. Entre novamente.', 401);
    return { user: publicUser(user) };
  }

  if (path === '/calculations' && method === 'GET') {
    const user = resolveLocalUser(token);
    if (!user) err('Sua sessão expirou. Entre novamente.', 401);
    const calcs = readStore(DB_CALCS_KEY, [])
      .filter((c) => c.user_id === user.id)
      .map((c) => ({ ...c, ...bmiClassification(c.bmi, user.age) }));
    return { calculations: calcs };
  }

  if (path === '/calculations' && method === 'POST') {
    const user = resolveLocalUser(token);
    if (!user) err('Sua sessão expirou. Entre novamente.', 401);
    const weight = toNumber(body.weight);
    const height = normalizeHeight(body.height);
    const activity = body.activity || user.activity || 'leve';
    if (!Number.isFinite(height) || height < 0.8 || height > 2.5) {
      err('Altura inválida. Digite em centímetros (ex.: 170) ou em metros (ex.: 1,70).', 400);
    }
    const result = calculate({ weight, height, activity }, user);
    const saved = {
      id: Date.now(),
      user_id: user.id,
      weight,
      height,
      activity,
      bmi: result.bmi,
      calories: result.calories,
      protein: result.protein,
      carbs: result.carbs,
      fats: result.fats,
      source: 'manual',
      created_at: new Date().toISOString(),
      ...result,
    };
    const calcs = readStore(DB_CALCS_KEY, []);
    calcs.unshift(saved);
    writeStore(DB_CALCS_KEY, calcs);

    const users = readStore(DB_USERS_KEY, []);
    const uIdx = users.findIndex((u) => u.id === user.id);
    if (uIdx !== -1) {
      users[uIdx] = { ...users[uIdx], weight, height, activity };
      writeStore(DB_USERS_KEY, users);
    }
    return saved;
  }

  if (path.startsWith('/ubs') && method === 'GET') {
    const q = new URLSearchParams(path.split('?')[1] || '');
    const lat = Number(q.get('lat')), lon = Number(q.get('lon'));
    const d = 0.055;
    const box = [lon - d, lat + d, lon + d, lat - d].join(',');
    let items = await searchNominatim('UBS', box);
    if (items.length < 3) items = [...items, ...(await searchNominatim('Posto de Saúde', box))];
    if (items.length === 0) items = await searchNominatim('Hospital', box);
    const seen = new Set();
    const units = items.map((el) => {
      const uLat = Number(el.lat), uLon = Number(el.lon);
      const addr = el.address || {};
      const rawName = (el.name || el.display_name?.split(',')[0] || '').trim();
      if (!rawName || !Number.isFinite(uLat) || !Number.isFinite(uLon)) return null;
      const key = rawName.toLowerCase();
      if (seen.has(key)) return null;
      seen.add(key);
      const street = [addr.road || addr.pedestrian, addr.house_number].filter(Boolean).join(', ');
      const suburb = addr.suburb || addr.neighbourhood || addr.city_district || addr.city || addr.town || '';
      const address = [street, suburb].filter(Boolean).join(' · ') || el.display_name?.split(',').slice(1, 3).join(' · ').trim() || 'Toque em Rota para abrir no mapa';
      const distance = haversineMeters(lat, lon, uLat, uLon);
      return { id: String(el.place_id), name: rawName, address, lat: uLat, lon: uLon, distance };
    }).filter(Boolean).sort((a, b) => a.distance - b.distance).slice(0, 8);
    return { units };
  }

  if (path === '/chat/history' && method === 'GET') {
    const user = resolveLocalUser(token);
    const all = readStore(DB_CHAT_KEY, {});
    return { messages: (user && all[user.id]) || [] };
  }

  if (path === '/chat/history' && method === 'DELETE') {
    const user = resolveLocalUser(token);
    if (user) {
      const all = readStore(DB_CHAT_KEY, {});
      delete all[user.id];
      writeStore(DB_CHAT_KEY, all);
    }
    return { ok: true };
  }

  if (path === '/chat' && method === 'POST') {
    const user = resolveLocalUser(token);
    if (!user) err('Sua sessão expirou. Entre novamente.', 401);
    const message = String(body.message || '').trim();
    if (!message) err('Escreva sua pergunta.', 400);
    const mode = body.mode === 'nutrition' ? 'nutrition' : 'health';
    const calcs = readStore(DB_CALCS_KEY, [])
      .filter((c) => c.user_id === user.id)
      .map((c) => ({ ...c, ...bmiClassification(c.bmi, user.age) }));
    const allChats = readStore(DB_CHAT_KEY, {});
    const savedHistory = (allChats[user.id] || []).slice(-12).map((m) => ({ role: m.role, content: m.text }));

    const systemInstruction = buildHolisticSystemPrompt({
      user,
      calculations: calcs,
      mode,
      message,
      history: savedHistory,
    });

    const contents = [];
    for (const h of savedHistory.slice(-10)) {
      const role = h.role === 'assistant' || h.role === 'model' ? 'model' : 'user';
      const text = String(h.content || '').trim();
      if (!text) continue;
      if (contents.length > 0 && contents[contents.length - 1].role === role) {
        contents[contents.length - 1].parts[0].text += `\n\n${text}`;
      } else {
        contents.push({ role, parts: [{ text }] });
      }
    }
    while (contents.length > 0 && contents[0].role !== 'user') contents.shift();
    if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
      contents[contents.length - 1].parts[0].text += `\n\n${message}`;
    } else {
      contents.push({ role: 'user', parts: [{ text: message }] });
    }

    const { answer, model } = await callGeminiFastRace({
      apiKey: resolveClientGeminiKey(),
      systemInstruction,
      contents,
    });

    const userMsgs = allChats[user.id] || [];
    userMsgs.push({ id: Date.now(), role: 'user', text: message, created_at: new Date().toISOString() });
    userMsgs.push({ id: Date.now() + 1, role: 'assistant', text: answer, created_at: new Date().toISOString() });
    allChats[user.id] = userMsgs;
    writeStore(DB_CHAT_KEY, allChats);

    return { answer, model, toolsUsed: ['precompute_clinical_targets', 'precompute_taco_foods'] };
  }

  return {};
}
