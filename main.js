import './style.css'
import { pdfToCanvases, imageToCanvas, isPdfFile } from './pdf.js'
import { extractCutDescriptors, buildViews, processView, processScrollFrame } from './score.js'
import { saveScore, listScores, getScore, deleteScore, fileToStored, storedToFile, listFolders, createFolder, renameFolder, deleteFolder, moveScoreToFolder } from './library.js'
import { G2Viewer } from './glasses.js'
import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'

const $=s=>document.querySelector(s)

const openLibraryFolders=new Set()
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
    <div class="setting autoScrollBox">
      <div class="settingrow"><span>Scrollen</span><label class="toggle"><input id="scrollEnabled" type="checkbox"> Ein</label></div>
      <div class="settingrow"><label><input type="radio" name="scrollMode" value="time" checked> Nach Zeit</label><label><input type="radio" name="scrollMode" value="finger"> Fingerscrollen an der Brille</label></div>
      <div class="settingrow"><span>Zeit bis Notenende</span><strong id="scrollDurationLabel">3:00</strong></div>
      <div class="durationGrid"><label>Minuten<input id="scrollMinutes" type="number" min="0" max="60" value="3"></label><label>Sekunden<input id="scrollSeconds" type="number" min="0" max="59" value="0"></label></div>
      <div id="scrollCalc" class="small">Dauer bis Notenende: 3:00</div>
      <button id="autoScrollBtn" type="button" disabled>▶ Auto-Scroll bis Notenende</button>
    </div>
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
let autoScrollRun=0,autoScrollActive=false
const cache=new Map()
let prefetchQueue=[],prefetchBusy=false,prefetchGeneration=0
const fingerFrameCache=new Map();let fingerPrefetchToken=0

const defaultAdj=()=>({cropX:0,cropY:0,cropHeight:100,cropWidth:100})
const defaultName=f=>(f?.name||'').replace(/\.[^.]+$/,'')
function choose(f){file=f;currentId=null;fingerScrollProgress=0;fingerScrollPage=-1;$('#detect').disabled=!f;$('#save').disabled=true;$('#startG2').disabled=true;if(f&&!$('#scoreName').value.trim())$('#scoreName').value=defaultName(f);$('#status').textContent=f?`${f.name} ausgewählt.`:'Noch keine Datei ausgewählt.'}

