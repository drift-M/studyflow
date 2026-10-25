import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { closeDB, clearAllData, getDB } from '../database'
import {
  createDocument,
  getDocument,
  listDocuments,
  updateDocument,
  deleteDocument,
  countDocuments
} from '../documents'
import {
  createCard,
  getCard,
  listCards,
  listCardsByDocument,
  countCards,
  countDueCards,
  reviewCard,
  deleteCard
} from '../cards'
import {
  createQuestion,
  listQuestions,
  listQuestionsByDocument,
  deleteQuestion,
  countQuestions
} from '../quiz'
import {
  recordWrongAnswer,
  listWrongAnswers,
  resolveWrongAnswer,
  countUnresolvedWrongAnswers,
  deleteWrongAnswer
} from '../wrongAnswers'
import { addSession, listRecentSessions, countSessions } from '../sessions'

beforeEach(async () => {
  await clearAllData()
})

describe('数据库初始化与连接管理', () => {
  it('getDB 多次调用返回同一实例，不会重复打开连接', async () => {
    const first = await getDB()
    const second = await getDB()
    expect(second).toBe(first)
  })

  it('关闭连接后重新打开，此前写入的数据仍然存在（模拟应用重启）', async () => {
    const doc = await createDocument({
      title: '重启测试',
      fileName: '重启测试.md',
      fileType: 'markdown',
      fileSize: 10,
      content: '内容 A'
    })
    await closeDB()

    const reopened = await getDB()
    expect(reopened).toBeDefined()
    const found = await getDocument(doc.id)
    expect(found?.content).toBe('内容 A')
    expect(await countDocuments()).toBe(1)
  })
})

describe('学习资料 CRUD', () => {
  it('新增后可按 id 查询，字段完整', async () => {
    const doc = await createDocument({
      title: '算法基础',
      fileName: '算法基础.md',
      fileType: 'markdown',
      fileSize: 66,
      content: '# 算法'
    })
    expect(doc.id).toBeTruthy()
    expect(doc.createdAt).toBeGreaterThan(0)
    const found = await getDocument(doc.id)
    expect(found?.title).toBe('算法基础')
    expect(found?.status).toBe('imported')
  })

  it('列表按导入时间倒序排列', async () => {
    await createDocument({
      title: '第一份',
      fileName: 'a.md',
      fileType: 'markdown',
      fileSize: 1,
      content: 'a'
    })
    await new Promise((resolve) => setTimeout(resolve, 5))
    await createDocument({
      title: '第二份',
      fileName: 'b.md',
      fileType: 'markdown',
      fileSize: 1,
      content: 'b'
    })
    const list = await listDocuments()
    expect(list.map((doc) => doc.title)).toEqual(['第二份', '第一份'])
  })

  it('更新不存在的资料返回 undefined；更新存在的资料会刷新 updatedAt', async () => {
    expect(await updateDocument('不存在的id', { title: 'x' })).toBeUndefined()

    const doc = await createDocument({
      title: '旧标题',
      fileName: 'a.md',
      fileType: 'markdown',
      fileSize: 1,
      content: 'a'
    })
    const updated = await updateDocument(doc.id, { title: '新标题' })
    expect(updated?.title).toBe('新标题')
    expect(updated!.updatedAt).toBeGreaterThanOrEqual(doc.updatedAt)
  })

  it('重新关联文件路径后，原路径引用被替换且内联内容保留', async () => {
    const doc = await createDocument({
      title: '待重关联',
      fileName: 'old.md',
      fileType: 'markdown',
      fileSize: 5,
      sourcePath: 'C:\\旧目录\\old.md'
    })
    const updated = await updateDocument(doc.id, {
      sourcePath: 'D:\\新目录\\new.md',
      fileName: 'new.md',
      fileSize: 9
    })
    expect(updated?.sourcePath).toBe('D:\\新目录\\new.md')
    expect(updated?.fileName).toBe('new.md')
    expect(updated?.fileSize).toBe(9)
  })

  it('查询不存在的资料返回 undefined，删除不存在的资料返回 false', async () => {
    expect(await getDocument('不存在')).toBeUndefined()
    expect(await deleteDocument('不存在')).toBe(false)
  })

  it('删除资料会级联删除关联的卡片、题目与错题', async () => {
    const doc = await createDocument({
      title: '级联',
      fileName: 'c.md',
      fileType: 'markdown',
      fileSize: 1,
      content: 'c'
    })
    const card = await createCard({ documentId: doc.id, front: '正面', back: '背面' })
    const question = await createQuestion({
      documentId: doc.id,
      question: '题目',
      options: ['A 选项', 'B 选项'],
      answerIndex: 0
    })
    await recordWrongAnswer({
      questionId: question.id,
      questionSnapshot: question.question,
      correctAnswerText: 'A 选项',
      userAnswerText: 'B 选项'
    })

    expect(await deleteDocument(doc.id)).toBe(true)
    expect(await countDocuments()).toBe(0)
    expect(await listCardsByDocument(doc.id)).toHaveLength(0)
    expect(await countQuestions()).toBe(0)
    expect(await countUnresolvedWrongAnswers()).toBe(0)
    expect(await getCard(card.id)).toBeUndefined()
  })
})

