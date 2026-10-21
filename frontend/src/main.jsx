import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, AlertTriangle, Apple, ArrowLeft, BookOpen, Bot, Calculator, Calendar, CheckCircle2, ChevronRight, CircleHelp, ExternalLink, Eye, EyeOff, FileText, Flame, HeartPulse, History, House, KeyRound, LocateFixed, Lock, LogOut, Mail, MapPin, Navigation, Ruler, Scale, Search, Send, ShieldCheck, Sparkles, UserRound, Utensils } from 'lucide-react';
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
const PUBLIC_PAGES = ['landing', 'register', 'login', 'forgot', 'terms', 'privacy', 'about'];
const PRIVATE_PAGES = ['home', 'calculator', 'foods', 'result', 'chat', 'history', 'support', 'profile'];
const readHash = () => window.location.hash.replace(/^#\/?/, '').split('?')[0];
const resolvePage = (wanted, isAuth) => {
  if (isAuth) return PRIVATE_PAGES.includes(wanted) ? wanted : 'home';
  return PUBLIC_PAGES.includes(wanted) ? wanted : PRIVATE_PAGES.includes(wanted) ? 'login' : 'landing';
};

function Field({ label, icon: Icon, action, error, children, hint }) {
  return (
    <label className={`field ${error ? 'has-error' : ''}`}>
      <span className="field-head">
        <span className="field-label">{Icon && <Icon size={15} />}{label}</span>
        {action}
      </span>
      {children}
      {error ? <small role="alert" aria-live="polite">{error}</small> : hint ? <small>{hint}</small> : null}
    </label>
  );
}
function Button({ children, variant = 'primary', loading, ...props }) { return <button className={`button ${variant}`} disabled={loading || props.disabled} {...props}>{loading ? <span className="spinner" /> : children}</button>; }
// Campo de senha com ícone de olho para mostrar/ocultar.
function PasswordInput({ value, onChange, autoComplete = 'current-password', placeholder = '••••••••', ...props }) {
  const [visible, setVisible] = useState(false);
  return <div className="password-wrap"><input {...props} type={visible ? 'text' : 'password'} className={visible ? '' : 'masked'} autoComplete={autoComplete} autoCapitalize="none" autoCorrect="off" spellCheck="false" value={value} onChange={onChange} placeholder={placeholder} /><button type="button" className="eye-button" onClick={(e) => { e.preventDefault(); setVisible((v) => !v); }} aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={visible}>{visible ? <EyeOff size={20} /> : <Eye size={20} />}</button></div>;
}

const LANDING_FOODS = [
  {
    name: 'Peito de frango grelhado',
    portion: '1 filé médio (120g) ≈ 190 kcal',
    kcal: 159,
    prot: '32,0g',
    carb: '0g',
    fat: '2,5g',
    source: 'TACO · UNICAMP',
    img: 'https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=500&q=80',
  },
  {
    name: 'Arroz branco + Feijão carioca',
    portion: 'Base tradicional · Proteína vegetal completa',
    kcal: 128,
    prot: '4,8g',
    carb: '28,1g',
    fat: '0,5g',
    source: 'TACO · UNICAMP',
    img: 'https://images.unsplash.com/photo-1536304993881-ff6e9eefa2a6?auto=format&fit=crop&w=500&q=80',
  },
  {
    name: 'Ovo de galinha cozido',
    portion: '1 unidade média (50g) ≈ 66 a 73 kcal',
    kcal: 146,
    prot: '13,3g',
    carb: '0,6g',
    fat: '9,5g',
    source: 'TACO · UNICAMP',
    img: 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&w=500&q=80',
  },
  {
    name: 'Banana prata in natura',
    portion: '1 unidade média (60g) ≈ 55 a 65 kcal',
    kcal: 98,
    prot: '1,3g',
    carb: '26,0g',
    fat: '0,1g',
    source: 'TACO · UNICAMP',
    img: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=500&q=80',
  },
];

function Landing({ go }) {
  const [previewMode, setPreviewMode] = useState('health');
  const isNutri = previewMode === 'nutrition';

  return <main className="landing lp-root">
    <header className="lp-topbar">
      <div className="landing-mark">
        <HeartPulse size={22} />
        <b>Nutrê</b>
      </div>
      <button type="button" className="lp-login-pill" onClick={() => go('login')}>Entrar</button>
    </header>

    <section className="lp-hero">
      <p className="eyebrow">SAÚDE E NUTRIÇÃO BASEADA EM EVIDÊNCIAS</p>
      <h1>Alimentação real e cuidado que cabem na sua rotina.</h1>
      <p className="lead">
        Calcule seu IMC com os critérios oficiais para a sua idade, consulte <b>140 alimentos</b> analisados em laboratório e monte dietas acessíveis com o <b>Guia IA</b>.
      </p>

      <div className="lp-hero-visual">
        <img
          src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=80"
          alt="Prato equilibrado com alimentos frescos, proteínas, grãos e vegetais"
          className="lp-hero-img"
        />
        <div className="lp-hero-overlay" />
        <div className="lp-float-card top-left">
          <div className="lp-float-icon health"><HeartPulse size={14} /></div>
          <div className="lp-float-text">
            <b>IMC 22,1 kg/m² · Adequado</b>
            <span>Critério OMS e SISVAN/MS por idade</span>
          </div>
        </div>
        <div className="lp-float-card bottom-right">
          <div className="lp-float-icon nutri"><Flame size={14} /></div>
          <div className="lp-float-text">
            <b>Meta: 1.980 kcal/dia</b>
            <span>124g Prot · 220g Carb · 62g Gord</span>
          </div>
        </div>
      </div>

      <div className="landing-actions lp-actions">
        <Button onClick={() => go('register')}>Criar minha conta gratuita <ChevronRight size={20} /></Button>
        <Button variant="secondary" onClick={() => go('login')}>Já tenho uma conta</Button>
      </div>
    </section>

    <section className="lp-stats" aria-label="Números do projeto">
      <div className="lp-stat-card">
        <strong>140</strong>
        <span>Alimentos com macros reais (TACO/TBCA)</span>
      </div>
      <div className="lp-stat-card">
        <strong>2 faixas</strong>
        <span>IMC Adulto (OMS) e Idoso 60+ (SISVAN)</span>
      </div>
      <div className="lp-stat-card">
        <strong>SUS + IA</strong>
        <span>Guia nutricional e mapa de UBS próximas</span>
      </div>
    </section>

    <section className="lp-section">
      <p className="eyebrow">DOIS AMBIENTES INTEGRADOS</p>
      <h2>Explore os 2 modos do Nutrê</h2>
      <p className="lp-section-sub">Alterne a qualquer momento no topo do aplicativo conforme a sua necessidade do dia:</p>

      <div className="lp-mode-switch" role="tablist" aria-label="Prévia dos modos do aplicativo">
        <button
          type="button"
          className={!isNutri ? 'active health' : ''}
          onClick={() => setPreviewMode('health')}
        >
          <HeartPulse size={16} /> Modo Saúde
        </button>
        <button
          type="button"
          className={isNutri ? 'active nutri' : ''}
          onClick={() => setPreviewMode('nutrition')}
        >
          <Apple size={16} /> Modo Nutrição
        </button>
      </div>

      <div className={`lp-mode-card ${isNutri ? 'nutri' : 'health'}`}>
        <div className="lp-mode-media">
          <img
            src={isNutri
              ? 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=700&q=80'
              : 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=700&q=80'}
            alt={isNutri ? 'Ingredientes naturais e refeição brasileira nutritiva' : 'Avaliação nutricional e hábitos saudáveis'}
          />
          <span className="lp-mode-tag">
            {isNutri ? 'TEMA LARANJA · ALIMENTOS & DIETA' : 'TEMA VERDE · AVALIAÇÃO & REDE SUS'}
          </span>
        </div>
        <div className="lp-mode-body">
          <h3>{isNutri ? 'Tabela TACO/UNICAMP e Dieta Acessível' : 'Cálculo de IMC, Calorias e Mapa de UBS'}</h3>
          <ul className="lp-feature-list">
            {isNutri ? <>
              <li>
                <CheckCircle2 size={16} />
                <div><b>140 alimentos detalhados:</b> consulte calorias, proteínas, carboidratos, gorduras e fibras por 100g e por unidade ou fatia.</div>
              </li>
              <li>
                <CheckCircle2 size={16} />
                <div><b>Cardápio com o que você tem em casa:</b> o Guia IA monta refeições econômicas usando arroz, feijão, ovos, frango, frutas da estação e raízes.</div>
              </li>
              <li>
                <CheckCircle2 size={16} />
                <div><b>Ajuste para esportes:</b> metas adaptadas para musculação, corrida, futebol, caminhada ou rotina de trabalho físico.</div>
              </li>
            </> : <>
              <li>
                <CheckCircle2 size={16} />
                <div><b>IMC fiel à sua idade:</b> aplica automaticamente os pontos de corte da OMS para adultos e do Ministério da Saúde (SISVAN) para 60 anos ou mais.</div>
              </li>
              <li>
                <CheckCircle2 size={16} />
                <div><b>Equação científica de Mifflin-St Jeor:</b> estima sua Taxa Metabólica Basal e necessidade diária de calorias e macronutrientes.</div>
              </li>
              <li>
                <CheckCircle2 size={16} />
                <div><b>Mapa de UBS próximas:</b> localiza Unidades Básicas de Saúde ao seu redor para acompanhamento gratuito pelo SUS quando houver alerta nutricional.</div>
              </li>
            </>}
          </ul>
        </div>
      </div>
    </section>

    <section className="lp-section">
      <p className="eyebrow">DADOS REAIS · TACO 4ª ED. (NEPA/UNICAMP)</p>
      <h2>O que tem no prato do brasileiro</h2>
      <p className="lp-section-sub">Valores laboratoriais reais por 100g disponíveis para consulta imediata dentro da plataforma:</p>

      <div className="lp-food-grid">
        {LANDING_FOODS.map((f) => (
          <article key={f.name} className="lp-food-card">
            <div className="lp-food-img-wrap">
              <img src={f.img} alt={f.name} loading="lazy" />
              <span className="lp-food-kcal">{f.kcal} <small>kcal/100g</small></span>
            </div>
            <div className="lp-food-info">
              <span className="lp-food-source">{f.source}</span>
              <b>{f.name}</b>
              <small>{f.portion}</small>
              <div className="lp-food-macros">
                <span>Prot <b>{f.prot}</b></span>
                <span>Carb <b>{f.carb}</b></span>
                <span>Gord <b>{f.fat}</b></span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>

    <section className="lp-section">
      <div className="lp-age-card">
        <div className="lp-age-head">
          <Scale size={20} />
          <div>
            <p className="eyebrow">PRECISÃO CLÍNICA</p>
            <h2>Por que a sua idade muda o cálculo do IMC?</h2>
          </div>
        </div>
        <p className="lp-age-desc">
          Muitas calculadoras usam uma régua única para todo mundo. O Nutrê segue o protocolo oficial do <b>Ministério da Saúde (SISVAN)</b>, que diferencia adultos e idosos:
        </p>
        <div className="lp-age-compare">
          <div className="lp-age-box">
            <span>Adultos (18 a 59 anos)</span>
            <strong>18,5 a 24,9 <small>kg/m²</small></strong>
            <p>Faixa de eutrofia (peso adequado) segundo a Organização Mundial da Saúde (OMS).</p>
          </div>
          <div className="lp-age-box highlight">
            <span>Pessoas 60+ (Idosos)</span>
            <strong>22,0 a 27,0 <small>kg/m²</small></strong>
            <p>Critério de Lipschitz (SISVAN/MS): maior reserva protege ossos e previne a perda muscular (sarcopenia).</p>
          </div>
        </div>
      </div>
    </section>

    <section className="lp-section">
      <p className="eyebrow">FONTES OFICIAIS VERIFICADAS</p>
      <h2>Ciência aberta e confiável</h2>
      <div className="lp-sources-grid">
        <div className="lp-source-item">
          <BookOpen size={18} />
          <div>
            <b>TACO · NEPA / UNICAMP</b>
            <span>Tabela Brasileira de Composição de Alimentos (4ª edição) com análises nacionais.</span>
          </div>
        </div>
        <div className="lp-source-item">
          <Utensils size={18} />
          <div>
            <b>TBCA · USP / FoRC & USDA</b>
            <span>Composição nutricional de preparações, lanches, frios e alimentos do cotidiano.</span>
          </div>
        </div>
        <div className="lp-source-item">
          <HeartPulse size={18} />
          <div>
            <b>Ministério da Saúde & OMS</b>
            <span>Diretrizes do Guia Alimentar para a População Brasileira e protocolos do SISVAN.</span>
          </div>
        </div>
      </div>
    </section>

    <section className="lp-bottom-cta">
      <h2>Comece a cuidar da sua alimentação hoje.</h2>
      <p>Ao concluir seu cadastro em 3 passos rápidos, seu primeiro IMC e sua meta diária de calorias e macros já saem prontos.</p>
      <Button onClick={() => go('register')}>Criar minha conta agora <ChevronRight size={20} /></Button>
      <div className="lp-trust-row">
        <ShieldCheck size={17} />
        <span>100% gratuito · Sem anúncios · Dados protegidos (LGPD)</span>
      </div>
    </section>

    <footer className="lp-footer-links">
      <button type="button" onClick={() => go('about')}>Sobre o projeto</button>
      <span>·</span>
      <button type="button" onClick={() => go('terms')}>Termos de Uso</button>
      <span>·</span>
      <button type="button" onClick={() => go('privacy')}>Privacidade</button>
    </footer>
  </main>;
}
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
  return <main className="auth-page"><p className="eyebrow">CADASTRO · PASSO {step} DE 3</p><div className="stepper" aria-label={`Passo ${step} de 3`}><i className={step >= 1 ? 'done' : ''} /><i className={step >= 2 ? 'done' : ''} /><i className={step >= 3 ? 'done' : ''} /></div><h1>{title}</h1><p className="subhead">{step === 1 ? 'Esses dados serão usados para entrar na sua conta.' : step === 2 ? 'As informações ajudam a personalizar os cálculos.' : 'Com esses dados já calculamos seu primeiro IMC.'}</p>
    <form onSubmit={step === 3 ? submit : next} className="form-grid" noValidate>
      {needsPassword && <Field label="Confirme sua senha" icon={Lock} hint="Por segurança, a senha não fica salva ao atualizar a página."><PasswordInput autoComplete="new-password" value={form.password} onChange={set('password')} /></Field>}
      {step === 1 && <><Field label="Seu nome" icon={UserRound}><input required autoComplete="name" value={form.name} onChange={set('name')} placeholder="Como quer ser chamado?" /></Field><Field label="E-mail" icon={Mail} error={emailError}><input required autoComplete="email" autoCapitalize="none" spellCheck="false" type="email" inputMode="email" value={form.email} onChange={set('email')} placeholder="nome@exemplo.com" aria-invalid={!!emailError} /></Field>{emailError && emailError.includes('já possui') && <button type="button" className="inline-link" onClick={() => { try { sessionStorage.setItem('nutre-login-email', form.email.trim()); } catch { /* ignore */ } go('login'); }}>Já é você? Entrar com este e-mail</button>}<Field label="Crie uma senha" icon={Lock} hint="Pelo menos 6 caracteres"><PasswordInput required autoComplete="new-password" minLength="6" value={form.password} onChange={set('password')} /></Field></>}
      {step === 2 && <><Field label="Idade" icon={Calendar}><input required type="text" inputMode="numeric" pattern="[0-9]*" maxLength={3} value={form.age} onChange={(e) => setForm((f) => ({ ...f, age: e.target.value.replace(/\D/g, '') }))} placeholder="Ex.: 42" /></Field><Field label="Sexo" icon={UserRound}><select required value={form.sex} onChange={set('sex')}><option value="" disabled>Selecione uma opção</option><option value="masculino">Homem</option><option value="feminino">Mulher</option><option value="nao_informar">Não desejo informar</option></select></Field></>}
      {step === 3 && <><div className="split"><Field label="Peso (kg)" icon={Scale} hint="Ex.: 68 ou 68,5"><input required type="text" inputMode="decimal" autoComplete="off" value={form.weight} onChange={set('weight')} placeholder="Ex.: 68" /></Field><Field label="Altura" icon={Ruler} hint="170 ou 1,70"><input required type="text" inputMode="decimal" autoComplete="off" value={form.height} onChange={set('height')} placeholder="Ex.: 170" /></Field></div><Field label="Nível de atividade" icon={Activity}><select value={form.activity} onChange={set('activity')}><option value="sedentario">Pouco ou nenhum (sem exercício)</option><option value="leve">Leve (1 a 3 dias na semana)</option><option value="moderado">Moderado (3 a 5 dias na semana)</option><option value="intenso">Intenso (6 a 7 dias na semana)</option></select></Field></>}
      {error && <div className="form-error" role="alert">{error}</div>}
      <p className="legal-consent">
        Ao se cadastrar em nossa plataforma, você concorda com nossos{' '}
        <button type="button" onClick={() => go('terms')}>Termos de Uso</button> e{' '}
        <button type="button" onClick={() => go('privacy')}>Política de Privacidade</button>.
      </p>
      <Button type="submit" loading={loading}>{step === 3 ? 'Finalizar e criar conta' : 'Continuar'}</Button>
    </form><p className="switch">Já tem uma conta?<button onClick={() => go('login')}>Entrar</button></p></main>;
};

const Login = ({ go, onAuth }) => {
  const [email, setEmail] = useState(() => { try { const v = sessionStorage.getItem('nutre-login-email') || ''; sessionStorage.removeItem('nutre-login-email'); return v; } catch { return ''; } });
  const [password, setPassword] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setLoading(true); setError('');
    try { onAuth(await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: email.trim(), password }) })); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };
  const openForgot = (e) => {
    e.preventDefault();
    try { if (email.trim()) sessionStorage.setItem('nutre-reset-email', email.trim()); } catch { /* ignore */ }
    go('forgot');
  };
  return <main className="auth-page auth-centered">
    <div className="mini-logo"><HeartPulse /><b>Nutrê</b></div>
    <h1>Que bom te ver.</h1>
    <p className="subhead">Entre para continuar cuidando de você.</p>
    <form onSubmit={submit} className="form-grid">
      <Field label="E-mail" icon={Mail}>
        <input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck="false" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@exemplo.com" />
      </Field>
      <Field
        label="Senha"
        icon={Lock}
        action={<button type="button" className="forgot-link" onClick={openForgot}>Esqueceu a senha?</button>}
      >
        <PasswordInput required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error && <div className="form-error">{error}</div>}
      <Button loading={loading}>Entrar</Button>
    </form>
    <p className="switch">Ainda não tem conta?<button onClick={() => go('register')}>Criar cadastro</button></p>
  </main>;
};

