
import './style.css'
import { pdfToCanvases, imageToCanvas } from './pdf.js'
import { extractCutDescriptors, processDescriptor } from './score.js'
import { saveScore, listScores, getScore, deleteScore } from './library.js'
import { G2Viewer } from './glasses.js'

document.querySelector('#app').innerHTML=`
<div class="wrap">
  <h1>Sheet Music for Even G2</h1>
  <p>Notenzeilen erkennen, den echten Ausschnitt bei Bedarf korrigieren und G2-gerecht als eine oder zwei Zeilen anzeigen.</p>

  <div class="card">
    <div class="grid2">
      <label class="filebtn">📷 Foto<input id="imgInput" type="file" accept="image/*" capture="environment"></label>
      <label class="filebtn">📄 PDF<input id="pdfInput" type="file" accept="application/pdf"></label>
    </div>
    <div style="margin-top:10px">
      <input id="scoreName" type="text" placeholder="Name, z. B. Deinem Heiland – Flügelhorn 1">
    </div>
    <button id="detect" class="primary" disabled>Notenzeilen erkennen</button>

    <div class="setting">
      <div class="settingrow"><span>G2-Anzeige</span><strong id="rowsLabel">1 Zeile</strong></div>
      <div class="segmented">
        <button id="rows1" class="active">1 Zeile</button>
        <button id="rows2">2 Zeilen</button>
      </div>
    </div>

    <div class="setting">
      <div class="settingrow"><span>Kontrast</span><strong id="contrastValue">130</strong></div>
      <input id="contrast" type="range" min="60" max="220" value="130">
    </div>

    <div class="settingrow" style="margin-top:8px">
      <label class="toggle"><input id="invert" type="checkbox"> Invertieren</label>
      <button id="save" disabled>💾 Speichern</button>
    </div>
    <div id="status">Noch keine Datei ausgewählt.</div>
  </div>

  <div class="card" id="result" style="display:none">
    <div class="settingrow">
      <strong id="count"></strong>
      <span class="badge" id="currentLineBadge">Zeile 1</span>
    </div>

    <div class="previewStack">
      <img id="preview1">
      <img id="preview2" style="display:none">
    </div>

    <div class="meta"><span id="counter"></span><span>G2-Vorschau</span></div>

    <div class="shiftGrid">
      <div class="shiftBox">
        <strong>Ausschnitt links/rechts: <span id="cropXVal">0</span> px</strong>
        <input id="cropX" type="range" min="-350" max="350" value="0">
      </div>
      <div class="shiftBox">
        <strong>Ausschnitt hoch/runter: <span id="cropYVal">0</span> px</strong>
        <input id="cropY" type="range" min="-250" max="250" value="0">
      </div>
      <div class="shiftBox">
        <strong>Ausschnitt Höhe: <span id="cropHVal">100</span>%</strong>
        <input id="cropHeight" type="range" min="55" max="180" value="100">
      </div>
      <div class="shiftBox">
        <strong>Ausschnitt Breite: <span id="cropWVal">100</span>%</strong>
        <input id="cropWidth" type="range" min="70" max="130" value="100">
      </div>
    </div>

    <div class="row">
      <button id="resetCrop">Ausschnitt zurücksetzen</button>
      <button id="nextAdjust">Nächste Zeile bearbeiten</button>
    </div>

    <div class="row">
      <button id="prev">← Zurück</button>
      <button id="next">Weiter →</button>
    </div>

    <button id="startG2" class="primary">Auf G2 starten</button>
    <p class="small">Wichtig: Die Regler verschieben jetzt den echten Quellausschnitt im Foto/PDF – nicht nur das Bild innerhalb eines festen Ausschnitts.</p>
  </div>

  <div class="card">
    <div class="settingrow"><strong>Gespeicherte Noten</strong><span class="badge" id="libCount">0</span></div>
    <div id="library"><p class="small">Noch nichts gespeichert.</p></div>
  </div>
</div>`

const $=s=>document.querySelector(s)
let file=null
let descriptors=[]
let lines=[]
let adjustments=[]
let idx=0
let viewer=null
let currentId=null
let rowsPerView=1
let allTimer=null
let cropTimer=null

function defaultName(f){return (f?.name||'').replace(/\.[^.]+$/,'')}

function choose(f){
  file=f;currentId=null
  $('#detect').disabled=!f
  $('#save').disabled=true
  if(f&&!$('#scoreName').value.trim())$('#scoreName').value=defaultName(f)
  $('#status').textContent=f?`${f.name} ausgewählt.`:'Noch keine Datei ausgewählt.'
}
$('#imgInput').onchange=()=>{choose($('#imgInput').files?.[0]||null);$('#pdfInput').value=''}
$('#pdfInput').onchange=()=>{choose($('#pdfInput').files?.[0]||null);$('#imgInput').value=''}

