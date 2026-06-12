/* ── CONFIG ──────────────────────────────────────────── */
// Supabase configuration is loaded from a secure runtime endpoint.
// OpenRouter API key is routed through a serverless proxy.

const APP_STATE_KEY = 'liquifiApplyState';
const DEMO_OTP = '123456';
const OPENROUTER_MODEL = 'mistral-small';

// OTP Configuration
const OTP_EXPIRY_MINS = 5;
const OTP_MAX_ATTEMPTS = 3;
const SMS_ENABLED = true;
const SMS_PROVIDER = '2factor';

/* ── LEAD STATE ──────────────────────────────────────── */
const LEAD = {
  loanType:'', loanAmt:500000, tenure:'6 months',
  name:'', phone:'', email:'', dob:'', pan:'',
  city:'', pin:'', state:'',
  empType:'', income:0, company:'', exp:'', bizName:'',
  vintage:'', turnover:'', gst:'', emiExisting:0, cibil:'', notes:'',
  phoneVerified:false,
  otpSessionId:null, otpAttempts:0
};

/* ── AUTH STATE ──────────────────────────────────────── */
const A = { loggedIn:false, user:null, regPhoneVerified:false };

/* ── INIT ────────────────────────────────────────────── */
window.addEventListener('load', async () => {
  // Load runtime config first
  await loadPublicConfig();

  // Marquee
  const items = ['Personal Loan up to ₹40L','Business Loan up to ₹10Cr',
    'Home Loan from 8.5% p.a.','Vehicle Loan 100% Funding','Credit Card Instant Approval',
    'CIBIL Fix in 45 Days','Save ₹10K+/mo via Consolidation','GST Registration Assisted',
    'ITR Filing by Experts','20+ Lender Partners','Zero Collateral Personal Loans','24-Hr Disbursal'];
  const t = document.getElementById('mqTrack');
  t.innerHTML = [...items,...items].map(i=>`<div class="mitem"><span class="mdot"></span>${i}</div>`).join('');

  // EMI calc
  calcEMI();

  // Gauge animation
  let v = 300;
  const sl = document.getElementById('scoreSlider');
  const tick = () => { v = Math.min(v+10,742); sl.value=v; updateGauge(v); if(v<742) requestAnimationFrame(tick); };
  setTimeout(()=>requestAnimationFrame(tick), 600);

  // Initialize Supabase auth
  await initSupabaseAuth();
});

/* ── NAV ─────────────────────────────────────────────── */
function toggleMenu() { document.getElementById('mobileMenu').classList.toggle('open'); }
function closeMenu() { document.getElementById('mobileMenu').classList.remove('open'); }
window.addEventListener('scroll', () => {
  document.getElementById('floatCta').classList.toggle('show', scrollY > 440);
});
document.addEventListener('click', e => {
  if(!e.target.closest('nav') && !e.target.closest('#mobileMenu')) closeMenu();
  if(!e.target.closest('.user-menu')) closeDropdown();
});

/* ── HERO CHIPS ──────────────────────────────────────── */
function selProduct(el, n) {
  document.querySelectorAll('.pchip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  LEAD.loanType = n;
}
function openModalWithProd() { openModalWith(LEAD.loanType || 'Personal Loan'); }

/* ── GAUGE ───────────────────────────────────────────── */
function updateGauge(v) {
  v = parseInt(v, 10);
  const pct = Math.max(0, Math.min(1, (v - 300) / 600));
  const total = 338;
  const fill = document.getElementById('gaugeFill');
  const glow = document.getElementById('gaugeGlow');
  fill.style.strokeDasharray = `${total * pct} ${total * (1 - pct)}`;
  glow.style.strokeDasharray = `${Math.max(18, total * pct)} ${total}`;
  glow.style.opacity = pct > 0 ? 0.85 : 0;
  document.getElementById('gaugeNeedle').setAttribute('transform', `rotate(${-90 + pct * 180} 130 150)`);
  document.getElementById('gNum').textContent = v;
  document.getElementById('scoreLbl').innerHTML = `Your Score: <strong>${v}</strong>`;
  const ranges = [
    {max:550, l:'Poor Score', c:'#ef4444', id:'gr1'},
    {max:650, l:'Fair Score', c:'#f97316', id:'gr2'},
    {max:750, l:'Good Score', c:'#d4af37', id:'gr3'},
    {max:800, l:'Very Good', c:'#16a34a', id:'gr4'},
    {max:901, l:'Excellent!', c:'#1e3a8a', id:'gr5'}
  ];
  let activeRange = ranges[ranges.length - 1];
  for (const r of ranges) {
    if (v < r.max) { activeRange = r; break; }
  }
  fill.style.stroke = activeRange.c;
  glow.style.stroke = activeRange.c;
  const gaugeNeedle = document.getElementById('gaugeNeedle');
  if (gaugeNeedle) {
    const needle = gaugeNeedle.querySelector('polygon');
    if (needle) needle.style.fill = activeRange.c;
    const needleCircles = gaugeNeedle.querySelectorAll('circle');
    needleCircles.forEach(circle => {
      circle.style.fill = activeRange.c;
      circle.style.stroke = activeRange.c;
    });
  }
  const gNum = document.getElementById('gNum');
  const scoreLbl = document.getElementById('scoreLbl');
  if (gNum) {
    gNum.style.background = 'none';
    gNum.style.backgroundImage = 'none';
    gNum.style.webkitTextFillColor = activeRange.c;
    gNum.style.color = activeRange.c;
  }
  if (scoreLbl) scoreLbl.style.color = activeRange.c;
  const label = document.getElementById('gLbl');
  label.textContent = activeRange.l;
  label.style.color = activeRange.c;
  ['gr1','gr2','gr3','gr4','gr5'].forEach(id => document.getElementById(id).classList.remove('active'));
  document.getElementById(activeRange.id).classList.add('active');
}

/* ── EMI CALC ────────────────────────────────────────── */
function fmt(n) { return (n||0).toLocaleString('en-IN'); }
function calcEMI() {
  const P = parseFloat(document.getElementById('loanAmt').value);
  const r = parseFloat(document.getElementById('intRate').value)/12/100;
  const n = parseInt(document.getElementById('tenureMonths').value);
  document.getElementById('amtDisp').textContent = '₹'+fmt(P);
  document.getElementById('rateDisp').textContent = document.getElementById('intRate').value+'%';
  document.getElementById('tenureDisp').textContent = n+' months';
  const emi = r ? P*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1) : P/n;
  const total = emi*n, interest = total-P;
  document.getElementById('emiVal').textContent = '₹'+fmt(Math.round(emi));
  document.getElementById('intVal').textContent = '₹'+fmt(Math.round(interest));
  document.getElementById('totVal').textContent = '₹'+fmt(Math.round(total));
  const c=264, pp=P/total, ip=1-pp;
  document.getElementById('donutP').style.strokeDasharray = `${c*pp} ${c*(1-pp)}`;
  document.getElementById('donutI').style.strokeDasharray = `${c*ip} ${c*(1-ip)}`;
  document.getElementById('donutI').style.strokeDashoffset = `${-c*pp}`;
  document.getElementById('pPct').textContent = Math.round(pp*100)+'%';
  document.getElementById('iPct').textContent = Math.round(ip*100)+'%';
}

/* ── MODALS ──────────────────────────────────────────── */
function openModal(type) {
  const id = type==='apply' ? 'modalApply' : 'modalCibil';
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
  if(type==='apply') resetApply();
}
function openModalWith(lt) {
  openModal('apply');
  LEAD.loanType = lt;
  setTimeout(() => {
    document.querySelectorAll('.loan-tile').forEach(t=>t.classList.toggle('selected', t.dataset.loan===lt));
    toggleAmtSlider(lt);
  }, 80);
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}
function closeOL(e, id) { if(e.target.classList.contains('overlay')) closeModal(id); }

function openChat() {
  const panel = document.getElementById('chatPanel');
  panel.classList.toggle('open');
  if(panel.classList.contains('open')) {
    const body = document.getElementById('chatBody');
    if(body.children.length === 0) {
      addChatMessage('Hi! I am LiquiFi AI Advisor. Ask me about loan eligibility, CIBIL help, GST, ITR filing or how to get faster approvals.', 'bot');
    }
    document.getElementById('chatInput').focus();
  }
}

function closeChat() {
  document.getElementById('chatPanel').classList.remove('open');
}

