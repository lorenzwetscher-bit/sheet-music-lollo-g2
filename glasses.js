import { waitForEvenAppBridge, OsEventTypeList } from '@evenrealities/even_hub_sdk'
import { quadrantPngBytes } from './score.js'
import logoUrl from './wetscher-logo-g2.png?url'

const pageOk=r=>r===0||r===true||r==='success'
const imageOk=r=>r===0||r===true||r==='success'

// CLICK_EVENT is numeric 0 and can therefore be omitted by protobuf.
// Accept the event layouts seen in the Even App and simulator.
function eventType(ev){
  if(ev==null)return null
  if(typeof ev.eventType==='number')return ev.eventType
  for(const k of ['textEvent','listEvent','sysEvent','scrollEvent','touchEvent']){
    const e=ev?.[k]
    if(e){if(typeof e.eventType==='number')return e.eventType;return e.eventType ?? OsEventTypeList.CLICK_EVENT}
  }
  return null
}

function fitText(ctx,text,maxWidth){
  let s=String(text||'').replace(/\s+/g,' ').trim()
  if(ctx.measureText(s).width<=maxWidth)return s
  while(s.length>3&&ctx.measureText(s+'…').width>maxWidth)s=s.slice(0,-1)
  return s+'…'
}

export class G2Viewer{
  constructor({getView,getIndex,setIndex,getViewCount,onStatus,getLibrary,onOpenSaved}){
    this.getView=getView;this.getIndex=getIndex;this.setIndex=setIndex;this.getViewCount=getViewCount
    this.onStatus=onStatus||(()=>{});this.getLibrary=getLibrary||(()=>Promise.resolve({scores:[],folders:[]}));this.onOpenSaved=onOpenSaved||(()=>Promise.resolve())
    this.bridge=null;this.unsub=null;this.launchUnsub=null;this.started=false;this.mode='none'
    this.busy=false;this.pending=false;this.libraryScores=[];this.libraryFolders=[];this.libraryItems=[];this.librarySelected=0;this.libraryFolderId=null
    this.startupReady=Promise.resolve();this.navigating=false;this.lastEventAt=0;this.logoPromise=null;this.imagePageReady=false
  }

  async ensureBridge(force=false){if(force)this.bridge=null;if(!this.bridge)this.bridge=await waitForEvenAppBridge();return this.bridge}

  async loadLogo(){
    if(this.logoPromise)return this.logoPromise
    this.logoPromise=new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Wetscher-Logo konnte nicht geladen werden.'));img.src=logoUrl})
    return this.logoPromise
  }

  async showStartupNotice(){
    const b=await this.ensureBridge()
    const payload={containerTotalNum:1,textObject:[{xPosition:0,yPosition:0,width:576,height:288,borderWidth:0,borderColor:0,paddingLength:18,containerID:30,containerName:'startup',content:'SHEET MUSIC\n\nStarted successfully.\nLoading your library...',isEventCapture:1,zOrderIndex:1}]}
    const res=this.started?await b.rebuildPageContainer(payload):await b.createStartUpPageContainer(payload)
    if(!pageOk(res))throw new Error('Startanzeige konnte nicht erstellt werden: '+res)
    this.started=true;this.mode='startup';this.onStatus('Sheet Music gestartet…');await new Promise(resolve=>setTimeout(resolve,900))
  }

  async boot(){
    const b=await this.ensureBridge();this.bindEvents()
    if(!this.launchUnsub&&b.onLaunchSource)this.launchUnsub=b.onLaunchSource(()=>{})
    this.startupReady=this.showStartupNotice().catch(e=>{console.warn(e);this.onStatus('G2-Startanzeige fehlgeschlagen: '+(e?.message||e))})
    await this.startupReady;await this.showLibrary(true)
  }

  pagePayload(){return {containerTotalNum:5,textObject:[{xPosition:0,yPosition:0,width:576,height:288,borderWidth:0,borderColor:0,paddingLength:0,containerID:1,containerName:'events',content:' ',isEventCapture:1,zOrderIndex:1}],imageObject:[{xPosition:0,yPosition:0,width:288,height:144,containerID:2,containerName:'q1',zOrderIndex:2},{xPosition:288,yPosition:0,width:288,height:144,containerID:3,containerName:'q2',zOrderIndex:3},{xPosition:0,yPosition:144,width:288,height:144,containerID:4,containerName:'q3',zOrderIndex:4},{xPosition:288,yPosition:144,width:288,height:144,containerID:5,containerName:'q4',zOrderIndex:5}]}}

  async createImagePage(mode,rebuild=true){
    // Library and score use the exact same 4-image page layout. Rebuilding the
    // page container on every swipe/click is expensive on real G2 hardware, so
    // only build it once after the startup screen (or after a reconnect).
    if(this.imagePageReady){this.mode=mode;return}
    const b=await this.ensureBridge(),payload=this.pagePayload();
    const res=this.started?await b.rebuildPageContainer(payload):await b.createStartUpPageContainer(payload)
    if(!pageOk(res))throw new Error((mode==='library'?'Bibliothek':'Notenansicht')+' konnte nicht erstellt werden: '+res)
    this.started=true;this.imagePageReady=true;this.mode=mode
  }
  async createScorePage(rebuild=false){await this.createImagePage('score',rebuild)}

