import { exec } from 'child_process';

console.log('Starting Next.js development server...');

const child = exec('npx next dev -p 5000', {
  cwd: process.cwd(),
});

child.stdout?.on('data', (data) => {
  process.stdout.write(data);
});

child.stderr?.on('data', (data) => {
  process.stderr.write(data);
});

child.on('exit', (code) => {
  process.exit(code || 0);
});

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});

process.on('SIGINT', () => {
  child.kill('SIGINT');
});
