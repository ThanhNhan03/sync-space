import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { AppSettings, McpServerConfig, ProviderConfig, ProviderId } from '@shared/types'
import { McpServersSection } from './McpServersSection'
import { SkillsSection } from './SkillsSection'
import { MemorySection } from './MemorySection'

export interface SettingsPanelProps {
  settings: AppSettings
  /** Active workspace path, forwarded to MCP presets that scope to the workspace. */
  workspaceRoot?: string
  onChange: (settings: AppSettings) => void
  onClose: () => void
}

const PROVIDER_OPTIONS: { id: ProviderId; label: string }[] = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'claude', label: 'Claude' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'openrouter', label: 'OpenRouter' }
]

const THEME_OPTIONS: AppSettings['theme'][] = ['light', 'dark', 'system']

/**
 * A curated starting list per provider -- not exhaustive, and provider catalogs (especially
 * OpenRouter's, which aggregates hundreds of models) change faster than this list can track.
 * "Custom..." always stays available so a newer/uncommon model id can still be typed in.
 */
const PROVIDER_MODELS: Record<ProviderId, string[]> = {
  openai: ['gpt-5.1', 'gpt-5.1-mini', 'gpt-5', 'gpt-4.1', 'gpt-4o', 'gpt-4o-mini', 'o3', 'o4-mini'],
  claude: ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001', 'claude-opus-4-1'],
  gemini: ['gemini-3-pro', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  openrouter: [
    'openai/gpt-5.1',
    'anthropic/claude-sonnet-5',
    'google/gemini-3-pro',
    'meta-llama/llama-4-maverick',
    'deepseek/deepseek-v3.2',
    'mistralai/mistral-large'
  ]
}

const CUSTOM_MODEL_VALUE = '__custom__'

type SettingsTab = 'general' | 'mcp' | 'skills' | 'memory'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'mcp', label: 'MCP Servers' },
  { id: 'skills', label: 'Skills' },
  { id: 'memory', label: 'Memory' }
]

function emptyProviderConfig(providerId: ProviderId): ProviderConfig {
  return { providerId, apiKey: '', baseUrl: '', model: '', temperature: undefined }
}

/** Immutably updates the ProviderConfig entry for the currently active provider. */
function withActiveProviderConfig(
  settings: AppSettings,
  patch: Partial<ProviderConfig>
): AppSettings {
  const current =
    settings.providers[settings.activeProviderId] ?? emptyProviderConfig(settings.activeProviderId)
  return {
    ...settings,
    providers: {
      ...settings.providers,
      [settings.activeProviderId]: { ...current, ...patch }
    }
  }
}

