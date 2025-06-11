import express, { Router } from 'express';
import { z } from 'zod';
import { processRequest } from 'zod-express-middleware';
import { prisma } from '../apiSetup';
import { passport } from '../auth/passportConfig';
import { userIsAdmin } from '../auth/utils';
import { NotFoundException, UnauthorizedException } from '../exceptions';
require('express-async-errors');

export const router: Router = express.Router();

// Input validation schemas
const createNoteSchema = z.object({
  content: z.string(),
  polygonId: z.number()
});

const updateNoteSchema = z.object({
  content: z.string()
});

/** Get all notes for the user, or all notes if admin */
router.get('/', passport.authenticate('jwt', { session: false }), async (req, res) => {
  if (!req.user) {
    throw new UnauthorizedException();
  }

  let notes;

  if (userIsAdmin(req.user)) {
    // Admin gets all notes
    notes = await prisma.polygonNote.findMany({});
  } else {
    // Normal users get only their own notes
    notes = await prisma.polygonNote.findMany({
      where: { user_id: req.user.id }
    });
  }

  res.json({ notes });
});

/** Get all notes for a specific polygon*/
router.get(
  '/:id',
  processRequest({ params: z.object({ id: z.string() }) }),
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    if (!req.user) {
      throw new UnauthorizedException();
    }
    const polygonId = parseInt(req.params.id);

    const polygon = await prisma.polygon.findUnique({
      where: { id: polygonId }
    });

    if (!polygon) {
      throw new NotFoundException('Polygon not found');
    }

    if (!userIsAdmin(req.user) && polygon.user_id !== req.user.id) {
      throw new UnauthorizedException();
    }

    const notes = await prisma.polygonNote.findMany({
      where: { polygon_id: polygonId }
    });

    res.json({ notes });
  }
);

/** Create a new note for the given polygon ID */
router.post(
  '/',
  processRequest({
    body: createNoteSchema
  }),
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    if (!req.user) {
      throw new UnauthorizedException();
    }
    const userId = req.user.id;
    const { content: note, polygonId } = req.body;

    const polygon = await prisma.polygon.findUnique({
      where: { id: polygonId }
    });

    if (!polygon) {
      throw new NotFoundException('Polygon not found');
    }

    if (!userIsAdmin(req.user) && polygon.user_id !== userId) {
      throw new UnauthorizedException('You do not have permission to add notes to this polygon');
    }

    const newNote = await prisma.polygonNote.create({
      data: {
        content: note,
        user_id: userId,
        polygon_id: polygonId
      }
    });

    res.status(200).json({
      note: newNote
    });
  }
);

/** Update a note by note ID */
router.put(
  '/:id',
  processRequest({
    body: updateNoteSchema,
    params: z.object({ id: z.string() })
  }),
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    if (!req.user) {
      throw new UnauthorizedException();
    }
    const userId = req.user.id;
    const noteId = parseInt(req.params.id);
    const { content: note } = req.body;

    const existingNote = await prisma.polygonNote.findUnique({
      where: { id: noteId }
    });

    if (!existingNote) {
      throw new NotFoundException('Note not found');
    }

    if (!userIsAdmin(req.user) && existingNote.user_id !== userId) {
      throw new UnauthorizedException();
    }

    const updatedPolygon = await prisma.polygonNote.update({
      where: { id: noteId },
      data: {
        content: note
      }
    });

    res.json({ note: updatedPolygon });
  }
);

/** Delete a note by note ID */
router.delete(
  '/:id',
  processRequest({ params: z.object({ id: z.string() }) }),
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    if (!req.user) {
      throw new UnauthorizedException();
    }
    const noteId = parseInt(req.params.id);

    const existingNote = await prisma.polygonNote.findUnique({
      where: { id: noteId }
    });

    if (!existingNote) {
      throw new NotFoundException('Note not found');
    }

    if (!userIsAdmin(req.user) && existingNote.user_id !== req.user.id) {
      throw new UnauthorizedException();
    }

    await prisma.polygonNote.delete({
      where: { id: noteId }
    });

    res.status(204).send();
  }
);
