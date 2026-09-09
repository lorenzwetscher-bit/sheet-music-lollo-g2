import { waitForEvenAppBridge, OsEventTypeList } from '@evenrealities/even_hub_sdk'
import { halfPngBytes } from './score.js'

function blankCanvas(){
  const c=document.createElement('canvas')
  c.width=576;c.height=144
  const x=c.getContext('2d')
  // Black = display off/transparent on G2. This avoids a bright green block
  // when the second row is unused.
  x.fillStyle='#000';x.fillRect(0,0,576,144)
  return c
}

function assertImageUpdate(result,name){
  // SDK result is an enum on current versions (0 = accepted/success).
  if(typeof result==='number' && result!==0){
    throw new Error(`G2 image update failed (${name}): ${result}`)
  }
}

export class G2Viewer {
  constructor(getLines,getIndex,setIndex,getRowsPerView){
    this.getLines=getLines
    this.getIndex=getIndex
    this.setIndex=setIndex
    this.getRowsPerView=getRowsPerView
    this.bridge=null
    this.unsub=null
    this.busy=false
  }

  async start(){
    this.bridge=await waitForEvenAppBridge()

    // Display guideline compliant image-first page:
    // - 576x288 canvas
    // - max 4 image containers, each max 288x144
    // - exactly one event-capture text container behind the images
    // - explicit unique zOrderIndex on every container
    const res=await this.bridge.createStartUpPageContainer({
      containerTotalNum:5,
      textObject:[
        {
          xPosition:0,yPosition:0,width:576,height:288,
          borderWidth:0,borderColor:0,paddingLength:0,
          containerID:1,containerName:'events',
          content:' ',isEventCapture:1,zOrderIndex:1
        }
      ],
      imageObject:[
        {xPosition:0,yPosition:0,width:288,height:144,containerID:2,containerName:'row1left',zOrderIndex:2},
        {xPosition:288,yPosition:0,width:288,height:144,containerID:3,containerName:'row1right',zOrderIndex:3},
        {xPosition:0,yPosition:144,width:288,height:144,containerID:4,containerName:'row2left',zOrderIndex:4},
        {xPosition:288,yPosition:144,width:288,height:144,containerID:5,containerName:'row2right',zOrderIndex:5}
      ]
    })

    if(res!==0) throw new Error('createStartUpPageContainer: '+res)
    await this.render()

    this.unsub=this.bridge.onEvenHubEvent(async ev=>{
      if(this.busy)return
      const e=ev?.textEvent||ev?.sysEvent
      const type=e?.eventType
      const lines=this.getLines()
      const step=Math.max(1,Number(this.getRowsPerView?.()||1))
      const idx=this.getIndex()

      if(type===OsEventTypeList.SCROLL_BOTTOM_EVENT && idx<lines.length-1){
        this.setIndex(Math.min(lines.length-1,idx+step))
        await this.render()
      } else if(type===OsEventTypeList.SCROLL_TOP_EVENT && idx>0){
        this.setIndex(Math.max(0,idx-step))
        await this.render()
      } else if(type===OsEventTypeList.DOUBLE_CLICK_EVENT){
        try{await this.bridge.shutDownPageContainer(0)}catch{}
      }
    })
  }

  async render(){
    const lines=this.getLines()
    const idx=this.getIndex()
    const rows=Math.max(1,Math.min(2,Number(this.getRowsPerView?.()||1)))
    if(!this.bridge||!lines.length)return
    this.busy=true
    try{
      const first=lines[idx]?.canvas || blankCanvas()
      const second=(rows===2 && lines[idx+1]?.canvas) ? lines[idx+1].canvas : blankCanvas()

      const row1left=await halfPngBytes(first,0)
      const row1right=await halfPngBytes(first,288)
      const row2left=await halfPngBytes(second,0)
      const row2right=await halfPngBytes(second,288)

      // The Display docs explicitly require non-concurrent image sends.
      // Keep every transfer serialized and awaited.
      assertImageUpdate(await this.bridge.updateImageRawData({containerID:2,containerName:'row1left',imageData:row1left}),'row1left')
      assertImageUpdate(await this.bridge.updateImageRawData({containerID:3,containerName:'row1right',imageData:row1right}),'row1right')
      assertImageUpdate(await this.bridge.updateImageRawData({containerID:4,containerName:'row2left',imageData:row2left}),'row2left')
      assertImageUpdate(await this.bridge.updateImageRawData({containerID:5,containerName:'row2right',imageData:row2right}),'row2right')
    }finally{
      this.busy=false
    }
  }
}
