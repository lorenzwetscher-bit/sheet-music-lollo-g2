function smooth(a,r){
  const out=new Array(a.length).fill(0)
  for(let i=0;i<a.length;i++){
    let sum=0,n=0
    for(let j=Math.max(0,i-r);j<=Math.min(a.length-1,i+r);j++){sum+=a[j];n++}
    out[i]=sum/Math.max(1,n)
  }
  return out
}

function runs(mask){
  const out=[];let s=-1
  for(let i=0;i<=mask.length;i++){
    const on=i<mask.length?mask[i]:false
    if(on&&s<0)s=i
    if(!on&&s>=0){out.push([s,i-1]);s=-1}
  }
  return out
}

function getGray(c){
  const ctx=c.getContext('2d',{willReadFrequently:true})
  const w=c.width,h=c.height,d=ctx.getImageData(0,0,w,h).data
  const g=new Uint8Array(w*h)
  for(let p=0,i=0;p<g.length;p++,i+=4)g[p]=Math.round(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2])
  return g
}

function percentile(a,p){
  if(!a.length)return 0
  const b=[...a].sort((x,y)=>x-y)
  return b[Math.max(0,Math.min(b.length-1,Math.floor((b.length-1)*p)))]
}

function rowDensity(gray,w,h,x0,x1){
  const out=new Array(h).fill(0)
  const step=Math.max(1,Math.floor(w/900))
  for(let y=0;y<h;y++){
    let dark=0,total=0
    for(let x=x0;x<x1;x+=step){if(gray[y*w+x]<188)dark++;total++}
    out[y]=dark/Math.max(1,total)
  }
  return out
}

function staffLineEvidence(gray,w,h,top,bottom){
  const x0=Math.round(w*.08),x1=Math.round(w*.94),scores=[]
  const step=Math.max(1,Math.floor(w/900))
  for(let y=Math.max(0,top);y<=Math.min(h-1,bottom);y++){
    let dark=0,total=0
    for(let x=x0;x<x1;x+=step){if(gray[y*w+x]<150)dark++;total++}
    scores.push(dark/Math.max(1,total))
  }
  const strong=runs(scores.map(v=>v>Math.max(.16,percentile(scores,.90)*.68)))
  if(strong.length<3)return 0
  const centers=strong.map(([a,b])=>(a+b)/2)
  let regular=0
  for(let i=0;i+4<centers.length;i++){
    const ds=[];for(let j=0;j<4;j++)ds.push(centers[i+j+1]-centers[i+j])
    const avg=ds.reduce((a,b)=>a+b,0)/4
    const dev=ds.reduce((a,b)=>a+Math.abs(b-avg),0)/4
    if(avg>=2&&avg<=Math.max(35,h*.025)&&dev/avg<.35)regular++
  }
  return Math.min(1,strong.length/10+regular*.35)
}

function trimHorizontal(gray,w,h,top,bottom){
  const col=new Array(w).fill(0),stepY=Math.max(1,Math.floor((bottom-top+1)/180))
  for(let x=0;x<w;x++){
    let d=0,n=0
    for(let y=top;y<=bottom;y+=stepY){if(gray[y*w+x]<205)d++;n++}
    col[x]=d/Math.max(1,n)
  }
  const th=Math.max(.012,percentile(col,.82)*.28)
  const xs=[];for(let x=0;x<w;x++)if(col[x]>th)xs.push(x)
  if(!xs.length)return [Math.round(w*.04),Math.round(w*.96)]
  const pad=Math.max(8,Math.round(w*.015))
  return [Math.max(0,xs[0]-pad),Math.min(w-1,xs[xs.length-1]+pad)]
}

function mergeBands(bands,gap){
  if(!bands.length)return []
  const out=[bands[0].slice()]
  for(let i=1;i<bands.length;i++){
    const prev=out[out.length-1],cur=bands[i]
    if(cur[0]-prev[1]<=gap)prev[1]=cur[1]
    else out.push(cur.slice())
  }
  return out
}

function splitOversized([a,b],density,h){
  const hh=b-a+1
  if(hh<=h*.16)return [[a,b]]
  const minGap=Math.max(8,Math.round(h*.006))
  const local=density.slice(a,b+1)
  const low=Math.max(.004,percentile(local,.28))
  const gaps=runs(local.map(v=>v<=low)).filter(([x,y])=>y-x+1>=minGap)
  if(!gaps.length)return [[a,b]]
  const out=[];let s=a
  for(const [ga,gb] of gaps){
    const cut=a+Math.round((ga+gb)/2)
    if(cut-s>h*.025)out.push([s,cut-1])
    s=cut+1
  }
  if(b-s>h*.025)out.push([s,b])
  return out.length?out:[[a,b]]
}

