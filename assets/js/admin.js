/* ══════════════════════════ STATE ══════════════════════════ */
// Supabase config values are loaded from admin-config.js.
let SESSION_USER = null;

let ALL_LEADS = [], FILTERED = [], SORT_COL = 'submitted_at', SORT_DIR = 'desc', PAGE = 1;
let PER_PAGE = 15;
let refreshTimer = null;

/* ══════════════════════════ AUTH ══════════════════════════ */
function togglePwVis(id, btn) {
  const el = document.getElementById(id);
  const show = el.type === 'password';
  el.type = show ? 'text' : 'password';
  btn.textContent = show ? '🙈' : '👁';
}

async function doEmailLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;
  let ok = true;
  document.getElementById('loginEmailErr').classList.remove('show');
  document.getElementById('loginPassErr').classList.remove('show');
  if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    document.getElementById('loginEmailErr').classList.add('show'); ok=false;
  }
  if (!pass) {
    document.getElementById('loginPassErr').classList.add('show'); ok=false;
  }
  if (!ok) return;

  const btn = document.getElementById('loginBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div>';

  // Try Supabase Auth first, fall back to local credentials
  let loggedIn = false;
  try {
    const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY },
      body: JSON.stringify({ email, password: pass })
    });
    const data = await res.json();
    if (data.access_token) {
      SESSION_USER = { email: data.user?.email || email, name: data.user?.user_metadata?.name || email.split('@')[0] };
      localStorage.setItem('lf_session', JSON.stringify(SESSION_USER));
      loggedIn = true;
    }
  } catch(e) {}

  // Local fallback
  if (!loggedIn) {
    if (email === ADMIN_EMAIL && pass === ADMIN_PASS) {
      SESSION_USER = { email, name: 'Admin' };
      localStorage.setItem('lf_session', JSON.stringify(SESSION_USER));
      loggedIn = true;
    }
  }

  if (loggedIn) {
    enterDashboard();
  } else {
    btn.disabled = false;
    btn.innerHTML = '<span>Sign In to Dashboard</span>';
    showToast('Invalid email or password', 'error');
    document.getElementById('loginPassErr').textContent = 'Invalid credentials';
    document.getElementById('loginPassErr').classList.add('show');
  }
}

function showForgot() {
  const email = document.getElementById('loginEmail').value;
  if (email) {
    showToast('Password reset email sent to ' + email, 'success');
  } else {
    document.getElementById('loginEmail').focus();
    showToast('Enter your email first', 'error');
  }
}

function enterDashboard() {
  document.getElementById('loginScreen').classList.add('hide');
  const dash = document.getElementById('dashScreen');
  dash.classList.add('show');
  dash.style.display = 'flex';
  setTimeout(() => { dash.style.opacity = '1'; }, 50);

  const u = SESSION_USER;
  const initials = (u.name||'A').split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
  document.getElementById('sbAvatar').textContent = initials;
  document.getElementById('sbUserName').textContent = u.name || 'Admin';
  document.getElementById('sbUserEmail').textContent = u.email || '';

  // Pre-fill settings
  document.getElementById('cfgUrl').value = SUPA_URL;
  document.getElementById('cfgKey').value = SUPA_KEY;
  document.getElementById('cfgTable').value = SUPA_TABLE;

  loadLeads();
  if (document.getElementById('togAutoRefresh').classList.contains('on')) {
    refreshTimer = setInterval(loadLeads, 300000);
  }
  showToast('Welcome back, ' + (u.name||'Admin') + '! 👋', 'success');
}

async function doLogout() {
  try {
    await fetch(`${SUPA_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${localStorage.getItem('lf_token')||''}` }
    });
  } catch(e) {}
  SESSION_USER = null;
  localStorage.removeItem('lf_session');
  localStorage.removeItem('lf_token');
  clearInterval(refreshTimer);
  const dash = document.getElementById('dashScreen');
  dash.classList.remove('show');
  dash.style.display = 'none';
  document.getElementById('loginScreen').classList.remove('hide');
  document.getElementById('loginPass').value = '';
  showToast('Logged out successfully', 'success');
}

/* ══════════════════════════ NAVIGATION ══════════════════════════ */
function showPage(name, el) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(i=>i.classList.remove('active'));
  document.getElementById('page'+name.charAt(0).toUpperCase()+name.slice(1)).classList.add('active');
  if (el) el.classList.add('active');
  const titles = {leads:'Lead Management', analytics:'Analytics', calculator:'EMI Calculator', settings:'Settings'};
  document.getElementById('pageTitle').textContent = titles[name] || 'Dashboard';
  if (name === 'analytics') renderAnalytics();
  if (name === 'calculator') runEmiCalc();
  // Close sidebar on mobile
  if (window.innerWidth < 900) document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

