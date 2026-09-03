const STORAGE_KEY = 'miPresupuesto.v2';
const DATA_URL = 'data.json';

const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
let state = null;
let activeView = 'home';
let currentMonth = '2026-09';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
function id(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`; }
function monthLabel(key) { const [y,m] = key.split('-').map(Number); return `${monthNames[m-1]} ${y}`; }
function shiftMonth(key, delta) { const [y,m] = key.split('-').map(Number); const d = new Date(y, m-1 + delta, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function money(value, currency='COP') { const n = Number(value || 0); return new Intl.NumberFormat('es-CO',{style:'currency',currency,maximumFractionDigits:0}).format(n); }
function numberValue(value) { return Number(String(value ?? '').replace(/[^0-9.-]/g,'')) || 0; }
function ensureMonthly(item) { if (!item.monthly) item.monthly = {}; }
function getMonthValue(item, month) { ensureMonthly(item); return Number(item.monthly[month] || 0); }
function setMonthValue(item, month, value) { ensureMonthly(item); item.monthly[month] = Number(value) || 0; }
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

function normalize(data) {
  data.incomeItems ||= [];
  data.expenseItems ||= [];
  data.assetItems ||= [];
  data.settings ||= { usdToCop: 4000 };
  for (const x of [...data.incomeItems,...data.expenseItems,...data.assetItems]) {
    ensureMonthly(x);
    if (x.category === '[object PointerEvent]' || x.category === '[object Event]') x.category = 'Otros';
    if (x.subcategory === '[object PointerEvent]' || x.subcategory === '[object Event]') x.subcategory = 'Nuevo gasto';
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
  if (saved) { try { state=normalize(JSON.parse(saved)); currentMonth=state.currentMonth||currentMonth; save(); } catch { state=null; } }
  if (!state) { const res=await fetch(DATA_URL); state=normalize(await res.json()); currentMonth=state.currentMonth||currentMonth; save(); }
  bindEvents(); render(); registerSW();
}

function bindEvents() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'edit-category') editCategory(btn.dataset.category);
    if (action === 'add-subcategory') openAddExpense(btn.dataset.category);
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
  $('#settingsBtn').onclick=openSettings;
  $('#modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeModal();});
}
function showView(view){activeView=view;$$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${view}`));$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));render();window.scrollTo({top:0,behavior:'smooth'});}
function changeMonth(delta){currentMonth=shiftMonth(currentMonth,delta);state.currentMonth=currentMonth;save();render();}
function totals(month=currentMonth){const income=state.incomeItems.reduce((s,x)=>s+getMonthValue(x,month),0);const expenses=state.expenseItems.reduce((s,x)=>s+getMonthValue(x,month),0);return{income,expenses,extra:income-expenses};}
function annualTotal(item){return Object.values(item.monthly||{}).reduce((s,v)=>s+Number(v||0),0);}
function categoryTotals(month=currentMonth){const map={};state.expenseItems.forEach(x=>{const v=getMonthValue(x,month);if(v)map[x.category]=(map[x.category]||0)+v;});return Object.entries(map).sort((a,b)=>b[1]-a[1]);}
function assetTotals(month=currentMonth){let cop=0,usd=0;state.assetItems.forEach(x=>{const v=getMonthValue(x,month);if(x.currency==='USD')usd+=v;else cop+=v;});const rate=Number(state.settings.usdToCop||4000);return{cop,usd,totalCopEquivalent:cop+usd*rate};}
function categories(){return [...new Set(state.expenseItems.map(x=>x.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));}
function subcategories(category){return state.expenseItems.filter(x=>x.category===category).map(x=>x.subcategory).filter(Boolean).sort((a,b)=>a.localeCompare(b,'es'));}

function render(){renderMonthLabels();renderHome();renderIncome();renderExpenses();renderAssets();}
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
  const wrap=$('#incomeRows');wrap.innerHTML=state.incomeItems.map(x=>{const val=getMonthValue(x,currentMonth);return `<div class="data-row"><div class="row-top"><div class="row-title"><strong>${esc(x.name)}</strong><small>Año: ${money(annualTotal(x))}</small></div><div class="row-actions"><button class="small-icon" title="Editar" onclick="editIncome('${x.id}')">✏️</button><button class="small-icon" title="Eliminar" onclick="deleteIncome('${x.id}')">🗑️</button></div></div><input class="value-input" inputmode="numeric" aria-label="${esc(x.name)}" value="${val||''}" placeholder="$ 0" onchange="updateIncome('${x.id}', this.value)"></div>`;}).join('')||'<div class="empty">Agrega tu primer ingreso.</div>';
  $('#incomeViewTotal').textContent=money(totals().income);
}
function updateIncome(id_,raw){const x=state.incomeItems.find(i=>i.id===id_);if(x){setMonthValue(x,currentMonth,numberValue(raw));save();render();toast('Ingreso actualizado');}}
function editIncome(id_){const x=state.incomeItems.find(i=>i.id===id_);if(!x)return;openForm('Editar ingreso',[{name:'Nombre',key:'name',type:'text',value:x.name}],val=>{x.name=val.name.trim()||x.name;save();render();toast('Ingreso actualizado');});}
function deleteIncome(id_){if(!confirm('¿Eliminar este ingreso y sus valores?'))return;state.incomeItems=state.incomeItems.filter(x=>x.id!==id_);save();render();}
function openAddIncome(){openForm('Nuevo ingreso',[{name:'Nombre',key:'name',type:'text',placeholder:'Ej. Salario AEI'}],val=>{state.incomeItems.push({id:id('inc'),name:val.name.trim()||'Nuevo ingreso',monthly:{}});save();render();toast('Ingreso creado');});}