async function sendChat() {
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSendBtn');
  const question = input.value.trim();
  if(!question) return;

  addChatMessage(question, 'user');
  input.value = '';
  input.disabled = true;
  sendBtn.disabled = true;

  const botMsg = addChatMessage('Thinking...', 'bot');
  const body = document.getElementById('chatBody');
  body.scrollTop = body.scrollHeight;

  try {
    const response = await fetch('/api/chat-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: 'You are LiquiFi AI Advisor. Answer questions about loans, CIBIL, GST, ITR, eligibility, documentation and services in a friendly, concise way.' },
          { role: 'user', content: question }
        ],
        temperature: 0.2,
        max_tokens: 400
      })
    });

    if(!response.ok) {
      const errorText = await response.text();
      throw new Error('Chat request failed: ' + response.status + ' ' + errorText);
    }

    const json = await response.json();
    const answer = json.choices?.[0]?.message?.content || json.choices?.[0]?.delta?.content || '';
    botMsg.textContent = answer || 'Sorry, I could not get a valid AI response.';

    if(!answer) {
      botMsg.textContent = 'Sorry, I could not get an answer. Please try again.';
    }
  } catch (error) {
    console.error('OpenRouter error:', error);
    // Graceful local fallback: return rule-based answer so chat remains usable.
    try {
      const fallback = generateChatAnswer(question);
      botMsg.textContent = fallback + ' (local fallback)';
    } catch (e) {
      console.error('Fallback failure', e);
      botMsg.textContent = 'Oops, the chat request failed. Try again in a moment.';
    }
  } finally {
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
    body.scrollTop = body.scrollHeight;
  }
}

function addChatMessage(text, from) {
  const body = document.getElementById('chatBody');
  const msg = document.createElement('div');
  msg.className = 'chat-message ' + from;
  msg.textContent = text;
  body.appendChild(msg);
  body.scrollTop = body.scrollHeight;
  return msg;
}

function generateChatAnswer(question) {
  const q = question.toLowerCase();
  if(/cibil|credit score|score|dispute|report/.test(q)) {
    return 'LiquiFi can help improve your CIBIL score by reviewing credit reports, raising disputes for incorrect entries, and suggesting the right repayment strategy. Share your current score or concern for more precise guidance.';
  }
  if(/gst|gst registration|gst filing|gstin/.test(q)) {
    return 'For GST, we assist with registration, returns, and compliance. GST Registration typically takes 3–5 days, and GST Filing covers GSTR-1, 3B and annual reconciliation support.';
  }
  if(/itr|income tax return|tax filing|tax/.test(q)) {
    return 'ITR Filing through LiquiFi is supported for salaried, self-employed, and business profiles. We help prepare and e-file returns accurately so you stay compliant with minimal paperwork.';
  }
  if(/udyam|msme|udyam registration|msme registration/.test(q)) {
    return 'Udyam Registration gives you MSME recognition, access to subsidies, tenders and credit support. We help complete the registration quickly and correctly.';
  }
  if(/personal loan|business loan|home loan|vehicle loan|loan|interest rate|eligibility|documents|income/.test(q)) {
    return 'LiquiFi matches you to lenders based on your profile, documents, and repayment ability. Share the loan type, amount and your current income or CIBIL score for a faster eligibility estimate.';
  }
  if(/how|what|when|where|why/.test(q) && q.length < 80) {
    return 'I can answer questions about loans, CIBIL, GST, ITR and eligibility. Tell me your loan type or problem, and I will guide you.';
  }
  return 'I am here to help with loans, CIBIL, GST and ITR questions. If you want, type your loan type, current score, or the service you need and I will give you a quick answer.';
}

function resetApply() {
  LEAD.phoneVerified = false;
  document.querySelectorAll('#modalApply .form-step').forEach(s=>s.classList.remove('active'));
  document.getElementById('appStep1').classList.add('active');
  document.getElementById('appSuccess').classList.remove('show');
  document.getElementById('appStepper').style.display = 'flex';
  updStepper(1);
  document.getElementById('mobileVerifiedBadge').classList.remove('show');
  document.getElementById('finalSubmit').disabled = true;
  document.getElementById('sendMobileOtpBtn').disabled = false;
  document.getElementById('mobileOtpErr').classList.remove('show');
  if(document.getElementById('phoneBadge')) document.getElementById('phoneBadge').textContent = '—';
  hideErrs();
  // Scroll modal to top
  const mbox = document.querySelector('#modalApply .mbox');
  if(mbox) setTimeout(() => mbox.scrollTop = 0, 0);
}

async function initSupabaseAuth() {
  if (!SUPABASE_CLIENT) {
    console.warn('⚠️ Supabase SDK not available');
    return;
  }

  try {
    let urlData = null;
    if (typeof SUPABASE_CLIENT.auth.getSessionFromUrl === 'function') {
      const { data: urlDataResult, error: urlError } = await SUPABASE_CLIENT.auth.getSessionFromUrl();
      urlData = urlDataResult;
      if (urlError && urlError.message !== 'No session found') {
        console.warn('⚠️ Supabase URL session error:', urlError.message);
      }
    } else {
      console.log('ℹ️ Supabase auth: getSessionFromUrl() not available in this SDK version');
    }

    const { data, error } = await SUPABASE_CLIENT.auth.getSession();
    if (error) {
      console.warn('⚠️ Supabase auth init error:', error.message);
    }

    const session = data?.session || urlData?.session;
    if (session?.user?.email) {
      await restoreApplyStateFromSession(session.user.email);
    }

    SUPABASE_CLIENT.auth.onAuthStateChange(async (event, session) => {
      if (!session?.user?.email) return;
      // Handle all relevant auth state changes - user may sign in, token refresh, or session restored
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        console.log('✅ Auth event detected:', event, 'for', session.user.email);
        await restoreApplyStateFromSession(session.user.email);
      }
    });
  } catch (e) {
    console.warn('⚠️ Supabase auth init failed:', e.message || e);
  }
}

function persistApplyState() {
  try {
    const state = {
      step: getCurStep(),
      lead: {
        loanType: LEAD.loanType,
        loanAmt: LEAD.loanAmt,
        tenure: LEAD.tenure,
        name: LEAD.name,
        phone: LEAD.phone,
        email: LEAD.email,
        dob: LEAD.dob,
        pan: LEAD.pan,
        city: LEAD.city,
        pin: LEAD.pin,
        state: LEAD.state,
        empType: LEAD.empType,
        income: LEAD.income,
        company: LEAD.company,
        exp: LEAD.exp,
        bizName: LEAD.bizName,
        vintage: LEAD.vintage,
        turnover: LEAD.turnover,
        gst: LEAD.gst,
        emiExisting: LEAD.emiExisting,
        cibil: LEAD.cibil,
        notes: LEAD.notes
      }
    };
    localStorage.setItem(APP_STATE_KEY, JSON.stringify(state));
    console.log('✅ Apply state persisted to localStorage');
  } catch (e) {
    console.warn('⚠️ Could not persist apply state:', e.message || e);
  }
}

