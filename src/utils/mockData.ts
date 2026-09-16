import type { HistoricalStage, Radical, Lexeme } from '@/types';
import { generateId } from './glyphUtils';

const createStage = (partial: Partial<HistoricalStage> & { name: string; order: number }): HistoricalStage => ({
  id: generateId(),
  description: '',
  color: '#5D7A6F',
  ...partial,
});

export const MOCK_STAGES: HistoricalStage[] = [
  createStage({ id: 'stage-1', name: '甲骨遗文', order: 0, description: '最古老的刻写形态，笔画质朴，多为象形原形', color: '#8B5A2B' }),
  createStage({ id: 'stage-2', name: '青铜吉文', order: 1, description: '铸于青铜礼器，线条圆润饱满，结构渐稳', color: '#6B8E6B' }),
  createStage({ id: 'stage-3', name: '玉箸篆文', order: 2, description: '官方统一规范体，笔画如玉箸般匀净修长', color: '#556B8B' }),
  createStage({ id: 'stage-4', name: '墨韵楷书', order: 3, description: '今日通用书写体，结构方正，笔画清晰', color: '#3E2723' }),
];

const r = (id: string, name: string, meaning: string, pronunciation: string, category: Radical['category'], shapes: Record<string, string>): Radical => {
  const stageOrder = ['stage-1', 'stage-2', 'stage-3', 'stage-4'];
  const variants = stageOrder
    .filter(sid => shapes[sid])
    .map(sid => ({ stageId: sid, svgPath: shapes[sid] }));
  return {
    id,
    name,
    meaning,
    pronunciation,
    category,
    baseShape: shapes[stageOrder.find(s => shapes[s])!] || shapes['stage-4'] || '',
    variants,
    createdAt: Date.now() - Math.random() * 1e8,
    updatedAt: Date.now() - Math.random() * 1e7,
  };
};

