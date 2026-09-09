
const DB_NAME='g2-sheet-music'
const STORE='scores'
const VERSION=1

function db(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,VERSION)
    req.onupgradeneeded=()=>{
      const d=req.result
      if(!d.objectStoreNames.contains(STORE)){
        const s=d.createObjectStore(STORE,{keyPath:'id'})
        s.createIndex('createdAt','createdAt')
      }
    }
    req.onsuccess=()=>resolve(req.result)
    req.onerror=()=>reject(req.error)
  })
}

export async function saveScore(record){
  const d=await db()
  return new Promise((resolve,reject)=>{
    const tx=d.transaction(STORE,'readwrite')
    tx.objectStore(STORE).put(record)
    tx.oncomplete=()=>resolve(record)
    tx.onerror=()=>reject(tx.error)
  })
}

export async function listScores(){
  const d=await db()
  return new Promise((resolve,reject)=>{
    const tx=d.transaction(STORE,'readonly')
    const req=tx.objectStore(STORE).getAll()
    req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>b.createdAt-a.createdAt))
    req.onerror=()=>reject(req.error)
  })
}

export async function getScore(id){
  const d=await db()
  return new Promise((resolve,reject)=>{
    const req=d.transaction(STORE,'readonly').objectStore(STORE).get(id)
    req.onsuccess=()=>resolve(req.result||null)
    req.onerror=()=>reject(req.error)
  })
}

export async function deleteScore(id){
  const d=await db()
  return new Promise((resolve,reject)=>{
    const tx=d.transaction(STORE,'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete=()=>resolve()
    tx.onerror=()=>reject(tx.error)
  })
}
