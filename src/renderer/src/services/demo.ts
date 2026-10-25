import type { GenerationInput, GenerationService } from './types'
import { validateCardBatch, validateQuestionBatch } from './validate'

/**
 * Demo（演示）生成服务：完全在本地基于规则从资料文本中提取概念与事实，
 * 生成卡片和题目。不是真实 AI 调用，界面上必须如实标注「演示模式 · 规则生成」。
 *
 * 确定性保证：不使用随机数与当前时间，相同输入永远产生相同输出，便于测试。
 */

interface Fact {
  term: string
  definition: string
  sentence: string
}

const STOPWORDS = new Set([
  '我们', '他们', '它们', '这个', '那个', '这些', '那些', '一个', '一种', '一些',
  '可以', '应该', '如果', '但是', '然后', '因此', '所以', '并且', '或者', '以及',
  '对于', '关于', '通过', '进行', '使用', '使用', '表示', '例如', '其中', '之间',
  '就是', '还是', '不是', '没有', '有了', '出来', '起来', '上面', '下面', '左右',
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'have', 'has'
])

/** 从文本中切分候选句子（长度适中的完整句），支持中文句读与英文句号+空格 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。！？!?；;])|\n+|(?<=[.。])\s+/)
    .map((sentence) => sentence.replace(/^[\s>•\-*\d.、]+/, '').trim())
    .filter((sentence) => sentence.length >= 8 && sentence.length <= 120)
    .filter((sentence) => !/[？?]/.test(sentence))
}

/** 依据常见定义句式提取「术语 → 释义」事实 */
function extractFacts(text: string): Fact[] {
  const facts: Fact[] = []
  const seen = new Set<string>()
  for (const sentence of splitSentences(text)) {
    let match = sentence.match(/^(.{2,20}?)指的是(.{3,90})$/)
    if (!match) match = sentence.match(/^(.{2,20}?)(?:是指|就是)(.{3,90})$/)
    if (!match) match = sentence.match(/^(.{2,20}?)(?:是|包括|包含)(.{4,90})$/)
    if (!match) match = sentence.match(/^(.{2,20}?)[：:](.{4,90})$/)
    if (!match) continue
    const term = match[1].replace(/^[，,、：:\s]+|[，,、：:\s]+$/g, '').trim()
    const definition = match[2].replace(/[。；;.！!？?]+$/, '').trim()
    if (term.length < 2 || definition.length < 3) continue
    if (term.includes('/') || term.includes('http')) continue
    // 排除范围标记【xxx】及其残片，避免把内部标记当成术语
    if (/[\u3010\u3011]/.test(term) || /^[\u3010].+[\u3011]$/.test(sentence)) continue
    const key = `${term}→${definition}`
    if (seen.has(key)) continue
    seen.add(key)
    facts.push({ term, definition, sentence })
  }
  return facts
}

