export type RotatingButton = {name:string;url:string}

function isButton(value: unknown): value is RotatingButton {
  if(!value||typeof value!=='object')return false
  const button=value as {name?:unknown;url?:unknown}
  return typeof button.name==='string'&&Boolean(button.name)&&typeof button.url==='string'&&Boolean(button.url)
}

export function rotatingButtons(source: Record<string,unknown>, index: number): RotatingButton[] {
  const cursor=Number.isFinite(index)?Math.max(0,Math.trunc(index)):0
  return ['button-1','button-2'].flatMap(key=>{
    const values=Array.isArray(source[key])?source[key].filter(isButton):[]
    return values.length?[values[cursor%values.length]]:[]
  })
}
