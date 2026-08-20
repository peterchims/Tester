import { z } from 'zod';

export const productKind = z.enum(['web', 'mobile', 'api', 'multi-platform']);
export const auditCategory = z.enum(['design', 'ux', 'accessibility', 'performance', 'functionality', 'api', 'security', 'devops', 'reliability']);
export const severity = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(80),
  kind: productKind,
  targetUrl: z.string().url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol), 'Only HTTP(S) targets are supported').optional(),
  figmaUrl: z.string().url().optional(),
  repositoryUrl: z.string().url().optional(),
});
export const runOptionsSchema = z.object({
  profile: z.enum(['desktop', 'mobile', 'both']).default('both'),
}).default({ profile: 'both' });
export type CreateProject = z.infer<typeof createProjectSchema>;
export type RunOptions = z.infer<typeof runOptionsSchema>;
export type Finding = {id:string; title:string; category:z.infer<typeof auditCategory>; severity:z.infer<typeof severity>; summary:string; evidence?:string; recommendation:string};
export type AuditRun = {id:string; projectId:string; status:'queued'|'running'|'passed'|'failed'; score:number; startedAt:string; completedAt?:string; error?:string; findings:Finding[]};
