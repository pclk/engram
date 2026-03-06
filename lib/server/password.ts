import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export const hashPassword = async (password: string): Promise<string> => {
	const salt = randomBytes(16).toString('hex');
	const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
	return `${salt}:${derivedKey.toString('hex')}`;
};

export const verifyPassword = async (password: string, storedHash: string): Promise<boolean> => {
	const [salt, hash] = storedHash.split(':');
	if (!salt || !hash) return false;

	const storedBuffer = Buffer.from(hash, 'hex');
	const derivedKey = (await scrypt(password, salt, storedBuffer.length)) as Buffer;
	if (derivedKey.length !== storedBuffer.length) return false;
	return timingSafeEqual(derivedKey, storedBuffer);
};
