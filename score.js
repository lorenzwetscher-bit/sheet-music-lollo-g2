
function smooth(a,r){
  const out=new Array(a.length).fill(0)
  for(let i=0;i<a.length;i++){
    let sum=0,n=0
    for(let j=Math.max(0,i-r);j<=Math.min(a.length-1,i+r);j++){
      sum+=a[j];n++
    }
    out[i]=sum/Math.max(1,n)
  }
  return out
}

function runs(mask){
  const out=[]; let s=-1
  for(let i=0;i<=mask.length;i++){
    const on=i<mask.length?mask[i]:false
    if(on&&s<0)s=i
    if(!on&&s>=0){out.push([s,i-1]);s=-1}
  }
  return out
}

function getGray(c){
  const ctx=c.getContext('2d',{willReadFrequently:true})
  const w=c.width,h=c.height
  const d=ctx.getImageData(0,0,w,h).data
  const g=new Uint8Array(w*h)
  for(let p=0,i=0;p<g.length;p++,i+=4){
    g[p]=Math.round(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2])
  }
  return g
}

function rowDensity(gray,w,h,x0,x1){
  const out=new Array(h).fill(0)
  for(let y=0;y<h;y++){
    let dark=0,total=0
    for(let x=x0;x<x1;x+=2){
      if(gray[y*w+x]<182)dark++
      total++
    }
    out[y]=dark/Math.max(1,total)
  }
  return out
}

function staffLineEvidence(gray,w,h,top,bottom){
  // A real staff line is dark across a broad horizontal span.
  // Title text tends to be local/irregular; staff lines produce several
  // strong horizontal rows with near-regular spacing.
  const x0=Math.round(w*.10),x1=Math.round(w*.92)
  const scores=[]
  for(let y=Math.max(0,top);y<=Math.min(h-1,bottom);y++){
    let dark=0,total=0
    for(let x=x0;x<x1;x+=3){
      if(gray[y*w+x] < 145) dark++
      total++
    }
    scores.push({y,score:dark/Math.max(1,total)})
  }

  const strong=scores.filter(r=>r.score>.22)
  if(strong.length<4)return 0

  // Merge adjacent strong rows into line centers
  const groups=[]
  for(const r of strong){
    const last=groups[groups.length-1]
    if(last && r.y-last[last.length-1].y<=2) last.push(r)
    else groups.push([r])
  }
  const centers=groups.map(g=>Math.round(g.reduce((s,r)=>s+r.y,0)/g.length))
  if(centers.length<4)return 0

  let best=0
  // Search for 4-6 roughly equally spaced horizontal lines.
  for(let i=0;i<centers.length;i++){
    for(let j=i+3;j<Math.min(centers.length,i+7);j++){
      const seq=centers.slice(i,j+1)
      const gaps=[]
      for(let k=1;k<seq.length;k++)gaps.push(seq[k]-seq[k-1])
      const avg=gaps.reduce((a,b)=>a+b,0)/gaps.length
      if(avg<3||avg>28)continue
      const dev=gaps.reduce((s,g)=>s+Math.abs(g-avg),0)/gaps.length
      const regularity=Math.max(0,1-dev/Math.max(1,avg*.45))
      const countScore=Math.min(1,seq.length/5)
      best=Math.max(best,regularity*countScore)
    }
  }
  return best
}

function mergeRuns(raw,h){
  const gap=Math.max(14,Math.round(h*.015))
  const out=[]
  for(const r of raw){
    const last=out[out.length-1]
    if(last && r[0]-last[1]<=gap)last[1]=r[1]
    else out.push([...r])
  }
  return out
}

function splitOversized([a,b],density,h){
  const hh=b-a+1
  const maxH=Math.max(110,Math.round(h*.17))
  if(hh<=maxH)return [[a,b]]

  const minPart=Math.max(42,Math.round(h*.035))
  let best=-1,bestVal=Infinity
  for(let y=a+minPart;y<=b-minPart;y++){
    const centerPenalty=Math.abs(y-(a+b)/2)/hh*.008
    const v=density[y]+centerPenalty
    if(v<bestVal){bestVal=v;best=y}
  }
  if(best>a&&best<b){
    return [
      ...splitOversized([a,best-1],density,h),
      ...splitOversized([best+1,b],density,h)
    ]
  }
  return [[a,b]]
}

