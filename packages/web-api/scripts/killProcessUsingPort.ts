import { execSync } from 'child_process';

const port = process.env.PORT;

if (!port) {
  console.error('PORT environment variable is not set.');
  process.exit(1);
}

let pid: string;
try {
  pid = execSync(`lsof -t -i :${port}`).toString().trim();
} catch {
  console.log(`No process found using port ${port}.`);
  process.exit(0);
}

if (!pid) {
  console.log(`No process found using port ${port}.`);
  process.exit(0);
}

console.log(`\nProcess info:`);
try {
  const info = execSync(`ps -p ${pid} -o pid,ppid,user,comm,args`).toString();
  console.log(info);
} catch {
  console.log(`Could not retrieve process info for PID ${pid}.`);
}

console.log(`Killing process ${pid}...`);
execSync(`kill -9 ${pid}`);
console.log(`Process ${pid} killed.`);
