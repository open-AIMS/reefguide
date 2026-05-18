import { createServer } from 'net';

/*
Checks if port is free by trying to create a server.
This is needed for turbo watch because sometimes the port is still in-use
when it restarts the web-api.
*/

const apiPort = parseInt(process.env.PORT ?? '');
if (Number.isNaN(apiPort)) {
  throw new Error('PORT env variable not defined');
}

async function isPortFree(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

const interval = 500; //ms

async function waitForPort(port: number, maxAttempts = 60): Promise<void> {
  let attempts = 0;
  while (attempts < maxAttempts) {
    if (await isPortFree(port)) {
      console.log(`✓ Port ${port} is free`);
      return;
    }
    attempts++;
    console.log(`Port ${port} is in use, waiting... (attempt ${attempts}/${maxAttempts})`);
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  const totatTime = (maxAttempts * interval) / 1_000;
  throw new Error(`Port ${port} did not become free after ${maxAttempts} attempts ~${totalTime}ms`);
}

waitForPort(apiPort).catch(err => {
  console.error(err.message);
  process.exit(1);
});
