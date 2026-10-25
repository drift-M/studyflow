/**
 * 模型输出解析（与提示词、模型调用、结构校验分离的独立模块）。
 * 兼容常见形态：纯 JSON 数组、Markdown 代码围栏（```json ... ```）、
 * 前后夹带说明文字的 JSON 数组、以及对象包裹的数组。
 */

/** 提取模型输出中的 JSON 数组文本；无法解析时抛出中文错误 */
export function extractJsonArrayText(raw: string): string {
  const text = raw.trim()
  if (text.length === 0) {
    throw new Error('模型没有返回任何内容')
  }

  // 1) 直接就是 JSON 数组
  if (text.startsWith('[')) {
    return text
  }

  // 2) 代码围栏：```json ... ``` 或 ``` ... ```
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) {
    const inner = fence[1].trim()
    if (inner.startsWith('[')) return inner
  }

  // 3) 前后夹带说明文字：取第一个 '[' 到与之配平的最后一个 ']'
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start !== -1 && end > start) {
    return text.slice(start, end + 1)
  }

  throw new Error('模型输出中没有找到 JSON 数组（可能被截断或格式异常），请重试')
}

/** 解析并返回数组；JSON 语法错误抛出中文错误 */
export function parseModelJsonArray(raw: string): unknown[] {
  const text = extractJsonArrayText(raw)
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('模型输出的 JSON 无法解析（可能被 max_tokens 截断），请减少生成数量或重试')
  }
  if (!Array.isArray(parsed)) {
    throw new Error('模型输出的不是 JSON 数组，请重试')
  }
  return parsed
}
