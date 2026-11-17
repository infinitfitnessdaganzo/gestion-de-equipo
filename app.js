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
  resumen: 'Resumen mensual', socios: 'Socios',
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
const undoHistory = [];
const redoHistory = [];
let memberSort = {key:'name', direction:1};
const memberCollator = new Intl.Collator('es', {sensitivity:'base',numeric:true});
$('month').value = day().slice(0, 7);

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
const fmt = new Intl.NumberFormat('es-ES', {maximumFractionDigits: 2});
const euro = new Intl.NumberFormat('es-ES', {style:'currency',currency:'EUR'});
const money = cents => euro.format(cents / 100);
const monthNames = new Intl.DateTimeFormat('es-ES',{month:'long',timeZone:'UTC'});
const monthName = month => monthNames.format(new Date(month+'-01T00:00:00Z'));
const monthlyNote = (id,month) => state.notasMensuales?.find(n => n.member === id && n.month === month)?.text || '';
const hours = minutes => fmt.format(minutes / 60) + ' h';
const date = iso => iso ? iso.split('-').reverse().join('/') : '—';
const nameOf = id => state.equipo.find(t => t.id === id)?.name ?? '—';
const member = id => state.socios.find(m => m.id === id);
const packages = ['Duo 1H','Duo 2H','One 1H','One 2H'];
const rateKeys = ['duo1','duo2','one1','one2'];
const packageName = m => m.mode + (m.minutes === 480 ? ' 2H' : ' 1H');
const plannedTrainings = m => m.minutes / 60;
const completedTrainings = (m, adjustment, defaultCount) => adjustment?.count ?? (
  adjustment?.discount != null ? plannedTrainings(m) * (100 - adjustment.discount) / 100 :
    adjustment?.minutes == null ? defaultCount : adjustment.minutes / 60
);
const hourlyEuro = new Intl.NumberFormat('es-ES',{
  style:'currency',currency:'EUR',maximumFractionDigits:5
});
const hourlyMoney = cents => hourlyEuro.format(cents / 100);
const mode = value => '<span class="badge '+ value.split(' ')[0].toLowerCase() +'">'+ esc(value) +'</span>';
const activeAt = (m, d) => m.start <= d && (!m.end || m.end >= d);
const action = (key, kind, id, label) => '<button data-act="'+key+'" data-kind="'+kind+'" data-id="'+esc(id)+'">'+label+'</button>';
const metric = (label, value, detail = '') => '<div class="metric">'+label+'<strong>'+value+'</strong>'+
  (detail ? '<small>'+detail+'</small>' : '')+'</div>';
const total = rows => rows.reduce((sum, s) => sum + s.minutes, 0);

function notify(message = '') {
  $('notice').textContent = message;
  $('notice').hidden = !message;
}

function memberHeader(label,key) {
  const active = memberSort.key === key;
  const order = active ? (memberSort.direction === 1 ? 'ascending' : 'descending') : '';
  const arrow = active ? (memberSort.direction === 1 ? '↑' : '↓') : '↕';
  return '<th scope="col"'+(active ? ' aria-sort="'+order+'"' : '')+'>'+
    '<button type="button" class="sort-header" data-sort="'+key+'">'+label+
    ' <span aria-hidden="true">'+arrow+'</span></button></th>';
}

function compareMembers(a,b) {
  const {key,direction} = memberSort;
  const value = m => key === 'trainer' ? nameOf(m.trainer) : (m[key] || '');
  const left = value(a), right = value(b);
  if (key === 'code' && (!left || !right) && left !== right) return left ? -1 : 1;
  return direction * memberCollator.compare(left,right) || memberCollator.compare(a.name,b.name);
}

