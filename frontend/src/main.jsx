import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, AlertTriangle, ArrowLeft, BookOpen, Bot, Calculator, ChevronRight, CircleHelp, ExternalLink, Eye, EyeOff, Flame, HeartPulse, History, House, LocateFixed, LogOut, MapPin, Navigation, Send, ShieldCheck, Sparkles, UserRound, Utensils } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import './register.css';
import './ios.css';

const api = async (path, options = {}, token) => {
  const res = await fetch(`/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(data.error || 'Não foi possível concluir agora.'); err.status = res.status; throw err; }
  return data;
};

// O Safari (iOS) não entende "2026-10-19 21:00:00"; convertemos para ISO ("2026-10-19T21:00:00Z").
const parseDate = (v) => { if (!v) return null; const iso = String(v).trim().replace(' ', 'T'); const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`); return Number.isNaN(d.getTime()) ? null : d; };
const formatDate = (v) => { const d = parseDate(v); return d ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(d) : ''; };
// Aceita vírgula ou ponto (teclados pt-BR no iOS/Android usam vírgula).
const parseDecimal = (v) => { const s = String(v ?? '').trim().replace(/\s|cm|kg|m$/gi, '').replace(',', '.'); if (!s) return NaN; const n = Number(s); return Number.isFinite(n) ? n : NaN; };
// Altura em centímetros, seja digitada como "170", "1,70" ou "1.70".
const parseHeightCm = (v) => { const n = parseDecimal(v); if (!n) return NaN; return n <= 3 ? Math.round(n * 100) : Math.round(n); };
const validHeight = (v) => { const cm = parseHeightCm(v); return cm >= 80 && cm <= 250; };
const validWeight = (v) => { const kg = parseDecimal(v); return kg >= 25 && kg <= 350; };
const decimalBR = (n) => (n === null || n === undefined || n === '' ? '' : String(n).replace('.', ','));
const bmiBR = (n) => Number(n).toFixed(1).replace('.', ',');
const toneOf = (item) => item?.tone || (item?.risk ? 'risk' : 'good');

const storage = {
  get(key, fallback = null) { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* modo privado */ } },
  remove(...keys) { keys.forEach((k) => { try { localStorage.removeItem(k); } catch { /* modo privado */ } }); },
};

