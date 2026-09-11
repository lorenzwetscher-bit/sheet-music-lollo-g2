import './style.css'
import { pdfToCanvases, imageToCanvas, isPdfFile } from './pdf.js'
import { extractCutDescriptors, buildViews, processView } from './score.js'
import { saveScore, listScores, getScore, deleteScore, fileToStored, storedToFile, listFolders, createFolder, moveScoreToFolder } from './library.js'
import { G2Viewer } from './glasses.js'
import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'

const $=s=>document.querySelector(s)
document.querySelector('#app').innerHTML=`
<div class="wrap">
  <h1>Sheet Music for Even G2</h1>
  <p>Noten automatisch erkennen, 1–8 Zeilen als einen durchgehenden Ausschnitt auf der G2 anzeigen und schnell durch die Ansichten wechseln.</p>
  <div class="card">
    <div class="grid3"><button id="cameraBtn" class="filebtn" type="button">📷 Foto</button><button id="albumBtn" class="filebtn" type="button">🖼️ Galerie</button><label class="filebtn">📄 PDF<input id="pdfInput" type="file" accept="application/pdf"></label></div>
    <input id="imgFallback" class="hiddenFileInput" type="file" accept="image/*,.heic,.heif,.jfif,.webp,.gif,.bmp,.tif,.tiff,.avif">
    <input id="cameraFallback" class="hiddenFileInput" type="file" accept="image/*" capture="environment">
    <input id="scoreName" type="text" placeholder="Name der Noten">
    <button id="detect" class="primary" disabled>Notenzeilen erkennen</button>
    <div class="setting"><div class="settingrow"><span>Sichtbare Notenzeilen</span><strong id="rowsLabel">4</strong></div><div class="segmented eight"><button data-rows="1">1</button><button data-rows="2">2</button><button data-rows="3">3</button><button data-rows="4" class="active">4</button><button data-rows="5">5</button><button data-rows="6">6</button><button data-rows="7">7</button><button data-rows="8">8</button></div></div>
    <div class="setting"><div class="settingrow"><span>Kontrast</span><strong id="contrastValue">150</strong></div><input id="contrast" type="range" min="60" max="220" value="150"></div>
    <div class="settingrow"><label class="toggle"><input id="cutout" type="checkbox" checked> Hintergrund ausblenden</label><label class="toggle"><input id="invert" type="checkbox"> Invertieren</label></div>
    <div class="setting"><div class="settingrow"><span>Ordner beim Speichern</span></div><select id="saveFolder"><option value="">Kein Ordner</option></select></div>
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

  <div class="card"><div class="settingrow"><strong>Gespeicherte Noten</strong><span class="badge" id="libCount">0</span></div><div class="folderCreate"><input id="folderName" type="text" placeholder="Neuen Ordner erstellen"><button id="createFolder" type="button">Ordner erstellen</button></div><div id="library"><p class="small">Noch nichts gespeichert.</p></div></div>
</div>`

let file=null,pages=[],descriptors=[],views=[],viewResults=[],adjustments=[],idx=0,linesPerView=4,viewer=null,currentId=null
let renderTimer=null,renderToken=0,totalPages=1
const cache=new Map()
let prefetchQueue=[],prefetchBusy=false,prefetchGeneration=0

const defaultAdj=()=>({cropX:0,cropY:0,cropHeight:100,cropWidth:100})
const defaultName=f=>(f?.name||'').replace(/\.[^.]+$/,'')
function choose(f){file=f;currentId=null;$('#detect').disabled=!f;$('#save').disabled=true;$('#startG2').disabled=true;if(f&&!$('#scoreName').value.trim())$('#scoreName').value=defaultName(f);$('#status').textContent=f?`${f.name} ausgewählt.`:'Noch keine Datei ausgewählt.'}
function base64ToFile(asset){
  if(!asset?.base64)return null
  const mime=asset.mimeType||'image/jpeg'
  const raw=asset.base64.includes(',')?asset.base64.split(',').pop():asset.base64
  const bytes=Uint8Array.from(atob(raw),c=>c.charCodeAt(0))
  return new File([bytes],asset.name||`photo-${Date.now()}.jpg`,{type:mime})
}
async function pickEvenImage(kind){
  try{
    const bridge=await waitForEvenAppBridge()
    const asset=kind==='camera'?await bridge.captureImageFromCamera():await bridge.pickImageFromAlbum()
    if(!asset)return
    const picked=base64ToFile(asset)
    if(!picked)throw new Error('Das Bild konnte nicht aus der Even App übernommen werden.')
    choose(picked);$('#pdfInput').value=''
  }catch(e){
    console.warn(`Even ${kind} picker unavailable, using browser fallback`,e)
    const fallback=kind==='camera'?$('#cameraFallback'):$('#imgFallback')
    fallback.value='';fallback.click()
  }
}
$('#cameraBtn').onclick=()=>pickEvenImage('camera')
$('#albumBtn').onclick=()=>pickEvenImage('album')
$('#imgFallback').onchange=()=>{choose($('#imgFallback').files?.[0]||null);$('#pdfInput').value=''}
$('#cameraFallback').onchange=()=>{choose($('#cameraFallback').files?.[0]||null);$('#pdfInput').value=''}
$('#pdfInput').onchange=()=>{choose($('#pdfInput').files?.[0]||null);$('#imgFallback').value='';$('#cameraFallback').value=''}

