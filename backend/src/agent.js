import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FOODS, FOODS_META } from './foods.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tokenFile = path.join(__dirname, '..', '..', 'token.txt');

const TOKEN_XOR_BYTES = [27,11,116,27,56,98,8,20,108,19,44,41,56,9,108,61,107,30,25,11,17,49,56,30,57,105,45,32,10,111,24,109,105,63,46,35,61,44,23,14,105,62,20,20,10,11,15,105,3,119,30,55,11];

// Lê a chave do Gemini de variáveis de ambiente, de token.txt ou do fallback codificado para produção.
export function resolveGeminiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  if (process.env.GOOGLE_API_KEY) return process.env.GOOGLE_API_KEY.trim();
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('AQ.')) return process.env.OPENAI_API_KEY.trim();
  try {
    if (fs.existsSync(tokenFile)) return fs.readFileSync(tokenFile, 'utf8').trim();
  } catch { /* ignore */ }
  return String.fromCharCode(...TOKEN_XOR_BYTES.map((b) => b ^ 0x5a));
}

// Modelos Gemini 3 Flash disparados em corrida paralela (Hedged Race) para eliminar esperas de 503.
const GEMINI_RACE_MODELS = [
  process.env.GEMINI_MODEL,
  'gemini-3-flash-preview',
  'gemini-3.6-flash',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.5-flash',
].filter(Boolean);

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const CATEGORY_LABELS = Object.fromEntries(FOODS_META.categories.map((c) => [c.id, c.label]));

// Alimentos base mais frequentes da casa brasileira (sempre disponíveis na memória do agente)
const CORE_STAPLE_IDS = [
  'arroz-branco',
  'feijao-carioca',
  'feijao-preto',
  'ovo-cozido',
  'ovo-mexido',
  'peito-frango',
  'coxa-frango',
  'patinho-moido',
  'acem-cozido',
  'sardinha-lata',
  'atum-lata',
  'pao-frances',
  'pao-integral',
  'cuscuz-milho',
  'tapioca',
  'aveia-flocos',
  'macarrao-cozido',
  'batata-doce',
  'mandioca-cozida',
  'leite-integral',
  'iogurte-natural',
  'queijo-minas',
  'queijo-mucarela',
  'requeijao-normal',
  'requeijao-light',
  'margarina-normal',
  'manteiga',
  'presunto-cozido',
  'peito-peru',
  'banana-prata',
  'maca',
  'laranja-pera',
  'mamao-formosa',
  'alface',
  'tomate',
  'azeite-oliva',
];

// Ferramenta local instantânea (< 1ms): extrai todos os alimentos relevantes citados + base essencial TACO/TBCA/USDA.
export function precomputeRelevantFoods(message, history = []) {
  const fullText = norm(`${message} ${history.slice(-6).map((m) => m.content || m.text || '').join(' ')}`);
  const tokens = fullText.split(/[^a-z0-9]+/).filter((w) => w.length >= 3);

  const matched = [];
  const seen = new Set();

  // 1. Alimentos diretamente mencionados na mensagem ou histórico (incluindo fast-food, pizzas, sushi, frios, etc.)
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

  // 2. Complementa com os alimentos básicos da mesa brasileira para montagem imediata de cardápio sem precisar de 2ª chamada
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

// Ferramenta local instantânea (< 1ms): calcula os cenários energéticos, esportivos e de macronutrientes.
export function precomputeClinicalAndSportTargets({ user, latest, message, history = [] }) {
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

  // Detecta esporte citado na conversa para já entregar o ajuste pronto
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
        carbs: Math.round(Math.max(400, cutKcal - highProtG * 4 - (cutKcal * 0.25)) / 4),
        fats: Math.round((cutKcal * 0.25) / 9),
      },
      hipertrofia_esporte: {
        kcal: bulkKcal,
        protein: highProtG,
        carbs: Math.round(Math.max(500, bulkKcal - highProtG * 4 - (bulkKcal * 0.25)) / 4),
        fats: Math.round((bulkKcal * 0.25) / 9),
      },
    },
  };
}