function getSavedApplyState() {
  try {
    const raw = localStorage.getItem(APP_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('⚠️ Could not read saved apply state:', e.message || e);
    return null;
  }
}

function restoreApplyStateFields(lead) {
  if (!lead) return;
  LEAD.loanType = lead.loanType || LEAD.loanType;
  LEAD.loanAmt = lead.loanAmt || LEAD.loanAmt;
  LEAD.tenure = lead.tenure || LEAD.tenure;
  LEAD.name = lead.name || LEAD.name;
  LEAD.phone = lead.phone || LEAD.phone;
  LEAD.email = lead.email || LEAD.email;
  LEAD.dob = lead.dob || LEAD.dob;
  LEAD.pan = lead.pan || LEAD.pan;
  LEAD.city = lead.city || LEAD.city;
  LEAD.pin = lead.pin || LEAD.pin;
  LEAD.state = lead.state || LEAD.state;
  LEAD.empType = lead.empType || LEAD.empType;
  LEAD.income = lead.income || LEAD.income;
  LEAD.company = lead.company || LEAD.company;
  LEAD.exp = lead.exp || LEAD.exp;
  LEAD.bizName = lead.bizName || LEAD.bizName;
  LEAD.vintage = lead.vintage || LEAD.vintage;
  LEAD.turnover = lead.turnover || LEAD.turnover;
  LEAD.gst = lead.gst || LEAD.gst;
  LEAD.emiExisting = lead.emiExisting || LEAD.emiExisting;
  LEAD.cibil = lead.cibil || LEAD.cibil;
  LEAD.notes = lead.notes || LEAD.notes;

  if (LEAD.loanType) {
    document.querySelectorAll('.loan-tile').forEach(t => t.classList.toggle('selected', t.dataset.loan === LEAD.loanType));
    toggleAmtSlider(LEAD.loanType);
  }

  if (document.getElementById('fName')) document.getElementById('fName').value = LEAD.name || '';
  if (document.getElementById('fPhone')) document.getElementById('fPhone').value = LEAD.phone ? LEAD.phone.replace('+91','') : '';
  if (document.getElementById('fEmail')) document.getElementById('fEmail').value = LEAD.email || '';
  if (document.getElementById('fDob')) document.getElementById('fDob').value = LEAD.dob || '';
  if (document.getElementById('fPan')) document.getElementById('fPan').value = LEAD.pan || '';
  if (document.getElementById('fCity')) document.getElementById('fCity').value = LEAD.city || '';
  if (document.getElementById('fPin')) document.getElementById('fPin').value = LEAD.pin || '';
  if (document.getElementById('fState')) document.getElementById('fState').value = LEAD.state || '';
  if (document.getElementById('fEmp')) document.getElementById('fEmp').value = LEAD.empType || '';
  toggleEmpFields();
  if (document.getElementById('fIncome')) document.getElementById('fIncome').value = LEAD.income || '';
  if (document.getElementById('fCompany')) document.getElementById('fCompany').value = LEAD.company || '';
  if (document.getElementById('fExp')) document.getElementById('fExp').value = LEAD.exp || '';
  if (document.getElementById('fBizName')) document.getElementById('fBizName').value = LEAD.bizName || '';
  if (document.getElementById('fVintage')) document.getElementById('fVintage').value = LEAD.vintage || '';
  if (document.getElementById('fTurnover')) document.getElementById('fTurnover').value = LEAD.turnover || '';
  if (document.getElementById('fGst')) document.getElementById('fGst').value = LEAD.gst || '';
  if (document.getElementById('fEmi')) document.getElementById('fEmi').value = LEAD.emiExisting || '';
  if (document.getElementById('fCibil')) document.getElementById('fCibil').value = LEAD.cibil || '';
  if (document.getElementById('fNotes')) document.getElementById('fNotes').value = LEAD.notes || '';
  if (document.getElementById('emailBadge')) document.getElementById('emailBadge').textContent = LEAD.email || '—';
}

function setApplyStep(step) {
  document.querySelectorAll('#modalApply .form-step').forEach(s => s.classList.remove('active'));
  const stepEl = document.getElementById('appStep' + step);
  if (stepEl) stepEl.classList.add('active');
  updStepper(step);
}

async function restoreApplyStateFromSession(email) {
  const saved = getSavedApplyState();
  if (!saved || !saved.lead) {
    console.log('ℹ️ No saved apply state found for restoration');
    return;
  }
  
  if (saved.lead.email !== email) {
    console.warn('⚠️ Email mismatch in saved state:', saved.lead.email, '!==', email);
    return;
  }

  console.log('✅ Restoring apply state for:', email);
  
  restoreApplyStateFields(saved.lead);
  LEAD.phoneVerified = true;
  document.getElementById('mobileVerifiedBadge').classList.add('show');
  document.getElementById('finalSubmit').disabled = false;

  const step = saved.step || 4;
  document.getElementById('modalApply').classList.add('open');
  document.body.style.overflow = 'hidden';
  setApplyStep(step);
  
  // Scroll the modal into view
  setTimeout(() => {
    const modal = document.getElementById('modalApply');
    if (modal) {
      modal.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.scrollTo(0, 0);
    }
  }, 100);
  
  showToast('✅ Email verified! Continue to submit.', 'success');
  localStorage.removeItem(APP_STATE_KEY);
  history.replaceState({}, '', window.location.pathname);
}

/* ── STEPPER ─────────────────────────────────────────── */
function updStepper(step) {
  for(let i=1;i<=4;i++){
    const si=document.getElementById('si'+i), sc=document.getElementById('sc'+i);
    si.className='sti'; sc.className='stc';
    if(i<step){ si.classList.add('done'); sc.classList.add('done'); sc.textContent='✓'; }
    else if(i===step){ si.classList.add('active'); sc.classList.add('active'); sc.textContent=i; }
    else{ si.classList.add('upcoming'); sc.classList.add('upcoming'); sc.textContent=i; }
    if(i<4){ const cn=document.getElementById('cn'+i); cn.className='stcon'+(i<step?' done':''); }
  }
}

function hideErrs() {
  document.querySelectorAll('.ferr').forEach(e=>e.classList.remove('show'));
  document.querySelectorAll('input,select,textarea').forEach(e=>e.classList.remove('err'));
}

function getCurStep() {
  for(let i=1;i<=4;i++){ if(document.getElementById('si'+i).classList.contains('active')) return i; }
  return 1;
}

/* ── STEP NAVIGATION ─────────────────────────────────── */
function goStep(n) {
  hideErrs();
  let ok = true;
  const cur = getCurStep();

  if(cur===1) {
    if(!LEAD.loanType){ document.getElementById('loanSelErr').classList.add('show'); ok=false; }
  }
  if(cur===2) {
    const nm=document.getElementById('fName'), ph=document.getElementById('fPhone'),
      em=document.getElementById('fEmail'), db=document.getElementById('fDob'),
      pn=document.getElementById('fPan'), ct=document.getElementById('fCity'),
      pi=document.getElementById('fPin'), st=document.getElementById('fState');
    if(!nm.value.trim() || nm.value.trim().length < 3){ nm.classList.add('err'); document.getElementById('nameErr').classList.add('show'); ok=false; }
    if(ph.value.replace(/[^0-9]/g,'').length<10){ ph.classList.add('err'); document.getElementById('phoneErr').classList.add('show'); ok=false; }
    if(!em.value.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)){ em.classList.add('err'); document.getElementById('emailErr').classList.add('show'); ok=false; }
    if(!db.value){ db.classList.add('err'); document.getElementById('dobErr').classList.add('show'); ok=false; }
    if(!pn.value.match(/^[A-Z]{5}[0-9]{4}[A-Z]$/)){ pn.classList.add('err'); document.getElementById('panErr').classList.add('show'); ok=false; }
    if(!ct.value.trim()){ ct.classList.add('err'); document.getElementById('cityErr').classList.add('show'); ok=false; }
    if(!pi.value.match(/^[0-9]{6}$/)){ pi.classList.add('err'); document.getElementById('pinErr').classList.add('show'); ok=false; }
    if(!st.value){ st.classList.add('err'); document.getElementById('stateErr').classList.add('show'); ok=false; }
    if(ok){
      LEAD.name=nm.value.trim(); LEAD.phone=normalizePhone(ph.value); LEAD.email=em.value.trim();
      LEAD.dob=db.value; LEAD.pan=pn.value;
      LEAD.city=ct.value.trim(); LEAD.pin=pi.value; LEAD.state=st.value;
    }
  }
  if(cur===3) {
    const emp=document.getElementById('fEmp'), inc=document.getElementById('fIncome');
    if(!emp.value){ emp.classList.add('err'); document.getElementById('empErr').classList.add('show'); ok=false; }
    if(!inc.value||parseInt(inc.value)<15000){ inc.classList.add('err'); document.getElementById('incErr').classList.add('show'); ok=false; }
    if(ok){
      LEAD.empType=emp.value; LEAD.income=parseInt(inc.value);
      LEAD.company=document.getElementById('fCompany')?.value||'';
      LEAD.exp=document.getElementById('fExp')?.value||'';
      LEAD.bizName=document.getElementById('fBizName')?.value||'';
      LEAD.turnover=document.getElementById('fTurnover')?.value||'';
      LEAD.gst=document.getElementById('fGst')?.value||'';
      LEAD.emiExisting=parseInt(document.getElementById('fEmi')?.value)||0;
      LEAD.cibil=document.getElementById('fCibil')?.value||'';
      LEAD.notes=document.getElementById('fNotes')?.value||'';
      document.getElementById('phoneBadge').textContent = LEAD.phone;
    }
  }
  if(!ok) return;
  
  // Scroll modal to top for smooth step transition
  const mbox = document.querySelector('.mbox');
  if(mbox) mbox.scrollTop = 0;
  
  document.getElementById('appStep'+cur).classList.remove('active');
  document.getElementById('appStep'+n).classList.add('active');
  updStepper(n);
}

/* ── LOAN PICKER ─────────────────────────────────────── */
function pickLoan(tile) {
  document.querySelectorAll('.loan-tile').forEach(t=>t.classList.remove('selected'));
  tile.classList.add('selected');
  LEAD.loanType = tile.dataset.loan;
  document.getElementById('loanSelErr').classList.remove('show');
  toggleAmtSlider(LEAD.loanType);
}
function toggleAmtSlider(lt) {
  const noAmt = ['CIBIL Fix','Credit Card'];
  document.getElementById('amtSliderWrap').style.display = noAmt.includes(lt) ? 'none' : 'block';
  const maxMap = {'Personal Loan':4000000,'Business Loan':100000000,'Home Loan':50000000,
    'Vehicle Loan':10000000,'Loan Consolidation':50000000,'Top-Up Loan':5000000};
  const max = maxMap[lt]||4000000;
  const sl = document.getElementById('amtSlider');
  sl.max=max; sl.value=Math.min(LEAD.loanAmt,max);
  document.getElementById('sliderMaxLbl').textContent = 'Max: ₹'+fmt(max);
  updAmtSlider(sl.value);
}
function updAmtSlider(v) {
  LEAD.loanAmt = parseInt(v);
  document.getElementById('sliderAmtDisp').textContent = '₹'+fmt(parseInt(v));
}
function selTenure(el, t) {
  document.querySelectorAll('.tenure-pill').forEach(p=>p.classList.remove('active'));
  el.classList.add('active');
  LEAD.tenure = t;
}

