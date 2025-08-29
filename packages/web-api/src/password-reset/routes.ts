import { prisma } from '@reefguide/db';
import {
  PostCreateResetRequestSchema,
  PostCreateResetResponse,
  PostUseResetCodeRequestSchema,
  PostUseResetCodeResponse
} from '@reefguide/types';
import express, { Response, Router } from 'express';
import { processRequest } from 'zod-express-middleware';
import { EMAIL_SERVICE } from '../config';
import { BadRequestException, InternalServerError, NotFoundException } from '../exceptions';
import { PasswordResetService } from './service';

require('express-async-errors');
export const router: Router = express.Router();

/**
 * Create a password reset request
 * POST /password-reset/request
 */
router.post(
  '/request',
  processRequest({
    body: PostCreateResetRequestSchema
  }),
  async (req, res: Response<PostCreateResetResponse>) => {
    try {
      const { email } = req.body;
      const resetService = new PasswordResetService(prisma);

      console.log('Received password reset request for email:', email);
      const { code, resetCode } = await resetService.createResetCode({ email });
      console.log('Generated reset code for email:', email);

      // Send email with reset code
      try {
        console.log('Sending password reset email to:', email);
        // Let this work in the background, don't await
        EMAIL_SERVICE.sendEmail({
          options: {
            to: email,
            subject: 'ReefGuide: Password Reset Request',
            text: `Your password reset code is: ${code}

This code will expire in 30 minutes. If you did not request this reset, please ignore this email.`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Password Reset Request</h2>
                <p>You have requested to reset your password. Use the code below to reset your password:</p>
                
                <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                  <h1 style="font-size: 2em; color: #2563eb; margin: 0; letter-spacing: 3px;">${code}</h1>
                </div>
                
                <p><strong>This code will expire in 30 minutes.</strong></p>
                
                <p>If you did not request this password reset, please ignore this email. Your password will remain unchanged.</p>
                
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="font-size: 0.9em; color: #666;">
                  This is an automated message, please do not reply to this email.
                </p>
              </div>
            `
          }
        })
          .then(() => {
            console.log(`Password reset code sent to ${email} (Code ID: ${resetCode.id})`);
          })
          .catch(err => {
            console.error('Error sending password reset email:', err);
          });
      } catch (emailError) {
        console.error('Failed to send reset email:', emailError);
        // Don't expose email sending errors to users for security
        // The reset code was created, so we could implement retry logic
        throw new InternalServerError('Failed to send reset email. Please try again later.');
      }

      res.status(200).json({
        message: 'If an account with that email exists, a reset code has been sent.'
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        // Don't expose whether email exists or not for security
        res.status(200).json({
          message: 'If an account with that email exists, a reset code has been sent.'
        });
        return;
      }

      if (error instanceof BadRequestException || error instanceof InternalServerError) {
        throw error;
      }

      throw new InternalServerError(
        'Failed to process reset request. Error: ' + error,
        error as Error
      );
    }
  }
);

/**
 * Use a password reset code to change password
 * POST /password-reset/confirm
 */
router.post(
  '/confirm',
  processRequest({
    body: PostUseResetCodeRequestSchema
  }),
  async (req, res: Response<PostUseResetCodeResponse>) => {
    try {
      const { code, newPassword } = req.body;
      const resetService = new PasswordResetService(prisma);

      const success = await resetService.useResetCode({
        code,
        newPassword
      });

      if (success) {
        res.status(200).json({
          message:
            'Password has been successfully reset. You can now log in with your new password.'
        });
      } else {
        throw new BadRequestException('Failed to reset password');
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerError('Failed to reset password. Error: ' + error, error as Error);
    }
  }
);
