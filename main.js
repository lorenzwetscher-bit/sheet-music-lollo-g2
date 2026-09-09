import './style.css'
import { pdfToCanvases, imageToCanvas } from './pdf.js'
import { extractCutDescriptors, buildViews, processView } from './score.js'
import { saveScore, listScores, getScore, deleteScore, fileToStored, storedToFile } from './library.js'
import { G2Viewer } from './glasses.js'

const $=s=>document.querySelector(s)
document.querySelector('#app').innerHTML=`
<div class="wrap">
  <h1>Sheet Music for Even G2</h1>
  <p>Noten automatisch erkennen, 1–8 Zeilen als einen durchgehenden Ausschnitt auf der G2 anzeigen und schnell durch die Ansichten wechseln.</p>
  <div class="card">
    <div class="grid2"><label class="filebtn">📷 Foto<input id="imgInput" type="file" accept="image/*,.heic,.heif,.jfif,.webp,.gif,.bmp,.tif,.tiff,.avif" capture="environment"></label><label class="filebtn">📄 PDF<input id="pdfInput" type="file" accept="application/pdf"></label></div>
    <input id="scoreName" type="text" placeholder="Name der Noten">
    <button id="detect" class="primary" disabled>Notenzeilen erkennen</button>
    <div class="setting"><div class="settingrow"><span>Sichtbare Notenzeilen</span><strong id="rowsLabel">4</strong></div><div class="segmented eight"><button data-rows="1">1</button><button data-rows="2">2</button><button data-rows="3">3</button><button data-rows="4" class="active">4</button><button data-rows="5">5</button><button data-rows="6">6</button><button data-rows="7">7</button><button data-rows="8">8</button></div></div>
    <div class="setting"><div class="settingrow"><span>Kontrast</span><strong id="contrastValue">150</strong></div><input id="contrast" type="range" min="60" max="220" value="150"></div>
    <div class="settingrow"><label class="toggle"><input id="cutout" type="checkbox" checked> Hintergrund ausblenden</label><label class="toggle"><input id="invert" type="checkbox"> Invertieren</label></div>
    <div class="row"><button id="save" disabled>💾 Speichern</button><button id="startG2" disabled>Auf G2 anzeigen</button></div>
    <div id="status">Noch keine Datei ausgewählt.</div>
  </div>

  <div class="card" id="result" style="display:none">
    <div class="settingrow"><strong id="viewTitle">Ansicht</strong><span class="badge" id="pageBadge"></span></div>
    <div class="previewStack"><img id="preview"></div>
    <div id="dots" class="dots"></div>
    <div class="meta"><span id="counter"></span><span id="sourcePage"></span></div>
    <div class="shiftGrid">
      <div class="shiftBox"><strong>Links / rechts: <span id="cropXVal">0</span></strong><input id="cropX" type="range" min="-400" max="400" value="0"></div>
      <div class="shiftBox"><strong>Hoch / runter: <span id="cropYVal">0</span></strong><input id="cropY" type="range" min="-400" max="400" value="0"></div>
      <div class="shiftBox"><strong>Höhe: <span id="cropHVal">100</span>%</strong><input id="cropHeight" type="range" min="55" max="180" value="100"></div>
      <div class="shiftBox"><strong>Breite: <span id="cropWVal">100</span>%</strong><input id="cropWidth" type="range" min="70" max="150" value="100"></div>
    </div>
    <div class="row"><button id="resetCrop">Ausschnitt zurücksetzen</button><button id="refreshG2">G2 aktualisieren</button></div>
    <div class="row"><button id="prev">← Zurück</button><button id="next">Weiter →</button></div>
  </div>

  <div class="card"><div class="settingrow"><strong>Gespeicherte Noten</strong><span class="badge" id="libCount">0</span></div><div id="library"><p class="small">Noch nichts gespeichert.</p></div></div>
</div>`

