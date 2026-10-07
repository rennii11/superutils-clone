import type { ChildProcess } from 'node:child_process'

export async function terminateChildren(children: Iterable<ChildProcess>, forceAfterMs = 1000) {
  const active=[...new Set(children)].filter(child=>child.exitCode===null&&child.signalCode===null)
  await Promise.all(active.map(child=>new Promise<void>(resolve=>{
    const timer=setTimeout(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL')},forceAfterMs)
    const finish=()=>{clearTimeout(timer);resolve()}
    child.once('exit',finish)
    try{if(!child.kill('SIGTERM'))finish()}catch{finish()}
  })))
}
