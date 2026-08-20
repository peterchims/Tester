import type { AuditRun, CreateProject, Finding } from '@quality/contracts';
import { nanoid } from 'nanoid';
export type Project = CreateProject & {id:string; createdAt:string};
const seed: Project = {id:'wisdom-demo',name:'Wisdom Church',kind:'web',targetUrl:'https://wisdomchurchhq.org',createdAt:new Date().toISOString()};
const projects = new Map<string,Project>([[seed.id,seed]]);
const findings: Finding[] = [
 {id:'f1',title:'Mobile bottom sheet interaction',category:'ux',severity:'high',summary:'Validate scroll locking, drag dismissal, keyboard resizing, and focus restoration on physical devices.',recommendation:'Run the modal journey across iOS Safari and Android Chrome before release.'},
 {id:'f2',title:'Production API resilience',category:'reliability',severity:'high',summary:'Intermittent gateway failures interrupt data-dependent journeys.',recommendation:'Enforce health checks, bounded retries, rate-limit isolation, and upstream observability.'},
 {id:'f3',title:'Image delivery consistency',category:'performance',severity:'medium',summary:'Large image transformations can delay meaningful content.',recommendation:'Pre-size media, serve modern formats, and monitor LCP by viewport.'}
];
const runs = new Map<string,AuditRun>([['run-demo',{id:'run-demo',projectId:seed.id,status:'failed',score:78,startedAt:new Date(Date.now()-320000).toISOString(),completedAt:new Date().toISOString(),findings}]]);
export const store = {
 listProjects:()=>[...projects.values()], getProject:(id:string)=>projects.get(id),
 createProject:(input:CreateProject)=>{const p={...input,id:nanoid(),createdAt:new Date().toISOString()};projects.set(p.id,p);return p;},
 listRuns:(projectId?:string)=>[...runs.values()].filter(r=>!projectId||r.projectId===projectId).sort((a,b)=>b.startedAt.localeCompare(a.startedAt)),
 getRun:(id:string)=>runs.get(id),
 createRun:(projectId:string)=>{const run:AuditRun={id:nanoid(),projectId,status:'queued',score:0,startedAt:new Date().toISOString(),findings:[]};runs.set(run.id,run);return run;},
 updateRun:(id:string, patch:Partial<AuditRun>)=>{const run=runs.get(id);if(!run)return;const updated={...run,...patch,id:run.id,projectId:run.projectId};runs.set(id,updated);return updated;}
};