export const MOCK_RADICALS: Radical[] = [
  r('rad-sun', '日', '太阳；光明；一日', 'sŭl', '象形', {
    'stage-1': 'M50 22 C66 22 78 34 78 50 C78 66 66 78 50 78 C34 78 22 66 22 50 C22 34 34 22 50 22 Z M50 36 L50 64 M36 50 L64 50',
    'stage-2': 'M50 20 C68 20 80 32 80 50 C80 68 68 80 50 80 C32 80 20 68 20 50 C20 32 32 20 50 20 Z M44 44 L56 44 M44 50 L56 50 M44 56 L56 56',
    'stage-3': 'M50 18 C72 18 82 30 82 50 C82 70 72 82 50 82 C28 82 18 70 18 50 C18 30 28 18 50 18 Z M50 32 L50 68',
    'stage-4': 'M50 20 C70 20 80 32 80 50 C80 70 70 82 50 82 C30 82 20 70 20 50 C20 32 30 20 50 20 Z M36 40 L64 40 M36 50 L64 50 M36 60 L64 60',
  }),
  r('rad-moon', '月', '月亮；夜晚；月份', 'myè', '象形', {
    'stage-1': 'M60 20 C38 20 24 36 24 54 C24 72 38 86 60 86 C72 86 62 70 62 54 C62 38 72 20 60 20 Z M42 48 L58 48 M42 62 L54 62',
    'stage-2': 'M64 22 C40 22 22 40 22 56 C22 72 40 88 64 88 C70 88 64 74 64 56 C64 38 70 22 64 22 Z M40 46 L56 46 M40 60 L56 60',
    'stage-3': 'M66 20 C36 20 20 40 20 54 C20 68 36 86 66 86 C68 86 66 72 66 54 C66 36 68 20 66 20 Z M40 44 L58 44 M40 62 L58 62',
    'stage-4': 'M64 18 C34 18 18 42 18 54 C18 66 34 88 64 88 C68 88 64 72 64 54 C64 36 68 18 64 18 Z M38 42 L58 42 M38 52 L58 52 M38 62 L58 62',
  }),
  r('rad-mountain', '山', '山峰；高大；稳重', 'kān', '象形', {
    'stage-1': 'M20 80 L20 50 L30 50 L30 30 L40 30 L40 55 L50 55 L50 18 L60 18 L60 55 L70 55 L70 35 L80 35 L80 50 L88 50 L88 80 Z',
    'stage-2': 'M18 82 L18 52 L28 52 L28 32 L38 32 L38 56 L50 56 L50 16 L62 56 L72 56 L72 38 L82 38 L82 52 L92 52 L92 82 Z',
    'stage-3': 'M16 84 L16 56 L30 56 L30 30 L42 30 L42 58 L50 58 L50 14 L58 58 L68 58 L68 34 L80 34 L80 56 L94 56 L94 84 Z',
    'stage-4': 'M14 86 L14 58 L28 58 L28 34 L40 34 L40 60 L50 60 L50 16 L60 60 L70 60 L70 38 L82 38 L82 58 L96 58 L96 86 Z M34 72 L34 58 M50 72 L50 60 M66 72 L66 58',
  }),
  r('rad-water', '水', '流水；液体；润泽', 'shwé', '象形', {
    'stage-1': 'M50 16 C44 28 56 32 50 44 C44 56 56 60 50 72 C44 80 56 84 50 90 M30 24 C36 34 28 40 34 50 C28 60 36 66 30 76 M70 24 C64 34 72 40 66 50 C72 60 64 66 70 76',
    'stage-2': 'M50 14 C46 26 54 32 50 46 C46 60 54 66 50 80 C46 86 54 90 50 94 M28 22 C34 32 28 40 32 52 C28 62 34 70 28 82 M72 22 C66 32 72 40 68 52 C72 62 66 70 72 82',
    'stage-3': 'M50 12 C48 24 52 30 50 44 C48 58 52 64 50 78 C48 84 52 88 50 94 M32 20 C36 30 32 38 34 50 C32 60 36 68 32 78 M68 20 C64 30 68 38 66 50 C68 60 64 68 68 78',
    'stage-4': 'M50 10 C48 22 52 28 50 42 C48 56 52 62 50 76 C48 82 52 88 50 94 M34 18 C38 28 34 36 36 48 C34 58 38 66 34 76 M66 18 C62 28 66 36 64 48 C66 58 62 66 66 76 M22 40 L22 44 M82 40 L82 44',
  }),
  r('rad-human', '人', '人；人类；存在', 'rén', '象形', {
    'stage-1': 'M50 18 L50 46 L30 80 L30 88 L48 56 L48 90 L52 90 L52 56 L70 88 L70 80 L50 46 Z',
    'stage-2': 'M50 16 L50 44 L28 84 L28 90 L48 54 L48 92 L52 92 L52 54 L72 90 L72 84 L50 44 Z',
    'stage-3': 'M50 14 L50 42 L26 86 L26 92 L48 52 L48 94 L52 94 L52 52 L74 92 L74 86 L50 42 Z',
    'stage-4': 'M50 12 L50 40 L22 88 L24 94 L48 50 L48 96 L52 96 L52 50 L76 94 L78 88 L50 40 Z M46 30 L54 30',
  }),
  r('rad-tree', '木', '树木；植物；生命', 'mŏk', '象形', {
    'stage-1': 'M50 14 L50 92 M24 40 C36 48 42 44 50 42 M76 40 C64 48 58 44 50 42 M22 70 C38 74 44 68 50 66 M78 70 C62 74 56 68 50 66',
    'stage-2': 'M50 12 L50 94 M22 36 C38 46 42 40 50 38 C58 40 62 46 78 36 M24 68 C40 72 44 64 50 62 C56 64 60 72 76 68',
    'stage-3': 'M50 10 L50 94 M22 34 C40 44 42 38 50 36 C58 38 60 44 78 34 M26 66 C42 70 44 62 50 60 C56 62 58 70 74 66',
    'stage-4': 'M50 8 L50 96 M22 32 C40 42 42 36 50 34 C58 36 60 42 78 32 M24 64 C42 68 44 60 50 58 C56 60 58 68 76 64 M40 80 L50 76 L60 80',
  }),
  r('rad-fire', '火', '火焰；燃烧；热情', 'hwŏ', '象形', {
    'stage-1': 'M50 18 C44 30 32 38 36 58 C30 50 24 60 30 78 C38 72 48 88 50 88 C52 88 62 72 70 78 C76 60 70 50 64 58 C68 38 56 30 50 18 Z',
    'stage-2': 'M50 14 C42 28 30 36 34 58 C28 50 20 62 28 80 C36 74 46 90 50 90 C54 90 64 74 72 80 C80 62 72 50 66 58 C70 36 58 28 50 14 Z',
    'stage-3': 'M50 10 C40 26 28 34 32 58 C26 50 18 64 26 82 C34 76 44 92 50 92 C56 92 66 76 74 82 C82 64 74 50 68 58 C72 34 60 26 50 10 Z',
    'stage-4': 'M50 8 C38 24 26 32 30 58 C24 50 16 66 24 84 C32 78 42 94 50 94 C58 94 68 78 76 84 C84 66 76 50 70 58 C74 32 62 24 50 8 Z M50 40 L50 70 M40 55 L60 55',
  }),
  r('rad-mouth', '口', '嘴巴；开口；言语', 'khów', '象形', {
    'stage-1': 'M28 30 L72 30 L78 78 L22 78 Z M32 46 L68 46 M34 60 L66 60',
    'stage-2': 'M26 28 L74 28 L80 80 L20 80 Z M32 48 L68 48 M34 62 L66 62',
    'stage-3': 'M24 26 L76 26 L82 82 L18 82 Z M30 46 L70 46 M32 62 L68 62',
    'stage-4': 'M22 24 L78 24 L84 84 L16 84 Z M30 44 L70 44 M32 60 L68 60',
  }),
  r('rad-hand', '手', '手掌；握持；技艺', 'shyŭ', '象形', {
    'stage-1': 'M24 30 L24 50 L28 50 L28 30 L34 24 L34 50 L40 50 L40 22 L46 22 L46 50 L52 50 L52 26 L58 26 L58 50 L64 50 L64 30 L70 30 L70 56 C70 76 60 86 47 86 C34 86 24 76 24 56 Z',
    'stage-2': 'M22 28 L22 48 L28 48 L28 22 L34 22 L34 48 L40 48 L40 20 L46 20 L46 48 L52 48 L52 24 L58 24 L58 48 L66 48 L66 28 L72 28 L72 56 C72 78 62 88 47 88 C32 88 22 78 22 56 Z',
    'stage-3': 'M20 26 L20 46 L28 46 L28 20 L34 20 L34 46 L40 46 L40 18 L46 18 L46 46 L52 46 L52 22 L58 22 L58 46 L66 46 L66 26 L74 26 L74 56 C74 80 62 90 47 90 C32 90 20 80 20 56 Z',
    'stage-4': 'M18 24 L18 44 L28 44 L28 18 L34 18 L34 44 L40 44 L40 16 L46 16 L46 44 L52 44 L52 20 L58 20 L58 44 L66 44 L66 24 L74 24 L74 56 C74 82 62 92 47 92 C32 92 18 82 18 56 Z M36 66 L58 66',
  }),
  r('rad-eye', '目', '眼睛；看见；注视', 'mŏk', '象形', {
    'stage-1': 'M22 34 C22 26 38 20 50 20 C62 20 78 26 78 34 C78 42 62 48 50 48 C38 48 22 42 22 34 Z M24 54 L76 54 M22 64 L78 64 M28 76 L72 76 M48 30 C50 34 52 34 52 30',
    'stage-2': 'M20 32 C20 22 36 16 50 16 C64 16 80 22 80 32 C80 42 64 48 50 48 C36 48 20 42 20 32 Z M22 52 L78 52 M20 62 L80 62 M24 74 L76 74 M48 28 C50 32 52 32 52 28',
    'stage-3': 'M18 30 C18 18 34 12 50 12 C66 12 82 18 82 30 C82 42 66 50 50 50 C34 50 18 42 18 30 Z M20 52 L80 52 M18 62 L82 62 M22 74 L78 74',
    'stage-4': 'M16 28 C16 14 32 8 50 8 C68 8 84 14 84 28 C84 42 68 50 50 50 C32 50 16 42 16 28 Z M18 52 L82 52 M16 62 L84 62 M20 72 L80 72 M46 26 L46 32 L54 32 L54 26 Z',
  }),
  r('rad-heart', '心', '心脏；思想；情感', 'sĭm', '象形', {
    'stage-1': 'M50 20 C30 20 16 44 16 62 C16 76 30 88 50 88 C70 88 84 76 84 62 C84 44 70 20 50 20 Z M36 50 L36 58 L44 58 L44 64 L56 64 L56 58 L64 58 L64 50 Z',
    'stage-2': 'M50 16 C26 16 12 42 12 62 C12 78 28 92 50 92 C72 92 88 78 88 62 C88 42 74 16 50 16 Z M34 48 L34 60 L42 60 L42 66 L58 66 L58 60 L66 60 L66 48 Z',
    'stage-3': 'M50 14 C24 14 10 40 10 62 C10 80 26 94 50 94 C74 94 90 80 90 62 C90 40 76 14 50 14 Z M32 46 L32 60 L40 60 L40 68 L60 68 L60 60 L68 60 L68 46 Z',
    'stage-4': 'M50 12 C22 12 8 38 8 62 C8 82 24 96 50 96 C76 96 92 82 92 62 C92 38 78 12 50 12 Z M30 44 L30 60 L38 60 L38 70 L62 70 L62 60 L70 60 L70 44 Z M46 80 L54 80',
  }),
  r('rad-field', '田', '田地；耕种；疆域', 'dyén', '象形', {
    'stage-1': 'M22 22 L78 22 L78 78 L22 78 Z M22 50 L78 50 M50 22 L50 78 M36 36 L36 36 M64 36 L64 36 M36 64 L36 64 M64 64 L64 64',
    'stage-2': 'M20 20 L80 20 L80 80 L20 80 Z M20 50 L80 50 M50 20 L50 80 M34 34 L34 34 M66 34 L66 34 M34 66 L34 66 M66 66 L66 66',
    'stage-3': 'M18 18 L82 18 L82 82 L18 82 Z M18 50 L82 50 M50 18 L50 82',
    'stage-4': 'M16 16 L84 16 L84 84 L16 84 Z M16 50 L84 50 M50 16 L50 84 M32 34 L32 34 M68 34 L68 34 M32 66 L32 66 M68 66 L68 66',
  }),
];

