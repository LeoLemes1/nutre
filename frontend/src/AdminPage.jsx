import React, { useCallback, useEffect, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Clock, Globe, ScrollText, Search, ShieldCheck, ShieldOff, Trash2, UserRound, Users, X } from 'lucide-react';

// Painel administrativo (somente role "admin"). Recebe `api`, `parseDate` e `Button` do app para manter o mesmo padrão.
const AUDIT_LABELS = {
  register: ['Cadastro', 'good'],
  login: ['Entrada', 'good'],
  login_failed: ['Login falhou', 'warning'],
  password_reset: ['Senha redefinida', 'warning'],
  role_promote: ['Promoção a admin', 'good'],
  role_demote: ['Rebaixamento', 'warning'],
  user_delete: ['Exclusão', 'risk'],
};

const fmtDateTime = (parseDate, v) => {
  const d = parseDate(v);
  return d ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d) : '—';
};

function Pagination({ page, pages, total, label, onChange }) {
  if (!total) return null;
  return <nav className="admin-pagination" aria-label="Paginação">
    <span>{total} {label}</span>
    <div>
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Página anterior"><ChevronLeft size={18} /></button>
      <b>{page} / {pages}</b>
      <button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Próxima página"><ChevronRight size={18} /></button>
    </div>
  </nav>;
}

