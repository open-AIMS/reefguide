import app from '../src/apiSetup';
import { createTestPolygon } from './utils/testData';
import { authRequest, clearDbs, user1Id, userSetup } from './utils/testSetup';

describe('Polygons', () => {
  let polygonId: number;

  beforeEach(async () => {
    await clearDbs();
    await userSetup();

    const polygon = await createTestPolygon(user1Id);
    polygonId = polygon.id;
  });

  describe('GET /api/polygons', () => {
    it('should return all polygons for admin', async () => {
      const res = await authRequest(app, 'admin').get('/api/polygons').expect(200);

      expect(res.body.polygons).toBeInstanceOf(Array);
      expect(res.body.polygons.length).toBeGreaterThan(0);
    });

    it("should return only user's polygons for non-admin", async () => {
      const res = await authRequest(app, 'user1').get('/api/polygons').expect(200);

      expect(res.body.polygons).toBeInstanceOf(Array);
      expect(res.body.polygons.length).toBe(1);
    });

    it('should return empty array if user has no polygons', async () => {
      const res = await authRequest(app, 'user2').get('/api/polygons').expect(200);

      expect(res.body.polygons).toBeInstanceOf(Array);
      expect(res.body.polygons.length).toBe(0);
    });
  });

  describe('GET /api/polygons/:id', () => {
    it('should return a specific polygon for its owner', async () => {
      const res = await authRequest(app, 'user1').get(`/api/polygons/${polygonId}`).expect(200);

      expect(res.body.polygon).toHaveProperty('id', polygonId);
    });

    it('should return a specific polygon for admin', async () => {
      const res = await authRequest(app, 'admin').get(`/api/polygons/${polygonId}`).expect(200);

      expect(res.body.polygon).toHaveProperty('id', polygonId);
    });

    it('should return 401 if user is not the owner', async () => {
      await authRequest(app, 'user2').get(`/api/polygons/${polygonId}`).expect(401);
    });

    it('should return 404 for non-existent polygon', async () => {
      await authRequest(app, 'user1').get('/api/polygons/9999').expect(404);
    });
  });

  describe('POST /api/polygons', () => {
    it('should create a new polygon', async () => {
      const res = await authRequest(app, 'user1')
        .post('/api/polygons')
        .send({
          polygon: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
                [0, 0]
              ]
            ]
          }
        })
        .expect(200);

      expect(res.body.polygon).toHaveProperty('id');
      expect(res.body.polygon).toHaveProperty('polygon');
    });

    it('should return 400 for invalid GeoJSON', async () => {
      await authRequest(app, 'user1')
        .post('/api/polygons')
        .send({ polygon: 'invalid' })
        .expect(400);
    });
  });

  describe('PUT /api/polygons/:id', () => {
    it('should update an existing polygon', async () => {
      const res = await authRequest(app, 'user1')
        .put(`/api/polygons/${polygonId}`)
        .send({
          polygon: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [2, 0],
                [2, 2],
                [0, 2],
                [0, 0]
              ]
            ]
          }
        })
        .expect(200);

      expect(res.body.polygon).toHaveProperty('id', polygonId);
      expect(
        res.body.polygon.polygon.coordinates[0].map((a: Array<number>) => a.toString())
      ).toContain([2, 2].toString());
    });

    it('should return 401 if user is not the owner', async () => {
      await authRequest(app, 'user2')
        .put(`/api/polygons/${polygonId}`)
        .send({
          polygon: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [2, 0],
                [2, 2],
                [0, 2],
                [0, 0]
              ]
            ]
          }
        })
        .expect(401);
    });

    it('should return 404 for non-existent polygon', async () => {
      await authRequest(app, 'user1')
        .put('/api/polygons/9999')
        .send({
          polygon: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [2, 0],
                [2, 2],
                [0, 2],
                [0, 0]
              ]
            ]
          }
        })
        .expect(404);
    });
  });

  describe('DELETE /api/polygons/:id', () => {
    it('should delete an existing polygon', async () => {
      await authRequest(app, 'user1').delete(`/api/polygons/${polygonId}`).expect(200);

      // Verify the polygon is deleted
      await authRequest(app, 'user1').get(`/api/polygons/${polygonId}`).expect(404);
    });

    it('should return 401 if user is not the owner', async () => {
      await authRequest(app, 'user2').delete(`/api/polygons/${polygonId}`).expect(401);
    });

    it('should return 404 for non-existent polygon', async () => {
      await authRequest(app, 'user1').delete('/api/polygons/9999').expect(404);
    });
  });
});
