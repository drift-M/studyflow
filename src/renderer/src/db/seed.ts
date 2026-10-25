import { countDocuments } from './documents'
import { createDocument } from './documents'
import { createCard } from './cards'
import { createQuestion } from './quiz'
import { recordWrongAnswer } from './wrongAnswers'
import { addSession } from './sessions'

const SAMPLE_MARK = '示例-'

/**
 * 写入一套示例数据，方便空应用时快速体验界面。
 * 已存在任何资料时跳过，避免污染用户数据。
 */
export async function seedSampleData(): Promise<{ seeded: boolean }> {
  const documents = await countDocuments()
  if (documents > 0) {
    return { seeded: false }
  }

  const ml = await createDocument({
    title: '机器学习入门',
    fileName: `${SAMPLE_MARK}机器学习入门.md`,
    fileType: 'markdown',
    fileSize: 612,
    content: `# 机器学习入门

## 什么是机器学习
机器学习是让计算机从数据中自动学习规律、并对新数据做出预测的技术。

## 三大类学习方式
- 监督学习：有标注数据，学习输入到输出的映射（如分类、回归）
- 无监督学习：无标注数据，发现数据内在结构（如聚类、降维）
- 强化学习：通过与环境交互获得奖励来学习策略

## 常见术语
- 特征（Feature）：描述样本的属性
- 标签（Label）：监督学习中的正确答案
- 过拟合（Overfitting）：模型死记训练集，泛化能力差`
  })

  const linear = await createDocument({
    title: '线性代数笔记',
    fileName: `${SAMPLE_MARK}线性代数笔记.md`,
    fileType: 'markdown',
    fileSize: 428,
    content: `# 线性代数笔记

## 矩阵乘法
矩阵 A(m×n) 与 B(n×p) 相乘得到 C(m×p)，要求左矩阵的列数等于右矩阵的行数。

## 特征值与特征向量
对方针阵 A，若存在非零向量 v 与标量 λ 满足 Av = λv，则 λ 是特征值，v 是特征向量。`
  })

  await createCard({
    documentId: ml.id,
    front: '机器学习按学习方式分为哪三大类？',
    back: '监督学习、无监督学习、强化学习',
    tags: ['机器学习', '基础概念']
  })
  await createCard({
    documentId: ml.id,
    front: '什么是过拟合？',
    back: '模型过度拟合训练数据的噪声，导致在训练集表现好、在新数据上泛化能力差',
    tags: ['机器学习']
  })
  await createCard({
    documentId: linear.id,
    front: '矩阵乘法 A×B 成立的条件是什么？',
    back: 'A 的列数等于 B 的行数',
    tags: ['线性代数']
  })

  const q1 = await createQuestion({
    documentId: ml.id,
    question: '下列哪种学习方式使用"有标注数据"进行训练？',
    options: ['监督学习', '无监督学习', '强化学习', '随机学习'],
    answerIndex: 0,
    explanation: '监督学习的核心特征是训练数据带有标签（正确答案）。'
  })
  await createQuestion({
    documentId: ml.id,
    question: '特征（Feature）指的是什么？',
    options: ['模型的输出', '描述样本的属性', '损失函数', '学习率'],
    answerIndex: 1,
    explanation: '特征是描述样本的输入属性，用于训练模型。'
  })

  await recordWrongAnswer({
    questionId: q1.id,
    questionSnapshot: q1.question,
    correctAnswerText: '监督学习',
    userAnswerText: '无监督学习'
  })

  const now = Date.now()
  await addSession({
    type: 'study',
    summary: '浏览知识卡片',
    startedAt: now - 2 * 60 * 60 * 1000,
    durationSec: 480
  })
  await addSession({
    type: 'quiz',
    summary: '做练习题',
    startedAt: now - 26 * 60 * 60 * 1000,
    durationSec: 300
  })

  return { seeded: true }
}