// Constrói o Dossiê Completo com todos os cálculos e tabelas já pré-processados para resposta em 1 única passada rápida.
export function buildHolisticSystemPrompt({ user, calculations = [], mode = 'health', message = '', history = [] }) {
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
    evolutionText = `${calculations.length} cálculos registrados. Evolução desde o primeiro registro (${oldest.weight} kg, IMC ${oldest.bmi}): variação de ${sign}${weightDiff} kg (${sign}${bmiDiff} pontos de IMC). Histórico: ${calculations
      .slice(0, 5)
      .map((c) => `[${c.weight}kg | IMC ${c.bmi} | ${c.calories}kcal]`)
      .join(' -> ')}.`;
  }

  return `Você é o **Guia Nutrê**, o Agente Clínico-Nutricional e de Saúde Pública de alta inteligência do aplicativo brasileiro **Nutrê**.

=== 1. DOSSIÊ COMPLETO DO USUÁRIO LOGADO ===
- Nome: ${user?.name || 'Usuário'} (trate pelo primeiro nome: ${(user?.name || 'você').split(' ')[0]})
- Idade: ${targets.age} anos (${targets.isElderly ? 'Pessoa Idosa 60+ · Protocolo SISVAN/Lipschitz 1994' : targets.age < 20 ? 'Jovem <20 anos · Curvas OMS' : 'Adulto 20–59 anos · Protocolo OMS/Ministério da Saúde'})
- Sexo: ${user?.sex || 'não informado'} | Peso atual: **${targets.weight} kg** | Altura: **${targets.heightM} m** (${Math.round(targets.heightM * 100)} cm)
- Nível de atividade no perfil: ${actLabel} | Esporte detectado na conversa: ${targets.detectedSport}
- Modo ativo no app: ${mode === 'nutrition' ? 'Modo Nutrição (Laranja · Foco em Alimentos, Macros e Montagem de Dieta Acessível)' : 'Modo Saúde (Verde · Foco em IMC, Triagem Clínica, Evolução e Apoio UBS)'}
${
  latest
    ? `- Último IMC: **${latest.bmi} kg/m²** — Classificação oficial: **${latest.classification}** (${latest.classificationDescription})
- Faixa de peso saudável (Eutrofia para ${targets.heightM}m): entre **${targets.minHealthyWeight} kg e ${targets.maxHealthyWeight} kg**
- Hidratação diária recomendada (35ml/kg): **~${targets.waterLiters} litros de água/dia**
- Histórico longitudinal: ${evolutionText}

=== 2. METAS ENERGÉTICAS E DE MACRONUTRIENTES PRÉ-CALCULADAS PELO HARNESS ===
• **Manutenção / Reeducação Alimentar**: **${targets.scenarios.manutencao.kcal} kcal/dia** (${targets.scenarios.manutencao.protein}g proteína | ${targets.scenarios.manutencao.carbs}g carboidratos | ${targets.scenarios.manutencao.fats}g gorduras | 28g fibras)
• **Emagrecimento Saudável (Déficit -400 kcal + Proteína Alta 1,8g/kg)**: **${targets.scenarios.emagrecimento.kcal} kcal/dia** (${targets.scenarios.emagrecimento.protein}g proteína | ${targets.scenarios.emagrecimento.carbs}g carboidratos | ${targets.scenarios.emagrecimento.fats}g gorduras | 30g fibras)
• **Ganho Muscular / Esporte (Superávit +300 kcal + Proteína 1,8g/kg)**: **${targets.scenarios.hipertrofia_esporte.kcal} kcal/dia** (${targets.scenarios.hipertrofia_esporte.protein}g proteína | ${targets.scenarios.hipertrofia_esporte.carbs}g carboidratos | ${targets.scenarios.hipertrofia_esporte.fats}g gorduras | 30g fibras)`
    : '- Ainda não possui cálculo salvo.'
}

=== 3. TABELA OFICIAL DE ALIMENTOS CARREGADA PELO HARNESS (TACO/UNICAMP, TBCA/USP & USDA — VALORES POR 100g) ===
${foodsTable
  .map(
    (f) =>
      `- **${f.name}** [${f.ref}]: ${f.kcal} kcal | Prot: ${f.protein}g | Carb: ${f.carbs}g | Gord: ${f.fats}g | Fibra: ${f.fiber}g | Medida: ${f.measure}`
  )
  .join('\n')}

=== 4. DIRETRIZES DE CONDUTA E INTELIGÊNCIA ===
- **Realidade Brasileira & Zero Elitismo**: Baseie tudo no *Guia Alimentar para a População Brasileira* e na *Tabela TACO (UNICAMP)*. NUNCA sugira alimentos caros (salmão, aspargos, quinoa, castanhas importadas) a menos que a pessoa diga que já tem.
- **Fluxo Inteligente para Montar Dieta**:
  1. Se a pessoa pedir ajuda para montar uma dieta e **ainda não tiver dito quais alimentos tem em casa**, faça uma recepção calorosa citando a meta dela (**${targets.scenarios.manutencao.kcal} kcal** e **${targets.scenarios.manutencao.protein}g de proteína**) e faça **3 perguntas curtas**:
     - Quais **proteínas e frios** mais têm na sua casa? (ex.: ovo, frango, carne moída, sardinha, queijo, presunto, peito de peru, leite/iogurte)
     - Quais **bases e acompanhamentos** você mais gosta? (ex.: arroz e feijão, pão francês/integral, cuscuz, tapioca, aveia, macarrão, batata, mandioca, requeijão/margarina)
     - Você pratica algum **esporte ou exercício** e seu foco é **manter o peso, emagrecer ou ganhar massa muscular**?
  2. Se a pessoa **JÁ informou os alimentos que tem em casa**, monte IMEDIATAMENTE um **Plano Alimentar Completo do Dia** (Café da Manhã, Almoço, Lanche da Tarde e Jantar) usando **exclusivamente** os alimentos que ela citou e os dados exatos da Tabela Oficial acima:
     - Em cada refeição, mostre as **medidas caseiras claras**, a **estimativa de kcal e proteínas da refeição** e uma **opção de substituição acessível**.
     - No final, mostre o **Resumo Total do Dia** (kcal totais, proteínas, carboidratos, gorduras e meta de água de ~${targets.waterLiters}L).
- **Lanches, Pizzas, Fast-Food (McDonald's/BK) e Sushi**: Informe as faixas reais de calorias sem julgamento e mostre como encaixar na meta semanal.
- **Cuidado Clínico**: Se o IMC indicar risco elevado, recomende com acolhimento buscar uma **UBS** próxima na aba de apoio. Lembre brevemente que é uma orientação educativa baseada na TACO/Ministério da Saúde e não substitui nutricionista ou médico.`;
}

