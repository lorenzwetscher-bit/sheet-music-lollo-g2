
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

export async function pdfToCanvases(file){
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await pdfjsLib.getDocument({data}).promise
  const pages=[]
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p)
    const viewport=page.getViewport({scale:2.2})
    const c=document.createElement('canvas')
    c.width=Math.round(viewport.width); c.height=Math.round(viewport.height)
    await page.render({canvasContext:c.getContext('2d'),viewport}).promise
    pages.push(c)
  }
  return pages
}

export async function imageToCanvas(file){
  const bitmap=await createImageBitmap(file)
  const maxDim=2400
  const scale=Math.min(1,maxDim/Math.max(bitmap.width,bitmap.height))
  const c=document.createElement('canvas')
  c.width=Math.round(bitmap.width*scale); c.height=Math.round(bitmap.height*scale)
  c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height)
  bitmap.close()
  return c
}