function ForgotPassword({ go }) {
  const [email, setEmail] = useState(() => { try { const v = sessionStorage.getItem('nutre-reset-email') || ''; sessionStorage.removeItem('nutre-reset-email'); return v; } catch { return ''; } });
  const [step, setStep] = useState(1); // 1 = verificar e-mail | 2 = nova senha | 3 = concluído
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const checkAccount = async (e) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Digite um e-mail válido.');
    setLoading(true); setError('');
    try {
      const d = await api('/auth/forgot-check', { method: 'POST', body: JSON.stringify({ email: email.trim() }) });
      setUserName(d.name || '');
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetPass = async (e) => {
    e.preventDefault();
    if (password.length < 6) return setError('A nova senha precisa ter pelo menos 6 caracteres.');
    if (password !== confirm) return setError('As senhas digitadas não conferem.');
    setLoading(true); setError('');
    try {
      await api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ email: email.trim(), password }) });
      try { sessionStorage.setItem('nutre-login-email', email.trim()); } catch { /* ignore */ }
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return <main className="auth-page auth-centered">
    <div className="mini-logo"><KeyRound /><b>Recuperar senha</b></div>
    {step === 1 && <>
      <h1>Esqueceu sua senha?</h1>
      <p className="subhead">Informe o e-mail da sua conta para criar uma nova senha de acesso.</p>
      <form onSubmit={checkAccount} className="form-grid" noValidate>
        <Field label="E-mail da conta" icon={Mail}>
          <input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck="false" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@exemplo.com" />
        </Field>
        {error && <div className="form-error" role="alert">{error}</div>}
        <Button loading={loading}>Continuar</Button>
      </form>
      <p className="switch">Lembrou a senha?<button onClick={() => go('login')}>Voltar para o login</button></p>
    </>}
    {step === 2 && <>
      <h1>Olá{userName ? `, ${userName}` : ''}.</h1>
      <p className="subhead">Escolha uma nova senha segura para a conta <b>{email.trim()}</b>.</p>
      <form onSubmit={resetPass} className="form-grid" noValidate>
        <Field label="Nova senha" icon={Lock} hint="Pelo menos 6 caracteres">
          <PasswordInput required autoComplete="new-password" minLength="6" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirme a nova senha" icon={KeyRound}>
          <PasswordInput required autoComplete="new-password" minLength="6" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {error && <div className="form-error" role="alert">{error}</div>}
        <Button loading={loading}>Salvar nova senha</Button>
      </form>
    </>}
    {step === 3 && <div className="reset-success">
      <div className="reset-success-icon"><CheckCircle2 size={32} /></div>
      <h1>Senha atualizada!</h1>
      <p className="subhead">Sua nova senha já está ativa. Agora é só entrar na sua conta.</p>
      <div style={{ marginTop: 24 }}>
        <Button onClick={() => go('login')}>Ir para o login</Button>
      </div>
    </div>}
  </main>;
}