function fallbackByStaffEvidence(gray,w,h){
  const windowH=Math.max(90,Math.round(h*.11))
  const step=Math.max(24,Math.round(windowH*.35))
  const scored=[]
  for(let top=Math.round(h*.04);top<h-windowH;top+=step){
    const bottom=Math.min(h-1,top+windowH)
    const ev=staffLineEvidence(gray,w,h,top,bottom)
    if(ev>.35)scored.push({top,bottom,ev})
  }
  // keep best non-overlapping windows
  scored.sort((a,b)=>b.ev-a.ev)
  const keep=[]
  for(const s of scored){
    const cy=(s.top+s.bottom)/2
    if(!keep.some(k=>Math.abs(((k.top+k.bottom)/2)-cy)<windowH*.55))keep.push(s)
  }
  return keep.sort((a,b)=>a.top-b.top).map(s=>[s.top,s.bottom])
}

function trimHorizontal(gray,w,h,top,bottom){
  const col=new Array(w).fill(0)
  for(let x=0;x<w;x++){
    let dark=0,total=0
    for(let y=top;y<=bottom;y+=2){
      if(gray[y*w+x]<205)dark++
      total++
    }
    col[x]=dark/Math.max(1,total)
  }
  let left=0,right=w-1
  while(left<w&&col[left]<.01)left++
  while(right>left&&col[right]<.01)right--
  const pad=Math.max(12,Math.round(w*.015))
  left=Math.max(0,left-pad)
  right=Math.min(w-1,right+pad)
  if(right-left<w*.45){
    left=Math.round(w*.03);right=Math.round(w*.97)
  }
  return [left,right]
}

export function detectStaffCuts(c){
  const w=c.width,h=c.height
  const gray=getGray(c)

  // PRIMARY DETECTOR = the successful first-version principle.
  const density=rowDensity(gray,w,h,Math.round(w*.06),Math.round(w*.94))
  const sm=smooth(density,Math.max(1,Math.round(h/1000)))
  const sorted=[...sm].sort((a,b)=>a-b)
  const p84=sorted[Math.floor(sorted.length*.84)]||0
  const threshold=Math.max(.012,p84*.40)

  let bands=mergeRuns(runs(sm.map(v=>v>threshold)),h)

  // Keep the original detector permissive.
  // We only reject microscopic bands and near-full-page blocks.
  const minH=Math.max(24,Math.round(h*.020))
  bands=bands.filter(([a,b])=>{
    const hh=b-a+1
    return hh>=minH && hh<=h*.32
  })

  // Split oversized groups rather than throwing them away.
  let split=[]
  for(const b of bands)split.push(...splitOversized(b,sm,h))
  bands=split.filter(([a,b])=>{
    const hh=b-a+1
    return hh>=minH && hh<=h*.28
  })

  // Add moderate padding like v0.6 / first version.
  const pad=Math.max(10,Math.round(h*.010))
  let candidates=bands.map(([a,b])=>{
    const top=Math.max(0,a-pad)
    const bottom=Math.min(h-1,b+pad)
    const [left,right]=trimHorizontal(gray,w,h,top,bottom)
    return {
      top,bottom,left,right,
      evidence:staffLineEvidence(gray,w,h,top,bottom)
    }
  })

  // Staff-line evidence is now ONLY a ranking aid, never a hard filter.
  // This fixes the issue where valid notation was rejected completely.
  if(candidates.length){
    // Remove near-duplicate overlapping crops, preferring stronger evidence.
    const ranked=[...candidates].sort((a,b)=>
      (b.evidence-a.evidence) || ((a.bottom-a.top)-(b.bottom-b.top))
    )
    const keep=[]
    for(const cnd of ranked){
      const cy=(cnd.top+cnd.bottom)/2
      const hh=cnd.bottom-cnd.top+1
      if(!keep.some(k=>{
        const ky=(k.top+k.bottom)/2
        const kh=k.bottom-k.top+1
        return Math.abs(cy-ky)<Math.min(hh,kh)*.50
      })) keep.push(cnd)
    }
    candidates=keep.sort((a,b)=>a.top-b.top)
  }

  // If first-version density still found nothing, fall back to broad page strips.
  // Never return zero lines and never return the full page as one line.
  if(!candidates.length){
    const usableTop=Math.round(h*.06)
    const usableBottom=Math.round(h*.96)
    const usable=usableBottom-usableTop
    let parts=Math.round(usable/Math.max(85,w*.18))
    parts=Math.max(4,Math.min(10,parts))
    const step=usable/parts

    candidates=[]
    for(let i=0;i<parts;i++){
      const top=Math.round(usableTop+i*step)
      const bottom=Math.round(usableTop+(i+1)*step-1)
      const [left,right]=trimHorizontal(gray,w,h,top,bottom)
      candidates.push({
        top,bottom,left,right,
        evidence:staffLineEvidence(gray,w,h,top,bottom)
      })
    }
  }

  return candidates
}
export function extractCutDescriptors(c){
  return detectStaffCuts(c).map(b=>({
    source:c,
    bounds:{top:b.top,bottom:b.bottom,left:b.left,right:b.right}
  }))
}

