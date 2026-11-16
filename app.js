import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { supabaseKey } from './config.js';

const db = supabaseKey && createClient('https://filakxlgdewfurlcqptk.supabase.co', supabaseKey, {
  auth: { storageKey: 'infinit-ep-auth' }
});
const $ = id => document.getElementById(id);
const day = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
const emptyState = () => ({
  equipo: [{id: 'cesar', name: 'César', active: true}, {id: 'salma', name: 'Salma', active: true}],
  socios: [], sesiones: [], ausencias: [], ajustes: []
});
const titles = {
  resumen: 'Resumen mensual', socios: 'Socios y paquetes',
  ausencias: 'Vacaciones y ausencias', equipo: 'Opciones'
};
const actions = {
  resumen: 'Asignar socio', socios: 'Asignar socio',
  ausencias: 'Registrar ausencia', equipo: 'Añadir entrenador'
};
let page = 'resumen';
let state;
let revision;
let user;
let editor;
let saving = false;
$('month').value = day().slice(0, 7);

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
const fmt = new Intl.NumberFormat('es-ES', {maximumFractionDigits: 2});
const euro = new Intl.NumberFormat('es-ES', {style:'currency',currency:'EUR'});
const money = cents => euro.format(cents / 100);
const hours = minutes => fmt.format(minutes / 60) + ' h';
const date = iso => iso ? iso.split('-').reverse().join('/') : '—';
const nameOf = id => state.equipo.find(t => t.id === id)?.name ?? '—';
const member = id => state.socios.find(m => m.id === id);
const packages = ['Duo 1H','Duo 2H','One 1H','One 2H'];
const rateKeys = ['duo1','duo2','one1','one2'];
const packageName = m => m.mode + (m.minutes === 480 ? ' 2H' : ' 1H');
const discounts = ['0','25','50','75','100'];
const adjusted = (m, a) => a?.discount != null ? m.minutes * (100 - a.discount) / 100 : (a?.minutes ?? m.minutes);
const mode = value => '<span class="badge '+ value.split(' ')[0].toLowerCase() +'">'+ esc(value) +'</span>';
const activeAt = (m, d) => m.start <= d && (!m.end || m.end >= d);
const action = (key, kind, id, label) => '<button data-act="'+key+'" data-kind="'+kind+'" data-id="'+esc(id)+'">'+label+'</button>';
const metric = (label, value) => '<div class="metric">'+label+'<strong>'+value+'</strong></div>';
const total = rows => rows.reduce((sum, s) => sum + s.minutes, 0);

function notify(message = '') {
  $('notice').textContent = message;
  $('notice').hidden = !message;
}

function table(title, columns, rows, empty) {
  return '<section class="panel"><div class="sectionHead"><h2>'+title+'</h2></div>'+
    (rows.length ? '<div class="scroll"><table><thead><tr>'+columns.map(c => '<th scope="col">'+c+'</th>').join('')+
      '</tr></thead><tbody>'+rows.map(r => '<tr>'+r.map(c => '<td>'+c+'</td>').join('')+'</tr>').join('')+
      '</tbody></table></div>' : '<p class="empty">'+empty+'</p>')+'</section>';
}

function monthData() {
  const month = $('month').value || day().slice(0, 7);
  const start = month + '-01';
  const [year, number] = month.split('-').map(Number);
  const end = month + '-' + new Date(Date.UTC(year, number, 0)).getUTCDate();
  const selected = $('trainer').value;
  const matches = r => r.trainer === selected;
  return {
    start, end, month, matches,
    absences: state.ausencias.filter(a => matches(a) && a.start <= end && a.end >= start)
  };
}

function ratesFor(month) {
  return state.tarifas?.filter(r => r.month <= month).sort((a,b) => b.month.localeCompare(a.month))[0]?.rates;
}