// Rotas: a página fica na URL (#/calculator), então o refresh mantém a tela e o "voltar" do Android funciona.
const PUBLIC_PAGES = ['landing', 'register', 'login', 'about'];
const PRIVATE_PAGES = ['home', 'calculator', 'result', 'chat', 'history', 'support', 'profile'];
const readHash = () => window.location.hash.replace(/^#\/?/, '').split('?')[0];
const resolvePage = (wanted, isAuth) => {
  if (isAuth) return PRIVATE_PAGES.includes(wanted) ? wanted : 'home';
  return PUBLIC_PAGES.includes(wanted) ? wanted : PRIVATE_PAGES.includes(wanted) ? 'login' : 'landing';
};

function Field({ label, error, children, hint }) { return <label className={`field ${error ? 'has-error' : ''}`}><span>{label}</span>{children}{error ? <small role="alert" aria-live="polite">{error}</small> : hint ? <small>{hint}</small> : null}</label>; }
function Button({ children, variant = 'primary', loading, ...props }) { return <button className={`button ${variant}`} disabled={loading || props.disabled} {...props}>{loading ? <span className="spinner" /> : children}</button>; }
// Campo de senha com ícone de olho para mostrar/ocultar.
function PasswordInput({ value, onChange, autoComplete = 'current-password', placeholder = '••••••••', ...props }) {
  const [visible, setVisible] = useState(false);
  return <div className="password-wrap"><input {...props} type={visible ? 'text' : 'password'} className={visible ? '' : 'masked'} autoComplete={autoComplete} autoCapitalize="none" autoCorrect="off" spellCheck="false" value={value} onChange={onChange} placeholder={placeholder} /><button type="button" className="eye-button" onClick={(e) => { e.preventDefault(); setVisible((v) => !v); }} aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={visible}>{visible ? <EyeOff size={20} /> : <Eye size={20} />}</button></div>;
}

function Landing({ go }) { return <main className="landing"><div className="landing-mark"><HeartPulse size={22} /><b>Nutrê</b></div><div className="hero-art"><div className="orb orb-a" /><div className="orb orb-b" /><div className="plate"><Utensils size={34} /><span>cuidado que cabe na vida</span></div></div><p className="eyebrow">SAÚDE NUTRICIONAL SIMPLES</p><h1>Entenda sua alimentação, um passo de cada vez.</h1><p className="lead">Calcule seu IMC, conheça suas necessidades e converse com um guia que fala a sua língua.</p><div className="landing-actions"><Button onClick={() => go('register')}>Criar minha conta <ChevronRight size={20} /></Button><Button variant="secondary" onClick={() => go('login')}>Já tenho conta</Button></div><div className="trust"><ShieldCheck size={20} /><span>Gratuito, simples e feito para você.</span></div><button className="text-button" onClick={() => go('about')}>Conheça o projeto</button></main>; }
function About({ go }) { return <main className="auth-page"><button className="back" onClick={() => go('landing')} aria-label="Voltar"><ArrowLeft /></button><p className="eyebrow">SOBRE O NUTRÊ</p><h1>Orientação confiável, sem complicação.</h1><div className="info-card"><HeartPulse /><div><h2>Por que existe?</h2><p>Alimentação e cuidado em saúde precisam ser mais acessíveis. O Nutrê ajuda você a entender seus números e decidir o próximo passo.</p></div></div><div className="info-card"><Bot /><div><h2>IA com responsabilidade</h2><p>O Guia Nutrê traduz dados em linguagem direta. Ele não substitui nutricionista, médico ou atendimento em casos de risco.</p></div></div><Button onClick={() => go('register')}>Começar agora</Button></main>; }

// Rascunho do cadastro guardado na aba (sem a senha) para não perder nada ao atualizar a página.
const REGISTER_DRAFT = 'nutre-register-draft';
const emptyRegister = { name: '', email: '', password: '', age: '', sex: '', weight: '', height: '', activity: 'leve' };
const readDraft = () => { try { return JSON.parse(sessionStorage.getItem(REGISTER_DRAFT)) || null; } catch { return null; } };

const Register = ({ go, onAuth }) => {
  const draft = readDraft();
  const [form, setForm] = useState(() => ({ ...emptyRegister, ...(draft?.form || {}), password: '' }));
  const [step, setStep] = useState(() => draft?.step || 1), [error, setError] = useState(''), [emailError, setEmailError] = useState(''), [loading, setLoading] = useState(false);
  useEffect(() => { try { const { password, ...safe } = form; sessionStorage.setItem(REGISTER_DRAFT, JSON.stringify({ form: safe, step })); } catch { /* ignore */ } }, [form, step]);
  const set = (k) => (e) => { if (k === 'email') setEmailError(''); setForm((f) => ({ ...f, [k]: e.target.value })); };
  const needsPassword = step > 1 && form.password.length < 6;
  const valid = () => step === 1 ? form.name.trim() && /^\S+@\S+\.\S+$/.test(form.email.trim()) && form.password.length >= 6 : step === 2 ? Number(form.age) >= 12 && Number(form.age) <= 120 && form.sex : validWeight(form.weight) && validHeight(form.height);
  const stepError = () => step === 1 && form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim()) ? 'Digite um e-mail válido.' : step === 1 && form.password && form.password.length < 6 ? 'A senha precisa ter pelo menos 6 caracteres.' : step === 3 && !validHeight(form.height) ? 'Altura inválida. Digite em centímetros (ex.: 170) ou em metros (ex.: 1,70).' : step === 3 && !validWeight(form.weight) ? 'Peso inválido. Use um valor entre 25 e 350 kg (ex.: 68,5).' : 'Preencha os campos desta etapa para continuar.';
  // Retorna a mensagem de erro do e-mail, ou '' se estiver disponível.
  const checkEmail = async () => {
    try { await api('/auth/check-email', { method: 'POST', body: JSON.stringify({ email: form.email.trim() }) }); return ''; }
    catch (err) { return err.status === 409 || err.status === 400 ? err.message : ''; }
  };
  const next = async (e) => {
    e.preventDefault();
    if (needsPassword) return setError('Por segurança, digite sua senha novamente.');
    if (!valid()) return setError(stepError());
    if (step === 1) {
      setLoading(true); setError('');
      const msg = await checkEmail();
      setLoading(false);
      if (msg) { setEmailError(msg); return; }
    }
    setError(''); setStep((s) => s + 1); window.scrollTo(0, 0);
  };
  const submit = async (e) => {
    e.preventDefault();
    if (needsPassword) return setError('Por segurança, digite sua senha novamente.');
    if (!valid()) return setError(stepError());
    setError(''); setLoading(true);
    try {
      const d = await api('/auth/register', { method: 'POST', body: JSON.stringify({ ...form, email: form.email.trim(), age: Number(form.age), weight: parseDecimal(form.weight), height: parseHeightCm(form.height) }) });
      try { sessionStorage.removeItem(REGISTER_DRAFT); } catch { /* ignore */ }
      onAuth(d);
    } catch (err) {
      // Se o e-mail foi cadastrado nesse meio-tempo, volta para o passo 1 e mostra no campo.
      if (err.status === 409) { setStep(1); setEmailError(err.message); window.scrollTo(0, 0); } else setError(err.message);
    } finally { setLoading(false); }
  };
  const title = step === 1 ? 'Como podemos te chamar?' : step === 2 ? 'Conte um pouco sobre você.' : 'Vamos completar sua estimativa.';
  return <main className="auth-page"><button className="back" onClick={() => step > 1 ? setStep((s) => s - 1) : go('landing')} aria-label="Voltar"><ArrowLeft /></button><p className="eyebrow">CADASTRO · PASSO {step} DE 3</p><div className="stepper" aria-label={`Passo ${step} de 3`}><i className={step >= 1 ? 'done' : ''} /><i className={step >= 2 ? 'done' : ''} /><i className={step >= 3 ? 'done' : ''} /></div><h1>{title}</h1><p className="subhead">{step === 1 ? 'Esses dados serão usados para entrar na sua conta.' : step === 2 ? 'As informações ajudam a personalizar os cálculos.' : 'Com esses dados já calculamos seu primeiro IMC.'}</p>
    <form onSubmit={step === 3 ? submit : next} className="form-grid" noValidate>
      {needsPassword && <Field label="Confirme sua senha" hint="Por segurança, a senha não fica salva ao atualizar a página."><PasswordInput autoComplete="new-password" value={form.password} onChange={set('password')} /></Field>}
      {step === 1 && <><Field label="Seu nome"><input required autoComplete="name" value={form.name} onChange={set('name')} placeholder="Como quer ser chamado?" /></Field><Field label="E-mail" error={emailError}><input required autoComplete="email" autoCapitalize="none" spellCheck="false" type="email" inputMode="email" value={form.email} onChange={set('email')} placeholder="nome@exemplo.com" aria-invalid={!!emailError} /></Field>{emailError && emailError.includes('já possui') && <button type="button" className="inline-link" onClick={() => { try { sessionStorage.setItem('nutre-login-email', form.email.trim()); } catch { /* ignore */ } go('login'); }}>Já é você? Entrar com este e-mail</button>}<Field label="Crie uma senha" hint="Pelo menos 6 caracteres"><PasswordInput required autoComplete="new-password" minLength="6" value={form.password} onChange={set('password')} /></Field></>}
      {step === 2 && <><Field label="Idade"><input required type="text" inputMode="numeric" pattern="[0-9]*" maxLength={3} value={form.age} onChange={(e) => setForm((f) => ({ ...f, age: e.target.value.replace(/\D/g, '') }))} placeholder="Ex.: 42" /></Field><Field label="Sexo"><select required value={form.sex} onChange={set('sex')}><option value="" disabled>Selecione uma opção</option><option value="masculino">Homem</option><option value="feminino">Mulher</option><option value="nao_informar">Não desejo informar</option></select></Field></>}
      {step === 3 && <><div className="split"><Field label="Peso (kg)" hint="Ex.: 68 ou 68,5"><input required type="text" inputMode="decimal" autoComplete="off" value={form.weight} onChange={set('weight')} placeholder="Ex.: 68" /></Field><Field label="Altura" hint="170 ou 1,70"><input required type="text" inputMode="decimal" autoComplete="off" value={form.height} onChange={set('height')} placeholder="Ex.: 170" /></Field></div><Field label="Nível de atividade"><select value={form.activity} onChange={set('activity')}><option value="sedentario">Pouco ou nenhum</option><option value="leve">Leve</option><option value="moderado">Moderado</option><option value="intenso">Intenso</option></select></Field></>}
      {error && <div className="form-error" role="alert">{error}</div>}
      <Button type="submit" loading={loading}>{step === 3 ? 'Finalizar e criar conta' : 'Continuar'}</Button>
    </form><p className="switch">Já tem uma conta? <button onClick={() => go('login')}>Entrar</button></p></main>;
};
const Login = ({ go, onAuth }) => { const [email, setEmail] = useState(() => { try { const v = sessionStorage.getItem('nutre-login-email') || ''; sessionStorage.removeItem('nutre-login-email'); return v; } catch { return ''; } }), [password, setPassword] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(false); const submit = async (e) => { e.preventDefault(); setLoading(true); setError(''); try { onAuth(await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: email.trim(), password }) })); } catch (err) { setError(err.message); } finally { setLoading(false); } }; return <main className="auth-page auth-centered"><button className="back" onClick={() => go('landing')} aria-label="Voltar"><ArrowLeft /></button><div className="mini-logo"><HeartPulse /><b>Nutrê</b></div><h1>Que bom te ver.</h1><p className="subhead">Entre para continuar cuidando de você.</p><form onSubmit={submit} className="form-grid"><Field label="E-mail"><input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck="false" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@exemplo.com" /></Field><Field label="Senha"><PasswordInput required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>{error && <div className="form-error">{error}</div>}<Button loading={loading}>Entrar</Button></form><p className="switch">Ainda não tem conta? <button onClick={() => go('register')}>Criar cadastro</button></p></main>; };