/* ══════════════════════════ DATA LOADING ══════════════════════════ */
function normalizeLead(l) {
  return {
    ref_id: l.ref_id ?? l.id ?? '—',
    submitted_at: l.submitted_at ?? l.created_at ?? l.inserted_at ?? new Date().toISOString(),
    name: l.name ?? l.full_name ?? '—',
    phone: l.phone ?? l.mobile ?? l.contact_number ?? '',
    email: l.email ?? '',
    loan_type: l.loan_type ?? l.product ?? (l.source==='cibilleads' ? 'CIBIL Lead' : 'Other'),
    loan_amount: Number(l.loan_amount ?? l.amount ?? 0),
    tenure: l.tenure ?? '—',
    city: l.city ?? '—',
    state: l.state ?? '—',
    pin: l.pin ?? '—',
    pan: l.pan ?? '—',
    dob: l.dob ?? '—',
    employment_type: l.employment_type ?? '—',
    monthly_income: Number(l.monthly_income ?? l.income ?? 0),
    existing_emi: Number(l.existing_emi ?? 0),
    cibil_range: l.cibil_range ?? '—',
    company: l.company ?? '—',
    email_verified: l.email_verified === true || l.email_verified === 'true' || l.verified === true,
    status: l.status ?? 'New',
    notes: l.notes ?? '',
    source: l.source ?? SUPA_TABLE
  };
}

