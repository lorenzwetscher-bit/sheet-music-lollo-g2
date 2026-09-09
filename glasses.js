import { waitForEvenAppBridge, OsEventTypeList } from '@evenrealities/even_hub_sdk'
import { quadrantPngBytes } from './score.js'
import logoUrl from './wetscher-logo-g2.png?url'

const pageOk=r=>r===0||r===true||r==='success'
const imageOk=r=>r===0||r===true||r==='success'
const clickType=e=>(e?.eventType ?? OsEventTypeList.CLICK_EVENT)

export class G2Viewer{
  constructor({getView,getIndex,setIndex,getViewCount,onStatus,getLibrary,onOpenSaved}){
    this.getView=getView;this.getIndex=getIndex;this.setIndex=setIndex;this.getViewCount=getViewCount
    this.onStatus=onStatus||(()=>{});this.getLibrary=getLibrary||(()=>Promise.resolve([]));this.onOpenSaved=onOpenSaved||(()=>Promise.resolve())
    this.bridge=null;this.unsub=null;this.launchUnsub=null;this.started=false;this.mode='none'
    this.busy=false;this.pending=false;this.libraryRows=[];this.libraryPage=0;this.libraryMap=[];this.logoBytes=null
  }

  async ensureBridge(force=false){
    if(force)this.bridge=null
    if(!this.bridge)this.bridge=await waitForEvenAppBridge()
    return this.bridge
  }

  async getLogoBytes(){
    if(this.logoBytes)return this.logoBytes
    const res=await fetch(logoUrl)
    if(!res.ok)throw new Error('Logo konnte nicht geladen werden.')
    this.logoBytes=new Uint8Array(await res.arrayBuffer())
    return this.logoBytes
  }

  async pushLibraryLogo(){
    const b=await this.ensureBridge()
    const bytes=await this.getLogoBytes()
    const result=await b.updateImageRawData({containerID:21,containerName:'brandlogo',imageData:bytes})
    if(!imageOk(result))throw new Error('Logo-Update fehlgeschlagen: '+result)
  }

  async boot(){
    const b=await this.ensureBridge()
    this.bindEvents()
    if(!this.launchUnsub&&b.onLaunchSource){
      this.launchUnsub=b.onLaunchSource(source=>{
        if(source==='glassesMenu')this.showLibrary().catch(e=>this.onStatus('G2-Menü fehlgeschlagen: '+(e?.message||e)))
      })
    }
  }

  async createScorePage(rebuild=false){
    const b=await this.ensureBridge()
    const payload={
      containerTotalNum:5,
      textObject:[{xPosition:0,yPosition:0,width:576,height:288,borderWidth:0,borderColor:0,paddingLength:0,containerID:1,containerName:'events',content:' ',isEventCapture:1,zOrderIndex:1}],
      imageObject:[
        {xPosition:0,yPosition:0,width:288,height:144,containerID:2,containerName:'q1',zOrderIndex:2},
        {xPosition:288,yPosition:0,width:288,height:144,containerID:3,containerName:'q2',zOrderIndex:3},
        {xPosition:0,yPosition:144,width:288,height:144,containerID:4,containerName:'q3',zOrderIndex:4},
        {xPosition:288,yPosition:144,width:288,height:144,containerID:5,containerName:'q4',zOrderIndex:5}
      ]
    }
    const res=(this.started||rebuild)?await b.rebuildPageContainer(payload):await b.createStartUpPageContainer(payload)
    if(!pageOk(res))throw new Error('Notenansicht konnte nicht erstellt werden: '+res)
    this.started=true;this.mode='score'
  }

  buildLibraryItems(rows,page){
    // With the branded header, keep the list compact enough to stay readable.
    const pageSize=10,start=page*pageSize,chunk=rows.slice(start,start+pageSize),names=[],map=[]
    if(page>0){names.push('‹ Previous');map.push({nav:-1})}
    for(const r of chunk){names.push(String(r.name||r.fileName||'Untitled').slice(0,52));map.push({id:r.id})}
    if(start+pageSize<rows.length){names.push('More ›');map.push({nav:1})}
    return {names,map}
  }