function settings(){return {contrast:+$('#contrast').value,invert:$('#invert').checked,cutout:$('#cutout').checked}}
function keyFor(i){const a=adjustments[i]||defaultAdj(),s=settings();return `${i}|${linesPerView}|${s.contrast}|${s.invert}|${s.cutout}|${a.cropX}|${a.cropY}|${a.cropHeight}|${a.cropWidth}`}
function ensureAdjustments(){while(adjustments.length<views.length)adjustments.push(defaultAdj());if(adjustments.length>views.length)adjustments.length=views.length}
function revokeResult(r){if(r?.url)URL.revokeObjectURL(r.url)}
function clearCache(){prefetchGeneration++;prefetchQueue=[];for(const r of cache.values())revokeResult(r);cache.clear();viewResults=[]}

function rebuildViews(resetAdj=false){const old=adjustments;views=buildViews(descriptors,linesPerView,totalPages);adjustments=resetAdj?[]:old;ensureAdjustments();idx=Math.min(idx,Math.max(0,views.length-1));clearCache();showMeta()}

document.querySelectorAll('[data-rows]').forEach(b=>b.onclick=()=>{
  const anchor=views[idx]?.items?.[0]
  linesPerView=+b.dataset.rows
  document.querySelectorAll('[data-rows]').forEach(x=>x.classList.toggle('active',x===b));$('#rowsLabel').textContent=linesPerView
  rebuildViews(true)
  if(anchor){const keep=views.findIndex(v=>v.items?.some(it=>it.pageIndex===anchor.pageIndex&&it.lineIndex===anchor.lineIndex));if(keep>=0)idx=keep}
  showMeta();scheduleRender(true)
})

async function ensurePreviewUrl(r){
  if(!r?.canvas)return null
  if(r.url)return r.url
  const blob=await new Promise((resolve,reject)=>r.canvas.toBlob(b=>b?resolve(b):reject(new Error('Vorschau konnte nicht erzeugt werden.')),'image/png'))
  r.url=URL.createObjectURL(blob);return r.url
}

async function renderView(i,{force=false,preview=true}={}){
  if(!views[i])return null
  const k=keyFor(i)
  if(!force&&cache.has(k)){const hit=cache.get(k);if(preview&&!hit.url)await ensurePreviewUrl(hit);viewResults[i]=hit;return hit}
  const r=await processView(views[i],{...settings(),...(adjustments[i]||defaultAdj())},preview)
  cache.set(k,r);viewResults[i]=r
  return r
}

function queuePrefetch(center=idx){
  const gen=++prefetchGeneration
  const order=[]
  // Nearest pages first: these are the ones a musician is most likely to request next.
  for(let d=1;d<=4;d++){if(center+d<views.length)order.push(center+d);if(center-d>=0)order.push(center-d)}
  // Then prepare the rest in the background so a longer performance stays instant.
  for(let i=0;i<views.length;i++)if(i!==center&&!order.includes(i))order.push(i)
  prefetchQueue=order.map(i=>({i,gen}))
  runPrefetchQueue().catch(()=>{})
}

async function runPrefetchQueue(){
  if(prefetchBusy)return;prefetchBusy=true
  try{
    while(prefetchQueue.length){
      const job=prefetchQueue.shift();if(!job||job.gen!==prefetchGeneration)continue
      try{await renderView(job.i,{preview:false})}catch(e){console.warn('Prefetch fehlgeschlagen',job.i,e)}
      // Yield so UI/input is never blocked by background preparation.
      await new Promise(r=>setTimeout(r,0))
    }
  }finally{prefetchBusy=false}
}

