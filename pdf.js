import * as pdfjsLib from 'pdfjs-dist'
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&inline'

// Even Hub runs the plugin inside the Even App WebView. Keep the PDF worker
// inside the app bundle so PDF.js never has to fetch /assets/pdf.worker...mjs
// from the local 127.0.0.1 app server.
try {
  pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker()
} catch (err) {
  console.warn('PDF worker initialization failed', err)
}

export async function pdfToCanvases(file){
  try{
    const data = new Uint8Array(await file.arrayBuffer())
    const task = pdfjsLib.getDocument({ data })
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

    await pdf.destroy()
    return pages
  }catch(err){
    console.error('PDF import failed',err)
    throw new Error('PDF konnte nicht gelesen werden. Bitte PDF erneut auswählen oder als Foto/JPG versuchen.')
  }
}

function readAsDataURL(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader()
    reader.onload=()=>resolve(String(reader.result||''))
    reader.onerror=()=>reject(reader.error||new Error('Bilddatei konnte nicht gelesen werden.'))
    reader.readAsDataURL(file)
  })
}

function loadHtmlImage(src){
  return new Promise((resolve,reject)=>{
    const img=new Image()
    img.onload=()=>resolve(img)
    img.onerror=()=>reject(new Error('Bildformat konnte nicht dekodiert werden.'))
    img.src=src
  })
}

export async function imageToCanvas(file){
  // createImageBitmap() is not equally reliable in Android WebViews for album
  // files. Decode through FileReader + HTMLImageElement instead, which is the
  // broadest-supported path inside the Even App WebView.
  try{
    const dataUrl=await readAsDataURL(file)
    const img=await loadHtmlImage(dataUrl)
    const naturalW=img.naturalWidth||img.width
    const naturalH=img.naturalHeight||img.height
    if(!naturalW||!naturalH)throw new Error('Bild hat keine gültige Größe.')

    const maxDim=2400
    const scale=Math.min(1,maxDim/Math.max(naturalW,naturalH))
    const c=document.createElement('canvas')
    c.width=Math.max(1,Math.round(naturalW*scale))
    c.height=Math.max(1,Math.round(naturalH*scale))
    const ctx=c.getContext('2d',{alpha:false})
    ctx.fillStyle='#fff'
    ctx.fillRect(0,0,c.width,c.height)
    ctx.drawImage(img,0,0,c.width,c.height)
    return c
  }catch(err){
    console.error('Image import failed',err)
    const type=(file?.type||'').toLowerCase()
    if(type.includes('heic')||type.includes('heif')){
      throw new Error('HEIC/HEIF wird in der Even App nicht zuverlässig unterstützt. Bitte das Foto als JPG oder PNG auswählen.')
    }
    throw new Error('Foto konnte nicht dekodiert werden. Bitte JPG oder PNG verwenden.')
  }
}