async function loadLeads() {
  showLoadingRows();
  try {
    const base = SUPA_URL.replace(/\/$/, '');
    let rows = [];
    if (SUPA_TABLE === 'leads') {
      const resLeads = await fetch(`${base}/rest/v1/leads?select=*&order=submitted_at.desc&limit=500`, {
        headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
      });
      if (!resLeads.ok) throw new Error('Leads HTTP ' + resLeads.status);
      const leads = await resLeads.json();
      if (!Array.isArray(leads)) throw new Error('Unexpected response');
      rows = leads.map(item => ({ ...item, source: 'leads' }));
      try {
        const resCibil = await fetch(`${base}/rest/v1/cibilleads?select=*&order=submitted_at.desc&limit=500`, {
          headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
        });
        if (resCibil.ok) {
          const cibil = await resCibil.json();
          if (Array.isArray(cibil)) {
            rows = [...rows, ...cibil.map(item => ({ ...item, source: 'cibilleads' }))];
          }
        } else {
          console.warn('CIBIL HTTP ' + resCibil.status);
        }
      } catch(e) {
        console.warn('CIBIL load failed:', e);
      }
    } else {
      const url = `${base}/rest/v1/${SUPA_TABLE}?select=*&order=submitted_at.desc&limit=500`;
      const res = await fetch(url, {
        headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!Array.isArray(json)) throw new Error('Not array');
      rows = json.map(item => ({ ...item, source: SUPA_TABLE }));
    }
    ALL_LEADS = rows.map(normalizeLead);
    afterLoad();
    document.getElementById('cfgDbStatus').textContent = '✅ Connected';
    document.getElementById('cfgTotalLeads').textContent = ALL_LEADS.length + ' rows';
    if (ALL_LEADS.length) {
      showToast(`✅ Loaded ${ALL_LEADS.length} leads`, 'success');
    } else {
      showToast('Supabase returned 0 rows. Check RLS & table.', 'error');
      loadDemoData(true);
    }
  } catch(e) {
    console.warn('Supabase error:', e);
    document.getElementById('cfgDbStatus').textContent = '❌ Error: ' + e.message;
    if (document.getElementById('togDemo').classList.contains('on')) {
      loadDemoData(false);
      showToast('Using demo data (Supabase unavailable)', 'error');
    } else {
      ALL_LEADS = [];
      afterLoad();
      showToast('Could not connect to Supabase', 'error');
    }
  }
}

function loadDemoData(silent) {
  const now = new Date();
  const d = (n) => { const x = new Date(now); x.setDate(x.getDate()-n); return x.toISOString(); };
  ALL_LEADS = [
    {ref_id:'LF-001',name:'Priya Sharma',phone:'9876543210',email:'priya@example.com',loan_type:'Personal Loan',loan_amount:250000,monthly_income:65000,city:'Bengaluru',state:'Karnataka',employment_type:'Salaried',cibil_range:'750+',email_verified:true,status:'New',submitted_at:d(0),notes:''},
    {ref_id:'LF-002',name:'Rahul Mehta',phone:'9876543211',email:'rahul@example.com',loan_type:'Business Loan',loan_amount:1500000,monthly_income:150000,city:'Mumbai',state:'Maharashtra',employment_type:'Self Employed',cibil_range:'700-750',email_verified:true,status:'Called',submitted_at:d(1),notes:'Interested, call back tomorrow'},
    {ref_id:'LF-003',name:'Anita Patel',phone:'9876543212',email:'anita@example.com',loan_type:'Home Loan',loan_amount:5000000,monthly_income:120000,city:'Ahmedabad',state:'Gujarat',employment_type:'Salaried',cibil_range:'800+',email_verified:true,status:'Converted',submitted_at:d(2),notes:''},
    {ref_id:'LF-004',name:'Vikram Nair',phone:'9876543213',email:'vikram@example.com',loan_type:'Vehicle Loan',loan_amount:800000,monthly_income:75000,city:'Chennai',state:'Tamil Nadu',employment_type:'Salaried',cibil_range:'700-750',email_verified:false,status:'New',submitted_at:d(3),notes:''},
    {ref_id:'LF-005',name:'Sneha Rao',phone:'9876543214',email:'sneha@example.com',loan_type:'CIBIL Fix',loan_amount:0,monthly_income:45000,city:'Hyderabad',state:'Telangana',employment_type:'Salaried',cibil_range:'<600',email_verified:true,status:'Lost',submitted_at:d(4),notes:'Not interested'},
    {ref_id:'LF-006',name:'Arjun Singh',phone:'9876543215',email:'arjun@example.com',loan_type:'Personal Loan',loan_amount:400000,monthly_income:85000,city:'Delhi',state:'Delhi',employment_type:'Salaried',cibil_range:'750+',email_verified:true,status:'New',submitted_at:d(1),notes:''},
    {ref_id:'LF-007',name:'Kavya Reddy',phone:'9876543216',email:'kavya@example.com',loan_type:'Business Loan',loan_amount:2000000,monthly_income:200000,city:'Bengaluru',state:'Karnataka',employment_type:'Self Employed',cibil_range:'800+',email_verified:true,status:'Called',submitted_at:d(5),notes:'Needs co-applicant'},
    {ref_id:'LF-008',name:'Mohan Verma',phone:'9876543217',email:'mohan@example.com',loan_type:'Loan Consolidation',loan_amount:600000,monthly_income:55000,city:'Jaipur',state:'Rajasthan',employment_type:'Salaried',cibil_range:'650-700',email_verified:false,status:'New',submitted_at:d(0),notes:''},
    {ref_id:'LF-009',name:'Divya Krishnan',phone:'9876543218',email:'divya@example.com',loan_type:'Home Loan',loan_amount:7500000,monthly_income:180000,city:'Pune',state:'Maharashtra',employment_type:'Salaried',cibil_range:'800+',email_verified:true,status:'Converted',submitted_at:d(7),notes:''},
    {ref_id:'LF-010',name:'Suresh Babu',phone:'9876543219',email:'suresh@example.com',loan_type:'Credit Card',loan_amount:100000,monthly_income:40000,city:'Coimbatore',state:'Tamil Nadu',employment_type:'Salaried',cibil_range:'700-750',email_verified:true,status:'New',submitted_at:d(2),notes:''},
  ].map(normalizeLead);
  afterLoad();
}

function showLoadingRows() {
  document.getElementById('leadsBody').innerHTML = `<tr class="loading-row"><td colspan="9" style="text-align:center;padding:36px"><div><span class="pulse-dot"></span><span class="pulse-dot"></span><span class="pulse-dot"></span></div><div style="margin-top:8px;color:var(--muted);font-size:.8rem">Loading leads…</div></td></tr>`;
}

function afterLoad() {
  populateStateFilter();
  applyFilters();
  updateStats();
  document.getElementById('lastRefresh').textContent = 'Updated ' + new Date().toLocaleTimeString('en-IN');
  document.getElementById('sbLeadCount').textContent = ALL_LEADS.length;
}

/* ══════════════════════════ FILTERS & SORT ══════════════════════════ */
function populateStateFilter() {
  const states = [...new Set(ALL_LEADS.map(l=>l.state).filter(Boolean))].sort();
  document.getElementById('filterState').innerHTML = '<option value="">All States</option>' + states.map(s=>`<option>${s}</option>`).join('');
}

function filterByStatus(v) {
  document.getElementById('filterStatus').value = v;
  applyFilters();
}

function applyFilters() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const loanF = document.getElementById('filterLoan').value;
  const statusF = document.getElementById('filterStatus').value;
  const stateF = document.getElementById('filterState').value;
  const dateF = document.getElementById('filterDate').value;
  const now = new Date();
  FILTERED = ALL_LEADS.filter(l => {
    const hay = [l.name,l.phone,l.email,l.ref_id,l.city,l.state].join(' ').toLowerCase();
    if (search && !hay.includes(search)) return false;
    if (loanF && l.loan_type !== loanF) return false;
    if (statusF && l.status !== statusF) return false;
    if (stateF && l.state !== stateF) return false;
    if (dateF) {
      const d = new Date(l.submitted_at);
      if (dateF==='today' && d.toDateString()!==now.toDateString()) return false;
      if (dateF==='week') { const w=new Date(now); w.setDate(w.getDate()-7); if(d<w) return false; }
      if (dateF==='month') { const m=new Date(now); m.setDate(m.getDate()-30); if(d<m) return false; }
    }
    return true;
  });
  sortLeads();
  PAGE = 1;
  renderTable();
  document.getElementById('filteredCount').textContent = FILTERED.length;
  document.getElementById('totalCount').textContent = ALL_LEADS.length;
}