function setRows(n){
  rowsPerView=n
  $('#rows1').classList.toggle('active',n===1)
  $('#rows2').classList.toggle('active',n===2)
  $('#rowsLabel').textContent=n===1?'1 Zeile':'2 Zeilen'
  rebuildLines()
}
$('#rows1').onclick=()=>setRows(1)
$('#rows2').onclick=()=>setRows(2)

function ensureAdjustments(){
  while(adjustments.length<descriptors.length){
    adjustments.push({cropX:0,cropY:0,cropHeight:100,cropWidth:100})
  }
  if(adjustments.length>descriptors.length)adjustments.length=descriptors.length
}

async function rebuildLine(i){
  if(!descriptors[i])return
  const old=lines[i]
  if(old?.url)URL.revokeObjectURL(old.url)
  const a=adjustments[i]||{}
  lines[i]=await processDescriptor(descriptors[i],{
    contrast:Number($('#contrast').value),
    invert:$('#invert').checked,
    cropX:a.cropX||0,
    cropY:a.cropY||0,
    cropHeight:a.cropHeight||100,
    cropWidth:a.cropWidth||100,
    twoRows:rowsPerView===2
  })
}

async function rebuildLines(){
  ensureAdjustments()
  for(const l of lines)if(l?.url)URL.revokeObjectURL(l.url)
  lines=[]
  for(let i=0;i<descriptors.length;i++)await rebuildLine(i)
  idx=Math.min(idx,Math.max(0,lines.length-1))
  $('#count').textContent=`${lines.length} Notenzeilen erkannt`
  $('#result').style.display=lines.length?'block':'none'
  show()
}

function scheduleAll(){
  $('#contrastValue').textContent=$('#contrast').value
  clearTimeout(allTimer)
  allTimer=setTimeout(rebuildLines,100)
}
$('#contrast').oninput=scheduleAll
$('#invert').onchange=scheduleAll

function syncCropControls(){
  const a=adjustments[idx]||{cropX:0,cropY:0,cropHeight:100,cropWidth:100}
  $('#cropX').value=a.cropX||0
  $('#cropY').value=a.cropY||0
  $('#cropHeight').value=a.cropHeight||100
  $('#cropWidth').value=a.cropWidth||100
  $('#cropXVal').textContent=$('#cropX').value
  $('#cropYVal').textContent=$('#cropY').value
  $('#cropHVal').textContent=$('#cropHeight').value
  $('#cropWVal').textContent=$('#cropWidth').value
  $('#currentLineBadge').textContent=`Zeile ${idx+1}`
}

function scheduleCrop(){
  $('#cropXVal').textContent=$('#cropX').value
  $('#cropYVal').textContent=$('#cropY').value
  $('#cropHVal').textContent=$('#cropHeight').value
  $('#cropWVal').textContent=$('#cropWidth').value
  clearTimeout(cropTimer)
  cropTimer=setTimeout(async()=>{
    adjustments[idx]={
      cropX:Number($('#cropX').value),
      cropY:Number($('#cropY').value),
      cropHeight:Number($('#cropHeight').value),
      cropWidth:Number($('#cropWidth').value)
    }
    await rebuildLine(idx)
    show(false)
  },70)
}
for(const id of ['#cropX','#cropY','#cropHeight','#cropWidth']){
  $(id).oninput=scheduleCrop
}

$('#resetCrop').onclick=async()=>{
  adjustments[idx]={cropX:0,cropY:0,cropHeight:100,cropWidth:100}
  syncCropControls()
  await rebuildLine(idx)
  show(false)
}

$('#nextAdjust').onclick=()=>{
  if(idx<lines.length-1){idx++;show()}
}

function show(sync=true){
  if(!lines.length)return
  $('#preview1').src=lines[idx].url

  const second=(rowsPerView===2&&lines[idx+1])?lines[idx+1]:null
  if(second){
    $('#preview2').src=second.url
    $('#preview2').style.display='block'
  }else{
    $('#preview2').style.display='none'
  }

  const end=Math.min(lines.length,idx+rowsPerView)
  $('#counter').textContent=rowsPerView===1
    ? `${idx+1} / ${lines.length}`
    : `${idx+1}–${end} / ${lines.length}`

  $('#prev').disabled=idx===0
  $('#next').disabled=idx>=lines.length-1
  $('#nextAdjust').disabled=idx>=lines.length-1
  if(sync)syncCropControls()
}

$('#prev').onclick=()=>{idx=Math.max(0,idx-rowsPerView);show()}
$('#next').onclick=()=>{idx=Math.min(lines.length-1,idx+rowsPerView);show()}

