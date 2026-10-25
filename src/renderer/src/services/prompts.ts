import type { QuizType } from '../db/schema'

/**
 * AI 生成提示词（与解析、校验分离）。
 * 当前版本尚未接入真实模型服务，本模块先行定义提示词契约与输出格式要求，
 * 供后续 AI 适配器直接使用，并有单元测试覆盖。
 */

const CARD_OUTPUT_SCHEMA = `[
  {
    "front": "问题（不超过 100 字）",
    "back": "答案（不超过 200 字）",
    "explanation": "可选：答案的原文依据或补充解释"
  }
]`

const QUESTION_OUTPUT_SCHEMA = `[
  { "type": "choice", "question": "题干", "options": ["选项A", "选项B", "选项C", "选项D"], "answerIndex": 0, "explanation": "解析" },
  { "type": "judge", "question": "陈述句", "answerIndex": 0, "explanation": "解析（0=正确，1=错误）" },
  { "type": "short", "question": "简答题干", "answerText": "参考答案", "explanation": "解析" }
]`

function baseRules(scopeLabel: string, count: number): string {
  return [
    '你是学习资料整理助手。只依据给定的资料文本出题/制卡，禁止编造资料中没有的内容。',
    `内容范围：${scopeLabel}。`,
    `生成数量：${count}。`,
    '每条结果必须标注它来自资料的哪一部分（sourceChapter 使用资料中的小节标题或页码标记）。',
    '严格只输出 JSON 数组，不要输出任何解释性文字或代码块标记。'
  ].join('\n')
}

export function buildCardPrompt(scopeLabel: string, text: string, count: number): string {
  return [
    baseRules(scopeLabel, count),
    '把资料中的重要概念/事实做成问答卡片：front 是问题，back 是答案，explanation 引用原文依据。',
    `输出 JSON 数组格式：\n${CARD_OUTPUT_SCHEMA}`,
    '—— 资料文本开始 ——',
    text,
    '—— 资料文本结束 ——'
  ].join('\n\n')
}

export function buildQuestionPrompt(
  scopeLabel: string,
  text: string,
  count: number,
  types: QuizType[]
): string {
  const typeNames: Record<QuizType, string> = {
    choice: '单项选择题',
    judge: '判断题',
    short: '简答题'
  }
  return [
    baseRules(scopeLabel, count),
    `题型限定：${types.map((type) => typeNames[type]).join('、')}，均匀分布。`,
    '选择题必须提供 4 个选项且只有一个正确；判断题陈述必须可依据原文判定真假；简答题提供简短参考答案。',
    `输出 JSON 数组格式：\n${QUESTION_OUTPUT_SCHEMA}`,
    '—— 资料文本开始 ——',
    text,
    '—— 资料文本结束 ——'
  ].join('\n\n')
}
