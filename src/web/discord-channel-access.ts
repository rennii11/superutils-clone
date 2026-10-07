type ChannelMode = 'chat'|'voice'
type PermissionOverwrite = { id?:unknown; type?:unknown; allow?:unknown; deny?:unknown }
type DiscordChannel = { id?:unknown; name?:unknown; type?:unknown; parent_id?:unknown; permission_overwrites?:unknown }

const VIEW_CHANNEL=1n<<10n
const SEND_MESSAGES=1n<<11n
const CONNECT=1n<<20n
const ADMINISTRATOR=1n<<3n

function permission(value: unknown) { try { return typeof value==='bigint'?value:BigInt(typeof value==='string'||typeof value==='number'?value:0) } catch { return 0n } }
function apply(base: bigint, overwrite: PermissionOverwrite) { return (base&~permission(overwrite.deny))|permission(overwrite.allow) }
function matching(overwrite: PermissionOverwrite,id: string,type: number) { return overwrite.type===type&&overwrite.id===id }

function effectivePermissions(base: bigint,guildId: string,userId: string,roleIds: string[],overwrites: PermissionOverwrite[]) {
  const everyone=overwrites.find(item=>matching(item,guildId,0))
  if(everyone)base=apply(base,everyone)
  let allow=0n,deny=0n
  for(const item of overwrites)if(item.type===0&&typeof item.id==='string'&&roleIds.includes(item.id)){allow|=permission(item.allow);deny|=permission(item.deny)}
  base=(base&~deny)|allow
  const member=overwrites.find(item=>matching(item,userId,1))
  return member?apply(base,member):base
}

export function listAccessibleDiscordChannels(input: { mode:ChannelMode; guildId:string; userId:string; guildPermissions:string; memberRoleIds:string[]; channels:DiscordChannel[]; isGuildOwner?:boolean }) {
  const channels=input.channels.filter((item):item is DiscordChannel&{id:string;name:string;type:number}=>typeof item.id==='string'&&typeof item.name==='string'&&typeof item.type==='number')
  const byId=new Map(channels.map(item=>[item.id,item]))
  const required=input.mode==='chat'?VIEW_CHANNEL|SEND_MESSAGES:VIEW_CHANNEL|CONNECT
  const base=permission(input.guildPermissions)
  return channels.filter(channel=>{
    if(input.mode==='chat'&&channel.type!==0&&channel.type!==5)return false
    if(input.mode==='voice'&&channel.type!==2&&channel.type!==13)return false
    if(input.isGuildOwner||(base&ADMINISTRATOR)===ADMINISTRATOR)return true
    let permissions=base
    const parent=typeof channel.parent_id==='string'?byId.get(channel.parent_id):undefined
    if(parent&&Array.isArray(parent.permission_overwrites))permissions=effectivePermissions(permissions,input.guildId,input.userId,input.memberRoleIds,parent.permission_overwrites as PermissionOverwrite[])
    if(Array.isArray(channel.permission_overwrites))permissions=effectivePermissions(permissions,input.guildId,input.userId,input.memberRoleIds,channel.permission_overwrites as PermissionOverwrite[])
    return (permissions&required)===required
  }).map(channel=>({id:channel.id,name:channel.name,type:channel.type,parentId:typeof channel.parent_id==='string'?channel.parent_id:null})).sort((left,right)=>left.name.localeCompare(right.name,'vi')||left.id.localeCompare(right.id))
}
