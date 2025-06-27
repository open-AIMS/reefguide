import { prisma, UserRole } from '@reefguide/db';
import {
  BulkCreatePreApprovedUsersInputSchema,
  BulkCreatePreApprovedUsersResponse,
  CreatePreApprovedUserInputSchema,
  CreatePreApprovedUserResponse,
  DeletePreApprovedUserResponse,
  GetPreApprovedUserResponse,
  GetPreApprovedUsersResponse,
  GetPreApprovedUsersSchema,
  LoginInputSchema,
  LoginResponse,
  PreApprovedUserParamsSchema,
  ProfileResponse,
  RegisterInputSchema,
  RegisterResponse,
  TokenInputSchema,
  TokenResponse,
  UpdatePreApprovedUserInputSchema,
  UpdatePreApprovedUserResponse
} from '@reefguide/types';
import bcryptjs from 'bcrypt';
import express, { Request, Response, Router } from 'express';
import { processRequest } from 'zod-express-middleware';
import * as Exceptions from '../exceptions';
import { registerUser } from '../services/auth';
import { generateRefreshToken, signJwt } from './jwtUtils';
import { passport } from './passportConfig';
import {
  assertUserIsAdminMiddleware,
  decodeRefreshToken,
  getRefreshTokenObject,
  isRefreshTokenValid as validateRefreshToken
} from './utils';
import z from 'zod';
import { PreApprovedUserService } from '../services/preApproval';

require('express-async-errors');
export const router: Router = express.Router();

// All users are granted this role by default
export const BASE_ROLES: UserRole[] = [UserRole.DEFAULT];

/**
 * Register a new user
 */
router.post(
  '/register',
  processRequest({ body: RegisterInputSchema }),
  async (req: Request, res: Response<RegisterResponse>) => {
    const { password, email } = req.body;

    const result = await prisma.$transaction(async tx => {
      // Check for pre-approval within transaction
      const preApprovedUserService = new PreApprovedUserService(tx);
      const approval = await preApprovedUserService.use(email);

      const startingRoles = approval ? approval.roles : [];
      for (const role of BASE_ROLES) {
        if (!startingRoles.includes(role)) {
          startingRoles.push(role);
        }
      }

      const newUserId = await registerUser({ email, password, roles: startingRoles });
      return newUserId;
    });

    res.status(200).json({ userId: result });
  }
);
/**
 * Login user
 */
router.post(
  '/login',
  processRequest({ body: LoginInputSchema }),
  async (req, res: Response<LoginResponse>) => {
    const { email, password: submittedPassword } = req.body;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        // Adjust fields here
        id: true,
        email: true,
        password: true,
        roles: true
      }
    });

    if (!user) {
      throw new Exceptions.UnauthorizedException('Invalid credentials');
    }

    // Check password
    const isPasswordValid = await bcryptjs.compare(submittedPassword, user.password);

    if (!isPasswordValid) {
      throw new Exceptions.UnauthorizedException('Invalid credentials');
    }

    // Generate JWT - include ID and email
    // NOTE here is where we control what is embedded into JWT
    const token = signJwt({
      id: user.id,
      email: user.email,
      roles: user.roles
    });

    // Generate a refresh token
    const refreshToken = await generateRefreshToken(user.id);

    // and add login to log
    await prisma.userLog.create({
      data: { action: 'LOGIN', userId: user.id }
    });

    // Return token and refresh token
    res.json({ token, refreshToken });
  }
);

/**
 * Get a new token using refresh token
 */
router.post(
  '/token',
  processRequest({ body: TokenInputSchema }),
  async (req, res: Response<TokenResponse>) => {
    // Pull out body contents
    const { refreshToken } = req.body;

    // Try to decode the token
    const decodedToken = decodeRefreshToken(refreshToken);

    // The decoded token contains both an ID and a token - check for both
    const tokenDbObject = await getRefreshTokenObject(decodedToken);

    // We have a valid, matching refresh token - now check it's valid
    validateRefreshToken(tokenDbObject);

    // Everything is okay - issue a new JWT
    const jwt = signJwt({
      id: tokenDbObject.user.id,
      email: tokenDbObject.user.email,
      roles: tokenDbObject.user.roles
    });

    // Return token and refresh token
    res.json({ token: jwt });
  }
);

/**
 * Get user profile (protected route)
 */
router.get(
  '/profile',
  passport.authenticate('jwt', { session: false }),
  (req: Request, res: Response<ProfileResponse>) => {
    if (!req.user) {
      throw new Exceptions.InternalServerError(
        'User object was not available after authorisation.'
      );
    }
    // The user is attached to the request by Passport
    res.json({ user: req.user });
  }
);

/**
 * Create a new pre-approved user (Admin only)
 */
router.post(
  '/admin/pre-approved-users',
  passport.authenticate('jwt', { session: false }),
  assertUserIsAdminMiddleware,
  processRequest({ body: CreatePreApprovedUserInputSchema }),
  async (req, res: Response<CreatePreApprovedUserResponse>) => {
    const { email, roles } = req.body;
    if (!req.user) {
      throw new Exceptions.UnauthorizedException('Not authenticated');
    }

    const createdByUserId = req.user?.id;

    const preApprovedUserService = new PreApprovedUserService(prisma);

    const preApprovedUser = await preApprovedUserService.create({
      email,
      roles,
      createdByUserId
    });

    res.status(201).json({ preApprovedUser });
  }
);