function monthlyRows(start,end,month,matches) {
  const rates = ratesFor(month);
  return state.socios.filter(m => matches(m) && m.start <= end && (!m.end || m.end >= start))
    .sort((a,b) => nameOf(a.trainer).localeCompare(nameOf(b.trainer),'es') || a.name.localeCompare(b.name,'es'))
    .map(m => {
      const adjustment = state.ajustes.find(a => a.member === m.id && a.month === month);
      const count = adjusted(m, adjustment) / 60;
      const unitRate = rates ? rates[rateKeys[packages.indexOf(packageName(m))]] / (m.minutes / 60) : null;
      return {m, adjustment, count, unitRate, pay:unitRate == null ? null : Math.round(count * unitRate)};
    });
}

function closingRows(trainer, month) {
  const {start,end,month:selected} = monthData();
  if (selected !== month) throw new Error('El mes ha cambiado. Vuelve a abrir el cierre.');
  return monthlyRows(start,end,month,m => m.trainer === trainer);
}

function render() {
  const {start:monthStart,end:monthEnd,month:currentMonth} = monthData();
  const visibleTrainers = state.equipo.filter(t => t.active ||
    state.socios.some(m => m.trainer === t.id && m.start <= monthEnd && (!m.end || m.end >= monthStart)) ||
    state.ausencias.some(a => a.trainer === t.id && a.start <= monthEnd && a.end >= monthStart) ||
    state.cierres?.some(c => c.trainer === t.id && c.month === currentMonth));
  const selected = $('trainer').value;
  $('trainer').value = visibleTrainers.some(t => t.id === selected) ? selected : (visibleTrainers[0]?.id || '');
  $('trainerButtons').innerHTML = visibleTrainers.map(t =>
    '<button type="button" data-trainer="'+esc(t.id)+'" aria-pressed="'+(t.id === $('trainer').value)+'">'+esc(t.name)+'</button>'
  ).join('');
  $('workspace').hidden = false;
  $('title').textContent = titles[page];
  $('add').textContent = '+ ' + actions[page];
  $('add').disabled = page !== 'equipo' && !state.equipo.some(t => t.active);
  $('filters').hidden = page === 'socios';
  $('trainerPicker').hidden = page === 'equipo';
  document.querySelectorAll('[data-page]').forEach(b => {
    if (b.dataset.page === page) b.setAttribute('aria-current','page');
    else b.removeAttribute('aria-current');
  });
  const { start, end, month, absences, matches } = monthData();
  if (page === 'resumen') {
    const closed = state.cierres?.filter(c => c.month === month && matches(c)) || [];
    const monthly = monthlyRows(start,end,month,m =>
      matches(m) && !closed.some(c => c.trainer === m.trainer))
      .concat(closed.flatMap(c => c.rows.map(row => ({...row,closed:true}))));
    const sum = rows => rows.reduce((total, row) => total + row.count, 0);
    const ratesReady = !!ratesFor(month);
    const sumPay = rows => money(rows.reduce((total, row) => total + (row.pay ?? 0), 0));
    const trainers = state.equipo.filter(t =>
      matches({trainer:t.id}) && (t.active || $('trainer').value || monthly.some(row => row.m.trainer === t.id) || closed.some(c => c.trainer === t.id)));
    const totals = trainers.map(t => {
      const rows = monthly.filter(row => row.m.trainer === t.id);
      const closure = closed.find(c => c.trainer === t.id);
      return [esc(closure?.trainerName || t.name),
        ...packages.map(p => fmt.format(sum(rows.filter(row => packageName(row.m) === p)))),
        '<strong>'+fmt.format(sum(rows))+'</strong>', '<strong>'+(closure || ratesReady ? sumPay(rows) : '—')+'</strong>',
        closure ? 'Cerrado' : 'Abierto',
        closure ? action('report','cierres',t.id,'Ver cierre') :
          (ratesReady ? action('closeMonth','cierres',t.id,'Cerrar mes') : 'Configura las tarifas')];
    });
    const details = monthly.map(({m, adjustment, count, unitRate, pay, closed}) => [
      esc(nameOf(m.trainer)), esc(m.code || '—'), esc(m.name),mode(packageName(m)),
      fmt.format(m.minutes / 60),adjustment?.discount != null ? adjustment.discount+' %' :
        (adjustment ? 'Ajuste anterior' : 'Sin descuento'),fmt.format(count),unitRate == null ? '—' : money(unitRate),'<strong>'+(pay == null ? '—' : money(pay))+'</strong>',closed ? 'Mes cerrado' : action('adjust','ajustes',m.id,'Descuento')
    ]);
    $('content').innerHTML = '<div class="metrics">'+
      metric('Entrenamientos del mes',fmt.format(sum(monthly)))+
      metric('Entrenamientos Duo',fmt.format(sum(monthly.filter(row => row.m.mode === 'Duo'))))+
      metric('Entrenamientos One',fmt.format(sum(monthly.filter(row => row.m.mode === 'One'))))+
      metric('Total para nómina',ratesReady || (closed.length && monthly.every(r => r.pay != null)) ? sumPay(monthly) : '—')+
      '</div>'+table('Entrenamientos por entrenador',['Entrenador',...packages,'Total entrenamientos','Total para nómina','Estado',''],totals,
        'No hay entrenadores para esta selección.')+
      table('Paquetes de los socios',['Entrenador','N.º de socio','Socio','Paquete','Entrenamientos del paquete','Descuento','Entrenamientos del mes','€/entrenamiento','Importe del mes',''],
        details,'No hay socios asignados para este mes.');
  }
  if (page === 'socios') {
    const rows = state.socios.slice().sort((a,b) => a.name.localeCompare(b.name,'es'));
    const display = m => [esc(m.name),esc(m.code || '—'),esc(nameOf(m.trainer)),mode(packageName(m)),fmt.format(m.minutes / 60),
      date(m.start),date(m.end),action('edit','socios',m.id,'Editar')+
      (!m.end ? action('close','socios',m.id,'Finalizar') : '')];
    const columns = ['Socio','N.º de socio','Entrenador','Paquete','Entrenamientos al mes','Desde','Hasta',''];
    $('content').innerHTML = table('Asignaciones actuales',columns,rows.filter(m => activeAt(m,day())).map(display),'Añade una asignación para empezar.')+
      table('Historial y próximas altas',columns,rows.filter(m => !activeAt(m,day())).map(display),'Todavía no hay asignaciones en esta sección.');
  }
  if (page === 'ausencias') {
    const daysByType = type => {
      const keys = new Set();
      for (const a of absences.filter(a => a.type === type)) {
        const cursor = new Date(a.start < start ? start : a.start);
        const last = a.end > end ? end : a.end;
        while (cursor.toISOString().slice(0,10) <= last) {
          keys.add(a.trainer + cursor.toISOString().slice(0,10));
          cursor.setUTCDate(cursor.getUTCDate()+1);
        }
      }
      return keys.size;
    };
    $('content').innerHTML = '<div class="metrics">'+
      metric('Días naturales de vacaciones',daysByType('Vacaciones'))+
      metric('Días de ausencia completa',daysByType('Ausencia completa'))+
      metric('Horas de ausencia parcial',hours(total(absences.filter(a => a.type === 'Ausencia parcial'))))+'</div>'+
      table('Registro del mes',['Entrenador','Tipo','Desde','Hasta','Duración parcial','Nota',''],
        absences.sort((a,b) => b.start.localeCompare(a.start)).map(a => [esc(nameOf(a.trainer)),esc(a.type),date(a.start),date(a.end),
          a.minutes ? hours(a.minutes) : '—',esc(a.note || '—'),
          action('edit','ausencias',a.id,'Editar')+action('remove','ausencias',a.id,'Eliminar')]),
        'Todavía no hay vacaciones ni ausencias registradas en este mes.');
  }
  if (page === 'equipo') {
    const rates = ratesFor(month);
    $('content').innerHTML = table('Equipo',['Entrenador','Estado','Socios actuales',''],state.equipo.map(t => [
      esc(t.name),t.active ? 'Activo' : 'Archivado',state.socios.filter(m => m.trainer === t.id && activeAt(m,day())).length,
      action('edit','equipo',t.id,'Editar')+action('archive','equipo',t.id,t.active ? 'Archivar' : 'Reactivar')
    ]),'Añade un entrenador para empezar.')+
      '<section class="panel"><div class="sectionHead"><div><h2>Tarifas para nómina</h2><p>'+
      (rates ? 'Tarifas aplicables a '+esc(month) : 'Configura los importes mensuales por paquete.')+'</p></div>'+
      action('rates','tarifas','',rates ? 'Cambiar tarifas' : 'Configurar tarifas')+'</div>'+
      (rates ? '<div class="scroll"><table><thead><tr><th>Paquete</th><th>Mes completo</th><th>Por entrenamiento</th></tr></thead><tbody>'+
        packages.map((p,i) => '<tr><td>'+p+'</td><td>'+money(rates[rateKeys[i]])+'</td><td>'+
          money(rates[rateKeys[i]]/(p.endsWith('2H') ? 8 : 4))+'</td></tr>').join('')+'</tbody></table></div>' : '')+'</section>';
  }
}