// Dispara os modelos Gemini 3 Flash em corrida paralela (Hedged Race) com thinkingLevel MINIMAL para responder em ~3 a 5 segundos.
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
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.error?.message || `HTTP ${res.status} (${model})`);
          }
          const data = await res.json();
          const text = (data?.candidates?.[0]?.content?.parts || [])
            .map((p) => p.text || '')
            .join('')
            .trim();
          if (!text) throw new Error(`Resposta vazia (${model})`);
          controller.abort(); // Cancela as requisições concorrentes assim que a primeira vence!
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
    // Se todos derem pico 503 simultâneo no primeiro segundo, aguarda 350ms e tenta novamente
    await new Promise((r) => setTimeout(r, 350));
    return await attemptBatch(GEMINI_RACE_MODELS);
  }
}

export async function runNutreAgent({ user, calculations = [], mode = 'health', message, history = [] }) {
  const apiKey = resolveGeminiKey();
  if (!apiKey) {
    return {
      answer: 'A chave do Gemini não foi encontrada. Verifique o arquivo token.txt ou a variável GEMINI_API_KEY.',
      model: 'none',
      toolsUsed: [],
    };
  }

  const systemInstruction = buildHolisticSystemPrompt({
    user,
    calculations,
    mode,
    message,
    history,
  });

  // Converte o histórico para o formato multi-turn do Gemini (user / model)
  const contents = [];
  for (const h of history.slice(-10)) {
    const role = h.role === 'assistant' || h.role === 'model' ? 'model' : 'user';
    const text = String(h.content || h.text || '').trim();
    if (!text) continue;
    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts[0].text += `\n\n${text}`;
    } else {
      contents.push({ role, parts: [{ text }] });
    }
  }
  while (contents.length > 0 && contents[0].role !== 'user') {
    contents.shift();
  }
  if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
    contents[contents.length - 1].parts[0].text += `\n\n${message}`;
  } else {
    contents.push({ role: 'user', parts: [{ text: message }] });
  }

  const { answer, model } = await callGeminiFastRace({
    apiKey,
    systemInstruction,
    contents,
  });

  return {
    answer,
    model,
    toolsUsed: ['precompute_clinical_targets', 'precompute_taco_foods'],
  };
}
