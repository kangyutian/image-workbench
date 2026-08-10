import { FormEvent, useEffect, useState } from "react";
import { BarChart3, Image, Loader2, LogOut, Plus, RefreshCw, ShieldCheck, Trash2, Users, X } from "lucide-react";
import App from "./App";
import { createUser, deleteUser, getCurrentUser, getUsageSummary, listUsers, signIn, signOut, syncUsage, type UsageAccountSummary, type UsageSummary, type WorkbenchRole, type WorkbenchUser } from "./authApi";

type View = "workbench" | "users" | "usage";

function LoginScreen({ onSignedIn }: { onSignedIn: (user: WorkbenchUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      onSignedIn(await signIn(username, password));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="login-screen"><form className="login-form" onSubmit={submit}>
    <div className="login-mark"><Image size={26} /></div>
    <p className="eyebrow">AI Image Workbench</p><h1>登录工作台</h1>
    <label className="field"><span>用户名</span><input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
    <label className="field"><span>密码</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
    {error && <p className="inline-error">{error}</p>}
    <button className="login-submit" disabled={loading}>{loading ? <Loader2 className="spin" size={18} /> : null}登录</button>
  </form></main>;
}

function UserManagement({ currentUser }: { currentUser: WorkbenchUser }) {
  const [users, setUsers] = useState<WorkbenchUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<WorkbenchRole>("user");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true); setError("");
    try { setUsers(await listUsers()); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load users."); } finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);

  async function addUser(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await createUser(username, password, role);
      setUsername(""); setPassword(""); setRole("user"); setShowCreate(false);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create user."); } finally { setSaving(false); }
  }
  async function removeUser(user: WorkbenchUser) {
    if (!window.confirm(`删除用户 ${user.username}？此操作无法撤销。`)) return;
    try { await deleteUser(user.username); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to delete user."); }
  }
  const activeUsers = users.length;

  return <section className="user-admin" aria-label="用户管理">
    <header className="user-admin-header"><div><p className="eyebrow">Access control</p><h1>用户管理</h1><p>管理工作台用户账号、角色与访问权限。</p></div><div className="admin-only"><ShieldCheck size={17} />仅管理员可操作</div></header>
    <section className="user-summary"><div><span>用户总数</span><strong>{users.length} 人</strong></div><div><span>活跃用户</span><strong>{activeUsers} 人</strong></div><button className="create-user-button" onClick={() => setShowCreate(true)}><Plus size={19} />新增用户</button></section>
    {error && <p className="inline-error">{error}</p>}
    <section className="user-table-wrap">
      <div className="user-table" role="table"><div className="user-row user-table-head" role="row"><span>用户名</span><span>角色</span><span>创建时间</span><span>最近登录</span><span>状态</span><span>操作</span></div>
      {loading ? <div className="user-loading"><Loader2 className="spin" size={20} />正在加载用户</div> : users.map((user) => <div className="user-row" role="row" key={user.username}>
        <strong>{user.username}</strong><span>{user.role === "admin" ? "管理员" : "普通用户"}</span><span>{formatDate(user.createdAt)}</span><span>{user.lastLoginAt ? formatDate(user.lastLoginAt) : "尚未登录"}</span><span><i className="status-dot" />活跃</span><span>{user.username !== currentUser.username && <button className="icon-danger" title={`删除 ${user.username}`} onClick={() => void removeUser(user)}><Trash2 size={17} /></button>}</span>
      </div>)}</div>
    </section>
    {showCreate && <div className="modal-backdrop" role="presentation"><form className="user-dialog" onSubmit={addUser}><header><div><p className="eyebrow">New user</p><h2>新增用户</h2></div><button type="button" className="icon-button" title="关闭" onClick={() => setShowCreate(false)}><X size={19} /></button></header><label className="field"><span>用户名</span><input value={username} onChange={(event) => setUsername(event.target.value)} pattern="[A-Za-z0-9_.-]{3,48}" required /></label><label className="field"><span>初始密码</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} required /></label><label className="field"><span>角色</span><select value={role} onChange={(event) => setRole(event.target.value as WorkbenchRole)}><option value="user">普通用户</option><option value="admin">管理员</option></select></label><footer><button type="button" className="secondary-button" onClick={() => setShowCreate(false)}>取消</button><button className="create-user-button" disabled={saving}>{saving ? "创建中" : "创建用户"}</button></footer></form></div>}
  </section>;
}

function formatDate(value?: string | null) { return value ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-"; }

function formatUsageUsd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 3, maximumFractionDigits: 6 }).format(value || 0);
}

