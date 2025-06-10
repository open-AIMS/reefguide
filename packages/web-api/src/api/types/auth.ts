import { UserRole } from '@prisma/client';
import { z } from 'zod';

// Auth schemas
export const RegisterInputSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});
export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export const RegisterResponseSchema = z.object({
  userId: z.number(),
});
export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;

// Login schemas
export const LoginInputSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const LoginResponseSchema = z.object({
  token: z.string(),
  // B64 encoded payload of {id, token}
  refreshToken: z.string(),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// Profile schema
export const ProfileResponseSchema = z.object({
  user: z.object({
    id: z.number(),
    email: z.string().email(),
  }),
});
export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;

export const UserDetailsSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  roles: z.array(z.nativeEnum(UserRole)),
});
export type UserDetails = z.infer<typeof UserDetailsSchema>;

// The decoded contents of a refresh token
export const RefreshTokenContentsSchema = z.object({
  id: z.number(),
  token: z.string(),
});
export type RefreshTokenContents = z.infer<typeof RefreshTokenContentsSchema>;

// Token schemas
export const TokenInputSchema = z.object({
  refreshToken: z.string(),
});
export type TokenInput = z.infer<typeof TokenInputSchema>;

export const TokenResponseSchema = z.object({
  token: z.string(),
});
export type TokenResponse = z.infer<typeof TokenResponseSchema>;

// Set of user roles
export const UserRolesEnumSchema = z.enum(['ADMIN']);
export type UserRolesEnum = z.infer<typeof UserRolesEnumSchema>;

// JWT contents
export const JwtContentsSchema = z.object({
  id: z.number(),
  email: z.string(),
  // Roles for the user
  roles: z.array(UserRolesEnumSchema),
});
export type JwtContents = z.infer<typeof JwtContentsSchema>;