function option(value, label, selected) {
  return '<option value="'+esc(value)+'"'+(value === selected ? ' selected' : '')+'>'+esc(label)+'</option>';
}
function input(label, key, value, type = 'text', attrs = 'required') {
  return '<label>'+label+'<input name="'+key+'" type="'+type+'" value="'+esc(value ?? '')+'" '+attrs+'></label>';
}
function select(label, key, values, selected, attrs = 'required') {
  return '<label>'+label+'<select name="'+key+'" '+attrs+'>'+values.map(([id,text]) => option(id,text,selected)).join('')+'</select></label>';
}
const packageOptions = packages.map(p => [p,p+' · '+(p.endsWith('2H') ? 8 : 4)+' entrenamientos al mes']);
const absenceOptions = ['Vacaciones','Ausencia completa','Ausencia parcial'].map(v => [v,v]);

function openEditor(kind, id, intent) {
  const data = state[kind]?.find(r => r.id === id) || {};
  const t = $('trainer').value;
  const chosenMonth = $('month').value || day().slice(0,7);
  const defaultDay = day().startsWith(chosenMonth) ? day() : chosenMonth+'-01';
  const trainers = state.equipo.filter(r => r.active || r.id === data.trainer).map(r => [r.id,r.name]);
  const trainer = select('Entrenador','trainer',trainers,data.trainer || t);
  editor = {kind,id,intent,data,month:chosenMonth};
  $('editorTitle').textContent = intent === 'rates' ? 'Tarifas mensuales para nómina' : intent === 'close' ? 'Finalizar asignación' : intent === 'adjust' ? 'Descuento del mes' :
    (id ? 'Editar registro' : actions[kind]);
  $('formError').hidden = true;
  $('save').hidden = intent === 'report';
  $('save').textContent = intent === 'closeMonth' ? 'Confirmar cierre' : 'Guardar';
  $('cancel').textContent = intent === 'report' ? 'Cerrar' : 'Cancelar';
  let fields = '';
  if (kind === 'cierres') {
    const closure = state.cierres?.find(c => c.trainer === id && c.month === chosenMonth);
    const rows = closure?.rows ?? closingRows(id,chosenMonth);
    $('editorTitle').textContent = (closure ? 'Cierre de ' : 'Cerrar mes de ')+(closure?.trainerName || nameOf(id));
    fields = '<div class="wide"><p>'+esc(chosenMonth)+' · <strong>'+
      money(rows.reduce((sum,r) => sum + r.pay,0))+'</strong> para nómina</p>'+
      table('Desglose',['Socio','Paquete','Descuento','Entrenos','€/entreno','Importe'],
        rows.map(({m,adjustment,count,unitRate,pay}) => [esc(m.name),packageName(m),
          adjustment?.discount != null ? adjustment.discount+' %' : (adjustment ? 'Ajuste' : '0 %'),
          fmt.format(count),money(unitRate),money(pay)]),'Este entrenador suma 0 € en el mes.')+
      (closure ? '' : '<p>El cierre guardará estos importes y el desglose del mes.</p>')+'</div>';
  }
  if (kind === 'tarifas') {
    const current = ratesFor(chosenMonth);
    fields = '<p class="wide">Importes por paquete completo. Se aplicarán desde el mes indicado.</p>'+
      packages.map((p,i) => input(p+' (€)',rateKeys[i],current ? current[rateKeys[i]]/100 : '',
        'number','required min="0" max="10000" step="0.01"')).join('')+
      input('Desde el mes','effective',chosenMonth,'month');
  }
  if (kind === 'equipo') fields = input('Nombre','name',data.name,'text','required maxlength="100"');
  if (kind === 'socios') fields = intent === 'close' ? input('Último día','end',day(),'date') :
    input('N.º de socio','code',data.code,'text','required maxlength="30" inputmode="numeric" pattern="[0-9]+"')+
    input('Nombre y apellidos','name',data.name,'text','required maxlength="120"')+
    trainer+select('Paquete','package',packageOptions,data.mode ? packageName(data) : undefined)+
    input('Fecha de inicio','start',data.start || day(),'date')+
    input('Fecha final (opcional)','end',data.end,'date','');
  if (kind === 'ajustes') {
    const m = member(id);
    const prior = state.ajustes.find(a => a.member === id && a.month === chosenMonth);
    const options = discounts.map(v => [v,v === '0' ? 'Sin descuento' : v+' %']);
    if (prior && prior.discount == null) options.unshift(['legacy','Conservar ajuste anterior']);
    fields = '<p class="wide">'+esc(m.name)+' · '+esc(chosenMonth)+'</p>'+
      select('Descuento sobre el paquete','discount',options,prior?.discount != null ? String(prior.discount) : (prior ? 'legacy' : '0'));
    editor.month = chosenMonth;
  }
  if (kind === 'ausencias') fields = trainer+select('Tipo','type',absenceOptions,data.type)+
    input('Desde','start',data.start || defaultDay,'date')+input('Hasta','end',data.end || defaultDay,'date')+
    input('Duración parcial (minutos)','minutes',data.minutes || 60,'number','required min="1" max="1439"')+
    input('Nota (opcional)','note',data.note,'text','maxlength="250"');
  $('fields').innerHTML = fields;
  if (kind === 'ausencias') showPartial();
  $('editor').showModal();
}

