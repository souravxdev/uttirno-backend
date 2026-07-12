/** Shape of the placeholder demo-bank questions (see ../seed-demo.ts). */

export type DemoTopicKey =
  | 'bangla/byakoron'
  | 'bangla/sahitto'
  | 'english/grammar'
  | 'english/literature'
  | 'general-knowledge/bangladesh'
  | 'general-knowledge/international';

export interface DemoQuestion {
  topicKey: DemoTopicKey;
  language: 'BN' | 'EN';
  stem: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanation: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  sourceType: 'PAST_PAPER' | 'ORIGINAL';
  sourceYear?: number;
  sourceExam?: string;
  status: 'PUBLISHED' | 'DRAFT' | 'IN_REVIEW';
}