function UsageAccountRow({ account }: { account: UsageAccountSummary }) {
  return <details className="usage-account-row">
    <summary>
      <span className="usage-account-name"><strong>{account.username}</strong><small className={account.status === "deleted" ? "deleted-account" : ""}>{account.status === "deleted" ? "已删除账号" : "活跃账号"}</small></span>
      <span>{account.taskCount}</span>
      <span>{account.successCount} / {account.failureCount}</span>
      <span>{account.resultCount}</span>
      <strong>{formatUsageUsd(account.amountUsd)}</strong>
    </summary>
    <div className="usage-model-detail">
      {account.models.length === 0 ? <span className="muted">暂无任务记录</span> : account.models.map((model) => <div className="usage-model-row" key={`${model.kind}:${model.modelId}`}>
        <span><strong>{model.modelId}</strong><small>{model.kind === "image" ? "图片" : "视频"}</small></span>
        <span>{model.taskCount} 个任务</span>
        <span>{model.successCount} 成功 / {model.failureCount} 失败</span>
        <span>{model.resultCount} 个结果</span>
        <strong>{formatUsageUsd(model.amountUsd)}</strong>
      </div>)}
    </div>
  </details>;
}

function UsageManagement() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      setError("");
      setUsage(await getUsageSummary());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法加载用量统计。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    if (!usage?.sync.running) return undefined;
    const timer = window.setInterval(() => { void refresh(); }, 2000);
    return () => window.clearInterval(timer);
  }, [usage?.sync.running]);

  async function forceSync() {
    setSyncing(true);
    setError("");
    try {
      await syncUsage();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "账单同步启动失败。");
    } finally {
      setSyncing(false);
    }
  }

  return <section className="usage-admin" aria-label="账号用量统计">
    <header className="usage-admin-header">
      <div><p className="eyebrow">Account usage</p><h1>账号用量统计</h1><p>按账号查看任务数量、生成结果与 WaveSpeed 实际扣费。</p></div>
      <button className="secondary-button" type="button" onClick={() => void forceSync()} disabled={syncing || usage?.sync.running}><RefreshCw size={17} className={syncing || usage?.sync.running ? "spin" : ""} />{syncing || usage?.sync.running ? "同步中" : "刷新账单"}</button>
    </header>
    {error && <p className="inline-error">{error}</p>}
    {loading && !usage ? <div className="user-loading"><Loader2 className="spin" size={20} />正在加载用量统计</div> : usage ? <>
      <section className="usage-summary-grid">
        <div><span>累计实际费用</span><strong>{formatUsageUsd(usage.totals.amountUsd)}</strong></div>
        <div><span>累计任务</span><strong>{usage.totals.taskCount}</strong><small>{usage.totals.imageTaskCount} 图片 · {usage.totals.videoTaskCount} 视频</small></div>
        <div><span>使用账号</span><strong>{usage.accounts.filter((account) => account.taskCount > 0).length}</strong><small>共 {usage.accounts.length} 个账号</small></div>
        <div><span>待同步账单</span><strong>{usage.pendingSyncCount}</strong><small>{usage.lastSyncedAt ? `上次同步：${formatDate(usage.lastSyncedAt)}` : "尚未同步"}</small></div>
      </section>
      <section className="usage-table-wrap">
        <div className="usage-table-head"><span>账号</span><span>任务数</span><span>成功 / 失败</span><span>结果数</span><span>实际费用</span></div>
        <div className="usage-account-list">{usage.accounts.length === 0 ? <div className="user-loading">暂无账号记录</div> : usage.accounts.map((account) => <UsageAccountRow account={account} key={account.username} />)}</div>
      </section>
      <p className="usage-footnote">统计从 {formatDate(usage.trackingStartedAt)} 开始；费用仅采用 WaveSpeed Billing 返回并按 prediction UUID 匹配的扣费记录。</p>
    </> : null}
  </section>;
}

export default function AuthenticatedApp() {
  const [user, setUser] = useState<WorkbenchUser | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("workbench");
  useEffect(() => { void getCurrentUser().then(setUser).catch(() => setUser(null)).finally(() => setReady(true)); }, []);
  if (!ready) return <main className="boot-screen"><Loader2 className="spin" size={26} /></main>;
  if (!user) return <LoginScreen onSignedIn={setUser} />;
  async function logout() { await signOut(); setUser(null); setView("workbench"); }
  return <div className="protected-shell"><aside className="app-sidebar"><div className="brand"><Image size={24} /><span>AI 生图工作台</span></div><nav><button className={view === "workbench" ? "active" : ""} onClick={() => setView("workbench")}><Image size={19} />工作台</button>{user.role === "admin" && <><button className={view === "users" ? "active" : ""} onClick={() => setView("users")}><Users size={19} />用户管理</button><button className={view === "usage" ? "active" : ""} onClick={() => setView("usage")}><BarChart3 size={19} />用量统计</button></>}</nav><div className="sidebar-account"><span><ShieldCheck size={17} />{user.username}</span><button title="退出登录" onClick={() => void logout()}><LogOut size={18} /></button></div></aside><main className="protected-content">{view === "users" && user.role === "admin" ? <UserManagement currentUser={user} /> : view === "usage" && user.role === "admin" ? <UsageManagement /> : <App />}</main></div>;
}