function table(title, columns, rows, empty, compact = false) {
  return '<section class="panel'+(compact ? ' compact-packages' : '')+'"><div class="sectionHead"><h2>'+title+'</h2></div>'+
    (rows.length ? '<div class="scroll"><table><thead><tr>'+columns.map(c =>
      Array.isArray(c) ? memberHeader(...c) : '<th scope="col">'+c+'</th>').join('')+
      '</tr></thead><tbody>'+rows.map(r => '<tr>'+r.map((c,i) => (compact && columns[i] ?
      '<td><span class="package-cell-label" aria-hidden="true">'+columns[i]+'</span><span>'+c+'</span></td>' :
      '<td>'+c+'</td>')).join('')+'</tr>').join('')+
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

const epRate = () => state.tarifasExtra?.single ?? 2000;
const bonusRequirements = '<p>La prima se paga una vez por asignación si el socio sigue activo con ese entrenador y modalidad el día 1 del segundo mes posterior al alta. Por ejemplo, un alta en septiembre genera la prima el 1 de noviembre. Se aplica desde noviembre de 2026.</p><p>Tras un cambio de modalidad sin interrupción, si ya se pagó una prima, se abona únicamente la diferencia positiva al seguir activo en la nueva modalidad el día 1 del tercer mes, contando el mes del cambio como el primero.</p>';
const firstManagedMonth = '2026-11';
const externalClose = (trainer,month) => !!trainer && month < firstManagedMonth &&
  !state.mesesAnterioresAbiertos?.some(m => m.trainer === trainer && m.month === month);
const closedMonth = (trainer,month) =>
  state.cierres?.some(c => c.trainer === trainer && c.month === month) || externalClose(trainer,month);

function previousDay(iso) {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate()-1);
  return date.toISOString().slice(0,10);
}

function bonusDay(start) {
  const [year,month] = start.split('-').map(Number);
  const target = new Date(0);
  target.setUTCFullYear(year,month+1,1);
  return target.toISOString().slice(0,10);
}

const firstBonusMonth = '2026-11';

function eligibleBonusDay(m) {
  if (!m.start) return null;
  const due = bonusDay(m.start);
  return due.slice(0,7) >= firstBonusMonth && (!m.end || due <= m.end) ? due : null;
}

function bonusDetails(m,due,paidBonuses) {
  const amount = m.bonus ?? state.tarifasExtra?.[rateKeys[packages.indexOf(packageName(m))]];
  const lastDay = previousDay(m.start);
  const firstLink = state.socios.find(p => p.code && p.code === m.code && p.trainer === m.trainer && p.end === lastDay);
  if (!firstLink) return {amount,concept:'Prima por fidelidad · '+packageName(m)};

  const earlierIds = new Set();
  let prior = firstLink;
  while (prior && !earlierIds.has(prior.id)) {
    earlierIds.add(prior.id);
    const boundary = previousDay(prior.start);
    prior = state.socios.find(p => p.code === m.code && p.trainer === m.trainer && p.end === boundary);
  }
  const paid = paidBonuses.filter(e => earlierIds.has(e.id) && e.day < due)
    .reduce((total,e) => total + e.pay,0);
  if (!paid) return {amount,concept:'Prima por fidelidad · '+packageName(m)};
  if (packageName(firstLink) === packageName(m) || (amount != null && amount <= paid)) return null;
  return {
    amount:amount == null ? null : amount-paid,
    concept:'Diferencia de prima por fidelidad · '+packageName(m),
    paid
  };
}

const bonusOverride = (id,trainer,month) =>
  state.ajustesPrimas?.find(a => a.member === id && a.trainer === trainer && a.month === month);

function bonusEntries(trainer,month) {
  const recorded = (state.cierres || []).flatMap(c => (c.extras || []).filter(e => e.kind === 'prima'));
  const paid = recorded.filter(e => e.pay > 0 && e.status !== 'void');
  return state.socios.filter(m => m.trainer === trainer && !recorded.some(e => e.id === m.id))
    .flatMap(m => {
      const due = eligibleBonusDay(m);
      if (!due?.startsWith(month)) return [];
      const details = bonusDetails(m,due,paid);
      if (!details) return [];
      const override = bonusOverride(m.id,trainer,month);
      return [{id:m.id,kind:'prima',day:due,name:m.name,pay:override?.pay ?? details.amount,
        concept:details.concept,automaticPay:details.amount,paid:details.paid,
        status:override?.status,note:override?.note}];
    });
}

function extrasFor(trainer,month) {
  const bonuses = bonusEntries(trainer,month).filter(e => e.pay != null);
  const singles = (state.sueltos || []).filter(s => s.trainer === trainer && s.day.startsWith(month))
    .map(s => ({...s,kind:'suelto',concept:'EP'}));
  const corrections = (state.correccionesNomina || []).filter(c => c.trainer === trainer && c.month === month)
    .map(c => ({...c,kind:'correccion',day:month+'-01',concept:'Corrección de '+c.sourceMonth}));
  return [...bonuses,...singles,...corrections].sort((a,b) => a.day.localeCompare(b.day));
}

const payTotal = rows => rows.reduce((total,row) => total + (row.pay ?? 0),0);

function extraTable(extras,locked) {
  return table('Primas por fidelidad y EP',['Fecha','Socio','Concepto','Importe',''],
    extras.filter(e => e.kind !== 'correccion').map(e => [date(e.day),esc(e.name),
      esc(e.kind === 'suelto' ? 'EP' : e.concept)+(e.status === 'void' ? ' · Anulada' : e.status === 'custom' ? ' · Ajustada' : '')+
        (e.note ? '<br><small>'+esc(e.note)+'</small>' : ''),money(e.pay),
      locked ? '' : e.kind === 'suelto' ? action('edit','sueltos',e.id,'Editar')+action('remove','sueltos',e.id,'Eliminar') :
        action('edit','ajustesPrimas',e.id,'Editar prima')]),
    'Sin primas por fidelidad ni EP en este mes.');
}

function correctionSources(trainer,month,editingId,includeUnavailable = false) {
  const existing = (state.correccionesNomina || []).filter(c => c.trainer === trainer && c.id !== editingId);
  return (state.cierres || []).filter(c => c.trainer === trainer && c.month < month)
    .sort((a,b) => b.month.localeCompare(a.month))
    .flatMap(c => {
      const packages = c.rows.map(({m,count,unitRate,pay}) => ({
        key:'paquete:'+m.id,code:m.code,name:m.name,label:packageName(m),count,unitRate,pay
      }));
      const singles = (c.extras || []).filter(e => e.kind === 'suelto').map(e => ({
        key:'ep:'+e.id,name:e.name,label:'EP · '+date(e.day),count:1,unitRate:e.pay,pay:e.pay
      }));
      return [...packages,...singles].flatMap(row => {
        const used = existing.filter(e => e.sourceMonth === c.month && e.sourceKey === row.key);
        const available = !used.some(e => e.month >= month);
        if ((!available && !includeUnavailable) || !Number.isFinite(row.unitRate)) return [];
        const prior = used.filter(e => e.month <= month);
        return [{...row,month:c.month,value:c.month+'|'+row.key,available,
          reconciled:prior.length > 0,accounted:row.count-prior.reduce((sum,e) => sum+e.count,0),
          accountedPay:row.pay+payTotal(prior)}];
      }).sort((a,b) => a.name.localeCompare(b.name,'es') || a.label.localeCompare(b.label,'es'));
    });
}

function correctionTable(extras,locked) {
  return table('Correcciones de meses anteriores',['Mes de origen','Socio','Modalidad','Sesiones al cerrar','Sesiones reales','Diferencia','Importe','Nota',''],
    extras.filter(e => e.kind === 'correccion').map(e => [
      esc(e.sourceMonth),esc(e.name),esc(e.label),e.originalCount == null ? '—' : fmt.format(e.originalCount),
      e.actualCount == null ? '—' : fmt.format(e.actualCount),signedCount(-e.count),money(e.pay),esc(e.note || '—'),
      locked ? '' : action('edit','correccionesNomina',e.id,'Editar')+action('remove','correccionesNomina',e.id,'Eliminar')
    ]),'No hay correcciones en este mes.');
}

const signedCount = n => (n > 0 ? '+' : '')+fmt.format(n);

function previousSessions(member,previous,month,locked) {
  const exact = previous.find(r => r.key === 'paquete:'+member.id);
  const sameNumber = previous.filter(r => r.key.startsWith('paquete:') && member.code && r.code === member.code);
  const row = exact || (sameNumber.length === 1 ? sameNumber[0] : null);
  if (!row) return '—';
  const saved = state.correccionesNomina?.find(e => e.trainer === member.trainer && e.month === month &&
    e.sourceMonth === row.month && e.sourceKey === row.key);
  const label = (row.reconciled ? fmt.format(row.accounted)+' reales · ' : '')+fmt.format(row.count)+' al cerrar';
  if (locked) return label;
  return label+'<br>'+(saved ? action('edit','correccionesNomina',saved.id,'Ajustar anterior') :
    row.available ? action('reconcile','correccionesNomina',row.value,'Ajustar anterior') : '');
}

function ratesFor(month) {
  const entry = state.tarifas?.filter(r => r.month <= month).sort((a,b) => b.month.localeCompare(a.month))[0];
  if (!entry || entry.perHour) return entry?.rates;
  return Object.fromEntries(rateKeys.map((key,i) => [key,entry.rates[key] / (packages[i].endsWith('2H') ? 8 : 4)]));
}

function defaultTrainingsForMonth(m,month) {
  const start = month+'-01';
  const [year,number] = month.split('-').map(Number);
  const days = new Date(Date.UTC(year,number,0)).getUTCDate();
  const beginsWithSwitch = m.start.startsWith(month) &&
    state.socios.some(p => p.id === m.previousAssignment && p.end === previousDay(m.start));
  const endsWithSwitch = m.end?.startsWith(month) &&
    state.socios.some(p => p.previousAssignment === m.id && previousDay(p.start) === m.end);
  if (!beginsWithSwitch && !endsWithSwitch) return plannedTrainings(m);
  const first = m.start > start ? Number(m.start.slice(8)) : 1;
  const last = m.end?.startsWith(month) ? Number(m.end.slice(8)) : days;
  return Math.round(plannedTrainings(m) * (last-first+1)/days);
}

function monthlyRows(start,end,month,matches) {
  const rates = ratesFor(month);
  return state.socios.filter(m => matches(m) && m.start <= end && (!m.end || m.end >= start))
    .sort((a,b) => nameOf(a.trainer).localeCompare(nameOf(b.trainer),'es') || a.name.localeCompare(b.name,'es'))
    .map(m => {
      const adjustment = state.ajustes.find(a => a.member === m.id && a.month === month);
      const count = completedTrainings(m, adjustment, defaultTrainingsForMonth(m,month));
      const unitRate = rates ? rates[rateKeys[packages.indexOf(packageName(m))]] : null;
      return {m, adjustment, count, unitRate, pay:unitRate == null ? null : Math.round(count * unitRate)};
    });
}

function closingRows(trainer, month) {
  const {start,end,month:selected} = monthData();
  if (selected !== month) throw new Error('El mes ha cambiado. Vuelve a abrir el cierre.');
  return monthlyRows(start,end,month,m => m.trainer === trainer);
}

function trainingMetrics(monthly, extras) {
  const normalized = name => name.trim().replace(/\s+/g,' ').toLocaleLowerCase('es').normalize('NFC');
  const idsByName = new Map();
  for (const {m} of monthly) {
    if (!m.code) continue;
    const name = normalized(m.name);
    const ids = idsByName.get(name) || new Set();
    ids.add(m.code);
    idsByName.set(name,ids);
  }
  const identity = (name,code) => {
    const normalizedName = normalized(name);
    const candidates = idsByName.get(normalizedName);
    const id = code || (candidates?.size === 1 ? [...candidates][0] : null);
    return id ? 'code:'+id : 'name:'+normalizedName;
  };
  const active = monthly.filter(row => row.count > 0);
  const people = rows => new Set(rows.map(({m}) => identity(m.name,m.code)));
  const all = people(active);
  extras.filter(e => e.kind === 'suelto').forEach(e => all.add(identity(e.name)));
  const group = (label, rows, count) => {
    const workedHours = rows.reduce((sum,row) => sum + row.count,0);
    return metric(label,fmt.format(count),fmt.format(workedHours)+(workedHours === 1 ? ' hora' : ' horas'));
  };
  const duo = active.filter(row => row.m.mode === 'Duo');
  const one = active.filter(row => row.m.mode === 'One');
  return group('Personas entrenadas',active,all.size)+
    group('Personas en Duo',duo,people(duo).size)+
    group('Personas en One',one,people(one).size);
}

function noteButton(id,month) {
  const label = monthlyNote(id,month) ? 'Ver nota' : 'Añadir nota';
  const icon = label === 'Ver nota' ? '📓' : '🗒';
  return '<button type="button" data-act="note" data-kind="notasMensuales" data-id="'+esc(id)+
    '" aria-label="'+label+'" title="'+label+'"><span aria-hidden="true">'+icon+'</span></button>';
}

function render() {
  const {start:monthStart,end:monthEnd,month:currentMonth} = monthData();
  const visibleTrainers = state.equipo.filter(t => t.active ||
    state.socios.some(m => m.trainer === t.id && m.start <= monthEnd && (!m.end || m.end >= monthStart)) ||
    state.ausencias.some(a => a.trainer === t.id && a.start <= monthEnd && a.end >= monthStart) ||
    (state.sueltos || []).some(s => s.trainer === t.id && s.day.startsWith(currentMonth)) ||
    state.correccionesNomina?.some(c => c.trainer === t.id && c.month === currentMonth) ||
    state.cierres?.some(c => c.trainer === t.id && c.month === currentMonth));
  const selected = $('trainer').value;
  $('trainer').value = visibleTrainers.some(t => t.id === selected) ? selected : (visibleTrainers[0]?.id || '');
  $('trainerButtons').innerHTML = visibleTrainers.map(t =>
    '<button type="button" data-trainer="'+esc(t.id)+'" aria-pressed="'+(t.id === $('trainer').value)+'">'+esc(t.name)+'</button>'
  ).join('');
  $('workspace').hidden = false;
  $('backupPanel').hidden = page !== 'equipo';
  updateHistoryButtons();
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
    const selectedTrainer = state.equipo.find(t => t.id === $('trainer').value);
    const trainingTitle = selectedTrainer ? 'Entrenamientos de '+esc(selectedTrainer.name) : 'Entrenamientos por entrenador';
    const closed = state.cierres?.filter(c => c.month === month && matches(c)) || [];
    const monthly = monthlyRows(start,end,month,m =>
      matches(m) && !closed.some(c => c.trainer === m.trainer))
      .concat(closed.flatMap(c => c.rows.map(row => ({...row,closed:true}))));
    const sum = rows => rows.reduce((total, row) => total + row.count, 0);
    const ratesReady = !!ratesFor(month);
    const selectedClosure = closed[0];
    const lockedMonth = closedMonth($('trainer').value,month);
    const extras = selectedClosure ? (selectedClosure.extras || []) : extrasFor($('trainer').value,month);
    const extraPay = payTotal(extras);
    const singles = extras.filter(e => e.kind === 'suelto').length;
    const trainers = state.equipo.filter(t =>
      matches({trainer:t.id}) && (t.active || $('trainer').value || monthly.some(row => row.m.trainer === t.id) || closed.some(c => c.trainer === t.id)));
    const totals = trainers.map(t => {
      const rows = monthly.filter(row => row.m.trainer === t.id);
      const closure = closed.find(c => c.trainer === t.id);
      return [esc(closure?.trainerName || t.name),
        ...packages.map(p => fmt.format(sum(rows.filter(row => packageName(row.m) === p)))),
        fmt.format(singles),'<strong>'+fmt.format(sum(rows)+singles)+'</strong>', '<strong>'+((closure ? !closure.ratesMissing && rows.every(r => r.pay != null) : ratesReady) ? money(payTotal(rows)+extraPay) : '—')+'</strong>',
        closure ? 'Cerrado' : externalClose(t.id,month) ? 'Cerrado fuera de la app' : 'Abierto',
        closedMonth(t.id,month) ? action('report','cierres',t.id,'Ver cierre') :
          (ratesReady || month < firstManagedMonth ? action('closeMonth','cierres',t.id,'Cerrar mes') : 'Configura las comisiones')];
    });
    const monthStart = new Date(month+'-01T00:00:00Z');
    monthStart.setUTCMonth(monthStart.getUTCMonth()-1);
    const previousMonth = monthStart.toISOString().slice(0,7);
    const previous = correctionSources($('trainer').value,month,undefined,true).filter(r => r.month === previousMonth);
    const details = monthly.map(({m, count, unitRate, pay, closed}) => [
      esc(m.code || '—'), esc(m.name),mode(packageName(m)),
      fmt.format(count),previousSessions(m,previous,month,lockedMonth),unitRate == null ? '—' : hourlyMoney(unitRate),'<strong>'+(pay == null ? '—' : money(pay))+'</strong>',
      noteButton(m.id,month),
      closed || lockedMonth ? 'Mes cerrado' : action('adjust','ajustes',m.id,'Ajustar')
    ]);
    $('content').innerHTML = '<div class="metrics">'+
      trainingMetrics(monthly,extras)+
      metric('Total para nómina',(selectedClosure ? !selectedClosure.ratesMissing && monthly.every(r => r.pay != null) : ratesReady) ? money(payTotal(monthly)+extraPay) : '—')+
      '</div>'+table(trainingTitle,['Entrenador',...packages,'EP','Total entrenamientos','Total para nómina','Estado',''],totals,
        'No hay entrenadores para esta selección.')+
      table('Socios entrenados en '+monthName(month),
        ['N.º socio','Socio','Paquete','Entrenamientos realizados','Mes anterior · '+monthName(previousMonth),'Comisión por hora','Comisión del mes','Nota',''],
        details,'No hay socios asignados para este mes.',true)+
      (!lockedMonth && $('trainer').value && state.equipo.some(t => t.id === $('trainer').value && t.active) ?
        '<div class="sectionHead">'+action('add','sueltos','','Añadir EP')+'</div>' : '')+
      extraTable(extras,lockedMonth)+
      correctionTable(extras,lockedMonth)+
      (!lockedMonth && correctionSources($('trainer').value,month).length ?
        '<div class="sectionHead">'+action('add','correccionesNomina','','Añadir corrección')+'</div>' : '');
  }
  if (page === 'socios') {
    const today = day();
    const archived = m => !!m.end && m.end <= today;
    const rows = state.socios.slice().sort(compareMembers);
    const display = m => [esc(m.name),esc(m.code || '—'),esc(nameOf(m.trainer)),mode(packageName(m)),fmt.format(m.minutes / 60),
      date(m.start),date(m.end),action('edit','socios',m.id,'Editar')+
      (!m.end ? action('switch','socios',m.id,'Cambiar modalidad')+action('close','socios',m.id,'Finalizar') : '')];
    const columns = [['Nombre del socio','name'],['N.º de socio','code'],['Entrenador','trainer'],'Paquete','Entrenamientos al mes','Desde','Hasta',''];
    $('content').innerHTML = table('Asignaciones',columns,rows.filter(m => !archived(m)).map(display),'Añade una asignación para empezar.')+
      table('Archivados',columns,rows.filter(archived).map(display),'Todavía no hay entrenamientos archivados.');
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
      '<section class="panel"><div class="sectionHead"><div><h2>Comisiones por entrenamiento</h2><p>'+
      'Comisiones de '+esc(month)+' · Cada entrenamiento de paquete cuenta como una hora.</p></div>'+
      action('rates','tarifas','','Cambiar comisiones')+'</div>'+
      '<div class="scroll"><table><thead><tr><th scope="col">Modalidad</th><th scope="col">Comisión</th>'+
      '<th scope="col">Prima por fidelidad</th></tr></thead><tbody>'+
      packages.map((p,i) => {
        const key = rateKeys[i];
        const bonus = state.tarifasExtra?.[key];
        return '<tr><td>'+p+'</td><td>'+(rates ? hourlyMoney(rates[key])+' / h' : '—')+'</td><td>'+
          (bonus == null ? '—' : money(bonus))+'</td></tr>';
      }).join('')+'<tr><td>EP</td><td>'+money(epRate())+'</td><td>—</td></tr></tbody></table></div>'+
      '<div class="sectionHead">'+bonusRequirements+'</div></section>';
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
  const data = state[kind]?.find?.(r => r.id === id) || {};
  const t = $('trainer').value;
  const chosenMonth = $('month').value || day().slice(0,7);
  const defaultDay = day().startsWith(chosenMonth) ? day() : chosenMonth+'-01';
  const trainers = state.equipo.filter(r => r.active || r.id === data.trainer).map(r => [r.id,r.name]);
  const trainer = select('Entrenador','trainer',trainers,data.trainer || t);
  editor = {kind,id,intent,data,month:chosenMonth};
  $('editorTitle').textContent = intent === 'rates' ? 'Comisiones por entrenamiento' : intent === 'close' ? 'Finalizar asignación' : intent === 'adjust' ? 'Entrenamientos realizados en el mes' :
    (id ? 'Editar registro' : actions[kind]);
  $('formError').hidden = true;
  $('save').hidden = false;
  $('deleteMember').hidden = kind !== 'socios' || intent !== 'edit' || !data.id;
  $('save').textContent = intent === 'report' ? 'Reabrir mes' : intent === 'closeMonth' ? 'Confirmar cierre' : 'Guardar';
  $('cancel').textContent = intent === 'report' ? 'Cerrar' : 'Cancelar';
  let fields = '';
  if (kind === 'ajustesPrimas') {
    const entry = bonusEntries(t,chosenMonth).find(e => e.id === id);
    if (!entry || entry.pay == null) return;
    const existing = bonusOverride(id,t,chosenMonth);
    editor.trainer = t;
    $('editorTitle').textContent = 'Editar prima por fidelidad';
    fields = '<p class="wide">'+esc(entry.name)+' · '+esc(monthName(chosenMonth))+' '+esc(chosenMonth.slice(0,4))+
      (entry.paid ? '<br>Primas ya pagadas: '+money(entry.paid) : '')+
      '<br>Importe automático: '+(entry.automaticPay == null ? '—' : money(entry.automaticPay))+'</p>'+
      select('Prima','bonusStatus',[['auto','Importe automático'],['custom','Cambiar importe'],['void','Anular prima']],existing?.status || 'auto')+
      input('Importe (€)','bonusPay',entry.pay/100,'number','required min="0" max="10000" step="0.01"')+
      input('Motivo (opcional)','note',existing?.note,'text','maxlength="250"');
  }
  if (kind === 'cierres') {
    const closure = state.cierres?.find(c => c.trainer === id && c.month === chosenMonth);
    const rows = closure?.rows ?? closingRows(id,chosenMonth);
    const extras = closure ? (closure.extras || []) : extrasFor(id,chosenMonth);
    const historical = !closure && externalClose(id,chosenMonth);
    const hasAmount = (closure ? !closure.ratesMissing : !!ratesFor(chosenMonth)) && rows.every(r => r.pay != null);
    $('editorTitle').textContent = (closure || historical ? 'Cierre de ' : 'Cerrar mes de ')+(closure?.trainerName || nameOf(id));
    fields = '<div class="wide"><p>'+esc(chosenMonth)+' · <strong>'+
      (hasAmount ? money(payTotal(rows)+payTotal(extras)) : 'Importe pendiente')+'</strong></p>'+
      (historical ? '<p>Mes cerrado fuera de la app. El desglose se basa en los datos actuales.</p>' : '')+
      (!hasAmount && !closure && !historical ? '<p>Se guardarán las sesiones. Puedes configurar las comisiones de este mes en Opciones.</p>' : '')+
      table('Desglose',['Socio','Paquete','Entrenamientos realizados','Comisión por hora','Comisión del mes'],
        rows.map(({m,count,unitRate,pay}) => [esc(m.name),packageName(m),
          fmt.format(count),unitRate == null ? '—' : hourlyMoney(unitRate),pay == null ? '—' : money(pay)]),'El entrenador no tiene paquetes en este mes.')+
      extraTable(extras,true)+correctionTable(extras,true)+
      (closure || historical || !hasAmount ? '' : '<p>El cierre guarda el importe para nómina, incluidas las sesiones previstas hasta final de mes. Si el número real cambia, puedes regularizarlo en el mes siguiente con «Añadir corrección».</p>')+'</div>';
  }
  if (kind === 'correccionesNomina') {
    const sources = correctionSources(t,chosenMonth,id);
    if (!sources.length || closedMonth(t,chosenMonth)) return;
    editor.trainer = t;
    $('editorTitle').textContent = id ? 'Editar corrección de nómina' : 'Corregir un mes anterior';
    const selected = intent === 'reconcile' ? id : data.sourceMonth ? data.sourceMonth+'|'+data.sourceKey : sources[0].value;
    const origin = sources.find(row => row.value === selected);
    if (!origin) return notify('Esta corrección tiene un ajuste posterior o su mes de origen está abierto.');
    if (intent === 'reconcile') editor.id = undefined;
    fields = '<p class="wide">La diferencia se aplica en '+esc(chosenMonth)+' con la comisión del cierre original.</p>'+
      select('Entrenamiento del mes de origen','source',sources.map(row => [row.value,row.month+' · '+row.name+' · '+row.label]),selected)+
      input('Entrenamientos realizados realmente','count',data.actualCount ?? origin.accounted-(data.count || 0),'number','required min="0" step="1"')+
      '<p class="wide" id="correctionPreview" aria-live="polite"></p>'+
      input('Nota (opcional)','note',data.note,'text','maxlength="250"');
  }
  if (kind === 'sueltos') {
    $('editorTitle').textContent = id ? 'Editar EP' : 'Añadir EP';
    fields = trainer+input('Fecha','day',data.day || defaultDay,'date')+
      input('Nombre del socio','name',data.name,'text','required maxlength="120"')+
      '<p class="wide">Importe para nómina: '+money(data.pay ?? epRate())+'</p>';
  }
  if (kind === 'tarifas') {
    const current = ratesFor(chosenMonth);
    const euroAmount = 'min="0" max="10000" step="0.01"';
    fields = '<p class="wide">Las comisiones por hora se aplican desde el mes indicado. Los importes de fidelidad y EP se actualizan al guardar.</p>'+
      packages.map((p,i) => {
        const key = rateKeys[i];
        const bonus = state.tarifasExtra?.[key];
        return input(p+' (€/hora)',key,current ? current[key]/100 : '',
          'number','min="0" step="any"')+
          input('Prima por fidelidad '+p+' (€)','bonus-'+key,bonus == null ? '' : bonus/100,'number',euroAmount);
      }).join('')+
      input('Desde el mes','effective',chosenMonth,'month')+
      input('EP (€)','single',epRate()/100,'number','required '+euroAmount)+
      '<div class="wide">'+bonusRequirements+'</div>';
  }
  if (kind === 'equipo') fields = input('Nombre','name',data.name,'text','required maxlength="100"');
  if (kind === 'socios') fields = intent === 'close' ? input('Último día','end',day(),'date') :
    input('N.º de socio','code',data.code,'text','required maxlength="30" inputmode="numeric" pattern="[0-9]+"')+
    input('Nombre y apellidos','name',data.name,'text','required maxlength="120"')+
    trainer+select('Paquete','package',packageOptions,data.mode ? packageName(data) : undefined)+
    input('Fecha de inicio','start',data.start || day(),'date')+
    input('Fecha final (opcional)','end',data.end,'date','');
  if (kind === 'socios' && intent === 'switch') {
    $('editorTitle').textContent = 'Cambiar modalidad';
    fields = '<p class="wide">'+esc(data.name)+' · '+esc(packageName(data))+'</p>'+
      select('Nueva modalidad','package',packageOptions.filter(([p]) => p !== packageName(data)))+
      input('Primer día en la nueva modalidad','start',day(),'date')+
      '<p class="wide">La modalidad anterior finaliza el día previo al cambio.</p>';
  }
  if (kind === 'notasMensuales') {
    const savedRow = state.cierres?.find(c => c.month === chosenMonth && c.trainer === t)?.rows.find(row => row.m.id === id);
    const m = savedRow?.m || member(id);
    $('editorTitle').textContent = 'Nota del mes';
    fields = '<p class="wide">'+esc(m?.name || '')+' · '+esc(monthName(chosenMonth))+' '+esc(chosenMonth.slice(0,4))+'</p>'+
      '<label class="wide">Nota<textarea name="note" rows="5" maxlength="2000">'+esc(monthlyNote(id,chosenMonth))+'</textarea></label>';
  }
  if (kind === 'ajustes') {
    const m = member(id);
    const prior = state.ajustes.find(a => a.member === id && a.month === chosenMonth);
    const count = completedTrainings(m,prior,defaultTrainingsForMonth(m,chosenMonth));
    fields = '<p class="wide">'+esc(m.name)+' · '+esc(chosenMonth)+'<br>'+
      packageName(m)+'</p>'+
      input('Entrenamientos realizados','count',count,'number',
        'required min="0" step="'+(Number.isInteger(count) ? '1' : 'any')+'"');
    editor.month = chosenMonth;
  }
  if (kind === 'ausencias') fields = trainer+select('Tipo','type',absenceOptions,data.type)+
    input('Desde','start',data.start || defaultDay,'date')+input('Hasta','end',data.end || defaultDay,'date')+
    input('Duración parcial (minutos)','minutes',data.minutes || 60,'number','required min="1" max="1439"')+
    input('Nota (opcional)','note',data.note,'text','maxlength="250"');
  $('fields').innerHTML = fields;
  if (kind === 'ausencias') showPartial();
  if (kind === 'ajustesPrimas') showBonusPay();
  if (kind === 'correccionesNomina') showCorrectionPreview();
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

function updateHistoryButtons() {
  $('undoChange').disabled = saving || !undoHistory.length;
  $('redoChange').disabled = saving || !redoHistory.length;
  $('exportBackup').disabled = $('importBackup').disabled = saving;
}

async function persist(next, track = true) {
  if (!db || !user) throw new Error('Hace falta iniciar sesión para guardar.');
  const {data,error} = await db.from('ep_daganzo_estado')
    .update({revision:revision+1,datos:next}).eq('propietario',user.id).eq('revision',revision).select('revision');
  if (error) throw new Error('Supabase no pudo guardar el registro. Inténtalo de nuevo.');
  if (!data.length) {
    undoHistory.length = redoHistory.length = 0;
    updateHistoryButtons();
    await load();
    if ($('editor').open) $('editor').close();
    notify('Los datos cambiaron en otra sesión. Revisa la versión actual y vuelve a abrir el formulario.');
    throw new Error('Los datos cambiaron en otra sesión. Revisa la versión actual y vuelve a abrir el formulario.');
  }
  if (track) {
    redoHistory.length = 0;
    if (JSON.stringify(next.cierres || []) !== JSON.stringify(state.cierres || [])) undoHistory.length = 0;
    else if (JSON.stringify(next) !== JSON.stringify(state)) undoHistory.push(state);
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

function withoutMember(id) {
  const next = structuredClone(state);
  next.socios = next.socios.filter(m => m.id !== id);
  for (const key of ['ajustes','ajustesPrimas','notasMensuales']) {
    if (next[key]) next[key] = next[key].filter(item => item.member !== id);
  }
  if (next.sesiones) next.sesiones = next.sesiones.map(s => ({
    ...s,members:s.members.filter(memberId => memberId !== id)
  })).filter(s => s.members.length);
  return next;
}

function showBonusPay() {
  const fields = $('recordForm').elements;
  const custom = fields.bonusStatus.value === 'custom';
  fields.bonusPay.disabled = !custom;
  fields.bonusPay.closest('label').hidden = !custom;
}

function correctionPay(source,actual) {
  return Math.round(source.unitRate*actual)-source.accountedPay;
}

function validActual(source,count) {
  return Number.isSafeInteger(count) && count >= 0 && (source.key.startsWith('paquete:') || count <= 1) &&
    Number.isSafeInteger(correctionPay(source,count));
}

function showCorrectionPreview(reset = false) {
  const fields = $('recordForm').elements;
  const source = correctionSources(editor.trainer,editor.month,editor.id).find(row => row.value === fields.source.value);
  if (!source) return;
  if (reset) fields.count.value = source.accounted;
  fields.count.max = source.key.startsWith('ep:') ? '1' : '';
  const count = fields.count.valueAsNumber;
  $('correctionPreview').textContent = 'Al cerrar: '+fmt.format(source.count)+' · Ya contabilizados: '+fmt.format(source.accounted)+
    ' · Comisión original: '+hourlyMoney(source.unitRate)+
    (validActual(source,count) ? ' · Ajuste: '+signedCount(count-source.accounted)+' sesiones ('+money(correctionPay(source,count))+')' : '');
}

function change(form) {
  const {kind,id,intent,data,month} = editor;
  const next = structuredClone(state);
  const value = key => String(form.get(key) ?? '').trim();
  const trainer = value('trainer');
  const note = value('note');
  let record = {id:id || crypto.randomUUID()};
  if (kind === 'ajustesPrimas') {
    const target = editor.trainer;
    if (closedMonth(target,month)) throw new Error('Este mes ya está cerrado.');
    if (!extrasFor(target,month).some(e => e.kind === 'prima' && e.id === id)) {
      throw new Error('La prima ya no está disponible para este mes.');
    }
    const status = value('bonusStatus');
    const amount = Number(value('bonusPay'));
    if (!['auto','custom','void'].includes(status) || (status === 'custom' &&
        (!value('bonusPay') || !Number.isFinite(amount) || amount < 0 || amount > 10000))) {
      throw new Error('Introduce un importe válido.');
    }
    next.ajustesPrimas = (next.ajustesPrimas || []).filter(a => a.member !== id || a.trainer !== target || a.month !== month);
    if (status !== 'auto' || note) next.ajustesPrimas.push({member:id,trainer:target,month,status,note,
      pay:status === 'auto' ? null : status === 'void' ? 0 : Math.round(amount*100)});
    return next;
  }
  if (kind === 'cierres') {
    if (intent === 'report') {
      if (!closedMonth(id,month)) throw new Error('Este mes ya está abierto.');
      next.cierres = (next.cierres || []).filter(c => c.trainer !== id || c.month !== month);
      if (month < firstManagedMonth && !next.mesesAnterioresAbiertos?.some(m => m.trainer === id && m.month === month)) {
        next.mesesAnterioresAbiertos = [...(next.mesesAnterioresAbiertos || []),{trainer:id,month}];
      }
      return next;
    }
    if (intent !== 'closeMonth' || (month >= firstManagedMonth && !ratesFor(month))) throw new Error('Configura las comisiones del mes antes de cerrarlo.');
    if (closedMonth(id,month)) throw new Error('Este mes ya está cerrado.');
    if (bonusEntries(id,month).some(e => e.pay == null)) {
      throw new Error('Configura los importes de las primas en Opciones antes de cerrar el mes.');
    }
    const rows = closingRows(id,month).map(({m,adjustment,count,unitRate,pay}) => ({
      m:{id:m.id,name:m.name,code:m.code,trainer:m.trainer,mode:m.mode,minutes:m.minutes},
      adjustment,count,unitRate,pay
    }));
    next.cierres = [...(next.cierres || []),{month,trainer:id,trainerName:nameOf(id),rows,ratesMissing:!ratesFor(month),extras:extrasFor(id,month)}];
    if (next.mesesAnterioresAbiertos) next.mesesAnterioresAbiertos = next.mesesAnterioresAbiertos.filter(m => m.trainer !== id || m.month !== month);
    return next;
  }
  if (kind === 'correccionesNomina') {
    const target = editor.trainer;
    if (closedMonth(target,month)) throw new Error('Este mes ya está cerrado.');
    const source = correctionSources(target,month,id).find(row => row.value === value('source'));
    const actual = Number(value('count'));
    if (!source || !value('count') || !validActual(source,actual)) {
      throw new Error('Elige un registro de un cierre anterior e indica el total real de sesiones.');
    }
    Object.assign(record,{trainer:target,month,sourceMonth:source.month,sourceKey:source.key,
      name:source.name,label:source.label,originalCount:source.count,actualCount:actual,
      count:source.accounted-actual,pay:correctionPay(source,actual),note});
    next.correccionesNomina ??= [];
  }
  if (kind === 'sueltos') {
    if (!trainer || !value('name') || !value('day')) throw new Error('Completa entrenador, socio y fecha.');
    if (closedMonth(trainer,value('day').slice(0,7)) || (data.id && closedMonth(data.trainer,data.day.slice(0,7)))) {
      throw new Error('El mes de este entrenador ya está cerrado.');
    }
    const pay = data.pay ?? epRate();
    Object.assign(record,{trainer,name:value('name'),day:value('day'),pay});
    next.sueltos ??= [];
  }
  if (kind === 'tarifas') {
    const effective = value('effective');
    if (rateKeys.some(key => value(key) !== '')) {
      if (rateKeys.some(key => value(key) === '')) throw new Error('Introduce la comisión por hora de las cuatro modalidades.');
      const rates = Object.fromEntries(rateKeys.map(key => [key,Math.round(Number(value(key))*100000)/1000]));
      next.tarifas = (next.tarifas || []).filter(r => r.month !== effective);
      next.tarifas.push({month:effective,rates,perHour:true});
    } else if (ratesFor(effective)) {
      throw new Error('Introduce la comisión por hora de las cuatro modalidades.');
    }
    const bonuses = Object.fromEntries(rateKeys.map(key => {
      const bonus = value('bonus-'+key);
      return [key,bonus === '' ? null : Math.round(Number(bonus)*100)];
    }));
    next.tarifasExtra = {...bonuses,single:Math.round(Number(value('single'))*100)};
    return next;
  }
  if (kind === 'equipo') {
    if (!value('name')) throw new Error('Introduce el nombre del entrenador.');
    Object.assign(record,{name:value('name'),active:data.active ?? true});
  }
  if (kind === 'socios' && intent === 'switch') {
    const start = value('start');
    const selectedPackage = value('package');
    if (!packages.includes(selectedPackage) || selectedPackage === packageName(data)) {
      throw new Error('Selecciona otra modalidad.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || start <= data.start || data.end) throw new Error('Elige una fecha posterior al inicio de la asignación activa.');
    if (next.cierres?.some(c => c.trainer === data.trainer && c.month >= start.slice(0,7))) {
      throw new Error('El cambio afecta a un mes cerrado de este entrenador.');
    }
    if (next.sesiones?.some(s => s.members.includes(id) && s.day >= start)) {
      throw new Error('Elige una fecha posterior a las sesiones ya registradas.');
    }
    if (next.socios.some(m => m.id !== id && m.code === data.code && (!m.end || m.end >= start))) {
      throw new Error('Ya existe una asignación de este socio para esas fechas.');
    }
    if (!data.code) throw new Error('Añade el número de socio a su ficha antes de cambiar la modalidad.');
    next.socios.find(m => m.id === id).end = previousDay(start);
    next.socios.push({id:crypto.randomUUID(),code:data.code,name:data.name,trainer:data.trainer,
      mode:selectedPackage.split(' ')[0],minutes:selectedPackage.endsWith('2H') ? 480 : 240,
      start,end:'',previousAssignment:id});
    return next;
  }
  if (kind === 'socios') {
    Object.assign(record,intent === 'close' ? {...data,end:value('end')} : {
      name:value('name'),code:value('code'),trainer,mode:value('package').split(' ')[0],
      minutes:value('package').endsWith('2H') ? 480 : 240,
      start:value('start'),end:value('end')
    });
    if (data.id && packageName(record) !== packageName(data) &&
        next.cierres?.some(c => c.extras?.some(e => e.kind === 'prima' && e.id === id && e.pay > 0))) {
      throw new Error('Usa Cambiar modalidad para conservar la asignación y la prima ya pagada.');
    }
    if (data.previousAssignment) record.previousAssignment = data.previousAssignment;
    if (data.bonus != null && record.trainer === data.trainer && record.start === data.start &&
        packageName(record) === packageName(data)) record.bonus = data.bonus;
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
  if (kind === 'notasMensuales') {
    next.notasMensuales = (next.notasMensuales || []).filter(n => n.member !== id || n.month !== month);
    if (note) next.notasMensuales.push({member:id,month,text:note});
    return next;
  }
  if (kind === 'ajustes') {
    if (closedMonth(member(id).trainer,month)) throw new Error('Este mes ya está cerrado.');
    const m = member(id);
    const prior = next.ajustes.find(a => a.member === id && a.month === month);
    const count = Number(value('count'));
    if (value('count') && count === completedTrainings(m,prior,defaultTrainingsForMonth(m,month))) return next;
    if (!value('count') || !Number.isSafeInteger(count) || count < 0) {
      throw new Error('Introduce un número entero de entrenamientos, a partir de cero.');
    }
    next.ajustes = next.ajustes.filter(a => !(a.member === id && a.month === month));
    if (count !== defaultTrainingsForMonth(m,month)) next.ajustes.push({member:id,month,count});
    return next;
  }
  const index = next[kind].findIndex(r => r.id === id);
  if (index < 0) next[kind].push(record);
  else next[kind][index] = record;
  return next;
}

async function useHistory(source,destination) {
  if (saving || !source.length) return;
  const previous = state;
  saving = true;
  updateHistoryButtons();
  try {
    await persist(source.at(-1),false);
    source.pop();
    destination.push(previous);
    notify();
  } catch (error) {
    notify(error.message);
  } finally {
    saving = false;
    updateHistoryButtons();
  }
}

const backupFormat = 'gestion-de-equipo';

function readBackup(raw) {
  const backup = JSON.parse(raw);
  const data = backup?.datos;
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const string = value => typeof value === 'string';
  const iso = value => string(value) && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const month = value => string(value) && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
  const amount = value => Number.isFinite(value) && value >= 0;
  const optional = (value,check) => value == null || check(value);
  const array = (key,check,required = false) => (!required && data[key] === undefined) ||
    (Array.isArray(data[key]) && data[key].every(row => object(row) && check(row)));
  const memberRow = m => string(m.id) && string(m.name) && string(m.trainer) &&
    (m.mode === 'Duo' || m.mode === 'One') && [240,480].includes(m.minutes);
  const rates = value => object(value) && rateKeys.every(key => amount(value[key]));
  const correctionRow = e => string(e.id) && string(e.trainer) && month(e.month) &&
    month(e.sourceMonth) && e.sourceMonth < e.month && string(e.sourceKey) && string(e.name) &&
    string(e.label) && Number.isFinite(e.count) && Number.isFinite(e.pay) && optional(e.originalCount,amount) && optional(e.actualCount,amount) && string(e.note);
  const extraRow = e => object(e) && string(e.id) && iso(e.day) && string(e.name) &&
    string(e.concept) && (e.kind === 'correccion' ? correctionRow(e) : amount(e.pay) && ['prima','suelto'].includes(e.kind));
  if (backup?.format !== backupFormat || backup.version !== 1 || !object(data) ||
      !array('equipo',t => string(t.id) && string(t.name) && typeof t.active === 'boolean',true) ||
      !array('socios',m => memberRow(m) && iso(m.start) && (!m.end || iso(m.end)),true) ||
      !array('ausencias',a => string(a.id) && string(a.trainer) && iso(a.start) && iso(a.end) && amount(a.minutes),true) ||
      !array('ajustes',a => string(a.member) && month(a.month) && optional(a.count,v => Number.isSafeInteger(v) && v >= 0),true) ||
      !array('sesiones',s => Array.isArray(s.members) && s.members.every(string)) ||
      !array('tarifas',t => month(t.month) && rates(t.rates) && optional(t.perHour,v => typeof v === 'boolean')) ||
      !optional(data.tarifasExtra,v => object(v) && rateKeys.every(key => optional(v[key],amount)) && amount(v.single)) ||
      !array('correccionesNomina',correctionRow) ||
      !array('mesesAnterioresAbiertos',m => string(m.trainer) && month(m.month) && m.month < firstManagedMonth) ||
      !array('sueltos',s => string(s.id) && string(s.trainer) && iso(s.day) && string(s.name) && amount(s.pay)) ||
      !array('notasMensuales',n => string(n.member) && month(n.month) && string(n.text)) ||
      !array('ajustesPrimas',a => string(a.member) && string(a.trainer) && month(a.month) && optional(a.pay,amount)) ||
      !array('cierres',c => string(c.trainer) && month(c.month) && Array.isArray(c.rows) &&
        c.rows.every(r => object(r) && object(r.m) && memberRow(r.m) && amount(r.count) && (amount(r.pay) || (c.month < firstManagedMonth && r.pay === null))) &&
        optional(c.extras,rows => Array.isArray(rows) && rows.every(extraRow)))) {
    throw new Error('El archivo no es una copia válida de Gestión de equipo.');
  }
  return data;
}

$('undoChange').onclick = () => useHistory(undoHistory,redoHistory);
$('redoChange').onclick = () => useHistory(redoHistory,undoHistory);
$('exportBackup').onclick = () => {
  if (!state || saving) return;
  const file = new Blob([JSON.stringify({format:backupFormat,version:1,datos:state},null,2)],{type:'application/json'});
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'gestion-de-equipo-'+day()+'.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
};
$('importBackup').onclick = () => $('backupFile').click();
$('backupFile').onchange = async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file || saving) return;
  saving = true;
  updateHistoryButtons();
  try {
    const next = readBackup(await file.text());
    if (!confirm('¿Restaurar esta copia con '+next.socios.length+' fichas y '+(next.cierres?.length || 0)+
      ' cierres? Se sustituirán todos los datos actuales por los del archivo.')) return;
    await persist(next);
    notify('Copia restaurada.');
  } catch (error) {
    notify(error instanceof SyntaxError ? 'El archivo JSON no se puede leer.' : error.message);
  } finally {
    saving = false;
    updateHistoryButtons();
  }
};
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
$('currentMonth').onclick = () => {
  $('month').value = day().slice(0, 7);
  render();
};
$('month').onchange = render;
$('trainerButtons').onclick = event => {
  const choice = event.target.closest('[data-trainer]');
  if (!choice || choice.dataset.trainer === $('trainer').value) return;
  $('trainer').value = choice.dataset.trainer;
  render();
  Array.from($('trainerButtons').children).find(b => b.dataset.trainer === choice.dataset.trainer)?.focus();
};
$('deleteMember').onclick = async () => {
  if (saving || editor.kind !== 'socios' || editor.intent !== 'edit' || !editor.id) return;
  const m = member(editor.id);
  if (!m || !confirm('¿Borrar definitivamente la ficha de '+m.name+'? También se borrarán sus notas y ajustes. Los cierres guardados se conservan.')) return;
  $('formError').hidden = true;
  saving = $('save').disabled = $('deleteMember').disabled = true;
  try {
    await persist(withoutMember(m.id));
    $('editor').close();
  } catch (error) {
    $('formError').textContent = error.message;
    $('formError').hidden = false;
  } finally {
    saving = $('save').disabled = $('deleteMember').disabled = false;
    updateHistoryButtons();
  }
};
$('cancel').onclick = $('close').onclick = () => { if (!saving) $('editor').close(); };
$('editor').addEventListener('cancel', event => { if (saving) event.preventDefault(); });
$('recordForm').oninput = event => {
  if (editor.kind === 'correccionesNomina' && ['source','count'].includes(event.target.name)) showCorrectionPreview(event.target.name === 'source');
};
$('recordForm').onchange = event => {
  const field = event.target.name;
  if (editor.kind === 'ausencias' && field === 'type') showPartial();
  if (editor.kind === 'ajustesPrimas' && field === 'bonusStatus') showBonusPay();
};
$('recordForm').onsubmit = async event => {
  event.preventDefault();
  if (saving) return;
  if (editor.kind === 'cierres' && editor.intent === 'report') {
    const hasLaterCorrections = state.correccionesNomina?.some(c =>
      c.trainer === editor.id && c.sourceMonth === editor.month);
    const note = hasLaterCorrections ? '\n\nHay correcciones de este mes registrados en nóminas posteriores. Si vas a ajustar esas mismas sesiones, revisa esas correcciones para evitar contarlas dos veces.' : '';
    if (!confirm('¿Reabrir '+monthName(editor.month)+' de '+nameOf(editor.id)+' para editarlo?'+note)) return;
  }
  $('formError').hidden = true;
  saving = $('save').disabled = true;
  try {
    await persist(change(new FormData(event.currentTarget)));
    $('editor').close();
  } catch (error) {
    $('formError').textContent = error.message;
    $('formError').hidden = false;
  } finally { saving = $('save').disabled = false; updateHistoryButtons(); }
};

document.querySelector('nav').onclick = event => {
  if (!state || !event.target.dataset.page) return;
  page = event.target.dataset.page;
  render();
};
$('content').onclick = async event => {
  const sort = event.target.closest('[data-sort]');
  if (sort && page === 'socios') {
    const {sort:key} = sort.dataset;
    const headers = [...$('content').querySelectorAll('[data-sort="'+key+'"]')];
    const focusedIndex = headers.indexOf(sort);
    memberSort = {key, direction:memberSort.key === key ? -memberSort.direction : 1};
    render();
    $('content').querySelectorAll('[data-sort="'+key+'"]')[focusedIndex]?.focus();
    return;
  }
  const button = event.target.closest('[data-act]');
  if (!button || saving) return;
  const {act,kind,id} = button.dataset;
  if (act !== 'archive' && act !== 'remove') return openEditor(kind,id,act);
  const next = structuredClone(state);
  if (act === 'remove') {
    if (kind === 'sueltos') {
      const entry = state.sueltos?.find(s => s.id === id);
      if (!entry || closedMonth(entry.trainer,entry.day.slice(0,7))) return notify('El mes ya está cerrado.');
    }
    if (kind === 'correccionesNomina') {
      const entry = state.correccionesNomina?.find(c => c.id === id);
      if (!entry || closedMonth(entry.trainer,entry.month)) return notify('El mes ya está cerrado.');
    }
    if (kind === 'correccionesNomina') {
      const entry = state.correccionesNomina.find(c => c.id === id);
      if (state.correccionesNomina.some(c => c.trainer === entry.trainer && c.sourceMonth === entry.sourceMonth &&
          c.sourceKey === entry.sourceKey && c.month > entry.month)) return notify('Hay una corrección posterior para este registro.');
    }
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
  finally { saving = false; updateHistoryButtons(); }
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