describe('知识卡片', () => {
  it('创建、按资料查询、统计与删除', async () => {
    const docA = await createDocument({
      title: 'A',
      fileName: 'a.md',
      fileType: 'markdown',
      fileSize: 1,
      content: 'a'
    })
    await createCard({ documentId: docA.id, front: 'F1', back: 'B1', tags: ['x'] })
    await createCard({ documentId: docA.id, front: 'F2', back: 'B2' })
    await createCard({ documentId: null, front: 'F3', back: 'B3' })

    expect(await countCards()).toBe(3)
    expect(await listCardsByDocument(docA.id)).toHaveLength(2)
    expect((await listCards()).length).toBe(3)
  })

  it('空内容卡片创建被拒绝', async () => {
    await expect(createCard({ front: '  ', back: 'B' })).rejects.toThrow('不能为空')
  })

  it('新卡片立即可复习；复习后 24 小时内不再计入待复习', async () => {
    const card = await createCard({ front: 'F', back: 'B' })
    expect(await countDueCards()).toBe(1)

    const reviewed = await reviewCard(card.id)
    expect(reviewed?.reviewCount).toBe(1)
    expect(reviewed?.nextReviewAt).toBeGreaterThan(Date.now())
    expect(await countDueCards()).toBe(0)
  })

  it('复习不存在的卡片返回 undefined，删除不存在的卡片返回 false', async () => {
    expect(await reviewCard('不存在')).toBeUndefined()
    expect(await deleteCard('不存在')).toBe(false)
  })
})

describe('练习题', () => {
  it('创建选择题并按资料查询', async () => {
    const doc = await createDocument({
      title: 'D',
      fileName: 'd.md',
      fileType: 'markdown',
      fileSize: 1,
      content: 'd'
    })
    const question = await createQuestion({
      documentId: doc.id,
      question: '1+1=?',
      options: ['1', '2', '3', '4'],
      answerIndex: 1,
      explanation: '基础加法'
    })
    expect(question.type).toBe('choice')
    expect(await listQuestionsByDocument(doc.id)).toHaveLength(1)
    expect((await listQuestions())[0].question).toBe('1+1=?')
  })

  it('选项不足两个或答案越界时创建被拒绝', async () => {
    await expect(
      createQuestion({ question: 'Q', options: ['唯一'], answerIndex: 0 })
    ).rejects.toThrow('至少需要两个非空选项')
    await expect(
      createQuestion({ question: 'Q', options: ['A', 'B'], answerIndex: 5 })
    ).rejects.toThrow('不在选项范围内')
  })

  it('删除题目会级联删除其错题记录', async () => {
    const question = await createQuestion({
      question: 'Q',
      options: ['A', 'B'],
      answerIndex: 0
    })
    await recordWrongAnswer({
      questionId: question.id,
      questionSnapshot: question.question,
      correctAnswerText: 'A',
      userAnswerText: 'B'
    })
    expect(await deleteQuestion(question.id)).toBe(true)
    expect(await countUnresolvedWrongAnswers()).toBe(0)
    expect(await deleteQuestion(question.id)).toBe(false)
  })
})

describe('错题本', () => {
  async function makeQuestion(): Promise<string> {
    const question = await createQuestion({
      question: '题目',
      options: ['A', 'B'],
      answerIndex: 0
    })
    return question.id
  }

  it('同一题目重复答错合并为一条记录且次数递增', async () => {
    const questionId = await makeQuestion()
    const first = await recordWrongAnswer({
      questionId,
      questionSnapshot: '题目',
      correctAnswerText: 'A',
      userAnswerText: 'B'
    })
    const second = await recordWrongAnswer({
      questionId,
      questionSnapshot: '题目',
      correctAnswerText: 'A',
      userAnswerText: 'C'
    })
    expect(second.id).toBe(first.id)
    expect(second.wrongCount).toBe(2)
    const list = await listWrongAnswers()
    expect(list).toHaveLength(1)
    expect(list[0].userAnswerText).toBe('C')
  })

  it('标记已掌握后未解决数量归零，记录保留', async () => {
    const questionId = await makeQuestion()
    const wrong = await recordWrongAnswer({
      questionId,
      questionSnapshot: '题目',
      correctAnswerText: 'A',
      userAnswerText: 'B'
    })
    expect(await countUnresolvedWrongAnswers()).toBe(1)

    const resolved = await resolveWrongAnswer(wrong.id)
    expect(resolved?.resolvedAt).toBeTruthy()
    expect(await countUnresolvedWrongAnswers()).toBe(0)
    expect(await listWrongAnswers()).toHaveLength(1)

    expect(await deleteWrongAnswer(wrong.id)).toBe(true)
    expect(await deleteWrongAnswer(wrong.id)).toBe(false)
  })

  it('解决不存在的错题返回 undefined', async () => {
    expect(await resolveWrongAnswer('不存在')).toBeUndefined()
  })
})

describe('学习记录', () => {
  it('按开始时间倒序返回最近记录', async () => {
    await addSession({ type: 'study', summary: '第一次', startedAt: 1000, durationSec: 60 })
    await addSession({ type: 'quiz', summary: '第二次', startedAt: 2000, durationSec: 30 })
    await addSession({ type: 'study', summary: '第三次', startedAt: 3000, durationSec: 90 })

    expect(await countSessions()).toBe(3)
    const recent = await listRecentSessions(2)
    expect(recent.map((session) => session.summary)).toEqual(['第三次', '第二次'])
  })

  it('负时长会被归零', async () => {
    const session = await addSession({
      type: 'study',
      summary: '异常',
      startedAt: 1000,
      durationSec: -5
    })
    expect(session.durationSec).toBe(0)
  })
})