let file=null,pages=[],descriptors=[],views=[],viewResults=[],adjustments=[],idx=0,linesPerView=4,viewer=null,currentId=null
let renderTimer=null,renderToken=0,totalPages=1
const cache=new Map()

const defaultAdj=()=>({cropX:0,cropY:0,cropHeight:100,cropWidth:100})
const defaultName=f=>(f?.name||'').replace(/\.[^.]+$/,'')
function choose(f){file=f;currentId=null;$('#detect').disabled=!f;$('#save').disabled=true;$('#startG2').disabled=true;if(f&&!$('#scoreName').value.trim())$('#scoreName').value=defaultName(f);$('#status').textContent=f?`${f.name} ausgewählt.`:'Noch keine Datei ausgewählt.'}
$('#imgInput').onchange=()=>{choose($('#imgInput').files?.[0]||null);$('#pdfInput').value=''}
$('#pdfInput').onchange=()=>{choose($('#pdfInput').files?.[0]||null);$('#imgInput').value=''}

function settings(){return {contrast:+$('#contrast').value,invert:$('#invert').checked,cutout:$('#cutout').checked}}
function keyFor(i){const a=adjustments[i]||defaultAdj(),s=settings();return `${i}|${linesPerView}|${s.contrast}|${s.invert}|${s.cutout}|${a.cropX}|${a.cropY}|${a.cropHeight}|${a.cropWidth}`}
function ensureAdjustments(){while(adjustments.length<views.length)adjustments.push(defaultAdj());if(adjustments.length>views.length)adjustments.length=views.length}
function revokeResult(r){if(r?.url)URL.revokeObjectURL(r.url)}
function clearCache(){for(const r of cache.values())revokeResult(r);cache.clear();viewResults=[]}

function rebuildViews(resetAdj=false){const old=adjustments;views=buildViews(descriptors,linesPerView,totalPages);adjustments=resetAdj?[]:old;ensureAdjustments();idx=Math.min(idx,Math.max(0,views.length-1));clearCache();showMeta()}

document.querySelectorAll('[data-rows]').forEach(b=>b.onclick=()=>{linesPerView=+b.dataset.rows;document.querySelectorAll('[data-rows]').forEach(x=>x.classList.toggle('active',x===b));$('#rowsLabel').textContent=linesPerView;rebuildViews(true);scheduleRender(true)})

async function renderView(i,{force=false}={}){
  if(!views[i])return null
  const k=keyFor(i)
  if(!force&&cache.has(k))return cache.get(k)
  const r=await processView(views[i],{...settings(),...(adjustments[i]||defaultAdj())})
  cache.set(k,r);viewResults[i]=r
  return r
}

async function renderCurrent({pushG2=true}={}){
  if(!views.length)return
  const token=++renderToken
  $('#status').textContent='Bereite Ansicht vor…'
  const r=await renderView(idx)
  if(token!==renderToken)return
  $('#preview').src=r.url;showMeta();$('#status').textContent='Ansicht bereit.'
  // Prefetch neighbors without blocking UI.
  setTimeout(()=>{if(views[idx+1])renderView(idx+1).catch(()=>{});if(views[idx-1])renderView(idx-1).catch(()=>{})},0)
  if(pushG2&&viewer){try{await viewer.requestRender()}catch(e){$('#status').textContent='G2-Verbindung fehlgeschlagen: '+(e?.message||e)}}
}
function scheduleRender(pushG2=true){clearTimeout(renderTimer);$('#contrastValue').textContent=$('#contrast').value;renderTimer=setTimeout(()=>renderCurrent({pushG2}),80)}
$('#contrast').oninput=()=>{clearCache();scheduleRender(true)}
$('#invert').onchange=()=>{clearCache();scheduleRender(true)}
$('#cutout').onchange=()=>{clearCache();scheduleRender(true)}

