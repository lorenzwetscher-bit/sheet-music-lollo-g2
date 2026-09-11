import * as pdfjsLib from 'pdfjs-dist'
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&inline'
import { heicTo } from 'heic-to/csp'
import * as UTIF from 'utif'

// Keep the PDF worker inside the app bundle. The Even App serves the app from a
// local 127.0.0.1 origin where a separately emitted worker module may not be fetchable.
try {
  pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker()
} catch (err) {
  console.warn('PDF worker initialization failed', err)
}

export async function isPdfFile(file){
  if(!file)return false
  const type=String(file.type||'').toLowerCase()
  const name=String(file.name||'').toLowerCase()
  if(type==='application/pdf'||type.includes('/pdf')||name.endsWith('.pdf'))return true
  try{
    const head=new Uint8Array(await file.slice(0,5).arrayBuffer())
    return head.length>=5 && head[0]===0x25 && head[1]===0x50 && head[2]===0x44 && head[3]===0x46 && head[4]===0x2d
  }catch{return false}
}

export async function pdfToCanvases(file){
  try{
    const data = new Uint8Array(await file.arrayBuffer())
    const task = pdfjsLib.getDocument({ data, useWasm:false, isEvalSupported:false, useWorkerFetch:false })
    const pdf = await task.promise
    const pages=[]

    for(let p=1;p<=pdf.numPages;p++){
      const page=await pdf.getPage(p)
      const viewport=page.getViewport({scale:2.2})
      const c=document.createElement('canvas')
      c.width=Math.max(1,Math.round(viewport.width))
      c.height=Math.max(1,Math.round(viewport.height))
      const ctx=c.getContext('2d',{alpha:false})
      ctx.fillStyle='#fff'
      ctx.fillRect(0,0,c.width,c.height)
      await page.render({canvasContext:ctx,viewport}).promise
      pages.push(c)
    }

    // Cleanup must never turn an otherwise successful PDF import into an error.
    // PDF.js versions/environments expose cleanup/destroy on different objects.
    try {
      if (typeof pdf.cleanup === 'function') await pdf.cleanup()
      if (typeof task.destroy === 'function') await task.destroy()
      else if (typeof pdf.destroy === 'function') await pdf.destroy()
    } catch (cleanupErr) {
      console.warn('PDF cleanup skipped', cleanupErr)
    }
    return pages
  }catch(err){
    console.error('PDF import failed',err)
    throw new Error('PDF konnte nicht gelesen werden: '+(err?.message||String(err)))
  }
}

function lowerName(file){return String(file?.name||'').toLowerCase()}
function lowerType(file){return String(file?.type||'').toLowerCase()}

function isHeicLike(file, bytes){
  const type=lowerType(file), name=lowerName(file)
  if(type.includes('heic')||type.includes('heif')||/\.(heic|heif)$/.test(name))return true
  if(bytes?.length>=12){
    const brand=String.fromCharCode(...bytes.slice(4,12))
    return /ftyp(heic|heix|hevc|hevx|heim|heis|mif1|msf1)/i.test(brand)
  }
  return false
}

function isTiffLike(file, bytes){
  const type=lowerType(file), name=lowerName(file)
  if(type.includes('tiff')||/\.(tif|tiff)$/.test(name))return true
  if(bytes?.length>=4){
    return (bytes[0]===0x49&&bytes[1]===0x49&&bytes[2]===0x2a&&bytes[3]===0x00) ||
           (bytes[0]===0x4d&&bytes[1]===0x4d&&bytes[2]===0x00&&bytes[3]===0x2a)
  }
  return false
}

function loadHtmlImage(src){
  return new Promise((resolve,reject)=>{
    const img=new Image()
    img.onload=()=>resolve(img)
    img.onerror=()=>reject(new Error('HTML image decoder rejected the file.'))
    img.src=src
  })
}

async function decodeBlobWithImg(blob){
  const url=URL.createObjectURL(blob)
  try{
    const img=await loadHtmlImage(url)
    const w=img.naturalWidth||img.width
    const h=img.naturalHeight||img.height
    if(!w||!h)throw new Error('Bild hat keine gültige Größe.')
    return {source:img,width:w,height:h}
  } finally {
    // Keep URL alive until the image was decoded; after onload the pixels are available.
    URL.revokeObjectURL(url)
  }
}

