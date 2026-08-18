import test from 'node:test';import assert from 'node:assert/strict';import {store} from './store.js';
test('creates isolated projects and runs',()=>{const project=store.createProject({name:'Test product',kind:'web',targetUrl:'https://example.com'});const run=store.createRun(project.id);assert.equal(run.projectId,project.id);assert.equal(run.status,'queued');});
