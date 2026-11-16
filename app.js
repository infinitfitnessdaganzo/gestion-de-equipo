import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { supabaseKey } from './config.js';

const db = supabaseKey && createClient('https://filakxlgdewfurlcqptk.supabase.co', supabaseKey, {
  auth: { storageKey: 'infinit-ep-auth' }
});
const $ = id => document.getElementById(id);
const day = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
const emptyState = () => ({
  equipo: [{id: 'cesar', name: 'C�sar', active: true}, {id: 'salma', name: 'Salma', active: true}],
  socios: [], sesiones: [], ausencias: [], ajustes: []
});
const titles = {
  resumen: 'Resumen mensual', socios: 'Socios y paquetes', sesiones: 'Entrenamientos',
  ausencias: 'Vacaciones y ausencias', equipo: 'Entrenadores'
};
const actions = {
  resumen: 'Registrar entrenamiento', socios: 'Asignar socio', sesiones: 'Registrar entrenamiento',
  ausencias: 'Registrar ausencia', equipo: 'A�adir entrenador'
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
const hours = minutes => fmt.format(minutes / 60) + ' h';
const date = iso => iso ? iso.split('-').reverse().join('/') : '-';
const nameOf = id => state.equipo.find(t => t.id === id)?.name ?? '-';
const member = id => state.socios.find(m => m.id === id);
const mode = value => '<span class="badge '+ value.toLowerCase() +'">'+ esc(value) +'</span>';
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
  const matches = r => !selected || r.trainer === selected;
  return {
    start, end, month, matches,
    sessions: state.sesiones.filter(s => matches(s) && s.day >= start && s.day <= end),
    absences: state.ausencias.filter(a => matches(a) && a.start <= end && a.end >= start)
  };
}