function showPartial() {
  const e = $('recordForm').elements;
  const partial = e.type.value === 'Ausencia parcial';
  e.minutes.disabled = !partial;
  e.minutes.closest('label').hidden = !partial;
  e.end.disabled = partial;
  e.end.closest('label').hidden = partial;
}

async function persist(next) {
  if (!db || !user) throw new Error('Hace falta iniciar sesión para guardar.');
  const {data,error} = await db.from('ep_daganzo_estado')
    .update({revision:revision+1,datos:next}).eq('propietario',user.id).eq('revision',revision).select('revision');
  if (error) throw new Error('Supabase no pudo guardar el registro. Inténtalo de nuevo.');
  if (!data.length) {
    await load();
    $('editor').close();
    notify('Los datos cambiaron en otra sesión. Revisa la versión actual y vuelve a abrir el formulario.');
    throw new Error('Los datos cambiaron en otra sesión. Revisa la versión actual y vuelve a abrir el formulario.');
  }
  state = next;
  revision = data[0].revision;
  render();
}

async function load() {
  const {data,error} = await db.from('ep_daganzo_estado').select('revision,datos').eq('propietario',user.id).maybeSingle();
  if (error) throw new Error('No se pudo leer la base de datos de entrenadores.');
  if (!data) {
    const initial = emptyState();
    const result = await db.from('ep_daganzo_estado').insert({datos:initial}).select('revision').single();
    if (result.error?.code === '23505') return load();
    if (result.error) throw new Error('Esta cuenta no tiene acceso al registro de entrenadores o falta configurar Supabase.');
    state = initial;
    revision = result.data.revision;
  } else {
    state = data.datos;
    revision = data.revision;
  }
  $('login').hidden = true;
  $('logout').hidden = false;
  render();
}

