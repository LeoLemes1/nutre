import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(path.join(__dirname, '..', 'data', 'nutre.db'));
const app = express();
const PORT = Number(process.env.PORT || 3333);
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) throw new Error('JWT_SECRET é obrigatório em produção.');
const jwtSecret = process.env.JWT_SECRET || 'desenvolvimento-apenas-troque-em-producao';
const tokenFile = path.join(__dirname, '..', '..', 'token.txt');
const openaiKey = process.env.OPENAI_API_KEY || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8').trim() : '');

db.exec('PRAGMA journal_mode = WAL;');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, age INTEGER, sex TEXT, weight REAL, height REAL,
    activity TEXT DEFAULT 'leve', created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS calculations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, weight REAL NOT NULL,
    height REAL NOT NULL, activity TEXT NOT NULL, bmi REAL NOT NULL, calories INTEGER NOT NULL,
    protein INTEGER NOT NULL, carbs INTEGER NOT NULL, fats INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

// Migração: identifica se o cálculo foi gerado automaticamente no cadastro ou feito pelo usuário.
const calcColumns = db.prepare('PRAGMA table_info(calculations)').all().map((c) => c.name);
if (!calcColumns.includes('source')) {
  db.exec("ALTER TABLE calculations ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
  db.exec(`UPDATE calculations SET source='cadastro' WHERE id IN (
    SELECT c.id FROM calculations c JOIN users u ON u.id=c.user_id
    WHERE c.id=(SELECT MIN(id) FROM calculations WHERE user_id=c.user_id)
      AND abs(strftime('%s',c.created_at)-strftime('%s',u.created_at))<=5)`);
}

app.use(cors()); app.use(express.json({ limit: '1mb' }));
const sign = (user) => jwt.sign({ sub: user.id, name: user.name }, jwtSecret, { expiresIn: '14d' });
const auth = (req, res, next) => { try { req.userId = Number(jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), jwtSecret).sub); next(); } catch { res.status(401).json({ error: 'Sua sessão expirou. Entre novamente.' }); } };
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, age: u.age, sex: u.sex, weight: u.weight, height: u.height, activity: u.activity });
const toNumber = (value) => Number(String(value ?? '').trim().replace(',', '.').replace(/[^\d.]/g, ''));
// Aceita "170", "170 cm", "1,70" e "1.70" e sempre devolve em metros.
const normalizeHeight = (value) => {
  const height = toNumber(value);
  if (!Number.isFinite(height) || height === 0) return NaN;
  return height > 3 ? +(height / 100).toFixed(2) : height;
};

// Pontos de corte do IMC:
// - Adultos (20 a 59 anos): OMS (1995/2000), adotados pelo Ministério da Saúde/SISVAN.
// - Pessoas idosas (60 anos ou mais): Lipschitz (1994), adotados pelo SISVAN.
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
function bmiClassification(bmi, age) {
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

const registerSchema = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(6), age: z.coerce.number().int().min(12).max(120), sex: z.enum(['feminino', 'masculino', 'nao_informar']), weight: z.coerce.number().min(25).max(350), height: z.coerce.number().min(.8).max(2.5), activity: z.enum(['sedentario', 'leve', 'moderado', 'intenso']) });
const insertCalculation = (userId, v, result, source) => db.prepare('INSERT INTO calculations(user_id,weight,height,activity,bmi,calories,protein,carbs,fats,source) VALUES(?,?,?,?,?,?,?,?,?,?)').run(userId, v.weight, v.height, v.activity, result.bmi, result.calories, result.protein, result.carbs, result.fats, source);
// Validação antecipada do e-mail (passo 1 do cadastro).
app.post('/api/auth/check-email', (req, res) => {
  const parsed = z.string().trim().email().safeParse(req.body.email);
  if (!parsed.success) return res.status(400).json({ error: 'Digite um e-mail válido.' });
  if (db.prepare('SELECT id FROM users WHERE email=?').get(parsed.data.toLowerCase())) return res.status(409).json({ error: 'Este e-mail já possui uma conta. Entre ou use outro e-mail.' });
  res.json({ available: true });
});
app.post('/api/auth/register', async (req, res) => {
  const parsed = registerSchema.safeParse({ ...req.body, weight: toNumber(req.body.weight), height: normalizeHeight(req.body.height) }); if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors.height ? 'Altura inválida. Digite em centímetros (ex.: 170) ou em metros (ex.: 1,70).' : 'Revise os dados do cadastro.', fields: parsed.error.flatten().fieldErrors });
  const v = parsed.data; if (db.prepare('SELECT id FROM users WHERE email=?').get(v.email.toLowerCase())) return res.status(409).json({ error: 'Este e-mail já possui uma conta.' });
  const hash = await bcrypt.hash(v.password, 12);
  const info = db.prepare('INSERT INTO users(name,email,password_hash,age,sex,weight,height,activity) VALUES(?,?,?,?,?,?,?,?)').run(v.name, v.email.toLowerCase(), hash, v.age, v.sex, v.weight, v.height, v.activity);
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
  // Já usamos os dados do cadastro para gerar o primeiro resultado do usuário.
  const initialCalculation = calculate(v, user);
  const calculation = insertCalculation(user.id, v, initialCalculation, 'cadastro');
  const saved = db.prepare('SELECT * FROM calculations WHERE id=?').get(calculation.lastInsertRowid);
  res.status(201).json({ token: sign(user), user: publicUser(user), initialCalculation: { ...saved, ...initialCalculation } });
});
app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body.email || '').toLowerCase(); const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password_hash))) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  res.json({ token: sign(user), user: publicUser(user) });
});
app.get('/api/me', auth, (req, res) => { const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.userId); if (!user) return res.status(401).json({ error: 'Sua sessão expirou. Entre novamente.' }); res.json({ user: publicUser(user) }); });