export function SettingsPanel({
  settings,
  workspaceRoot,
  onChange,
  onClose
}: SettingsPanelProps): JSX.Element {
  const activeConfig = settings.providers[settings.activeProviderId] ?? emptyProviderConfig(
    settings.activeProviderId
  )

  const knownModels = PROVIDER_MODELS[settings.activeProviderId]
  const isStoredCustomModel = activeConfig.model !== '' && !knownModels.includes(activeConfig.model)

  // Local "the user just picked Custom..." toggle, separate from whether the stored model
  // string happens to match a curated option -- without it, picking Custom... and clearing
  // the model to '' would immediately collapse back to the placeholder on the next render.
  const [manualCustomMode, setManualCustomMode] = useState(isStoredCustomModel)
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')

  useEffect(() => {
    setManualCustomMode(isStoredCustomModel)
    // Only re-derive when switching provider -- switching provider should always re-evaluate
    // from that provider's own stored model, not carry over the previous provider's toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.activeProviderId])

  const showCustomModelInput = manualCustomMode || isStoredCustomModel
  const modelSelectValue = showCustomModelInput ? CUSTOM_MODEL_VALUE : activeConfig.model

  const handleProviderChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    onChange({ ...settings, activeProviderId: event.target.value as ProviderId })
  }

  const handleApiKeyChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onChange(withActiveProviderConfig(settings, { apiKey: event.target.value }))
  }

  const handleBaseUrlChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onChange(withActiveProviderConfig(settings, { baseUrl: event.target.value }))
  }

  const handleModelSelectChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const value = event.target.value
    if (value === CUSTOM_MODEL_VALUE) {
      setManualCustomMode(true)
      return
    }
    setManualCustomMode(false)
    onChange(withActiveProviderConfig(settings, { model: value }))
  }

  const handleCustomModelChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onChange(withActiveProviderConfig(settings, { model: event.target.value }))
  }

  const handleTemperatureChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const raw = event.target.value
    onChange(
      withActiveProviderConfig(settings, { temperature: raw === '' ? undefined : Number(raw) })
    )
  }

  const handleThemeChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    onChange({ ...settings, theme: event.target.value as AppSettings['theme'] })
  }

  const handleMcpServersChange = (mcpServers: McpServerConfig[]): void => {
    onChange({ ...settings, mcpServers })
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface">
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-4">
        <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded p-1 text-gray-400 hover:text-white"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="w-44 shrink-0 space-y-1 border-r border-white/10 p-3">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`block w-full rounded-md px-3 py-1.5 text-left text-sm ${
                activeTab === tab.id
                  ? 'bg-accent/90 text-white'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
            {activeTab === 'general' && (
              <>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-300">Provider</span>
            <select
              value={settings.activeProviderId}
              onChange={handleProviderChange}
              className="w-full rounded-md bg-surface-muted px-2 py-1.5 text-sm text-white outline-none ring-1 ring-transparent focus:ring-accent"
            >
              {PROVIDER_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-300">API key</span>
            <input
              type="password"
              value={activeConfig.apiKey}
              onChange={handleApiKeyChange}
              autoComplete="off"
              className="w-full rounded-md bg-surface-muted px-2 py-1.5 text-sm text-white outline-none ring-1 ring-transparent focus:ring-accent"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-300">Base URL (optional)</span>
            <input
              type="text"
              value={activeConfig.baseUrl ?? ''}
              onChange={handleBaseUrlChange}
              placeholder="https://api.example.com/v1"
              className="w-full rounded-md bg-surface-muted px-2 py-1.5 text-sm text-white outline-none ring-1 ring-transparent focus:ring-accent"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-300">Model</span>
            <select
              value={modelSelectValue}
              onChange={handleModelSelectChange}
              className="w-full rounded-md bg-surface-muted px-2 py-1.5 text-sm text-white outline-none ring-1 ring-transparent focus:ring-accent"
            >
              <option value="" disabled>
                Select a model…
              </option>
              {knownModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
              <option value={CUSTOM_MODEL_VALUE}>Custom…</option>
            </select>
          </label>

          {showCustomModelInput && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-300">Custom model ID</span>
              <input
                type="text"
                value={activeConfig.model}
                onChange={handleCustomModelChange}
                placeholder="e.g. some-provider/some-model"
                autoFocus
                className="w-full rounded-md bg-surface-muted px-2 py-1.5 text-sm text-white outline-none ring-1 ring-transparent focus:ring-accent"
              />
            </label>
          )}

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-300">Temperature</span>
            <input
              type="number"
              step={0.1}
              min={0}
              max={2}
              value={activeConfig.temperature ?? ''}
              onChange={handleTemperatureChange}
              className="w-full rounded-md bg-surface-muted px-2 py-1.5 text-sm text-white outline-none ring-1 ring-transparent focus:ring-accent"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-300">Theme</span>
            <select
              value={settings.theme}
              onChange={handleThemeChange}
              className="w-full rounded-md bg-surface-muted px-2 py-1.5 text-sm text-white outline-none ring-1 ring-transparent focus:ring-accent"
            >
              {THEME_OPTIONS.map((theme) => (
                <option key={theme} value={theme}>
                  {theme.charAt(0).toUpperCase() + theme.slice(1)}
                </option>
              ))}
            </select>
          </label>
              </>
            )}

            {activeTab === 'mcp' && (
              <McpServersSection
                servers={settings.mcpServers ?? []}
                onChange={handleMcpServersChange}
                workspaceRoot={workspaceRoot}
              />
            )}

            {activeTab === 'skills' && <SkillsSection workspaceRoot={workspaceRoot} />}

            {activeTab === 'memory' && (
              <MemorySection
                enabled={settings.memoryEnabled !== false}
                onToggleEnabled={(memoryEnabled) => onChange({ ...settings, memoryEnabled })}
                workspaceRoot={workspaceRoot}
              />
            )}
          </div>
        </div>
      </div>

      <footer className="flex shrink-0 justify-end border-t border-white/10 px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md bg-accent/90 px-4 py-1.5 text-sm font-medium text-white hover:bg-accent"
        >
          Done
        </button>
      </footer>
    </div>
  )
}
