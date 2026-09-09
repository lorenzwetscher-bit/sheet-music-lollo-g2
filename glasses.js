import { waitForEvenAppBridge, OsEventTypeList } from '@evenrealities/even_hub_sdk'
import { quadrantPngBytes } from './score.js'

function ok(result){return typeof result!=='number'||result===0}

export class G2Viewer{
  constructor(getView,getIndex,setIndex,getViewCount,onStatus){
    this.getView=getView;this.getIndex=getIndex;this.setIndex=setIndex;this.getViewCount=getViewCount;this.onStatus=onStatus||(()=>{})
    this.bridge=null;this.unsub=null;this.started=false;this.busy=false;this.pending=false;this.generation=0
  }

  async ensureBridge(force=false){
    if(force)this.bridge=null
    if(!this.bridge)this.bridge=await waitForEvenAppBridge()
    return this.bridge
  }

  async createPage(){
    const b=await this.ensureBridge()
    const res=await b.createStartUpPageContainer({
      containerTotalNum:5,
      textObject:[{xPosition:0,yPosition:0,width:576,height:288,borderWidth:0,borderColor:0,paddingLength:0,containerID:1,containerName:'events',content:' ',isEventCapture:1,zOrderIndex:1}],
      imageObject:[
        {xPosition:0,yPosition:0,width:288,height:144,containerID:2,containerName:'q1',zOrderIndex:2},
        {xPosition:288,yPosition:0,width:288,height:144,containerID:3,containerName:'q2',zOrderIndex:3},
        {xPosition:0,yPosition:144,width:288,height:144,containerID:4,containerName:'q3',zOrderIndex:4},
        {xPosition:288,yPosition:144,width:288,height:144,containerID:5,containerName:'q4',zOrderIndex:5}
      ]
    })
    if(!ok(res))throw new Error('Startseite konnte nicht erstellt werden: '+res)
    this.started=true
  }

  bindEvents(){
    if(this.unsub||!this.bridge)return
    this.unsub=this.bridge.onEvenHubEvent(async ev=>{
      const e=ev?.textEvent||ev?.sysEvent,type=e?.eventType,idx=this.getIndex(),count=this.getViewCount()
      if(type===OsEventTypeList.SCROLL_BOTTOM_EVENT&&idx<count-1){this.setIndex(idx+1);this.requestRender()}
      else if(type===OsEventTypeList.SCROLL_TOP_EVENT&&idx>0){this.setIndex(idx-1);this.requestRender()}
      else if(type===OsEventTypeList.DOUBLE_CLICK_EVENT){try{await this.bridge.shutDownPageContainer(0)}catch{}this.started=false}
    })
  }

  async start(){
    this.onStatus('Verbinde mit Even G2…')
    await this.ensureBridge()
    if(!this.started)await this.createPage()
    this.bindEvents()
    await this.requestRender(true)
  }

  async requestRender(immediate=false){
    this.pending=true
    const myGen=++this.generation
    if(this.busy&&!immediate)return
    await this.flush(myGen)
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
          await this.ensureBridge(true)
          await this.createPage();this.bindEvents();await this.send(view.canvas)
        }
      }
      this.onStatus('G2 aktualisiert.')
    }finally{this.busy=false}
  }

  async send(canvas){
    const b=await this.ensureBridge()
    const parts=[
      [2,'q1',0,0],[3,'q2',288,0],[4,'q3',0,144],[5,'q4',288,144]
    ]
    // Build bytes first, then send serialized. No overlapping bridge calls.
    const bytes=[]
    for(const [,name,sx,sy] of parts)bytes.push([name,await quadrantPngBytes(canvas,sx,sy)])
    for(let i=0;i<parts.length;i++){
      const [id,name]=parts[i],result=await b.updateImageRawData({containerID:id,containerName:name,imageData:bytes[i][1]})
      if(!ok(result))throw new Error(`Bild-Update ${name}: ${result}`)
    }
  }
}