function Nav({ page, setPage }) { const items = [['home', House, 'Início'], ['calculator', Calculator, 'Calcular'], ['chat', Bot, 'Guia IA'], ['history', History, 'Histórico'], ['profile', UserRound, 'Conta']]; return <nav className="bottom-nav">{items.map(([id, Icon, label]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}><Icon size={20} /><span>{label}</span></button>)}</nav>; }
function Shell({ children, page, setPage, user }) { return <div className="app-shell"><header><div className="brand"><HeartPulse /><span>Nutrê</span></div><button className="avatar" onClick={() => setPage('profile')} aria-label="Abrir conta">{(user.name || '?')[0]}</button></header><main className="screen" key={page}>{children}</main><Nav page={page} setPage={setPage} /></div>; }
function Loading() { return <div className="loading-card" role="status"><span className="spinner dark" /> Carregando seus dados…</div>; }

// Tabela oficial de classificação do IMC, destacando a faixa da pessoa.
function BmiTable({ result }) {
  if (!result?.bmiTable?.length) return null;
  return <section className="bmi-table-card"><h2>Classificação do IMC</h2><p className="table-caption">{result.reference === 'idoso' ? 'Pessoas com 60 anos ou mais (SISVAN/Ministério da Saúde)' : 'Adultos (OMS/Ministério da Saúde)'}</p>
    <table className="bmi-table"><thead><tr><th scope="col">IMC (kg/m²)</th><th scope="col">Classificação</th></tr></thead><tbody>
      {result.bmiTable.map((row) => <tr key={row.classification} className={`${row.tone} ${row.active ? 'active' : ''}`} aria-current={row.active ? 'true' : undefined}><td>{row.range}</td><td><b>{row.classification}</b>{row.active && <em className={`pill ${row.tone}`}>Você está aqui</em>}<small>{row.description}</small></td></tr>)}
    </tbody></table>{result.note && <p className="table-note"><CircleHelp size={15} /> {result.note}</p>}</section>;
}

