const STORAGE_KEY = 'miPresupuesto.v2';
const DATA_URL = 'data.json';

const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const monthShort = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const chartPalette = ['#4f4a68','#123f50','#c99a3d','#2e8b65','#c85454','#6a6388','#7b8f9e','#9b6b52'];
let state = null;
let activeView = 'home';
let currentMonth = '2026-09';
let analyticsYear = 2026;
let selectedAssetChart = 'total';
let selectedExpenseCategory = 'all';
let expenseOrganizeMode = false;
let savingsOrganizeMode = false;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
function id(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`; }
function monthLabel(key) { const [y,m] = key.split('-').map(Number); return `${monthNames[m-1]} ${y}`; }
function shiftMonth(key, delta) { const [y,m] = key.split('-').map(Number); const d = new Date(y, m-1 + delta, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function yearMonths(year) { return Array.from({length:12},(_,i)=>`${year}-${String(i+1).padStart(2,'0')}`); }
function money(value, currency='COP') { const n = Number(value || 0); return new Intl.NumberFormat('es-CO',{style:'currency',currency,maximumFractionDigits:0}).format(n); }
function numberValue(value) {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  // Los campos de dinero usan punto como separador de miles (ej. 935.000).
  // Al editar, quitamos los separadores antes de convertir a número para
  // evitar que JavaScript interprete 935.000 como 935.
  const normalized = text.replace(/[^0-9-]/g, '');
  return Number(normalized) || 0;
}
function formatNumber(value) { const n=numberValue(value); return n===0 ? '0' : new Intl.NumberFormat('es-CO',{maximumFractionDigits:0}).format(n); }
function focusNumberInput(el){ if(!el)return; const raw=numberValue(el.value); el.value=raw===0?'':String(raw); }
function blurNumberInput(el){ if(!el)return; el.value=formatNumber(el.value); }
function ensureMonthly(item) { if (!item.monthly) item.monthly = {}; }
function getMonthValue(item, month) { ensureMonthly(item); return Number(item.monthly[month] || 0); }
function hasOwnMonthValue(item, month) { return Object.prototype.hasOwnProperty.call(item.monthly || {}, month); }
function setMonthValue(item, month, value) { ensureMonthly(item); item.monthly[month] = Number(value) || 0; }
function save() { state.currentMonth = currentMonth; localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

function normalize(data) {
  data.incomeItems ||= [];
  data.expenseItems ||= [];
  data.assetItems ||= [];
  data.settings ||= { usdToCop: 4000 };

  // Orden personalizado SOLO para la sección de Gastos.
  // Si el usuario ya tenía datos guardados, se conserva el orden actual y
  // se añaden al final las categorías/subcategorías nuevas.
  data.expenseCategoryOrder ||= [];
  data.expenseSubcategoryOrder ||= {};
  data.assetCategoryOrder ||= [];
  data.assetSubcategoryOrder ||= {};
  const existingCategories = [...new Set(data.expenseItems.map(x => x.category).filter(Boolean))];
  const validCategoryOrder = data.expenseCategoryOrder.filter(c => existingCategories.includes(c));
  existingCategories.forEach(c => { if (!validCategoryOrder.includes(c)) validCategoryOrder.push(c); });
  data.expenseCategoryOrder = validCategoryOrder;
  for (const cat of existingCategories) {
    const existingSubs = data.expenseItems.filter(x => x.category === cat).map(x => x.subcategory).filter(Boolean);
    const savedSubs = Array.isArray(data.expenseSubcategoryOrder[cat]) ? data.expenseSubcategoryOrder[cat] : [];
    const validSubs = savedSubs.filter(sub => existingSubs.includes(sub));
    existingSubs.forEach(sub => { if (!validSubs.includes(sub)) validSubs.push(sub); });
    data.expenseSubcategoryOrder[cat] = validSubs;
  }
  for (const x of [...data.incomeItems,...data.expenseItems,...data.assetItems]) {
    ensureMonthly(x);
    if (x.category === '[object PointerEvent]' || x.category === '[object Event]') x.category = 'Otros';
    if (x.subcategory === '[object PointerEvent]' || x.subcategory === '[object Event]') x.subcategory = 'Nuevo gasto';
    if (x.name === '[object PointerEvent]' || x.name === '[object Event]') x.name = 'Nueva cuenta';
  }
  const existingAssetCategories = [...new Set(data.assetItems.map(x => x.category).filter(Boolean))];
  const validAssetCategoryOrder = data.assetCategoryOrder.filter(c => existingAssetCategories.includes(c));
  existingAssetCategories.forEach(c => { if (!validAssetCategoryOrder.includes(c)) validAssetCategoryOrder.push(c); });
  data.assetCategoryOrder = validAssetCategoryOrder;
  for (const cat of existingAssetCategories) {
    const existingSubs = data.assetItems.filter(x => x.category === cat).map(x => x.name).filter(Boolean);
    const savedSubs = Array.isArray(data.assetSubcategoryOrder[cat]) ? data.assetSubcategoryOrder[cat] : [];
    const validSubs = savedSubs.filter(sub => existingSubs.includes(sub));
    existingSubs.forEach(sub => { if (!validSubs.includes(sub)) validSubs.push(sub); });
    data.assetSubcategoryOrder[cat] = validSubs;
  }
  if (data.legacy2025) {
    for (const [month, vals] of Object.entries(data.legacy2025)) {
      for (const [itemId,v] of Object.entries(vals.income || {})) { const item=data.incomeItems.find(x=>x.id===itemId); if(item)setMonthValue(item,month,v); }
      for (const [itemId,v] of Object.entries(vals.expenses || {})) { const item=data.expenseItems.find(x=>x.id===itemId); if(item)setMonthValue(item,month,v); }
      for (const [itemId,v] of Object.entries(vals.assets || {})) { const item=data.assetItems.find(x=>x.id===itemId); if(item)setMonthValue(item,month,v); }
    }
    delete data.legacy2025;
  }
  return data;
}

async function boot() {
  const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('miPresupuesto.v1');
  if (saved) { try { state=normalize(JSON.parse(saved)); currentMonth=state.currentMonth||currentMonth; } catch { state=null; } }
  if (!state) { const res=await fetch(DATA_URL); state=normalize(await res.json()); currentMonth=state.currentMonth||currentMonth; }
  analyticsYear = Number(currentMonth.slice(0,4));
  autoCarryJanuarySavings();
  save();
  bindEvents(); render(); registerSW();
}

function bindEvents() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'edit-category') editCategory(btn.dataset.category);
    if (action === 'add-subcategory') openAddExpense(btn.dataset.category);
    if (action === 'move-category-up') moveExpenseCategory(btn.dataset.category,-1);
    if (action === 'move-category-down') moveExpenseCategory(btn.dataset.category,1);
    if (action === 'move-subcategory-up') moveExpenseSubcategory(btn.dataset.category,btn.dataset.subcategory,-1);
    if (action === 'move-subcategory-down') moveExpenseSubcategory(btn.dataset.category,btn.dataset.subcategory,1);
    if (action === 'move-subcategory-category') openMoveExpense(btn.dataset.id);
    if (action === 'move-asset-subcategory-category') openMoveAsset(btn.dataset.id);
    if (action === 'move-asset-category-up') moveAssetCategory(btn.dataset.category,-1);
    if (action === 'move-asset-category-down') moveAssetCategory(btn.dataset.category,1);
    if (action === 'move-asset-subcategory-up') moveAssetSubcategory(btn.dataset.category,btn.dataset.subcategory,-1);
    if (action === 'move-asset-subcategory-down') moveAssetSubcategory(btn.dataset.category,btn.dataset.subcategory,1);
    if (action === 'edit-asset-category') editAssetCategory(btn.dataset.category);
    if (action === 'add-asset-to-category') openAddAsset(btn.dataset.category);
    if (action === 'edit-expense') editExpense(btn.dataset.id);
    if (action === 'delete-expense') deleteExpense(btn.dataset.id);
  });
  $$('.nav-item').forEach(btn=>btn.addEventListener('click',()=>showView(btn.dataset.view)));
  $$('[data-go]').forEach(btn=>btn.addEventListener('click',()=>showView(btn.dataset.go)));
  $('#prevMonth').onclick=()=>changeMonth(-1); $('#nextMonth').onclick=()=>changeMonth(1);
  $('#prevMonthExpenses').onclick=()=>changeMonth(-1); $('#nextMonthExpenses').onclick=()=>changeMonth(1);
  $('#prevMonthSavings').onclick=()=>changeMonth(-1); $('#nextMonthSavings').onclick=()=>changeMonth(1);
  $('#prevMonthIncome').onclick=()=>changeMonth(-1); $('#nextMonthIncome').onclick=()=>changeMonth(1);
  $('#addIncomeBtn').onclick=()=>openAddIncome();
  $('#addExpenseBtn').onclick=()=>openAddExpense('');
  $('#addAssetBtn').onclick=()=>openAddAsset();
  $('#copyPreviousMonth').onclick=copyPreviousMonth;
  $('#copyPreviousExpenses').onclick=copyPreviousExpenses;
  $('#copyPreviousSavings').onclick=copyPreviousSavings;
  $('#prevYear').onclick=()=>{analyticsYear--;renderAnalytics();};
  $('#nextYear').onclick=()=>{analyticsYear++;renderAnalytics();};
  $('#assetChartSelect').onchange=(e)=>{selectedAssetChart=e.target.value;renderAnalytics();};
  $('#analyticsExpenseCategorySelect').onchange=(e)=>{selectedExpenseCategory=e.target.value;renderAnalytics();};
  document.addEventListener('pointerover',handleChartPointer);
  document.addEventListener('pointerout',handleChartPointerOut);
  document.addEventListener('pointermove',handleChartPointerMove);
  document.addEventListener('click',handleChartClick);
  $('#settingsBtn').onclick=openSettings;
  $('#toggleExpenseOrganize').onclick=toggleExpenseOrganize;
  $('#toggleSavingsOrganize').onclick=toggleSavingsOrganize;
  document.addEventListener('focusin',e=>{if(e.target.matches('.value-input,.number-format'))focusNumberInput(e.target);});
  document.addEventListener('focusout',e=>{if(e.target.matches('.value-input,.number-format'))blurNumberInput(e.target);});
  $('#modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeModal();});
}
function showView(view){activeView=view;$$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${view}`));$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));render();window.scrollTo({top:0,behavior:'smooth'});}
function changeMonth(delta){
  const next=shiftMonth(currentMonth,delta);
  currentMonth=next;
  analyticsYear=Number(currentMonth.slice(0,4));
  autoCarryJanuarySavings();
  save();render();
}
function autoCarryJanuarySavings(){
  if(!state || !currentMonth.endsWith('-01')) return;
  const prev=shiftMonth(currentMonth,-1);
  const currentHas=state.assetItems.some(x=>getMonthValue(x,currentMonth)!==0);
  const previousHas=state.assetItems.some(x=>getMonthValue(x,prev)!==0);
  if(currentHas || !previousHas) return;
  state.assetItems.forEach(x=>setMonthValue(x,currentMonth,getMonthValue(x,prev)));
  toast(`Saldos de diciembre pasaron a ${monthLabel(currentMonth)}`);
}
function totals(month=currentMonth){const income=state.incomeItems.reduce((s,x)=>s+getMonthValue(x,month),0);const expenses=state.expenseItems.reduce((s,x)=>s+getMonthValue(x,month),0);return{income,expenses,extra:income-expenses};}
function annualTotal(item){
  // Acumulado del año que se está visualizando, hasta el mes seleccionado.
  // No mezcla valores de otros años ni suma meses futuros.
  const year=Number(currentMonth.slice(0,4));
  const selectedMonth=Number(currentMonth.slice(5,7));
  return yearMonths(year).slice(0,selectedMonth).reduce((s,m)=>s+getMonthValue(item,m),0);
}
function categoryTotals(month=currentMonth){const map={};state.expenseItems.forEach(x=>{const v=getMonthValue(x,month);if(v)map[x.category]=(map[x.category]||0)+v;});return Object.entries(map).sort((a,b)=>b[1]-a[1]);}
function assetTotals(month=currentMonth){let cop=0,usd=0;state.assetItems.forEach(x=>{const v=getMonthValue(x,month);if(x.currency==='USD')usd+=v;else cop+=v;});const rate=Number(state.settings.usdToCop||4000);return{cop,usd,totalCopEquivalent:cop+usd*rate};}
function categories(){return [...new Set(state.expenseItems.map(x=>x.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));}
function orderedExpenseCategories(){
  const existing=[...new Set(state.expenseItems.map(x=>x.category).filter(Boolean))];
  const order=(state.expenseCategoryOrder||[]).filter(c=>existing.includes(c));
  existing.forEach(c=>{if(!order.includes(c))order.push(c);});
  return order;
}
function subcategories(category){return state.expenseItems.filter(x=>x.category===category).map(x=>x.subcategory).filter(Boolean).sort((a,b)=>a.localeCompare(b,'es'));}
function orderedExpenseSubcategories(category){
  const existing=state.expenseItems.filter(x=>x.category===category).map(x=>x.subcategory).filter(Boolean);
  const saved=(state.expenseSubcategoryOrder&&state.expenseSubcategoryOrder[category])||[];
  const order=saved.filter(s=>existing.includes(s));
  existing.forEach(s=>{if(!order.includes(s))order.push(s);});
  return order;
}
function moveExpenseCategory(category,direction){
  const order=orderedExpenseCategories(); const i=order.indexOf(category); if(i<0)return;
  const j=i+direction; if(j<0||j>=order.length)return;
  [order[i],order[j]]=[order[j],order[i]]; state.expenseCategoryOrder=order; save(); renderExpenses();
}
function moveExpenseSubcategory(category,subcategory,direction){
  const order=orderedExpenseSubcategories(category); const i=order.indexOf(subcategory); if(i<0)return;
  const j=i+direction; if(j<0||j>=order.length)return;
  [order[i],order[j]]=[order[j],order[i]]; state.expenseSubcategoryOrder[category]=order; save(); renderExpenses();
}

function toggleExpenseOrganize(){expenseOrganizeMode=!expenseOrganizeMode;renderExpenses();toast(expenseOrganizeMode?'Modo organización activado':'Orden guardado');}
function moveExpenseItemToCategory(itemId,newCategory){
  const x=state.expenseItems.find(i=>i.id===itemId); if(!x)return false;
  const oldCategory=x.category, oldSub=x.subcategory;
  newCategory=String(newCategory||'').trim(); if(!newCategory||newCategory===oldCategory)return false;
  if(state.expenseItems.some(i=>i.id!==itemId&&i.category.toLowerCase()===newCategory.toLowerCase()&&i.subcategory.toLowerCase()===oldSub.toLowerCase())){
    alert('Ya existe esa subcategoría dentro de la categoría seleccionada.'); return false;
  }
  x.category=newCategory;
  state.expenseCategoryOrder ||= [];
  if(!state.expenseCategoryOrder.includes(newCategory)) state.expenseCategoryOrder.push(newCategory);
  state.expenseSubcategoryOrder ||= {};
  state.expenseSubcategoryOrder[oldCategory]=(state.expenseSubcategoryOrder[oldCategory]||[]).filter(s=>s!==oldSub);
  state.expenseSubcategoryOrder[newCategory] ||= [];
  if(!state.expenseSubcategoryOrder[newCategory].includes(oldSub)) state.expenseSubcategoryOrder[newCategory].push(oldSub);
  if(!state.expenseItems.some(i=>i.category===oldCategory)){
    state.expenseCategoryOrder=state.expenseCategoryOrder.filter(c=>c!==oldCategory);
    delete state.expenseSubcategoryOrder[oldCategory];
  }
  save(); renderExpenses(); toast(`“${oldSub}” movida a ${newCategory}`); return true;
}
function openMoveExpense(itemId){
  const x=state.expenseItems.find(i=>i.id===itemId); if(!x)return;
  const cats=orderedExpenseCategories().filter(c=>c!==x.category);
  const options=cats.map(c=>`<option value="${escAttr(c)}">${esc(c)}</option>`).join('');
  $('#modal').innerHTML=`<h3>Mover subcategoría</h3><form id="moveExpenseForm"><p class="helper" style="margin-top:-4px;margin-bottom:14px"><strong>${esc(x.subcategory)}</strong> está actualmente en <strong>${esc(x.category)}</strong>.</p><div class="form-field"><label>Mover a</label><select class="select" id="moveExpenseCategory"><option value="">Selecciona una categoría...</option>${options}<option value="__new__">＋ Crear nueva categoría</option></select></div><div class="form-field hidden" id="moveExpenseNewCategoryField"><label>Nueva categoría</label><input class="input" id="moveExpenseNewCategory" placeholder="Ej. Ocio" autocomplete="off"></div><div class="form-actions"><button type="button" class="secondary-btn" onclick="closeModal()">Cancelar</button><button class="primary-btn" type="submit">Mover</button></div></form>`;
  $('#modalBackdrop').classList.remove('hidden');
  const sel=$('#moveExpenseCategory');
  sel.onchange=()=>{$('#moveExpenseNewCategoryField').classList.toggle('hidden',sel.value!=='__new__');if(sel.value==='__new__')setTimeout(()=>$('#moveExpenseNewCategory').focus(),30);};
  $('#moveExpenseForm').onsubmit=e=>{e.preventDefault();let dest=sel.value;if(dest==='__new__')dest=$('#moveExpenseNewCategory').value.trim();if(!dest){alert('Selecciona o crea una categoría.');return;}if(moveExpenseItemToCategory(itemId,dest))closeModal();};
  setTimeout(()=>sel.focus(),50);
}
function orderedAssetCategories(){const existing=[...new Set(state.assetItems.map(x=>x.category).filter(Boolean))];const order=(state.assetCategoryOrder||[]).filter(c=>existing.includes(c));existing.forEach(c=>{if(!order.includes(c))order.push(c);});return order;}
function orderedAssetSubcategories(category){const existing=state.assetItems.filter(x=>x.category===category).map(x=>x.name).filter(Boolean);const saved=(state.assetSubcategoryOrder&&state.assetSubcategoryOrder[category])||[];const order=saved.filter(s=>existing.includes(s));existing.forEach(s=>{if(!order.includes(s))order.push(s);});return order;}
function moveAssetCategory(category,direction){const order=orderedAssetCategories(),i=order.indexOf(category),j=i+direction;if(i<0||j<0||j>=order.length)return;[order[i],order[j]]=[order[j],order[i]];state.assetCategoryOrder=order;save();renderAssets();}
function moveAssetSubcategory(category,name,direction){const order=orderedAssetSubcategories(category),i=order.indexOf(name),j=i+direction;if(i<0||j<0||j>=order.length)return;[order[i],order[j]]=[order[j],order[i]];state.assetSubcategoryOrder[category]=order;save();renderAssets();}
function toggleSavingsOrganize(){savingsOrganizeMode=!savingsOrganizeMode;renderAssets();toast(savingsOrganizeMode?'Modo organización activado':'Orden guardado');}
function moveAssetItemToCategory(itemId,newCategory){
  const x=state.assetItems.find(i=>i.id===itemId); if(!x)return false;
  const oldCategory=x.category, oldName=x.name;
  newCategory=String(newCategory||'').trim(); if(!newCategory||newCategory===oldCategory)return false;
  if(state.assetItems.some(i=>i.id!==itemId&&i.category.toLowerCase()===newCategory.toLowerCase()&&i.name.toLowerCase()===oldName.toLowerCase())){
    alert('Ya existe una cuenta/inversión con ese nombre dentro de la categoría seleccionada.'); return false;
  }
  x.category=newCategory;
  state.assetCategoryOrder ||= [];
  if(!state.assetCategoryOrder.includes(newCategory)) state.assetCategoryOrder.push(newCategory);
  state.assetSubcategoryOrder ||= {};
  state.assetSubcategoryOrder[oldCategory]=(state.assetSubcategoryOrder[oldCategory]||[]).filter(n=>n!==oldName);
  state.assetSubcategoryOrder[newCategory] ||= [];
  if(!state.assetSubcategoryOrder[newCategory].includes(oldName)) state.assetSubcategoryOrder[newCategory].push(oldName);
  if(!state.assetItems.some(i=>i.category===oldCategory)){
    state.assetCategoryOrder=state.assetCategoryOrder.filter(c=>c!==oldCategory);
    delete state.assetSubcategoryOrder[oldCategory];
  }
  save(); renderAssets(); toast(`“${oldName}” movida a ${newCategory}`); return true;
}
function openMoveAsset(itemId){
  const x=state.assetItems.find(i=>i.id===itemId); if(!x)return;
  const cats=orderedAssetCategories().filter(c=>c!==x.category);
  const options=cats.map(c=>`<option value="${escAttr(c)}">${esc(c)}</option>`).join('');
  $('#modal').innerHTML=`<h3>Mover cuenta / inversión</h3><form id="moveAssetForm"><p class="helper" style="margin-top:-4px;margin-bottom:14px"><strong>${esc(x.name)}</strong> está actualmente en <strong>${esc(x.category)}</strong>.</p><div class="form-field"><label>Mover a</label><select class="select" id="moveAssetCategory"><option value="">Selecciona una categoría...</option>${options}<option value="__new__">＋ Crear nueva categoría</option></select></div><div class="form-field hidden" id="moveAssetNewCategoryField"><label>Nueva categoría</label><input class="input" id="moveAssetNewCategory" placeholder="Ej. INVERSIONES" autocomplete="off"></div><div class="form-actions"><button type="button" class="secondary-btn" onclick="closeModal()">Cancelar</button><button class="primary-btn" type="submit">Mover</button></div></form>`;
  $('#modalBackdrop').classList.remove('hidden');
  const sel=$('#moveAssetCategory');
  sel.onchange=()=>{$('#moveAssetNewCategoryField').classList.toggle('hidden',sel.value!=='__new__');if(sel.value==='__new__')setTimeout(()=>$('#moveAssetNewCategory').focus(),30);};
  $('#moveAssetForm').onsubmit=e=>{e.preventDefault();let dest=sel.value;if(dest==='__new__')dest=$('#moveAssetNewCategory').value.trim();if(!dest){alert('Selecciona o crea una categoría.');return;}if(moveAssetItemToCategory(itemId,dest))closeModal();};
  setTimeout(()=>sel.focus(),50);
}

function render(){renderMonthLabels();renderHome();renderIncome();renderExpenses();renderAssets();renderAnalytics();}
function renderMonthLabels(){$('#currentMonthLabel').textContent=monthLabel(currentMonth);$('#expenseMonthLabel').textContent=monthLabel(currentMonth);$('#savingsMonthLabel').textContent=monthLabel(currentMonth);$('#incomeMonthLabel').textContent=monthLabel(currentMonth);}
function renderHome(){
  const t=totals();$('#summaryIncome').textContent=money(t.income);$('#summaryExpenses').textContent=money(t.expenses);$('#summaryExtra').textContent=money(Math.abs(t.extra));$('#extraLabel').textContent=t.extra>=0?'🟢 Extra disponible':'🔴 Déficit del mes';$('#summaryExtra').parentElement.classList.toggle('negative',t.extra<0);
  $('#homeIncomeTotal').textContent=money(t.income);$('#homeExpenseTotal').textContent=money(t.expenses);
  $('#homeIncomeList').innerHTML=state.incomeItems.filter(x=>getMonthValue(x,currentMonth)!==0).map(x=>miniRow(x.name,money(getMonthValue(x,currentMonth)))).join('')||'<div class="empty">No hay ingresos registrados este mes.</div>';
  const cats=categoryTotals(),max=cats[0]?.[1]||1;$('#homeExpenseList').innerHTML=cats.map(([name,v])=>`<div class="category-item"><div><div class="category-name">${esc(name)}</div><div class="category-bar"><span style="width:${Math.round(v/max*100)}%"></span></div></div><div class="category-value">${money(v)}</div></div>`).join('')||'<div class="empty">No hay gastos registrados este mes.</div>';
  const a=assetTotals();$('#homeWealthTotal').textContent=money(a.totalCopEquivalent);const assetRows=state.assetItems.filter(x=>getMonthValue(x,currentMonth)!==0).slice(0,5);$('#homeSavingsList').innerHTML=assetRows.map(x=>miniRow(`${x.name} · ${x.category}`,x.currency==='USD'?money(x.monthly[currentMonth],'USD'):money(getMonthValue(x,currentMonth)))).join('')||'<div class="empty">Actualiza tus saldos en Ahorros.</div>';
}
function miniRow(a,b){return `<div class="mini-row"><span>${esc(a)}</span><strong>${b}</strong></div>`;}

function renderIncome(){
  const wrap=$('#incomeRows');wrap.innerHTML=state.incomeItems.map(x=>{const val=getMonthValue(x,currentMonth);return `<div class="data-row"><div class="row-top"><div class="row-title"><strong>${esc(x.name)}</strong><small>Año: ${money(annualTotal(x))}</small></div><div class="row-actions"><button class="small-icon" title="Editar" onclick="editIncome('${x.id}')">✏️</button><button class="small-icon" title="Eliminar" onclick="deleteIncome('${x.id}')">🗑️</button></div></div><input class="value-input" inputmode="numeric" aria-label="${esc(x.name)}" value="${val?formatNumber(val):''}" placeholder="$ 0" onchange="updateIncome('${x.id}', this.value)"></div>`;}).join('')||'<div class="empty">Agrega tu primer ingreso.</div>';
  $('#incomeViewTotal').textContent=money(totals().income);
}
function updateIncome(id_,raw){const x=state.incomeItems.find(i=>i.id===id_);if(x){setMonthValue(x,currentMonth,numberValue(raw));save();render();toast('Ingreso actualizado');}}
function editIncome(id_){const x=state.incomeItems.find(i=>i.id===id_);if(!x)return;openForm('Editar ingreso',[{name:'Nombre',key:'name',type:'text',value:x.name}],val=>{x.name=val.name.trim()||x.name;save();render();toast('Ingreso actualizado');});}
function deleteIncome(id_){if(!confirm('¿Eliminar este ingreso y sus valores?'))return;state.incomeItems=state.incomeItems.filter(x=>x.id!==id_);save();render();}
function openAddIncome(){openForm('Nuevo ingreso',[{name:'Nombre',key:'name',type:'text',placeholder:'Ej. Salario AEI'}],val=>{state.incomeItems.push({id:id('inc'),name:val.name.trim()||'Nuevo ingreso',monthly:{}});save();render();toast('Ingreso creado');});}

function renderExpenses(){
  document.body.classList.toggle('expense-organizing', expenseOrganizeMode);
  const organizeBtn=$('#toggleExpenseOrganize'); if(organizeBtn){organizeBtn.textContent=expenseOrganizeMode?'✓ Terminar organización':'↕ Organizar'; organizeBtn.classList.toggle('organize-active',expenseOrganizeMode);}
  const wrap=$('#expenseRows');
  const cats=orderedExpenseCategories();
  wrap.innerHTML=cats.map((cat,catIndex)=>{
    const items=orderedExpenseSubcategories(cat).map(sub=>state.expenseItems.find(x=>x.category===cat&&x.subcategory===sub)).filter(Boolean);
    const catTotal=items.reduce((s,x)=>s+getMonthValue(x,currentMonth),0);
    const canUp=catIndex>0, canDown=catIndex<cats.length-1;
    return `<section class="expense-category-card">
      <div class="category-header">
        <div class="category-heading-info"><div class="category-title">${esc(cat)}</div><div class="category-total">${money(catTotal)}</div></div>
        <div class="category-header-actions">
          <button class="order-text-btn organize-only" title="Mover categoría arriba" aria-label="Mover categoría arriba" data-action="move-category-up" data-category="${escAttr(cat)}" ${canUp?'':'disabled'}>↑</button>
          <button class="order-text-btn organize-only" title="Mover categoría abajo" aria-label="Mover categoría abajo" data-action="move-category-down" data-category="${escAttr(cat)}" ${canDown?'':'disabled'}>↓</button>
          <button class="small-icon category-edit-btn" title="Editar nombre de categoría" aria-label="Editar nombre de categoría" data-action="edit-category" data-category="${escAttr(cat)}">✏️</button>
          <button class="small-icon add-sub-btn" title="Agregar subcategoría a ${escAttr(cat)}" aria-label="Agregar subcategoría" data-action="add-subcategory" data-category="${escAttr(cat)}">＋</button>
        </div>
      </div>
      <div class="category-items">${items.map((x,index)=>expenseItemHTML(x,index,items.length,cat)).join('')}</div>
    </section>`;
  }).join('')||'<div class="empty">Agrega tu primer gasto.</div>';
  $('#expensesViewTotal').textContent=money(totals().expenses);
}
function expenseItemHTML(x,index,total,category){
  const val=getMonthValue(x,currentMonth);
  const canUp=index>0, canDown=index<total-1;
  return `<div class="expense-item">
    <div class="row-top">
      <div class="row-title"><strong>${esc(x.subcategory)}</strong><small>Acumulado año: ${money(annualTotal(x))}</small></div>
      <div class="row-actions">
        <button class="order-text-btn organize-only" title="Mover subcategoría arriba" aria-label="Mover subcategoría arriba" data-action="move-subcategory-up" data-category="${escAttr(category)}" data-subcategory="${escAttr(x.subcategory)}" ${canUp?'':'disabled'}>↑</button>
        <button class="order-text-btn organize-only" title="Mover subcategoría abajo" aria-label="Mover subcategoría abajo" data-action="move-subcategory-down" data-category="${escAttr(category)}" data-subcategory="${escAttr(x.subcategory)}" ${canDown?'':'disabled'}>↓</button><button class="order-text-btn organize-only" title="Mover a otra categoría" aria-label="Mover a otra categoría" data-action="move-subcategory-category" data-id="${escAttr(x.id)}">↗</button>
        <button class="small-icon" title="Editar nombre de subcategoría" aria-label="Editar nombre de subcategoría" data-action="edit-expense" data-id="${escAttr(x.id)}">✏️</button>
        <button class="small-icon" title="Eliminar" aria-label="Eliminar gasto" data-action="delete-expense" data-id="${escAttr(x.id)}">🗑️</button>
      </div>
    </div>
    <input class="value-input" inputmode="numeric" aria-label="${esc(x.subcategory)}" value="${val?formatNumber(val):''}" placeholder="$ 0" onchange="updateExpense('${x.id}', this.value)">
  </div>`;
}
function updateExpense(id_,raw){const x=state.expenseItems.find(i=>i.id===id_);if(x){setMonthValue(x,currentMonth,numberValue(raw));save();render();toast('Gasto actualizado');}}
function editCategory(category){
  openForm('Editar categoría',[{name:'Nombre de la categoría',key:'name',type:'text',value:category}],val=>{
    const newName=val.name.trim(); if(!newName){alert('Escribe un nombre para la categoría.');return;}
    if(newName===category)return;
    if(categories().some(c=>c.toLowerCase()===newName.toLowerCase() && c!==category)){alert('Ya existe una categoría con ese nombre.');return;}
    state.expenseItems.forEach(x=>{if(x.category===category)x.category=newName;});
    state.expenseCategoryOrder=(state.expenseCategoryOrder||[]).map(c=>c===category?newName:c);
    state.expenseSubcategoryOrder ||= {};
    if(state.expenseSubcategoryOrder[category]){state.expenseSubcategoryOrder[newName]=state.expenseSubcategoryOrder[category];delete state.expenseSubcategoryOrder[category];}
    save();render();toast('Categoría renombrada');
  });
}
function editExpense(id_){
  const x=state.expenseItems.find(i=>i.id===id_);if(!x)return;
  openSubcategoryForm('Editar subcategoría',x.category,x.subcategory,(subcategory)=>{
    const newName=subcategory.trim();if(!newName){alert('Escribe un nombre para la subcategoría.');return false;}
    const duplicate=state.expenseItems.some(i=>i.id!==x.id&&i.category===x.category&&i.subcategory.toLowerCase()===newName.toLowerCase());if(duplicate){alert('Ya existe esa subcategoría dentro de la categoría.');return false;}
    const oldName=x.subcategory; x.subcategory=newName;
    state.expenseSubcategoryOrder ||= {}; state.expenseSubcategoryOrder[x.category] ||= [];
    state.expenseSubcategoryOrder[x.category]=state.expenseSubcategoryOrder[x.category].map(s=>s===oldName?newName:s);
    save();render();toast('Subcategoría renombrada');return true;
  });
}
function deleteExpense(id_){
  const item=state.expenseItems.find(x=>x.id===id_); if(!item)return;
  if(!confirm('¿Eliminar este gasto y sus valores?'))return;
  state.expenseItems=state.expenseItems.filter(x=>x.id!==id_);
  if(state.expenseSubcategoryOrder?.[item.category]){
    state.expenseSubcategoryOrder[item.category]=state.expenseSubcategoryOrder[item.category].filter(s=>s!==item.subcategory);
  }
  if(!state.expenseItems.some(x=>x.category===item.category)){
    state.expenseCategoryOrder=(state.expenseCategoryOrder||[]).filter(c=>c!==item.category);
    delete state.expenseSubcategoryOrder[item.category];
  }
  save();render();
}
function openAddExpense(category=''){
  if(category){
    openSubcategoryForm('Nueva subcategoría',category,'',(subcategory)=>{
      const newName=subcategory.trim();if(!newName){alert('Escribe un nombre para la subcategoría.');return false;}
      if(state.expenseItems.some(x=>x.category===category&&x.subcategory.toLowerCase()===newName.toLowerCase())){alert('Ya existe esa subcategoría dentro de la categoría.');return false;}
      state.expenseItems.push({id:id('exp'),category,subcategory:newName,monthly:{}});
      state.expenseSubcategoryOrder ||= {}; state.expenseSubcategoryOrder[category] ||= [];
      if(!state.expenseSubcategoryOrder[category].includes(newName)) state.expenseSubcategoryOrder[category].push(newName);
      save();render();toast('Subcategoría creada');return true;
    });
    return;
  }
  openExpenseForm('Nuevo gasto','','',(cat,sub)=>{
    state.expenseItems.push({id:id('exp'),category:cat,subcategory:sub,monthly:{}});
    state.expenseCategoryOrder ||= []; if(!state.expenseCategoryOrder.includes(cat)) state.expenseCategoryOrder.push(cat);
    state.expenseSubcategoryOrder ||= {}; state.expenseSubcategoryOrder[cat] ||= []; if(!state.expenseSubcategoryOrder[cat].includes(sub)) state.expenseSubcategoryOrder[cat].push(sub);
    save();render();toast('Gasto creado');
  });
}
function openSubcategoryForm(title,category,initialSubcategory,onSubmit){
  const isNew=title==='Nueva subcategoría';
  $('#modal').innerHTML=`<h3>${esc(title)}</h3><form id="subcategoryForm"><div class="form-field"><label>Categoría</label><div class="category-form-display">${esc(category)}</div></div><div class="form-field"><label>Nombre de la subcategoría</label><input class="input" id="subcategoryNameInput" name="subcategory" value="${escAttr(initialSubcategory)}" placeholder="Ej. Restaurantes" autocomplete="off" required></div><p class="helper">${isNew?'Esta subcategoría quedará dentro de la categoría seleccionada.':'Aquí solo cambias el nombre de la subcategoría. La categoría no se modifica.'}</p><div class="form-actions"><button type="button" class="secondary-btn" onclick="closeModal()">Cancelar</button><button class="primary-btn" type="submit">${isNew?'Crear subcategoría':'Guardar cambios'}</button></div></form>`;
  $('#modalBackdrop').classList.remove('hidden');
  $('#subcategoryForm').onsubmit=e=>{e.preventDefault();const ok=onSubmit($('#subcategoryNameInput').value);if(ok!==false)closeModal();};
  setTimeout(()=>$('#subcategoryNameInput').focus(),50);
}
function openExpenseForm(title, initialCategory='', initialSubcategory='', onSubmit){
  const cats=categories();const safeInitialCat=cats.includes(initialCategory)?initialCategory:(initialCategory||'');const subOpts=safeInitialCat?subcategories(safeInitialCat):[];
  $('#modal').innerHTML=`<h3>${esc(title)}</h3><form id="expenseForm"><div class="form-field"><label>Categoría</label><select class="select" id="expenseFormCategorySelect" name="category"><option value="">Selecciona una categoría...</option>${cats.map(c=>`<option value="${escAttr(c)}" ${c===safeInitialCat?'selected':''}>${esc(c)}</option>`).join('')}<option value="__new__">＋ Crear nueva categoría</option></select></div><div class="form-field hidden" id="newCategoryField"><label>Nueva categoría</label><input class="input" id="newCategoryInput" placeholder="Ej. Ocio"></div><div class="form-field"><label>Subcategoría</label><select class="select" id="expenseSubcategorySelect" name="subcategory"><option value="">${safeInitialCat?'Selecciona una subcategoría...':'Primero selecciona una categoría...'}</option>${subOpts.map(s=>`<option value="${escAttr(s)}" ${s===initialSubcategory?'selected':''}>${esc(s)}</option>`).join('')}<option value="__new__">＋ Crear nueva subcategoría</option></select></div><div class="form-field hidden" id="newSubcategoryField"><label>Nueva subcategoría</label><input class="input" id="newSubcategoryInput" placeholder="Ej. Restaurantes"></div><div class="form-actions"><button type="button" class="secondary-btn" onclick="closeModal()">Cancelar</button><button class="primary-btn" type="submit">Guardar</button></div></form>`;
  $('#modalBackdrop').classList.remove('hidden');
  const catSel=$('#expenseFormCategorySelect'),subSel=$('#expenseSubcategorySelect');
  catSel.onchange=()=>{const val=catSel.value;$('#newCategoryField').classList.toggle('hidden',val!=='__new__');const actual=val==='__new__'?'':val;const opts=actual?subcategories(actual):[];subSel.innerHTML=`<option value="">${actual?'Selecciona una subcategoría...':'Primero selecciona una categoría...'}</option>${opts.map(s=>`<option value="${escAttr(s)}">${esc(s)}</option>`).join('')}<option value="__new__">＋ Crear nueva subcategoría</option>`;$('#newSubcategoryField').classList.add('hidden');if(val==='__new__')setTimeout(()=>$('#newCategoryInput').focus(),30);};
  subSel.onchange=()=>{$('#newSubcategoryField').classList.toggle('hidden',subSel.value!=='__new__');if(subSel.value==='__new__')setTimeout(()=>$('#newSubcategoryInput').focus(),30);};
  $('#expenseForm').onsubmit=e=>{e.preventDefault();let category=catSel.value,sub=subSel.value;if(category==='__new__')category=$('#newCategoryInput').value.trim();if(sub==='__new__')sub=$('#newSubcategoryInput').value.trim();if(!category){alert('Selecciona o crea una categoría.');return;}if(!sub){alert('Selecciona o crea una subcategoría.');return;}if(state.expenseItems.some(x=>x.category.toLowerCase()===category.toLowerCase()&&x.subcategory.toLowerCase()===sub.toLowerCase())){alert('Esa subcategoría ya existe dentro de la categoría.');return;}onSubmit(category,sub);closeModal();};
  setTimeout(()=>catSel.focus(),50);
}

function copyPreviousExpenses(){
  const prev=shiftMonth(currentMonth,-1);if(!state.expenseItems.some(x=>getMonthValue(x,prev)!==0)){toast(`No hay gastos registrados en ${monthLabel(prev)}`);return;}
  const overwrite=currentMonthHasExpenses();const message=overwrite?`Ya hay gastos en ${monthLabel(currentMonth)}. ¿Quieres reemplazar sus valores con los de ${monthLabel(prev)}?`:`¿Copiar los gastos de ${monthLabel(prev)} a ${monthLabel(currentMonth)}?`;
  if(!confirm(message))return;state.expenseItems.forEach(x=>setMonthValue(x,currentMonth,getMonthValue(x,prev)));save();render();toast(`Gastos copiados de ${monthLabel(prev)}`);
}
function currentMonthHasExpenses(){return state.expenseItems.some(x=>getMonthValue(x,currentMonth)!==0);}
function copyPreviousMonth(){
  const prev=shiftMonth(currentMonth,-1);if(!state.incomeItems.some(x=>getMonthValue(x,prev)!==0)){toast(`No hay ingresos registrados en ${monthLabel(prev)}`);return;}
  if(!confirm(`¿Copiar los ingresos de ${monthLabel(prev)} a ${monthLabel(currentMonth)}?`))return;state.incomeItems.forEach(x=>setMonthValue(x,currentMonth,getMonthValue(x,prev)));save();render();toast(`Ingresos copiados de ${monthLabel(prev)}`);
}
function copyPreviousSavings(){
  const prev=shiftMonth(currentMonth,-1);if(!state.assetItems.some(x=>getMonthValue(x,prev)!==0)){toast(`No hay saldos registrados en ${monthLabel(prev)}`);return;}
  const overwrite=state.assetItems.some(x=>getMonthValue(x,currentMonth)!==0);const message=overwrite?`Ya hay saldos en ${monthLabel(currentMonth)}. ¿Quieres reemplazarlos por los de ${monthLabel(prev)}?`:`¿Copiar los saldos de ${monthLabel(prev)} a ${monthLabel(currentMonth)}?`;
  if(!confirm(message))return;state.assetItems.forEach(x=>setMonthValue(x,currentMonth,getMonthValue(x,prev)));save();render();toast(`Saldos copiados de ${monthLabel(prev)}`);
}

function renderAssets(){
  document.body.classList.toggle('savings-organizing', savingsOrganizeMode);
  const organizeBtn=$('#toggleSavingsOrganize'); if(organizeBtn){organizeBtn.textContent=savingsOrganizeMode?'✓ Terminar organización':'↕ Organizar'; organizeBtn.classList.toggle('organize-active',savingsOrganizeMode);}
  const wrap=$('#assetRows'),cats=orderedAssetCategories();
  wrap.innerHTML=cats.map((cat,catIndex)=>{
    const items=orderedAssetSubcategories(cat).map(name=>state.assetItems.find(x=>x.category===cat&&x.name===name)).filter(Boolean);
    const canUp=catIndex>0,canDown=catIndex<cats.length-1;
    return `<section class="asset-category-card"><div class="category-header"><div class="category-heading-info"><div class="category-title">${esc(cat)}</div></div><div class="category-header-actions"><button class="order-text-btn organize-only" title="Mover categoría arriba" aria-label="Mover categoría arriba" data-action="move-asset-category-up" data-category="${escAttr(cat)}" ${canUp?'':'disabled'}>↑</button><button class="order-text-btn organize-only" title="Mover categoría abajo" aria-label="Mover categoría abajo" data-action="move-asset-category-down" data-category="${escAttr(cat)}" ${canDown?'':'disabled'}>↓</button><button class="small-icon category-edit-btn" title="Editar categoría" aria-label="Editar categoría" data-action="edit-asset-category" data-category="${escAttr(cat)}">✏️</button><button class="small-icon add-sub-btn" title="Agregar cuenta a ${escAttr(cat)}" aria-label="Agregar cuenta" data-action="add-asset-to-category" data-category="${escAttr(cat)}">＋</button></div></div><div class="category-items">${items.map((x,index)=>assetItemHTML(x,index,items.length,cat)).join('')}</div></section>`;
  }).join('')||'<div class="empty">Agrega una cuenta o inversión.</div>';
  const a=assetTotals();$('#copTotal').textContent=money(a.cop);$('#usdTotal').textContent=money(a.usd,'USD');
}
function assetItemHTML(x,index,total,category){const val=getMonthValue(x,currentMonth),prev=shiftMonth(currentMonth,-1),pv=getMonthValue(x,prev);const canUp=index>0,canDown=index<total-1;return `<div class="expense-item"><div class="row-top"><div class="row-title"><strong>${esc(x.name)}</strong><small>${x.currency} · Saldo anterior: ${x.currency==='USD'?money(pv,'USD'):money(pv)}</small></div><div class="row-actions"><button class="order-text-btn organize-only" title="Mover cuenta arriba" aria-label="Mover cuenta arriba" data-action="move-asset-subcategory-up" data-category="${escAttr(category)}" data-subcategory="${escAttr(x.name)}" ${canUp?'':'disabled'}>↑</button><button class="order-text-btn organize-only" title="Mover cuenta abajo" aria-label="Mover cuenta abajo" data-action="move-asset-subcategory-down" data-category="${escAttr(category)}" data-subcategory="${escAttr(x.name)}" ${canDown?'':'disabled'}>↓</button><button class="order-text-btn organize-only" title="Mover a otra categoría" aria-label="Mover a otra categoría" data-action="move-asset-subcategory-category" data-id="${escAttr(x.id)}">↗</button><button class="small-icon" title="Editar" onclick="editAsset('${x.id}')">✏️</button><button class="small-icon" title="Eliminar" onclick="deleteAsset('${x.id}')">🗑️</button></div></div><input class="value-input" inputmode="decimal" aria-label="Saldo ${esc(x.name)}" value="${val?formatNumber(val):''}" placeholder="${x.currency==='USD'?'US$ 0':'$ 0'}" onchange="updateAsset('${x.id}', this.value)"></div>`;}
function updateAsset(id_,raw){const x=state.assetItems.find(i=>i.id===id_);if(x){setMonthValue(x,currentMonth,numberValue(raw));save();render();toast('Saldo actualizado');}}
function editAsset(id_){const x=state.assetItems.find(i=>i.id===id_);if(!x)return;openForm('Editar cuenta / inversión',[{name:'Categoría',key:'category',type:'text',value:x.category},{name:'Nombre',key:'name',type:'text',value:x.name},{name:'Moneda',key:'currency',type:'select',value:x.currency,options:['COP','USD']}],val=>{const oldCategory=x.category,oldName=x.name;x.category=val.category.trim()||x.category;x.name=val.name.trim()||x.name;x.currency=val.currency;state.assetCategoryOrder ||= [];if(!state.assetCategoryOrder.includes(x.category))state.assetCategoryOrder.push(x.category);state.assetSubcategoryOrder ||= {};state.assetSubcategoryOrder[oldCategory] ||= [];state.assetSubcategoryOrder[oldCategory]=state.assetSubcategoryOrder[oldCategory].filter(n=>n!==oldName);state.assetSubcategoryOrder[x.category] ||= [];if(!state.assetSubcategoryOrder[x.category].includes(x.name))state.assetSubcategoryOrder[x.category].push(x.name);save();render();toast('Cuenta actualizada');});}
function editAssetCategory(category){openForm('Editar categoría',[{name:'Nombre de la categoría',key:'name',type:'text',value:category}],val=>{const newName=val.name.trim();if(!newName||newName===category)return;if(orderedAssetCategories().some(c=>c.toLowerCase()===newName.toLowerCase()&&c!==category)){alert('Ya existe una categoría con ese nombre.');return;}state.assetItems.forEach(x=>{if(x.category===category)x.category=newName;});state.assetCategoryOrder=(state.assetCategoryOrder||[]).map(c=>c===category?newName:c);state.assetSubcategoryOrder ||= {};if(state.assetSubcategoryOrder[category]){state.assetSubcategoryOrder[newName]=state.assetSubcategoryOrder[category];delete state.assetSubcategoryOrder[category];}save();render();toast('Categoría renombrada');});}
function deleteAsset(id_){if(!confirm('¿Eliminar esta cuenta/inversión y sus saldos?'))return;const x=state.assetItems.find(i=>i.id===id_);state.assetItems=state.assetItems.filter(i=>i.id!==id_);if(x){state.assetSubcategoryOrder ||= {};state.assetSubcategoryOrder[x.category]=(state.assetSubcategoryOrder[x.category]||[]).filter(n=>n!==x.name);}save();render();}
function openAddAsset(category=''){openForm('Nueva cuenta / inversión',[{name:'Categoría',key:'category',type:'text',value:category,placeholder:'Ej. FIDUCUENTA'},{name:'Nombre',key:'name',type:'text',placeholder:'Ej. Fiducia Banco X'},{name:'Moneda',key:'currency',type:'select',value:'COP',options:['COP','USD']}],val=>{const cat=val.category.trim()||'OTROS',name=val.name.trim()||'Nueva cuenta';state.assetItems.push({id:id('ast'),category:cat,name,currency:val.currency,monthly:{}});state.assetCategoryOrder ||= [];if(!state.assetCategoryOrder.includes(cat))state.assetCategoryOrder.push(cat);state.assetSubcategoryOrder ||= {};state.assetSubcategoryOrder[cat] ||= [];if(!state.assetSubcategoryOrder[cat].includes(name))state.assetSubcategoryOrder[cat].push(name);save();render();toast('Cuenta creada');});}

/* ---------- ANALÍTICA ANUAL ---------- */
function renderAnalytics(){
  if(!$('#analyticsYearLabel'))return;
  $('#analyticsYearLabel').textContent=analyticsYear;
  const wealth=monthlyWealthSeries(analyticsYear);
  const currentIndex=Math.min(11,Math.max(0,Number(currentMonth.slice(5,7))-1));
  const current=Number(currentMonth.slice(0,4))===analyticsYear ? wealth[currentIndex] : wealth[11];
  const expSeries=annualExpenseCategories(analyticsYear);
  const annualExpenseTotal=yearMonths(analyticsYear).reduce((sum,m)=>sum+state.expenseItems.reduce((s,x)=>s+getMonthValue(x,m),0),0);
  $('#chartWealthCurrent').textContent=money(current?.totalCopEquivalent||0);
  $('#wealthChart').innerHTML=lineChart(monthShort,wealth.map(x=>x.totalCopEquivalent),'Patrimonio total');
  renderWealthLegend(wealth);
  renderAssetSelector();
  const asset=state.assetItems.find(x=>x.id===selectedAssetChart);
  $('#assetChart').innerHTML=asset
    ? lineChart(monthShort,yearMonths(analyticsYear).map(m=>assetValueForChart(asset,m)*(asset.currency==='USD'?Number(state.settings.usdToCop||4000):1)),`${asset.name} en COP`)
    : '<div class="empty chart-note">Selecciona una cuenta para ver su evolución mensual.</div>';

  renderExpenseSelector(expSeries);
  const totalSeries={category:'Total gastos',values:yearMonths(analyticsYear).map(m=>state.expenseItems.reduce((s,x)=>s+getMonthValue(x,m),0))};
  const labelEl=$('#chartExpensesYearLabel');
  if(selectedExpenseCategory==='all'){
    $('#chartExpensesYear').textContent=money(annualExpenseTotal);
    labelEl.textContent='Total de gastos del año';
    $('#expenseChart').innerHTML=pieChart(expSeries);
  }else if(selectedExpenseCategory==='total'){
    $('#chartExpensesYear').textContent=money(annualExpenseTotal);
    labelEl.textContent='Total de gastos del año';
    $('#expenseChart').innerHTML=lineChart(monthShort,totalSeries.values,'Total gastos');
  }else{
    const selected=expSeries.find(s=>s.category===selectedExpenseCategory);
    const selectedTotal=selected ? selected.values.reduce((sum,v)=>sum+v,0) : annualExpenseTotal;
    $('#chartExpensesYear').textContent=money(selectedTotal);
    labelEl.textContent=selected ? `Gastos de ${selected.category} en el año` : 'Total de gastos del año';
    $('#expenseChart').innerHTML=selected
      ? lineChart(monthShort,selected.values,`Gastos de ${selected.category}`)
      : lineChart(monthShort,totalSeries.values,'Total gastos');
  }
  $('#expenseLegend').innerHTML=selectedExpenseCategory==='all'
    ? expSeries.map((s,i)=>{const total=s.values.reduce((sum,v)=>sum+v,0);const share=annualExpenseTotal?Math.round(total/annualExpenseTotal*100):0;return `<span><i style="background:${chartPalette[i%chartPalette.length]}"></i>${esc(s.category)} · ${money(total)} (${share}%)</span>`;}).join('')||'<span>Sin gastos registrados en este año.</span>'
    : `<span><i class="legend-dot"></i>${esc(selectedExpenseCategory==='total'?'Total gastos':selectedExpenseCategory)}</span>`;
}
function renderExpenseSelector(expSeries){
  const select=$('#analyticsExpenseCategorySelect');
  if(!select)return;
  const prev=selectedExpenseCategory;
  select.innerHTML=`<option value="all">Todas las categorías</option><option value="total">Total gastos</option>${expSeries.map(s=>`<option value="${escAttr(s.category)}">${esc(s.category)}</option>`).join('')}`;
  const valid=prev==='all'||prev==='total'||expSeries.some(s=>s.category===prev);
  selectedExpenseCategory=valid?prev:'all';
  select.value=selectedExpenseCategory;
}
function renderWealthLegend(wealth){
  const first=wealth.find(x=>x.totalCopEquivalent>0)?.totalCopEquivalent||0;
  const last=[...wealth].reverse().find(x=>x.totalCopEquivalent>0)?.totalCopEquivalent||0;
  const diff=last-first;const arrow=diff>0?'↗':diff<0?'↘':'→';
  $('#wealthLegend').innerHTML=`<span><i class="legend-dot"></i>Patrimonio total</span><span class="trend ${diff<0?'down':''}">${arrow} ${money(Math.abs(diff))} ${diff>=0?'de crecimiento':'de disminución'} en el año</span>`;
}
function renderAssetSelector(){
  const select=$('#assetChartSelect');if(!select)return;
  const prev=selectedAssetChart;
  select.innerHTML=`<option value="total">Patrimonio total</option>${state.assetItems.map(x=>`<option value="${escAttr(x.id)}">${esc(x.name)} · ${esc(x.currency)}</option>`).join('')}`;
  selectedAssetChart=state.assetItems.some(x=>x.id===prev)?prev:'total';select.value=selectedAssetChart;
}
function previousKnownAssetValue(asset, month){
  let m=month;
  for(let i=0;i<120;i++){
    if(hasOwnMonthValue(asset,m) && getMonthValue(asset,m)!==0) return getMonthValue(asset,m);
    m=shiftMonth(m,-1);
  }
  return 0;
}
function assetValueForChart(asset, month){
  // No arrastramos saldos desde diciembre de un año anterior al gráfico.
  // Dentro del mismo año, un saldo se mantiene hasta que se registre otro.
  const year=Number(month.slice(0,4));
  let m=month;
  for(let i=0;i<12;i++){
    if(Number(m.slice(0,4))!==year) break;
    if(hasOwnMonthValue(asset,m)) return getMonthValue(asset,m);
    m=shiftMonth(m,-1);
  }
  return 0;
}
function monthlyWealthSeries(year){return yearMonths(year).map(month=>assetTotalsFromCarry(month));}
function assetTotalsFromCarry(month){
  let cop=0,usd=0;state.assetItems.forEach(x=>{const v=assetValueForChart(x,month);if(x.currency==='USD')usd+=v;else cop+=v;});
  const rate=Number(state.settings.usdToCop||4000);return{cop,usd,totalCopEquivalent:cop+usd*rate};
}
function annualExpenseCategories(year){
  const cats=categories();
  const series=cats.map(category=>({category,values:yearMonths(year).map(m=>state.expenseItems.filter(x=>x.category===category).reduce((s,x)=>s+getMonthValue(x,m),0))}));
  const sorted=series.filter(s=>s.values.some(v=>v!==0)).sort((a,b)=>b.values.reduce((x,y)=>x+y,0)-a.values.reduce((x,y)=>x+y,0));
  if(sorted.length<=7)return sorted;
  const top=sorted.slice(0,6),rest=sorted.slice(6);
  const otherValues=yearMonths(year).map((_,i)=>rest.reduce((sum,s)=>sum+s.values[i],0));
  top.push({category:'Otros',values:otherValues});return top;
}
function chartGeometry(values,width=760,height=300){
  const pad={l:58,r:16,t:18,b:42};const w=width-pad.l-pad.r,h=height-pad.t-pad.b;
  const max=Math.max(...values,0);const min=Math.min(...values,0);const range=max-min||1;
  return{pad,w,h,max,min,range,x:i=>pad.l+(i/(values.length-1||1))*w,y:v=>pad.t+h-((v-min)/range)*h};
}
function fmtAxis(v){if(Math.abs(v)>=1000000)return `$${(v/1000000).toFixed(1)}M`;if(Math.abs(v)>=1000)return `$${Math.round(v/1000)}K`;return `$${Math.round(v)}`;}
function lineChart(labels,values,title){
  const W=760,H=300,g=chartGeometry(values,W,H);
  const points=values.map((v,i)=>`${g.x(i)},${g.y(v)}`).join(' ');
  const grid=[0,.25,.5,.75,1].map(t=>{const y=g.pad.t+g.h*(1-t);const val=g.min+g.range*t;return `<line x1="${g.pad.l}" y1="${y}" x2="${W-g.pad.r}" y2="${y}" class="chart-grid"/><text x="${g.pad.l-8}" y="${y+4}" text-anchor="end" class="chart-axis">${esc(fmtAxis(val))}</text>`;}).join('');
  const xlabels=labels.map((l,i)=>`<text x="${g.x(i)}" y="${H-14}" text-anchor="middle" class="chart-label">${l}</text>`).join('');
  const dots=values.map((v,i)=>`<circle cx="${g.x(i)}" cy="${g.y(v)}" r="10" class="chart-hit chart-hit-area" data-label="${escAttr(labels[i])}" data-value="${escAttr(money(v))}"><title>${esc(labels[i])}: ${esc(money(v))}</title></circle><circle cx="${g.x(i)}" cy="${g.y(v)}" r="5" class="chart-dot" pointer-events="none"/>`).join('');
  return `<div class="chart-svg-wrap"><div class="chart-tooltip" aria-hidden="true"></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}"><g>${grid}</g><polyline points="${points}" class="chart-line"/>${dots}${xlabels}</svg></div>`;
}
function pieChart(series){
  const rows=series.map(s=>({name:s.category,value:s.values.reduce((sum,v)=>sum+v,0)})).filter(x=>x.value>0);
  if(!rows.length)return '<div class="empty">Sin gastos registrados en este año.</div>';
  const total=rows.reduce((sum,x)=>sum+x.value,0);
  const W=760,H=340,cx=260,cy=170,r=118,inner=62;
  let angle=-Math.PI/2;
  const paths=[];
  rows.forEach((row,i)=>{
    const start=angle, end=angle+(row.value/total)*Math.PI*2;
    const large=end-start>Math.PI?1:0;
    const x1=cx+r*Math.cos(start),y1=cy+r*Math.sin(start);
    const x2=cx+r*Math.cos(end),y2=cy+r*Math.sin(end);
    const ix2=cx+inner*Math.cos(end),iy2=cy+inner*Math.sin(end);
    const ix1=cx+inner*Math.cos(start),iy1=cy+inner*Math.sin(start);
    const d=`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${inner} ${inner} 0 ${large} 0 ${ix1} ${iy1} Z`;
    const pct=Math.round(row.value/total*100);
    paths.push(`<path d="${d}" fill="${chartPalette[i%chartPalette.length]}" class="pie-slice chart-hit" data-label="${escAttr(row.name)}" data-value="${escAttr(money(row.value))} · ${pct}%"><title>${esc(row.name)}: ${esc(money(row.value))} (${pct}%)</title></path>`);
    angle=end;
  });
  const legend=rows.map((row,i)=>{const pct=Math.round(row.value/total*100);return `<div class="pie-legend-row"><span><i style="background:${chartPalette[i%chartPalette.length]}"></i><strong>${esc(row.name)}</strong></span><b>${money(row.value)}</b><small>${pct}%</small></div>`;}).join('');
  return `<div class="pie-chart-wrap"><div class="chart-svg-wrap pie-svg-wrap"><div class="chart-tooltip" aria-hidden="true"></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Distribución de gastos por categoría"><g>${paths.join('')}</g><text x="${cx}" y="${cy-2}" text-anchor="middle" class="pie-center-total">${esc(money(total))}</text><text x="${cx}" y="${cy+18}" text-anchor="middle" class="pie-center-label">Total año</text></svg></div><div class="pie-legend">${legend}</div></div>`;
}

function multiLineChart(labels,series){
  if(!series.length)return '<div class="empty">Sin gastos registrados en este año.</div>';
  const all=series.flatMap(s=>s.values);const W=760,H=330,g=chartGeometry(all,W,H);
  const grid=[0,.25,.5,.75,1].map(t=>{const y=g.pad.t+g.h*(1-t);const val=g.min+g.range*t;return `<line x1="${g.pad.l}" y1="${y}" x2="${W-g.pad.r}" y2="${y}" class="chart-grid"/><text x="${g.pad.l-8}" y="${y+4}" text-anchor="end" class="chart-axis">${esc(fmtAxis(val))}</text>`;}).join('');
  const lines=series.map((s,si)=>{const pts=s.values.map((v,i)=>`${g.x(i)},${g.y(v)}`).join(' ');const c=chartPalette[si%chartPalette.length];const dots=s.values.map((v,i)=>`<circle cx="${g.x(i)}" cy="${g.y(v)}" r="10" fill="transparent" class="chart-hit chart-hit-area" data-label="${escAttr(s.category+' · '+labels[i])}" data-value="${escAttr(money(v))}"><title>${esc(s.category)} · ${esc(labels[i])}: ${esc(money(v))}</title></circle><circle cx="${g.x(i)}" cy="${g.y(v)}" r="4" fill="${c}" pointer-events="none"/>`).join('');return `<polyline points="${pts}" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${dots}`;}).join('');
  const xlabels=labels.map((l,i)=>`<text x="${g.x(i)}" y="${H-14}" text-anchor="middle" class="chart-label">${l}</text>`).join('');
  return `<div class="chart-svg-wrap"><div class="chart-tooltip" aria-hidden="true"></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gastos por categoría"><g>${grid}</g>${lines}${xlabels}</svg></div>`;
}

function handleChartPointer(e){
  const dot=e.target.closest?.('.chart-hit');if(!dot)return;
  const wrap=dot.closest('.chart-svg-wrap');const tip=wrap?.querySelector('.chart-tooltip');if(!tip)return;
  tip.textContent=`${dot.dataset.label}: ${dot.dataset.value}`;tip.classList.add('show');positionChartTooltip(e,tip,wrap);
}
function handleChartPointerMove(e){
  const dot=e.target.closest?.('.chart-hit');if(!dot)return;
  const wrap=dot.closest('.chart-svg-wrap');const tip=wrap?.querySelector('.chart-tooltip');if(tip?.classList.contains('show'))positionChartTooltip(e,tip,wrap);
}
function positionChartTooltip(e,tip,wrap){
  const r=wrap.getBoundingClientRect();
  let left=e.clientX-r.left+10,top=e.clientY-r.top-42;
  left=Math.max(6,Math.min(left,r.width-tip.offsetWidth-6));top=Math.max(6,top);
  tip.style.left=`${left}px`;tip.style.top=`${top}px`;
}
function handleChartPointerOut(e){
  const from=e.target.closest?.('.chart-hit');if(!from)return;
  if(from.dataset.pinned==='1')return;
  const to=e.relatedTarget?.closest?.('.chart-hit');if(to===from)return;
  const wrap=from.closest('.chart-svg-wrap');wrap?.querySelector('.chart-tooltip')?.classList.remove('show');
}
function handleChartClick(e){
  const dot=e.target.closest?.('.chart-hit');
  if(dot){
    e.stopPropagation();
    const wrap=dot.closest('.chart-svg-wrap');const tip=wrap?.querySelector('.chart-tooltip');if(!tip)return;
    wrap?.querySelectorAll('.chart-hit[data-pinned="1"]').forEach(d=>{d.dataset.pinned='0';});
    dot.dataset.pinned='1';
    tip.textContent=`${dot.dataset.label}: ${dot.dataset.value}`;tip.classList.add('show');positionChartTooltip(e,tip,wrap);
    return;
  }
  document.querySelectorAll('.chart-hit[data-pinned="1"]').forEach(d=>{d.dataset.pinned='0';});
  document.querySelectorAll('.chart-tooltip.show').forEach(t=>t.classList.remove('show'));
}

function openForm(title,fields,onSubmit){
  const formId='dynamicForm';$('#modal').innerHTML=`<h3>${esc(title)}</h3><form id="${formId}">${fields.map(f=>`<div class="form-field"><label>${esc(f.name)}</label>${f.type==='select'?`<select class="select" name="${f.key}">${f.options.map(o=>`<option ${o===f.value?'selected':''}>${esc(o)}</option>`).join('')}</select>`:`<input class="input ${f.type==='number'?'number-format':''}" name="${f.key}" type="${f.type||'text'}" value="${escAttr(f.type==='number' && f.value ? formatNumber(f.value) : (f.value||''))}" placeholder="${escAttr(f.placeholder||'')}" required>`}</div>`).join('')}<div class="form-actions"><button type="button" class="secondary-btn" onclick="closeModal()">Cancelar</button><button class="primary-btn" type="submit">Guardar</button></div></form>`;
  $('#modalBackdrop').classList.remove('hidden');$('#'+formId).onsubmit=e=>{e.preventDefault();const val=Object.fromEntries(new FormData(e.target).entries());onSubmit(val);closeModal();};setTimeout(()=>$('#'+formId)?.querySelector('input,select')?.focus(),50);
}
function openSettings(){
  $('#modal').innerHTML=`<h3>Datos y configuración</h3><div class="settings-list"><button onclick="exportJSON()">💾 Exportar datos a JSON</button><button onclick="document.getElementById('importFile').click()">📥 Importar JSON en este dispositivo</button><button onclick="resetLocal()" class="danger">♻️ Restaurar datos iniciales</button></div><p class="helper">Tus cambios se guardan solamente en este dispositivo mediante localStorage. Exporta un JSON si quieres llevar tus datos a otro celular, PC o tableta.</p><div class="form-field" style="margin-top:14px"><label>Tasa de referencia USD → COP</label><input id="usdRate" class="input number-format" inputmode="numeric" value="${formatNumber(state.settings.usdToCop||4000)}"></div><div class="form-actions"><button class="secondary-btn" onclick="closeModal()">Cerrar</button><button class="primary-btn" onclick="saveRate()">Guardar tasa</button></div><input id="importFile" type="file" accept="application/json,.json" style="display:none">`;
  $('#modalBackdrop').classList.remove('hidden');$('#importFile').onchange=e=>{const file=e.target.files[0];if(file)importJSON(file);};
}
function saveRate(){state.settings.usdToCop=numberValue($('#usdRate').value)||4000;save();closeModal();render();toast('Tasa guardada');}
function exportJSON(){const payload=JSON.stringify(state,null,2);const blob=new Blob([payload],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`mi-presupuesto-${currentMonth}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);toast('JSON exportado');}
function importJSON(file){const reader=new FileReader();reader.onload=()=>{try{state=normalize(JSON.parse(reader.result));currentMonth=state.currentMonth||currentMonth;analyticsYear=Number(currentMonth.slice(0,4));autoCarryJanuarySavings();save();closeModal();render();toast('Datos importados correctamente');}catch{alert('El archivo no parece ser un JSON válido de Mi Presupuesto.');}};reader.readAsText(file);}
async function resetLocal(){if(!confirm('Esto borrará los datos guardados en este dispositivo y volverá a los datos iniciales. ¿Continuar?'))return;localStorage.removeItem(STORAGE_KEY);const res=await fetch(`${DATA_URL}?reset=${Date.now()}`);state=normalize(await res.json());currentMonth=state.currentMonth;analyticsYear=Number(currentMonth.slice(0,4));save();closeModal();render();toast('Datos restaurados');}
function closeModal(){$('#modalBackdrop').classList.add('hidden');}
function toast(text){const old=document.querySelector('.toast');if(old)old.remove();const t=document.createElement('div');t.className='toast';t.textContent=text;document.body.appendChild(t);setTimeout(()=>t.remove(),2200);}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function escAttr(s){return esc(s).replace(/`/g,'&#96;');}
function registerSW(){if('serviceWorker' in navigator && location.protocol!=='file:')navigator.serviceWorker.register('sw.js').catch(()=>{});}

window.updateIncome=updateIncome;window.editIncome=editIncome;window.deleteIncome=deleteIncome;
window.updateExpense=updateExpense;window.editExpense=editExpense;window.editCategory=editCategory;window.deleteExpense=deleteExpense;window.openAddExpense=openAddExpense;
window.updateAsset=updateAsset;window.editAsset=editAsset;window.deleteAsset=deleteAsset;
window.closeModal=closeModal;window.exportJSON=exportJSON;window.importJSON=importJSON;window.resetLocal=resetLocal;window.saveRate=saveRate;
window.copyPreviousSavings=copyPreviousSavings;window.toggleExpenseOrganize=toggleExpenseOrganize;

boot();