function TermsPage({ go }) {
  return <main className="auth-page legal-page">
    <button className="back" onClick={() => go('register')} aria-label="Voltar"><ArrowLeft /></button>
    <p className="eyebrow">DOCUMENTO OFICIAL · NUTRÊ</p>
    <h1>Termos de Uso</h1>
    <p className="subhead">Última atualização: outubro de 2026. Leia com calma como funciona nossa plataforma.</p>
    <div className="legal-list">
      <section className="legal-card">
        <div className="legal-card-head"><FileText size={18} /><h2>1. Finalidade educativa e informativa</h2></div>
        <p>O Nutrê é uma ferramenta gratuita de educação nutricional e triagem antropométrica baseada nos parâmetros da Organização Mundial da Saúde (OMS), do Ministério da Saúde (SISVAN e Guia Alimentar para a População Brasileira) e da Tabela Brasileira de Composição de Alimentos (TACO/UNICAMP e TBCA/USP).</p>
      </section>
      <section className="legal-card">
        <div className="legal-card-head"><HeartPulse size={18} /><h2>2. Não substituição de atendimento profissional</h2></div>
        <p>Os cálculos de IMC, estimativas de calorias, distribuição de macronutrientes e respostas do Guia IA possuem caráter estritamente orientativo. Nenhuma informação da plataforma substitui diagnóstico clínico, prescrição dietética individualizada ou acompanhamento de nutricionista ou médico.</p>
      </section>
      <section className="legal-card">
        <div className="legal-card-head"><Bot size={18} /><h2>3. Uso responsável do Guia Nutrê (IA)</h2></div>
        <p>O assistente inteligente auxilia na compreensão dos seus resultados e na organização de refeições acessíveis com alimentos do seu cotidiano. Caso apresente condições clínicas específicas (como diabetes, hipertensão, gestação, alergias alimentares ou transtornos alimentares), procure orientação presencial em uma UBS ou consultório.</p>
      </section>
      <section className="legal-card">
        <div className="legal-card-head"><UserRound size={18} /><h2>4. Conta e veracidade das informações</h2></div>
        <p>Você é responsável por manter a confidencialidade da sua senha e por informar dados reais de idade, peso e altura para que as estimativas apresentadas sejam adequadas à sua faixa etária.</p>
      </section>
    </div>
    <Button onClick={() => go('register')}>Voltar ao cadastro</Button>
  </main>;
}