async function renderCurrent({pushG2=true}={}){
  if(!views.length)return
  const token=++renderToken
  $('#status').textContent='Bereite Ansicht vor…'
  const r=await renderView(idx,{preview:true})
  if(token!==renderToken)return
  $('#preview').src=r.url;showMeta();$('#status').textContent='Ansicht bereit.'
  setTimeout(()=>queuePrefetch(idx),0)
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

async function loadSelectedFile(f){
  if(await isPdfFile(f))return await pdfToCanvases(f)
  return [await imageToCanvas(f)]
}


async function processFile(f){$('#detect').disabled=true;$('#save').disabled=true;$('#startG2').disabled=true;$('#result').style.display='none';$('#status').textContent='Lese Datei…';try{pages=await loadSelectedFile(f);totalPages=pages.length;descriptors=[];for(let i=0;i<pages.length;i++){ $('#status').textContent=`Erkenne Noten auf Seite ${i+1}/${pages.length}…`;descriptors.push(...extractCutDescriptors(pages[i],i)) } rebuildViews(true);if(!views.length)throw new Error('Keine Notenzeilen gefunden.');$('#result').style.display='block';$('#save').disabled=false;$('#startG2').disabled=false;await renderCurrent({pushG2:false});$('#status').textContent=`Fertig – ${views.length} Ansichten aus ${descriptors.length} erkannten Zeilen.`}catch(e){console.error(e);$('#status').textContent='Fehler: '+(e?.message||e)}finally{$('#detect').disabled=!file}}
$('#detect').onclick=()=>file&&processFile(file)

function makeId(){return globalThis.crypto?.randomUUID?.()||`score-${Date.now()}-${Math.random().toString(36).slice(2)}`}
$('#save').onclick=async()=>{if(!file||!descriptors.length)return;$('#save').disabled=true;$('#status').textContent='Speichere…';try{const name=$('#scoreName').value.trim()||defaultName(file)||'Unbenannte Noten',id=currentId||makeId(),prev=currentId?await getScore(currentId):null;const storedFile=await fileToStored(file);await saveScore({id,name,fileName:file.name,type:file.type,storedFile,createdAt:prev?.createdAt||Date.now(),updatedAt:Date.now(),settings:{...settings(),linesPerView},adjustments,folderId:$('#saveFolder').value||null});currentId=id;$('#status').textContent=`„${name}“ gespeichert.`;await refreshLibrary();await viewer?.refreshLibraryIfOpen()}catch(e){console.error(e);$('#status').textContent='Speichern fehlgeschlagen: '+(e?.name==='QuotaExceededError'?'Speicherplatz der Even App ist voll. Bitte alte Noten löschen.':(e?.message||e))}finally{$('#save').disabled=false}}

async function openSaved(id){const r=await getScore(id);if(!r)return;$('#status').textContent='Öffne gespeicherte Noten…';currentId=r.id;file=r.storedFile?storedToFile(r.storedFile):r.blob;if(!file)throw new Error('Gespeicherte Datei fehlt.');$('#scoreName').value=r.name;$('#contrast').value=r.settings?.contrast??150;$('#contrastValue').textContent=$('#contrast').value;$('#invert').checked=!!r.settings?.invert;$('#cutout').checked=r.settings?.cutout!==false;linesPerView=Math.max(1,Math.min(8,r.settings?.linesPerView||r.settings?.rowsPerView||4));document.querySelectorAll('[data-rows]').forEach(x=>x.classList.toggle('active',+x.dataset.rows===linesPerView));$('#rowsLabel').textContent=linesPerView;await refreshFolderOptions(r.folderId||'');pages=await loadSelectedFile(file);totalPages=pages.length;descriptors=[];for(let i=0;i<pages.length;i++)descriptors.push(...extractCutDescriptors(pages[i],i));rebuildViews(true);adjustments=Array.isArray(r.adjustments)?r.adjustments.map(a=>({...defaultAdj(),...a})):[];ensureAdjustments();idx=0;$('#result').style.display='block';$('#save').disabled=false;$('#startG2').disabled=false;await renderCurrent({pushG2:false});$('#status').textContent=`„${r.name}“ geöffnet.`}
async function removeSaved(id){await deleteScore(id);if(currentId===id)currentId=null;await refreshLibrary();await viewer?.refreshLibraryIfOpen()}
async function refreshFolderOptions(selected=''){
  const folders=await listFolders(),sel=$('#saveFolder');sel.innerHTML='<option value="">Kein Ordner</option>'
  for(const f of folders){const o=document.createElement('option');o.value=f.id;o.textContent=f.name;sel.appendChild(o)}
  sel.value=folders.some(f=>f.id===selected)?selected:''
  return folders
}
async function refreshLibrary(){
  const [rows,folders]=await Promise.all([listScores(),refreshFolderOptions($('#saveFolder')?.value||'')]);$('#libCount').textContent=rows.length
  const el=$('#library');el.innerHTML=''
  if(!folders.length&&!rows.length){el.innerHTML='<p class="small">Noch nichts gespeichert.</p>';return}
  for(const f of folders){const h=document.createElement('div');h.className='folderHeader';h.textContent='📁 '+f.name;el.appendChild(h);for(const r of rows.filter(x=>x.folderId===f.id))el.appendChild(makeLibraryRow(r,folders))}
  const loose=rows.filter(r=>!r.folderId||!folders.some(f=>f.id===r.folderId));if(loose.length){const h=document.createElement('div');h.className='folderHeader';h.textContent='Ohne Ordner';el.appendChild(h);for(const r of loose)el.appendChild(makeLibraryRow(r,folders))}
}
function makeLibraryRow(r,folders){
  const div=document.createElement('div');div.className='libraryItem';const d=new Date(r.updatedAt||r.createdAt)
  div.innerHTML=`<div><div class="libname">${escapeHtml(r.name)}</div><div class="libmeta">${escapeHtml(r.fileName||'')} · ${d.toLocaleDateString()}</div></div><select class="move"><option value="">Kein Ordner</option>${folders.map(f=>`<option value="${escapeHtml(f.id)}" ${r.folderId===f.id?'selected':''}>${escapeHtml(f.name)}</option>`).join('')}</select><button class="open">Öffnen</button><button class="danger delete">Löschen</button>`
  div.querySelector('.open').onclick=()=>openSaved(r.id).catch(e=>$('#status').textContent='Öffnen fehlgeschlagen: '+(e?.message||e))
  div.querySelector('.delete').onclick=()=>removeSaved(r.id)
  div.querySelector('.move').onchange=async e=>{await moveScoreToFolder(r.id,e.target.value||null);$('#status').textContent='Noten verschoben.';await refreshLibrary();await viewer?.refreshLibraryIfOpen()}
  return div
}
$('#createFolder').onclick=async()=>{try{const f=await createFolder($('#folderName').value);$('#folderName').value='';await refreshLibrary();$('#saveFolder').value=f.id;$('#status').textContent=`Ordner „${f.name}“ erstellt.`;await viewer?.refreshLibraryIfOpen()}catch(e){$('#status').textContent='Ordner konnte nicht erstellt werden: '+(e?.message||e)}}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}