async function start() {
  if (!db) {
    notify('Falta configurar la clave pública del proyecto Supabase.');
    return;
  }
  const {data} = await db.auth.getSession();
  user = data.session?.user;
  $('login').hidden = !!user;
  $('logout').hidden = !user;
  if (user) await load();
}

function change(form) {
  const {kind,id,intent,data,month} = editor;
  const next = structuredClone(state);
  const value = key => String(form.get(key) ?? '').trim();
  const trainer = value('trainer');
  const note = value('note');
  let record = {id:id || crypto.randomUUID()};
  if (kind === 'cierres') {
    if (intent !== 'closeMonth' || !ratesFor(month)) throw new Error('Configura las tarifas del mes antes de cerrarlo.');
    if (next.cierres?.some(c => c.month === month && c.trainer === id)) throw new Error('Este mes ya está cerrado.');
    const rows = closingRows(id,month).map(({m,adjustment,count,unitRate,pay}) => ({
      m:{id:m.id,name:m.name,code:m.code,trainer:m.trainer,mode:m.mode,minutes:m.minutes},
      adjustment,count,unitRate,pay
    }));
    next.cierres = [...(next.cierres || []),{month,trainer:id,trainerName:nameOf(id),rows}];
    return next;
  }
  if (kind === 'tarifas') {
    const effective = value('effective');
    const rates = Object.fromEntries(rateKeys.map(key => [key,Math.round(Number(value(key))*100)]));
    next.tarifas = (next.tarifas || []).filter(r => r.month !== effective);
    next.tarifas.push({month:effective,rates});
    return next;
  }
  if (kind === 'equipo') {
    if (!value('name')) throw new Error('Introduce el nombre del entrenador.');
    Object.assign(record,{name:value('name'),active:data.active ?? true});
  }
  if (kind === 'socios') {
    Object.assign(record,intent === 'close' ? {...data,end:value('end')} : {
      name:value('name'),code:value('code'),trainer,mode:value('package').split(' ')[0],
      minutes:value('package').endsWith('2H') ? 480 : 240,
      start:value('start'),end:value('end')
    });
    if (!record.name) throw new Error('Introduce el nombre del socio.');
    if (!record.trainer) throw new Error('Selecciona un entrenador.');
    if (intent !== 'close' && !/^[0-9]+$/.test(record.code)) throw new Error('Introduce el número de socio.');
    if (record.end && record.end < record.start) throw new Error('La fecha de fin debe ser igual o posterior a la de inicio.');
    const linked = (next.sesiones || []).filter(s => s.members.includes(id));
    if (linked.some(s => !activeAt(record,s.day) || s.mode !== record.mode || s.trainer !== record.trainer)) {
      throw new Error('La asignación tiene sesiones registradas. Conserva su modalidad y entrenador y usa fechas que cubran esas sesiones.');
    }
    const overlap = next.socios.some(m => m.id !== id && (record.code && m.code ? record.code === m.code :
      record.name.toLowerCase() === m.name.toLowerCase()) && (!m.end || m.end >= record.start) &&
      (!record.end || m.start <= record.end));
    if (overlap) throw new Error('Ya existe una asignación de este socio para esas fechas.');
  }
  if (kind === 'ausencias') {
    if (!trainer) throw new Error('Selecciona un entrenador.');
    const type = value('type'), start = value('start');
    const partial = type === 'Ausencia parcial';
    Object.assign(record,{trainer,note,type,start,end:partial ? start : value('end'),minutes:partial ? Number(value('minutes')) : 0});
    if (record.end < start) throw new Error('La fecha final debe ser igual o posterior a la inicial.');
  }
  if (kind === 'ajustes') {
    if (next.cierres?.some(c => c.month === month && c.trainer === member(id).trainer)) throw new Error('Este mes ya está cerrado.');
    const discount = value('discount');
    if (discount === 'legacy') return next;
    if (!discounts.includes(discount)) throw new Error('Selecciona un descuento válido.');
    next.ajustes = next.ajustes.filter(a => !(a.member === id && a.month === month));
    if (discount !== '0') next.ajustes.push({member:id,month,discount:Number(discount)});
    return next;
  }
  const index = next[kind].findIndex(r => r.id === id);
  if (index < 0) next[kind].push(record);
  else next[kind][index] = record;
  return next;
}