function PrivacyPage({ go }) {
  return <main className="auth-page legal-page">
    <button className="back" onClick={() => go('register')} aria-label="Voltar"><ArrowLeft /></button>
    <p className="eyebrow">PROTEÇÃO DE DADOS · LGPD</p>
    <h1>Política de Privacidade</h1>
    <p className="subhead">Transparência total sobre como cuidamos das suas informações pessoais (Lei nº 13.709/2018 — LGPD).</p>
    <div className="legal-list">
      <section className="legal-card">
        <div className="legal-card-head"><ShieldCheck size={18} /><h2>1. Quais dados coletamos</h2></div>
        <p>Coletamos apenas os dados essenciais para o funcionamento dos cálculos nutricionais: nome, e-mail, senha criptografada, idade, sexo biológico opcional, peso, altura e nível de atividade física.</p>
      </section>
      <section className="legal-card">
        <div className="legal-card-head"><Lock size={18} /><h2>2. Segurança e armazenamento</h2></div>
        <p>Sua senha é armazenada exclusivamente em formato de hash criptográfico (bcrypt) e nunca em texto puro. Não vendemos, alugamos nem compartilhamos seus dados pessoais ou histórico de saúde com terceiros para fins publicitários.</p>
      </section>
      <section className="legal-card">
        <div className="legal-card-head"><MapPin size={18} /><h2>3. Uso da localização (UBS próximas)</h2></div>
        <p>A localização geográfica do seu dispositivo só é utilizada quando você autoriza expressamente na aba de apoio para localizar Unidades Básicas de Saúde (UBS) próximas. Essa coordenada não fica gravada em histórico de rastreamento.</p>
      </section>
      <section className="legal-card">
        <div className="legal-card-head"><CheckCircle2 size={18} /><h2>4. Seus direitos</h2></div>
        <p>Você pode consultar seus dados registrados, atualizar seu peso, altura e nível de atividade ou limpar seu histórico de conversas com o Guia IA a qualquer momento diretamente pelo aplicativo.</p>
      </section>
    </div>
    <Button onClick={() => go('register')}>Voltar ao cadastro</Button>
  </main>;
}