function renderExpenses(){
  const wrap=$('#expenseRows');const cats=categories();
  wrap.innerHTML=cats.map(cat=>{
    const items=state.expenseItems.filter(x=>x.category===cat);const catTotal=items.reduce((s,x)=>s+getMonthValue(x,currentMonth),0);
    return `<section class="expense-category-card"><div class="category-header"><div class="category-heading-info"><div class="category-title">${esc(cat)}</div><div class="category-total">${money(catTotal)}</div></div><div class="category-header-actions"><button class="small-icon category-edit-btn" title="Editar nombre de categoría" aria-label="Editar nombre de categoría" data-action="edit-category" data-category="${escAttr(cat)}">✏️</button><button class="small-icon add-sub-btn" title="Agregar subcategoría a ${escAttr(cat)}" aria-label="Agregar subcategoría" data-action="add-subcategory" data-category="${escAttr(cat)}">＋</button></div></div><div class="category-items">${items.map(x=>expenseItemHTML(x)).join('')}</div></section>`;
  }).join('')||'<div class="empty">Agrega tu primer gasto.</div>';
  $('#expensesViewTotal').textContent=money(totals().expenses);
}
function expenseItemHTML(x){const val=getMonthValue(x,currentMonth);return `<div class="expense-item"><div class="row-top"><div class="row-title"><strong>${esc(x.subcategory)}</strong><small>Año: ${money(annualTotal(x))}</small></div><div class="row-actions"><button class="small-icon" title="Editar nombre de subcategoría" aria-label="Editar nombre de subcategoría" data-action="edit-expense" data-id="${escAttr(x.id)}">✏️</button><button class="small-icon" title="Eliminar" aria-label="Eliminar gasto" data-action="delete-expense" data-id="${escAttr(x.id)}">🗑️</button></div></div><input class="value-input" inputmode="numeric" aria-label="${esc(x.subcategory)}" value="${val||''}" placeholder="$ 0" onchange="updateExpense('${x.id}', this.value)"></div>`;}
function updateExpense(id_,raw){const x=state.expenseItems.find(i=>i.id===id_);if(x){setMonthValue(x,currentMonth,numberValue(raw));save();render();toast('Gasto actualizado');}}
function editCategory(category){
  openForm('Editar categoría',[{name:'Nombre de la categoría',key:'name',type:'text',value:category}],val=>{
    const newName=val.name.trim();
    if(!newName){alert('Escribe un nombre para la categoría.');return;}
    if(newName===category){closeModal();return;}
    const exists=categories().some(c=>c.toLowerCase()===newName.toLowerCase() && c!==category);
    if(exists){alert('Ya existe una categoría con ese nombre.');return;}
    state.expenseItems.forEach(x=>{if(x.category===category)x.category=newName;});
    save();render();toast('Categoría renombrada');
  });
}
function editExpense(id_){
  const x=state.expenseItems.find(i=>i.id===id_);if(!x)return;
  openSubcategoryForm('Editar subcategoría',x.category,x.subcategory,(subcategory)=>{
    const newName=subcategory.trim();
    if(!newName){alert('Escribe un nombre para la subcategoría.');return false;}
    const duplicate=state.expenseItems.some(i=>i.id!==x.id && i.category===x.category && i.subcategory.toLowerCase()===newName.toLowerCase());
    if(duplicate){alert('Ya existe esa subcategoría dentro de la categoría.');return false;}
    x.subcategory=newName;save();render();toast('Subcategoría renombrada');return true;
  });
}
function deleteExpense(id_){if(!confirm('¿Eliminar este gasto y sus valores?'))return;state.expenseItems=state.expenseItems.filter(x=>x.id!==id_);save();render();}
function openAddExpense(category=''){
  if(category){
    openSubcategoryForm('Nueva subcategoría',category,'',(subcategory)=>{
      const newName=subcategory.trim();
      if(!newName){alert('Escribe un nombre para la subcategoría.');return false;}
      const duplicate=state.expenseItems.some(i=>i.category===category && i.subcategory.toLowerCase()===newName.toLowerCase());
      if(duplicate){alert('Ya existe esa subcategoría dentro de la categoría.');return false;}
      state.expenseItems.push({id:id('exp'),category,subcategory:newName,monthly:{}});save();render();toast('Subcategoría creada');return true;
    });
    return;
  }
  openExpenseForm('Nuevo gasto','','',(cat,sub)=>{state.expenseItems.push({id:id('exp'),category:cat,subcategory:sub,monthly:{}});save();render();toast('Gasto creado');});
}
function openSubcategoryForm(title,category,initialSubcategory,onSubmit){
  $('#modal').innerHTML=`<h3>${esc(title)}</h3>
    <form id="subcategoryForm">
      <div class="form-field"><label>Categoría</label><div class="category-form-display">${esc(category)}</div></div>
      <div class="form-field"><label>${title==='Nueva subcategoría'?'Nombre de la subcategoría':'Nombre de la subcategoría'}</label><input class="input" id="subcategoryNameInput" name="subcategory" value="${escAttr(initialSubcategory)}" placeholder="Ej. Restaurantes" autocomplete="off"></div>
      <p class="helper">${title==='Nueva subcategoría'?'Esta subcategoría quedará dentro de la categoría seleccionada.':'Aquí solo cambias el nombre de la subcategoría. La categoría no se modifica.'}</p>
      <div class="form-actions"><button type="button" class="secondary-btn" onclick="closeModal()">Cancelar</button><button class="primary-btn" type="submit">${title==='Nueva subcategoría'?'Crear subcategoría':'Guardar cambios'}</button></div>
    </form>`;
  $('#modalBackdrop').classList.remove('hidden');
  $('#subcategoryForm').onsubmit=e=>{
    e.preventDefault();
    const ok=onSubmit($('#subcategoryNameInput').value);
    if(ok!==false)closeModal();
  };
  setTimeout(()=>$('#subcategoryNameInput').focus(),50);
}

