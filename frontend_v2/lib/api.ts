import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'

// ─── Axios instance ───────────────────────────────────────────────────────────

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
})

// ─── Request interceptor — attach access token ────────────────────────────────

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ─── Response interceptor — handle 401, auto-refresh ─────────────────────────

let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject:  (err: unknown)  => void
}> = []

const processQueue = (error: unknown, token: string | null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error)
    else resolve(token!)
  })
  failedQueue = []
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // Not a 401 or already retried — just reject
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }

    // Skip refresh for auth routes themselves
    if (original.url?.includes('/auth/')) {
      clearTokens()
      window.location.href = '/login'
      return Promise.reject(error)
    }

    if (isRefreshing) {
      // Queue requests while a refresh is in progress
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`
        return api(original)
      })
    }

    original._retry  = true
    isRefreshing     = true

    try {
      const refreshToken = getRefreshToken()
      if (!refreshToken) throw new Error('No refresh token')

      const { data } = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api'}/auth/refresh`,
        { refreshToken }
      )

      const { accessToken, refreshToken: newRefresh } = data.data
      setTokens(accessToken, newRefresh)
      processQueue(null, accessToken)

      original.headers.Authorization = `Bearer ${accessToken}`
      return api(original)

    } catch (refreshError) {
      processQueue(refreshError, null)
      clearTokens()
      window.location.href = '/login'
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  }
)

// ─── Token helpers ────────────────────────────────────────────────────────────

const ACCESS_KEY  = 'gym_access_token'
const REFRESH_KEY = 'gym_refresh_token'

export function getAccessToken():  string | null { return localStorage.getItem(ACCESS_KEY) }
export function getRefreshToken(): string | null { return localStorage.getItem(REFRESH_KEY) }

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_KEY,  access)
  localStorage.setItem(REFRESH_KEY, refresh)
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

// ─── API error helper ─────────────────────────────────────────────────────────

export function getApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error?.message ?? error.message
  }
  return 'An unexpected error occurred'
}