function scrollDurationSeconds(){
  const m=Math.max(0,Math.min(60,Number($('#scrollMinutes')?.value)||0)),s=Math.max(0,Math.min(59,Number($('#scrollSeconds')?.value)||0))
  return Math.max(10,m*60+s)
}
function formatTime(sec){sec=Math.max(0,Math.round(sec));return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`}
function median(nums){if(!nums.length)return 0;const a=[...nums].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function pageContentBounds(pageIndex,source){
  const items=descriptors.filter(d=>d.pageIndex===pageIndex)
  if(!items.length)return {left:Math.round(source.width*.03),right:Math.round(source.width*.97),top:Math.round(source.height*.03),bottom:Math.round(source.height*.97)}
  const padX=Math.max(4,Math.round(source.width*.012)),padY=Math.max(4,Math.round(source.height*.008))
  return {
    left:Math.max(0,Math.min(...items.map(x=>x.bounds.left))-padX),
    right:Math.min(source.width-1,Math.max(...items.map(x=>x.bounds.right))+padX),
    top:Math.max(0,Math.min(...items.map(x=>x.bounds.top))-padY),
    bottom:Math.min(source.height-1,Math.max(...items.map(x=>x.bounds.bottom))+padY)
  }
}
function buildScrollPlan(){
  // True document scrolling: use the complete rendered PDF/photo pages instead of
  // hopping between detected staff-group views. At page end the next source page
  // becomes the next segment automatically.
  if(!pages.length)return null
  const currentPage=views[idx]?.pageIndex??0
  const segments=[]
  for(let pageIndex=currentPage;pageIndex<pages.length;pageIndex++){
    const source=pages[pageIndex];if(!source)continue
    const b=pageContentBounds(pageIndex,source)
    const contentW=Math.max(1,b.right-b.left+1),contentH=Math.max(1,b.bottom-b.top+1)
    // G2 aspect is 2:1, therefore a full-width crop needs half that width in source pixels.
    // This preserves the score's proportions while allowing the PDF page to scroll vertically.
    let viewportH=Math.round(contentW*288/576)
    viewportH=Math.max(50,Math.min(contentH,viewportH))
    let y0=b.top
    // If finger/auto scroll starts from a view already lower on the first page, start there.
    if(pageIndex===currentPage&&views[idx]?.items?.length)y0=Math.max(y0,Math.min(...views[idx].items.map(x=>x.bounds.top)))
    const y1=Math.max(y0,b.bottom-viewportH+1)
    const distance=Math.max(0,y1-y0)
    segments.push({pageIndex,source,left:b.left,right:b.right,y0,y1,viewportH,distance,weight:Math.max(1,distance)})
  }
  if(!segments.length)return null
  let totalWeight=0
  for(const seg of segments){seg.from=totalWeight;totalWeight+=seg.weight;seg.to=totalWeight}
  return {segments,totalWeight,totalPixels:segments.reduce((n,s)=>n+s.distance,0)}
}
function scrollSpecAt(plan,progress){
  const unit=Math.max(0,Math.min(1,progress))*plan.totalWeight
  let seg=plan.segments[plan.segments.length-1]
  for(const s of plan.segments){if(unit<s.to||s===plan.segments[plan.segments.length-1]){seg=s;break}}
  const local=seg.weight?Math.max(0,Math.min(1,(unit-seg.from)/seg.weight)):1
  const y=Math.round(seg.y0+(seg.y1-seg.y0)*local)
  return {source:seg.source,left:seg.left,right:seg.right,top:y,height:seg.viewportH,pageIndex:seg.pageIndex}
}
function updateScrollCalc(){
  const sec=scrollDurationSeconds(),plan=buildScrollPlan(),label=$('#scrollDurationLabel'),info=$('#scrollCalc')
  if(label)label.textContent=formatTime(sec)
  if(!info)return
  if(!plan){info.textContent=`Dauer bis Notenende: ${formatTime(sec)} · startet ab aktueller Ansicht`;return}
  const pxs=plan.totalPixels/sec,step=pxs*.9
  info.textContent=`Bis Notenende: ${formatTime(sec)} · ca. ${pxs.toFixed(1)} px/s · ${step.toFixed(1)} px je ~0,9 s`
}
function stopAutoScroll(message='Auto-Scroll gestoppt.'){
  if(!autoScrollActive)return
  autoScrollActive=false;autoScrollRun++;viewer?.setAutoScrolling?.(false)
  const b=$('#autoScrollBtn');if(b)b.textContent='▶ Auto-Scroll bis Notenende'
  if(message)$('#status').textContent=message
}
async function startAutoScroll(){
  if(!$('#scrollEnabled').checked)return $('#status').textContent='Scrollen ist ausgeschaltet.'
  if(document.querySelector('input[name="scrollMode"]:checked')?.value!=='time')return $('#status').textContent='Für Auto-Scroll bitte „Nach Zeit“ auswählen.'
  if(autoScrollActive){stopAutoScroll();return}
  if(!views.length)return $('#status').textContent='Bitte zuerst Notenzeilen erkennen.'
  const plan=buildScrollPlan();if(!plan)return $('#status').textContent='Auto-Scroll konnte nicht vorbereitet werden.'
  const durationMs=scrollDurationSeconds()*1000,run=++autoScrollRun,startAt=performance.now(),targetFrameMs=900
  autoScrollActive=true;$('#autoScrollBtn').textContent='⏹ Auto-Scroll stoppen'
  const v=ensureViewer();v.setAutoScrolling?.(true)
  try{
    // Ensure the existing image page is active once. Afterwards only image data changes.
    await v.start()
    let lastFrameAt=-Infinity
    while(run===autoScrollRun&&autoScrollActive){
      const now=performance.now(),elapsed=Math.min(durationMs,now-startAt),progress=durationMs?elapsed/durationMs:1
      if(now-lastFrameAt<targetFrameMs&&progress<1){await new Promise(r=>setTimeout(r,Math.max(20,targetFrameMs-(now-lastFrameAt))));continue}
      lastFrameAt=performance.now()
      const spec=scrollSpecAt(plan,progress),frame=await processScrollFrame(spec,settings(),false)
      if(run!==autoScrollRun||!autoScrollActive)break
      await v.showPreparedView(frame)
      const remain=Math.max(0,(durationMs-(performance.now()-startAt))/1000)
      $('#status').textContent=`Auto-Scroll läuft · noch ${formatTime(remain)} bis Notenende`
      if(progress>=1)break
    }
    if(run===autoScrollRun&&autoScrollActive){autoScrollActive=false;v.setAutoScrolling?.(false);$('#autoScrollBtn').textContent='▶ Auto-Scroll bis Notenende';$('#status').textContent='Auto-Scroll: Notenende erreicht.'}
  }catch(e){console.error(e);if(run===autoScrollRun){autoScrollActive=false;v.setAutoScrolling?.(false);$('#autoScrollBtn').textContent='▶ Auto-Scroll bis Notenende';$('#status').textContent='Auto-Scroll fehlgeschlagen: '+(e?.message||e)}}
}

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
$('#scrollMinutes').oninput=updateScrollCalc
$('#scrollSeconds').oninput=updateScrollCalc
$('#autoScrollBtn').onclick=startAutoScroll
$('#scrollEnabled').onchange=()=>syncScrollOptions()
document.querySelectorAll('input[name="scrollMode"]').forEach(x=>x.onchange=()=>syncScrollOptions())

function settings(){return {contrast:+$('#contrast').value,invert:$('#invert').checked,cutout:$('#cutout').checked}}
function keyFor(i){const a=adjustments[i]||defaultAdj(),s=settings();return `${i}|${linesPerView}|${s.contrast}|${s.invert}|${s.cutout}|${a.cropX}|${a.cropY}|${a.cropHeight}|${a.cropWidth}`}
function ensureAdjustments(){while(adjustments.length<views.length)adjustments.push(defaultAdj());if(adjustments.length>views.length)adjustments.length=views.length}
function revokeResult(r){if(r?.url)URL.revokeObjectURL(r.url)}
function clearCache(){prefetchGeneration++;prefetchQueue=[];fingerPrefetchToken++;fingerFrameCache.clear();for(const r of cache.values())revokeResult(r);cache.clear();viewResults=[]}

function rebuildViews(resetAdj=false){const old=adjustments;views=buildViews(descriptors,linesPerView,totalPages);adjustments=resetAdj?[]:old;ensureAdjustments();idx=Math.min(idx,Math.max(0,views.length-1));clearCache();showMeta()}

document.querySelectorAll('[data-rows]').forEach(b=>b.onclick=()=>{
  const anchor=views[idx]?.items?.[0]
  linesPerView=+b.dataset.rows
  document.querySelectorAll('[data-rows]').forEach(x=>x.classList.toggle('active',x===b));$('#rowsLabel').textContent=linesPerView
  rebuildViews(true)
  if(anchor){const keep=views.findIndex(v=>v.items?.some(it=>it.pageIndex===anchor.pageIndex&&it.lineIndex===anchor.lineIndex));if(keep>=0)idx=keep}
  showMeta();updateScrollCalc();scheduleRender(true)
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
  // Keep the phone responsive and the BLE bridge stable: only prepare the pages
  // that can realistically be requested next, never the whole score at once.
  for(const d of [1,-1,2,-2,3,-3]){const i=center+d;if(i>=0&&i<views.length&&!order.includes(i))order.push(i)}
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


async function processFile(f){$('#detect').disabled=true;$('#save').disabled=true;$('#startG2').disabled=true;$('#result').style.display='none';$('#status').textContent='Lese Datei…';try{pages=await loadSelectedFile(f);totalPages=pages.length;fingerScrollProgress=0;fingerScrollPage=-1;descriptors=[];for(let i=0;i<pages.length;i++){ $('#status').textContent=`Erkenne Noten auf Seite ${i+1}/${pages.length}…`;descriptors.push(...extractCutDescriptors(pages[i],i)) } rebuildViews(true);if(!views.length)throw new Error('Keine Notenzeilen gefunden.');$('#result').style.display='block';$('#save').disabled=false;$('#startG2').disabled=false;updateScrollCalc();syncScrollOptions();await renderCurrent({pushG2:false});$('#status').textContent=`Fertig – ${views.length} Ansichten aus ${descriptors.length} erkannten Zeilen.`}catch(e){console.error(e);$('#status').textContent='Fehler: '+(e?.message||e)}finally{$('#detect').disabled=!file}}
$('#detect').onclick=()=>file&&processFile(file)

function makeId(){return globalThis.crypto?.randomUUID?.()||`score-${Date.now()}-${Math.random().toString(36).slice(2)}`}
$('#save').onclick=async()=>{if(!file||!descriptors.length)return;$('#save').disabled=true;$('#status').textContent='Speichere…';try{const name=$('#scoreName').value.trim()||defaultName(file)||'Unbenannte Noten',id=currentId||makeId(),prev=currentId?await getScore(currentId):null;const storedFile=await fileToStored(file);await saveScore({id,name,fileName:file.name,type:file.type,storedFile,createdAt:prev?.createdAt||Date.now(),updatedAt:Date.now(),settings:{...settings(),linesPerView,autoScrollSeconds:scrollDurationSeconds(),scrollEnabled:$('#scrollEnabled').checked,scrollMode:document.querySelector('input[name="scrollMode"]:checked')?.value||'time'},adjustments,descriptorBounds:descriptors.map(d=>({pageIndex:d.pageIndex,lineIndex:d.lineIndex,bounds:{...d.bounds}})),folderId:$('#saveFolder').value||null});currentId=id;$('#status').textContent=`„${name}“ gespeichert.`;await refreshLibrary();await viewer?.refreshLibraryIfOpen()}catch(e){console.error(e);$('#status').textContent='Speichern fehlgeschlagen: '+(e?.name==='QuotaExceededError'?'Speicherplatz der Even App ist voll. Bitte alte Noten löschen.':(e?.message||e))}finally{$('#save').disabled=false}}

async function openSaved(id){const r=await getScore(id);if(!r)return;$('#status').textContent='Öffne gespeicherte Noten…';currentId=r.id;file=r.storedFile?storedToFile(r.storedFile):r.blob;if(!file)throw new Error('Gespeicherte Datei fehlt.');$('#scoreName').value=r.name;$('#contrast').value=r.settings?.contrast??150;$('#contrastValue').textContent=$('#contrast').value;$('#invert').checked=!!r.settings?.invert;$('#cutout').checked=r.settings?.cutout!==false;linesPerView=Math.max(1,Math.min(8,r.settings?.linesPerView||r.settings?.rowsPerView||4));document.querySelectorAll('[data-rows]').forEach(x=>x.classList.toggle('active',+x.dataset.rows===linesPerView));$('#rowsLabel').textContent=linesPerView;const autoSec=Math.max(10,Number(r.settings?.autoScrollSeconds)||180);$('#scrollMinutes').value=Math.floor(autoSec/60);$('#scrollSeconds').value=autoSec%60;$('#scrollEnabled').checked=!!r.settings?.scrollEnabled;const sm=r.settings?.scrollMode==='finger'?'finger':'time';const radio=document.querySelector(`input[name="scrollMode"][value="${sm}"]`);if(radio)radio.checked=true;fingerScrollProgress=0;fingerScrollPage=-1;await refreshFolderOptions(r.folderId||'');pages=await loadSelectedFile(file);totalPages=pages.length;descriptors=[];const savedBounds=Array.isArray(r.descriptorBounds)?r.descriptorBounds:null;if(savedBounds?.length){for(const d of savedBounds){const source=pages[d.pageIndex];if(source&&d.bounds)descriptors.push({source,pageIndex:d.pageIndex||0,lineIndex:d.lineIndex||0,bounds:{...d.bounds}})}}if(!descriptors.length){for(let i=0;i<pages.length;i++)descriptors.push(...extractCutDescriptors(pages[i],i))}rebuildViews(true);adjustments=Array.isArray(r.adjustments)?r.adjustments.map(a=>({...defaultAdj(),...a})):[];ensureAdjustments();idx=0;$('#result').style.display='block';$('#save').disabled=false;$('#startG2').disabled=false;updateScrollCalc();syncScrollOptions();await renderCurrent({pushG2:false});$('#status').textContent=`„${r.name}“ geöffnet.`}
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
  for(const f of folders){
    const group=document.createElement('details');group.className='folderGroup';group.open=openLibraryFolders.has(f.id)
    const inside=rows.filter(x=>x.folderId===f.id)
    group.innerHTML=`<summary><span class="folderTitle"><span>📁 ${escapeHtml(f.name)}</span><span class="folderCount">${inside.length}</span></span><span class="folderActions"><button type="button" class="folderRename" title="Ordner umbenennen">✏️</button><button type="button" class="folderDelete danger" title="Ordner löschen">🗑️</button></span></summary><div class="folderContents"></div>`
    group.addEventListener('toggle',()=>{if(group.open)openLibraryFolders.add(f.id);else openLibraryFolders.delete(f.id)})
    group.querySelector('.folderRename').onclick=async e=>{e.preventDefault();e.stopPropagation();const name=prompt('Ordner umbenennen:',f.name);if(name==null)return;try{await renameFolder(f.id,name);openLibraryFolders.add(f.id);await refreshLibrary();$('#status').textContent=`Ordner in „${name.trim()}“ umbenannt.`;await viewer?.refreshLibraryIfOpen()}catch(err){$('#status').textContent='Umbenennen fehlgeschlagen: '+(err?.message||err)}}
    group.querySelector('.folderDelete').onclick=async e=>{e.preventDefault();e.stopPropagation();if(!confirm(`Ordner „${f.name}“ löschen?\n\nDie ${inside.length} darin gespeicherten Noten bleiben erhalten und werden nach „Ohne Ordner“ verschoben.`))return;try{const res=await deleteFolder(f.id);openLibraryFolders.delete(f.id);await refreshLibrary();$('#status').textContent=`Ordner „${f.name}“ gelöscht${res?.moved?` · ${res.moved} Noten nach „Ohne Ordner“ verschoben.`:'.'}`;await viewer?.refreshLibraryIfOpen()}catch(err){$('#status').textContent='Ordner löschen fehlgeschlagen: '+(err?.message||err)}}
    const body=group.querySelector('.folderContents');for(const r of inside)body.appendChild(makeLibraryRow(r,folders));el.appendChild(group)
  }
  const loose=rows.filter(r=>!r.folderId||!folders.some(f=>f.id===r.folderId))
  if(loose.length){const key='__loose__',group=document.createElement('details');group.className='folderGroup';group.open=openLibraryFolders.has(key)||(folders.length===0&&!openLibraryFolders.size);group.innerHTML=`<summary><span>🎵 Ohne Ordner</span><span class="folderCount">${loose.length}</span></summary><div class="folderContents"></div>`;group.addEventListener('toggle',()=>{if(group.open)openLibraryFolders.add(key);else openLibraryFolders.delete(key)});const body=group.querySelector('.folderContents');for(const r of loose)body.appendChild(makeLibraryRow(r,folders));el.appendChild(group)}
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

let fingerScrollProgress=0, fingerScrollPage=-1
function syncScrollOptions(){
  const enabled=!!$('#scrollEnabled')?.checked,mode=document.querySelector('input[name="scrollMode"]:checked')?.value||'time'
  viewer?.setScrollOptions?.({enabled,finger:enabled&&mode==='finger'})
  $('#autoScrollBtn').disabled=!views.length||!enabled||mode!=='time'
  if((!enabled||mode!=='time')&&autoScrollActive)stopAutoScroll('Scrollen gestoppt.')
}
function fingerFrameKey(spec){const st=settings();return [spec.pageIndex,spec.left,spec.right,spec.top,spec.height,st.contrast,st.invert?1:0,st.cutout?1:0].join(':')}
async function getFingerFrame(spec){
  const key=fingerFrameKey(spec)
  if(fingerFrameCache.has(key))return fingerFrameCache.get(key)
  const frame=await processScrollFrame(spec,settings(),false)
  fingerFrameCache.set(key,frame)
  while(fingerFrameCache.size>4)fingerFrameCache.delete(fingerFrameCache.keys().next().value)
  return frame
}
function prefetchFingerFrame(plan,dir){
  const token=++fingerPrefetchToken
  const nextProgress=Math.max(0,Math.min(1,fingerScrollProgress+dir*(1/Math.max(1,plan.totalWeight))))
  if(nextProgress===fingerScrollProgress)return
  const spec=scrollSpecAt(plan,nextProgress)
  setTimeout(async()=>{if(token!==fingerPrefetchToken)return;try{await getFingerFrame(spec)}catch{}},0)
}
async function fingerScrollStep(dir){
  if(!$('#scrollEnabled').checked||document.querySelector('input[name="scrollMode"]:checked')?.value!=='finger')return
  const plan=buildScrollPlan();if(!plan)return
  // Finest useful source movement: exactly ONE source pixel per swipe.
  const stepUnits=1
  fingerScrollProgress=Math.max(0,Math.min(1,fingerScrollProgress+dir*(stepUnits/Math.max(1,plan.totalWeight))))
  const spec=scrollSpecAt(plan,fingerScrollProgress)
  const frame=await getFingerFrame(spec)
  await ensureViewer().showPreparedView(frame)
  prefetchFingerFrame(plan,dir)
  if(spec.pageIndex!==fingerScrollPage){fingerScrollPage=spec.pageIndex;$('#status').textContent=`Fingerscroll · PDF/Foto-Seite ${spec.pageIndex+1}/${totalPages}`}
}
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
    getLibrary:async()=>{const [scores,folders]=await Promise.all([listScores(),listFolders()]);return {scores,folders}},
    onOpenSaved:async id=>{await openSaved(id);return viewResults[idx]||cache.get(keyFor(idx))},
    onPrefetch:center=>queuePrefetch(center),
    onScoreExit:()=>stopAutoScroll('Zurück in der Bibliothek.'),
    onFingerScroll:dir=>fingerScrollStep(dir)
  })
  syncScrollOptions()
  return viewer
}
$('#startG2').onclick=async()=>{if(!views.length)return;try{await ensureViewer().start();$('#status').textContent='G2 verbunden – Wischen und Änderungen aktualisieren die Brille automatisch.'}catch(e){console.error(e);$('#status').textContent='G2-Verbindung fehlgeschlagen: '+(e?.message||e)}}
updateScrollCalc();syncScrollOptions()
refreshLibrary().then(()=>ensureViewer().boot()).catch(e=>{console.error(e);$('#status').textContent='G2-Start fehlgeschlagen: '+(e?.message||e)})