  async showLibrary(page=this.libraryPage){
    const b=await this.ensureBridge();this.bindEvents()
    const rows=await this.getLibrary();this.libraryRows=rows||[]
    const pages=Math.max(1,Math.ceil(this.libraryRows.length/10));this.libraryPage=Math.max(0,Math.min(page,pages-1))
    let payload
    if(!this.libraryRows.length){
      payload={
        containerTotalNum:3,
        imageObject:[{xPosition:144,yPosition:4,width:288,height:64,containerID:21,containerName:'brandlogo',zOrderIndex:2}],
        textObject:[
          {xPosition:0,yPosition:70,width:576,height:34,borderWidth:0,paddingLength:0,containerID:22,containerName:'brandtitle',content:'SHEET MUSIC',isEventCapture:0,zOrderIndex:2},
          {xPosition:0,yPosition:106,width:576,height:182,borderWidth:0,paddingLength:10,containerID:20,containerName:'libraryempty',content:'No saved sheet music.\n\nSave a score on your phone first.',isEventCapture:1,zOrderIndex:1}
        ]
      }
      this.libraryMap=[]
    }else{
      const {names,map}=this.buildLibraryItems(this.libraryRows,this.libraryPage);this.libraryMap=map
      payload={
        containerTotalNum:3,
        imageObject:[{xPosition:144,yPosition:4,width:288,height:64,containerID:21,containerName:'brandlogo',zOrderIndex:2}],
        textObject:[{xPosition:0,yPosition:70,width:576,height:30,borderWidth:0,paddingLength:0,containerID:22,containerName:'brandtitle',content:'SHEET MUSIC',isEventCapture:0,zOrderIndex:2}],
        listObject:[{xPosition:0,yPosition:102,width:576,height:186,borderWidth:0,paddingLength:2,containerID:20,containerName:'library',isEventCapture:1,itemContainer:{itemCount:names.length,itemWidth:0,isItemSelectBorderEn:1,itemName:names}}]
      }
    }
    const res=this.started?await b.rebuildPageContainer(payload):await b.createStartUpPageContainer(payload)
    if(!pageOk(res))throw new Error('Bibliothek konnte nicht angezeigt werden: '+res)
    this.started=true;this.mode='library'
    // The G2 renders white/gray source pixels in its native green brightness levels.
    await this.pushLibraryLogo()
    this.onStatus('Bibliothek auf der G2 geöffnet.')
  }

  bindEvents(){
    if(this.unsub||!this.bridge)return
    this.unsub=this.bridge.onEvenHubEvent(async ev=>{
      try{
        const sysType=ev?.sysEvent?.eventType ?? null
        const textType=ev?.textEvent?.eventType ?? null
        const listType=clickType(ev?.listEvent)
        if(sysType===OsEventTypeList.DOUBLE_CLICK_EVENT||textType===OsEventTypeList.DOUBLE_CLICK_EVENT||listType===OsEventTypeList.DOUBLE_CLICK_EVENT){
          try{await this.bridge.shutDownPageContainer(1)}catch{};this.started=false;this.mode='none';return
        }
        if(this.mode==='library'&&ev?.listEvent){
          if(listType===OsEventTypeList.CLICK_EVENT){
            const i=ev.listEvent.currentSelectItemIndex ?? 0,item=this.libraryMap[i]
            if(!item)return
            if(item.nav){await this.showLibrary(this.libraryPage+item.nav);return}
            if(item.id){
              this.onStatus('Öffne Noten auf der G2…')
              await this.onOpenSaved(item.id)
              await this.createScorePage(true)
              await this.requestRender(true)
            }
          }
          return
        }
        if(this.mode==='score'){
          const type=textType ?? sysType
          const idx=this.getIndex(),count=this.getViewCount()
          if(type===OsEventTypeList.SCROLL_BOTTOM_EVENT&&idx<count-1){
            await this.setIndex(idx+1)
            await this.requestRender(true)
          }else if(type===OsEventTypeList.SCROLL_TOP_EVENT&&idx>0){
            await this.setIndex(idx-1)
            await this.requestRender(true)
          }else if(type===OsEventTypeList.CLICK_EVENT){
            await this.showLibrary()
          }
        }
      }catch(err){
        console.error(err);this.onStatus('G2-Steuerung fehlgeschlagen: '+(err?.message||err))
      }
    })
  }

  async start(){
    this.onStatus('Verbinde mit Even G2…')
    await this.ensureBridge();this.bindEvents()
    await this.createScorePage(this.started)
    await this.requestRender(true)
  }

  async refreshLibraryIfOpen(){if(this.mode==='library')await this.showLibrary(this.libraryPage)}

  async requestRender(immediate=false){
    this.pending=true
    if(this.busy&&!immediate)return
    await this.flush()
  }

  async flush(){
    if(this.busy)return
    this.busy=true
    try{
      while(this.pending){
        this.pending=false
        const view=this.getView()
        if(!view?.canvas)continue
        try{await this.send(view.canvas)}
        catch(err){
          console.warn('G2 update failed, reconnecting once',err)
          this.onStatus('G2 kurz getrennt – verbinde neu…')
          try{this.unsub?.()}catch{};this.unsub=null;this.started=false
          await this.ensureBridge(true);this.bindEvents();await this.createScorePage(false);await this.send(view.canvas)
        }
      }
      if(this.mode==='score')this.onStatus('G2 automatisch aktualisiert.')
    }finally{this.busy=false}
  }

  async send(canvas){
    const b=await this.ensureBridge()
    const parts=[[2,'q1',0,0],[3,'q2',288,0],[4,'q3',0,144],[5,'q4',288,144]]
    const bytes=[]
    for(const [,name,sx,sy] of parts)bytes.push([name,await quadrantPngBytes(canvas,sx,sy)])
    for(let i=0;i<parts.length;i++){
      const [id,name]=parts[i],result=await b.updateImageRawData({containerID:id,containerName:name,imageData:bytes[i][1]})
      if(!imageOk(result))throw new Error(`Bild-Update ${name}: ${result}`)
    }
  }
}