// Card compacto de necessidade diária (calorias + 3 colunas de macronutrientes).
function MacroCard({ item, onClick }) {
  if (!item) return null;
  const Tag = onClick ? 'button' : 'section';
  return <Tag type={onClick ? 'button' : undefined} className={`macro-card ${onClick ? 'clickable' : ''}`} onClick={onClick}>
    <div className="macro-head">
      <div className="macro-title"><span className="macro-icon"><Flame size={17} /></span><p>Necessidade diária estimada</p></div>
      <strong>{item.calories.toLocaleString('pt-BR')} <small>kcal</small></strong>
    </div>
    <div className="macro-grid">
      <div><span>Proteínas</span><b>{item.protein}g</b></div>
      <div><span>Carboidratos</span><b>{item.carbs}g</b></div>
      <div><span>Gorduras</span><b>{item.fats}g</b></div>
    </div>
  </Tag>;
}

function Dashboard({ user, history, hasManual, loaded, setPage }) {
  const latest = history[0];
  const fromSignup = latest?.source === 'cadastro';
  return <><p className="eyebrow">{fromSignup && !hasManual ? 'SEU PRIMEIRO RESULTADO' : 'HOJE É UM BOM DIA'}</p><h1>Olá, {user.name.split(' ')[0]}.</h1><p className="subhead">{fromSignup && !hasManual ? 'Já calculamos seu IMC com os dados do seu cadastro.' : 'Vamos cuidar de você com calma?'}</p>
    {!loaded && !latest ? <Loading /> : latest ? <>
      <button className="summary-card clickable" onClick={() => setPage('result')}><div><p>{fromSignup ? 'Calculado com os dados do cadastro' : 'Seu último resultado'}</p><div className="summary-main"><strong>IMC {bmiBR(latest.bmi)}</strong><span className={`pill ${toneOf(latest)}`}>{latest.classification}</span></div></div><small className="summary-link">Ver tabela e detalhes <ChevronRight size={15} /></small></button>
      <MacroCard item={latest} onClick={() => setPage('result')} />
    </> : <section className="summary-card empty"><Sparkles /><div><strong>Seu primeiro passo começa aqui</strong><p>Faça um cálculo para conhecer seu ponto de partida.</p></div></section>}
    <section className="section"><h2>O que você precisa agora?</h2><button className="action-card" onClick={() => setPage('calculator')}><div className="action-icon"><Calculator /></div><div><b>{hasManual ? 'Calcular novamente' : 'Calcular IMC'}</b><span>{hasManual ? 'Atualize peso, altura e atividade.' : 'Confira seus dados e conheça seu IMC e suas necessidades.'}</span></div><ChevronRight /></button><button className="action-card blue" onClick={() => setPage('chat')}><div className="action-icon"><Bot /></div><div><b>Conversar com o Guia Nutrê</b><span>Tire dúvidas sem linguagem difícil.</span></div><ChevronRight /></button></section></>;
}