function showMeta(){if(!views.length)return;const v=views[idx];$('#counter').textContent=`Ansicht ${idx+1} / ${views.length}`;$('#sourcePage').textContent=`PDF/Foto-Seite ${v.pageIndex+1} / ${totalPages}`;$('#pageBadge').textContent=`${v.items.length} Zeile${v.items.length===1?'':'n'}`;$('#viewTitle').textContent=`Ansicht ${idx+1}`;$('#prev').disabled=idx===0;$('#next').disabled=idx>=views.length-1;syncCrop();renderDots()}
function renderDots(){const el=$('#dots');el.innerHTML='';if(views.length>20){el.textContent=`${idx+1} / ${views.length}`;return}views.forEach((_,i)=>{const b=document.createElement('button');b.className='dot'+(i===idx?' active':'');b.title=`Ansicht ${i+1}`;b.onclick=()=>go(i);el.appendChild(b)})}
async function go(i){if(i<0||i>=views.length)return;idx=i;showMeta();await renderCurrent({pushG2:true})}
$('#prev').onclick=()=>go(idx-1);$('#next').onclick=()=>go(idx+1)

function syncCrop(){const a=adjustments[idx]||defaultAdj();for(const [id,k] of [['cropX','cropX'],['cropY','cropY'],['cropHeight','cropHeight'],['cropWidth','cropWidth']])$('#'+id).value=a[k];$('#cropXVal').textContent=a.cropX;$('#cropYVal').textContent=a.cropY;$('#cropHVal').textContent=a.cropHeight;$('#cropWVal').textContent=a.cropWidth}
function cropChanged(){adjustments[idx]={cropX:+$('#cropX').value,cropY:+$('#cropY').value,cropHeight:+$('#cropHeight').value,cropWidth:+$('#cropWidth').value};$('#cropXVal').textContent=$('#cropX').value;$('#cropYVal').textContent=$('#cropY').value;$('#cropHVal').textContent=$('#cropHeight').value;$('#cropWVal').textContent=$('#cropWidth').value;clearCache();scheduleRender(true)}
for(const id of ['cropX','cropY','cropHeight','cropWidth'])$('#'+id).oninput=cropChanged
$('#resetCrop').onclick=()=>{adjustments[idx]=defaultAdj();syncCrop();clearCache();scheduleRender(true)}
$('#refreshG2').onclick=async()=>{if(!viewer)return $('#status').textContent='G2 zuerst verbinden.';await viewer.requestRender(true)}

async function processFile(f){$('#detect').disabled=true;$('#save').disabled=true;$('#startG2').disabled=true;$('#result').style.display='none';$('#status').textContent='Lese Datei…';try{pages=f.type==='application/pdf'?await pdfToCanvases(f):[await imageToCanvas(f)];totalPages=pages.length;descriptors=[];for(let i=0;i<pages.length;i++){ $('#status').textContent=`Erkenne Noten auf Seite ${i+1}/${pages.length}…`;descriptors.push(...extractCutDescriptors(pages[i],i)) } rebuildViews(true);if(!views.length)throw new Error('Keine Notenzeilen gefunden.');$('#result').style.display='block';$('#save').disabled=false;$('#startG2').disabled=false;await renderCurrent({pushG2:false});$('#status').textContent=`Fertig – ${views.length} Ansichten aus ${descriptors.length} erkannten Zeilen.`}catch(e){console.error(e);$('#status').textContent='Fehler: '+(e?.message||e)}finally{$('#detect').disabled=!file}}
$('#detect').onclick=()=>file&&processFile(file)

function makeId(){return globalThis.crypto?.randomUUID?.()||`score-${Date.now()}-${Math.random().toString(36).slice(2)}`}
$('#save').onclick=async()=>{if(!file||!descriptors.length)return;$('#save').disabled=true;$('#status').textContent='Speichere…';try{const name=$('#scoreName').value.trim()||defaultName(file)||'Unbenannte Noten',id=currentId||makeId(),prev=currentId?await getScore(currentId):null;const storedFile=await fileToStored(file);await saveScore({id,name,fileName:file.name,type:file.type,storedFile,createdAt:prev?.createdAt||Date.now(),updatedAt:Date.now(),settings:{...settings(),linesPerView},adjustments});currentId=id;$('#status').textContent=`„${name}“ gespeichert.`;await refreshLibrary();await viewer?.refreshLibraryIfOpen()}catch(e){console.error(e);$('#status').textContent='Speichern fehlgeschlagen: '+(e?.name==='QuotaExceededError'?'Speicherplatz der Even App ist voll. Bitte alte Noten löschen.':(e?.message||e))}finally{$('#save').disabled=false}}