function openExpenseForm(title, initialCategory='', initialSubcategory='', onSubmit){
  const cats=categories();
  const safeInitialCat=cats.includes(initialCategory)?initialCategory:(initialCategory||'');
  const subOpts=safeInitialCat?subcategories(safeInitialCat):[];
  $('#modal').innerHTML=`<h3>${esc(title)}</h3>
    <form id="expenseForm">
      <div class="form-field"><label>Categoría</label><select class="select" id="expenseCategorySelect" name="category"><option value="">Selecciona una categoría...</option>${cats.map(c=>`<option value="${escAttr(c)}" ${c===safeInitialCat?'selected':''}>${esc(c)}</option>`).join('')}<option value="__new__">＋ Crear nueva categoría</option></select></div>
      <div class="form-field hidden" id="newCategoryField"><label>Nueva categoría</label><input class="input" id="newCategoryInput" placeholder="Ej. Ocio"></div>
      <div class="form-field"><label>Subcategoría</label><select class="select" id="expenseSubcategorySelect" name="subcategory"><option value="">${safeInitialCat?'Selecciona una subcategoría...':'Primero selecciona una categoría...'}</option>${subOpts.map(s=>`<option value="${escAttr(s)}" ${s===initialSubcategory?'selected':''}>${esc(s)}</option>`).join('')}<option value="__new__">＋ Crear nueva subcategoría</option></select></div>
      <div class="form-field hidden" id="newSubcategoryField"><label>Nueva subcategoría</label><input class="input" id="newSubcategoryInput" placeholder="Ej. Restaurantes"></div>
      <div class="form-actions"><button type="button" class="secondary-btn" onclick="closeModal()">Cancelar</button><button class="primary-btn" type="submit">Guardar</button></div>
    </form>`;
  $('#modalBackdrop').classList.remove('hidden');
  const catSel=$('#expenseCategorySelect'),subSel=$('#expenseSubcategorySelect');
  catSel.onchange=()=>{
    const val=catSel.value;$('#newCategoryField').classList.toggle('hidden',val!=='__new__');
    const actual=val==='__new__'?'':val;const opts=actual?subcategories(actual):[];
    subSel.innerHTML=`<option value="">${actual?'Selecciona una subcategoría...':'Primero selecciona una categoría...'}</option>${opts.map(s=>`<option value="${escAttr(s)}">${esc(s)}</option>`).join('')}<option value="__new__">＋ Crear nueva subcategoría</option>`;
    $('#newSubcategoryField').classList.add('hidden');
    if(val==='__new__')setTimeout(()=>$('#newCategoryInput').focus(),30);
  };
  subSel.onchange=()=>{$('#newSubcategoryField').classList.toggle('hidden',subSel.value!=='__new__');if(subSel.value==='__new__')setTimeout(()=>$('#newSubcategoryInput').focus(),30);};
  $('#expenseForm').onsubmit=e=>{e.preventDefault();let category=catSel.value;let sub=subSel.value;if(category==='__new__')category=$('#newCategoryInput').value.trim();if(sub==='__new__')sub=$('#newSubcategoryInput').value.trim();if(!category){alert('Selecciona o crea una categoría.');return;}if(!sub){alert('Selecciona o crea una subcategoría.');return;}onSubmit(category,sub);closeModal();};
  setTimeout(()=>catSel.focus(),50);
}