/* ── EMPLOYMENT TOGGLE ───────────────────────────────── */
function toggleEmpFields() {
  const v = document.getElementById('fEmp').value;
  document.getElementById('salFields').style.display =
    ['Salaried','Government Employee','Retired / Pensioner'].includes(v) ? 'block' : 'none';
  document.getElementById('bizFields').style.display =
    ['Self-Employed Professional','Business Owner / MSME','Freelancer / Consultant'].includes(v) ? 'block' : 'none';
}

/* ── ELIGIBILITY INDICATOR ───────────────────────────── */
function updateEligibility() {
  const bar = document.getElementById('eligBar');
  if (!bar) return; // Exit if bar doesn't exist (element not loaded yet)
  
  const incomeEl = document.getElementById('fIncome');
  const emiEl = document.getElementById('fEmi');
  
  if (!incomeEl || !emiEl) return; // Exit if elements don't exist
  
  const income = parseInt(incomeEl.value) || 0;
  const emi = parseInt(emiEl.value) || 0;
  
  if(!income){ bar.classList.remove('show'); return; }
  const maxLoan = Math.max(Math.round((income*0.5-emi)*60), 0);
  bar.classList.add('show');
  bar.classList.remove('good','fair','low');
  if(income < 15000){
    bar.className='elig-bar show low';
    bar.textContent='⚠️ Income below minimum ₹15,000. Limited options available.';
  } else if(emi/income > 0.5 || income < 25000){
    bar.className='elig-bar show fair';
    bar.textContent=`⚡ Fair eligibility — Max loan ~₹${fmt(maxLoan)}. Reducing existing EMIs helps.`;
  } else {
    bar.className='elig-bar show good';
    bar.textContent=`✅ Good eligibility — You may qualify up to ~₹${fmt(maxLoan)}.`;
  }
}

/* ── PIN AUTO-FILL ───────────────────────────────────── */
let pinTimer = null;
function onPinInput(el) {
  clearTimeout(pinTimer);
  const v = el.value.replace(/[^0-9]/g,'');
  el.value = v;
  document.getElementById('pinSuccess').classList.remove('show');
  document.getElementById('pinLoading').classList.remove('show');
  if(v.length===6) pinTimer = setTimeout(()=>fetchPin(v), 500);
}
function normalizePhone(value){
  const digits = String(value||'').replace(/\D/g,'').slice(-10);
  return digits ? '+91'+digits : '';
}

function onPhoneInput(el){
  if(!el) return; el.value = String(el.value||'').replace(/\D/g,'').slice(0,10);
}

function sanitizeName(el){
  if(!el) return; el.value = String(el.value||'').replace(/[^a-zA-Z\s]/g,'');
}

function sanitizePan(el){
  if(!el) return; el.value = String(el.value||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,10);
}
async function fetchPin(pin) {
  document.getElementById('pinLoading').classList.add('show');
  try{
    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
    const data = await res.json();
    if(data[0].Status==='Success'){
      const po = data[0].PostOffice[0];
      const cityEl = document.getElementById('fCity');
      const stEl = document.getElementById('fState');
      if(cityEl) cityEl.value = po.District||po.Name;
      if(stEl){
        const opts = [...stEl.options].map(o=>o.value);
        const match = opts.find(o=>o.toLowerCase()===po.State.toLowerCase());
        if(match) stEl.value = match;
      }
      document.getElementById('pinLoading').classList.remove('show');
      const ps = document.getElementById('pinSuccess');
      ps.textContent = `✓ ${po.District||po.Name}, ${po.State}`;
      ps.classList.add('show');
    } else throw new Error('Not found');
  } catch(e) {
    document.getElementById('pinLoading').classList.remove('show');
  }
}

/* ── OTP HELPER FUNCTIONS ────────────────────────────– */
function generateOTP(length = 6) {
  return Math.floor(Math.random() * Math.pow(10, length))
    .toString()
    .padStart(length, '0');
}

function generateSessionId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

async function storeOTPToDatabase(email, phone, otpCode, otpType = 'email') {
  try {
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINS * 60 * 1000).toISOString();
    const sessionId = generateSessionId();
    
    const payload = {
      id: sessionId,
      email: email,
      phone: phone || null,
      otp_code: otpCode,
      otp_type: otpType,
      expires_at: expiresAt,
      verified: false,
      attempts: 0,
      max_attempts: OTP_MAX_ATTEMPTS
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/otp_sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON,
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok && res.status !== 201) {
      const errText = await res.text();
      console.warn('⚠️ Supabase response:', res.status, errText);
      
      // Check if table doesn't exist (error 404 or "doesn't exist")
      if (res.status === 404 || errText.includes('does not exist') || errText.includes('otp_sessions')) {
        console.warn('⚠️ otp_sessions table not found. Using client-side session storage.');
        // Store OTP in session storage as fallback
        sessionStorage.setItem(`otp_${sessionId}`, JSON.stringify({
          ...payload,
          timestamp: Date.now()
        }));
        return sessionId;
      }
      
      throw new Error(`Failed to store OTP: ${res.status} - ${errText}`);
    }

    console.log('✅ OTP stored in Supabase, Session:', sessionId);
    return sessionId;
  } catch (e) {
    console.error('❌ Failed to store OTP:', e.message);
    // As last resort fallback, store in sessionStorage
    const sessionId = generateSessionId();
    sessionStorage.setItem(`otp_${sessionId}`, JSON.stringify({
      email: email,
      phone: phone || null,
      otp_code: otpCode,
      otp_type: otpType,
      expires_at: new Date(Date.now() + OTP_EXPIRY_MINS * 60 * 1000).toISOString(),
      verified: false,
      attempts: 0,
      timestamp: Date.now()
    }));
    console.log('📝 OTP stored in browser session (fallback):', sessionId);
    return sessionId;
  }
}

async function sendOTPViaEmail(email, otpCode) {
  const payload = {
    email,
    otpCode,
    expiryMinutes: OTP_EXPIRY_MINS,
    subject: 'Your LiquiFi OTP Code',
    message: `Your LiquiFi OTP is: ${otpCode}\n\nThis OTP expires in ${OTP_EXPIRY_MINS} minutes. Do not share it with anyone.`,
    fromEmail: 'onboarding@resend.dev',
    fromName: 'LiquiFi'
  };

  const endpoints = window.SEND_OTP_ENDPOINTS || ['/api/send-otp'];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = data?.error || `Email send failed with status ${res.status}`;
        console.warn(`⚠️ ${endpoint} responded ${res.status}:`, message);
        if (res.status === 405 || res.status === 404) {
          continue;
        }
        throw new Error(message);
      }

      const data = await res.json().catch(() => ({}));
      console.log('✅ OTP sent successfully via local API:', endpoint, data);
      if (data.devFallback) {
        console.warn('⚠️ Resend sandbox mode detected. Use the OTP shown below for local verification:', data.otpCode);
        showToast(`⚠️ Dev mode: use OTP ${data.otpCode}`, 'error');
      }
      return true;
    } catch (e) {
      console.warn(`⚠️ Attempt to send OTP via ${endpoint} failed:`, e.message || e);
      if (endpoint === endpoints[endpoints.length - 1]) {
        if (e.message && /405|404/.test(e.message)) {
          throw new Error('OTP endpoint not available. Check /api/public-config and your local server path.');
        }
        throw new Error(e.message || 'Unable to send OTP email. Please try again later.');
      }
    }
  }
}

async function sendOTPViaSMS(phone, otpCode) {
  if (!window.SMS_ENABLED || window.SMS_PROVIDER !== '2factor') {
    console.log('ℹ️ SMS disabled or unsupported provider. Using demo mode.');
    // In demo mode, just show the OTP to user
    showToast(`Demo OTP: ${otpCode}. Use this to verify.`, 'info');
    return true;
  }

  const payload = {
    phone,
    otpCode,
    expiryMinutes: OTP_EXPIRY_MINS,
    message: `Your LiquiFi OTP is ${otpCode}. It expires in ${OTP_EXPIRY_MINS} minutes.`
  };

  const endpoints = window.SEND_OTP_ENDPOINTS || ['/api/send-otp'];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = data?.error || `SMS send failed with status ${res.status}`;
        console.warn(`⚠️ ${endpoint} responded ${res.status}:`, message);
        
        // If endpoint not found, try fallback
        if (res.status === 405 || res.status === 404) {
          console.warn(`⚠️ Endpoint ${endpoint} not available, showing demo OTP`);
          continue;
        }
        throw new Error(message);
      }

      const data = await res.json().catch(() => ({}));
      console.log('✅ SMS OTP sent successfully via:', endpoint, data);
      return true;
    } catch (e) {
      console.warn(`⚠️ Attempt to send SMS via ${endpoint} failed:`, e.message || e);
      if (endpoint === endpoints[endpoints.length - 1]) {
        console.warn('⚠️ All endpoints failed. Using demo mode - showing OTP to user.');
        showToast(`Demo OTP: ${otpCode}. Use this to verify.`, 'info');
        return true; // Return true to allow user to proceed with demo OTP
      }
    }
  }

  return true; // Default to true to allow demo/test mode
}

