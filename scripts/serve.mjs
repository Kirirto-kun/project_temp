import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
if(existsSync('.env.local'))loadEnvFile('.env.local');
const standalone=process.argv.includes('--standalone');
const children=[
  spawn(process.execPath,standalone?['server.js']:['node_modules/next/dist/bin/next','start',...process.argv.slice(2)],{stdio:'inherit',windowsHide:true}),
  spawn(process.execPath,['--import','tsx','scripts/cleanup.ts'],{stdio:'inherit',windowsHide:true}),
];
let closing=false;
function stop(){if(closing)return;closing=true;for(const child of children)child.kill();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
for(const child of children)child.on('exit',code=>{stop();process.exitCode=code??1;});
