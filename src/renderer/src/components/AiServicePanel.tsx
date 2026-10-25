import { useEffect, useState } from 'react'
import { Badge, Button, useToast } from './ui'
import { errorMessage } from '../hooks/useAsyncData'
import { describeGenerationMode } from '../services'
import type { AiConfigInfo, AiProviderConfig, AiProviderMode } from '../../../preload/api-types'

const DEFAULTS: AiProviderConfig = {
  mode: 'demo',
  localBaseUrl: 'http://localhost:11434/v1',
  localModel: '',
  apiBaseUrl: '',
  apiModel: ''
}

export function AiServicePanel(): React.JSX.Element {
  const { push } = useToast()
  const [info, setInfo] = useState<AiConfigInfo | null>(null)
  const [form, setForm] = useState<AiProviderConfig>(DEFAULTS)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const reload = async (): Promise<void> => {
    if (!window.api) return
    const loaded = await window.api.aiGetConfig()
    setInfo(loaded)
    setForm(loaded.config)
  }

  useEffect(() => {
    reload().catch(() => undefined)
  }, [])

  const handleSave = async (mode: AiProviderMode): Promise<void> => {
    if (!window.api) {
      push('AI 配置需要在桌面应用中使用', 'error')
      return
    }
    setSaving(true)
    try {
      const next = { ...form, mode }
      const updated = await window.api.aiSaveConfig(
        next,
        apiKeyInput.trim().length > 0 ? apiKeyInput.trim() : undefined
      )
      setInfo(updated)
      setForm(updated.config)
      setApiKeyInput('')
      const keyNote =
        mode === 'api'
          ? updated.apiKeyPersisted
            ? '；API Key 已加密保存在本机（safeStorage）'
            : updated.hasApiKey
              ? '；API Key 仅保存在本次运行中（本机无法安全加密，重启后需重新输入）'
              : ''
          : ''
      push(`已保存：${describeGenerationMode(mode, mode === 'local' ? next.localModel : next.apiModel)}${keyNote}`, 'success')
    } catch (error) {
      push(errorMessage(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async (): Promise<void> => {
    if (!window.api) return
    setTesting(true)
    setTestResult(null)
    try {
      const result = await window.api.aiTestConnection()
      setTestResult(result)
    } catch (error) {
      setTestResult({ ok: false, message: errorMessage(error) })
    } finally {
      setTesting(false)
    }
  }

  const handleClearKey = async (): Promise<void> => {
    if (!window.api) return
    const updated = await window.api.aiClearKey()
    setInfo(updated)
    push('已清除保存的 API Key', 'success')
  }

  const mode = form.mode

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">AI 模型服务</div>
        {info ? <Badge variant={mode === 'demo' ? 'gray' : 'ok'}>{describeGenerationMode(mode, mode === 'local' ? form.localModel : form.apiModel)}</Badge> : null}
      </div>
      <div className="panel-desc">
        默认使用<b>演示模式</b>（本地规则生成，不联网、零成本）。切换到真实模型后，只有你点击「生成」时才会调用服务，不会自动调用、不会自动产生费用。
        <br />
        隐私提示：学习资料与学习记录始终保存在本机；使用真实模型时，<b>所选范围的资料文本会发送给你配置的服务商</b>（本地模型如 Ollama 则完全不出本机）。
      </div>

      <div className="form" style={{ paddingTop: 0 }}>
        <div className="form-field">
          <span className="form-label">生成模式</span>
          <div className="gen-count-row">
            <label className="gen-radio">
              <input
                type="radio"
                name="ai-mode"
                checked={mode === 'demo'}
                onChange={() => setForm({ ...form, mode: 'demo' })}
              />
              演示模式（规则生成，零成本）
            </label>
            <label className="gen-radio">
              <input
                type="radio"
                name="ai-mode"
                checked={mode === 'local'}
                onChange={() => setForm({ ...form, mode: 'local' })}
              />
              本地模型（Ollama 等兼容服务）
            </label>
            <label className="gen-radio">
              <input
                type="radio"
                name="ai-mode"
                checked={mode === 'api'}
                onChange={() => setForm({ ...form, mode: 'api' })}
              />
              自备 API（OpenAI 兼容）
            </label>
          </div>
        </div>

        {mode === 'local' ? (
          <>
            <div className="form-grid-2">
              <div className="form-field">
                <label className="form-label">服务地址（通常以 /v1 结尾）</label>
                <input
                  className="form-input"
                  value={form.localBaseUrl}
                  onChange={(e) => setForm({ ...form, localBaseUrl: e.target.value })}
                  placeholder="http://localhost:11434/v1"
                />
              </div>
              <div className="form-field">
                <label className="form-label">模型名称</label>
                <input
                  className="form-input"
                  value={form.localModel}
                  onChange={(e) => setForm({ ...form, localModel: e.target.value })}
                  placeholder="例如 qwen2.5:3b（需自行 ollama pull）"
                />
              </div>
            </div>
            <div className="form-hint">
              Ollama：安装后运行 <code>ollama serve</code> 与 <code>ollama pull 模型名</code>；LM Studio 地址通常是 http://localhost:1234/v1。知页不会自动下载模型。
            </div>
          </>
        ) : null}

        {mode === 'api' ? (
          <>
            <div className="form-grid-2">
              <div className="form-field">
                <label className="form-label">API 地址（OpenAI 兼容，通常以 /v1 结尾）</label>
                <input
                  className="form-input"
                  value={form.apiBaseUrl}
                  onChange={(e) => setForm({ ...form, apiBaseUrl: e.target.value })}
                  placeholder="https://your-provider.example/v1"
                />
              </div>
              <div className="form-field">
                <label className="form-label">模型名称</label>
                <input
                  className="form-input"
                  value={form.apiModel}
                  onChange={(e) => setForm({ ...form, apiModel: e.target.value })}
                  placeholder="例如 glm-4-flash / gpt-4o-mini"
                />
              </div>
            </div>
            <div className="form-field">
              <label className="form-label">
                API Key{info?.hasApiKey ? '（已保存，留空表示不修改）' : ''}
              </label>
              <input
                className="form-input"
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={info?.hasApiKey ? '········（已保存）' : 'sk-…'}
                autoComplete="off"
              />
              <div className="form-hint">
                {info?.safeStorageAvailable
                  ? '密钥将通过 Windows 安全加密（safeStorage）保存在本机，不会写入源码、日志或备份文件。'
                  : '⚠️ 本机无法使用系统安全加密，密钥仅保存在本次运行内存中（重启后需重新输入），不会明文落盘。'}
                {info?.hasApiKey ? (
                  <>
                    {' '}
                    <Button small variant="ghost" onClick={handleClearKey}>
                      清除已保存的密钥
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
            <div className="form-hint">
              费用由你的服务商按用量收取；知页单次生成最多发送约 3 万字符文本、输出上限 4000 tokens，仅在你点击生成时调用。
            </div>
          </>
        ) : null}

        {mode !== 'demo' ? (
          <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
            <Button variant="primary" onClick={() => handleSave(mode)} disabled={saving}>
              {saving ? '保存中…' : '保存配置'}
            </Button>
            <Button onClick={handleTest} disabled={testing || (info?.config.mode !== mode)}>
              {testing ? '测试中…' : '测试连接'}
            </Button>
            {testResult ? (
              <span className={testResult.ok ? 'test-ok' : 'test-fail'}>
                {testResult.ok ? '✓ ' : '✗ '}
                {testResult.message}
              </span>
            ) : null}
          </div>
        ) : (
          <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
            <Button variant="primary" onClick={() => handleSave('demo')} disabled={saving}>
              {saving ? '保存中…' : '保存为演示模式'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
