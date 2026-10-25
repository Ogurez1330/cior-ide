'use strict';
(() => {
const STORAGE_KEY = 'cior-ide-workspace-v1';
const el = id => document.getElementById(id);
const lang = name => { const e = name.split('.').pop().toLowerCase(); return ({js:'JavaScript',py:'Python',html:'HTML',css:'CSS',txt:'Текст'})[e] || 'Текст'; };
const kind = name => { const e = name.split('.').pop().toLowerCase(); return ['js','py','html','css'].includes(e) ? e : 'txt'; };
const iconText = name => ({js:'JS',py:'PY',html:'<>',css:'#',txt:'TXT'})[kind(name)];
const baseFiles = [
  {name:'main.js', content:`// Добро пожаловать в Cior IDE! 🚀\n// Нажми «Запустить», чтобы увидеть результат.\n\nconst greet = (name) => {\n  return \`Привет, \${name}! 👋\`;\n};\n\nconsole.log(greet('разработчик'));\n\nconst technologies = ['JavaScript', 'Python', 'HTML'];\n\ntechnologies.forEach((tech, index) => {\n  console.log(\`\${index + 1}. Изучаем \${tech}\`);\n});\n\nconsole.log('✨ Создавай что-то крутое!');`},
  {name:'index.html',content:`<!DOCTYPE html>\n<html lang="ru">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>Мой первый сайт</title>\n</head>\n<body>\n  <main class="card">\n    <span class="eyebrow">Сделано в Cior IDE</span>\n    <h1>Привет, мир! ✨</h1>\n    <p>Твой первый сайт уже работает.</p>\n    <button id="hello">Нажми на меня</button>\n  </main>\n</body>\n</html>`},
  {name:'style.css',content:`* { box-sizing: border-box; }\nbody {\n  margin: 0; min-height: 100vh; display: grid; place-items: center;\n  font-family: system-ui, sans-serif;\n  background: linear-gradient(135deg, #eee8ff, #dbeafe);\n  color: #29203d;\n}\n.card {\n  width: min(90%, 450px); padding: 46px 40px; text-align: center;\n  background: #fff; border-radius: 22px; box-shadow: 0 20px 70px #6144ac2e;\n}\n.eyebrow { color: #8b62d7; font-size: 12px; font-weight: 700; }\nh1 { font-size: 34px; margin: 16px 0 8px; }\np { color: #797389; }\nbutton { background: #885ff2; color: white; border: 0; border-radius: 9px; padding: 12px 18px; cursor: pointer; }`},
  {name:'script.js',content:`document.getElementById('hello')?.addEventListener('click', () => {
  alert('Сайт работает! 🎉');
});`},
  {name:'main.py',content:`# Python запускается в браузере через Pyodide.\n# При первом запуске потребуется подключение к интернету.\n\ndef fibonacci(n):\n    a, b = 0, 1\n    for _ in range(n):\n        print(a, end=" ")\n        a, b = b, a + b\n    print()\n\nprint("Привет из Python! 🐍")\nprint("Первые 10 чисел Фибоначчи:")\nfibonacci(10)`}
];
let state = {files:baseFiles.map(f=>({...f})), active:'main.js', opened:['main.js','index.html','main.py'], projectName:'Первый проект'};
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {const parsed=JSON.parse(raw); if(Array.isArray(parsed.files) && parsed.files.length && parsed.files.length<=40 && parsed.files.every(f=>typeof f.name==='string'&&typeof f.content==='string')) state = {...state,...parsed};}
} catch {}
if (!state.files.some(f=>f.name===state.active)) state.active=state.files[0].name;
state.opened=(Array.isArray(state.opened)?state.opened:[]).filter(n=>state.files.some(f=>f.name===n));
if (!state.opened.includes(state.active))state.opened.push(state.active);
let aiEnabled=false, activeRun=null, pyWorker=null, pyTimer=null, toastTimer=null, running=false, logCount=0, currentBottom='console';
let savedSnapshot = JSON.stringify(state.files);
const editor=el('code-input');
function current(){return state.files.find(f=>f.name===state.active);}
function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));el('save-label').textContent='Сохранено локально';el('save-label').parentElement.querySelector('.save-dot').style.background='#65d7a5';}catch{el('save-label').textContent='Хранилище переполнено';} }
function toast(message){const t=el('toast');t.textContent=message;t.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('visible'),2900);}
function showModal(title,body){el('modal-title').textContent=title;el('modal-text').textContent=body;el('modal').showModal();}
function fileMarkup(name){const b=document.createElement('span');b.className=`file-badge ${kind(name)}`;b.textContent=iconText(name);return b;}
function renderFiles(){
  const list=el('files-list');list.replaceChildren();el('files-count').textContent=state.files.length;
  state.files.forEach(f=>{
    const b=document.createElement('button');b.className='file-item'+(f.name===state.active?' active':'');b.type='button';b.title=`Открыть ${f.name} (двойной щелчок — переименовать)`;
    b.append(fileMarkup(f.name));const label=document.createElement('span');label.textContent=f.name;b.append(label);
    b.addEventListener('click',()=>setActive(f.name));b.addEventListener('dblclick',()=>renameFile(f.name));
    b.addEventListener('contextmenu',ev=>{ev.preventDefault();if(confirm(`Удалить файл ${f.name}?`))deleteFile(f.name);});
    list.append(b);
  });
}
function renderTabs(){
  const tablist=el('tabs');tablist.replaceChildren();
  state.opened.forEach(name=>{if(!state.files.some(f=>f.name===name))return;
    const b=document.createElement('button');b.className='editor-tab'+(name===state.active?' active':'');b.setAttribute('role','tab');b.setAttribute('aria-selected',String(name===state.active));b.append(fileMarkup(name));
    const label=document.createElement('span');label.textContent=name;b.append(label);
    const close=document.createElement('span');close.className='tab-close';close.textContent='×';close.title='Закрыть вкладку';close.addEventListener('click',ev=>{ev.stopPropagation();closeTab(name);});b.append(close);b.addEventListener('click',()=>setActive(name));tablist.append(b);
  });
}
function setActive(name){if(!state.files.some(f=>f.name===name))return;state.active=name;if(!state.opened.includes(name))state.opened.push(name);editor.value=current().content;editor.scrollTop=0;editor.scrollLeft=0;el('highlight').scrollTop=0;el('highlight').scrollLeft=0;updateEditor();renderFiles();renderTabs();save();}
function closeTab(name){if(state.opened.length===1){toast('Нельзя закрыть последнюю вкладку');return;}state.opened=state.opened.filter(n=>n!==name);if(state.active===name)state.active=state.opened.at(-1);setActive(state.active);}
function renameFile(oldName){const value=prompt('Новое имя файла:',oldName);if(value===null)return;const name=value.trim();if(!validName(name)){toast('Используй имя вида script.js без слешей');return;}if(state.files.some(f=>f.name===name&&f.name!==oldName)){toast('Такой файл уже существует');return;}const f=state.files.find(f=>f.name===oldName);f.name=name;state.opened=state.opened.map(n=>n===oldName?name:n);if(state.active===oldName)state.active=name;setActive(state.active);toast('Файл переименован');}
function validName(name){return /^[\wа-яА-ЯёЁ .-]{1,60}\.[a-zA-Z0-9]{1,8}$/.test(name)&&!name.startsWith('.');}
function newFile(){if(state.files.length>=40){toast('Максимум 40 файлов в демо-проекте');return;}const name=prompt('Имя нового файла (например, app.js):','new.js');if(name===null)return;const val=name.trim();if(!validName(val)){toast('Укажи имя с расширением: .js, .py, .html или .css');return;}if(state.files.some(f=>f.name===val)){toast('Файл с таким именем уже существует');return;}state.files.push({name:val,content:val.endsWith('.py')?'# Новый файл Python\n':val.endsWith('.html')?'<!DOCTYPE html>\n<html>\n<body>\n\n</body>\n</html>\n':''});setActive(val);toast('Новый файл создан');}
function deleteFile(name){if(state.files.length<=1){toast('В проекте должен остаться хотя бы один файл');return;}state.files=state.files.filter(f=>f.name!==name);state.opened=state.opened.filter(n=>n!==name);if(!state.opened.length)state.opened=[state.files[0].name];if(state.active===name)state.active=state.opened[0];setActive(state.active);toast('Файл удалён');}
function escapeHtml(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function highlight(code,type){
  const regex=type==='html'?/(<!--[^]*?-->|<\/?[a-zA-Z][^>]*>|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g:type==='css'?/(\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[\da-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw)?\b|[.#]?[\w-]+(?=\s*\{))/g:/(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|function|return|async|await|if|else|for|while|class|new|import|export|from|def|print|in|range|True|False|None|try|except|finally|pass|break|continue|lambda|throw|catch|of)\b|\b\d+(?:\.\d+)?\b|\b(?:console|log|map|forEach|length|document|querySelector)\b)/g;
  let out='',last=0,match;
  while((match=regex.exec(code))!==null){out+=escapeHtml(code.slice(last,match.index));const word=match[0];let cls='token-func';if(word.startsWith('//')||word.startsWith('/*')||word.startsWith('<!--')||(type==='py'&&word.startsWith('#')))cls='token-comment';else if(/^['"`]/.test(word))cls='token-string';else if(/^\d/.test(word)||/^#[\da-f]{3,8}$/i.test(word))cls='token-number';else if(/^</.test(word))cls='token-tag';else if(/^(const|let|var|function|return|async|await|if|else|for|while|class|new|import|export|from|def|print|in|range|True|False|None|try|except|finally|pass|break|continue|lambda|throw|catch|of)$/.test(word))cls='token-keyword';else if(type==='css')cls='token-attribute';out+=`<span class="${cls}">${escapeHtml(word)}</span>`;last=regex.lastIndex;}
  out+=escapeHtml(code.slice(last));return out+'\n';
}
function updateEditor(){const f=current();if(!f)return;const type=kind(f.name);el('highlight').innerHTML=highlight(editor.value,type);const count=editor.value.split('\n').length;el('line-numbers').textContent=Array.from({length:count},(_,i)=>i+1).join('\n');el('current-file-symbol').textContent=iconText(f.name);el('current-file-symbol').className=`current-file-icon file-badge ${type}`;el('editor-path').textContent=`src / ${f.name}`;el('crumb-file').textContent=f.name;el('ai-file-context').textContent=f.name;el('selected-language').textContent=lang(f.name);updateCursor();}
function updateCursor(){const part=editor.value.slice(0,editor.selectionStart);const lines=part.split('\n');el('cursor-position').textContent=`Строка ${lines.length}, столбец ${lines.at(-1).length+1}`;}
function onEdit(){current().content=editor.value;updateEditor();save();}
editor.addEventListener('input',onEdit);editor.addEventListener('click',updateCursor);editor.addEventListener('keyup',updateCursor);
editor.addEventListener('scroll',()=>{el('highlight').scrollTop=editor.scrollTop;el('highlight').scrollLeft=editor.scrollLeft;el('line-numbers').scrollTop=editor.scrollTop;});
editor.addEventListener('keydown',ev=>{if(ev.key==='Tab'){ev.preventDefault();const s=editor.selectionStart,e=editor.selectionEnd;editor.setRangeText('  ',s,e,'end');onEdit();}if(ev.key==='Enter'&&!ev.shiftKey){const s=editor.selectionStart;const before=editor.value.slice(0,s);const m=before.match(/(?:^|\n)([ \t]*)[^\n]*$/);const indent=m?m[1]:'';if(indent){ev.preventDefault();editor.setRangeText('\n'+indent,s,editor.selectionEnd,'end');onEdit();}}});
document.addEventListener('keydown',ev=>{if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='s'){ev.preventDefault();save();toast('Проект сохранён в браузере');}if((ev.ctrlKey||ev.metaKey)&&ev.key==='Enter'){ev.preventDefault();runCurrent();}});
function showBottom(which){currentBottom=which;document.querySelectorAll('.bottom-tab').forEach(b=>b.classList.toggle('selected',b.dataset.bottom===which));el('console').classList.toggle('hidden',which!=='console');el('preview-container').classList.toggle('hidden',which!=='preview');}
function appendLog(message,cls=''){if(logCount===0)el('console').replaceChildren();const line=document.createElement('div');line.className='console-line '+cls;const arrow=document.createElement('span');arrow.className='console-arrow';arrow.textContent=cls==='error'?'×':cls==='success'?'✓':'›';const content=document.createElement('span');content.textContent=String(message);line.append(arrow,content);el('console').append(line);el('console').scrollTop=el('console').scrollHeight;el('console-count').textContent=++logCount;}
function clearConsole(){el('console').replaceChildren();el('console-count').textContent='0';logCount=0;}
function setRunState(flag){running=flag;el('run-main').disabled=flag;el('run-main').querySelector('span').textContent=flag?'Выполняется...':'Запустить';el('editor-ready').textContent=flag?'Выполнение...':'Всё готово';}
function stopPrevious(){if(activeRun){window.removeEventListener('message',activeRun.listener);activeRun.iframe?.remove();clearTimeout(activeRun.timer);activeRun=null;}if(pyWorker){pyWorker.terminate();pyWorker=null;}clearTimeout(pyTimer);setRunState(false);}
function runJS(code){
 const frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-scripts');frame.style.cssText='width:0;height:0;position:absolute;pointer-events:none;border:0;opacity:0';document.body.append(frame);
 const token=Math.random().toString(36).slice(2);
 const runner=`<!DOCTYPE html><meta charset="utf-8"><script>\nwindow.addEventListener('message',async function(ev){if(!ev.data||ev.data.kind!=='cior-run')return;const key=ev.data.token;const report=(type,text)=>parent.postMessage({kind:'cior-output',token:key,type,text},'*');const fmt=(args)=>args.map(a=>typeof a==='string'?a: (()=>{try{return JSON.stringify(a)}catch{return String(a)}})()).join(' ');const custom={log:(...a)=>report('log',fmt(a)),info:(...a)=>report('log',fmt(a)),warn:(...a)=>report('warn',fmt(a)),error:(...a)=>report('error',fmt(a))};window.onerror=(message)=>report('error',message);window.onunhandledrejection=e=>report('error',String(e.reason));try{const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;await new AsyncFunction('console',ev.data.code)(custom);report('done','Код выполнен');}catch(e){report('error',e.stack||e.message||String(e));report('done','Выполнение завершено с ошибкой');}});\n<\/script>`;
 frame.srcdoc=runner;
 const listener=(ev)=>{if(ev.source!==frame.contentWindow||ev.data?.kind!=='cior-output'||ev.data?.token!==token)return;const d=ev.data;if(d.type==='done'){appendLog(d.text,d.text.includes('ошибкой')?'error':'success');stopPrevious();return;}appendLog(d.text,d.type==='error'?'error':d.type==='warn'?'warn':'');};
 const timer=setTimeout(()=>{appendLog('Время выполнения превысило 8 секунд — выполнение остановлено.','warn');stopPrevious();},8000);
 activeRun={iframe:frame,listener,timer};window.addEventListener('message',listener);
 frame.onload=()=>frame.contentWindow.postMessage({kind:'cior-run',token,code},'*');
}
function runPython(code){
 appendLog('Загружаем Python (Pyodide)... Первый запуск требует интернет.');
 const workerSource=`self.onmessage = async (ev) => { const code=ev.data; try { importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js'); const py=await loadPyodide({indexURL:'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/'});self.postMessage({type:'ready'});py.setStdout({batched: text=>self.postMessage({type:'log',text})});py.setStderr({batched: text=>self.postMessage({type:'error',text})});await py.runPythonAsync(code);self.postMessage({type:'done'}); }catch(e){self.postMessage({type:'error',text:String(e)});self.postMessage({type:'done',failed:true});}};`;
 const blob=new Blob([workerSource],{type:'text/javascript'});
 const url=URL.createObjectURL(blob);
 const worker=new Worker(url);URL.revokeObjectURL(url);pyWorker=worker;
 worker.onmessage=ev=>{const d=ev.data;if(d.type==='ready'){appendLog('Python загружен. Запускаем код...');clearTimeout(pyTimer);pyTimer=setTimeout(()=>{appendLog('Выполнение Python остановлено по тайм-ауту (15 секунд).','warn');stopPrevious();},15000);}if(d.type==='log')appendLog(d.text);if(d.type==='error')appendLog(d.text,'error');if(d.type==='done'){appendLog(d.failed?'Выполнение завершено с ошибкой':'Код выполнен',d.failed?'error':'success');stopPrevious();}};
 worker.onerror=()=>{appendLog('Не удалось загрузить Python. Проверь интернет-соединение и доступность CDN.','error');stopPrevious();};
 worker.postMessage(code);pyTimer=setTimeout(()=>{appendLog('Загрузка Python заняла слишком много времени. Проверь подключение к интернету.','error');stopPrevious();},90000);
}
function runHTML(){
 const html=state.files.find(f=>f.name.endsWith('.html'))?.content||'';
 const css=state.files.find(f=>f.name.endsWith('.css'))?.content||'';
 const js=state.files.find(f=>f.name==='script.js')?.content||'';
 const withCss=html.replace(/<\/head>/i,`<style>${css.replace(/<\/style/gi,'<\\/style')}</style>\n</head>`);
 const withJs=withCss.replace(/<\/body>/i,`<script>${js.replace(/<\/script/gi,'<\\/script')}<\/script>\n</body>`);
 el('preview-iframe').srcdoc=withJs;el('preview-placeholder').classList.add('hidden');showBottom('preview');toast('Предпросмотр обновлён');setRunState(false);
}
function runCurrent(){
 stopPrevious();clearConsole();const f=current();if(!f)return;
 if(kind(f.name)==='html'||kind(f.name)==='css'){runHTML();return;}
 showBottom('console');setRunState(true);
 if(kind(f.name)==='js'){runJS(f.content);}else if(kind(f.name)==='py'){runPython(f.content);}else{appendLog('Запуск поддерживается для JavaScript, Python, HTML и CSS.','warn');setRunState(false);}
}
function saveBlob(filename,content,type='text/plain;charset=utf-8'){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);}
function exportProject(){saveBlob('cior-ide-project.json',JSON.stringify({format:'cior-ide-v1',projectName:state.projectName,files:state.files},null,2),'application/json');toast('Проект экспортирован');}
async function importProject(file){
 if(!file)return;
 if(file.size>2_000_000){toast('Файл слишком большой (максимум 2 МБ)');return;}
 try{
  const parsed=JSON.parse(await file.text());
  if(parsed.format!=='cior-ide-v1'||!Array.isArray(parsed.files)||parsed.files.length<1||parsed.files.length>40)throw Error();
  if(parsed.files.some(f=>!f||typeof f.name!=='string'||!validName(f.name)||typeof f.content!=='string'||f.content.length>200000))throw Error();
  const names=parsed.files.map(f=>f.name);if(new Set(names).size!==names.length)throw Error();
  if(!confirm('Заменить текущие файлы импортированным проектом?'))return;
  state.files=parsed.files.map(f=>({name:f.name,content:f.content}));
  state.projectName=String(parsed.projectName||'Импортированный проект').slice(0,50);
  el('project-title').textContent=state.projectName;
  el('folder-title').textContent=state.projectName.toUpperCase();
  state.opened=[state.files[0].name];setActive(state.files[0].name);toast('Проект импортирован');
 }catch{toast('Недопустимый формат проекта');}
 finally{el('project-input').value='';}
}
function addChat(role,message){const history=el('chat-history');const wrapper=document.createElement('div');wrapper.className=`chat-message ${role}`;if(role==='assistant'){const icon=document.createElement('div');icon.className='chat-face';icon.innerHTML='<svg class="icon"><use href="#i-sparkle"/></svg>';wrapper.append(icon);}const bubble=document.createElement('div');bubble.className='chat-bubble';bubble.textContent=message;wrapper.append(bubble);history.append(wrapper);el('chat-scroll').scrollTop=el('chat-scroll').scrollHeight;return wrapper;}
function localHelp(question){const t=kind(current().name);let suggestions=`Открой ${current().name}, изучи код и запусти его кнопкой «Запустить». Для настоящих ответов ИИ добавь OPENAI_API_KEY на сервере.`;if(/ошиб|провер/i.test(question)){suggestions=t==='js'?'Локальная подсказка (не ИИ): проверь скобки, имена переменных и сообщения в консоли.':t==='py'?'Локальная подсказка (не ИИ): проверь отступы, двоеточия и текст ошибки в консоли.':'Локальная подсказка (не ИИ): проверь закрывающие теги и названия классов в HTML/CSS.';}else if(/объяс/i.test(question)){suggestions=t==='js'?'Локальная подсказка (не ИИ): JavaScript выполняет инструкции сверху вниз. console.log выводит значения в консоль, а function/стрелочные функции позволяют переиспользовать код.':t==='py'?'Локальная подсказка (не ИИ): Python использует отступы для обозначения блоков. def создаёт функцию, print выводит результат.':'Локальная подсказка (не ИИ): HTML описывает структуру страницы, CSS отвечает за оформление.';}else if(/улучш/i.test(question)){suggestions='Локальная подсказка (не ИИ): используй понятные имена, короткие функции, комментарии только там, где они помогают, и проверяй крайние случаи.';}return 'ИИ-помощник пока не подключён.\n\n'+suggestions;}
async function sendChat(question){if(!question||runningChat)return;addChat('user',question);el('chat-input').value='';el('send-chat').disabled=true;runningChat=true;
 const wait=addChat('assistant','Думаю над ответом...');
 try {let response;if(!aiEnabled){response=localHelp(question);}else{const r=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,code:current().content,language:lang(current().name)})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Ошибка ИИ');response=data.answer;}
  wait.querySelector('.chat-bubble').textContent=response;
 }catch(err){wait.querySelector('.chat-bubble').textContent='Не удалось получить ответ: '+err.message;}
 finally{runningChat=false;el('send-chat').disabled=false;el('chat-scroll').scrollTop=el('chat-scroll').scrollHeight;}
}
let runningChat=false;
async function checkAI(){try{const r=await fetch('/api/health');const data=await r.json();aiEnabled=Boolean(data.aiEnabled);}catch{aiEnabled=false;}el('ai-dot').classList.toggle('active',aiEnabled);el('ai-status').textContent=aiEnabled?'ИИ подключён · готов к работе':'Демо-режим · ИИ не подключён';}
function info(){showModal('Cior IDE — учебный MVP','Работает без установки библиотек: JavaScript запускается в изолированном iframe, HTML/CSS — в предпросмотре, Python — через Pyodide (нужен интернет). Файлы хранятся в localStorage этого браузера.\n\nДля настоящих ответов Cior AI запусти сервер с переменной окружения OPENAI_API_KEY. Никогда не вставляй секретный API-ключ в код браузера.\n\nЭто прототип, а не защищённая облачная платформа для выполнения произвольного кода на сервере.');}
// Bind controls
el('new-file').addEventListener('click',newFile);
el('export-project').addEventListener('click',exportProject);
el('import-project').addEventListener('click',()=>el('project-input').click());
el('project-input').addEventListener('change',ev=>importProject(ev.target.files?.[0]));
el('download-file').addEventListener('click',()=>{saveBlob(current().name,current().content);toast('Файл скачан');});
el('copy-code').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(editor.value);toast('Код скопирован');}catch{editor.select();document.execCommand('copy');toast('Код скопирован');}});
el('run-main').addEventListener('click',runCurrent);el('rerun').addEventListener('click',runCurrent);
el('clear-console').addEventListener('click',clearConsole);
document.querySelectorAll('[data-bottom]').forEach(b=>b.addEventListener('click',()=>showBottom(b.dataset.bottom)));
el('settings-button').addEventListener('click',info);el('guide-explain').addEventListener('click',info);el('ai-info').addEventListener('click',info);
document.querySelectorAll('[data-prompt]').forEach(b=>b.addEventListener('click',()=>sendChat(b.dataset.prompt)));
el('chat-form').addEventListener('submit',ev=>{ev.preventDefault();sendChat(el('chat-input').value.trim());});
el('chat-input').addEventListener('keydown',ev=>{if(ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();el('chat-form').requestSubmit();}});
el('toggle-sidebar').addEventListener('click',()=>{el('left-sidebar').classList.toggle('open');el('ai-sidebar').classList.remove('open');});
el('open-ai').addEventListener('click',()=>{el('ai-sidebar').classList.add('open');el('left-sidebar').classList.remove('open');});
el('close-ai').addEventListener('click',()=>el('ai-sidebar').classList.remove('open'));
// Expose only safe test telemetry.
window.CiorIDE = {getState:()=>JSON.parse(JSON.stringify(state)),run:runCurrent};
el('project-title').textContent=state.projectName;el('folder-title').textContent=state.projectName.toUpperCase();setActive(state.active);checkAI();
})();