/** 提取高频关键词（确定性排序：次数降序 → 首次出现顺序），用于兜底生成 */
function extractKeywords(text: string, limit: number): string[] {
  const counts = new Map<string, { count: number; first: number }>()
  const tokens = text.match(/[\u4e00-\u9fa5]{2,6}|[A-Za-z][A-Za-z0-9-]{2,}/g) ?? []
  tokens.forEach((token, index) => {
    if (STOPWORDS.has(token.toLowerCase()) || STOPWORDS.has(token)) return
    if (/^\d+$/.test(token)) return
    const entry = counts.get(token)
    if (entry) {
      entry.count++
    } else {
      counts.set(token, { count: 1, first: index })
    }
  })
  return [...counts.entries()]
    .filter(([, entry]) => entry.count >= 1)
    .sort((a, b) => b[1].count - a[1].count || a[1].first - b[1].first)
    .slice(0, limit)
    .map(([token]) => token)
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** 从文本生成知识卡片（确定性） */
function buildCards(scopeLabel: string, text: string, count: number) {
  const facts = extractFacts(text)
  const raw: unknown[] = []

  for (let index = 0; index < facts.length && raw.length < count; index++) {
    const fact = facts[index]
    if (index % 2 === 0) {
      raw.push({
        front: `「${fact.term}」是什么？`,
        back: fact.definition,
        explanation: `原文依据：${fact.sentence}`,
        sourceChapter: scopeLabel
      })
    } else {
      raw.push({
        front: `资料中「${truncate(fact.definition, 36)}」指的是什么？`,
        back: fact.term,
        explanation: `原文依据：${fact.sentence}`,
        sourceChapter: scopeLabel
      })
    }
  }

  // 事实不足时，用高频关键词 + 原文上下文兜底（不编造内容）
  if (raw.length < count) {
    const keywords = extractKeywords(text, 30)
    for (const keyword of keywords) {
      if (raw.length >= count) break
      const context = splitSentences(text).find((sentence) => sentence.includes(keyword))
      if (!context) continue
      if (raw.some((item) => (item as { front: string }).front.includes(`「${keyword}」`))) continue
      raw.push({
        front: `资料中「${keyword}」出现在什么上下文？`,
        back: context,
        explanation: '该卡片由演示模式的关键词规则生成，建议结合原文记忆',
        sourceChapter: scopeLabel
      })
    }
  }
  return validateCardBatch(raw)
}

/** 从文本生成练习题（确定性，按题型轮转分布） */
function buildQuestions(
  scopeLabel: string,
  text: string,
  count: number,
  types: NonNullable<GenerationInput['questionTypes']>
) {
  const facts = extractFacts(text)
  const sentences = splitSentences(text)
  const raw: unknown[] = []
  const usableTypes = types.length > 0 ? types : (['choice'] as const)

  for (let index = 0; index < count; index++) {
    const type = usableTypes[index % usableTypes.length]
    const fact = facts[index % Math.max(facts.length, 1)]

    if (type === 'choice') {
      if (facts.length < 2) continue // 需要其他事实作为干扰项，不足则跳过
      const correct = fact.definition
      const distractors: string[] = []
      for (let offset = 1; distractors.length < 3 && offset < facts.length; offset++) {
        const candidate = facts[(index + offset) % facts.length].definition
        if (candidate !== correct && !distractors.includes(candidate)) {
          distractors.push(candidate)
        }
      }
      if (distractors.length < 2) continue
      const options = [correct, ...distractors]
      // 确定性轮换正确答案位置
      const rotate = index % options.length
      const arranged = [...options.slice(options.length - rotate), ...options.slice(0, options.length - rotate)]
      const answerIndex = arranged.indexOf(correct)
      raw.push({
        type,
        question: `「${fact.term}」是什么？`,
        options: arranged,
        answerIndex,
        explanation: `原文依据：${fact.sentence}`,
        sourceChapter: scopeLabel
      })
      continue
    }

    if (type === 'judge') {
      if (!fact) continue
      // 偶数位：原文陈述（正确）；奇数位：交换定义（错误）——保证可依据原文判定
      const other = facts.length > 1 ? facts[(index + 1) % facts.length] : null
      const useOwn = index % 2 === 0 || !other || other.definition === fact.definition
      const statement = useOwn
        ? `${fact.term}是${fact.definition}`
        : `${fact.term}是${other.definition}`
      raw.push({
        type,
        question: `判断：「${statement}」这一说法是否正确？`,
        options: ['正确', '错误'],
        answerIndex: useOwn ? 0 : 1,
        explanation: useOwn
          ? `原文依据：${fact.sentence}`
          : `原文中「${fact.term}」实际是：${fact.definition}`,
        sourceChapter: scopeLabel
      })
      continue
    }

    // short
    if (fact) {
      raw.push({
        type,
        question: `请根据资料简述：「${fact.term}」的含义或要点。`,
        answerText: fact.definition,
        explanation: `原文依据：${fact.sentence}`,
        sourceChapter: scopeLabel
      })
    } else if (sentences.length > 0) {
      const sentence = sentences[index % sentences.length]
      raw.push({
        type,
        question: `请根据资料回答：${truncate(sentence, 60)}——这句话的要点是什么？`,
        answerText: sentence,
        explanation: '参考答案来自资料原文',
        sourceChapter: scopeLabel
      })
    }
  }
  return validateQuestionBatch(raw)
}

export const demoGenerationService: GenerationService = {
  mode: 'demo',
  isConfigured: () => true,
  unconfiguredHint: () => '',
  async generateCards(input: GenerationInput) {
    return buildCards(input.scopeLabel, input.text, input.count)
  },
  async generateQuestions(input: GenerationInput) {
    return buildQuestions(input.scopeLabel, input.text, input.count, input.questionTypes ?? ['choice'])
  }
}