function CalculatorPage({ user, hasManual, onSaved, setPage }) {
  const [form, setForm] = useState({ weight: decimalBR(user.weight), height: user.height ? String(Math.round(user.height * 100)) : '', activity: user.activity || 'leve' });
  const [error, setError] = useState(''), [loading, setLoading] = useState(false);
  // Se os dados do usuário chegarem depois (refresh), preenche os campos.
  useEffect(() => { setForm((f) => ({ weight: f.weight || decimalBR(user.weight), height: f.height || (user.height ? String(Math.round(user.height * 100)) : ''), activity: f.activity || user.activity || 'leve' })); }, [user.weight, user.height, user.activity]);
  const submit = async (e) => {
    e.preventDefault();
    if (!validWeight(form.weight)) return setError('Peso inválido. Use um valor entre 25 e 350 kg (ex.: 68,5).');
    if (!validHeight(form.height)) return setError('Altura inválida. Digite em centímetros (ex.: 170) ou em metros (ex.: 1,70).');
    setLoading(true); setError('');
    try { await onSaved({ weight: parseDecimal(form.weight), height: parseHeightCm(form.height), activity: form.activity }); setPage('result'); } catch (err) { setError(err.message); } finally { setLoading(false); }
  };
  return <div className="calc-page"><div><p className="eyebrow">CALCULADORA</p><h1>{hasManual ? 'Atualize seus dados.' : 'Calcule seu IMC.'}</h1><p className="subhead">{hasManual ? 'Uma estimativa para acompanhar seu cuidado.' : 'Já preenchemos com os dados do seu cadastro. Confira e calcule.'}</p></div>
    <form className="form-grid calc-form" onSubmit={submit} noValidate><Field label="Peso de hoje (kg)" hint="Ex.: 68 ou 68,5"><input required type="text" inputMode="decimal" autoComplete="off" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} /></Field><Field label="Altura" hint="Em centímetros (170) ou metros (1,70)"><input required type="text" inputMode="decimal" autoComplete="off" value={form.height} onChange={(e) => setForm({ ...form, height: e.target.value })} /></Field><Field label="Nível de atividade"><select value={form.activity} onChange={(e) => setForm({ ...form, activity: e.target.value })}><option value="sedentario">Pouco ou nenhum</option><option value="leve">Leve</option><option value="moderado">Moderado</option><option value="intenso">Intenso</option></select></Field>{error && <div className="form-error" role="alert">{error}</div>}<div className="page-footer"><p className="disclaimer"><CircleHelp size={15} /> Esta é uma estimativa e não substitui acompanhamento profissional.</p><Button loading={loading}>{hasManual ? 'Calcular novamente' : 'Calcular IMC'}</Button></div></form></div>;
}

function Result({ result, loaded, setPage }) {
  if (!result) return loaded ? <><p className="eyebrow">SEU RESULTADO</p><h1>Nenhum cálculo ainda.</h1><p className="subhead">Faça seu primeiro cálculo para ver seu IMC.</p><div style={{ marginTop: 24 }}><Button onClick={() => setPage('calculator')}>Calcular IMC</Button></div></> : <Loading />;
  const tone = toneOf(result);
  const showSupport = tone !== 'good';
  const danger = tone === 'risk' || result.bmi < 17;
  return <><p className="eyebrow">SEU RESULTADO</p><h1>Uma leitura simples dos seus números.</h1>
    <section className="result-card"><p>Índice de Massa Corporal (IMC){result.source === 'cadastro' ? ' · calculado com os dados do cadastro' : ''}</p><strong>{bmiBR(result.bmi)} <span className="unit">kg/m²</span></strong><span className={`pill ${tone}`}>{result.classification}</span><div className="scale"><i className="low" /><i className="ok" /><i className="high" /><b style={{ left: `${Math.max(4, Math.min(96, ((result.bmi - 15) / 30) * 100))}%` }} /></div><p>{result.classificationDescription || 'O IMC é apenas um dos indicadores da sua saúde.'}</p></section>
    {showSupport ? <button type="button" className={`risk-banner ${danger ? 'danger' : ''}`} onClick={() => setPage('support')}>{danger ? <AlertTriangle /> : <ShieldCheck />}<div><b>{danger ? 'Atenção: risco elevado à sua saúde' : 'Vale buscar apoio profissional'}</b><span>{danger ? 'Recomendamos procurar uma UBS ou médico o quanto antes. Toque para ver unidades próximas.' : 'Uma UBS pode orientar você gratuitamente. Toque para ver unidades próximas.'}</span></div><ChevronRight className="risk-arrow" /></button> : null}
    <BmiTable result={result} />
    <MacroCard item={result} />
    <Button onClick={() => setPage('chat')}><Bot size={19} /> Conversar sobre o resultado</Button><p className="disclaimer"><CircleHelp size={15} /> O IMC não diferencia massa muscular de gordura. Ele é um indicador de triagem e não substitui a avaliação de um profissional de saúde.</p></>;
}

