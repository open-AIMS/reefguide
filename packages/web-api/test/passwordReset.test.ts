import { prisma } from '@reefguide/db';
import request from 'supertest';
import app from '../src/apiSetup';
import { hashPasswordResetCode } from '../src/password-reset/service';
import { clearDbs, userSetup, user1Email } from './utils/testSetup';

describe('Password Reset', () => {
  beforeEach(async () => {
    await clearDbs();
    await userSetup();
  });

  describe('POST /api/password-reset/request', () => {
    it('should create a reset code for valid email', async () => {
      const res = await request(app)
        .post('/api/password-reset/request')
        .send({ email: user1Email })
        .expect(200);

      expect(res.body.message).toContain('reset code has been sent');

      // Verify reset code was created in database
      const resetCode = await prisma.passwordResetCode.findFirst({
        where: { user: { email: user1Email }, used: false }
      });
      expect(resetCode).toBeTruthy();
      expect(resetCode?.expires_at.getTime()).toBeGreaterThan(Date.now());
    });

    it('should return same message for non-existent email (security)', async () => {
      const res = await request(app)
        .post('/api/password-reset/request')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(res.body.message).toContain('reset code has been sent');

      // Verify no reset code was created
      const resetCode = await prisma.passwordResetCode.findFirst({
        where: { user: { email: 'nonexistent@example.com' } }
      });
      expect(resetCode).toBeNull();
    });

    it('should return 400 for invalid email format', async () => {
      await request(app)
        .post('/api/password-reset/request')
        .send({ email: 'invalid-email' })
        .expect(400);
    });

    it('should invalidate existing unused codes when creating new one', async () => {
      // Create first reset code
      await request(app)
        .post('/api/password-reset/request')
        .send({ email: user1Email })
        .expect(200);

      // Create second reset code
      await request(app)
        .post('/api/password-reset/request')
        .send({ email: user1Email })
        .expect(200);

      // Verify only one unused code exists
      const unusedCodes = await prisma.passwordResetCode.findMany({
        where: { user: { email: user1Email }, used: false }
      });
      expect(unusedCodes).toHaveLength(1);
    });
  });

  describe('POST /api/password-reset/confirm', () => {
    let resetCode: string;

    beforeEach(async () => {
      // Create a reset code for testing
      await request(app)
        .post('/api/password-reset/request')
        .send({ email: user1Email })
        .expect(200);

      // Get the code from database (in real app, user gets this from email)
      const codeRecord = await prisma.passwordResetCode.findFirst({
        where: { user: { email: user1Email }, used: false },
        // Sort by latest created to ensure we get the new one
        orderBy: { created_at: 'desc' }
      });

      // For testing, we'll create a known code
      resetCode = '123456';
      const hashedCode = await hashPasswordResetCode(resetCode);

      await prisma.passwordResetCode.update({
        where: { id: codeRecord!.id },
        // Double check unused
        data: { code_hash: hashedCode, used: false, used_at: null }
      });
    });

    it('should reset password with valid code', async () => {
      const newPassword = 'newpassword123';

      const res = await request(app)
        .post('/api/password-reset/confirm')
        .send({
          code: resetCode,
          newPassword,
          confirmPassword: newPassword
        })
        .expect(200);

      expect(res.body.message).toContain('Password has been successfully reset');

      // Verify password was updated by trying to login
      await request(app)
        .post('/api/auth/login')
        .send({ email: user1Email, password: newPassword })
        .expect(200);

      // Verify reset code was marked as used
      const usedCode = await prisma.passwordResetCode.findFirst({
        where: { user: { email: user1Email } },
        orderBy: { created_at: 'desc' }
      });
      expect(usedCode?.used).toBe(true);
      expect(usedCode?.used_at).toBeTruthy();
    });

    it('should return 400 for invalid reset code', async () => {
      await request(app)
        .post('/api/password-reset/confirm')
        .send({
          code: '999999',
          newPassword: 'newpassword123',
          confirmPassword: 'newpassword123'
        })
        .expect(400);
    });

    it('should return 400 for expired reset code', async () => {
      // Update code to be expired
      const codeRecord = await prisma.passwordResetCode.findFirst({
        where: { user: { email: user1Email }, used: false }
      });

      await prisma.passwordResetCode.update({
        where: { id: codeRecord!.id },
        data: { expires_at: new Date(Date.now() - 1000) } // 1 second ago
      });

      await request(app)
        .post('/api/password-reset/confirm')
        .send({
          code: resetCode,
          newPassword: 'newpassword123',
          confirmPassword: 'newpassword123'
        })
        .expect(400);
    });

    it('should return 400 for already used reset code', async () => {
      // Use the code once
      await request(app)
        .post('/api/password-reset/confirm')
        .send({
          code: resetCode,
          newPassword: 'newpassword123',
          confirmPassword: 'newpassword123'
        })
        .expect(200);

      // Try to use it again
      await request(app)
        .post('/api/password-reset/confirm')
        .send({
          code: resetCode,
          newPassword: 'anotherpassword123',
          confirmPassword: 'anotherpassword123'
        })
        .expect(400);
    });

    it('should return 400 for password confirmation mismatch', async () => {
      await request(app)
        .post('/api/password-reset/confirm')
        .send({
          code: resetCode,
          newPassword: 'newpassword123',
          confirmPassword: 'differentpassword123'
        })
        .expect(400);
    });

    it('should return 400 for weak password', async () => {
      await request(app)
        .post('/api/password-reset/confirm')
        .send({
          code: resetCode,
          newPassword: 'weak',
          confirmPassword: 'weak'
        })
        .expect(400);
    });

    it('should invalidate all other user reset codes when one is used', async () => {
      // Create a new reset code
      await request(app)
        .post('/api/password-reset/request')
        .send({ email: user1Email })
        .expect(200);

      // The old code should now be invalidated, verify it returns 400
      await request(app)
        .post('/api/password-reset/confirm')
        .send({
          code: resetCode,
          newPassword: 'newpassword123',
          confirmPassword: 'newpassword123'
        })
        .expect(400);

      // Get the new code
      const newCodeRecord = await prisma.passwordResetCode.findFirst({
        where: { user: { email: user1Email }, used: false },
        orderBy: { created_at: 'desc' }
      });

      const newResetCode = '654321';
      const hashedNewCode = await hashPasswordResetCode(newResetCode);

      await prisma.passwordResetCode.update({
        where: { id: newCodeRecord!.id },
        data: { code_hash: hashedNewCode }
      });

      // Use the new code - should work
      await request(app)
        .post('/api/password-reset/confirm')
        .send({
          code: newResetCode,
          newPassword: 'newpassword123',
          confirmPassword: 'newpassword123'
        })
        .expect(200);

      // Try to use both old codes again - both should fail
      await request(app)
        .post('/api/password-reset/confirm')
        .send({
          code: resetCode,
          newPassword: 'anotherpassword123',
          confirmPassword: 'anotherpassword123'
        })
        .expect(400);

      await request(app)
        .post('/api/password-reset/confirm')
        .send({
          code: newResetCode,
          newPassword: 'yetanotherpassword123',
          confirmPassword: 'yetanotherpassword123'
        })
        .expect(400);

      // Verify all codes for this user are marked as used
      const allCodes = await prisma.passwordResetCode.findMany({
        where: { user: { email: user1Email } }
      });
      expect(allCodes.every(code => code.used)).toBe(true);
    });
  });
});
