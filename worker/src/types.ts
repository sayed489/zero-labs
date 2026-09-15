export interface Env {
  DB: D1Database
  DEVICE: DurableObjectNamespace
  WORKER_PROXY_SECRET: string
  BETTER_AUTH_SECRET: string
  APP_URL: string
  ALLOWED_ORIGINS: string
}

export interface UserRow {
  id: string
  email: string
  password_hash: string
  created_at: number
}

export interface DeviceRow {
  id: string
  user_id: string
  name: string | null
  platform: string | null
  device_token_hash: string
  daemon_ok: number
  last_seen_at: number | null
  created_at: number
}

export interface PairingRow {
  id: string
  device_code_hash: string
  user_code: string
  device_name: string | null
  platform: string | null
  device_token_hash: string
  status: string
  user_id: string | null
  device_id: string | null
  expires_at: number
  created_at: number
}