function Nav({ page, setPage, mode }) {
  const second = mode === 'nutrition' ? ['foods', Apple, 'Alimentos'] : ['calculator', Calculator, 'Calcular'];
  const items = [['home', House, 'Início'], second, ['chat', Bot, 'Guia IA'], ['history', History, 'Histórico'], ['profile', UserRound, 'Conta']];
  return <nav className="bottom-nav">{items.map(([id, Icon, label]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}><Icon size={20} /><span>{label}</span></button>)}</nav>;
}
function Shell({ children, page, setPage, user, mode, onToggleMode }) {
  const isNutri = mode === 'nutrition';
  return <div className={`app-shell ${isNutri ? 'theme-nutrition' : ''} ${page === 'chat' ? 'is-chat' : ''}`}>
    <header>
      <div className="brand">{isNutri ? <Utensils /> : <HeartPulse />}<span>Nutrê</span></div>
      <div className="header-actions">
        <button type="button" className="mode-toggle" onClick={onToggleMode} aria-label={isNutri ? 'Alternar para modo Saúde' : 'Alternar para modo Nutrição'}>
          {isNutri ? <><HeartPulse size={15} /><span>Modo Saúde</span></> : <><Apple size={15} /><span>Modo Nutrição</span></>}
        </button>
        <button className="avatar" onClick={() => setPage('profile')} aria-label="Abrir conta">{(user.name || '?')[0]}</button>
      </div>
    </header>
    <main className="screen" key={`${mode}-${page}`}>{children}</main>
    <Nav page={page} setPage={setPage} mode={mode} />
  </div>;
}
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

const DIET_PROMPT = 'Preciso de ajuda para montar uma dieta acessível para o meu dia a dia, com base nas minhas calorias diárias e rotina de exercícios. Pode me perguntar quais alimentos eu mais tenho em casa (arroz, feijão, tipos de proteína, gorduras, frutas) e se pratico algum esporte ou atividade física?';

function Dashboard({ user, history, hasManual, loaded, setPage, mode, onStartDiet }) {
  const latest = history[0];
  const fromSignup = latest?.source === 'cadastro';
  const isNutri = mode === 'nutrition';
  return <>
    <p className="eyebrow">{isNutri ? 'MODO NUTRIÇÃO · TACO/UNICAMP' : fromSignup && !hasManual ? 'SEU PRIMEIRO RESULTADO' : 'HOJE É UM BOM DIA'}</p>
    <h1>Olá, {user.name.split(' ')[0]}.</h1>
    <p className="subhead">{isNutri ? 'Consulte a tabela nutricional dos alimentos e monte uma dieta acessível para a sua rotina.' : fromSignup && !hasManual ? 'Já calculamos seu IMC com os dados do seu cadastro.' : 'Vamos cuidar de você com calma?'}</p>
    {!loaded && !latest ? <Loading /> : latest ? (
      isNutri ? (
        <MacroCard item={latest} onClick={() => setPage('foods')} />
      ) : <>
        <button className="summary-card clickable" onClick={() => setPage('result')}><div><p>{fromSignup ? 'Calculado com os dados do cadastro' : 'Seu último resultado'}</p><div className="summary-main"><strong>IMC {bmiBR(latest.bmi)}</strong><span className={`pill ${toneOf(latest)}`}>{latest.classification}</span></div></div><small className="summary-link">Ver tabela e detalhes <ChevronRight size={15} /></small></button>
        <MacroCard item={latest} onClick={() => setPage('result')} />
      </>
    ) : <section className="summary-card empty"><Sparkles /><div><strong>Seu primeiro passo começa aqui</strong><p>Faça um cálculo para conhecer seu ponto de partida.</p></div></section>}
    <section className="section">
      <h2>{isNutri ? 'Nutrição e plano alimentar' : 'O que você precisa agora?'}</h2>
      {isNutri ? <>
        <button className="action-card" onClick={() => setPage('foods')}><div className="action-icon"><Apple /></div><div><b>Tabela nutricional de alimentos</b><span>Veja proteínas, gorduras, carboidratos e calorias de dezenas de alimentos (TACO/UNICAMP).</span></div><ChevronRight /></button>
        <button className="action-card diet-cta" onClick={onStartDiet}><div className="action-icon"><Utensils /></div><div><b>Montar dieta acessível com a IA</b><span>Cardápio feito com os alimentos que você tem em casa, segundo suas calorias e esportes.</span></div><ChevronRight /></button>
      </> : <>
        <button className="action-card" onClick={() => setPage('calculator')}><div className="action-icon"><Calculator /></div><div><b>{hasManual ? 'Calcular novamente' : 'Calcular IMC'}</b><span>{hasManual ? 'Atualize peso, altura e atividade.' : 'Confira seus dados e conheça seu IMC e suas necessidades.'}</span></div><ChevronRight /></button>
        <button className="action-card blue" onClick={() => setPage('chat')}><div className="action-icon"><Bot /></div><div><b>Conversar com o Guia Nutrê</b><span>Tire dúvidas sem linguagem difícil.</span></div><ChevronRight /></button>
      </>}
    </section>
  </>;
}

const DEFAULT_FOOD_CATEGORIES = [
  { id: 'todos', label: 'Todos' },
  { id: 'cereais', label: 'Arroz, pães e raízes' },
  { id: 'leguminosas', label: 'Feijões e grãos' },
  { id: 'carnes', label: 'Carnes, frango e peixes' },
  { id: 'ovos_laticinios', label: 'Ovos, leite e queijos' },
  { id: 'frios_pastas', label: 'Frios, embutidos e pastas' },
  { id: 'lanches_fastfood', label: 'Pizzas, lanches e sushi' },
  { id: 'frutas', label: 'Frutas' },
  { id: 'hortalicas', label: 'Verduras e legumes' },
  { id: 'oleos_sementes', label: 'Óleos, manteiga e castanhas' },
  { id: 'doces_bebidas', label: 'Doces, suplementos e bebidas' },
];

const FOODS_PAGE_SIZE = 10;
let cachedFoodsData = null;