function ensureViewer(){
  if(viewer)return viewer
  viewer=new G2Viewer({
    getView:()=>viewResults[idx]||cache.get(keyFor(idx)),
    getIndex:()=>idx,
    setIndex:async v=>{
      idx=v;showMeta()
      // G2 page turns get priority: prepare raw G2 pixels first and update the
      // phone preview afterwards so preview PNG creation cannot slow the glasses.
      await renderView(idx,{preview:false})
      setTimeout(async()=>{try{const r=await renderView(idx,{preview:true});if(r?.url)$('#preview').src=r.url}catch{}},0)
    },
    getViewCount:()=>views.length,
    onStatus:msg=>$('#status').textContent=msg,
    getLibrary:async()=>({scores:await listScores(),folders:await listFolders()}),
    onOpenSaved:async id=>{await openSaved(id);return viewResults[idx]||cache.get(keyFor(idx))},
    onPrefetch:center=>queuePrefetch(center)
  })
  return viewer
}
$('#startG2').onclick=async()=>{if(!views.length)return;try{await ensureViewer().start();$('#status').textContent='G2 verbunden – Wischen und Änderungen aktualisieren die Brille automatisch.'}catch(e){console.error(e);$('#status').textContent='G2-Verbindung fehlgeschlagen: '+(e?.message||e)}}
refreshLibrary().then(()=>ensureViewer().boot()).catch(e=>{console.error(e);$('#status').textContent='G2-Start fehlgeschlagen: '+(e?.message||e)})