function copyPreviousExpenses(){
  const prev=shiftMonth(currentMonth,-1);
  const previousHasValues=state.expenseItems.some(x=>getMonthValue(x,prev)!==0);
  if(!previousHasValues){toast(`No hay gastos registrados en ${monthLabel(prev)}`);return;}
  const overwrite=currentMonthHasExpenses();
  const message=overwrite?`Ya hay gastos en ${monthLabel(currentMonth)}. ¿Quieres reemplazar sus valores con los de ${monthLabel(prev)}?`:`¿Copiar los gastos de ${monthLabel(prev)} a ${monthLabel(currentMonth)}?`;
  if(!confirm(message))return;
  state.expenseItems.forEach(x=>setMonthValue(x,currentMonth,getMonthValue(x,prev)));
  save();render();toast(`Gastos copiados de ${monthLabel(prev)}`);
}
function currentMonthHasExpenses(){return state.expenseItems.some(x=>getMonthValue(x,currentMonth)!==0);}
function copyPreviousMonth(){
  const prev=shiftMonth(currentMonth,-1);
  const has=state.incomeItems.some(x=>getMonthValue(x,prev)!==0);
  if(!has){toast(`No hay ingresos registrados en ${monthLabel(prev)}`);return;}
  if(!confirm(`¿Copiar los ingresos de ${monthLabel(prev)} a ${monthLabel(currentMonth)}?`))return;
  state.incomeItems.forEach(x=>setMonthValue(x,currentMonth,getMonthValue(x,prev)));
  save();render();toast(`Ingresos copiados de ${monthLabel(prev)}`);
}

