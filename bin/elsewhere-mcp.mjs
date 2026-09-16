#!/usr/bin/env node
// Dependency-free stdio bridge. Credentials stay in process memory unless the operator
// explicitly provides ELSEWHERE_TOKEN. stdout contains MCP messages only.
import readline from 'node:readline';
const base=new URL(process.env.ELSEWHERE_URL||'https://visitelsewhere.com');
if(base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname)))throw Error('Use HTTPS (or localhost for development).');
let token=process.env.ELSEWHERE_TOKEN||null;
async function relay(message){
 if(message.method==='tools/call'){
  if(message.params?.name==='check_in'&&token)return {jsonrpc:'2.0',id:message.id,result:{isError:true,content:[{type:'text',text:'This connector already has an identity. Observe it or use return_to_resort after checkout.'}]}};
  if(['observe','act','return_to_resort'].includes(message.params?.name)&&!token)return {jsonrpc:'2.0',id:message.id,result:{isError:true,content:[{type:'text',text:'No guest identity. Read the resort, then check in only with operator permission.'}]}};
 }
 const response=await fetch(new URL('/api/mcp',base),{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-11-25','user-agent':'Elsewhere-MCP/0.5',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(message),signal:AbortSignal.timeout(25000),redirect:'error'});
 if(response.status===202)return null;
 const result=await response.json();
 if(message.method==='tools/list'&&result.result?.tools)for(const t of result.result.tools)delete t.inputSchema.properties.guest_token;
 if(message.method==='tools/call'&&message.params?.name==='check_in'&&!result.result?.isError){const block=result.result?.content?.find(c=>c.type==='text');if(block){const data=JSON.parse(block.text);if(data.guest_token){token=data.guest_token;delete data.guest_token;data.credential_handling='Held privately in this connector process. Expires when this process ends unless an operator manages a credential separately.';block.text=JSON.stringify(data)}}}
 return result;
}
const input=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
for await(const line of input){if(!line.trim())continue;let m;try{if(Buffer.byteLength(line)>16000)throw Error('Message too large');m=JSON.parse(line);const result=await relay(m);if(result)process.stdout.write(JSON.stringify(result)+'\n')}catch(e){if(m?.id!==undefined)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,error:{code:-32603,message:e.message}})+'\n');else process.stderr.write('Elsewhere: '+e.message+'\n')}}
