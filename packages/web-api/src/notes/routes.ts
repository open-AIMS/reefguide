import { prisma } from '@reefguide/db';
import {
  CreateNoteInputSchema,
  CreateNoteResponse,
  DeleteNoteResponse,
  GetNoteResponse,
  GetNotesResponse,
  NoteParamsSchema,
  PolygonParamsSchema,
  UpdateNoteInputSchema,
  UpdateNoteResponse
} from '@reefguide/types';
import express, { Response, Router } from 'express';
import { processRequest } from 'zod-express-middleware';
import { passport } from '../auth/passportConfig';
import { assertUserHasRoleMiddleware, userIsAdmin } from '../auth/utils';
import { InternalServerError, NotFoundException, UnauthorizedException } from '../exceptions';

require('express-async-errors');

export const router: Router = express.Router();

/**
 * Get all notes for the user, or all notes if admin
 */
router.get(
  '/',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  async (req, res: Response<GetNotesResponse>) => {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    try {
      let notes;

      if (userIsAdmin(req.user)) {
        // Admin gets all notes with user information
        notes = await prisma.polygonNote.findMany({
          include: {
            user: {
              select: {
                id: true,
                email: true
              }
            }
          }
        });
      } else {
        // Normal users get only their own notes
        notes = await prisma.polygonNote.findMany({
          where: { user_id: req.user.id },
          include: {
            user: {
              select: {
                id: true,
                email: true
              }
            }
          }
        });
      }

      res.json({ notes });
    } catch (error) {
      throw new InternalServerError('Failed to get notes. Error: ' + error, error as Error);
    }
  }
);

/**
 * Get all notes for a specific polygon
 */
router.get(
  '/polygon/:id',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    params: PolygonParamsSchema
  }),
  async (req, res: Response<GetNotesResponse>) => {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    try {
      const polygonId = parseInt(req.params.id);

      const polygon = await prisma.polygon.findUnique({
        where: { id: polygonId }
      });

      if (!polygon) {
        throw new NotFoundException('Polygon not found');
      }

      if (!userIsAdmin(req.user) && polygon.user_id !== req.user.id) {
        throw new UnauthorizedException(
          'You do not have permission to view notes for this polygon'
        );
      }

      const notes = await prisma.polygonNote.findMany({
        where: { polygon_id: polygonId },
        include: {
          user: {
            select: {
              id: true,
              email: true
            }
          }
        }
      });

      res.json({ notes });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof UnauthorizedException) throw error;
      throw new InternalServerError('Failed to get polygon notes. Error: ' + error, error as Error);
    }
  }
);

/**
 * Get a specific note by ID
 */
router.get(
  '/:id',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    params: NoteParamsSchema
  }),
  async (req, res: Response<GetNoteResponse>) => {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    try {
      const noteId = parseInt(req.params.id);

      const note = await prisma.polygonNote.findUnique({
        where: { id: noteId },
        include: {
          user: {
            select: {
              id: true,
              email: true
            }
          },
          polygon: true
        }
      });

      if (!note) {
        throw new NotFoundException('Note not found');
      }

      if (!userIsAdmin(req.user) && note.user_id !== req.user.id) {
        throw new UnauthorizedException('You do not have permission to view this note');
      }

      res.json({ note });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof UnauthorizedException) throw error;
      throw new InternalServerError('Failed to get note. Error: ' + error, error as Error);
    }
  }
);

/**
 * Create a new note for the given polygon ID
 */
router.post(
  '/',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    body: CreateNoteInputSchema
  }),
  async (req, res: Response<CreateNoteResponse>) => {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    try {
      const userId = req.user.id;
      const { content, polygonId } = req.body;

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
          content,
          user_id: userId,
          polygon_id: polygonId
        }
      });

      res.status(201).json({
        note: newNote
      });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof UnauthorizedException) throw error;
      throw new InternalServerError('Failed to create note. Error: ' + error, error as Error);
    }
  }
);

/**
 * Update a note by note ID
 */
router.put(
  '/:id',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    params: NoteParamsSchema,
    body: UpdateNoteInputSchema
  }),
  async (req, res: Response<UpdateNoteResponse>) => {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    try {
      const userId = req.user.id;
      const noteId = parseInt(req.params.id);
      const { content } = req.body;

      const existingNote = await prisma.polygonNote.findUnique({
        where: { id: noteId }
      });

      if (!existingNote) {
        throw new NotFoundException('Note not found');
      }

      if (!userIsAdmin(req.user) && existingNote.user_id !== userId) {
        throw new UnauthorizedException('You do not have permission to update this note');
      }

      const updatedNote = await prisma.polygonNote.update({
        where: { id: noteId },
        data: {
          content
        }
      });

      res.json({ note: updatedNote });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof UnauthorizedException) throw error;
      throw new InternalServerError('Failed to update note. Error: ' + error, error as Error);
    }
  }
);

/**
 * Delete a note by note ID
 */
router.delete(
  '/:id',
  passport.authenticate('jwt', { session: false }),
  assertUserHasRoleMiddleware({ sufficientRoles: ['ANALYST'] }),
  processRequest({
    params: NoteParamsSchema
  }),
  async (req, res: Response<DeleteNoteResponse>) => {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    try {
      const noteId = parseInt(req.params.id);

      const existingNote = await prisma.polygonNote.findUnique({
        where: { id: noteId }
      });

      if (!existingNote) {
        throw new NotFoundException('Note not found');
      }

      if (!userIsAdmin(req.user) && existingNote.user_id !== req.user.id) {
        throw new UnauthorizedException('You do not have permission to delete this note');
      }

      await prisma.polygonNote.delete({
        where: { id: noteId }
      });

      res.json({ message: 'Note deleted successfully' });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof UnauthorizedException) throw error;
      throw new InternalServerError('Failed to delete note. Error: ' + error, error as Error);
    }
  }
);