function calculate(v, user) {
  const bmi = +(v.weight / (v.height * v.height)).toFixed(1);
  const maleBase = 88.36 + 13.4*v.weight + 4.8*(v.height*100) - 5.7*user.age;
  const femaleBase = 447.6 + 9.2*v.weight + 3.1*(v.height*100) - 4.3*user.age;
  const base = user.sex === 'masculino' ? maleBase : user.sex === 'feminino' ? femaleBase : (maleBase + femaleBase) / 2;
  const factor = { sedentario: 1.2, leve: 1.375, moderado: 1.55, intenso: 1.725 }[v.activity] || 1.375;
  const calories = Math.round(base * factor), protein = Math.round((calories * .20) / 4), carbs = Math.round((calories * .50) / 4), fats = Math.round((calories * .30) / 9);
  return { bmi, calories, protein, carbs, fats, ...bmiClassification(bmi, user.age) };
}
const calcSchema = z.object({ weight: z.coerce.number().min(25).max(350), height: z.coerce.number().min(.8).max(2.5), activity: z.enum(['sedentario', 'leve', 'moderado', 'intenso']) });
app.post('/api/calculations', auth, (req, res) => {
  const parsed = calcSchema.safeParse({ ...req.body, weight: toNumber(req.body.weight), height: normalizeHeight(req.body.height) }); if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors.height ? 'Altura inválida. Digite em centímetros (ex.: 170) ou em metros (ex.: 1,70).' : 'Confira peso, altura e atividade.' });
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.userId); if (!user) return res.status(401).json({ error: 'Sua sessão expirou. Entre novamente.' }); const v = parsed.data; const result = calculate(v, user);
  const row = insertCalculation(req.userId, v, result, 'manual');
  db.prepare('UPDATE users SET weight=?, height=?, activity=? WHERE id=?').run(v.weight,v.height,v.activity,req.userId);
  const saved = db.prepare('SELECT * FROM calculations WHERE id=?').get(row.lastInsertRowid);
  res.status(201).json({ ...saved, ...result });
});
app.get('/api/calculations', auth, (req, res) => {
  const user = db.prepare('SELECT age FROM users WHERE id=?').get(req.userId); if (!user) return res.status(401).json({ error: 'Sua sessão expirou. Entre novamente.' });
  const calculations = db.prepare('SELECT * FROM calculations WHERE user_id=? ORDER BY id DESC').all(req.userId).map((calculation) => ({ ...calculation, ...bmiClassification(calculation.bmi, user.age) }));
  res.json({ calculations });
});

// Busca UBS e postos de saúde próximos usando OpenStreetMap Nominatim (rápido e sem chave de API).
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
    const r = await fetch(url, { headers: { 'User-Agent': 'NutreApp/1.0 (https://nutre.local)', 'Accept-Language': 'pt-BR' }, signal: AbortSignal.timeout(7000) });
    return r.ok ? await r.json() : [];
  } catch { return []; }
};
app.get('/api/ubs', auth, async (req, res) => {
  const lat = Number(req.query.lat), lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return res.status(400).json({ error: 'Localização inválida.' });
  }
  const d = 0.055; // ~6 km ao redor do usuário
  const box = [lon - d, lat + d, lon + d, lat - d].join(',');
  let items = await searchNominatim('UBS', box);
  if (items.length < 3) {
    const extra = await searchNominatim('Posto de Saúde', box);
    items = [...items, ...extra];
  }
  if (items.length === 0) {
    items = await searchNominatim('Hospital', box);
  }
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
  res.json({ units });
});

app.post('/api/chat', auth, async (req, res) => {
  const message = String(req.body.message || '').trim(); if (!message) return res.status(400).json({ error: 'Escreva sua pergunta.' });
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.userId); const latest = db.prepare('SELECT * FROM calculations WHERE user_id=? ORDER BY id DESC LIMIT 1').get(req.userId);
  const context = latest ? `Último cálculo: IMC ${latest.bmi}, ${latest.calories} kcal, proteínas ${latest.protein}g, carboidratos ${latest.carbs}g, gorduras ${latest.fats}g.` : 'Ainda não há cálculo.';
  const system = `Você é o Guia Nutrê, um assistente nutricional brasileiro acolhedor. Use linguagem simples, frases curtas e sem diagnóstico. ${context} Oriente hábitos e sugira procurar UBS/nutricionista em riscos, sintomas ou condições clínicas. Não prescreva dieta, medicamentos nem substitua atendimento.`;
  if (!openaiKey) return res.json({ answer: 'Posso ajudar com informações gerais. Para responder com a IA, configure OPENAI_API_KEY no ambiente do servidor.' });
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', temperature: .35, max_tokens: 350, messages: [{ role: 'system', content: system }, { role: 'user', content: message }] }) });
    if (!response.ok) throw new Error('IA indisponível'); const data = await response.json(); res.json({ answer: data.choices?.[0]?.message?.content || 'Não consegui responder agora.' });
  } catch { res.json({ answer: `Entendi sua dúvida sobre “${message}”. Neste momento não consegui acessar o guia de IA. Tente novamente em instantes.` }); }
});

const dist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(dist)) { app.use(express.static(dist)); app.get('*', (_,res) => res.sendFile(path.join(dist,'index.html'))); }
app.listen(PORT, () => console.log(`Nutrê API pronta em http://localhost:${PORT}`));
