import { waitForEvenAppBridge, OsEventTypeList } from '@evenrealities/even_hub_sdk'
import { quadrantGray4Bytes, canvasGray4Bytes } from './score.js'
import logoUrl from './wetscher-logo-g2.png?url'

const pageOk=r=>r===0||r===true||r==='success'
const imageOk=r=>r===0||r===true||r==='success'

// CLICK_EVENT is numeric 0 and can therefore be omitted by protobuf.
function eventType(ev){
  if(ev==null)return null
  if(typeof ev.eventType==='number')return ev.eventType
  for(const k of ['textEvent','listEvent','sysEvent','scrollEvent','touchEvent']){
    const e=ev?.[k]
    if(e){if(typeof e.eventType==='number')return e.eventType;return e.eventType ?? OsEventTypeList.CLICK_EVENT}
  }
  return null
}

function shortName(s,max=52){
  s=String(s||'').replace(/\s+/g,' ').trim()
  return s.length>max?s.slice(0,max-1)+'…':s
}

export class G2Viewer{
  constructor({getView,getIndex,setIndex,getViewCount,onStatus,getLibrary,onOpenSaved,onPrefetch}){
    this.getView=getView;this.getIndex=getIndex;this.setIndex=setIndex;this.getViewCount=getViewCount
    this.onStatus=onStatus||(()=>{});this.getLibrary=getLibrary||(()=>Promise.resolve({scores:[],folders:[]}));this.onOpenSaved=onOpenSaved||(()=>Promise.resolve())
    this.onPrefetch=onPrefetch||(()=>{})
    this.bridge=null;this.unsub=null;this.launchUnsub=null;this.started=false;this.mode='none';this.pageKind='none'
    this.busy=false;this.pending=false;this.libraryScores=[];this.libraryFolders=[];this.libraryItems=[];this.librarySelected=0;this.libraryFolderId=null
    this.libraryPage=-1;this.libraryPageSize=4;this.startupReady=Promise.resolve();this.navigating=false;this.lastEventAt=0
    this.logoPromise=null;this.logoBytesPromise=null
  }

  async ensureBridge(force=false){if(force)this.bridge=null;if(!this.bridge)this.bridge=await waitForEvenAppBridge();return this.bridge}

  async loadLogo(){
    if(this.logoPromise)return this.logoPromise
    this.logoPromise=new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Wetscher-Logo konnte nicht geladen werden.'));img.src=logoUrl})
    return this.logoPromise
  }

