import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';

export type PrismaMock = DeepMockProxy<PrismaClient>;

export const prismaMock = mockDeep<PrismaClient>();

export const resetPrismaMock = () => {
  mockReset(prismaMock);
};