export function AdminPage({ api, token, me, parseDate, Button }) {
  const [tab, setTab] = useState('users');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [usersPage, setUsersPage] = useState(1);
  const [users, setUsers] = useState(null);
  const [auditPage, setAuditPage] = useState(1);
  const [audit, setAudit] = useState(null);
  const [auditUser, setAuditUser] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dt = (v) => fmtDateTime(parseDate, v);

  useEffect(() => { const t = setTimeout(() => { setQuery(search.trim()); setUsersPage(1); }, 300); return () => clearTimeout(t); }, [search]);

  const loadUsers = useCallback(async () => {
    try {
      const d = await api(`/admin/users?page=${usersPage}&pageSize=8&q=${encodeURIComponent(query)}`, {}, token);
      if (d.page > d.pages) { setUsersPage(d.pages); return; }
      setUsers(d); setError('');
    } catch (e) { setError(e.message); }
  }, [api, token, usersPage, query]);
  useEffect(() => { loadUsers(); }, [loadUsers]);

  useEffect(() => {
    if (tab !== 'audit') return;
    api(`/admin/audit?page=${auditPage}&pageSize=10${auditUser ? `&userId=${auditUser.id}` : ''}`, {}, token)
      .then((d) => { setAudit(d); setError(''); }).catch((e) => setError(e.message));
  }, [api, token, tab, auditPage, auditUser]);

  const openAudit = (u) => { setAuditUser(u); setAuditPage(1); setAudit(null); setTab('audit'); };
  const clearAuditUser = () => { setAuditUser(null); setAuditPage(1); setAudit(null); };

  const runConfirm = async () => {
    const { type, user } = confirm; setBusy(true);
    try {
      if (type === 'delete') await api(`/admin/users/${user.id}`, { method: 'DELETE' }, token);
      else await api(`/admin/users/${user.id}/role`, { method: 'PATCH', body: JSON.stringify({ role: type === 'promote' ? 'admin' : 'user' }) }, token);
      setConfirm(null); setAudit(null); await loadUsers();
    } catch (e) { setError(e.message); setConfirm(null); } finally { setBusy(false); }
  };

  const actions = (u, labeled = false) => {
    const locked = u.protected || u.id === me.id;
    return <div className={`admin-actions ${labeled ? 'labeled' : 'icons'}`}>
      <button type="button" onClick={() => openAudit(u)} title="Ver auditoria" aria-label="Ver auditoria"><ScrollText size={20} />{labeled && <span>Auditoria</span>}</button>
      {!locked && (u.role === 'admin'
        ? <button type="button" onClick={() => setConfirm({ type: 'demote', user: u })} title="Remover admin" aria-label="Remover admin"><ShieldOff size={20} />{labeled && <span>Remover admin</span>}</button>
        : <button type="button" onClick={() => setConfirm({ type: 'promote', user: u })} title="Tornar admin" aria-label="Tornar admin"><ShieldCheck size={20} />{labeled && <span>Tornar admin</span>}</button>)}
      {!locked && <button type="button" className="danger" onClick={() => setConfirm({ type: 'delete', user: u })} title="Excluir usuário" aria-label="Excluir usuário"><Trash2 size={20} />{labeled && <span>Excluir</span>}</button>}
    </div>;
  };
  const roleBadge = (u) => <span className={`admin-pill ${u.role}`}>{u.role === 'admin' ? (u.protected ? 'Admin principal' : 'Admin') : 'Usuário'}</span>;

  const stats = users?.stats;
  const confirmText = confirm && ({
    delete: [`Excluir ${confirm.user.name}?`, 'A conta, os cálculos e o histórico de chat deste usuário serão apagados. Esta ação não pode ser desfeita. O registro na auditoria é mantido.', 'Excluir usuário'],
    promote: [`Tornar ${confirm.user.name} administrador?`, 'Essa pessoa poderá ver todos os usuários, excluir contas e consultar a auditoria.', 'Tornar admin'],
    demote: [`Remover o acesso de admin de ${confirm.user.name}?`, 'A pessoa volta a ser um usuário comum.', 'Remover admin'],
  })[confirm.type];

  return <div className="admin-page">
    <p className="eyebrow">ADMINISTRAÇÃO</p><h1>Painel do admin</h1>
    <p className="subhead">Gerencie usuários e acompanhe tudo o que acontece no app.</p>

    <div className="admin-stats">
      <div className="admin-stat"><span><Users size={16} /></span><div><small>Usuários</small><b>{stats?.total ?? '—'}</b></div></div>
      <div className="admin-stat"><span><ShieldCheck size={16} /></span><div><small>Admins</small><b>{stats?.admins ?? '—'}</b></div></div>
      <div className="admin-stat"><span><Clock size={16} /></span><div><small>Ativos em 24h</small><b>{stats?.active24h ?? '—'}</b></div></div>
    </div>

    <div className="admin-tabs" role="tablist">
      <button type="button" role="tab" aria-selected={tab === 'users'} className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}><Users size={16} /> Usuários</button>
      <button type="button" role="tab" aria-selected={tab === 'audit'} className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}><ScrollText size={16} /> Auditoria</button>
    </div>

    {error && <div className="form-error" role="alert">{error}</div>}

    {tab === 'users' && <section>
      <label className="admin-search"><Search size={17} /><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou e-mail" aria-label="Buscar usuários" /></label>
      {!users ? <div className="loading-card" role="status"><span className="spinner dark" /> Carregando usuários…</div>
        : users.users.length === 0 ? <div className="empty-state"><UserRound size={28} /><b>Nenhum usuário encontrado</b><p>Tente buscar por outro nome ou e-mail.</p></div>
        : <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th><UserRound size={15} /> Usuário</th><th><ShieldCheck size={15} /> Perfil</th><th><Clock size={15} /> Último acesso</th><th><Calendar size={15} /> Cadastro</th><th><Globe size={15} /> IP de cadastro</th><th>Ações</th></tr></thead>
              <tbody>{users.users.map((u) => <tr key={u.id}>
                <td><div className="admin-user-cell"><div className="profile-icon"><UserRound size={22} /></div><div><b>{u.name}</b><span>{u.email}</span></div></div></td>
                <td>{roleBadge(u)}</td>
                <td><span className="admin-when"><Clock size={16} />{dt(u.last_access_at)}</span></td>
                <td><span className="admin-when"><Calendar size={16} />{dt(u.created_at)}</span></td>
                <td><span className="admin-when"><Globe size={16} /><code>{u.created_ip || '—'}</code></span></td>
                <td>{actions(u)}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="admin-cards">
            {users.users.map((u) => <article className="admin-card" key={u.id}>
              <div className="admin-card-head"><div className="profile-icon"><UserRound size={20} /></div><div className="profile-info"><b>{u.name}</b><span>{u.email}</span></div>{roleBadge(u)}</div>
              <dl>
                <div><dt><Clock size={13} /> Último acesso</dt><dd>{dt(u.last_access_at)}</dd></div>
                <div><dt>Cadastro</dt><dd>{dt(u.created_at)}</dd></div>
                <div><dt><Globe size={13} /> IP de cadastro</dt><dd><code>{u.created_ip || '—'}</code></dd></div>
              </dl>
              {actions(u)}
            </article>)}
          </div>
          <Pagination page={users.page} pages={users.pages} total={users.total} label={users.total === 1 ? 'usuário' : 'usuários'} onChange={setUsersPage} />
        </>}
    </section>}

    {tab === 'audit' && <section>
      {auditUser && <div className="admin-filter"><span>Filtrando por <b>{auditUser.email}</b></span><button type="button" onClick={clearAuditUser} aria-label="Limpar filtro"><X size={15} /></button></div>}
      {!audit ? <div className="loading-card" role="status"><span className="spinner dark" /> Carregando auditoria…</div>
        : audit.items.length === 0 ? <div className="empty-state"><ScrollText size={28} /><b>Sem registros</b><p>Nenhum evento encontrado para este filtro.</p></div>
        : <>
          <ul className="admin-audit">
            {audit.items.map((i) => { const [label, tone] = AUDIT_LABELS[i.action] || [i.action, 'warning']; return <li key={i.id}>
              <span className={`pill ${tone}`}>{label}</span>
              <div className="admin-audit-main">
                <b>{i.target_email || i.actor_email || '—'}</b>
                <span>{i.detail}{i.actor_email && i.target_email && i.actor_email !== i.target_email ? ` · por ${i.actor_email}` : ''}</span>
              </div>
              <div className="admin-audit-meta"><time>{dt(i.created_at)}</time><code>{i.ip || '—'}</code></div>
            </li>; })}
          </ul>
          <Pagination page={audit.page} pages={audit.pages} total={audit.total} label={audit.total === 1 ? 'registro' : 'registros'} onChange={setAuditPage} />
        </>}
    </section>}

    {confirm && <div className="admin-modal" role="dialog" aria-modal="true" aria-label={confirmText[0]} onClick={() => !busy && setConfirm(null)}>
      <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>{confirmText[0]}</h2><p>{confirmText[1]}</p>
        <div className="admin-modal-actions">
          <Button variant="secondary" onClick={() => setConfirm(null)} disabled={busy}>Cancelar</Button>
          <Button variant={confirm.type === 'delete' ? 'danger' : 'primary'} onClick={runConfirm} loading={busy}>{confirmText[2]}</Button>
        </div>
      </div>
    </div>}
  </div>;
}