  async logoBytes(){
    if(this.logoBytesPromise)return this.logoBytesPromise
    this.logoBytesPromise=(async()=>{
      const img=await this.loadLogo(),c=document.createElement('canvas');c.width=190;c.height=58
      const ctx=c.getContext('2d',{alpha:false,willReadFrequently:true});ctx.fillStyle='#000';ctx.fillRect(0,0,c.width,c.height)
      const scale=Math.min(c.width/img.naturalWidth,c.height/img.naturalHeight),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale))
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,Math.round((c.width-w)/2),Math.round((c.height-h)/2),w,h)
      return canvasGray4Bytes(c)
    })()
    return this.logoBytesPromise
  }

  async showStartupNotice(){
    const b=await this.ensureBridge()
    const payload={containerTotalNum:1,textObject:[{xPosition:0,yPosition:0,width:576,height:288,borderWidth:0,borderColor:0,paddingLength:18,containerID:30,containerName:'startup',content:'SHEET MUSIC\n\nStarted successfully.\nLoading your library...',isEventCapture:1,zOrderIndex:1}]}
    const res=this.started?await b.rebuildPageContainer(payload):await b.createStartUpPageContainer(payload)
    if(!pageOk(res))throw new Error('Startanzeige konnte nicht erstellt werden: '+res)
    this.started=true;this.pageKind='startup';this.mode='startup';this.onStatus('Sheet Music gestartet…');await new Promise(resolve=>setTimeout(resolve,650))
  }

  async boot(){
    const b=await this.ensureBridge();this.bindEvents()
    if(!this.launchUnsub&&b.onLaunchSource)this.launchUnsub=b.onLaunchSource(()=>{})
    this.startupReady=this.showStartupNotice().catch(e=>{console.warn(e);this.onStatus('G2-Startanzeige fehlgeschlagen: '+(e?.message||e))})
    await this.startupReady;await this.showLibrary(true)
  }

  scorePayload(){return {containerTotalNum:5,textObject:[{xPosition:0,yPosition:0,width:576,height:288,borderWidth:0,borderColor:0,paddingLength:0,containerID:1,containerName:'events',content:' ',isEventCapture:1,zOrderIndex:1}],imageObject:[{xPosition:0,yPosition:0,width:288,height:144,containerID:2,containerName:'q1',zOrderIndex:2},{xPosition:288,yPosition:0,width:288,height:144,containerID:3,containerName:'q2',zOrderIndex:3},{xPosition:0,yPosition:144,width:288,height:144,containerID:4,containerName:'q3',zOrderIndex:4},{xPosition:288,yPosition:144,width:288,height:144,containerID:5,containerName:'q4',zOrderIndex:5}]}}

  async createScorePage(){
    if(this.pageKind==='score'){this.mode='score';return}
    const b=await this.ensureBridge(),res=this.started?await b.rebuildPageContainer(this.scorePayload()):await b.createStartUpPageContainer(this.scorePayload())
    if(!pageOk(res))throw new Error('Notenansicht konnte nicht erstellt werden: '+res)
    this.started=true;this.pageKind='score';this.mode='score'
  }

  rebuildLibraryItems(){
    const folders=[...this.libraryFolders].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'de'))
    if(this.libraryFolderId){
      const folder=folders.find(f=>f.id===this.libraryFolderId)
      if(!folder){this.libraryFolderId=null;return this.rebuildLibraryItems()}
      this.libraryItems=[{kind:'back',id:'__back__',name:'← Zurück'},...this.libraryScores.filter(s=>s.folderId===folder.id).map(s=>({kind:'score',id:s.id,name:s.name||s.fileName||'Unbenannte Noten'}))]
    }else{
      const folderIds=new Set(folders.map(f=>f.id)),rootScores=this.libraryScores.filter(s=>!s.folderId||!folderIds.has(s.folderId))
      this.libraryItems=[...folders.map(f=>({kind:'folder',id:f.id,name:f.name||'Ordner'})),...rootScores.map(s=>({kind:'score',id:s.id,name:s.name||s.fileName||'Unbenannte Noten'}))]
    }
    this.librarySelected=Math.max(0,Math.min(this.librarySelected,Math.max(0,this.libraryItems.length-1)))
  }

  async reloadLibrary(){
    const selected=this.libraryItems[this.librarySelected],snap=await this.getLibrary()
    this.libraryScores=Array.isArray(snap)?snap:(Array.isArray(snap?.scores)?snap.scores:[]);this.libraryFolders=Array.isArray(snap?.folders)?snap.folders:[]
    this.rebuildLibraryItems()
    if(selected){const i=this.libraryItems.findIndex(x=>x.kind===selected.kind&&x.id===selected.id);if(i>=0)this.librarySelected=i}
  }

  libraryListContent(page=this.currentLibraryPage()){
    if(!this.libraryItems.length)return 'Keine Noten vorhanden\n\nSpeichere Noten in der Handy-App ab.'
    const start=page*this.libraryPageSize,visible=this.libraryItems.slice(start,start+this.libraryPageSize)
    return visible.map((item,j)=>{
      const global=start+j,sel=global===this.librarySelected?'> ':'  ',folder=item.kind==='folder'?'[Ordner] ':''
      return sel+shortName(folder+item.name)
    }).join('\n\n')
  }

  currentLibraryPage(){return this.libraryItems.length?Math.floor(this.librarySelected/this.libraryPageSize):0}
  libraryDots(){
    const pages=Math.max(1,Math.ceil(this.libraryItems.length/this.libraryPageSize)),cur=this.currentLibraryPage()
    if(pages>12)return `${cur+1} / ${pages}`
    return Array.from({length:pages},(_,i)=>i===cur?'●':'○').join('  ')
  }

  libraryPayload(){
    const folder=this.libraryFolderId?this.libraryFolders.find(f=>f.id===this.libraryFolderId):null
    const texts=[
      {xPosition:0,yPosition:0,width:576,height:288,borderWidth:0,borderColor:0,paddingLength:0,containerID:10,containerName:'libevents',content:' ',isEventCapture:1,zOrderIndex:1},
      {xPosition:210,yPosition:68,width:220,height:30,borderWidth:0,borderColor:0,paddingLength:0,containerID:11,containerName:'libtitle',content:'SHEET MUSIC',isEventCapture:0,zOrderIndex:3},
      {xPosition:72,yPosition:92,width:432,height:22,borderWidth:0,borderColor:0,paddingLength:0,containerID:12,containerName:'libfolder',content:folder?shortName(folder.name,42):' ',isEventCapture:0,zOrderIndex:4},
      {xPosition:42,yPosition:112,width:500,height:132,borderWidth:0,borderColor:0,paddingLength:0,containerID:13,containerName:'libitems',content:this.libraryListContent(),isEventCapture:0,zOrderIndex:5},
      {xPosition:180,yPosition:258,width:260,height:28,borderWidth:0,borderColor:0,paddingLength:0,containerID:14,containerName:'libdots',content:this.libraryDots(),isEventCapture:0,zOrderIndex:6},
    ]
    return {containerTotalNum:6,textObject:texts,imageObject:[{xPosition:193,yPosition:4,width:190,height:58,containerID:15,containerName:'liblogo',zOrderIndex:2}]}
  }

  async rebuildLibraryPage(){
    const b=await this.ensureBridge(),payload=this.libraryPayload(),res=this.started?await b.rebuildPageContainer(payload):await b.createStartUpPageContainer(payload)
    if(!pageOk(res))throw new Error('Bibliothek konnte nicht erstellt werden: '+res)
    this.started=true;this.pageKind='library';this.mode='library';this.libraryPage=this.currentLibraryPage()
    const result=await b.updateImageRawData({containerID:15,containerName:'liblogo',imageData:await this.logoBytes()})
    if(!imageOk(result))console.warn('Logo update:',result)
  }

  async updateLibrarySelectionOnly(){
    const b=await this.ensureBridge(),ok=await b.textContainerUpgrade({containerID:13,containerName:'libitems',content:this.libraryListContent(),contentOffset:0,contentLength:0})
    if(!pageOk(ok))throw new Error('Auswahl konnte nicht aktualisiert werden.')
  }

  async showLibrary(reload=true){
    await this.ensureBridge();this.bindEvents();if(reload)await this.reloadLibrary();else this.rebuildLibraryItems();await this.rebuildLibraryPage()
    this.onStatus(this.libraryItems.length?'G2-Bibliothek bereit: Swipe zur Auswahl, Klick zum Öffnen.':'G2-Bibliothek bereit – noch keine Noten gespeichert.')
  }

  async openSelectedLibraryItem(){
    const item=this.libraryItems[this.librarySelected];if(!item)return
    if(item.kind==='back'){this.libraryFolderId=null;this.librarySelected=0;this.rebuildLibraryItems();await this.rebuildLibraryPage();return}
    if(item.kind==='folder'){this.libraryFolderId=item.id;this.librarySelected=0;this.rebuildLibraryItems();await this.rebuildLibraryPage();return}
    if(item.kind==='score'&&item.id){
      this.onStatus('Öffne Noten auf der G2…');await this.onOpenSaved(item.id);await this.createScorePage();await this.requestRender(true);this.onPrefetch(this.getIndex())
    }
  }

  async moveLibrarySelection(delta){
    if(!this.libraryItems.length)return
    const next=Math.max(0,Math.min(this.libraryItems.length-1,this.librarySelected+delta));if(next===this.librarySelected)return
    const oldPage=this.currentLibraryPage();this.librarySelected=next;const newPage=this.currentLibraryPage()
    if(newPage===oldPage&&this.pageKind==='library')await this.updateLibrarySelectionOnly()
    else await this.rebuildLibraryPage()
  }

  bindEvents(){
    if(this.unsub||!this.bridge)return
    this.unsub=this.bridge.onEvenHubEvent(async ev=>{
      const now=Date.now();if(now-this.lastEventAt<85)return;this.lastEventAt=now
      if(this.navigating)return;this.navigating=true
      try{
        const type=eventType(ev)
        if(type===OsEventTypeList.DOUBLE_CLICK_EVENT){try{await this.bridge.shutDownPageContainer(1)}catch{}this.started=false;this.pageKind='none';this.mode='none';return}
        if(this.mode==='library'){
          if(type===OsEventTypeList.SCROLL_BOTTOM_EVENT)await this.moveLibrarySelection(1)
          else if(type===OsEventTypeList.SCROLL_TOP_EVENT)await this.moveLibrarySelection(-1)
          else if(type===OsEventTypeList.CLICK_EVENT)await this.openSelectedLibraryItem()
          return
        }
        if(this.mode==='score'){
          const idx=this.getIndex(),count=this.getViewCount()
          if(type===OsEventTypeList.SCROLL_BOTTOM_EVENT&&idx<count-1){await this.setIndex(idx+1);await this.requestRender(true);this.onPrefetch(idx+1)}
          else if(type===OsEventTypeList.SCROLL_TOP_EVENT&&idx>0){await this.setIndex(idx-1);await this.requestRender(true);this.onPrefetch(idx-1)}
          else if(type===OsEventTypeList.CLICK_EVENT){await this.showLibrary(true)}
        }
      }catch(err){console.error(err);this.onStatus('G2-Steuerung fehlgeschlagen: '+(err?.message||err))}finally{this.navigating=false}
    })
  }

  async start(){this.onStatus('Verbinde mit Even G2…');await this.ensureBridge();this.bindEvents();await this.createScorePage();await this.requestRender(true);this.onPrefetch(this.getIndex())}
  async refreshLibraryIfOpen(){if(this.mode==='library')await this.showLibrary(true)}
  async requestRender(immediate=false){this.pending=true;if(this.busy&&!immediate)return;await this.flush()}

  async flush(){
    if(this.busy)return;this.busy=true
    try{
      while(this.pending){
        this.pending=false;const view=this.getView();if(!view?.canvas)continue
        try{await this.sendView(view)}catch(err){
          console.warn('G2 update failed, reconnecting once',err);this.onStatus('G2 kurz getrennt – verbinde neu…');try{this.unsub?.()}catch{};this.unsub=null;this.started=false;this.pageKind='none'
          await this.ensureBridge(true);this.bindEvents();await this.createScorePage();await this.sendView(view)
        }
      }
      if(this.mode==='score')this.onStatus('G2 aktualisiert.')
    }finally{this.busy=false}
  }

  async sendView(view){
    if(!view?.canvas)return
    const bytes=Array.isArray(view.g2Parts)&&view.g2Parts.length===4?view.g2Parts:null
    await this.sendCanvas(view.canvas,bytes)
  }

  async sendCanvas(canvas,preparedBytes=null){
    const b=await this.ensureBridge(),parts=[[2,'q1',0,0],[3,'q2',288,0],[4,'q3',0,144],[5,'q4',288,144]]
    const bytes=preparedBytes||parts.map(([,name,sx,sy])=>quadrantGray4Bytes(canvas,sx,sy))
    // Four full-screen quadrants are required. Keep sends serial as required by Even,
    // but send already prepared raw 4-bit grayscale pixels so the phone does no PNG
    // decode/conversion during a page turn.
    for(let i=0;i<parts.length;i++){
      const [id,name]=parts[i],result=await b.updateImageRawData({containerID:id,containerName:name,imageData:bytes[i]})
      if(!imageOk(result))throw new Error(`Bild-Update ${name}: ${result}`)
    }
  }
}
