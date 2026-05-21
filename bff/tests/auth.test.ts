import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { otpStore } from '../src/auth/otpStore.js';
import { computeNullifierHash, signTicket } from '../src/auth/ticket.js';
import { registerAuthRoutes } from '../src/auth/handler.js';

describe('BFF Authentication & Ticket Tests', () => {
  beforeEach(() => {
    otpStore.clear();
    process.env.SURVEY_PASS_ISSUER_SALT = 'test_salt_123456';
    process.env.SURVEY_PASS_ISSUER_PRIV = '0101010101010101010101010101010101010101010101010101010101010101'; // 32 bytes hex
  });

  afterEach(() => {
    delete process.env.SURVEY_PASS_ISSUER_SALT;
    delete process.env.SURVEY_PASS_ISSUER_PRIV;
  });

  // 1. OTP Store Tests
  describe('OTP Store', () => {
    it('should save and retrieve OTP code', () => {
      otpStore.set('alice@test.com', '123456');
      expect(otpStore.get('alice@test.com')).toBe('123456');
    });

    it('should normalize email to lowercase and trim', () => {
      otpStore.set(' Alice@Test.com ', '123456');
      expect(otpStore.get('alice@test.com')).toBe('123456');
    });

    it('should return null for expired OTP', () => {
      vi.useFakeTimers();
      otpStore.set('alice@test.com', '123456', 5000); // 5 seconds
      vi.advanceTimersByTime(6000); // advance 6 seconds
      expect(otpStore.get('alice@test.com')).toBeNull();
      vi.useRealTimers();
    });

    it('should invalidate OTP after use', () => {
      otpStore.set('alice@test.com', '123456');
      otpStore.invalidate('alice@test.com');
      expect(otpStore.get('alice@test.com')).toBeNull();
    });
  });

  // 2. Salted Nullifier Hash Tests
  describe('Salted Nullifier Hash', () => {
    it('should compute the same hash for the same email with the same salt', () => {
      const hash1 = computeNullifierHash('alice@test.com');
      const hash2 = computeNullifierHash('alice@test.com');
      expect(Buffer.from(hash1).toString('hex')).toBe(Buffer.from(hash2).toString('hex'));
    });

    it('should produce different hashes for different salts', () => {
      const hash1 = computeNullifierHash('alice@test.com');
      process.env.SURVEY_PASS_ISSUER_SALT = 'different_salt';
      const hash2 = computeNullifierHash('alice@test.com');
      expect(Buffer.from(hash1).toString('hex')).not.toBe(Buffer.from(hash2).toString('hex'));
    });
  });

  // 3. Ticket Signing Tests
  describe('Ticket Signing', () => {
    it('should sign ticket and return valid signature', async () => {
      const email = 'alice@test.com';
      const nullifierHash = computeNullifierHash(email);
      const owner = '0xa11ce00000000000000000000000000000000000000000000000000000000000';
      const source = 2; // SRC_EMAIL
      const commitment = new Uint8Array(0);
      const expiresAt = Date.now() + 3600000;

      const ticket = await signTicket(owner, source, nullifierHash, commitment, expiresAt);
      expect(ticket.bff_sig).toBeDefined();
      expect(ticket.expires_at).toBe(BigInt(expiresAt).toString());
      expect(ticket.nullifier_hash).toBe(Buffer.from(nullifierHash).toString('hex'));
    });
  });

  // 4. Fastify Endpoints Tests
  describe('Fastify Auth Endpoints', () => {
    let server: any;

    beforeEach(async () => {
      server = Fastify();
      await server.register(cors, { origin: true });
      registerAuthRoutes(server);
    });

    afterEach(async () => {
      await server.close();
    });

    it('should generate and return OTP code in non-production mode', async () => {
      process.env.NODE_ENV = 'development';
      const response = await server.inject({
        method: 'POST',
        url: '/auth/email/otp',
        payload: { email: 'alice@test.com' },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.message).toBe('OTP sent successfully');
      expect(data.code).toBeDefined();
      expect(data.code.length).toBe(6);
    });

    it('should verify OTP and return signed ticket', async () => {
      process.env.NODE_ENV = 'development';
      
      // Step 1: Request OTP
      const otpResponse = await server.inject({
        method: 'POST',
        url: '/auth/email/otp',
        payload: { email: 'alice@test.com' },
      });
      const { code } = JSON.parse(otpResponse.payload);

      // Step 2: Verify OTP
      const owner = '0xa11ce00000000000000000000000000000000000000000000000000000000000';
      const verifyResponse = await server.inject({
        method: 'POST',
        url: '/auth/email/verify',
        payload: {
          email: 'alice@test.com',
          code,
          owner,
        },
      });

      expect(verifyResponse.statusCode).toBe(200);
      const ticketData = JSON.parse(verifyResponse.payload);
      expect(ticketData.bff_sig).toBeDefined();
      expect(ticketData.expires_at).toBeDefined();
      expect(ticketData.nullifier_hash).toBeDefined();
      expect(ticketData.source).toBe(2);
    });

    it('should fail with incorrect OTP code', async () => {
      // Set OTP manually
      otpStore.set('alice@test.com', '123456');

      const owner = '0xa11ce00000000000000000000000000000000000000000000000000000000000';
      const verifyResponse = await server.inject({
        method: 'POST',
        url: '/auth/email/verify',
        payload: {
          email: 'alice@test.com',
          code: '654321', // incorrect
          owner,
        },
      });

      expect(verifyResponse.statusCode).toBe(401);
      const errData = JSON.parse(verifyResponse.payload);
      expect(errData.error).toBe('Invalid or expired OTP code');
    });
  });
});