/**
 * Bulk create pre-approved users (Admin only)
 */
router.post(
  '/admin/pre-approved-users/bulk',
  passport.authenticate('jwt', { session: false }),
  assertUserIsAdminMiddleware,
  processRequest({ body: BulkCreatePreApprovedUsersInputSchema }),
  async (req, res: Response<BulkCreatePreApprovedUsersResponse>) => {
    const { users } = req.body;

    if (!req.user) {
      throw new Exceptions.UnauthorizedException('Not authenticated.');
    }
    const createdByUserId = req.user?.id;

    // Add createdByUserId to each user input
    const usersWithCreator = users.map(user => ({
      ...user,
      createdByUserId
    }));

    const preApprovedUserService = new PreApprovedUserService(prisma);
    const result = await preApprovedUserService.bulkCreate(usersWithCreator);

    res.status(201).json({
      ...result,
      summary: {
        totalRequested: users.length,
        totalCreated: result.created.length,
        totalErrors: result.errors.length
      }
    });
  }
);

/**
 * Get all pre-approved users with filtering (Admin only)
 */
router.get(
  '/admin/pre-approved-users',
  passport.authenticate('jwt', { session: false }),
  assertUserIsAdminMiddleware,
  processRequest({ body: GetPreApprovedUsersSchema }),
  async (req, res: Response<GetPreApprovedUsersResponse>) => {
    const { email, used, createdByUserId, limit = 50, offset = 0 } = req.body;

    const preApprovedUserService = new PreApprovedUserService(prisma);

    const preApprovedUsers = await preApprovedUserService.getMany({
      email,
      used,
      createdByUserId,
      limit,
      offset
    });

    // Get total count for pagination
    const total = await preApprovedUserService.getCount({
      email,
      used,
      createdByUserId
    });

    res.json({
      preApprovedUsers,
      pagination: {
        total,
        limit,
        offset
      }
    });
  }
);

/**
 * Get a specific pre-approved user by ID (Admin only)
 */
router.get(
  '/admin/pre-approved-users/:id',
  passport.authenticate('jwt', { session: false }),
  assertUserIsAdminMiddleware,
  processRequest({ params: PreApprovedUserParamsSchema }),
  async (req, res: Response<GetPreApprovedUserResponse>) => {
    const { id: stringId } = req.params;
    const id = parseInt(stringId);
    const preApprovedUserService = new PreApprovedUserService(prisma);
    const preApprovedUser = await preApprovedUserService.getById(id);

    if (!preApprovedUser) {
      throw new Exceptions.NotFoundException(`Pre-approved user with ID ${id} not found`);
    }

    res.json({ preApprovedUser });
  }
);

/**
 * Update a pre-approved user (Admin only)
 */
router.put(
  '/admin/pre-approved-users/:id',
  passport.authenticate('jwt', { session: false }),
  assertUserIsAdminMiddleware,
  processRequest({
    params: PreApprovedUserParamsSchema,
    body: UpdatePreApprovedUserInputSchema
  }),
  async (req, res: Response<UpdatePreApprovedUserResponse>) => {
    const { id: stringId } = req.params;
    const id = parseInt(stringId);
    const updateData = req.body;

    const preApprovedUserService = new PreApprovedUserService(prisma);

    try {
      const preApprovedUser = await preApprovedUserService.update(id, updateData);
      res.json({ preApprovedUser });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw new Exceptions.NotFoundException(`Pre-approved user with ID ${id} not found`);
      }
      if (error instanceof Error && error.message.includes('already been used')) {
        throw new Exceptions.BadRequestException(error.message);
      }
      throw error;
    }
  }
);

/**
 * Delete a pre-approved user (Admin only)
 */
router.delete(
  '/admin/pre-approved-users/:id',
  passport.authenticate('jwt', { session: false }),
  assertUserIsAdminMiddleware,
  processRequest({ params: PreApprovedUserParamsSchema }),
  async (req, res: Response<DeletePreApprovedUserResponse>) => {
    const { id: stringId } = req.params;
    const id = parseInt(stringId);

    const preApprovedUserService = new PreApprovedUserService(prisma);
    const success = await preApprovedUserService.delete(id);

    if (!success) {
      throw new Exceptions.NotFoundException(`Pre-approved user with ID ${id} not found`);
    }

    res.json({ message: `Successfully deleted pre-approval with ID ${id}` });
  }
);

/**
 * Cleanup old used pre-approvals (Admin only)
 */
router.post(
  '/admin/pre-approved-users/cleanup',
  passport.authenticate('jwt', { session: false }),
  assertUserIsAdminMiddleware,
  processRequest({
    body: z.object({
      olderThanDays: z.number().min(1).default(30)
    })
  }),
  async (req, res: Response<{ deletedCount: number }>) => {
    const { olderThanDays = 30 } = req.body;

    const preApprovedUserService = new PreApprovedUserService(prisma);
    const deletedCount = await preApprovedUserService.cleanupUsedPreApprovals(olderThanDays);

    res.json({ deletedCount });
  }
);
