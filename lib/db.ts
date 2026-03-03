import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

const globalForPrisma = globalThis as unknown as {
	prisma: PrismaClient | undefined;
};

export const getDb = () => {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error('DATABASE_URL is required for Prisma/Neon connectivity.');
	}

	if (!globalForPrisma.prisma) {
		const adapter = new PrismaNeon({ connectionString: databaseUrl });
		globalForPrisma.prisma = new PrismaClient({ adapter });
	}

	return globalForPrisma.prisma;
};