function clearFilters() {
  ['searchInput','filterLoan','filterStatus','filterState','filterDate'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  applyFilters();
}

function sortBy(col) {
  if (SORT_COL === col) SORT_DIR = SORT_DIR==='asc' ? 'desc' : 'asc';
  else { SORT_COL=col; SORT_DIR='desc'; }
  document.querySelectorAll('thead th').forEach(th=>th.classList.remove('sort-asc','sort-desc'));
  const ths = document.querySelectorAll('thead th');
  const cols = ['submitted_at','ref_id','name','loan_type','loan_amount','monthly_income','city','email_verified','status'];
  const idx = cols.indexOf(col);
  if (idx>=0 && ths[idx]) ths[idx].classList.add('sort-'+SORT_DIR);
  applyFilters();
}

function sortLeads() {
  FILTERED.sort((a,b) => {
    let av=a[SORT_COL]??'', bv=b[SORT_COL]??'';
    if (SORT_COL==='submitted_at') { av=new Date(av).getTime(); bv=new Date(bv).getTime(); }
    if (typeof av==='number' && typeof bv==='number') return SORT_DIR==='asc' ? av-bv : bv-av;
    return SORT_DIR==='asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });
}

/* ══════════════════════════ RENDER TABLE ══════════════════════════ */
function fmt(n) { return Number(n||0).toLocaleString('en-IN'); }

function loanBadge(lt) {
  const map={'Personal Loan':'lb-personal','Business Loan':'lb-business','Home Loan':'lb-home','Vehicle Loan':'lb-vehicle','Credit Card':'lb-credit','CIBIL Fix':'lb-cibil','CIBIL Lead':'lb-cibil','CIBIL':'lb-cibil','Loan Consolidation':'lb-consol'};
  return `<span class="loan-badge ${map[lt]||'lb-other'}">${lt}</span>`;
}

function statusBadge(s) {
  const map={New:'status-new',Called:'status-called',Converted:'status-converted',Lost:'status-lost'};
  return `<span class="status-badge ${map[s]||'status-new'}">${s||'New'}</span>`;
}

function renderTable() {
  const start=(PAGE-1)*PER_PAGE, end=start+PER_PAGE, page=FILTERED.slice(start,end);
  const tbody = document.getElementById('leadsBody');
  if (!page.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="no-leads"><h4>No leads match your filters</h4><p>Try adjusting the filter criteria above</p></div></td></tr>`;
    renderPagination();
    return;
  }
  tbody.innerHTML = page.map(l => {
    const dt = l.submitted_at ? new Date(l.submitted_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'}) : '—';
    return `<tr onclick="openDrawer('${l.ref_id}')">
      <td>${dt}</td>
      <td><div class="td-ref">${l.ref_id}</div></td>
      <td><div class="td-name">${l.name}</div><div class="td-sub">${l.phone}</div></td>
      <td>${loanBadge(l.loan_type)}</td>
      <td>₹${l.loan_amount ? fmt(l.loan_amount) : '—'}</td>
      <td>₹${fmt(l.monthly_income)}<span style="font-size:.68rem;color:var(--muted)">/mo</span></td>
      <td>${l.city}, ${l.state}</td>
      <td><span class="verified-badge ${l.email_verified?'vb-yes':'vb-no'}">${l.email_verified?'✓ Verified':'○ No'}</span></td>
      <td>${statusBadge(l.status)}</td>
    </tr>`;
  }).join('');
  const total = Math.max(1, Math.ceil(FILTERED.length/PER_PAGE));
  document.getElementById('tFootInfo').textContent = `${FILTERED.length} lead${FILTERED.length!==1?'s':''} • Page ${PAGE} of ${total}`;
  renderPagination();
}

function renderPagination() {
  const total = Math.max(1, Math.ceil(FILTERED.length/PER_PAGE));
  const pg = document.getElementById('pagination');
  if (total<=1) { pg.innerHTML=''; return; }
  let html='';
  if (PAGE>1) html += `<button class="pg-btn" onclick="gotoPage(${PAGE-1})">‹</button>`;
  for (let i=Math.max(1,PAGE-2); i<=Math.min(total,PAGE+2); i++)
    html += `<button class="pg-btn ${i===PAGE?'active':''}" onclick="gotoPage(${i})">${i}</button>`;
  if (PAGE<total) html += `<button class="pg-btn" onclick="gotoPage(${PAGE+1})">›</button>`;
  pg.innerHTML = html;
}

function gotoPage(p) { PAGE=p; renderTable(); window.scrollTo(0,0); }

/* ══════════════════════════ STATS ══════════════════════════ */
function updateStats() {
  document.getElementById('statTotal').textContent = ALL_LEADS.length;
  document.getElementById('statVerified').textContent = ALL_LEADS.filter(l=>l.email_verified).length;
  document.getElementById('statNew').textContent = ALL_LEADS.filter(l=>!l.status||l.status==='New').length;
  document.getElementById('statConverted').textContent = ALL_LEADS.filter(l=>l.status==='Converted').length;
  document.getElementById('statValue').textContent = '₹' + fmt(ALL_LEADS.reduce((s,l)=>s+Number(l.loan_amount||0),0));
}

function toCurrency(value) {
  return '₹' + fmt(Math.round(value*100)/100);
}

function animateCurrencyValue(el, target) {
  if (!el) return;
  const start = Number((el.dataset.current ?? '0').toString().replace(/[^0-9.-]+/g, '')) || 0;
  const end = Number(target);
  el.dataset.current = end;
  if (start === end) {
    el.textContent = toCurrency(end);
    return;
  }
  const duration = 640;
  const ease = t => 1 - Math.pow(1 - t, 3);
  const startTime = performance.now();
  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const current = start + (end - start) * ease(progress);
    el.textContent = toCurrency(current);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function runEmiCalc() {
  const principal = Number(document.getElementById('emiPrincipal').value) || 0;
  const annualRate = Number(document.getElementById('emiRate').value) || 0;
  const months = parseInt(document.getElementById('emiTenure').value, 10) || 0;
  if (principal <= 0 || months <= 0 || annualRate < 0) {
    showToast('Enter valid loan amount, interest rate and tenure', 'error');
    return;
  }
  const monthlyRate = annualRate / 12 / 100;
  const emi = monthlyRate > 0
    ? principal * monthlyRate * Math.pow(1 + monthlyRate, months) / (Math.pow(1 + monthlyRate, months) - 1)
    : principal / months;
  const totalPayable = emi * months;
  const totalInterest = totalPayable - principal;
  const monthlyInterest = months > 0 ? totalInterest / months : 0;

  animateCurrencyValue(document.getElementById('emiMonthly'), emi);
  animateCurrencyValue(document.getElementById('emiTotalInterest'), totalInterest);
  animateCurrencyValue(document.getElementById('emiMonthlyInterest'), monthlyInterest);
  animateCurrencyValue(document.getElementById('emiTotalPayable'), totalPayable);

  const scheduleBody = document.getElementById('emiScheduleBody');
  let balance = principal;
  const balances = [balance];
  let scheduleRows = '';
  for (let m = 1; m <= months; m++) {
    const interestPaid = monthlyRate > 0 ? balance * monthlyRate : 0;
    let principalPaid = emi - interestPaid;
    if (m === months) {
      principalPaid = balance;
    }
    balance = Math.max(0, balance - principalPaid);
    balances.push(balance);
    scheduleRows += `<tr>
      <td>${m}</td>
      <td>${toCurrency(emi)}</td>
      <td>${toCurrency(principalPaid)}</td>
      <td>${toCurrency(interestPaid)}</td>
      <td>${toCurrency(balance)}</td>
    </tr>`;
  }
  scheduleBody.innerHTML = scheduleRows;

  const principalShare = totalPayable > 0 ? Math.round((principal / totalPayable) * 100) : 0;
  const interestShare = totalPayable > 0 ? 100 - principalShare : 0;
  document.getElementById('emiPrincipalBar').style.width = principalShare + '%';
  document.getElementById('emiInterestBar').style.width = interestShare + '%';

  const pie = document.getElementById('emiPieChart');
  if (pie) {
    pie.style.background = `conic-gradient(var(--blue) 0 ${principalShare}%, var(--amber) ${principalShare}% 100%)`;
  }
  const principalPct = document.getElementById('emiPiePrincipalPct');
  const interestPct = document.getElementById('emiPieInterestPct');
  const pieLabel = document.getElementById('emiPieLabel');
  if (principalPct) principalPct.textContent = principalShare + '%';
  if (interestPct) interestPct.textContent = interestShare + '%';
  if (pieLabel) pieLabel.textContent = `${principalShare}% Principal / ${interestShare}% Interest`;

  const chart = document.getElementById('emiBalanceChart');
  const samples = [];
  const sampleCount = Math.min(12, balances.length);
  const step = Math.max(1, Math.floor((balances.length - 1) / sampleCount));
  for (let i = 0; i < balances.length; i += step) {
    samples.push({month:i, balance:balances[i]});
  }
  if (samples[samples.length-1].month !== months) {
    samples.push({month:months, balance:balances[balances.length-1]});
  }
  const maxBalance = Math.max(...samples.map(x => x.balance), principal);
  chart.innerHTML = samples.map(item => {
    const height = maxBalance > 0 ? (item.balance / maxBalance) * 100 : 0;
    return `<div class="graph-bar" data-balance="${toCurrency(item.balance)}" title="Month ${item.month}: ${toCurrency(item.balance)}" style="height:${height}%"></div>`;
  }).join('');
}

/* ══════════════════════════ DRAWER ══════════════════════════ */
function openDrawer(refId) {
  const l = ALL_LEADS.find(x=>x.ref_id===refId);
  if (!l) return;
  document.getElementById('drawerTitle').textContent = l.name;
  document.getElementById('drawerSubtitle').textContent = l.ref_id + ' • ' + l.loan_type;
  document.getElementById('drawerBody').innerHTML = `
    <div class="drow-section">
      <div class="drow-section-title">Contact</div>
      <div class="drow-grid">
        <div class="drow-field"><div class="drow-label">Phone</div><div class="drow-val">${l.phone||'—'}</div></div>
        <div class="drow-field"><div class="drow-label">Email</div><div class="drow-val">${l.email||'—'}</div></div>
        <div class="drow-field"><div class="drow-label">City</div><div class="drow-val">${l.city}</div></div>
        <div class="drow-field"><div class="drow-label">State</div><div class="drow-val">${l.state}</div></div>
        <div class="drow-field"><div class="drow-label">PIN</div><div class="drow-val">${l.pin}</div></div>
        <div class="drow-field"><div class="drow-label">DOB</div><div class="drow-val">${l.dob}</div></div>
      </div>
    </div>
    <div class="drow-section">
      <div class="drow-section-title">Loan Details</div>
      <div class="drow-grid">
        <div class="drow-field"><div class="drow-label">Loan Type</div><div class="drow-val">${l.loan_type}</div></div>
        <div class="drow-field"><div class="drow-label">Amount</div><div class="drow-val">₹${fmt(l.loan_amount)}</div></div>
        <div class="drow-field"><div class="drow-label">Monthly Income</div><div class="drow-val">₹${fmt(l.monthly_income)}</div></div>
        <div class="drow-field"><div class="drow-label">Existing EMI</div><div class="drow-val">₹${fmt(l.existing_emi)}</div></div>
        <div class="drow-field"><div class="drow-label">Employment</div><div class="drow-val">${l.employment_type}</div></div>
        <div class="drow-field"><div class="drow-label">CIBIL Range</div><div class="drow-val">${l.cibil_range}</div></div>
        <div class="drow-field"><div class="drow-label">Company</div><div class="drow-val">${l.company}</div></div>
        <div class="drow-field"><div class="drow-label">PAN</div><div class="drow-val">${l.pan}</div></div>
        <div class="drow-field"><div class="drow-label">Submitted</div><div class="drow-val">${new Date(l.submitted_at).toLocaleString('en-IN')}</div></div>
        <div class="drow-field"><div class="drow-label">Email Verified</div><div class="drow-val">${l.email_verified?'✅ Yes':'❌ No'}</div></div>
      </div>
    </div>
    <div class="drow-section">
      <div class="drow-section-title">Lead Management</div>
      <div class="drow-label" style="margin-bottom:5px">Update Status</div>
      <select class="status-select" id="statusSel" onchange="updateLeadStatus('${l.ref_id}',this.value)">
        <option ${l.status==='New'?'selected':''}>New</option>
        <option ${l.status==='Called'?'selected':''}>Called</option>
        <option ${l.status==='Converted'?'selected':''}>Converted</option>
        <option ${l.status==='Lost'?'selected':''}>Lost</option>
      </select>
      <div class="drow-label" style="margin-top:12px;margin-bottom:5px">Notes</div>
      <textarea class="notes-area" id="notesArea" placeholder="Add notes about this lead…">${l.notes||''}</textarea>
      <button class="da-btn outline" style="width:100%;margin-top:8px" onclick="saveNotes('${l.ref_id}')">💾 Save Notes</button>
    </div>
    <div class="drawer-actions">
      <button class="da-btn wa" onclick="window.open('https://wa.me/91${String(l.phone).replace(/[^0-9]/g,'')}','_blank')">💬 WhatsApp</button>
      <button class="da-btn call" onclick="window.open('tel:${l.phone}')">📞 Call</button>
      <button class="da-btn primary" onclick="window.open('mailto:${l.email}')">✉️ Send Email</button>
    </div>
  `;
  document.getElementById('leadDrawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
}

function closeDrawer() {
  document.getElementById('leadDrawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
}

async function updateLeadStatus(refId, newStatus) {
  const lead = ALL_LEADS.find(l=>l.ref_id===refId);
  if (lead) lead.status = newStatus;
  updateStats();
  const table = lead?.source || SUPA_TABLE;
  try {
    await fetch(`${SUPA_URL}/rest/v1/${table}?ref_id=eq.${refId}`, {
      method: 'PATCH',
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ status: newStatus })
    });
    showToast('Status updated to ' + newStatus, 'success');
  } catch(e) {
    showToast('Status updated locally (offline)', 'info');
  }
  renderTable();
}

async function saveNotes(refId) {
  const notes = document.getElementById('notesArea')?.value || '';
  const lead = ALL_LEADS.find(l=>l.ref_id===refId);
  if (lead) lead.notes = notes;
  const table = lead?.source || SUPA_TABLE;
  try {
    await fetch(`${SUPA_URL}/rest/v1/${table}?ref_id=eq.${refId}`, {
      method: 'PATCH',
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ notes })
    });
    showToast('Notes saved', 'success');
  } catch(e) {
    showToast('Notes saved locally', 'info');
  }
}

/* ══════════════════════════ ANALYTICS ══════════════════════════ */
function renderAnalytics() {
  // Status donut
  const statusMap = {};
  ALL_LEADS.forEach(l => { const s=l.status||'New'; statusMap[s]=(statusMap[s]||0)+1; });
  const colors = {New:'#1a56ff',Called:'#f59e0b',Converted:'#059669',Lost:'#dc2626'};
  const total = ALL_LEADS.length || 1;
  let offset = 0;
  const segments = Object.entries(statusMap).map(([k,v]) => {
    const pct = (v/total)*100;
    const seg = { key:k, val:v, pct, offset, color: colors[k]||'#94a3b8' };
    offset += pct;
    return seg;
  });
  const r=45, cx=60, cy=60, circ=2*Math.PI*r;
  let donutHTML = `<svg class="donut-svg" viewBox="0 0 120 120" width="120" height="120">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#f1f5ff" stroke-width="18"/>`;
  segments.forEach(s => {
    const dash = (s.pct/100)*circ;
    const gap = circ-dash;
    const rotate = -90 + (s.offset/100)*360;
    donutHTML += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="18" stroke-dasharray="${dash} ${gap}" stroke-dashoffset="0" transform="rotate(${rotate} ${cx} ${cy})"/>`;
  });
  donutHTML += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-size="14" font-weight="800" fill="#0f172a">${ALL_LEADS.length}</text>
    <text x="${cx}" y="${cy+14}" text-anchor="middle" font-size="7" fill="#64748b">leads</text></svg>`;
  donutHTML += '<div class="donut-legend">' + segments.map(s=>`<div class="dl-item"><div class="dl-dot" style="background:${s.color}"></div><span style="color:var(--muted)">${s.key}</span><span style="font-weight:800;margin-left:auto;padding-left:12px">${s.val}</span></div>`).join('') + '</div>';
  document.getElementById('statusDonut').innerHTML = `<div class="donut-wrap">${donutHTML}</div>`;

  // Loan type bar
  const ltMap = {};
  ALL_LEADS.forEach(l => { ltMap[l.loan_type]=(ltMap[l.loan_type]||0)+1; });
  const ltSorted = Object.entries(ltMap).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const ltMax = ltSorted[0]?.[1] || 1;
  document.getElementById('loanTypeChart').innerHTML = ltSorted.map(([k,v])=>`
    <div class="bar-row">
      <div class="bar-label">${k}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(v/ltMax)*100}%"></div></div>
      <div class="bar-val">${v}</div>
    </div>`).join('');

  // State bar
  const stMap = {};
  ALL_LEADS.forEach(l => { if(l.state&&l.state!=='—') stMap[l.state]=(stMap[l.state]||0)+1; });
  const stSorted = Object.entries(stMap).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const stMax = stSorted[0]?.[1] || 1;
  document.getElementById('stateChart').innerHTML = stSorted.map(([k,v])=>`
    <div class="bar-row">
      <div class="bar-label">${k}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(v/stMax)*100}%;background:linear-gradient(135deg,#0891b2,#1a56ff)"></div></div>
      <div class="bar-val">${v}</div>
    </div>`).join('');

  // Monthly submissions
  const mMap = {};
  ALL_LEADS.forEach(l => {
    if (!l.submitted_at) return;
    const d = new Date(l.submitted_at);
    const k = d.toLocaleString('en-IN',{month:'short',year:'2-digit'});
    mMap[k] = (mMap[k]||0)+1;
  });
  const mSorted = Object.entries(mMap).slice(-6);
  const mMax = Math.max(...mSorted.map(x=>x[1]),1);
  document.getElementById('monthlyChart').innerHTML = mSorted.map(([k,v])=>`
    <div class="bar-row">
      <div class="bar-label">${k}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(v/mMax)*100}%;background:linear-gradient(135deg,#e91e8c,#7c3aed)"></div></div>
      <div class="bar-val">${v}</div>
    </div>`).join('') || '<p style="color:var(--muted);font-size:.82rem">No data yet</p>';
}

/* ══════════════════════════ SETTINGS ══════════════════════════ */
function saveSupabaseConfig() {
  SUPA_URL = document.getElementById('cfgUrl').value.trim().replace(/\/$/,'');
  SUPA_KEY = document.getElementById('cfgKey').value.trim();
  SUPA_TABLE = document.getElementById('cfgTable').value.trim() || 'leads';
  localStorage.setItem('lf_url', SUPA_URL);
  localStorage.setItem('lf_key', SUPA_KEY);
  localStorage.setItem('lf_table', SUPA_TABLE);
  showToast('✅ Config saved — reloading leads', 'success');
  setTimeout(loadLeads, 600);
}

function changePassword() {
  const p1 = document.getElementById('newPass').value;
  const p2 = document.getElementById('newPass2').value;
  if (p1.length < 8) { showToast('Password must be at least 8 characters', 'error'); return; }
  if (p1 !== p2) { showToast('Passwords do not match', 'error'); return; }
  ADMIN_PASS = p1;
  localStorage.setItem('lf_adminpass', p1);
  document.getElementById('newPass').value = '';
  document.getElementById('newPass2').value = '';
  showToast('Password updated successfully', 'success');
}

function requestNotifyPerm(btn) {
  if ('Notification' in window) {
    Notification.requestPermission().then(p => {
      btn.classList.toggle('on', p==='granted');
      showToast(p==='granted' ? 'Notifications enabled' : 'Notifications denied', p==='granted'?'success':'error');
    });
  } else {
    showToast('Browser does not support notifications', 'error');
  }
}

/* ══════════════════════════ EXPORT ══════════════════════════ */
function exportCSV() {
  const cols = ['ref_id','submitted_at','name','phone','email','loan_type','loan_amount','monthly_income','city','state','employment_type','cibil_range','email_verified','status','notes'];
  const header = cols.join(',');
  const rows = FILTERED.map(l => cols.map(c => {
    let v = l[c] ?? '';
    if (typeof v === 'string' && (v.includes(',') || v.includes('"') || v.includes('\n'))) v = `"${v.replace(/"/g,'""')}"`;
    return v;
  }).join(','));
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=`liquifi_leads_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
  showToast(`Exported ${FILTERED.length} leads as CSV`, 'success');
}

/* ══════════════════════════ TOAST ══════════════════════════ */
function showToast(msg, type) {
  const t = document.getElementById('toast');
  const icons = {success:'✅', error:'❌', info:'ℹ️'};
  t.innerHTML = `<span>${icons[type]||'•'}</span><span>${msg}</span>`;
  t.className = 'toast show ' + (type||'');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>t.classList.remove('show'), 3500);
}

/* ══════════════════════════ INIT ══════════════════════════ */
window.addEventListener('load', () => {
  // Restore session
  const savedSession = localStorage.getItem('lf_session');
  if (savedSession) {
    try {
      SESSION_USER = JSON.parse(savedSession);
      enterDashboard();
    } catch(e) {
      localStorage.removeItem('lf_session');
    }
  }
});

window.addEventListener('error', (event) => {
  console.error('Runtime error:', event.message, event.filename, event.lineno, event.colno, event.error);
  showToast('Unexpected error occurred. Check console for details.', 'error');
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled rejection:', event.reason);
  showToast('Unexpected error occurred. Please refresh.', 'error');
});

// Close sidebar on outside click (mobile)
document.addEventListener('click', (e) => {
  const sidebar = document.getElementById('sidebar');
  if (window.innerWidth < 900 && sidebar.classList.contains('open')) {
    if (!sidebar.contains(e.target) && !e.target.closest('.menu-toggle')) {
      sidebar.classList.remove('open');
    }
  }
});