function renderAssets(){
  const wrap=$('#assetRows'),cats=[...new Set(state.assetItems.map(x=>x.category))];
  wrap.innerHTML=cats.map(cat=>{const items=state.assetItems.filter(x=>x.category===cat);return `<section class="asset-category-card"><div class="category-header"><div class="category-title">${esc(cat)}</div></div><div class="category-items">${items.map(assetItemHTML).join('')}</div></section>`;}).join('')||'<div class="empty">Agrega una cuenta o inversión.</div>';
  const a=assetTotals();$('#copTotal').textContent=money(a.cop);$('#usdTotal').textContent=money(a.usd,'USD');
}
function assetItemHTML(x){const val=getMonthValue(x,currentMonth),prev=shiftMonth(currentMonth,-1),pv=getMonthValue(x,prev);return `<div class="expense-item"><div class="row-top"><div class="row-title"><strong>${esc(x.name)}</strong><small>${x.currency} · Saldo anterior: ${x.currency==='USD'?money(pv,'USD'):money(pv)}</small></div><div class="row-actions"><button class="small-icon" title="Editar" onclick="editAsset('${x.id}')">✏️</button><button class="small-icon" title="Eliminar" onclick="deleteAsset('${x.id}')">🗑️</button></div></div><input class="value-input" inputmode="decimal" aria-label="Saldo ${esc(x.name)}" value="${val||''}" placeholder="${x.currency==='USD'?'US$ 0':'$ 0'}" onchange="updateAsset('${x.id}', this.value)"></div>`;}
function updateAsset(id_,raw){const x=state.assetItems.find(i=>i.id===id_);if(x){setMonthValue(x,currentMonth,numberValue(raw));save();render();toast('Saldo actualizado');}}
function editAsset(id_){const x=state.assetItems.find(i=>i.id===id_);if(!x)return;openForm('Editar cuenta / inversión',[{name:'Categoría',key:'category',type:'text',value:x.category},{name:'Nombre',key:'name',type:'text',value:x.name},{name:'Moneda',key:'currency',type:'select',value:x.currency,options:['COP','USD']}],val=>{x.category=val.category.trim()||x.category;x.name=val.name.trim()||x.name;x.currency=val.currency;save();render();toast('Cuenta actualizada');});}
function deleteAsset(id_){if(!confirm('¿Eliminar esta cuenta/inversión y sus saldos?'))return;state.assetItems=state.assetItems.filter(x=>x.id!==id_);save();render();}
function openAddAsset(){openForm('Nueva cuenta / inversión',[{name:'Categoría',key:'category',type:'text',placeholder:'Ej. FIDUCUENTA'},{name:'Nombre',key:'name',type:'text',placeholder:'Ej. Fiducia Banco X'},{name:'Moneda',key:'currency',type:'select',value:'COP',options:['COP','USD']}],val=>{state.assetItems.push({id:id('ast'),category:val.category.trim()||'OTROS',name:val.name.trim()||'Nueva cuenta',currency:val.currency,monthly:{}});save();render();toast('Cuenta creada');});}