function Chat({ token }) { const [messages, setMessages] = useState([{ role: 'assistant', text: 'Olá! Eu sou o Guia Nutrê. Posso explicar seu resultado em palavras simples.' }]), [input, setInput] = useState(''), [loading, setLoading] = useState(false); const send = async (e) => { e.preventDefault(); if (!input.trim() || loading) return; const q = input.trim(); setMessages((m) => [...m, { role: 'user', text: q }]); setInput(''); setLoading(true); try { const d = await api('/chat', { method: 'POST', body: JSON.stringify({ message: q }) }, token); setMessages((m) => [...m, { role: 'assistant', text: d.answer }]); } catch (err) { setMessages((m) => [...m, { role: 'assistant', text: err.message }]); } finally { setLoading(false); } }; return <div className="chat-page"><div><p className="eyebrow">GUIA NUTRÊ</p><h1>Converse com calma.</h1><p className="subhead">Respostas simples, com cuidado e responsabilidade.</p><div className="chat-list">{messages.map((m, i) => <div key={i} className={`bubble ${m.role}`}>{m.role === 'assistant' && <Bot size={17} />}<span>{m.text}</span></div>)}{loading && <div className="bubble assistant"><Bot size={17} /><span className="typing"><i /><i /><i /></span></div>}</div></div><div className="page-footer"><form className="chat-form" onSubmit={send}><label className="sr-only" htmlFor="question">Sua pergunta</label><input id="question" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Escreva sua dúvida..." /><button aria-label="Enviar pergunta" disabled={!input.trim() || loading}><Send size={20} /></button></form><p className="disclaimer"><CircleHelp size={15} /> Não substitui atendimento nutricional ou médico.</p></div></div>; }

function HistoryPage({ history, hasManual, loaded, onOpen, setPage }) {
  return <div className="history-page"><div><p className="eyebrow">SEU CAMINHO</p><h1>Histórico de cálculos</h1><p className="subhead">Observe tendências, sem se comparar.</p>
    {!loaded && !history.length ? <Loading /> : history.length ? <div className="history-list">{history.map((item) => <button key={item.id} className="history-row" onClick={() => onOpen(item)}><div><b>{formatDate(item.created_at)}{item.source === 'cadastro' && <i className="tag">Cadastro</i>}</b><span>IMC {bmiBR(item.bmi)} · {item.calories.toLocaleString('pt-BR')} kcal</span><small>{item.classificationDescription}</small></div><span className={`pill ${toneOf(item)}`}>{item.classification}</span></button>)}</div> : <div className="empty-state"><History /><b>Ainda não há cálculos</b><p>Seu histórico aparecerá aqui depois do primeiro cálculo.</p></div>}</div>
    <div className="page-footer"><Button onClick={() => setPage('calculator')}>{hasManual ? 'Fazer novo cálculo' : 'Calcular IMC'}</Button></div></div>;
}
const formatDistance = (m) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);
function Support({ token }) {
  const [coords, setCoords] = useState(null);
  const [units, setUnits] = useState([]);
  const [status, setStatus] = useState('locating'); // locating | loading | ready | denied | error
  const [activeId, setActiveId] = useState(null);
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});

  const locate = useCallback(() => {
    if (!navigator.geolocation) { setStatus('denied'); return; }
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const current = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setCoords(current);
        setStatus('loading');
        try {
          const d = await api(`/ubs?lat=${current.lat}&lon=${current.lon}`, {}, token);
          setUnits(d.units || []);
          setActiveId(d.units?.[0]?.id || null);
          setStatus('ready');
        } catch { setStatus('error'); }
      },
      () => setStatus('denied'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 }
    );
  }, [token]);

  useEffect(() => { locate(); }, [locate]);

  useEffect(() => {
    if (!coords || !mapEl.current) return;
    if (!mapRef.current) {
      const map = L.map(mapEl.current, { zoomControl: false, attributionControl: true }).setView([coords.lat, coords.lon], 14);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      mapRef.current = map;
    } else {
      mapRef.current.setView([coords.lat, coords.lon], 14);
    }
    const map = mapRef.current;
    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};

    const userIcon = L.divIcon({ className: 'map-pin user', html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 11] });
    markersRef.current.user = L.marker([coords.lat, coords.lon], { icon: userIcon }).addTo(map).bindPopup('<b>Você está aqui</b>');

    units.forEach((u) => {
      const ubsIcon = L.divIcon({ className: `map-pin ubs ${u.id === activeId ? 'selected' : ''}`, html: '<span>+</span>', iconSize: [28, 28], iconAnchor: [14, 14] });
      const marker = L.marker([u.lat, u.lon], { icon: ubsIcon }).addTo(map).bindPopup(`<b>${u.name}</b><br/><small>${formatDistance(u.distance)}</small>`);
      marker.on('click', () => setActiveId(u.id));
      markersRef.current[u.id] = marker;
    });
  }, [coords, units, activeId]);

  useEffect(() => () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } }, []);

  const focusUnit = (u) => {
    setActiveId(u.id);
    if (mapRef.current) {
      mapRef.current.flyTo([u.lat, u.lon], 16, { duration: 0.5 });
      markersRef.current[u.id]?.openPopup();
    }
  };
  const mapsSearchUrl = coords
    ? `https://www.google.com/maps/search/UBS+Posto+de+Saude/@${coords.lat},${coords.lon},15z`
    : 'https://www.google.com/maps/search/UBS+Posto+de+Saude+perto+de+mim';

  return <>
    <p className="eyebrow">CUIDADO IMPORTA</p><h1>Você não precisa lidar com isso sozinho.</h1>
    <section className="support-card"><ShieldCheck /><h2>Procure uma UBS perto de você.</h2><p>Leve seu resultado do Nutrê. Uma equipe de saúde pode avaliar sua situação com atenção.</p><ol><li>Busque a unidade mais próxima.</li><li>Mostre seus resultados.</li><li>Se sentir mal-estar, procure atendimento imediato.</li></ol></section>
    <section className="ubs-section">
      <div className="ubs-head">
        <div className="sources-head"><MapPin size={18} /><div><h2>Unidades de saúde próximas</h2><p>{coords ? 'Toque em uma unidade para destacar no mapa ou abrir a rota.' : 'Permita o acesso à localização para ver as unidades no mapa.'}</p></div></div>
        {coords && <button type="button" className="recenter-btn" onClick={locate} aria-label="Atualizar localização"><LocateFixed size={16} /></button>}
      </div>
      {coords && <div className="ubs-map-wrap"><div ref={mapEl} className="ubs-map" /></div>}
      {(status === 'locating' || status === 'loading') && <div className="loading-card" role="status"><span className="spinner dark" /> {status === 'locating' ? 'Obtendo sua localização…' : 'Buscando unidades próximas…'}</div>}
      {status === 'denied' && <div className="ubs-empty"><MapPin size={22} /><b>Localização não autorizada</b><p>Ative a permissão de localização no navegador ou pesquise diretamente no mapa.</p><div className="ubs-empty-actions"><Button onClick={locate}><LocateFixed size={17} /> Tentar novamente</Button></div></div>}
      {status === 'ready' && units.length > 0 && <div className="ubs-list">
        {units.map((u) => <div key={u.id} className={`ubs-card ${u.id === activeId ? 'active' : ''}`} onClick={() => focusUnit(u)}>
          <div className="ubs-card-main">
            <div className="ubs-title-row"><b>{u.name}</b><span className="ubs-dist">{formatDistance(u.distance)}</span></div>
            <p>{u.address}</p>
          </div>
          <a className="ubs-route" href={`https://www.google.com/maps/dir/?api=1&destination=${u.lat},${u.lon}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}><Navigation size={13} /> Rota</a>
        </div>)}
      </div>}
      {status === 'ready' && units.length === 0 && <div className="ubs-empty"><MapPin size={22} /><b>Nenhuma unidade mapeada neste raio</b><p>Abra a busca no Google Maps para ver todas as UBS da sua região.</p></div>}
      <a className="button secondary ubs-maps-btn" href={mapsSearchUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} /> Ver UBS no Google Maps</a>
    </section>
  </>;
}
const ACTIVITY_LABELS = { sedentario: 'Sedentário', leve: 'Atividade leve', moderado: 'Atividade moderada', intenso: 'Atividade intensa' };
const SOURCES = [
  { badge: 'OMS · Adultos', title: 'Organização Mundial da Saúde (WHO)', desc: 'Pontos de corte de IMC para adultos (20 a 59 anos): Baixo peso, Eutrofia, Sobrepeso e Obesidade graus I, II e III (WHO Technical Report Series 894, 2000).', url: 'https://www.who.int/news-room/fact-sheets/detail/obesity-and-overweight', linkLabel: 'who.int' },
  { badge: 'Ministério da Saúde · SISVAN', title: 'Vigilância Alimentar e Nutricional', desc: 'Protocolos oficiais do SUS para avaliação antropométrica na Atenção Primária, incluindo a referência de Lipschitz (1994) para pessoas idosas (60+ anos).', url: 'https://aps.saude.gov.br/ape/vigilanciaalimentar/sisvan', linkLabel: 'aps.saude.gov.br' },
  { badge: 'Ministério da Saúde · Brasil', title: 'Guia Alimentar para a População Brasileira', desc: 'Diretrizes oficiais sobre alimentação adequada e saudável, priorizando alimentos in natura ou minimamente processados.', url: 'https://bvsms.saude.gov.br/bvs/publicacoes/guia_alimentar_populacao_brasileira_2ed.pdf', linkLabel: 'bvsms.saude.gov.br' },
  { badge: 'Gasto Energético · AMDR', title: 'Equação de Harris-Benedict & Macronutrientes', desc: 'Estimativa de taxa metabólica basal revisada por Roza & Shizgal (1984) combinada ao fator de atividade física e distribuição equilibrada (50% carboidratos, 20% proteínas, 30% lipídios).', url: 'https://pubmed.ncbi.nlm.nih.gov/6741850/', linkLabel: 'pubmed.ncbi.nlm.nih.gov' },
];

function Profile({ user, onLogout }) {
  const heightM = user.height ? `${Number(user.height).toFixed(2).replace('.', ',')} m` : '-';
  return <div className="profile-page">
    <div className="profile-body">
      <p className="eyebrow">SUA CONTA</p><h1>{user.name}</h1><p className="subhead">{user.email}</p>
      <section className="sources-section data-section">
        <div className="sources-head"><UserRound size={18} /><div><h2>Dados</h2><p>Informações atuais usadas para calcular seu IMC e necessidades.</p></div></div>
        <div className="profile-card">
          <div className="profile-icon"><UserRound size={20} /></div>
          <div className="profile-info">
            <b>Dados usados no cálculo</b>
            <span>{user.age} anos · {decimalBR(user.weight)} kg · {heightM} · {ACTIVITY_LABELS[user.activity] || 'Atividade leve'}</span>
          </div>
        </div>
      </section>
      <section className="sources-section">
        <div className="sources-head"><BookOpen size={18} /><div><h2>Fontes e referências científicas</h2><p>Critérios oficiais utilizados nos cálculos e classificações do Nutrê.</p></div></div>
        <div className="sources-list">
          {SOURCES.map((s) => <a key={s.title} className="source-card" href={s.url} target="_blank" rel="noopener noreferrer"><div><span className="source-badge">{s.badge}</span><b>{s.title}</b><p>{s.desc}</p><small>{s.linkLabel} <ExternalLink size={12} /></small></div></a>)}
        </div>
      </section>
    </div>
    <div className="profile-footer"><Button variant="secondary" onClick={onLogout}><LogOut size={18} /> Sair da conta</Button></div>
  </div>;
}

function App() {
  const [auth, setAuth] = useState(() => storage.get('nutre-auth'));
  const [page, setPageState] = useState(() => resolvePage(readHash() || storage.get('nutre-page', ''), !!storage.get('nutre-auth')));
  const [history, setHistory] = useState(() => (auth ? storage.get('nutre-history', []) : []));
  const [selected, setSelected] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // Mantém a URL sincronizada (sem criar entrada extra no histórico ao abrir/atualizar).
  useEffect(() => { if (readHash() !== page) window.history.replaceState(null, '', `#/${page}`); storage.set('nutre-page', page); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Botão "voltar" do navegador/Android e gestos de voltar do iOS.
  useEffect(() => {
    const onHash = () => { const next = resolvePage(readHash(), !!storage.get('nutre-auth')); setPageState(next); storage.set('nutre-page', next); if (readHash() !== next) window.history.replaceState(null, '', `#/${next}`); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const setPage = useCallback((next) => { storage.set('nutre-page', next); setPageState(next); if (readHash() !== next) window.location.hash = `/${next}`; window.scrollTo(0, 0); }, []);
  useEffect(() => { if (!['result', 'support', 'chat'].includes(page)) setSelected(null); }, [page]);

  const clearSession = useCallback(() => { storage.remove('nutre-auth', 'nutre-token', 'nutre-history', 'nutre-page'); setAuth(null); setHistory([]); setSelected(null); setLoaded(false); }, []);
  const load = useCallback(async (token) => {
    try {
      const [me, calcs] = await Promise.all([api('/me', {}, token), api('/calculations', {}, token)]);
      setHistory(calcs.calculations); storage.set('nutre-history', calcs.calculations);
      setAuth((a) => { if (!a) return a; const updated = { ...a, user: me.user }; storage.set('nutre-auth', updated); return updated; });
    } catch (err) {
      // Só sai da conta se o token for realmente inválido; falha de rede mantém a pessoa onde está.
      if (err.status === 401) { clearSession(); setPage('login'); }
    } finally { setLoaded(true); }
  }, [clearSession, setPage]);
  useEffect(() => { if (auth?.token) load(auth.token); }, [auth?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  const onAuth = (d) => {
    const session = { token: d.token, user: d.user };
    storage.set('nutre-auth', session); storage.set('nutre-token', d.token);
    if (d.initialCalculation) { setHistory([d.initialCalculation]); storage.set('nutre-history', [d.initialCalculation]); }
    setLoaded(false); setAuth(session); setPage('home');
  };
  const onSaved = async (v) => { const d = await api('/calculations', { method: 'POST', body: JSON.stringify(v) }, auth.token); setSelected(null); setHistory((h) => { const next = [d, ...h]; storage.set('nutre-history', next); return next; }); setAuth((a) => { const updated = { ...a, user: { ...a.user, weight: d.weight, height: d.height, activity: d.activity } }; storage.set('nutre-auth', updated); return updated; }); };
  const logout = () => { clearSession(); setPage('landing'); };

  if (!auth) {
    const p = resolvePage(page, false);
    return <div className="public-wrap">{p === 'register' ? <Register go={setPage} onAuth={onAuth} /> : p === 'login' ? <Login go={setPage} onAuth={onAuth} /> : p === 'about' ? <About go={setPage} /> : <Landing go={setPage} />}</div>;
  }
  const current = resolvePage(page, true);
  const hasManual = history.some((c) => c.source === 'manual');
  const result = selected || history[0] || null;
  const views = {
    home: <Dashboard user={auth.user} history={history} hasManual={hasManual} loaded={loaded} setPage={setPage} />,
    calculator: <CalculatorPage user={auth.user} hasManual={hasManual} onSaved={onSaved} setPage={setPage} />,
    result: <Result result={result} loaded={loaded} setPage={setPage} />,
    chat: <Chat token={auth.token} />,
    history: <HistoryPage history={history} hasManual={hasManual} loaded={loaded} onOpen={(item) => { setSelected(item); setPage('result'); }} setPage={setPage} />,
    support: <Support token={auth.token} />,
    profile: <Profile user={auth.user} history={history} setPage={setPage} onLogout={logout} />,
  };
  return <Shell page={current} setPage={(p) => { if (p !== 'result') setSelected(null); setPage(p); }} user={auth.user}>{views[current]}</Shell>;
}
createRoot(document.getElementById('root')).render(<App />);