$('add').onclick = () => openEditor(page === 'resumen' ? 'socios' : page);
function shiftMonth(offset) {
  const [year, month] = ($('month').value || day().slice(0, 7)).split('-').map(Number);
  const target = new Date(0);
  target.setUTCFullYear(year, month - 1 + offset, 1);
  const targetYear = target.getUTCFullYear();
  if (targetYear < 1) return;
  $('month').value = String(targetYear).padStart(4, '0') + '-' + String(target.getUTCMonth() + 1).padStart(2, '0');
  render();
}

$('prevMonth').onclick = () => shiftMonth(-1);
$('nextMonth').onclick = () => shiftMonth(1);
$('month').onchange = render;
$('trainerButtons').onclick = event => {
  const choice = event.target.closest('[data-trainer]');
  if (!choice || choice.dataset.trainer === $('trainer').value) return;
  $('trainer').value = choice.dataset.trainer;
  render();
  Array.from($('trainerButtons').children).find(b => b.dataset.trainer === choice.dataset.trainer)?.focus();
};
$('cancel').onclick = $('close').onclick = () => { if (!saving) $('editor').close(); };
$('editor').addEventListener('cancel', event => { if (saving) event.preventDefault(); });
$('recordForm').onchange = event => {
  const field = event.target.name;
  if (editor.kind === 'ausencias' && field === 'type') showPartial();
};
$('recordForm').onsubmit = async event => {
  event.preventDefault();
  if (saving) return;
  $('formError').hidden = true;
  saving = $('save').disabled = true;
  try {
    await persist(change(new FormData(event.currentTarget)));
    $('editor').close();
  } catch (error) {
    $('formError').textContent = error.message;
    $('formError').hidden = false;
  } finally { saving = $('save').disabled = false; }
};