async function verifyOTPServer(sessionId, otpCode) {
  try {
    // First, try to get from sessionStorage (fallback mode)
    const sessionData = sessionStorage.getItem(`otp_${sessionId}`);
    if (sessionData) {
      const session = JSON.parse(sessionData);
      const now = new Date();
      const expiresAt = new Date(session.expires_at);

      // Check expiry
      if (now > expiresAt) {
        sessionStorage.removeItem(`otp_${sessionId}`);
        throw new Error('OTP has expired');
      }

      // Check attempts
      if (session.attempts >= OTP_MAX_ATTEMPTS) {
        throw new Error('Too many attempts. Please request a new OTP.');
      }

      // Check code
      if (session.otp_code !== otpCode) {
        session.attempts = (session.attempts || 0) + 1;
        sessionStorage.setItem(`otp_${sessionId}`, JSON.stringify(session));
        throw new Error('Incorrect OTP');
      }

      // Mark as verified
      session.verified = true;
      session.verified_at = new Date().toISOString();
      sessionStorage.setItem(`otp_${sessionId}`, JSON.stringify(session));
      console.log('✅ OTP verified (browser session)');
      return true;
    }

    // Try Supabase if available
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/otp_sessions?id=eq.${sessionId}&select=*`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON,
          'Authorization': `Bearer ${SUPABASE_ANON}`
        }
      }
    );

    if (!res.ok) throw new Error('Failed to verify OTP');

    const sessions = await res.json();
    if (!sessions || sessions.length === 0) {
      throw new Error('OTP session not found');
    }

    const session = sessions[0];
    const now = new Date();
    const expiresAt = new Date(session.expires_at);

    // Check expiry
    if (now > expiresAt) {
      throw new Error('OTP has expired');
    }

    // Check attempts
    if (session.attempts >= OTP_MAX_ATTEMPTS) {
      throw new Error('Too many attempts. Please request a new OTP.');
    }

    // Check code
    if (session.otp_code !== otpCode) {
      // Increment attempts
      await fetch(
        `${SUPABASE_URL}/rest/v1/otp_sessions?id=eq.${sessionId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON,
            'Authorization': `Bearer ${SUPABASE_ANON}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ attempts: session.attempts + 1 })
        }
      );
      throw new Error('Incorrect OTP');
    }

    // Mark as verified
    await fetch(
      `${SUPABASE_URL}/rest/v1/otp_sessions?id=eq.${sessionId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON,
          'Authorization': `Bearer ${SUPABASE_ANON}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ verified: true, verified_at: new Date().toISOString() })
      }
    );

    console.log('✅ OTP verified successfully');
    return true;
  } catch (e) {
    console.error('❌ OTP verification failed:', e.message);
    throw e;
  }
}

/* ── EMAIL VERIFICATION (Firebase Auth) ───────────────── */
async function sendEmailOTP() {
  const email = String(LEAD.email || '').trim();
  if (!isValidEmail(email)) {
    const emailField = document.getElementById('fEmail');
    if (emailField) emailField.classList.add('err');
    const emailErr = document.getElementById('emailErr');
    if (emailErr) {
      emailErr.textContent = 'Enter a valid email address';
      emailErr.classList.add('show');
    }
    showToast('Enter a valid email address first', 'error');
    return;
  }

  if (!email) {
    showToast('Go back to Step 2 and enter email', 'error');
    return;
  }

  persistApplyState();

  const btn = document.getElementById('sendOtpBtn');
  if (!btn) {
    console.error('❌ sendOtpBtn not found');
    return;
  }
  
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    const otpCode = generateOTP(6);
    console.log('📧 Generated OTP:', otpCode, 'for email:', email);
    
    const sessionId = await storeOTPToDatabase(email, null, otpCode, 'email');
    LEAD.otpSessionId = sessionId;
    console.log('✅ OTP stored with session ID:', sessionId);

    const emailSent = await sendOTPViaEmail(email, otpCode);
    if (emailSent) {
      console.log('✅ OTP email send initiated');
    }

    // Show OTP inputs
    const emailOtpWrap = document.getElementById('emailOtpWrap');
    if (emailOtpWrap) {
      emailOtpWrap.style.display = 'block';
      for (let i = 0; i < 6; i++) { 
        const el = document.getElementById('eo' + i);
        if (el) el.value = ''; 
      }
      const firstInput = document.getElementById('eo0');
      if (firstInput) firstInput.focus();
    }

    // Start simple expiry timer (minutes)
    let remaining = OTP_EXPIRY_MINS * 60;
    const timerEl = document.getElementById('emailOtpTimer');
    if (timerEl) timerEl.textContent = Math.ceil(remaining / 60);
    
    const ti = setInterval(() => {
      remaining -= 1;
      if (timerEl) timerEl.textContent = Math.ceil(remaining / 60);
      if (remaining <= 0) { clearInterval(ti); }
    }, 1000);

    showToast('✅ OTP sent to ' + email + '. Enter the 6-digit code to verify.', 'success');
  } catch (e) {
    console.error('❌ Error sending OTP email:', e.message || e);
    showToast('❌ Failed to send OTP: ' + (e.message || 'Unknown'), 'error');
  } finally {
    // Re-enable button after delay
    setTimeout(() => {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Send OTP';
      }
    }, 3000);
  }
}

function resendEmailOTP(){
  if(!LEAD.email){ showToast('No email to resend to','error'); return; }
  sendEmailOTP();
}
function eoNext(i) {
  const el = document.getElementById('eo'+i);
  if(el.value.length===1 && i<5) document.getElementById('eo'+(i+1)).focus();
  checkEmailOTP();
}
function eoBack(e,i) {
  if(e.key==='Backspace' && !document.getElementById('eo'+i).value && i>0)
    document.getElementById('eo'+(i-1)).focus();
}
async function checkEmailOTP() {
  let code = '';
  for (let i = 0; i < 6; i++) code += document.getElementById('eo' + i).value;
  
  if (code.length !== 6) return; // Wait for complete OTP
  
  if (!LEAD.otpSessionId) {
    document.getElementById('emailOtpErr').classList.add('show');
    document.getElementById('emailOtpErr').textContent = 'No OTP session found. Please send OTP first.';
    return;
  }
  
  try {
    // Verify OTP with server
    await verifyOTPServer(LEAD.otpSessionId, code);
    
    // Success
    LEAD.emailVerified = true;
    document.getElementById('emailOtpErr').classList.remove('show');
    document.getElementById('emailVerifiedBadge').classList.add('show');
    document.getElementById('finalSubmit').disabled = false;
    showToast('✅ Email verified! Ready to submit.', 'success');
  } catch (e) {
    // Failure
    LEAD.emailVerified = false;
    document.getElementById('emailVerifiedBadge').classList.remove('show');
    document.getElementById('finalSubmit').disabled = true;
    document.getElementById('emailOtpErr').textContent = '❌ ' + e.message;
    document.getElementById('emailOtpErr').classList.add('show');
    showToast(e.message, 'error');
  }
}

/* ── MOBILE OTP STEP 4 ────────────────────────────── */
async function sendMobileOTPStep4() {
  const phone = normalizePhone(LEAD.phone);
  if (!phone || phone.replace(/\D/g,'').length < 10) {
    showToast('Invalid phone number. Go back to Step 2 and update.', 'error');
    return;
  }

  persistApplyState();

  const btn = document.getElementById('sendMobileOtpBtn');
  if (!btn) {
    console.error('❌ sendMobileOtpBtn not found');
    return;
  }
  
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    const otpCode = generateOTP(6);
    console.log('📱 Generated OTP:', otpCode, 'for phone:', phone);
    
    const sessionId = await storeOTPToDatabase(null, phone, otpCode, 'phone');
    LEAD.mobileOtpSessionId = sessionId;
    console.log('✅ OTP stored with session ID:', sessionId);

    const smsSent = await sendOTPViaSMS(phone, otpCode);
    if (smsSent) {
      console.log('✅ OTP SMS send initiated');
    }

    // Show OTP inputs
    const mobileOtpWrap = document.getElementById('mobileOtpWrap');
    if (mobileOtpWrap) {
      mobileOtpWrap.style.display = 'block';
      for (let i = 0; i < 6; i++) { 
        const el = document.getElementById('mo' + i);
        if (el) el.value = ''; 
      }
      const firstInput = document.getElementById('mo0');
      if (firstInput) firstInput.focus();
    }

    // Start expiry timer (minutes)
    let remaining = OTP_EXPIRY_MINS * 60;
    const timerEl = document.getElementById('mobileOtpTimer');
    if (timerEl) timerEl.textContent = Math.ceil(remaining / 60);
    
    const ti = setInterval(() => {
      remaining -= 1;
      if (timerEl) timerEl.textContent = Math.ceil(remaining / 60);
      if (remaining <= 0) { clearInterval(ti); }
    }, 1000);

    showToast('✅ OTP sent to ' + LEAD.phone + '. Enter the 6-digit code to verify.', 'success');
  } catch (e) {
    console.error('❌ Error sending mobile OTP:', e.message || e);
    showToast('❌ Failed to send OTP: ' + (e.message || 'Unknown'), 'error');
  } finally {
    // Re-enable button after delay
    setTimeout(() => {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Send OTP';
      }
    }, 3000);
  }
}

function resendMobileOTP(){
  if(!LEAD.phone){ showToast('No mobile number to resend to','error'); return; }
  sendMobileOTPStep4();
}

function moNext(i) {
  const el = document.getElementById('mo'+i);
  if(el.value.length===1 && i<5) document.getElementById('mo'+(i+1)).focus();
  checkMobileOTP();
}

function moBack(e,i) {
  if(e.key==='Backspace' && !document.getElementById('mo'+i).value && i>0)
    document.getElementById('mo'+(i-1)).focus();
}

async function checkMobileOTP() {
  let code = '';
  for (let i = 0; i < 6; i++) code += document.getElementById('mo' + i).value;
  
  if (code.length !== 6) return; // Wait for complete OTP
  
  if (!LEAD.mobileOtpSessionId) {
    document.getElementById('mobileOtpErr').classList.add('show');
    document.getElementById('mobileOtpErr').textContent = 'No OTP session found. Please send OTP first.';
    return;
  }
  
  try {
    // Verify OTP with server
    await verifyOTPServer(LEAD.mobileOtpSessionId, code);
    
    // Success
    LEAD.phoneVerified = true;
    document.getElementById('mobileOtpErr').classList.remove('show');
    document.getElementById('mobileVerifiedBadge').classList.add('show');
    document.getElementById('finalSubmit').disabled = false;
    showToast('✅ Mobile verified! Ready to submit.', 'success');
  } catch (e) {
    // Failure
    LEAD.phoneVerified = false;
    document.getElementById('mobileVerifiedBadge').classList.remove('show');
    document.getElementById('finalSubmit').disabled = true;
    document.getElementById('mobileOtpErr').textContent = '❌ ' + e.message;
    document.getElementById('mobileOtpErr').classList.add('show');
    showToast(e.message, 'error');
  }
}

/* ── SUBMIT LEAD ─────────────────────────────────────── */
async function submitLead() {
  if(!LEAD.phoneVerified){ showToast('Please verify your mobile number first','error'); return; }
  if(!document.getElementById('cConsent').checked || !document.getElementById('cTerms').checked){
    document.getElementById('consentErr').classList.add('show'); return;
  }
  const ref = 'LF-'+Date.now().toString(36).toUpperCase();
  const btn = document.getElementById('finalSubmit');
  btn.disabled=true; btn.textContent='Submitting...';

  const payload = {
    ref_id:ref, loan_type:LEAD.loanType, loan_amount:LEAD.loanAmt, tenure:LEAD.tenure,
    name:LEAD.name, phone:LEAD.phone, email:LEAD.email, dob:LEAD.dob,
    pan:LEAD.pan, city:LEAD.city, pin:LEAD.pin, state:LEAD.state,
    employment_type:LEAD.empType, monthly_income:LEAD.income,
    company:LEAD.company||LEAD.bizName, existing_emi:LEAD.emiExisting,
    cibil_range:LEAD.cibil, notes:LEAD.notes,
    submitted_at:new Date().toISOString()
  };

  console.log('📤 Submitting lead with ref:', ref);
  console.log('📋 Payload:', payload);
  console.log('🌐 SUPABASE_URL:', SUPABASE_URL);
  console.log('🔐 SUPABASE_ANON key set:', !!SUPABASE_ANON);

  // 1. Supabase
  try{
    const url = `${SUPABASE_URL}/rest/v1/leads`;
    console.log('🔗 Calling URL:', url);
    
    const res = await fetch(url,{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON,
        'Authorization':`Bearer ${SUPABASE_ANON}`,'Prefer':'return=minimal'},
      body:JSON.stringify(payload)
    });
    
    console.log('📡 Response status:', res.status, res.statusText);
    
    if(res.status !== 201 && res.status !== 200) {
      const errorText = await res.text();
      console.error('❌ Supabase API error:', { status: res.status, error: errorText });
      throw new Error(`Supabase error: ${res.status} - ${errorText}`);
    }
    
    console.log('✅ Lead submitted successfully to Supabase');
  } catch(e){ 
    console.error('❌ Supabase submission failed:', e.message);
    showToast('❌ Error saving lead: ' + e.message, 'error');
    btn.disabled=false;
    btn.textContent='Submit Application';
    return;
  }

  document.getElementById('refNo').textContent = 'REF: '+ref;
  document.getElementById('appStep4').classList.remove('active');
  document.getElementById('appStepper').style.display = 'none';
  document.getElementById('appSuccess').classList.add('show');
  showToast('🎉 Verified lead submitted!','success');
}

/* ── CIBIL FORM ──────────────────────────────────────── */
/* ── CIBIL FORM (FIXED FOR SUPABASE) ─────────────────── */
async function submitCibil() {
  hideErrs(); let ok=true;
  const n=document.getElementById('cName'), p=document.getElementById('cPhone'),
    pn=document.getElementById('cPan'), d=document.getElementById('cDob'),
    is=document.getElementById('cIssue'), co=document.getElementById('cCon').checked;
  if(!n.value.trim()){ n.classList.add('err'); document.getElementById('cNameErr').classList.add('show'); ok=false; }
  if(p.value.replace(/[^0-9]/g,'').length<10){ p.classList.add('err'); document.getElementById('cPhoneErr').classList.add('show'); ok=false; }
  if(!pn.value.match(/^[A-Z]{5}[0-9]{4}[A-Z]$/)){ pn.classList.add('err'); document.getElementById('cPanErr').classList.add('show'); ok=false; }
  if(!d.value){ d.classList.add('err'); document.getElementById('cDobErr').classList.add('show'); ok=false; }
  if(!is.value){ is.classList.add('err'); document.getElementById('cIssueErr').classList.add('show'); ok=false; }
  if(!co){ document.getElementById('cConErr').classList.add('show'); ok=false; }
  if(!ok) return;

  const ref = 'CF-'+Math.floor(100000+Math.random()*900000);
  const btn = document.querySelector('#modalCibil .btn-primary');
  btn.disabled=true; btn.textContent='Submitting...';

  const payload = {
    ref_id:ref,
    lead_type:'cibil',
    name:n.value.trim(),
    phone:normalizePhone(p.value),
    pan:pn.value,
    dob:d.value,
    credit_issue:is.value,
    submitted_at:new Date().toISOString()
  };

  console.log('📤 Submitting CIBIL lead with ref:', ref);
  console.log('📋 CIBIL Payload:', payload);

  try{
    const url = `${SUPABASE_URL}/rest/v1/cibilleads`;
    console.log('🔗 Calling URL:', url);
    
    const res = await fetch(url,{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON,
        'Authorization':`Bearer ${SUPABASE_ANON}`,'Prefer':'return=minimal'},
      body:JSON.stringify(payload)
    });
    
    console.log('📡 Response status:', res.status, res.statusText);
    
    if(res.status !== 201 && res.status !== 200) {
      const errorText = await res.text();
      console.error('❌ Supabase API error:', { status: res.status, error: errorText });
      throw new Error(`Supabase error: ${res.status} - ${errorText}`);
    }
    
    console.log('✅ CIBIL lead saved to Supabase cibilleads table');
  } catch(e){ 
    console.error('❌ CIBIL submission failed:', e.message);
    showToast('❌ Error saving CIBIL request: ' + e.message, 'error');
    btn.disabled=false;
    btn.textContent='📊 Get Free CIBIL Report →';
    return;
  }

  document.getElementById('cRef').textContent = 'REF: '+ref;
  document.getElementById('cibilFormArea').style.display = 'none';
  document.getElementById('cibilSuccess').classList.add('show');
  showToast('📊 CIBIL request filed!','success');
  btn.disabled=false; btn.textContent='📊 Get Free CIBIL Report →';
}
/* ── AUTH ────────────────────────────────────────────── */
function openAuth(tab) {
  document.getElementById('modalAuth').classList.add('open');
  document.body.style.overflow = 'hidden';
  switchAuthTab(tab||'login');
  hideErrs();
  ['loginSuccess','registerSuccess','forgotSuccess'].forEach(id=>document.getElementById(id).classList.remove('show'));
  const rf=document.getElementById('registerForm'); if(rf) rf.style.display='block';
  const ff=document.getElementById('forgotFormArea'); if(ff) ff.style.display='block';
  const rw=document.getElementById('rOtpFieldsWrap'); if(rw) rw.style.display='none';
  const lw=document.getElementById('lOtpFieldsWrap'); if(lw) lw.style.display='none';
  document.getElementById('rPhoneVerified').classList.remove('show');
  document.getElementById('rOtpBtn').disabled=false;
  document.getElementById('lOtpBtn').disabled=false;
  A.regPhoneVerified=false;
  for(let i=0;i<6;i++){
    const lo=document.getElementById('lo'+i), ro=document.getElementById('ro'+i);
    if(lo)lo.value=''; if(ro)ro.value='';
  }
}
function switchAuthTab(tab) {
  ['login','register','forgot'].forEach(t=>{
    document.getElementById('panel'+t[0].toUpperCase()+t.slice(1))?.classList.remove('active');
    document.getElementById('tab'+t[0].toUpperCase()+t.slice(1))?.classList.remove('active');
  });
  document.getElementById('panel'+tab[0].toUpperCase()+tab.slice(1))?.classList.add('active');
  document.getElementById('tab'+tab[0].toUpperCase()+tab.slice(1))?.classList.add('active');
  document.getElementById('authTabs').style.display = tab==='forgot' ? 'none' : 'flex';
}
function switchLoginMethod(m) {
  ['email','phone'].forEach(x=>{
    document.getElementById('lm'+x[0].toUpperCase()+x.slice(1))?.classList.remove('active');
    document.getElementById('lt'+x[0].toUpperCase()+x.slice(1))?.classList.remove('active');
  });
  document.getElementById('lm'+m[0].toUpperCase()+m.slice(1))?.classList.add('active');
  document.getElementById('lt'+m[0].toUpperCase()+m.slice(1))?.classList.add('active');
  hideErrs();
}
function submitLogin() {
  hideErrs(); let ok=true;
  const em=document.getElementById('lEmail'), pw=document.getElementById('lPass');
  if(!em.value.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)){ em.classList.add('err'); document.getElementById('lEmailErr').classList.add('show'); ok=false; }
  if(!pw.value.trim()){ pw.classList.add('err'); document.getElementById('lPassErr').classList.add('show'); ok=false; }
  if(!ok) return;
  const name = em.value.split('@')[0];
  loginSuccess({name:name[0].toUpperCase()+name.slice(1), email:em.value});
}
function sendLoginOTP() {
  const ph=document.getElementById('lPhone');
  if(ph.value.replace(/[^0-9]/g,'').length<10){ ph.classList.add('err'); document.getElementById('lPhoneErr').classList.add('show'); return; }
  document.getElementById('lOtpBtn').disabled=true;
  document.getElementById('lOtpFieldsWrap').style.display='block';
  document.getElementById('lo0').focus();
  showToast('Demo OTP 123456 sent','success');
}
function loNext(i){ if(document.getElementById('lo'+i).value.length===1&&i<5) document.getElementById('lo'+(i+1)).focus(); }
function loBack(e,i){ if(e.key==='Backspace'&&!document.getElementById('lo'+i).value&&i>0) document.getElementById('lo'+(i-1)).focus(); }
function submitPhoneLogin() {
  let c=''; for(let i=0;i<6;i++) c+=document.getElementById('lo'+i).value;
  if(c===DEMO_OTP) loginSuccess({name:'User',email:document.getElementById('lPhone').value});
  else document.getElementById('lOtpErr').classList.add('show');
}
function loginSuccess(user) {
  A.loggedIn=true; A.user=user;
  document.getElementById('loginSuccess').classList.add('show');
  setTimeout(()=>{
    closeModal('modalAuth');
    document.getElementById('navAuth').style.display='none';
    const um=document.getElementById('userMenu'); um.classList.add('show');
    document.getElementById('userAvatar').textContent=user.name.split(' ').map(n=>n[0]).join('').toUpperCase().substring(0,2);
    document.getElementById('udName').textContent=user.name;
    document.getElementById('udEmail').textContent=user.email;
    showToast('Welcome, '+user.name+'! 👋','success');
  },1400);
}
function socialLogin(p) { loginSuccess({name:p+' User',email:'user@'+p.toLowerCase()+'.com'}); }
function sendRegOTP() {
  const ph=document.getElementById('rPhone');
  if(ph.value.replace(/[^0-9]/g,'').length<10){ ph.classList.add('err'); document.getElementById('rPhoneErr').classList.add('show'); return; }
  document.getElementById('rOtpBtn').disabled=true;
  document.getElementById('rOtpFieldsWrap').style.display='block';
  document.getElementById('ro0').focus();
  showToast('Demo OTP 123456 sent','success');
}
function roNext(i){ if(document.getElementById('ro'+i).value.length===1&&i<5) document.getElementById('ro'+(i+1)).focus(); chkRegOTP(); }
function roBack(e,i){ if(e.key==='Backspace'&&!document.getElementById('ro'+i).value&&i>0) document.getElementById('ro'+(i-1)).focus(); }
function chkRegOTP() {
  let c=''; for(let i=0;i<6;i++) c+=document.getElementById('ro'+i).value;
  if(c.length===6){
    if(c===DEMO_OTP){
      A.regPhoneVerified=true;
      document.getElementById('rOtpFieldsWrap').style.display='none';
      document.getElementById('rPhoneVerified').classList.add('show');
      hideErrs(); showToast('Mobile verified ✓','success');
    } else document.getElementById('rOtpErr').classList.add('show');
  }
}
function checkPwStrength(pw) {
  const bars=[1,2,3,4].map(i=>document.getElementById('pb'+i)), lbl=document.getElementById('pwLabel');
  bars.forEach(b=>{b.className='pw-bar'});
  if(!pw){lbl.textContent='Enter a password'; return;}
  let s=0;
  if(pw.length>=8)s++; if(pw.length>=12)s++;
  if(/[A-Z]/.test(pw)&&/[a-z]/.test(pw))s++;
  if(/[0-9]/.test(pw)&&/[^A-Za-z0-9]/.test(pw))s++;
  const cls=['weak','fair','good','strong'];
  const lbs=['Weak','Fair','Good','Strong 💪'];
  const cs=['#ef4444','#f59e0b','#3b82f6','#059669'];
  for(let i=0;i<s;i++) bars[i].classList.add(cls[s-1]);
  lbl.textContent=s?lbs[s-1]:'Too short'; lbl.style.color=s?cs[s-1]:cs[0];
}
function togglePw(id,btn) {
  const el=document.getElementById(id), show=el.type==='password';
  el.type=show?'text':'password'; btn.textContent=show?'🙈':'👁';
}
function submitRegister() {
  hideErrs(); let ok=true;
  const fn=document.getElementById('rFName'), ln=document.getElementById('rLName'),
    em=document.getElementById('rEmail'), ph=document.getElementById('rPhone'),
    pw=document.getElementById('rPass'), pw2=document.getElementById('rPass2'),
    tc=document.getElementById('rTerms');
  if(!fn.value.trim()){ fn.classList.add('err'); document.getElementById('rFNErr').classList.add('show'); ok=false; }
  if(!ln.value.trim()){ ln.classList.add('err'); document.getElementById('rLNErr').classList.add('show'); ok=false; }
  if(!em.value.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)){ em.classList.add('err'); document.getElementById('rEmailErr').classList.add('show'); ok=false; }
  if(ph.value.replace(/[^0-9]/g,'').length<10){ ph.classList.add('err'); document.getElementById('rPhoneErr').classList.add('show'); ok=false; }
  if(!A.regPhoneVerified){ showToast('Please verify your mobile number','error'); ok=false; }
  if(pw.value.length<8){ pw.classList.add('err'); document.getElementById('rPassErr').classList.add('show'); ok=false; }
  if(pw.value!==pw2.value){ pw2.classList.add('err'); document.getElementById('rPass2Err').classList.add('show'); ok=false; }
  if(!tc.checked){ document.getElementById('rTermsErr').classList.add('show'); ok=false; }
  if(!ok) return;
  document.getElementById('registerForm').style.display='none';
  document.getElementById('registerSuccess').classList.add('show');
  setTimeout(()=>loginSuccess({name:fn.value+' '+ln.value, email:em.value}), 1600);
}
function submitForgot() {
  hideErrs();
  const inp=document.getElementById('fgInput');
  if(!inp.value.trim()){ inp.classList.add('err'); document.getElementById('fgInputErr').classList.add('show'); return; }
  document.getElementById('forgotFormArea').style.display='none';
  document.getElementById('forgotSuccess').classList.add('show');
  showToast('Reset OTP sent!','success');
}
function toggleDropdown() { document.getElementById('userDropdown').classList.toggle('open'); }
function closeDropdown() { document.getElementById('userDropdown').classList.remove('open'); }
function logOut() {
  A.loggedIn=false; A.user=null;
  document.getElementById('userMenu').classList.remove('show');
  document.getElementById('userDropdown').classList.remove('open');
  document.getElementById('navAuth').style.display='flex';
  showToast('Logged out successfully','success');
}
    /* ── SERVICE MODAL ───────────────────────────────────── */
let SVC = { serviceType:'', requirements:'', name:'', phone:'', email:'', pan:'', bizName:'', notes:'', emailVerified:false };

function openServiceModal(sv) {
  document.getElementById('modalService').classList.add('open');
  document.body.style.overflow = 'hidden';
  SVC.serviceType = sv;
  SVC.emailVerified = false;
  setTimeout(()=>{
    document.querySelectorAll('#modalService .loan-tile').forEach(t=>t.classList.toggle('selected', t.dataset.service===sv));
  }, 80);
  document.querySelectorAll('#modalService .form-step').forEach(s=>s.classList.remove('active'));
  document.getElementById('svcStep1').classList.add('active');
  document.getElementById('svcSuccess').classList.remove('show');
  document.getElementById('svcStepper').style.display = 'flex';
  updSvcStepper(1);
  hideErrs();
  document.getElementById('svcFinalSubmit').disabled = true;
  document.getElementById('sendSvcOtpBtn').disabled = false;
  document.getElementById('svcEmailOtpErr').classList.remove('show');
  for(let i=0;i<6;i++){const d=document.getElementById('seo'+i); if(d) d.value='';}
  document.getElementById('svcEmailVerifiedBadge').classList.remove('show');
}

function pickService(tile) {
  document.querySelectorAll('#modalService .loan-tile').forEach(t=>t.classList.remove('selected'));
  tile.classList.add('selected');
  SVC.serviceType = tile.dataset.service;
  document.getElementById('svcSelErr').classList.remove('show');
}

function updSvcStepper(step) {
  for(let i=1;i<=3;i++){
    const si=document.getElementById('ssi'+i), sc=document.getElementById('ssc'+i);
    si.className='sti'; sc.className='stc';
    if(i<step){ si.classList.add('done'); sc.classList.add('done'); sc.textContent='✓'; }
    else if(i===step){ si.classList.add('active'); sc.classList.add('active'); sc.textContent=i; }
    else{ si.classList.add('upcoming'); sc.classList.add('upcoming'); sc.textContent=i; }
    if(i<3){ const cn=document.getElementById('scn'+i); cn.className='stcon'+(i<step?' done':''); }
  }
}

function goSvcStep(n) {
  hideErrs();
  let ok = true;
  const cur = getCurSvcStep();

  if(cur===1) {
    if(!SVC.serviceType){ document.getElementById('svcSelErr').classList.add('show'); ok=false; }
  }
  if(cur===2) {
    const nm=document.getElementById('sName'), ph=document.getElementById('sPhone'),
      em=document.getElementById('sEmail'), pn=document.getElementById('sPan');
    if(!nm.value.trim()){ nm.classList.add('err'); document.getElementById('sNameErr').classList.add('show'); ok=false; }
    if(ph.value.replace(/[^0-9]/g,'').length<10){ ph.classList.add('err'); document.getElementById('sPhoneErr').classList.add('show'); ok=false; }
    if(!em.value.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)){ em.classList.add('err'); document.getElementById('sEmailErr').classList.add('show'); ok=false; }
    if(!pn.value.match(/^[A-Z]{5}[0-9]{4}[A-Z]$/)){ pn.classList.add('err'); document.getElementById('sPanErr').classList.add('show'); ok=false; }
    if(ok){
      SVC.name=nm.value.trim(); SVC.phone=normalizePhone(ph.value); SVC.email=em.value.trim();
      SVC.pan=pn.value; SVC.bizName=document.getElementById('sBizName').value||'';
      SVC.notes=document.getElementById('sNotes').value||'';
      SVC.requirements=document.getElementById('svcRequirements').value||'';
      document.getElementById('svcEmailBadge').textContent = SVC.email;
    }
  }
  if(!ok) return;
  document.getElementById('svcStep'+cur).classList.remove('active');
  document.getElementById('svcStep'+n).classList.add('active');
  updSvcStepper(n);
}

function getCurSvcStep() {
  for(let i=1;i<=3;i++){ if(document.getElementById('ssi'+i).classList.contains('active')) return i; }
  return 1;
}

async function sendSvcEmailOTP() {
  const email = String(SVC.email || '').trim();
  if(!isValidEmail(email)){ showToast('Enter a valid email in Step 2','error'); return; }
  const btn = document.getElementById('sendSvcOtpBtn');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    const otpCode = generateOTP(6);
    const sessionId = await storeOTPToDatabase(email, null, otpCode, 'email');
    SVC.otpSessionId = sessionId;
    await sendOTPViaEmail(email, otpCode);
    showToast('✅ OTP sent to '+email, 'success');
  } catch (e) {
    console.error('❌ Service OTP send failed:', e.message || e);
    showToast('❌ Failed to send OTP: '+ (e.message || 'Please try again later.'), 'error');
  } finally {
    setTimeout(() => {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Send OTP';
      }
    }, 30000);
  }
}

function seoNext(i) {
  const el = document.getElementById('seo'+i);
  if(el.value.length===1 && i<5) document.getElementById('seo'+(i+1)).focus();
  checkSvcOTP();
}

function seoBack(e,i) {
  if(e.key==='Backspace' && !document.getElementById('seo'+i).value && i>0)
    document.getElementById('seo'+(i-1)).focus();
}

async function checkSvcOTP() {
  let code='';
  for(let i=0;i<6;i++) code += document.getElementById('seo'+i).value;
  if(code.length!==6) return;
  if(!SVC.otpSessionId){
    document.getElementById('svcEmailOtpErr').textContent = 'No OTP session found. Please send OTP first.';
    document.getElementById('svcEmailOtpErr').classList.add('show');
    return;
  }

  try {
    await verifyOTPServer(SVC.otpSessionId, code);
    SVC.emailVerified = true;
    document.getElementById('svcEmailOtpErr').classList.remove('show');
    document.getElementById('svcEmailVerifiedBadge').classList.add('show');
    document.getElementById('svcFinalSubmit').disabled = false;
    showToast('✅ Email verified!','success');
  } catch (e) {
    document.getElementById('svcEmailOtpErr').textContent = '❌ ' + (e.message || 'Incorrect OTP');
    document.getElementById('svcEmailOtpErr').classList.add('show');
    SVC.emailVerified = false;
    document.getElementById('svcFinalSubmit').disabled = true;
  }
}

async function submitServiceLead() {
  if(!SVC.emailVerified){ showToast('Verify email first','error'); return; }
  if(!document.getElementById('sConsent').checked){
    document.getElementById('sConsentErr').classList.add('show'); return;
  }
  const ref = 'SV-'+Date.now().toString(36).toUpperCase();
  const btn = document.getElementById('svcFinalSubmit');
  btn.disabled=true; btn.textContent='Submitting...';

  const payload = {
    ref_id:ref, service_type:SVC.serviceType, requirements:SVC.requirements,
    name:SVC.name, phone:normalizePhone(SVC.phone), email:SVC.email, pan:SVC.pan,
    business_name:SVC.bizName, notes:SVC.notes, email_verified:true,
    submitted_at:new Date().toISOString()
  };

  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/serviceleads`,{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON,
        'Authorization':`Bearer ${SUPABASE_ANON}`,'Prefer':'return=minimal'},
      body:JSON.stringify({...payload, lead_type:'service'})
    });
    if(!res.ok && res.status!==201) throw new Error('status '+res.status);
    console.log('✅ Service lead saved to Supabase serviceleads table');
  } catch(e){ console.warn('Supabase serviceleads:', e.message); }

  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/leads`,{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON,
        'Authorization':`Bearer ${SUPABASE_ANON}`,'Prefer':'return=minimal'},
      body:JSON.stringify({
        ref_id:ref,
        loan_type:SVC.serviceType,
        name:SVC.name,
        phone:normalizePhone(SVC.phone),
        email:SVC.email,
        pan:SVC.pan,
        company:SVC.bizName,
        notes:SVC.requirements ? `${SVC.serviceType} — ${SVC.requirements}` : SVC.serviceType,
        email_verified:true,
        submitted_at:new Date().toISOString()
      })
    });
    if(!res.ok && res.status!==201) throw new Error('status '+res.status);
    console.log('✅ Service lead saved to Supabase leads table');
  } catch(e){ console.warn('Supabase leads:', e.message); }

  document.getElementById('svcRefNo').textContent = 'REF: '+ref;
  document.getElementById('svcStep3').classList.remove('active');
  document.getElementById('svcStepper').style.display = 'none';
  document.getElementById('svcSuccess').classList.add('show');
  showToast('🎉 Service request submitted!','success');
}

/* ── TOAST ───────────────────────────────────────────── */
function showToast(msg, type) {
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.className='toast show '+(type||'');
  setTimeout(()=>t.classList.remove('show'), 3500);
}
