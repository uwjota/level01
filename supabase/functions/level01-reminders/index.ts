import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import webpush from 'npm:web-push@3.6.7';
import { buildReminders, allowedPushEndpoint } from './jobs.js';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
async function rows(table:string,userId:string){const all:any[]=[];for(let start=0;;start+=500){const {data,error}=await db.from(table).select('*').eq('user_id',userId).order('id').range(start,start+499);if(error)throw error;all.push(...data);if(data.length<500)return all;}}
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return new Response(null,{status:405});
 const {data:config,error:configError}=await db.rpc('get_push_runtime');
 if(configError||!config)return new Response('Not configured',{status:503});
 const supplied=req.headers.get('authorization')??'';
 const encoder=new TextEncoder();const hash=async(v:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(v)));
 const a=await hash(supplied),b=await hash(`Bearer ${config.cronSecret}`);let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a[i]^b[i];
 if(mismatch)return new Response('Unauthorized',{status:401});
 try{
  const {data:users,error}=await db.rpc('reminder_user_ids');if(error)throw error;
  let generated=0,sent=0,failed=0;
  for(const id of users??[]){
   const [settings,tasks,occurrences,transactions,goals]=await Promise.all(['settings','tasks','task_occurrences','transactions','goals'].map(t=>rows(t,id)));
   const jobs=buildReminders(id,settings[0],tasks,occurrences,transactions,goals);
   if(jobs.length){const {error}=await db.from('notifications').upsert(jobs,{onConflict:'user_id,idempotency_key',ignoreDuplicates:true});if(error)throw error;generated+=jobs.length;}
  }
  const queued=await db.rpc('enqueue_push_deliveries');if(queued.error)throw queued.error;
  const claimed=await db.rpc('claim_push_deliveries');if(claimed.error)throw claimed.error;
  const pending=[...(claimed.data??[])];
  await Promise.all(Array.from({length:5},async()=>{while(pending.length){const job=pending.shift()!;
   try{
    const [{data:sub,error:se},{data:note,error:ne}]=await Promise.all([db.from('push_subscriptions').select('*').eq('id',job.subscription_id).single(),db.from('notifications').select('*').eq('id',job.notification_id).single()]);
    if(se||ne||!sub||!note)throw Error('missing_record');
    if(note.read_at){await db.from('push_deliveries').update({status:'sent',sent_at:new Date().toISOString(),lease_until:null,error_code:'read'}).eq('id',job.id);continue;}
    if(!allowedPushEndpoint(sub.endpoint))throw Error('invalid_endpoint');
    const kind=note.type;const payload=JSON.stringify({body:note.idempotency_key.startsWith('push-test:')?'Notificações funcionando neste dispositivo.':kind==='finance'?'Você tem uma despesa prevista para acompanhar.':kind==='goal'?'Uma meta tem prazo próximo.':'Você tem uma tarefa para acompanhar.',url:kind==='finance'?'/financeiro':kind==='goal'?'/metas':'/tarefas',tag:`level01-${note.id}`});
    const details=webpush.generateRequestDetails({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},payload,{TTL:3600,urgency:'normal',vapidDetails:{subject:config.subject,publicKey:config.publicKey,privateKey:config.privateKey}});
    const response=await fetch(details.endpoint,{method:'POST',headers:details.headers,body:new Uint8Array(details.body),redirect:'error',signal:AbortSignal.timeout(10000)});
    if(response.status===404||response.status===410){await db.from('push_subscriptions').delete().eq('id',sub.id);continue;}
    if(!response.ok)throw Error(`push_${response.status}`);
    const marked=await db.from('push_deliveries').update({status:'sent',sent_at:new Date().toISOString(),lease_until:null,error_code:null}).eq('id',job.id);if(marked.error)throw marked.error;sent++;
   }catch(e){failed++;const terminal=job.attempts>=5||String((e as Error).message)==='invalid_endpoint';await db.from('push_deliveries').update({status:terminal?'failed':'pending',lease_until:null,next_attempt_at:new Date(Date.now()+Math.min(3600000,60000*2**job.attempts)).toISOString(),error_code:String((e as Error).message).slice(0,60)}).eq('id',job.id);}
  }
  }));
  return Response.json({ok:true,generated,sent,failed});
 }catch{console.error('Reminder dispatch failed');return Response.json({error:'dispatch_failed'},{status:500});}
});