function detectStaffCuts(c){
  const w=c.width,h=c.height,gray=getGray(c)
  const x0=Math.round(w*.05),x1=Math.round(w*.95)
  const density=rowDensity(gray,w,h,x0,x1)
  const sm=smooth(density,Math.max(1,Math.round(h/1200)))
  const p86=percentile(sm,.86)
  const threshold=Math.max(.010,p86*.34)
  let bands=runs(sm.map(v=>v>threshold))
  bands=mergeBands(bands,Math.max(12,Math.round(h*.012)))
  const minH=Math.max(22,Math.round(h*.017))
  const split=[]
  for(const b of bands){
    if(b[1]-b[0]+1>h*.34)split.push(...splitOversized(b,sm,h))
    else split.push(b)
  }
  bands=split.filter(([a,b])=>b-a+1>=minH&&b-a+1<=h*.29)

  const pad=Math.max(8,Math.round(h*.008))
  let candidates=bands.map(([a,b])=>{
    const top=Math.max(0,a-pad),bottom=Math.min(h-1,b+pad)
    const [left,right]=trimHorizontal(gray,w,h,top,bottom)
    return {top,bottom,left,right,evidence:staffLineEvidence(gray,w,h,top,bottom)}
  })

  // Keep density candidates, but rank staff-like ones higher. Do not hard-reject.
  if(candidates.length){
    const ranked=[...candidates].sort((a,b)=>(b.evidence-a.evidence)||((a.bottom-a.top)-(b.bottom-b.top)))
    const keep=[]
    for(const cnd of ranked){
      const cy=(cnd.top+cnd.bottom)/2,hh=cnd.bottom-cnd.top+1
      if(!keep.some(k=>Math.abs(cy-(k.top+k.bottom)/2)<Math.min(hh,k.bottom-k.top+1)*.48))keep.push(cnd)
    }
    candidates=keep.sort((a,b)=>a.top-b.top)
  }

  // Robust fallback: page strips, but bias toward areas containing horizontal ink.
  if(candidates.length<2){
    const top0=Math.round(h*.07),bottom0=Math.round(h*.96),usable=bottom0-top0
    const parts=Math.max(4,Math.min(10,Math.round(usable/Math.max(90,w*.18))))
    const step=usable/parts,extra=[]
    for(let i=0;i<parts;i++){
      const top=Math.round(top0+i*step),bottom=Math.round(top0+(i+1)*step-1)
      const [left,right]=trimHorizontal(gray,w,h,top,bottom)
      extra.push({top,bottom,left,right,evidence:staffLineEvidence(gray,w,h,top,bottom)})
    }
    if(!candidates.length)candidates=extra
    else{
      for(const e of extra){
        const cy=(e.top+e.bottom)/2
        if(!candidates.some(c=>Math.abs(cy-(c.top+c.bottom)/2)<(c.bottom-c.top+1)*.7))candidates.push(e)
      }
      candidates.sort((a,b)=>a.top-b.top)
    }
  }
  return candidates
}

export function extractCutDescriptors(c,pageIndex=0){
  return detectStaffCuts(c).map((b,i)=>({
    source:c,pageIndex,lineIndex:i,
    bounds:{top:b.top,bottom:b.bottom,left:b.left,right:b.right}
  }))
}

export function buildViews(descriptors,linesPerView=1,totalPages=1){
  const n=Math.max(1,Math.min(8,Number(linesPerView)||1)),views=[]
  const byPage=new Map()
  for(const d of descriptors){
    const p=d.pageIndex||0
    if(!byPage.has(p))byPage.set(p,[])
    byPage.get(p).push(d)
  }
  for(const [pageIndex,items0] of [...byPage.entries()].sort((a,b)=>a[0]-b[0])){
    const items=[...items0].sort((a,b)=>a.bounds.top-b.bounds.top)
    for(let i=0;i<items.length;i+=n){
      const chunk=items.slice(i,i+n)
      views.push({pageIndex,totalPages,items:chunk})
    }
  }
  return views
}

function clamp(v,min,max){return Math.max(min,Math.min(max,v))}

