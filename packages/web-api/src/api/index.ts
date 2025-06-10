import app from './apiSetup';
import {config} from './config';
import {initialiseAdmins} from './initialise';

console.log('Initializing admins...');
initialiseAdmins();

const port = config.port || 5000;

app.listen(port, () => {
  console.log(`Listening: http://localhost:${port}`);
});