const lx = (radicalNames: string[], layout: Lexeme['layout'], pronunciation: string, meaning: string, extra: Partial<Lexeme> = {}): Lexeme => {
  const radicalIds = radicalNames.map(n => {
    const found = MOCK_RADICALS.find(r => r.name === n);
    return found ? found.id : '';
  }).filter(Boolean);
  return {
    id: generateId(),
    radicalIds,
    layout,
    pronunciation,
    meaning,
    createdAt: Date.now() - Math.random() * 1e7,
    ...extra,
  };
};

export const MOCK_LEXEMES: Lexeme[] = [
  lx(['日', '月'], 'horizontal', 'myeng', '光明；明亮；智慧', {
    example: '东方既myeng，万物复苏。',
    writingRule: '左「日」右「月」，先写光之源，再写光之形，日月同辉即为明。',
    note: '最古老的会意词之一，见于甲骨遗文二期。',
  }),
  lx(['人', '木'], 'horizontal', 'hyu', '休息；休憩；安宁', {
    example: '劳者hyu于树阴之下。',
    writingRule: '左「人」倚右「木」，以人形立于树旁，取休憩之意。',
  }),
  lx(['手', '目'], 'vertical', 'khan', '观看；察看；探望', {
    example: '登高khan远方，思归心似箭。',
    writingRule: '上「手」遮于「目」上，以手搭棚远望之形。',
  }),
  lx(['田', '心'], 'vertical', 'sā', '思念；思考；意念', {
    example: 'sā故人如流水，日夜未曾息。',
    writingRule: '上「田」为疆域万物，下「心」为思虑之官，万物入于心为思。',
  }),
  lx(['口', '日'], 'vertical', 'tshàng', '歌唱；吟咏；颂赞', {
    example: '老者tshàng古调，童稚相和之。',
    writingRule: '上「口」张开，下「日」为声，口出光明之声为唱。',
  }),
  lx(['人', '山'], 'horizontal', 'syēn', '神仙；超凡；隐士', {
    example: '山中多syēn，往来不知年。',
    writingRule: '左「人」入于右「山」，居山修行而超凡脱俗者为仙。',
    note: '道家文化影响下产生的会意词。',
  }),
];