async function openSaved(id){const r=await getScore(id);if(!r)return;$('#status').textContent='Öffne gespeicherte Noten…';currentId=r.id;file=r.storedFile?storedToFile(r.storedFile):r.blob;if(!file)throw new Error('Gespeicherte Datei fehlt.');$('#scoreName').value=r.name;$('#contrast').value=r.settings?.contrast??150;$('#contrastValue').textContent=$('#contrast').value;$('#invert').checked=!!r.settings?.invert;$('#cutout').checked=r.settings?.cutout!==false;linesPerView=Math.max(1,Math.min(8,r.settings?.linesPerView||r.settings?.rowsPerView||4));document.querySelectorAll('[data-rows]').forEach(x=>x.classList.toggle('active',+x.dataset.rows===linesPerView));$('#rowsLabel').textContent=linesPerView;pages=file.type==='application/pdf'?await pdfToCanvases(file):[await imageToCanvas(file)];totalPages=pages.length;descriptors=[];for(let i=0;i<pages.length;i++)descriptors.push(...extractCutDescriptors(pages[i],i));rebuildViews(true);adjustments=Array.isArray(r.adjustments)?r.adjustments.map(a=>({...defaultAdj(),...a})):[];ensureAdjustments();idx=0;$('#result').style.display='block';$('#save').disabled=false;$('#startG2').disabled=false;await renderCurrent({pushG2:false});$('#status').textContent=`„${r.name}“ geöffnet.`}
async function removeSaved(id){await deleteScore(id);if(currentId===id)currentId=null;await refreshLibrary();await viewer?.refreshLibraryIfOpen()}
async function refreshLibrary(){const rows=await listScores();$('#libCount').textContent=rows.length;const el=$('#library');if(!rows.length){el.innerHTML='<p class="small">Noch nichts gespeichert.</p>';return}el.innerHTML='';for(const r of rows){const div=document.createElement('div');div.className='libraryItem';const d=new Date(r.updatedAt||r.createdAt);div.innerHTML=`<div><div class="libname">${escapeHtml(r.name)}</div><div class="libmeta">${escapeHtml(r.fileName||'')} · ${d.toLocaleDateString()}</div></div><button class="open">Öffnen</button><button class="danger delete">Löschen</button>`;div.querySelector('.open').onclick=()=>openSaved(r.id).catch(e=>$('#status').textContent='Öffnen fehlgeschlagen: '+(e?.message||e));div.querySelector('.delete').onclick=()=>removeSaved(r.id);el.appendChild(div)}}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}

function ensureViewer(){
  if(viewer)return viewer
  viewer=new G2Viewer({
    getView:()=>viewResults[idx]||cache.get(keyFor(idx)),
    getIndex:()=>idx,
    setIndex:async v=>{idx=v;showMeta();await renderCurrent({pushG2:false})},
    getViewCount:()=>views.length,
    onStatus:msg=>$('#status').textContent=msg,
    getLibrary:()=>listScores(),
    onOpenSaved:async id=>{await openSaved(id);return viewResults[idx]||cache.get(keyFor(idx))}
  })
  return viewer
}
$('#startG2').onclick=async()=>{if(!views.length)return;try{await ensureViewer().start();$('#status').textContent='G2 verbunden – Wischen und Änderungen aktualisieren die Brille automatisch.'}catch(e){console.error(e);$('#status').textContent='G2-Verbindung fehlgeschlagen: '+(e?.message||e)}}
refreshLibrary().then(()=>ensureViewer().boot()).catch(()=>{})
