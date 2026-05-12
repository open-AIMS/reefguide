// import request from 'supertest';
import app from '../src/apiSetup';
import { authRequest, userSetup } from './utils/testSetup';

// TODO enable when map layers migration is final
describe.skip('Map Layers', () => {
  beforeEach(async () => {
    // REVIEW should every test clear the database?
    // await clearDbs();
    await userSetup();
  });

  it('GET /', async () => {
    const res = await authRequest(app, 'user1').get('/api/map-layers').expect(200);
    expect(res.body).toBeDefined();
    expect(Array.isArray(res.body)).toBe(true);
  });
});
