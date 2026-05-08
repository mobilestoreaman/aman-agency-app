import { apiClient } from './client'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CollectionInfo {
  name: string
  count: number
  size_bytes: number
  avg_obj_size: number
  index_count: number
}

export interface DocumentFilterParams {
  page?: number
  limit?: number
  search?: string
  field?: string
  value?: string
  sort_by?: string
  sort_dir?: 'asc' | 'desc'
  date_field?: string
  from?: string
  to?: string
}

export interface DumpRequest {
  collection?: string   // empty = full DB
  format: 'json' | 'zip'
}

export interface DumpRecord {
  id: string
  collection: string
  format: string
  file_name: string
  size_bytes: number
  generated_by: string
  ip: string
  created_at: string
  expires_at: string
  expired: boolean
}

// ── API functions ─────────────────────────────────────────────────────────────

/** List all MongoDB collections with stats. */
export const listCollections = () =>
  apiClient.get<{ success: boolean; data: CollectionInfo[] }>('/admin/db/collections')

/** Get stats for a single collection. */
export const getCollectionStats = (name: string) =>
  apiClient.get<{ success: boolean; data: CollectionInfo }>(`/admin/db/collections/${encodeURIComponent(name)}/stats`)

/** List documents in a collection (paginated + filtered). */
export const listDocuments = (
  collection: string,
  params?: DocumentFilterParams,
) =>
  apiClient.get<{
    success: boolean
    data: Record<string, unknown>[]
    meta: { page: number; limit: number; total: number; total_pages: number }
  }>(`/admin/db/collections/${encodeURIComponent(collection)}/documents`, { params })

/** Fetch a single document by _id. */
export const getDocument = (collection: string, id: string) =>
  apiClient.get<{ success: boolean; data: Record<string, unknown> }>(
    `/admin/db/collections/${encodeURIComponent(collection)}/documents/${encodeURIComponent(id)}`,
  )

/** Generate a MongoDB dump (JSON or ZIP). */
export const generateDump = (data: DumpRequest) =>
  apiClient.post<{ success: boolean; data: DumpRecord }>('/admin/db/dump/generate', data)

/** List all previously generated dumps. */
export const listDumpHistory = () =>
  apiClient.get<{ success: boolean; data: DumpRecord[] }>('/admin/db/dump/history')

/**
 * Build the download URL for a dump file.
 * Returns a URL that triggers a browser download via an anchor tag.
 */
export const getDumpDownloadUrl = (dumpId: string) =>
  `${apiClient.defaults.baseURL}/admin/db/dump/${encodeURIComponent(dumpId)}/download`