async function processFile(f){
  $('#detect').disabled=true
  $('#save').disabled=true
  $('#result').style.display='none'
  $('#status').textContent='Verarbeite Datei…'
  try{
    const pages=f.type==='application/pdf'
      ? await pdfToCanvases(f)
      : [await imageToCanvas(f)]

    descriptors=[]
    adjustments=[]
    for(let i=0;i<pages.length;i++){
      $('#status').textContent=`Erkenne Notenzeilen auf Seite ${i+1}/${pages.length}…`
      descriptors.push(...extractCutDescriptors(pages[i]))
    }

    idx=0
    ensureAdjustments()
    await rebuildLines()
    $('#status').textContent=descriptors.length
      ? `Fertig – ${descriptors.length} Notenzeilen erkannt.`
      : 'Keine Notenzeile gefunden.'
    $('#save').disabled=!descriptors.length
  }catch(e){
    console.error(e)
    $('#status').textContent='Fehler: '+(e?.message||e)
  }finally{
    $('#detect').disabled=!file
  }
}
$('#detect').onclick=()=>file&&processFile(file)

$('#save').onclick=async()=>{
  if(!file||!descriptors.length)return
  const name=$('#scoreName').value.trim()||defaultName(file)||'Unbenannte Noten'
  const id=currentId||crypto.randomUUID()
  const prev=currentId?await getScore(currentId):null

  await saveScore({
    id,name,fileName:file.name,type:file.type,blob:file,
    createdAt:prev?.createdAt||Date.now(),
    updatedAt:Date.now(),
    settings:{
      contrast:Number($('#contrast').value),
      invert:$('#invert').checked,
      rowsPerView
    },
    adjustments
  })
  currentId=id
  $('#status').textContent=`„${name}“ gespeichert.`
  await refreshLibrary()
}

async function openSaved(id){
  const r=await getScore(id)
  if(!r)return

  currentId=r.id
  file=r.blob
  $('#scoreName').value=r.name
  $('#contrast').value=r.settings?.contrast??130
  $('#contrastValue').textContent=$('#contrast').value
  $('#invert').checked=!!r.settings?.invert
  rowsPerView=r.settings?.rowsPerView===2?2:1
  $('#rows1').classList.toggle('active',rowsPerView===1)
  $('#rows2').classList.toggle('active',rowsPerView===2)
  $('#rowsLabel').textContent=rowsPerView===1?'1 Zeile':'2 Zeilen'

  const pages=file.type==='application/pdf'
    ? await pdfToCanvases(file)
    : [await imageToCanvas(file)]

  descriptors=[]
  for(const p of pages)descriptors.push(...extractCutDescriptors(p))

  adjustments=Array.isArray(r.adjustments)?r.adjustments.map(a=>({
    cropX:Number(a?.cropX||0),
    cropY:Number(a?.cropY||0),
    cropHeight:Number(a?.cropHeight||100),
    cropWidth:Number(a?.cropWidth||100)
  })):[]
  ensureAdjustments()
  idx=0
  await rebuildLines()
  $('#save').disabled=!descriptors.length
  $('#status').textContent=`„${r.name}“ geöffnet.`
}

async function removeSaved(id){
  await deleteScore(id)
  if(currentId===id)currentId=null
  await refreshLibrary()
}

async function refreshLibrary(){
  const rows=await listScores()
  $('#libCount').textContent=rows.length
  const el=$('#library')
  if(!rows.length){
    el.innerHTML='<p class="small">Noch nichts gespeichert.</p>'
    return
  }
  el.innerHTML=''
  for(const r of rows){
    const div=document.createElement('div')
    div.className='libraryItem'
    const d=new Date(r.updatedAt||r.createdAt)
    div.innerHTML=`
      <div>
        <div class="libname">${escapeHtml(r.name)}</div>
        <div class="libmeta">${escapeHtml(r.fileName||'')} · ${d.toLocaleDateString()}</div>
      </div>
      <button class="open">Öffnen</button>
      <button class="danger delete">Löschen</button>`
    div.querySelector('.open').onclick=()=>openSaved(r.id)
    div.querySelector('.delete').onclick=()=>removeSaved(r.id)
    el.appendChild(div)
  }
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]))
}

$('#startG2').onclick=async()=>{
  if(!lines.length)return
  $('#status').textContent='Verbinde mit Even G2…'
  try{
    viewer=new G2Viewer(
      ()=>lines,
      ()=>idx,
      v=>{idx=v;show()},
      ()=>rowsPerView
    )
    await viewer.start()
    $('#status').textContent=rowsPerView===1
      ? 'G2 läuft im 1-Zeilen-Modus.'
      : 'G2 läuft im kompakten 2-Zeilen-Modus.'
  }catch(e){
    console.error(e)
    $('#status').textContent='G2-Verbindung fehlgeschlagen: '+(e?.message||e)
  }
}

refreshLibrary()
