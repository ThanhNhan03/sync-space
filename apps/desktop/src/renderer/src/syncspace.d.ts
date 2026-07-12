import type { SyncSpaceApi } from '../../preload/index'

declare global {
  interface Window {
    syncspace: SyncSpaceApi
  }
}

export {}
