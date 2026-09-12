import { tr } from './i18n.js'
import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'

const DB_NAME='g2-sheet-music',SCORES='scores',FOLDERS='folders',VERSION=3

// Even Hub WebViews can be recreated on app exit/relaunch. IndexedDB is kept only
// as a fast runtime cache. The Even App bridge storage is the persistent source.
const NATIVE_MANIFEST_KEY='sheetmusic.library.v1'
const NATIVE_FILE_PREFIX='sheetmusic.file.v1.'
const NATIVE_CHUNK_BYTES=192*1024

let persistenceReadyPromise=null
let nativeBridgePromise=null
let nativeQueue=Promise.resolve()

function db(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,VERSION);req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains(SCORES)){const s=d.createObjectStore(SCORES,{keyPath:'id'});s.createIndex('createdAt','createdAt')}if(!d.objectStoreNames.contains(FOLDERS)){const f=d.createObjectStore(FOLDERS,{keyPath:'id'});f.createIndex('createdAt','createdAt')}};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}

async function nativeBridge(){
  if(!nativeBridgePromise)nativeBridgePromise=waitForEvenAppBridge().catch(()=>null)
  return nativeBridgePromise
}
function nativeCall(fn){
  const run=nativeQueue.then(fn,fn)
  nativeQueue=run.catch(()=>{})
  return run
}
async function nativeGet(key){
  const b=await nativeBridge();if(!b)return ''
  try{return await nativeCall(()=>b.getLocalStorage(key))||''}catch{return ''}
}
async function nativeSet(key,value){
  const b=await nativeBridge();if(!b)return false
  try{return !!(await nativeCall(()=>b.setLocalStorage(key,String(value??''))))}catch{return false}
}
function fileKey(id,index){return `${NATIVE_FILE_PREFIX}${id}.${index}`}
function bytesToBase64(bytes){
  let out='',step=0x8000
  for(let i=0;i<bytes.length;i+=step)out+=String.fromCharCode(...bytes.subarray(i,Math.min(i+step,bytes.length)))
  return btoa(out)
}
function base64ToBytes(s){
  const bin=atob(s),out=new Uint8Array(bin.length)
  for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i)
  return out
}
async function readManifest(){
  const raw=await nativeGet(NATIVE_MANIFEST_KEY)
  if(!raw)return null
  try{const m=JSON.parse(raw);return m&&m.version===1?m:null}catch{return null}
}
async function writeManifest(m){return nativeSet(NATIVE_MANIFEST_KEY,JSON.stringify(m))}

async function rawListScores(){
  const d=await db();return new Promise((resolve,reject)=>{const req=d.transaction(SCORES,'readonly').objectStore(SCORES).getAll();req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)));req.onerror=()=>reject(req.error)})
}
async function rawGetScore(id){
  const d=await db();return new Promise((resolve,reject)=>{const req=d.transaction(SCORES,'readonly').objectStore(SCORES).get(id);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)})
}
async function rawPutScore(record){
  const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction(SCORES,'readwrite');tx.objectStore(SCORES).put(record);tx.oncomplete=()=>resolve(record);tx.onerror=()=>reject(tx.error)})
}
async function rawDeleteScore(id){
  const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction(SCORES,'readwrite');tx.objectStore(SCORES).delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})
}
async function rawListFolders(){
  const d=await db();return new Promise((resolve,reject)=>{const req=d.transaction(FOLDERS,'readonly').objectStore(FOLDERS).getAll();req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'de')));req.onerror=()=>reject(req.error)})
}
async function rawPutFolder(record){
  const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction(FOLDERS,'readwrite');tx.objectStore(FOLDERS).put(record);tx.oncomplete=()=>resolve(record);tx.onerror=()=>reject(tx.error)})
}