document.querySelector('nav').onclick = event => {
  if (!state || !event.target.dataset.page) return;
  page = event.target.dataset.page;
  render();
};
$('content').onclick = async event => {
  const button = event.target.closest('[data-act]');
  if (!button || saving) return;
  const {act,kind,id} = button.dataset;
  if (act !== 'archive' && act !== 'remove') return openEditor(kind,id,act);
  const next = structuredClone(state);
  if (act === 'remove') {
    if (!confirm('¿Eliminar este registro?')) return;
    next[kind] = next[kind].filter(r => r.id !== id);
  } else {
    const trainer = next.equipo.find(r => r.id === id);
    if (trainer.active && next.socios.some(m => m.trainer === id && (!m.end || m.end >= day()))) {
      return notify('Finaliza las asignaciones actuales o futuras de este entrenador antes de archivarlo.');
    }
    trainer.active = !trainer.active;
  }
  saving = true;
  try { await persist(next); notify(); } catch (error) { notify(error.message); }
  finally { saving = false; }
};

$('loginForm').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = new FormData(form);
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const {error} = await db.auth.signInWithPassword({
      email:fields.get('email').trim(), password:fields.get('password')
    });
    if (error) throw new Error('No se pudo iniciar sesión. Comprueba el correo y la contraseña.');
    form.reset();
    notify();
    await start();
  } catch (error) { notify(error.message); }
  finally { button.disabled = false; }
};
$('logout').onclick = async () => {
  const {error} = await db.auth.signOut({scope:'local'});
  if (error) return notify('No se pudo cerrar sesión. Inténtalo de nuevo.');
  location.reload();
};
start().catch(error => notify(error.message));