function FoodsPage({ token, latest, onStartDiet }) {
  const [data, setData] = useState(cachedFoodsData);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('todos');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(!cachedFoodsData);
  const listTopRef = useRef(null);

  useEffect(() => {
    if (!cachedFoodsData) setLoading(true);
    api('/foods', {}, token)
      .then((res) => { cachedFoodsData = res; setData(res); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const rawCategories = data?.meta?.categories?.length ? data.meta.categories : DEFAULT_FOOD_CATEGORIES;
  const categories = rawCategories.map((c) => (typeof c === 'string' ? { id: c, label: c } : c));
  const categoryLabels = Object.fromEntries(categories.map((c) => [c.id, c.label]));
  const foods = data?.foods || [];
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const q = norm(search.trim());
  const filtered = foods.filter((f) => (category === 'todos' || f.category === category) && (!q || norm(f.name).includes(q) || norm(f.measure).includes(q) || norm(categoryLabels[f.category] || f.category).includes(q)));

  const totalPages = Math.max(1, Math.ceil(filtered.length / FOODS_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * FOODS_PAGE_SIZE;
  const pageItems = filtered.slice(startIdx, startIdx + FOODS_PAGE_SIZE);

  const goToPage = (nextPage) => {
    const clamped = Math.max(1, Math.min(totalPages, nextPage));
    setCurrentPage(clamped);
    if (listTopRef.current) {
      listTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const formatSourceRef = (ref) => {
    if (ref === 'TACO') return 'TACO · NEPA/UNICAMP';
    if (String(ref).includes('USDA')) return 'USDA FoodData / ANVISA';
    return 'TBCA · USP/FoRC';
  };

  return <div className="foods-page">
    <div>
      <p className="eyebrow">TABELA OFICIAL · TACO (UNICAMP), TBCA (USP) & USDA</p>
      <h1>Alimentos e nutrientes</h1>
      <p className="subhead">Consulte calorias, proteínas, carboidratos e gorduras por 100g e a média por unidade ou fatia.</p>

      <button type="button" className="diet-banner" onClick={onStartDiet}>
        <div className="diet-banner-icon"><Utensils size={20} /></div>
        <div>
          <b>Montar dieta com o Guia IA</b>
          <span>Use os alimentos que você já tem em casa{latest ? ` para atingir suas ${latest.calories.toLocaleString('pt-BR')} kcal/dia` : ''}.</span>
        </div>
        <ChevronRight size={18} />
      </button>

      <div ref={listTopRef} className="foods-search">
        <Search size={18} />
        <input
          type="search"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
          placeholder="Buscar (ex.: pizza, big mac, sushi, requeijão, peito de peru, ovo)..."
          aria-label="Buscar alimento"
        />
        {search && <button type="button" className="clear-search" onClick={() => { setSearch(''); setCurrentPage(1); }}>Limpar</button>}
      </div>

      <div className="category-chips" role="tablist" aria-label="Categorias de alimentos">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={category === cat.id ? 'active' : ''}
            onClick={() => { setCategory(cat.id); setCurrentPage(1); }}
          >
            {cat.id === 'todos' ? `${cat.label} (${foods.length})` : cat.label}
          </button>
        ))}
      </div>

      {loading ? <Loading /> : <>
        <div className="foods-meta-bar">
          <span>
            {filtered.length
              ? <>Mostrando <b>{startIdx + 1}–{Math.min(startIdx + FOODS_PAGE_SIZE, filtered.length)}</b> de <b>{filtered.length}</b> alimentos</>
              : <>Nenhum alimento encontrado</>}
          </span>
          <small>Valores por 100g</small>
        </div>
        {pageItems.length ? <>
          <div className="foods-list">
            {pageItems.map((f) => <article key={f.id} className="food-card">
              <div className="food-card-head">
                <div>
                  <span className="food-cat">{categoryLabels[f.category] || f.category}</span>
                  <b>{f.name}</b>
                  <small>{f.measure}</small>
                </div>
                <div className="food-kcal">
                  <strong>{f.kcal}</strong>
                  <span>kcal</span>
                </div>
              </div>
              <div className="food-macros">
                <div className="food-macro prot"><span>Proteínas</span><b>{decimalBR(f.protein)}g</b></div>
                <div className="food-macro carb"><span>Carboidratos</span><b>{decimalBR(f.carbs)}g</b></div>
                <div className="food-macro fat"><span>Gorduras</span><b>{decimalBR(f.fats)}g</b></div>
                <div className="food-macro fib"><span>Fibras</span><b>{decimalBR(f.fiber)}g</b></div>
              </div>
              <div className="food-foot">
                <span>Fonte científica: <b>{formatSourceRef(f.ref)}</b></span>
                <span>Porção de 100g</span>
              </div>
            </article>)}
          </div>
          {totalPages > 1 && (
            <nav className="foods-pagination" aria-label="Paginação de alimentos">
              <button
                type="button"
                className="page-btn"
                disabled={safePage <= 1}
                onClick={() => goToPage(safePage - 1)}
              >
                Anterior
              </button>
              <span className="page-indicator">
                Página <b>{safePage}</b> de <b>{totalPages}</b>
              </span>
              <button
                type="button"
                className="page-btn"
                disabled={safePage >= totalPages}
                onClick={() => goToPage(safePage + 1)}
              >
                Próxima
              </button>
            </nav>
          )}
        </> : <div className="empty-state"><Apple /><b>Nenhum alimento encontrado</b><p>Tente buscar por outro nome ou selecione "Todos" nas categorias.</p></div>}
      </>}
    </div>
    <div className="page-footer">
      <Button onClick={onStartDiet}><Bot size={19} /> Ajuda para montar dieta com a IA</Button>
    </div>
  </div>;
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
    <form className="form-grid calc-form" onSubmit={submit} noValidate><Field label="Peso de hoje (kg)" hint="Ex.: 68 ou 68,5"><input required type="text" inputMode="decimal" autoComplete="off" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} /></Field><Field label="Altura" hint="Em centímetros (170) ou metros (1,70)"><input required type="text" inputMode="decimal" autoComplete="off" value={form.height} onChange={(e) => setForm({ ...form, height: e.target.value })} /></Field><Field label="Nível de atividade"><select value={form.activity} onChange={(e) => setForm({ ...form, activity: e.target.value })}><option value="sedentario">Pouco ou nenhum (sem exercício)</option><option value="leve">Leve (1 a 3 dias na semana)</option><option value="moderado">Moderado (3 a 5 dias na semana)</option><option value="intenso">Intenso (6 a 7 dias na semana)</option></select></Field>{error && <div className="form-error" role="alert">{error}</div>}<div className="page-footer"><p className="disclaimer"><CircleHelp size={15} /> Esta é uma estimativa e não substitui acompanhamento profissional.</p><Button loading={loading}>{hasManual ? 'Calcular novamente' : 'Calcular IMC'}</Button></div></form></div>;
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

// Renderizador leve de Markdown para respostas ricas do Agente Gemini (negrito, títulos e listas).
function FormattedText({ text }) {
  const renderInline = (str) => {
    const parts = String(str || '').split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, idx) =>
      p.startsWith('**') && p.endsWith('**') ? <strong key={idx}>{p.slice(2, -2)}</strong> : p
    );
  };
  const lines = String(text || '').split('\n');
  return <div className="msg-body">
    {lines.map((raw, i) => {
      const line = raw.trim();
      if (!line) return <div key={i} className="msg-spacer" />;
      if (/^#{1,4}\s+/.test(line)) return <b key={i} className="msg-heading">{renderInline(line.replace(/^#{1,4}\s+/, ''))}</b>;
      if (/^[-•*]\s+/.test(line)) return <div key={i} className="msg-bullet"><span>•</span><div>{renderInline(line.replace(/^[-•*]\s+/, ''))}</div></div>;
      return <p key={i}>{renderInline(line)}</p>;
    })}
  </div>;
}

function Chat({ token, mode, pendingPrompt, onConsumePrompt }) {
  const isNutri = mode === 'nutrition';
  const greeting = isNutri
    ? 'Olá! Eu sou o Guia Nutrê. Posso ajudar a montar uma dieta acessível com os alimentos que você tem em casa (baseada na tabela TACO/UNICAMP) ou tirar dúvidas sobre nutrição.'
    : 'Olá! Eu sou o Guia Nutrê. Posso explicar seu resultado, analisar sua evolução ou tirar dúvidas em palavras simples.';

  const [messages, setMessages] = useState(() => [{ role: 'assistant', text: greeting }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const autoSentRef = useRef(false);
  const listRef = useRef(null);
  const lastUserMsgRef = useRef(null);

  // Posiciona o scroll no comentário do usuário (topo da lista) para ele ler o início da resposta e descer no seu ritmo.
  const scrollToUserMessage = useCallback(() => {
    setTimeout(() => {
      if (listRef.current && lastUserMsgRef.current) {
        const listTop = listRef.current.getBoundingClientRect().top;
        const msgTop = lastUserMsgRef.current.getBoundingClientRect().top;
        listRef.current.scrollTop += msgTop - listTop - 6;
      }
    }, 40);
  }, []);

  const sendMessage = useCallback(async (text, currentHistory) => {
    const q = String(text || '').trim();
    if (!q) return;
    setShowInfo(false);
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setInput('');
    setLoading(true);
    scrollToUserMessage();
    try {
      const d = await api('/chat', { method: 'POST', body: JSON.stringify({ message: q, mode, history: currentHistory }) }, token);
      setMessages((m) => [...m, { role: 'assistant', text: d.answer }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', text: err.message }]);
    } finally {
      setLoading(false);
      scrollToUserMessage();
    }
  }, [token, mode, scrollToUserMessage]);

  // Carrega histórico persistido no banco (ou dispara o prompt automático de montar dieta).
  useEffect(() => {
    let active = true;
    api('/chat/history', {}, token)
      .then((res) => {
        if (!active) return;
        const saved = Array.isArray(res.messages) ? res.messages : [];
        if (pendingPrompt && !autoSentRef.current) {
          autoSentRef.current = true;
          onConsumePrompt?.();
          if (saved.length) setMessages([{ role: 'assistant', text: greeting }, ...saved]);
          sendMessage(pendingPrompt, saved);
        } else if (saved.length) {
          setMessages([{ role: 'assistant', text: greeting }, ...saved]);
          scrollToUserMessage();
        }
      })
      .catch(() => {
        if (pendingPrompt && !autoSentRef.current) {
          autoSentRef.current = true;
          onConsumePrompt?.();
          sendMessage(pendingPrompt, []);
        }
      });
    return () => { active = false; };
  }, [token, pendingPrompt, onConsumePrompt, sendMessage, greeting, scrollToUserMessage]);

  const clearChat = async () => {
    setShowInfo(false);
    try { await api('/chat/history', { method: 'DELETE' }, token); } catch { /* ignore */ }
    setMessages([{ role: 'assistant', text: greeting }]);
  };

  const send = (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    sendMessage(input.trim(), messages.slice(1));
  };

  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') { lastUserIdx = i; break; }
  }

  const infoText = isNutri
    ? 'Baseado no Guia Alimentar do Ministério da Saúde e na Tabela TACO/UNICAMP. Não substitui nutricionista ou médico.'
    : 'Orientação educativa baseada na OMS e Ministério da Saúde. Não substitui atendimento nutricional ou médico.';

  return <div className="chat-page">
    <div className="chat-header-block">
      <div className="chat-top-row">
        <div>
          <p className="eyebrow">{isNutri ? 'GUIA NUTRÊ · NUTRIÇÃO' : 'GUIA NUTRÊ · SAÚDE'}</p>
          <h1 className="chat-title">{isNutri ? 'Monte sua dieta.' : 'Converse com calma.'}</h1>
        </div>
        <div className="chat-top-actions">
          {messages.length > 1 && (
            <button type="button" className="clear-chat-btn" onClick={clearChat} disabled={loading}>
              Nova conversa
            </button>
          )}
          <div className="chat-info-wrap">
            <button
              type="button"
              className={`chat-info-btn ${showInfo ? 'active' : ''}`}
              onClick={() => setShowInfo((v) => !v)}
              aria-label="Referências científicas e aviso"
              aria-expanded={showInfo}
            >
              <CircleHelp size={18} />
            </button>
            <div className={`chat-info-popover ${showInfo ? 'open' : ''}`} role="tooltip">
              <b>Informação importante</b>
              <span>{infoText}</span>
            </div>
          </div>
        </div>
      </div>
      <p className="subhead chat-subhead">{isNutri ? 'Adaptamos às suas calorias, treinos e ao que você tem em casa.' : 'Respostas simples, com cuidado e responsabilidade.'}</p>
    </div>

    <div ref={listRef} className="chat-list" onClick={() => showInfo && setShowInfo(false)}>
      {messages.map((m, i) => (
        <div key={i} ref={i === lastUserIdx ? lastUserMsgRef : null} className={`bubble ${m.role}`}>
          {m.role === 'assistant' && <Bot size={17} />}
          <FormattedText text={m.text} />
        </div>
      ))}
      {loading && <div className="bubble assistant"><Bot size={17} /><span className="typing"><i /><i /><i /></span></div>}
    </div>

    <div className="page-footer chat-footer">
      <form className="chat-form" onSubmit={send}>
        <label className="sr-only" htmlFor="question">Sua pergunta</label>
        <input id="question" value={input} onFocus={() => setShowInfo(false)} onChange={(e) => setInput(e.target.value)} placeholder="Digite sua mensagem..." />
        <button aria-label="Enviar pergunta" disabled={!input.trim() || loading}><Send size={20} /></button>
      </form>
    </div>
  </div>;
}

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
const ACTIVITY_LABELS = { sedentario: 'Sedentário (sem exercício)', leve: 'Atividade leve (1 a 3 dias/sem)', moderado: 'Atividade moderada (3 a 5 dias/sem)', intenso: 'Atividade intensa (6 a 7 dias/sem)' };
const SOURCES = [
  { badge: 'NEPA / UNICAMP · TACO 4ª ed.', title: 'Tabela Brasileira de Composição de Alimentos (TACO)', desc: 'Referência oficial brasileira coordenada pela UNICAMP e Ministério da Saúde com análise laboratorial de calorias, proteínas, carboidratos, lipídios e fibras dos alimentos.', url: 'https://www.cfn.org.br/wp-content/uploads/2017/03/taco_4_edicao_ampliada_e_revisada.pdf', linkLabel: 'unicamp.br / cfn.org.br' },
  { badge: 'USP / FoRC · TBCA', title: 'Tabela Brasileira de Composição de Alimentos (USP)', desc: 'Base científica da Universidade de São Paulo e Food Research Center (FoRC/FAPESP) com composição nutricional por 100g e medidas caseiras.', url: 'https://www.tbca.net.br/', linkLabel: 'tbca.net.br' },
  { badge: 'USDA & ANVISA · RDC 429', title: 'USDA FoodData Central & Tabelas Nutricionais Oficiais', desc: 'Base oficial do Departamento de Agricultura dos EUA (USDA) e rotulagem nutricional padronizada (ANVISA) utilizada para referências de lanches rápidos, pizzas, hambúrgueres e culinária japonesa.', url: 'https://fdc.nal.usda.gov/', linkLabel: 'fdc.nal.usda.gov' },
  { badge: 'Ministério da Saúde · Brasil', title: 'Guia Alimentar para a População Brasileira', desc: 'Diretrizes oficiais sobre alimentação adequada, acessível e saudável, priorizando alimentos in natura ou minimamente processados da cultura alimentar brasileira.', url: 'https://bvsms.saude.gov.br/bvs/publicacoes/guia_alimentar_populacao_brasileira_2ed.pdf', linkLabel: 'bvsms.saude.gov.br' },
  { badge: 'OMS · Adultos', title: 'Organização Mundial da Saúde (WHO)', desc: 'Pontos de corte de IMC para adultos (20 a 59 anos): Baixo peso, Eutrofia, Sobrepeso e Obesidade graus I, II e III (WHO Technical Report Series 894, 2000).', url: 'https://www.who.int/news-room/fact-sheets/detail/obesity-and-overweight', linkLabel: 'who.int' },
  { badge: 'Ministério da Saúde · SISVAN', title: 'Vigilância Alimentar e Nutricional', desc: 'Protocolos oficiais do SUS para avaliação antropométrica na Atenção Primária, incluindo a referência de Lipschitz (1994) para pessoas idosas (60+ anos).', url: 'https://aps.saude.gov.br/ape/vigilanciaalimentar/sisvan', linkLabel: 'aps.saude.gov.br' },
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
  const [mode, setMode] = useState(() => storage.get('nutre-mode', 'health'));
  const [pendingPrompt, setPendingPrompt] = useState(null);
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
  useEffect(() => { if (page === 'foods' && mode !== 'nutrition') { setMode('nutrition'); storage.set('nutre-mode', 'nutrition'); } }, [page, mode]);

  const toggleMode = useCallback(() => {
    const nextMode = mode === 'nutrition' ? 'health' : 'nutrition';
    setMode(nextMode);
    storage.set('nutre-mode', nextMode);
    if (nextMode === 'nutrition' && page === 'calculator') setPage('foods');
    else if (nextMode === 'health' && page === 'foods') setPage('calculator');
  }, [mode, page, setPage]);

  const startDiet = useCallback(() => {
    setPendingPrompt(DIET_PROMPT);
    setPage('chat');
  }, [setPage]);

  const clearSession = useCallback(() => { storage.remove('nutre-auth', 'nutre-token', 'nutre-history', 'nutre-page', 'nutre-mode'); setMode('health'); setAuth(null); setHistory([]); setSelected(null); setLoaded(false); }, []);
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
    storage.set('nutre-mode', 'health'); setMode('health');
    if (d.initialCalculation) { setHistory([d.initialCalculation]); storage.set('nutre-history', [d.initialCalculation]); }
    setLoaded(false); setAuth(session); setPage('home');
  };
  const onSaved = async (v) => { const d = await api('/calculations', { method: 'POST', body: JSON.stringify(v) }, auth.token); setSelected(null); setHistory((h) => { const next = [d, ...h]; storage.set('nutre-history', next); return next; }); setAuth((a) => { const updated = { ...a, user: { ...a.user, weight: d.weight, height: d.height, activity: d.activity } }; storage.set('nutre-auth', updated); return updated; }); };
  const logout = () => { clearSession(); setPage('landing'); };

  if (!auth) {
    const p = resolvePage(page, false);
    const pubViews = {
      register: <Register go={setPage} onAuth={onAuth} />,
      login: <Login go={setPage} onAuth={onAuth} />,
      forgot: <ForgotPassword go={setPage} />,
      terms: <TermsPage go={setPage} />,
      privacy: <PrivacyPage go={setPage} />,
      about: <About go={setPage} />,
      landing: <Landing go={setPage} />,
    };
    return <div className="public-wrap">{pubViews[p] || pubViews.landing}</div>;
  }
  const current = resolvePage(page, true);
  const hasManual = history.some((c) => c.source === 'manual');
  const result = selected || history[0] || null;
  const views = {
    home: <Dashboard user={auth.user} history={history} hasManual={hasManual} loaded={loaded} setPage={setPage} mode={mode} onStartDiet={startDiet} />,
    calculator: <CalculatorPage user={auth.user} hasManual={hasManual} onSaved={onSaved} setPage={setPage} />,
    foods: <FoodsPage token={auth.token} latest={history[0]} onStartDiet={startDiet} />,
    result: <Result result={result} loaded={loaded} setPage={setPage} />,
    chat: <Chat token={auth.token} mode={mode} pendingPrompt={pendingPrompt} onConsumePrompt={() => setPendingPrompt(null)} />,
    history: <HistoryPage history={history} hasManual={hasManual} loaded={loaded} onOpen={(item) => { setSelected(item); setPage('result'); }} setPage={setPage} />,
    support: <Support token={auth.token} />,
    profile: <Profile user={auth.user} history={history} setPage={setPage} onLogout={logout} />,
  };
  return <Shell page={current} setPage={(p) => { if (p !== 'result') setSelected(null); setPage(p); }} user={auth.user} mode={mode} onToggleMode={toggleMode}>{views[current]}</Shell>;
}
createRoot(document.getElementById('root')).render(<App />);