async function heicToDecodableBlob(file){
  const out=await heicTo({blob:file,type:'image/jpeg',quality:0.96})
  return out
}

async function tiffToCanvas(buffer){
  const ifds=UTIF.decode(buffer)
  if(!ifds?.length)throw new Error('TIFF enthält kein lesbares Bild.')
  const ifd=ifds[0]
  UTIF.decodeImage(buffer,ifd)
  const rgba=UTIF.toRGBA8(ifd)
  const w=ifd.width||ifd.t256?.[0]
  const h=ifd.height||ifd.t257?.[0]
  if(!w||!h)throw new Error('TIFF hat keine gültige Größe.')
  const c=document.createElement('canvas')
  c.width=w;c.height=h
  const ctx=c.getContext('2d')
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba),w,h),0,0)
  return c
}

function normalizeSourceToCanvas(source,w,h){
  const maxDim=2600
  const scale=Math.min(1,maxDim/Math.max(w,h))
  const c=document.createElement('canvas')
  c.width=Math.max(1,Math.round(w*scale))
  c.height=Math.max(1,Math.round(h*scale))
  const ctx=c.getContext('2d',{alpha:false,willReadFrequently:true})
  ctx.fillStyle='#fff'
  ctx.fillRect(0,0,c.width,c.height)
  ctx.drawImage(source,0,0,c.width,c.height)
  return c
}

export async function imageToCanvas(file){
  // Always normalize the selected phone photo into a plain canvas before the
  // recognition pipeline sees it. This removes format/container differences
  // from the rest of the app and makes later G2 rendering deterministic.
  try{
    if(!file)throw new Error('Keine Bilddatei ausgewählt.')
    const buffer=await file.arrayBuffer()
    const head=new Uint8Array(buffer.slice(0,32))

    // HEIC/HEIF is common on phones but Android WebViews do not decode it
    // consistently. Convert it inside the app bundle first.
    if(isHeicLike(file,head)){
      const converted=await heicToDecodableBlob(new Blob([buffer],{type:file.type||'image/heic'}))
      const decoded=await decodeBlobWithImg(converted)
      return normalizeSourceToCanvas(decoded.source,decoded.width,decoded.height)
    }

    // TIFF is also not reliably supported by WebView's <img> decoder.
    if(isTiffLike(file,head)){
      const tiffCanvas=await tiffToCanvas(buffer)
      return normalizeSourceToCanvas(tiffCanvas,tiffCanvas.width,tiffCanvas.height)
    }

    // Normal phone/web formats: JPEG/JPG/JFIF, PNG, WebP, GIF, BMP and AVIF
    // where the installed Android WebView supports AVIF.
    try{
      const decoded=await decodeBlobWithImg(new Blob([buffer],{type:file.type||'application/octet-stream'}))
      return normalizeSourceToCanvas(decoded.source,decoded.width,decoded.height)
    }catch(primaryErr){
      // Some file pickers provide an empty/incorrect MIME type. Retry using a
      // MIME inferred from the filename while keeping the exact same bytes.
      const name=lowerName(file)
      const inferred = /\.png$/.test(name)?'image/png':
        /\.(jpg|jpeg|jfif)$/.test(name)?'image/jpeg':
        /\.webp$/.test(name)?'image/webp':
        /\.gif$/.test(name)?'image/gif':
        /\.bmp$/.test(name)?'image/bmp':
        /\.avif$/.test(name)?'image/avif':''
      if(inferred){
        const decoded=await decodeBlobWithImg(new Blob([buffer],{type:inferred}))
        return normalizeSourceToCanvas(decoded.source,decoded.width,decoded.height)
      }
      throw primaryErr
    }
  }catch(err){
    console.error('Image import failed',err)
    throw new Error('Foto konnte nicht automatisch umgewandelt werden. Unterstützt werden Handyfotos wie JPG/JPEG/JFIF, PNG, HEIC/HEIF, WebP, GIF, BMP, TIFF und – je nach Android-WebView – AVIF.')
  }
}
