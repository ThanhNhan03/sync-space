import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { AppSettings, ProviderId } from '@shared/types'
import { SettingsPanel } from './SettingsPanel'

function render(settings: AppSettings): string {
  return renderToString(
    createElement(SettingsPanel, {
      settings,
      workspaceRoot: '/ws',
      onChange: () => {},
      onClose: () => {}
    })
  )
}

describe('SettingsPanel', () => {
  it('renders with a known provider', () => {
    expect(render({ activeProviderId: 'openai', providers: {}, theme: 'system' })).toContain('Settings')
  })

  it('does not crash when the persisted activeProviderId is not in the curated model map', () => {
    // Regression: an unknown/legacy provider id made PROVIDER_MODELS[id] undefined, and
    // calling .includes() on it blanked the whole settings screen.
    const settings: AppSettings = {
      activeProviderId: 'legacy-provider' as ProviderId,
      providers: {},
      theme: 'system'
    }
    expect(() => render(settings)).not.toThrow()
  })
})
