import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { nanoid } from 'nanoid';
import type { Finding } from '@quality/contracts';
import type { Project } from './store.js';

const privateAddress = (address:string) => address === '::1' || address.startsWith('fe80:') || address.startsWith('fc') || address.startsWith('fd') || /^127\.|^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(address);

export async function assertSafeTarget(raw:string) {
 const url=new URL(raw);
 if(!['http:','https:'].includes(url.protocol)) throw new Error('Only HTTP(S) targets are supported');
 if(url.username||url.password) throw new Error('Targets containing credentials are not supported');
 const addresses=await lookup(url.hostname,{all:true});
 if(!addresses.length||addresses.some(({address})=>privateAddress(address))) throw new Error('Private and local network targets are blocked');
 return url;
}

const finding=(data:Omit<Finding,'id'>):Finding=>({id:nanoid(),...data});
export async function auditProject(project:Project):Promise<{score:number;findings:Finding[]}> {
 if(!project.targetUrl) throw new Error('This product has no website URL configured');
 const url=await assertSafeTarget(project.targetUrl);
 const started=Date.now();
 const response=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(15_000),headers:{'user-agent':'NorthstarQualityBot/0.1'}});
 const latency=Date.now()-started;
 const body=await response.text();
 const headers=response.headers;
 const findings:Finding[]=[];
 if(!response.ok) findings.push(finding({title:`Target returned HTTP ${response.status}`,category:'reliability',severity:response.status>=500?'critical':'high',summary:'The target did not return a successful response during the audit.',evidence:`${response.status} ${response.statusText}`,recommendation:'Restore a successful production response and add uptime alerting.'}));
 if(latency>2500) findings.push(finding({title:'Slow initial document response',category:'performance',severity:latency>5000?'high':'medium',summary:`The HTML response completed in ${latency} ms.`,evidence:`Observed response time: ${latency} ms`,recommendation:'Profile origin latency, caching, redirects, and server-side rendering.'}));
 if(url.protocol==='https:') {
  const required=['strict-transport-security','content-security-policy','x-content-type-options'];
  const missing=required.filter(name=>!headers.has(name));
  if(missing.length) findings.push(finding({title:'Security headers are incomplete',category:'security',severity:missing.includes('content-security-policy')?'high':'medium',summary:'The response is missing browser hardening headers.',evidence:`Missing: ${missing.join(', ')}`,recommendation:'Add and test HSTS, Content-Security-Policy, and X-Content-Type-Options at the edge.'}));
 }
 if(!/<meta[^>]+name=["']viewport["']/i.test(body)) findings.push(finding({title:'Mobile viewport is not configured',category:'ux',severity:'high',summary:'The page does not declare a responsive viewport.',recommendation:'Add a width=device-width viewport and verify key journeys at mobile breakpoints.'}));
 if(!/<title[^>]*>\s*[^<]+/i.test(body)) findings.push(finding({title:'Page title is missing',category:'accessibility',severity:'medium',summary:'The document has no meaningful title for users and assistive technology.',recommendation:'Provide a unique, descriptive title for every route.'}));
 if(!/lang=["'][a-z]{2}/i.test(body)) findings.push(finding({title:'Document language is not declared',category:'accessibility',severity:'medium',summary:'Assistive technology cannot reliably determine the page language.',recommendation:'Set a valid lang attribute on the html element.'}));
 const penalty=findings.reduce((sum,item)=>sum+({critical:30,high:15,medium:7,low:3,info:0}[item.severity]),0);
 return {score:Math.max(0,100-penalty),findings};
}