function cropView(view,adj={}){
  const items=view.items||[]
  if(!items.length)throw new Error('Kein Ausschnitt vorhanden.')
  const c=items[0].source,w=c.width,h=c.height
  let left=Math.min(...items.map(x=>x.bounds.left)),right=Math.max(...items.map(x=>x.bounds.right))
  let top=Math.min(...items.map(x=>x.bounds.top)),bottom=Math.max(...items.map(x=>x.bounds.bottom))
  const baseW=right-left+1,baseH=bottom-top+1
  const scaleW=Number(adj.cropWidth||100)/100,scaleH=Number(adj.cropHeight||100)/100
  const cropW=clamp(Math.round(baseW*scaleW),Math.round(w*.28),w)
  const cropH=clamp(Math.round(baseH*scaleH),Math.max(45,Math.round(h*.025)),Math.round(h*.92))
  const cx=(left+right)/2+Number(adj.cropX||0),cy=(top+bottom)/2+Number(adj.cropY||0)
  left=clamp(Math.round(cx-cropW/2),0,Math.max(0,w-cropW))
  top=clamp(Math.round(cy-cropH/2),0,Math.max(0,h-cropH))
  const raw=document.createElement('canvas');raw.width=cropW;raw.height=cropH
  raw.getContext('2d',{alpha:false}).drawImage(c,left,top,cropW,cropH,0,0,cropW,cropH)
  return raw
}

function applyInkMode(canvas,{contrast=130,invert=false,cutout=true}={}){
  const ctx=canvas.getContext('2d',{willReadFrequently:true}),im=ctx.getImageData(0,0,canvas.width,canvas.height)
  const cVal=Math.max(-254,Math.min(254,Number(contrast))),factor=(259*(cVal+255))/(255*(259-cVal))
  // adaptive paper threshold from sampled luminance
  const samples=[]
  for(let i=0;i<im.data.length;i+=Math.max(4,Math.floor(im.data.length/5000/4)*4)){
    samples.push(.2126*im.data[i]+.7152*im.data[i+1]+.0722*im.data[i+2])
  }
  const paper=percentile(samples,.72)
  const threshold=Math.max(135,Math.min(235,paper-22))
  for(let i=0;i<im.data.length;i+=4){
    let lum=.2126*im.data[i]+.7152*im.data[i+1]+.0722*im.data[i+2]
    lum=Math.max(0,Math.min(255,factor*(lum-128)+128))
    let out
    if(cutout){
      const ink=Math.max(0,Math.min(1,(threshold-lum)/Math.max(28,threshold-55)))
      out=invert?255-Math.round(ink*255):Math.round(ink*255)
    }else{
      out=invert?lum:255-lum
    }
    out=Math.max(0,Math.min(255,Math.round(out/17)*17))
    im.data[i]=im.data[i+1]=im.data[i+2]=out;im.data[i+3]=255
  }
  ctx.putImageData(im,0,0)
}

export async function processView(view,{contrast=130,invert=false,cutout=true,cropX=0,cropY=0,cropHeight=100,cropWidth=100}={},makePreview=true){
  const raw=cropView(view,{cropX,cropY,cropHeight,cropWidth})
  const out=document.createElement('canvas');out.width=576;out.height=288
  const ctx=out.getContext('2d',{alpha:false,willReadFrequently:true})
  ctx.fillStyle=invert?'#fff':'#000';ctx.fillRect(0,0,576,288)
  ctx.drawImage(raw,0,0,raw.width,raw.height,0,0,576,288)
  applyInkMode(out,{contrast,invert,cutout})
  let url=null
  if(makePreview){
    const blob=await new Promise((resolve,reject)=>out.toBlob(b=>b?resolve(b):reject(new Error('Vorschau konnte nicht erzeugt werden.')),'image/png'))
    url=URL.createObjectURL(blob)
  }
  // PNG bytes are prepared before a page turn. This is the reliable format used
  // by the hardware path; only the already encoded bytes cross BLE during swipe.
  const g2Parts=await Promise.all([[0,0],[288,0],[0,144],[288,144]].map(([sx,sy])=>quadrantPngBytes(out,sx,sy)))
  return {canvas:out,url,g2Parts}
}

export async function quadrantPngBytes(canvas,sx,sy){
  const c=document.createElement('canvas');c.width=288;c.height=144
  c.getContext('2d').drawImage(canvas,sx,sy,288,144,0,0,288,144)
  const blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('G2-Bild konnte nicht erzeugt werden.')),'image/png'))
  return new Uint8Array(await blob.arrayBuffer())
}
