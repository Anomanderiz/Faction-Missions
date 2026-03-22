import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import type { JWTPayload } from 'jose';
import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

const COOKIE_NAME = 'wd_dm_session';
const encoder = new TextEncoder();
const secret = encoder.encode(env.adminSessionSecret);
const THIRTY_DAYS = 60 * 60 * 24 * 30;

interface SessionPayload extends JWTPayload {
  role: 'dm';
}

export function getSessionCookieName() {
  return COOKIE_NAME;
}

export async function createAdminSessionToken(payload: SessionPayload = { role: 'dm' }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${THIRTY_DAYS}s`)
    .sign(secret);
}

export async function verifyAdminSessionToken(token?: string | null) {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.role !== 'dm') return null;
    return payload as SessionPayload & { exp: number; iat: number };
  } catch {
    return null;
  }
}

export async function isAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = await verifyAdminSessionToken(token);
  return Boolean(payload);
}

export async function setAdminSession() {
  const cookieStore = await cookies();
  const token = await createAdminSessionToken();

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: THIRTY_DAYS
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0
  });
}

export function isPasswordValid(candidate: string) {
  const expected = Buffer.from(env.adminPassword);
  const provided = Buffer.from(candidate ?? '');

  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}
