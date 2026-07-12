/**
 * Demo-scale question bank — PLACEHOLDER content for the POC showcase.
 * ~100 BCS-Preliminary-style MCQs; facts were checked while authoring,
 * but PAST_PAPER provenance (sourceYear/sourceExam) is illustrative and
 * must be re-verified against raw PSC papers before production use.
 *
 * ADDITIVE and idempotent: inserts with skipDuplicates on the unique
 * stemHash — never wipes. Run AFTER the base seed:
 *   pnpm db:seed && pnpm db:seed:demo
 *
 * NOTE: the e2e suites assert base-seed counts. Run `pnpm test:e2e` on a
 * fresh `pnpm db:seed` (which wipes questions) BEFORE loading this bank.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { stemHash } from '../src/domain/stem-hash';
import { PrismaClient } from '../src/generated/prisma/client';
import { BANGLA_QUESTIONS } from './demo-data/bangla';
import { ENGLISH_QUESTIONS } from './demo-data/english';
import { GK_QUESTIONS } from './demo-data/general-knowledge';

try {
  process.loadEnvFile();
} catch {
  // No .env file — rely on the ambient environment.
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? '',
});
const prisma = new PrismaClient({ adapter });

async function resolveTopicIds(): Promise<Record<string, string>> {
  const topics = await prisma.topic.findMany({
    include: { subject: { select: { slug: true } } },
  });
  const map: Record<string, string> = {};
  for (const topic of topics) {
    map[`${topic.subject.slug}/${topic.slug}`] = topic.id;
  }
  return map;
}

async function main() {
  const topicIds = await resolveTopicIds();
  const all = [...BANGLA_QUESTIONS, ...ENGLISH_QUESTIONS, ...GK_QUESTIONS];

  const missing = all.find((q) => !topicIds[q.topicKey]);
  if (missing) {
    throw new Error(
      `Unknown topic '${missing.topicKey}' — run \`pnpm db:seed\` first to create the taxonomy.`,
    );
  }

  const { count } = await prisma.question.createMany({
    data: all.map(({ topicKey, ...question }) => {
      // Authoring format puts the correct answer first; rotate options by a
      // stem-derived amount so answer positions vary but stay deterministic.
      const hash = stemHash(question.stem);
      const shift = parseInt(hash.slice(0, 2), 16) % 4;
      const options = question.options.map(
        (_, i) => question.options[(i - shift + 4) % 4],
      );
      return {
        ...question,
        options,
        correctIndex: (question.correctIndex + shift) % 4,
        topicId: topicIds[topicKey],
        stemHash: hash,
      };
    }),
    skipDuplicates: true,
  });

  const [total, published] = await Promise.all([
    prisma.question.count(),
    prisma.question.count({ where: { status: 'PUBLISHED' } }),
  ]);
  console.log(
    `Demo bank: inserted ${count} of ${all.length} (${all.length - count} deduped). ` +
      `Bank now: ${total} questions, ${published} published.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