function render() {
  const selected = $('trainer').value;
  $('trainer').innerHTML = '<option value="">Todos</option>'+state.equipo.map(t => option(t.id,t.name,selected)).join('');
  $('workspace').hidden = false;
  $('title').textContent = titles[page];
  $('add').textContent = '+ ' + actions[page];
  $('add').disabled = page !== 'equipo' && !state.equipo.some(t => t.active);
  $('filters').hidden = page === 'equipo' || page === 'socios';
  document.querySelectorAll('[data-page]').forEach(b => {
    if (b.dataset.page === page) b.setAttribute('aria-current','page');
    else b.removeAttribute('aria-current');
  });
  const { start, end, month, sessions, absences, matches } = monthData();
  const sort = (a,b) => b.day.localeCompare(a.day);
  if (page === 'resumen') {
    const inMonth = state.socios.filter(m => matches(m) && m.start <= end && (!m.end || m.end >= start));
    const grouped = new Map();
    const rows = inMonth.sort((a,b) => a.name.localeCompare(b.name,'es')).map(m => {
      const attended = sessions.filter(s => s.members.includes(m.id));
      const key = m.code || m.name.toLowerCase();
      const group = grouped.get(key) || { name:m.name, code:m.code, sessions:new Map() };
      attended.forEach(s => group.sessions.set(s.id,s));
      grouped.set(key,group);
      const adjustment = state.ajustes.find(a => a.member === m.id && a.month === month);
      const planned = adjustment?.minutes ?? m.minutes;
      const balance = planned - total(attended);
      return [esc(m.name),esc(nameOf(m.trainer)),mode(m.mode),hours(planned)+(adjustment ? ' � ajuste' : ''),
        attended.length, hours(total(attended)), balance < 0 ? '+'+hours(-balance)+' extra' : hours(balance),
        action('adjust','ajustes',m.id,'Ajustar mes')];
    });
    $('content').innerHTML = '<div class="metrics">'+[
      metric('Socios con paquete',grouped.size),
      metric('Sesiones Duo',sessions.filter(s => s.mode === 'Duo').length),
      metric('Sesiones One',sessions.filter(s => s.mode === 'One').length),
      metric('Horas impartidas',hours(total(sessions))),
      metric('Horas de ausencia parcial',hours(total(absences.filter(a => a.type === 'Ausencia parcial'))))
    ].join('')+'</div>'+table('Total mensual por socio',['Socio','N.� de socio','Sesiones','Horas realizadas'],
      [...grouped.values()].map(g => [esc(g.name),esc(g.code || '-'),g.sessions.size,hours(total([...g.sessions.values()]))]),
      'No hay socios asignados para este mes.')+table('Detalle de paquetes',
      ['Socio','Entrenador','Modalidad','Paquete del mes','Sesiones','Horas realizadas','Saldo pendiente',''],rows,
      'No hay socios asignados para este mes.');
  }
  if (page === 'socios') {
    const rows = state.socios.slice().sort((a,b) => a.name.localeCompare(b.name,'es'));
    const display = m => [esc(m.name),esc(m.code || '-'),esc(nameOf(m.trainer)),mode(m.mode),hours(m.minutes),
      date(m.start),date(m.end),action('edit','socios',m.id,'Editar')+
      (!m.end ? action('close','socios',m.id,'Finalizar') : '')];
    const columns = ['Socio','N.� de socio','Entrenador','Modalidad','Paquete','Desde','Hasta',''];
    $('content').innerHTML = table('Asignaciones actuales',columns,rows.filter(m => activeAt(m,day())).map(display),'A�ade una asignaci�n para empezar.')+
      table('Historial y pr�ximas altas',columns,rows.filter(m => !activeAt(m,day())).map(display),'Todav�a no hay asignaciones en esta secci�n.');
  }
  if (page === 'sesiones') {
    $('content').innerHTML = table('Sesiones realizadas',['Fecha','Entrenador','Modalidad','Socios','Duraci�n','Nota',''],
      sessions.sort(sort).map(s => [date(s.day),esc(nameOf(s.trainer)),mode(s.mode),
        s.members.map(id => esc(member(id)?.name || '-')).join(', '),hours(s.minutes),esc(s.note || '-'),
        action('edit','sesiones',s.id,'Editar')+action('remove','sesiones',s.id,'Eliminar')]),
      'Todav�a no hay entrenamientos registrados en este mes.');
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
      metric('D�as naturales de vacaciones',daysByType('Vacaciones'))+
      metric('D�as de ausencia completa',daysByType('Ausencia completa'))+
      metric('Horas de ausencia parcial',hours(total(absences.filter(a => a.type === 'Ausencia parcial'))))+'</div>'+
      table('Registro del mes',['Entrenador','Tipo','Desde','Hasta','Duraci�n parcial','Nota',''],
        absences.sort((a,b) => b.start.localeCompare(a.start)).map(a => [esc(nameOf(a.trainer)),esc(a.type),date(a.start),date(a.end),
          a.minutes ? hours(a.minutes) : '-',esc(a.note || '-'),
          action('edit','ausencias',a.id,'Editar')+action('remove','ausencias',a.id,'Eliminar')]),
        'Todav�a no hay vacaciones ni ausencias registradas en este mes.');
  }
  if (page === 'equipo') {
    $('content').innerHTML = table('Equipo',['Entrenador','Estado','Socios actuales',''],state.equipo.map(t => [
      esc(t.name),t.active ? 'Activo' : 'Archivado',state.socios.filter(m => m.trainer === t.id && activeAt(m,day())).length,
      action('edit','equipo',t.id,'Editar')+action('archive','equipo',t.id,t.active ? 'Archivar' : 'Reactivar')
    ]),'A�ade un entrenador para empezar.');
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
const modeOptions = [['Duo','Duo'],['One','One']];
const absenceOptions = ['Vacaciones','Ausencia completa','Ausencia parcial'].map(v => [v,v]);

function openEditor(kind, id, intent) {
  const data = state[kind].find(r => r.id === id) || {};
  const t = $('trainer').value;
  const chosenMonth = $('month').value || day().slice(0,7);
  const defaultDay = day().startsWith(chosenMonth) ? day() : chosenMonth+'-01';
  const trainers = state.equipo.filter(r => r.active || r.id === data.trainer).map(r => [r.id,r.name]);
  const trainer = select('Entrenador','trainer',trainers,data.trainer || t);
  editor = {kind,id,intent,data};
  $('editorTitle').textContent = intent === 'close' ? 'Finalizar asignaci�n' : intent === 'adjust' ? 'Ajustar paquete del mes' :
    (id ? 'Editar registro' : actions[kind]);
  $('formError').hidden = true;
  let fields = '';
  if (kind === 'equipo') fields = input('Nombre','name',data.name,'text','required maxlength="100"');
  if (kind === 'socios') fields = intent === 'close' ? input('�ltimo d�a','end',day(),'date') :
    input('Nombre del socio','name',data.name,'text','required maxlength="120"')+
    input('N.� de socio (opcional)','code',data.code,'text','maxlength="30"')+
    trainer+select('Modalidad','mode',modeOptions,data.mode)+
    select('Horas al mes','minutes',[['240','4 horas'],['480','8 horas']],String(data.minutes || 240))+
    input('Fecha de inicio','start',data.start || day(),'date')+
    input('�ltimo d�a (opcional)','end',data.end,'date','');
  if (kind === 'ajustes') {
    const m = member(id);
    const prior = state.ajustes.find(a => a.member === id && a.month === chosenMonth);
    fields = '<p class="wide">'+esc(m.name)+' � '+esc(chosenMonth)+'</p>'+
      input('Horas de este mes','hours',(prior?.minutes ?? m.minutes)/60,'number','required min="0" max="744" step="any"');
    editor.month = chosenMonth;
  }
  if (kind === 'sesiones') fields = trainer+select('Modalidad','mode',modeOptions,data.mode)+
    input('Fecha','day',data.day || defaultDay,'date')+
    input('Duraci�n (minutos)','minutes',data.minutes || 60,'number','required min="1" max="1440"')+
    '<div class="wide" id="participants"></div>'+input('Nota (opcional)','note',data.note,'text','maxlength="250"');
  if (kind === 'ausencias') fields = trainer+select('Tipo','type',absenceOptions,data.type)+
    input('Desde','start',data.start || defaultDay,'date')+input('Hasta','end',data.end || defaultDay,'date')+
    input('Duraci�n parcial (minutos)','minutes',data.minutes || 60,'number','required min="1" max="1439"')+
    input('Nota (opcional)','note',data.note,'text','maxlength="250"');
  $('fields').innerHTML = fields;
  if (kind === 'sesiones') fillParticipants(data.members || []);
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

function fillParticipants(chosen) {
  const e = $('recordForm').elements;
  const matches = state.socios.filter(m => m.trainer === e.trainer.value && m.mode === e.mode.value && activeAt(m,e.day.value));
  const opts = matches.map(m => [m.id, m.name + (m.code ? ' � '+m.code : '')]);
  $('participants').innerHTML = select('Socio','first',[['','Selecciona socio'],...opts],chosen[0])+
    (e.mode.value === 'Duo' ? select('Segundo socio (opcional)','second',[['','Sin segundo socio'],...opts],chosen[1],'') : '')+
    (opts.length ? '' : '<p class="empty">No hay socios asignados para esta modalidad, entrenador y fecha.</p>');
}

async function persist(next) {
  if (!db || !user) throw new Error('Hace falta iniciar sesi�n para guardar.');
  const {data,error} = await db.from('ep_daganzo_estado')
    .update({revision:revision+1,datos:next}).eq('propietario',user.id).eq('revision',revision).select('revision');
  if (error) throw new Error('Supabase no pudo guardar el registro. Int�ntalo de nuevo.');
  if (!data.length) {
    await load();
    $('editor').close();
    notify('Los datos cambiaron en otra sesi�n. Revisa la versi�n actual y vuelve a abrir el formulario.');
    throw new Error('Los datos cambiaron en otra sesi�n. Revisa la versi�n actual y vuelve a abrir el formulario.');
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
    notify('Falta configurar la clave p�blica del proyecto Supabase.');
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
  if (kind === 'equipo') {
    if (!value('name')) throw new Error('Introduce el nombre del entrenador.');
    Object.assign(record,{name:value('name'),active:data.active ?? true});
  }
  if (kind === 'socios') {
    Object.assign(record,intent === 'close' ? {...data,end:value('end')} : {
      name:value('name'),code:value('code'),trainer,mode:value('mode'),minutes:Number(value('minutes')),
      start:value('start'),end:value('end')
    });
    if (!record.name) throw new Error('Introduce el nombre del socio.');
    if (!record.trainer) throw new Error('Selecciona un entrenador.');
    if (record.end && record.end < record.start) throw new Error('La fecha de fin debe ser igual o posterior a la de inicio.');
    const linked = next.sesiones.filter(s => s.members.includes(id));
    if (linked.some(s => !activeAt(record,s.day) || s.mode !== record.mode || s.trainer !== record.trainer)) {
      throw new Error('La asignaci�n tiene sesiones registradas. Conserva su modalidad y entrenador y usa fechas que cubran esas sesiones.');
    }
    const overlap = next.socios.some(m => m.id !== id && (record.code && m.code ? record.code === m.code :
      record.name.toLowerCase() === m.name.toLowerCase()) && (!m.end || m.end >= record.start) &&
      (!record.end || m.start <= record.end));
    if (overlap) throw new Error('Ya existe una asignaci�n de este socio para esas fechas.');
  }
  if (kind === 'sesiones') {
    const members = [value('first'),value('second')].filter(Boolean);
    if (!members.length || new Set(members).size !== members.length) throw new Error('Selecciona socios distintos.');
    Object.assign(record,{trainer,note,members,mode:value('mode'),day:value('day'),minutes:Number(value('minutes'))});
  }
  if (kind === 'ausencias') {
    if (!trainer) throw new Error('Selecciona un entrenador.');
    const type = value('type'), start = value('start');
    const partial = type === 'Ausencia parcial';
    Object.assign(record,{trainer,note,type,start,end:partial ? start : value('end'),minutes:partial ? Number(value('minutes')) : 0});
    if (record.end < start) throw new Error('La fecha final debe ser igual o posterior a la inicial.');
  }
  if (kind === 'ajustes') {
    next.ajustes = next.ajustes.filter(a => !(a.member === id && a.month === month));
    const minutes = Math.round(Number(value('hours'))*60);
    if (minutes !== member(id).minutes) next.ajustes.push({member:id,month,minutes});
    return next;
  }
  const index = next[kind].findIndex(r => r.id === id);
  if (index < 0) next[kind].push(record);
  else next[kind][index] = record;
  return next;
}

$('add').onclick = () => openEditor(page === 'resumen' ? 'sesiones' : page);
$('month').onchange = $('trainer').onchange = render;
$('cancel').onclick = $('close').onclick = () => { if (!saving) $('editor').close(); };
$('editor').addEventListener('cancel', event => { if (saving) event.preventDefault(); });
$('recordForm').onchange = event => {
  const field = event.target.name;
  if (editor.kind === 'sesiones' && ['trainer','mode','day'].includes(field)) fillParticipants([]);
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
    if (!confirm('�Eliminar este registro?')) return;
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
    if (error) throw new Error('No se pudo iniciar sesi�n. Comprueba el correo y la contrase�a.');
    form.reset();
    notify();
    await start();
  } catch (error) { notify(error.message); }
  finally { button.disabled = false; }
};
$('logout').onclick = async () => {
  const {error} = await db.auth.signOut({scope:'local'});
  if (error) return notify('No se pudo cerrar sesi�n. Int�ntalo de nuevo.');
  location.reload();
};
start().catch(error => notify(error.message));
