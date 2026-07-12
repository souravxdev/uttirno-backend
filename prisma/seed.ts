/**
 * Dev seed — SAMPLE data for local development only.
 * PAST_PAPER provenance (sourceYear/sourceExam) is illustrative, not a
 * verified citation. Real past-paper content arrives in Phase 4 from raw
 * PSC papers.
 *
 * Run with: pnpm db:seed  (wipes and recreates all questions)
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client';

try {
  process.loadEnvFile();
} catch {
  // No .env file — rely on the ambient environment.
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? '',
});
const prisma = new PrismaClient({ adapter });

// Dev-only accounts; password for both: uttirno-dev
async function upsertUsers() {
  const passwordHash = await hash('uttirno-dev');
  await prisma.user.upsert({
    where: { email: 'admin@uttirno.test' },
    update: {},
    create: {
      email: 'admin@uttirno.test',
      name: 'Dev Admin',
      role: 'ADMIN',
      passwordHash,
    },
  });
  await prisma.user.upsert({
    where: { email: 'learner@uttirno.test' },
    update: {},
    create: {
      email: 'learner@uttirno.test',
      name: 'রাহিম উদ্দিন',
      role: 'LEARNER',
      passwordHash,
    },
  });
}

async function upsertTaxonomy() {
  const exam = await prisma.exam.upsert({
    where: { slug: 'bcs-preliminary' },
    update: {},
    create: { slug: 'bcs-preliminary', name: 'বিসিএস প্রিলিমিনারি' },
  });

  const subjectDefs = [
    {
      slug: 'bangla',
      name: 'বাংলা',
      order: 1,
      topics: [
        { slug: 'byakoron', name: 'ব্যাকরণ', order: 1 },
        { slug: 'sahitto', name: 'সাহিত্য', order: 2 },
      ],
    },
    {
      slug: 'english',
      name: 'English',
      order: 2,
      topics: [
        { slug: 'grammar', name: 'Grammar', order: 1 },
        { slug: 'literature', name: 'Literature', order: 2 },
      ],
    },
    {
      slug: 'general-knowledge',
      name: 'সাধারণ জ্ঞান',
      order: 3,
      topics: [
        { slug: 'bangladesh', name: 'বাংলাদেশ বিষয়াবলি', order: 1 },
        { slug: 'international', name: 'আন্তর্জাতিক বিষয়াবলি', order: 2 },
      ],
    },
  ];

  const topicIds: Record<string, string> = {};
  for (const def of subjectDefs) {
    const subject = await prisma.subject.upsert({
      where: { examId_slug: { examId: exam.id, slug: def.slug } },
      update: {},
      create: {
        examId: exam.id,
        slug: def.slug,
        name: def.name,
        order: def.order,
      },
    });
    for (const topicDef of def.topics) {
      const topic = await prisma.topic.upsert({
        where: {
          subjectId_slug: { subjectId: subject.id, slug: topicDef.slug },
        },
        update: {},
        create: { subjectId: subject.id, ...topicDef },
      });
      topicIds[`${def.slug}/${topicDef.slug}`] = topic.id;
    }
  }
  return topicIds;
}

async function seedQuestions(topicIds: Record<string, string>) {
  // Dev-only refresh: wipe and recreate so re-seeding stays predictable.
  await prisma.answer.deleteMany({});
  await prisma.question.deleteMany({});

  await prisma.question.createMany({
    data: [
      {
        topicId: topicIds['bangla/sahitto'],
        language: 'BN',
        stem: "'সোনার তরী' কাব্যগ্রন্থের রচয়িতা কে?",
        options: [
          'রবীন্দ্রনাথ ঠাকুর',
          'কাজী নজরুল ইসলাম',
          'জসীমউদ্‌দীন',
          'মাইকেল মধুসূদন দত্ত',
        ],
        correctIndex: 0,
        explanation:
          "'সোনার তরী' (১৮৯৪) রবীন্দ্রনাথ ঠাকুরের রচিত কাব্যগ্রন্থ। এর নাম-কবিতাটিও বিখ্যাত।",
        difficulty: 'EASY',
        sourceType: 'PAST_PAPER',
        sourceYear: 2015,
        sourceExam: '৩৫তম বিসিএস',
        status: 'PUBLISHED',
      },
      {
        topicId: topicIds['bangla/byakoron'],
        language: 'BN',
        stem: 'ণত্ব ও ষত্ব বিধান বাংলা ব্যাকরণের কোন অংশে আলোচিত হয়?',
        options: ['ধ্বনিতত্ত্ব', 'রূপতত্ত্ব', 'বাক্যতত্ত্ব', 'অর্থতত্ত্ব'],
        correctIndex: 0,
        explanation:
          'ণত্ব ও ষত্ব বিধান ধ্বনি-সংক্রান্ত নিয়ম, তাই এগুলো ধ্বনিতত্ত্বে আলোচিত হয়।',
        difficulty: 'MEDIUM',
        sourceType: 'ORIGINAL',
        status: 'PUBLISHED',
      },
      {
        topicId: topicIds['bangla/sahitto'],
        language: 'BN',
        stem: 'বাংলা ভাষার প্রাচীনতম নিদর্শন কোনটি?',
        options: ['চর্যাপদ', 'শ্রীকৃষ্ণকীর্তন', 'মনসামঙ্গল', 'বৈষ্ণব পদাবলি'],
        correctIndex: 0,
        explanation:
          'চর্যাপদ বাংলা ভাষার প্রাচীনতম লিখিত নিদর্শন হিসেবে স্বীকৃত।',
        difficulty: 'EASY',
        sourceType: 'PAST_PAPER',
        sourceYear: 2017,
        sourceExam: '৩৮তম বিসিএস',
        status: 'PUBLISHED',
      },
      {
        topicId: topicIds['general-knowledge/bangladesh'],
        language: 'BN',
        stem: 'মুক্তিযুদ্ধের সময় বাংলাদেশ কতটি সেক্টরে বিভক্ত ছিল?',
        options: ['৯টি', '১০টি', '১১টি', '১২টি'],
        correctIndex: 2,
        explanation:
          '১৯৭১ সালের মুক্তিযুদ্ধে সমগ্র বাংলাদেশকে ১১টি সেক্টরে ভাগ করা হয়েছিল।',
        difficulty: 'EASY',
        sourceType: 'PAST_PAPER',
        sourceYear: 2016,
        sourceExam: '৩৬তম বিসিএস',
        status: 'PUBLISHED',
      },
      {
        topicId: topicIds['general-knowledge/bangladesh'],
        language: 'BN',
        stem: "বাংলাদেশের জাতীয় সংগীত 'আমার সোনার বাংলা'-র রচয়িতা কে?",
        options: [
          'কাজী নজরুল ইসলাম',
          'রবীন্দ্রনাথ ঠাকুর',
          'দ্বিজেন্দ্রলাল রায়',
          'অতুলপ্রসাদ সেন',
        ],
        correctIndex: 1,
        explanation:
          "'আমার সোনার বাংলা' রবীন্দ্রনাথ ঠাকুরের রচনা; এর প্রথম দশ চরণ জাতীয় সংগীত হিসেবে গৃহীত।",
        difficulty: 'EASY',
        sourceType: 'ORIGINAL',
        status: 'PUBLISHED',
      },
      {
        topicId: topicIds['general-knowledge/international'],
        language: 'BN',
        stem: 'জাতিসংঘের সদর দপ্তর কোথায় অবস্থিত?',
        options: ['নিউ ইয়র্ক', 'জেনেভা', 'প্যারিস', 'ভিয়েনা'],
        correctIndex: 0,
        explanation:
          'জাতিসংঘের সদর দপ্তর যুক্তরাষ্ট্রের নিউ ইয়র্ক শহরে অবস্থিত।',
        difficulty: 'EASY',
        sourceType: 'ORIGINAL',
        status: 'PUBLISHED',
      },
      {
        topicId: topicIds['english/grammar'],
        language: 'EN',
        stem: 'Which one is the correct spelling?',
        options: ['Comittee', 'Committee', 'Commitee', 'Comitte'],
        correctIndex: 1,
        explanation:
          "The correct spelling is 'Committee' — double m, double t, double e.",
        difficulty: 'EASY',
        sourceType: 'ORIGINAL',
        status: 'PUBLISHED',
      },
      {
        topicId: topicIds['english/grammar'],
        language: 'EN',
        stem: 'Choose the correct sentence.',
        options: [
          'He has been living here since 2010.',
          'He is living here since 2010.',
          'He lives here since 2010.',
          'He living here since 2010.',
        ],
        correctIndex: 0,
        explanation:
          "With 'since + point of time', the present perfect continuous is used: 'has been living'.",
        difficulty: 'MEDIUM',
        sourceType: 'ORIGINAL',
        status: 'DRAFT',
      },
      {
        topicId: topicIds['english/literature'],
        language: 'EN',
        stem: "Who wrote 'Pride and Prejudice'?",
        options: [
          'Jane Austen',
          'Charlotte Brontë',
          'Emily Brontë',
          'George Eliot',
        ],
        correctIndex: 0,
        explanation: "'Pride and Prejudice' (1813) is a novel by Jane Austen.",
        difficulty: 'MEDIUM',
        sourceType: 'PAST_PAPER',
        sourceYear: 2019,
        sourceExam: '40th BCS',
        status: 'PUBLISHED',
      },
      {
        // AI_GENERATED must never be created as PUBLISHED — it enters the
        // review queue (IN_REVIEW) and can only be published via approval.
        topicId: topicIds['english/literature'],
        language: 'EN',
        stem: "The antonym of 'benevolent' is —",
        options: ['malevolent', 'beneficial', 'generous', 'gentle'],
        correctIndex: 0,
        explanation:
          "'Benevolent' means kind and well-meaning; its antonym is 'malevolent' (wishing harm).",
        difficulty: 'MEDIUM',
        sourceType: 'AI_GENERATED',
        status: 'IN_REVIEW',
      },
    ],
  });
}

async function main() {
  await upsertUsers();
  const topicIds = await upsertTaxonomy();
  await seedQuestions(topicIds);

  const [exams, subjects, topics, questions, bnQuestions] = await Promise.all([
    prisma.exam.count(),
    prisma.subject.count(),
    prisma.topic.count(),
    prisma.question.count(),
    prisma.question.count({ where: { language: 'BN' } }),
  ]);
  console.log(
    `Seeded: ${exams} exam, ${subjects} subjects, ${topics} topics, ` +
      `${questions} questions (${bnQuestions} Bangla).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
