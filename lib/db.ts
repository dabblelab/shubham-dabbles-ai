import { PrismaClient } from "@prisma/client";
declare const global: {
  prisma?: PrismaClient;
};

const prisma: PrismaClient = global.prisma || new PrismaClient();
if (process.env.VERCEL_ENV === undefined) global.prisma = prisma;

export default prisma;