function scoreMeta(record,fileInfo){
  const {storedFile,...rest}=record
  return {...rest,storedFile:{name:storedFile?.name||fileInfo?.name||'score',type:storedFile?.type||fileInfo?.type||'',lastModified:storedFile?.lastModified||fileInfo?.lastModified||0},persistentFile:fileInfo||null}
}
async function persistFile(record,previousInfo){
  const stored=record?.storedFile
  if(!stored?.bytes)return previousInfo||null
  const bytes=new Uint8Array(stored.bytes)
  if(previousInfo&&previousInfo.byteLength===bytes.byteLength&&previousInfo.name===stored.name&&previousInfo.lastModified===(stored.lastModified||0))return previousInfo
  const count=Math.ceil(bytes.byteLength/NATIVE_CHUNK_BYTES)
  for(let i=0;i<count;i++){
    const part=bytes.subarray(i*NATIVE_CHUNK_BYTES,Math.min((i+1)*NATIVE_CHUNK_BYTES,bytes.length))
    const ok=await nativeSet(fileKey(record.id,i),bytesToBase64(part))
    if(!ok)throw new Error(tr('Dauerhafte Speicherung in der Even App fehlgeschlagen.','Persistent storage in the Even App failed.'))
  }
  const oldCount=previousInfo?.chunks||0
  for(let i=count;i<oldCount;i++)await nativeSet(fileKey(record.id,i),'')
  return {chunks:count,byteLength:bytes.byteLength,name:stored.name||'score',type:stored.type||'',lastModified:stored.lastModified||0}
}
async function loadPersistentFile(id,info,metaFile){
  if(!info?.chunks)return null
  const parts=[];let total=0
  for(let i=0;i<info.chunks;i++){
    const raw=await nativeGet(fileKey(id,i));if(!raw)return null
    const part=base64ToBytes(raw);parts.push(part);total+=part.length
  }
  const all=new Uint8Array(total);let off=0
  for(const p of parts){all.set(p,off);off+=p.length}
  return {name:metaFile?.name||info.name||'score',type:metaFile?.type||info.type||'',lastModified:metaFile?.lastModified||info.lastModified||0,bytes:all.buffer}
}
async function rebuildManifest(fileInfoOverrides=new Map()){
  const [scores,folders,old]=await Promise.all([rawListScores(),rawListFolders(),readManifest()])
  const oldMap=new Map((old?.scores||[]).map(s=>[s.id,s.persistentFile]))
  const manifest={version:1,updatedAt:Date.now(),folders,scores:scores.map(r=>scoreMeta(r,fileInfoOverrides.get(r.id)||oldMap.get(r.id)||null))}
  const ok=await writeManifest(manifest)
  if(!ok)throw new Error(tr('Dauerhafte Speicherung in der Even App fehlgeschlagen.','Persistent storage in the Even App failed.'))
  return manifest
}
async function migrateIndexedDbToNative(scores,folders){
  const infos=new Map()
  for(const r of scores){const info=await persistFile(r,null);infos.set(r.id,info)}
  const manifest={version:1,updatedAt:Date.now(),folders,scores:scores.map(r=>scoreMeta(r,infos.get(r.id)))}
  await writeManifest(manifest)
}
async function restoreNativeToIndexedDb(manifest){
  for(const f of manifest.folders||[])await rawPutFolder(f)
  for(const meta of manifest.scores||[]){
    const storedFile=await loadPersistentFile(meta.id,meta.persistentFile,meta.storedFile)
    if(!storedFile)continue
    const {persistentFile,...rest}=meta
    await rawPutScore({...rest,storedFile})
  }
}
async function ensurePersistenceReady(){
  if(persistenceReadyPromise)return persistenceReadyPromise
  persistenceReadyPromise=(async()=>{
    const b=await nativeBridge();if(!b)return
    const [manifest,localScores,localFolders]=await Promise.all([readManifest(),rawListScores(),rawListFolders()])
    if(manifest){
      // A recreated WebView starts with an empty IndexedDB. Rehydrate it from the
      // phone-side Even App storage before the UI/library reads anything.
      if(!localScores.length&&!localFolders.length)await restoreNativeToIndexedDb(manifest)
    }else if(localScores.length||localFolders.length){
      // One-time migration for users updating from v2.0.6 or earlier.
      await migrateIndexedDbToNative(localScores,localFolders)
    }
  })().catch(e=>{console.warn('Persistent library init failed',e)})
  return persistenceReadyPromise
}

