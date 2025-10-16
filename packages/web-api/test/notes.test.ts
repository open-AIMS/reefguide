import { prisma } from '@reefguide/db';
import app from '../src/apiSetup';
import { createTestNote, createTestPolygon } from './utils/testData';
import { authRequest, clearDbs, user1Id, userSetup } from './utils/testSetup';

describe('Notes', () => {
  let polygonId: number;
  let noteId: number;

  beforeEach(async () => {
    await clearDbs();
    await userSetup();

    const polygon = await createTestPolygon(user1Id);
    polygonId = polygon.id;

    const note = await createTestNote(polygonId, user1Id);
    noteId = note.id;
  });

  describe('GET /api/notes', () => {
    it('should return all notes for admin', async () => {
      const res = await authRequest(app, 'admin').get('/api/notes').expect(200);

      expect(res.body.notes).toBeInstanceOf(Array);
      expect(res.body.notes.length).toBeGreaterThan(0);
    });

    it("should return only user's notes for non-admin", async () => {
      const res = await authRequest(app, 'user1').get('/api/notes').expect(200);

      expect(res.body.notes).toBeInstanceOf(Array);
      expect(res.body.notes.length).toBe(1);
    });

    it('should return empty array if user has no notes', async () => {
      const res = await authRequest(app, 'user2').get('/api/notes').expect(200);

      expect(res.body.notes).toBeInstanceOf(Array);
      expect(res.body.notes.length).toBe(0);
    });
  });

  describe('GET /api/notes/:id', () => {
    it('should return notes for a specific polygon (owner)', async () => {
      const res = await authRequest(app, 'user1').get(`/api/notes/polygon/${polygonId}`).expect(200);

      expect(res.body.notes).toBeInstanceOf(Array);
      expect(res.body.notes.length).toBe(1);
      expect(res.body.notes[0]).toHaveProperty('content', 'Test note');
    });

    it('should return notes for a specific polygon (admin)', async () => {
      const res = await authRequest(app, 'admin').get(`/api/notes/polygon/${polygonId}`).expect(200);

      expect(res.body.notes).toBeInstanceOf(Array);
      expect(res.body.notes.length).toBe(1);
    });

    it('should return 401 if user is not the owner', async () => {
      await authRequest(app, 'user2').get(`/api/notes/polygon/${polygonId}`).expect(401);
    });

    it('should return 404 for non-existent polygon', async () => {
      await authRequest(app, 'user1').get('/api/notes/polygon/9999').expect(404);
    });
  });

  describe('POST /api/notes', () => {
    it('should create a new note', async () => {
      const res = await authRequest(app, 'user1')
        .post('/api/notes')
        .send({
          content: 'New test note',
          polygonId: polygonId
        })
        .expect(200);

      expect(res.body.note).toHaveProperty('id');
      expect(res.body.note).toHaveProperty('content', 'New test note');
    });

    it('should return 400 for invalid input', async () => {
      await authRequest(app, 'user1').post('/api/notes').send({ polygonId: polygonId }).expect(400);
    });

    it("should return 401 if user doesn't own the polygon", async () => {
      await authRequest(app, 'user2')
        .post('/api/notes')
        .send({
          content: 'Unauthorized note',
          polygonId: polygonId
        })
        .expect(401);
    });
  });

  describe('PUT /api/notes/:id', () => {
    it('should update an existing note', async () => {
      const res = await authRequest(app, 'user1')
        .put(`/api/notes/${noteId}`)
        .send({ content: 'Updated test note' })
        .expect(200);

      expect(res.body.note).toHaveProperty('id', noteId);
      expect(res.body.note).toHaveProperty('content', 'Updated test note');
    });

    it('should return 401 if user is not the owner', async () => {
      await authRequest(app, 'user2')
        .put(`/api/notes/${noteId}`)
        .send({ content: 'Unauthorized update' })
        .expect(401);
    });

    it('should return 404 for non-existent note', async () => {
      await authRequest(app, 'user1')
        .put('/api/notes/9999')
        .send({ content: 'Non-existent note' })
        .expect(404);
    });
  });

  describe('DELETE /api/notes/:id', () => {
    it('should delete an existing note', async () => {
      await authRequest(app, 'user1').delete(`/api/notes/${noteId}`).expect(204);

      // Verify the note is deleted
      const notes = await prisma.polygonNote.findMany({
        where: { id: noteId }
      });
      expect(notes.length).toBe(0);
    });

    it('should return 401 if user is not the owner', async () => {
      await authRequest(app, 'user2').delete(`/api/notes/${noteId}`).expect(401);
    });

    it('should return 404 for non-existent note', async () => {
      await authRequest(app, 'user1').delete('/api/notes/9999').expect(404);
    });
  });
});
