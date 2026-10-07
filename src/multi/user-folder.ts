import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export function folderName(username: string) {
  return username.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 48) || 'user'
}

export async function renameUserFolder(currentRoot: string, nextRoot: string) {
  if (await stat(nextRoot).catch(() => null)) return false
  await rename(currentRoot, nextRoot)
  const oldOwnerRoot = dirname(currentRoot)
  if ((await readdir(oldOwnerRoot).catch(() => null))?.length === 0) await rm(oldOwnerRoot, { recursive: true, force: true })
  return true
}

export async function syncConfigFolder(base: string,currentFolder: string,ownerUsername: string,tokenUsername: string,persist: (nextFolder:string)=>boolean|Promise<boolean>,mediaRoot?: string) {
  const currentOwner=currentFolder.split('/')[0]
  const nextOwner=folderName(ownerUsername)
  const nextFolder=nextOwner+'/'+folderName(tokenUsername)
  if(nextFolder===currentFolder)return 'unchanged'
  const currentRoot=join(base,currentFolder),nextRoot=join(base,nextFolder)
  if(await stat(nextRoot).catch(()=>null))return 'collision'
  const currentMediaRoot=mediaRoot&&currentOwner!==nextOwner?join(mediaRoot,currentOwner):null
  const nextMediaRoot=currentMediaRoot?join(mediaRoot!,nextOwner):null
  const moveMedia=Boolean(currentMediaRoot&&await stat(currentMediaRoot).catch(()=>null))
  if(moveMedia&&nextMediaRoot&&await stat(nextMediaRoot).catch(()=>null))return 'collision'
  await mkdir(dirname(nextRoot),{recursive:true})
  if(!(await renameUserFolder(currentRoot,nextRoot)))return 'collision'
  let mediaMoved=false
  try{
    if(moveMedia&&currentMediaRoot&&nextMediaRoot){
      await rename(currentMediaRoot,nextMediaRoot)
      mediaMoved=true
    }
    if(!(await persist(nextFolder)))throw new Error('Folder mapping changed during rename.')
  }catch(error){
    if(mediaMoved&&currentMediaRoot&&nextMediaRoot)await rename(nextMediaRoot,currentMediaRoot)
    await mkdir(dirname(currentRoot),{recursive:true})
    await renameUserFolder(nextRoot,currentRoot)
    throw error
  }
  return 'renamed'
}