  rebuildLibraryItems(){
    const folders=[...this.libraryFolders].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'de'))
    if(this.libraryFolderId){
      const folder=folders.find(f=>f.id===this.libraryFolderId)
      if(!folder){this.libraryFolderId=null;return this.rebuildLibraryItems()}
      this.libraryItems=[{kind:'back',id:'__back__',name:'← Zurück'},...this.libraryScores.filter(s=>s.folderId===folder.id).map(s=>({kind:'score',id:s.id,name:s.name||s.fileName||'Unbenannte Noten'}))]
    }else{
      const folderIds=new Set(folders.map(f=>f.id))
      const rootScores=this.libraryScores.filter(s=>!s.folderId||!folderIds.has(s.folderId))
      this.libraryItems=[...folders.map(f=>({kind:'folder',id:f.id,name:f.name||'Ordner'})),...rootScores.map(s=>({kind:'score',id:s.id,name:s.name||s.fileName||'Unbenannte Noten'}))]
    }
    this.librarySelected=Math.max(0,Math.min(this.librarySelected,Math.max(0,this.libraryItems.length-1)))
  }

  async reloadLibrary(){
    const selected=this.libraryItems[this.librarySelected]
    const snap=await this.getLibrary()
    this.libraryScores=Array.isArray(snap)?snap:(Array.isArray(snap?.scores)?snap.scores:[])
    this.libraryFolders=Array.isArray(snap?.folders)?snap.folders:[]
    this.rebuildLibraryItems()
    if(selected){const i=this.libraryItems.findIndex(x=>x.kind===selected.kind&&x.id===selected.id);if(i>=0)this.librarySelected=i}
  }

  async libraryCanvas(){
    const c=document.createElement('canvas');c.width=576;c.height=288
    const ctx=c.getContext('2d',{alpha:false});ctx.fillStyle='#000';ctx.fillRect(0,0,576,288);ctx.fillStyle='#fff';ctx.strokeStyle='#fff';ctx.textBaseline='middle'

    try{
      const logo=await this.loadLogo()
      // Asset is tightly cropped and pre-rendered from the high-resolution logo.
      // Draw it at native-friendly size for a sharper G2 result.
      const h=58,w=Math.round(h*(logo.naturalWidth/logo.naturalHeight))
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(logo,Math.round((576-w)/2),3,w,h)
    }catch(e){console.warn(e)}

    ctx.textAlign='center';ctx.font='bold 22px sans-serif';ctx.fillText('SHEET MUSIC',288,78)
    if(this.libraryFolderId){const folder=this.libraryFolders.find(f=>f.id===this.libraryFolderId);ctx.font='12px sans-serif';ctx.fillText(fitText(ctx,folder?.name||'Ordner',420),288,98)}

    if(!this.libraryItems.length){
      ctx.font='bold 18px sans-serif';ctx.fillText('Keine Noten vorhanden',288,155);ctx.font='15px sans-serif';ctx.fillText('Speichere Noten in der Handy-App ab.',288,187);this.drawPageDots(ctx,1,0);return c
    }

    const pageSize=4,totalPages=Math.max(1,Math.ceil(this.libraryItems.length/pageSize)),page=Math.floor(this.librarySelected/pageSize),start=page*pageSize
    const visible=this.libraryItems.slice(start,start+pageSize),selectedRow=this.librarySelected-start
    const x=32,w=512,rowH=28,y0=108,gap=32
    ctx.textAlign='left';ctx.font='17px sans-serif';ctx.lineWidth=2
    visible.forEach((item,j)=>{
      const y=y0+j*gap
      if(j===selectedRow){ctx.beginPath();ctx.roundRect(x,y,w,rowH,9);ctx.stroke()}
      let prefix=item.kind==='folder'?'> ':''
      ctx.font=j===selectedRow?'bold 17px sans-serif':'17px sans-serif'
      ctx.fillText(fitText(ctx,prefix+item.name,w-28),x+14,y+rowH/2+1)
    })
    this.drawPageDots(ctx,totalPages,page)
    return c
  }

  drawPageDots(ctx,totalPages,currentPage){
    const y=274,count=Math.max(1,totalPages),maxSpan=450,spacing=count<=1?0:Math.min(18,maxSpan/(count-1)),start=288-(spacing*(count-1))/2
    ctx.lineWidth=1.5
    for(let i=0;i<count;i++){const x=start+i*spacing;ctx.beginPath();ctx.arc(x,y,i===currentPage?4.5:2.8,0,Math.PI*2);if(i===currentPage)ctx.fill();else ctx.stroke()}
  }

  async renderLibrary(){await this.createImagePage('library',false);const canvas=await this.libraryCanvas();await this.sendCanvas(canvas);this.onStatus(this.libraryItems.length?'G2-Bibliothek bereit: Swipe zur Auswahl, Klick zum Öffnen.':'G2-Bibliothek bereit – noch keine Noten gespeichert.')}
  async showLibrary(reload=true){await this.ensureBridge();this.bindEvents();if(reload)await this.reloadLibrary();else this.rebuildLibraryItems();await this.renderLibrary()}

  async openSelectedLibraryItem(){
    const item=this.libraryItems[this.librarySelected];if(!item)return
    if(item.kind==='back'){this.libraryFolderId=null;this.librarySelected=0;this.rebuildLibraryItems();await this.renderLibrary();return}
    if(item.kind==='folder'){this.libraryFolderId=item.id;this.librarySelected=0;this.rebuildLibraryItems();await this.renderLibrary();return}
    if(item.kind==='score'&&item.id){this.onStatus('Öffne Noten auf der G2…');await this.onOpenSaved(item.id);await this.createScorePage(false);await this.requestRender(true)}
  }

  async moveLibrarySelection(delta){
    if(!this.libraryItems.length)return
    const next=Math.max(0,Math.min(this.libraryItems.length-1,this.librarySelected+delta))
    if(next===this.librarySelected)return
    this.librarySelected=next;await this.renderLibrary()
  }

  bindEvents(){
    if(this.unsub||!this.bridge)return
    this.unsub=this.bridge.onEvenHubEvent(async ev=>{
      const now=Date.now();if(now-this.lastEventAt<110)return;this.lastEventAt=now
      if(this.navigating)return;this.navigating=true
      try{
        const type=eventType(ev)
        if(type===OsEventTypeList.DOUBLE_CLICK_EVENT){try{await this.bridge.shutDownPageContainer(1)}catch{}this.started=false;this.mode='none';return}
        if(this.mode==='library'){
          if(type===OsEventTypeList.SCROLL_BOTTOM_EVENT)await this.moveLibrarySelection(1)
          else if(type===OsEventTypeList.SCROLL_TOP_EVENT)await this.moveLibrarySelection(-1)
          else if(type===OsEventTypeList.CLICK_EVENT)await this.openSelectedLibraryItem()
          return
        }
        if(this.mode==='score'){
          const idx=this.getIndex(),count=this.getViewCount()
          if(type===OsEventTypeList.SCROLL_BOTTOM_EVENT&&idx<count-1){await this.setIndex(idx+1);await this.requestRender(true)}
          else if(type===OsEventTypeList.SCROLL_TOP_EVENT&&idx>0){await this.setIndex(idx-1);await this.requestRender(true)}
          else if(type===OsEventTypeList.CLICK_EVENT){await this.showLibrary(true)}
        }
      }catch(err){console.error(err);this.onStatus('G2-Steuerung fehlgeschlagen: '+(err?.message||err))}finally{this.navigating=false}
    })
  }

  async start(){this.onStatus('Verbinde mit Even G2…');await this.ensureBridge();this.bindEvents();await this.createScorePage(this.started);await this.requestRender(true)}
  async refreshLibraryIfOpen(){if(this.mode==='library')await this.showLibrary(true)}
  async requestRender(immediate=false){this.pending=true;if(this.busy&&!immediate)return;await this.flush()}

  async flush(){
    if(this.busy)return;this.busy=true
    try{while(this.pending){this.pending=false;const view=this.getView();if(!view?.canvas)continue;try{await this.sendView(view)}catch(err){console.warn('G2 update failed, reconnecting once',err);this.onStatus('G2 kurz getrennt – verbinde neu…');try{this.unsub?.()}catch{};this.unsub=null;this.started=false;this.imagePageReady=false;await this.ensureBridge(true);this.bindEvents();await this.createScorePage(false);await this.sendView(view)}}if(this.mode==='score')this.onStatus('G2 automatisch aktualisiert.')}finally{this.busy=false}
  }

  async sendView(view){
    if(!view?.canvas)return
    const bytes=Array.isArray(view.g2Parts)&&view.g2Parts.length===4?view.g2Parts:null
    await this.sendCanvas(view.canvas,bytes)
  }

  async sendCanvas(canvas,preparedBytes=null){
    const b=await this.ensureBridge();const parts=[[2,'q1',0,0],[3,'q2',288,0],[4,'q3',0,144],[5,'q4',288,144]]
    const bytes=preparedBytes||await Promise.all(parts.map(([,name,sx,sy])=>quadrantPngBytes(canvas,sx,sy)))
    // Even SDK image updates must stay serialized. The expensive PNG encoding is
    // already done in parallel / during neighbor prefetch, so the hardware path
    // only performs the four required transfers here.
    for(let i=0;i<parts.length;i++){const [id,name]=parts[i],result=await b.updateImageRawData({containerID:id,containerName:name,imageData:bytes[i]});if(!imageOk(result))throw new Error(`Bild-Update ${name}: ${result}`)}
  }
}