function clamp(v,min,max){return Math.max(min,Math.min(max,v))}

function cropFromDescriptor(desc,adj={}){
  const c=desc.source
  const w=c.width,h=c.height
  const b=desc.bounds

  const baseW=b.right-b.left+1
  const baseH=b.bottom-b.top+1

  const shiftX=Number(adj.cropX||0)
  const shiftY=Number(adj.cropY||0)
  const heightScale=Number(adj.cropHeight||100)/100
  const widthScale=Number(adj.cropWidth||100)/100

  const cropW=clamp(Math.round(baseW*widthScale),Math.round(w*.25),w)
  const cropH=clamp(Math.round(baseH*heightScale),Math.max(40,Math.round(h*.02)),Math.round(h*.30))

  const cx=(b.left+b.right)/2 + shiftX
  const cy=(b.top+b.bottom)/2 + shiftY

  let left=Math.round(cx-cropW/2)
  let top=Math.round(cy-cropH/2)
  left=clamp(left,0,Math.max(0,w-cropW))
  top=clamp(top,0,Math.max(0,h-cropH))

  const raw=document.createElement('canvas')
  raw.width=cropW
  raw.height=cropH
  raw.getContext('2d').drawImage(c,left,top,cropW,cropH,0,0,cropW,cropH)
  return raw
}

export async function processDescriptor(
  desc,
  {contrast=130,invert=false,cropX=0,cropY=0,cropHeight=100,cropWidth=100,twoRows=false}={}
){
  const raw=cropFromDescriptor(desc,{cropX,cropY,cropHeight,cropWidth})
  const out=document.createElement('canvas')
  out.width=576
  out.height=144
  const ctx=out.getContext('2d',{willReadFrequently:true})

  ctx.fillStyle=invert?'#000':'#fff'
  ctx.fillRect(0,0,576,144)

  // G2 optimization: in two-row mode use almost the full 144 px height
  // so the gap between row 1 and row 2 is minimal.
  const marginX=twoRows?4:8
  const marginY=twoRows?2:5
  const scale=Math.min(
    (576-marginX*2)/raw.width,
    (144-marginY*2)/raw.height
  )
  const dw=Math.max(1,Math.round(raw.width*scale))
  const dh=Math.max(1,Math.round(raw.height*scale))
  const dx=Math.round((576-dw)/2)
  const dy=Math.round((144-dh)/2)
  ctx.drawImage(raw,0,0,raw.width,raw.height,dx,dy,dw,dh)

  const im=ctx.getImageData(0,0,576,144)
  const cVal=Math.max(-254,Math.min(254,Number(contrast)))
  const factor=(259*(cVal+255))/(255*(259-cVal))
  for(let i=0;i<im.data.length;i+=4){
    let lum=.2126*im.data[i]+.7152*im.data[i+1]+.0722*im.data[i+2]
    lum=Math.max(0,Math.min(255,factor*(lum-128)+128))
    if(invert)lum=255-lum
    const v=Math.round(lum)
    im.data[i]=im.data[i+1]=im.data[i+2]=v
    im.data[i+3]=255
  }
  ctx.putImageData(im,0,0)

  const blob=await new Promise(r=>out.toBlob(r,'image/png'))
  return {canvas:out,url:URL.createObjectURL(blob)}
}

export async function halfPngBytes(canvas,sx){
  const c=document.createElement('canvas')
  c.width=288;c.height=144
  c.getContext('2d').drawImage(canvas,sx,0,288,144,0,0,288,144)
  const blob=await new Promise(r=>c.toBlob(r,'image/png'))
  return new Uint8Array(await blob.arrayBuffer())
}