export async function saveScore(record){
  await ensurePersistenceReady()
  const manifest=await readManifest(),prev=(manifest?.scores||[]).find(s=>s.id===record.id)
  await rawPutScore(record)
  const info=await persistFile(record,prev?.persistentFile||null)
  await rebuildManifest(new Map([[record.id,info]]))
  return record
}
export async function listScores(){await ensurePersistenceReady();return rawListScores()}
export async function getScore(id){await ensurePersistenceReady();return rawGetScore(id)}
export async function deleteScore(id){
  await ensurePersistenceReady()
  const manifest=await readManifest(),prev=(manifest?.scores||[]).find(s=>s.id===id)
  await rawDeleteScore(id)
  await rebuildManifest()
  for(let i=0;i<(prev?.persistentFile?.chunks||0);i++)await nativeSet(fileKey(id,i),'')
}
export async function moveScoreToFolder(id,folderId=null){
  const r=await getScore(id);if(!r)return null;r.folderId=folderId||null;r.updatedAt=Date.now()
  await rawPutScore(r);await rebuildManifest();return r
}
export async function createFolder(name){
  await ensurePersistenceReady();name=String(name||'').trim();if(!name)throw new Error(tr('Bitte einen Ordnernamen eingeben.','Please enter a folder name.'))
  const record={id:globalThis.crypto?.randomUUID?.()||`folder-${Date.now()}-${Math.random().toString(36).slice(2)}`,name,createdAt:Date.now(),updatedAt:Date.now()}
  await rawPutFolder(record);await rebuildManifest();return record
}
export async function renameFolder(id,name){
  await ensurePersistenceReady();name=String(name||'').trim();if(!name)throw new Error(tr('Bitte einen Ordnernamen eingeben.','Please enter a folder name.'))
  const d=await db();const record=await new Promise((resolve,reject)=>{const tx=d.transaction(FOLDERS,'readwrite'),store=tx.objectStore(FOLDERS),req=store.get(id);let rec=null;req.onsuccess=()=>{rec=req.result;if(!rec){tx.abort();return reject(new Error(tr('Ordner nicht gefunden.','Folder not found.')))}rec={...rec,name,updatedAt:Date.now()};store.put(rec)};req.onerror=()=>reject(req.error);tx.oncomplete=()=>resolve(rec);tx.onerror=()=>reject(tx.error);tx.onabort=()=>{if(tx.error)reject(tx.error)}})
  await rebuildManifest();return record
}
export async function deleteFolder(id){
  await ensurePersistenceReady();const d=await db()
  const res=await new Promise((resolve,reject)=>{const tx=d.transaction([FOLDERS,SCORES],'readwrite'),folders=tx.objectStore(FOLDERS),scores=tx.objectStore(SCORES),req=scores.getAll();let moved=0;req.onsuccess=()=>{for(const r of req.result||[]){if(r.folderId===id){r.folderId=null;r.updatedAt=Date.now();scores.put(r);moved++}}folders.delete(id)};req.onerror=()=>reject(req.error);tx.oncomplete=()=>resolve({moved});tx.onerror=()=>reject(tx.error)})
  await rebuildManifest();return res
}
export async function listFolders(){await ensurePersistenceReady();return rawListFolders()}
export async function fileToStored(file){return {name:file.name,type:file.type,lastModified:file.lastModified||0,bytes:await file.arrayBuffer()}}
export function storedToFile(stored){if(!stored)return null;try{return new File([stored.bytes],stored.name||'score',{type:stored.type||'',lastModified:stored.lastModified||Date.now()})}catch{return new Blob([stored.bytes],{type:stored.type||''})}}
