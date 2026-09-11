import { waitForEvenAppBridge, OsEventTypeList } from '@evenrealities/even_hub_sdk'
import { quadrantPngBytes } from './score.js'
import logoUrl from './wetscher-logo-g2.png?url'

const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const imageOk=r=>r===0||r===true||r==='success'
function eventType(ev){
  if(ev==null)return null
  const envelopes=[ev?.sysEvent,ev?.textEvent,ev?.listEvent,ev?.scrollEvent,ev?.touchEvent].filter(Boolean)
  for(const env of envelopes){
    const t=env?.eventType
    if(t===OsEventTypeList.DOUBLE_CLICK_EVENT||t===OsEventTypeList.SCROLL_TOP_EVENT||t===OsEventTypeList.SCROLL_BOTTOM_EVENT)return t
  }
  for(const env of envelopes){
    const t=env?.eventType
    if(t===OsEventTypeList.CLICK_EVENT||t==null)return OsEventTypeList.CLICK_EVENT
  }
  if(ev?.eventType===OsEventTypeList.DOUBLE_CLICK_EVENT||ev?.eventType===OsEventTypeList.SCROLL_TOP_EVENT||ev?.eventType===OsEventTypeList.SCROLL_BOTTOM_EVENT)return ev.eventType
  if(ev?.eventType===OsEventTypeList.CLICK_EVENT)return OsEventTypeList.CLICK_EVENT
  return null
}

function fitName(s,n=44){s=String(s||'').replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n-1)+'…':s}