function openForm(title,fields,onSubmit){
  const formId='dynamicForm';
  $('#modal').innerHTML=`<h3>${esc(title)}</h3><form id="${formId}">${fields.map(f=>`<div class="form-field"><label>${esc(f.name)}</label>${f.type==='select'?`<select class="select" name="${f.key}">${f.options.map(o=>`<option ${o===f.value?'selected':''}>${esc(o)}</option>`).join('')}</select>`:`<input class="input" name="${f.key}" type="${f.type||'text'}" value="${escAttr(f.value||'')}" placeholder="${escAttr(f.placeholder||'')}" required>`}</div>`).join('')}<div class="form-actions"><button type="button" class="secondary-btn" onclick="closeModal()">Cancelar</button><button class="primary-btn" type="submit">Guardar</button></div></form>`;
  $('#modalBackdrop').classList.remove('hidden');$('#'+formId).onsubmit=e=>{e.preventDefault();const val=Object.fromEntries(new FormData(e.target).entries());onSubmit(val);closeModal();};setTimeout(()=>$('#'+formId)?.querySelector('input,select')?.focus(),50);
}
function openSettings(){
  $('#modal').innerHTML=`<h3>Datos y configuración</h3><div class="settings-list"><button onclick="exportJSON()">💾 Exportar datos a JSON</button><button onclick="document.getElementById('importFile').click()">📥 Importar JSON en este dispositivo</button><button onclick="resetLocal()" class="danger">♻️ Restaurar datos iniciales</button></div><p class="helper">Tus cambios se guardan solamente en este dispositivo mediante localStorage. Exporta un JSON si quieres llevar tus datos a otro celular, PC o tableta.</p><div class="form-field" style="margin-top:14px"><label>Tasa de referencia USD → COP</label><input id="usdRate" class="input" inputmode="numeric" value="${Number(state.settings.usdToCop||4000)}"></div><div class="form-actions"><button class="secondary-btn" onclick="closeModal()">Cerrar</button><button class="primary-btn" onclick="saveRate()">Guardar tasa</button></div><input id="importFile" type="file" accept="application/json,.json" style="display:none">`;
  $('#modalBackdrop').classList.remove('hidden');$('#importFile').onchange=e=>{const file=e.target.files[0];if(file)importJSON(file);};
}
function saveRate(){state.settings.usdToCop=numberValue($('#usdRate').value)||4000;save();closeModal();render();toast('Tasa guardada');}
function exportJSON(){const payload=JSON.stringify(state,null,2);const blob=new Blob([payload],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`mi-presupuesto-${currentMonth}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);toast('JSON exportado');}
function importJSON(file){const reader=new FileReader();reader.onload=()=>{try{state=normalize(JSON.parse(reader.result));currentMonth=state.currentMonth||currentMonth;save();closeModal();render();toast('Datos importados correctamente');}catch{alert('El archivo no parece ser un JSON válido de Mi Presupuesto.');}};reader.readAsText(file);}
async function resetLocal(){if(!confirm('Esto borrará los datos guardados en este dispositivo y volverá a los datos iniciales. ¿Continuar?'))return;localStorage.removeItem(STORAGE_KEY);const res=await fetch(`${DATA_URL}?reset=${Date.now()}`);state=normalize(await res.json());currentMonth=state.currentMonth;save();closeModal();render();toast('Datos restaurados');}
function closeModal(){$('#modalBackdrop').classList.add('hidden');}
function toast(text){const old=document.querySelector('.toast');if(old)old.remove();const t=document.createElement('div');t.className='toast';t.textContent=text;document.body.appendChild(t);setTimeout(()=>t.remove(),1800);}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function escAttr(s){return esc(s).replace(/`/g,'&#96;');}
function registerSW(){if('serviceWorker' in navigator && location.protocol!=='file:')navigator.serviceWorker.register('sw.js').catch(()=>{});}

window.updateIncome=updateIncome;window.editIncome=editIncome;window.deleteIncome=deleteIncome;
window.updateExpense=updateExpense;window.editExpense=editExpense;window.editCategory=editCategory;window.deleteExpense=deleteExpense;window.openAddExpense=openAddExpense;
window.updateAsset=updateAsset;window.editAsset=editAsset;window.deleteAsset=deleteAsset;
window.closeModal=closeModal;window.exportJSON=exportJSON;window.importJSON=importJSON;window.resetLocal=resetLocal;window.saveRate=saveRate;

boot();