export class G2Viewer{
  constructor({getView,getIndex,setIndex,getViewCount,onStatus,getLibrary,onOpenSaved,onPrefetch,onScoreExit,onFingerScroll}){
    Object.assign(this,{getView,getIndex,setIndex,getViewCount,onStatus:onStatus||(()=>{}),getLibrary:getLibrary||(()=>Promise.resolve({scores:[],folders:[]})),onOpenSaved:onOpenSaved||(()=>Promise.resolve()),onPrefetch:onPrefetch||(()=>{}),onScoreExit:onScoreExit||(()=>{}),onFingerScroll:onFingerScroll||(()=>Promise.resolve())})
    this.bridge=null;this.boundBridge=null;this.unsub=null;this.launchUnsub=null
    this.startupCreated=false;this.mode='none';this.busy=false;this.pending=false;this.reconnecting=false
    this.libraryScores=[];this.libraryFolders=[];this.libraryItems=[];this.librarySelected=0;this.libraryFolderId=null;this.libraryPage=0;this.libraryChunk=0;this.footerTimer=null
    this.autoScrolling=false;this.fingerScroll=false;this.scrollEnabled=true;this.lastEventAt=0;this.navigating=false;this.logoImage=null;this.logoBytes=null
  }
  async ensureBridge(force=false){
    if(force)this.bridge=null
    if(this.bridge)return this.bridge
    let last
    for(let a=0;a<5;a++){try{this.bridge=await waitForEvenAppBridge();if(this.bridge)return this.bridge}catch(e){last=e}await sleep(180+120*a)}
    throw last||new Error('Even G2 Bridge nicht erreichbar.')
  }
  bindEvents(){
    if(!this.bridge)return
    if(this.unsub&&this.boundBridge===this.bridge)return
    try{this.unsub?.()}catch{};this.unsub=null;this.boundBridge=this.bridge
    this.unsub=this.bridge.onEvenHubEvent(async ev=>{
      const now=Date.now();if(now-this.lastEventAt<70)return;this.lastEventAt=now
      if(this.navigating)return;this.navigating=true
      try{
        const type=eventType(ev)
        if(type===OsEventTypeList.DOUBLE_CLICK_EVENT){this.autoScrolling=false;this.onScoreExit();try{await this.bridge.shutDownPageContainer(1)}catch{};this.mode='none';return}
        if(this.mode==='library'){
          const liRaw=ev?.listEvent?.currentSelectItemIndex
          const li=liRaw==null?null:Number(liRaw)
          const selectedName=ev?.listEvent?.currentSelectItemName
          const oldSelected=this.librarySelected
          if(Number.isInteger(li)){
            this.librarySelected=Math.max(0,Math.min(this.libraryItems.length-1,this.libraryChunk*20+li));this.libraryPage=Math.floor(this.librarySelected/4)
          }else if(selectedName){
            // Some firmware revisions report the selected label but not the index.
            // Resolve it inside the current native 20-item chunk so clicks (especially ZURÜCK)
            // always target the item highlighted on the glasses.
            const start=this.libraryChunk*20,end=Math.min(this.libraryItems.length,start+20)
            const local=this.libraryItems.slice(start,end).findIndex(x=>fitName(x.name)===selectedName)
            if(local>=0){this.librarySelected=start+local;this.libraryPage=Math.floor(this.librarySelected/4)}
          }
          if(type===OsEventTypeList.SCROLL_BOTTOM_EVENT||type===OsEventTypeList.SCROLL_TOP_EVENT){
            const dir=type===OsEventTypeList.SCROLL_BOTTOM_EVENT?1:-1
            // Inside a folder an extra upward swipe while ZURÜCK is selected is a second,
            // very reliable way out. This avoids getting trapped if a firmware click event
            // does not carry the list index/name.
            if(dir<0&&this.libraryFolderId&&this.librarySelected===0&&oldSelected===0){await this.leaveFolder();return}
            // Native list firmware already moved the highlight. Do not add a second step.
            if(this.librarySelected===oldSelected){
              const local=this.librarySelected-this.libraryChunk*20
              const chunkLen=Math.min(20,this.libraryItems.length-this.libraryChunk*20)
              if((dir>0&&local===chunkLen-1)||(dir<0&&local===0))await this.moveLibrarySelection(dir)
            }
          }else if(type===OsEventTypeList.CLICK_EVENT)await this.openSelectedLibraryItem()
          return
        }
        if(this.mode==='score'){
          if(type===OsEventTypeList.CLICK_EVENT){this.autoScrolling=false;this.onScoreExit();await this.showLibrary(false);return}
          if(this.autoScrolling)return
          // Scroll OFF = normal page navigation. Finger mode only intercepts swipes when explicitly enabled.
          if(this.scrollEnabled&&this.fingerScroll&&(type===OsEventTypeList.SCROLL_BOTTOM_EVENT||type===OsEventTypeList.SCROLL_TOP_EVENT)){await this.onFingerScroll(type===OsEventTypeList.SCROLL_BOTTOM_EVENT?1:-1);return}
          const i=this.getIndex(),count=this.getViewCount()
          if(type===OsEventTypeList.SCROLL_BOTTOM_EVENT&&i<count-1){await this.setIndex(i+1);await this.requestRender(true);this.onPrefetch(i+1)}
          else if(type===OsEventTypeList.SCROLL_TOP_EVENT&&i>0){await this.setIndex(i-1);await this.requestRender(true);this.onPrefetch(i-1)}
        }
      }catch(err){console.error(err);this.onStatus('G2-Steuerung: '+(err?.message||err))}finally{this.navigating=false}
    })
  }
  setScrollOptions({enabled=true,finger=false}={}){this.scrollEnabled=!!enabled;this.fingerScroll=!!finger}
  setAutoScrolling(v){this.autoScrolling=!!v}
  async showStartupNotice(){
    const b=await this.ensureBridge();this.bindEvents()
    if(this.startupCreated)return
    const res=await b.createStartUpPageContainer({containerTotalNum:1,textObject:[{xPosition:0,yPosition:0,width:576,height:288,borderWidth:0,borderColor:0,paddingLength:18,containerID:30,containerName:'startup',content:'SHEET MUSIC\n\nStarted successfully.\nLoading your library...',isEventCapture:1,zOrderIndex:1}]})
    if(res!==0)throw new Error('Startanzeige konnte nicht erstellt werden: '+res)
    this.startupCreated=true;this.mode='startup'
  }
  async boot(){
    const b=await this.ensureBridge();this.bindEvents();if(!this.launchUnsub&&b.onLaunchSource)this.launchUnsub=b.onLaunchSource(()=>{})
    await this.showStartupNotice();await this.showLibrary(true)
  }
  async rebuild(payload,label){
    const b=await this.ensureBridge();this.bindEvents()
    if(!this.startupCreated){await this.showStartupNotice()}
    let ok=await b.rebuildPageContainer(payload)
    if(ok!==true){
      // Do not call createStartUpPageContainer a second time. Re-acquire the bridge and retry one rebuild.
      this.bridge=null;this.boundBridge=null;try{this.unsub?.()}catch{};this.unsub=null
      const b2=await this.ensureBridge(true);this.bindEvents();ok=await b2.rebuildPageContainer(payload)
    }
    if(ok!==true)throw new Error(label+' konnte nicht erstellt werden.')
  }
  async logoPngBytes(){
    if(this.logoBytes)return this.logoBytes
    if(!this.logoImage){
      this.logoImage=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=logoUrl})
    }
    const img=this.logoImage
    const c=document.createElement('canvas');c.width=288;c.height=96
    const x=c.getContext('2d',{alpha:false});x.fillStyle='#000';x.fillRect(0,0,c.width,c.height)
    const scale=Math.min(276/img.naturalWidth,92/img.naturalHeight),w=Math.round(img.naturalWidth*scale),h=Math.round(img.naturalHeight*scale)
    x.drawImage(img,Math.round((288-w)/2),Math.round((96-h)/2),w,h)
    this.logoBytes=await new Promise((resolve,reject)=>c.toBlob(async b=>{if(!b)return reject(new Error('Logo'));resolve(new Uint8Array(await b.arrayBuffer()))},'image/png'))
    return this.logoBytes
  }
  rebuildLibraryItems(){
    const folders=[...this.libraryFolders].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'de'))
    if(this.libraryFolderId){
      const f=folders.find(x=>x.id===this.libraryFolderId)
      if(!f){this.libraryFolderId=null;return this.rebuildLibraryItems()}
      this.libraryItems=[{kind:'back',id:'__back__',name:'‹ ZURÜCK'},...this.libraryScores.filter(s=>s.folderId===f.id).map(s=>({kind:'score',id:s.id,name:s.name||s.fileName||'Unbenannte Noten'}))]
    }else{
      const ids=new Set(folders.map(f=>f.id)),root=this.libraryScores.filter(s=>!s.folderId||!ids.has(s.folderId))
      this.libraryItems=[...folders.map(f=>{const count=this.libraryScores.filter(s=>s.folderId===f.id).length;return {kind:'folder',id:f.id,name:`▸ ${f.name||'Ordner'}`,count}}),...root.map(s=>({kind:'score',id:s.id,name:s.name||s.fileName||'Unbenannte Noten'}))]
    }
    this.librarySelected=Math.max(0,Math.min(this.librarySelected,Math.max(0,this.libraryItems.length-1)))
    this.libraryPage=Math.floor(this.librarySelected/4)
    this.libraryChunk=Math.floor(this.librarySelected/20)
  }
  async reloadLibrary(){const snap=await this.getLibrary();this.libraryScores=Array.isArray(snap)?snap:(snap?.scores||[]);this.libraryFolders=snap?.folders||[];this.rebuildLibraryItems()}
  libraryPayload(){
    const chunkStart=this.libraryChunk*20,visible=this.libraryItems.slice(chunkStart,chunkStart+20)
    const names=visible.length?visible.map(x=>fitName(x.name,46)):['Keine Noten vorhanden']
    const folder=this.libraryFolderId?this.libraryFolders.find(f=>f.id===this.libraryFolderId)?.name:'Bibliothek'
    return {containerTotalNum:3,textObject:[
      {xPosition:22,yPosition:98,width:532,height:24,borderWidth:0,borderColor:0,paddingLength:0,containerID:22,containerName:'folder',content:'SHEET MUSIC · '+fitName(folder||'Bibliothek',38),isEventCapture:0,zOrderIndex:2}
    ],imageObject:[
      {xPosition:144,yPosition:0,width:288,height:96,containerID:21,containerName:'wetscher-logo',zOrderIndex:1}
    ],listObject:[{xPosition:22,yPosition:126,width:532,height:156,borderWidth:1,borderColor:5,borderRadius:5,paddingLength:4,containerID:23,containerName:'score-list',zOrderIndex:3,itemContainer:{itemCount:names.length,itemWidth:0,isItemSelectBorderEn:1,itemName:names},isEventCapture:1}]}
  }
  async renderLibrary(){
    await this.rebuild(this.libraryPayload(),'Bibliothek');this.mode='library'
    this.librarySelected=this.libraryChunk*20
    this.libraryPage=Math.floor(this.librarySelected/4)
    try{
      const b=await this.ensureBridge(),bytes=await this.logoPngBytes()
      const r=await b.updateImageRawData({containerID:21,containerName:'wetscher-logo',imageData:bytes})
      if(!imageOk(r))console.warn('Logo update:',r)
    }catch(e){console.warn('Wetscher logo could not be sent',e)}
    this.onStatus('G2-Bibliothek bereit')
  }
  async showLibrary(reload=true){if(reload)await this.reloadLibrary();else this.rebuildLibraryItems();await this.renderLibrary()}
  async moveLibrarySelection(delta){
    if(!this.libraryItems.length)return
    const next=Math.max(0,Math.min(this.libraryItems.length-1,this.librarySelected+delta));if(next===this.librarySelected)return
    const oldChunk=this.libraryChunk;this.librarySelected=next;this.libraryPage=Math.floor(next/4);this.libraryChunk=Math.floor(next/20)
    if(this.libraryChunk!==oldChunk)await this.renderLibrary()
  }
  async setLibraryLoading(text='Lade Noten…'){try{const b=await this.ensureBridge();await b.textContainerUpgrade({containerID:22,containerName:'folder',content:text})}catch{}}
  async leaveFolder(){
    this.libraryFolderId=null;this.librarySelected=0;this.libraryPage=0;this.libraryChunk=0;this.rebuildLibraryItems();await this.renderLibrary()
  }
  async openSelectedLibraryItem(){
    const item=this.libraryItems[this.librarySelected];if(!item)return
    if(item.kind==='back'){await this.leaveFolder();return}
    if(item.kind==='folder'){this.libraryFolderId=item.id;this.librarySelected=0;this.libraryPage=0;this.libraryChunk=0;this.rebuildLibraryItems();await this.renderLibrary();return}
    if(item.kind==='score'&&item.id){await this.setLibraryLoading('LADE NOTEN …');this.onStatus('Lade Noten…');await this.onOpenSaved(item.id);await this.createScorePage();await this.requestRender(true);this.onPrefetch(this.getIndex())}
  }
  scorePayload(){return {containerTotalNum:5,textObject:[{xPosition:0,yPosition:0,width:576,height:288,borderWidth:0,borderColor:0,paddingLength:0,containerID:1,containerName:'events',content:' ',isEventCapture:1,zOrderIndex:1}],imageObject:[{xPosition:0,yPosition:0,width:288,height:144,containerID:2,containerName:'q1',zOrderIndex:2},{xPosition:288,yPosition:0,width:288,height:144,containerID:3,containerName:'q2',zOrderIndex:3},{xPosition:0,yPosition:144,width:288,height:144,containerID:4,containerName:'q3',zOrderIndex:4},{xPosition:288,yPosition:144,width:288,height:144,containerID:5,containerName:'q4',zOrderIndex:5}]}}
  async createScorePage(){if(this.mode==='score')return;await this.rebuild(this.scorePayload(),'Notenansicht');this.mode='score'}
  async start(){this.onStatus('Verbinde mit Even G2…');await this.ensureBridge();this.bindEvents();await this.createScorePage();await this.requestRender(true);this.onPrefetch(this.getIndex())}
  async showPreparedView(view){if(!view?.canvas)return;while(this.busy)await sleep(10);this.busy=true;try{await this.createScorePage();await this.sendViewReliable(view)}finally{this.busy=false}}
  async refreshLibraryIfOpen(){await this.reloadLibrary();if(this.mode==='library')await this.renderLibrary()}
  async requestRender(immediate=false){this.pending=true;if(this.busy&&!immediate)return;await this.flush()}
  async flush(){if(this.busy)return;this.busy=true;try{while(this.pending){this.pending=false;const v=this.getView();if(!v?.canvas)continue;await this.createScorePage();await this.sendViewReliable(v)}if(this.mode==='score')this.onStatus('G2 aktualisiert.')}finally{this.busy=false}}
  async reconnect(){
    if(this.reconnecting)return;this.reconnecting=true;this.onStatus('G2-Verbindung wird wiederhergestellt…')
    try{try{this.unsub?.()}catch{};this.unsub=null;this.boundBridge=null;this.bridge=null;await this.ensureBridge(true);this.bindEvents();/* startupCreated intentionally stays true: startup is one-shot */}
    finally{this.reconnecting=false}
  }
  async sendViewReliable(view){const prepared=Array.isArray(view?.g2Parts)&&view.g2Parts.length===4?view.g2Parts:null;await this.sendCanvasReliable(view.canvas,prepared)}
  async sendCanvasReliable(canvas,prepared=null){try{return await this.sendCanvas(canvas,prepared)}catch(first){console.warn('G2 send failed; retrying bridge once',first);await this.reconnect();return await this.sendCanvas(canvas,prepared)}}
  async sendCanvas(canvas,prepared=null){
    const b=await this.ensureBridge();this.bindEvents();const parts=[[2,'q1',0,0],[3,'q2',288,0],[4,'q3',0,144],[5,'q4',288,144]],bytes=prepared||await Promise.all(parts.map(([,n,x,y])=>quadrantPngBytes(canvas,x,y)))
    for(let i=0;i<4;i++){const [id,name]=parts[i],r=await b.updateImageRawData({containerID:id,containerName:name,imageData:bytes[i]});if(!imageOk(r))throw new Error(`Bild-Update ${name}: ${r}`)}
  }
}
