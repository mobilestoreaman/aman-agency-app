import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as adminApi from '@/api/admin'
import type { DocumentFilterParams, DumpRequest } from '@/api/admin'
import { getApiError } from '@/utils/error'

// ── Query key factory ─────────────────────────────────────────────────────────

export const adminDbKeys = {
  all:         ['admin-db'] as const,
  collections: () => [...adminDbKeys.all, 'collections'] as const,
  collection:  (name: string) => [...adminDbKeys.collections(), name] as const,
  documents:   (collection: string, params?: object) =>
    [...adminDbKeys.collection(collection), 'documents', params] as const,
  document:    (collection: string, id: string) =>
    [...adminDbKeys.collection(collection), 'document', id] as const,
  dumpHistory: () => [...adminDbKeys.all, 'dump-history'] as const,
}

// ── Collections ───────────────────────────────────────────────────────────────

/** Returns all MongoDB collections with their basic stats. */
export function useCollections() {
  return useQuery({
    queryKey: adminDbKeys.collections(),
    queryFn: () => adminApi.listCollections().then((r) => r.data.data),
    staleTime: 30_000,
  })
}

/** Returns stats for a single named collection. */
export function useCollectionStats(name: string) {
  return useQuery({
    queryKey: adminDbKeys.collection(name),
    queryFn: () => adminApi.getCollectionStats(name).then((r) => r.data.data),
    enabled: !!name,
    staleTime: 30_000,
  })
}

// ── Documents ─────────────────────────────────────────────────────────────────

/** Returns a paginated, filtered page of documents from a collection. */
export function useCollectionDocuments(
  collection: string,
  params?: DocumentFilterParams,
) {
  return useQuery({
    queryKey: adminDbKeys.documents(collection, params),
    queryFn: () => adminApi.listDocuments(collection, params).then((r) => r.data),
    enabled: !!collection,
    staleTime: 15_000,
    placeholderData: (prev) => prev, // keep previous data while loading next page
  })
}

/** Returns a single document by its _id. */
export function useDocument(collection: string, id: string) {
  return useQuery({
    queryKey: adminDbKeys.document(collection, id),
    queryFn: () => adminApi.getDocument(collection, id).then((r) => r.data.data),
    enabled: !!collection && !!id,
    staleTime: 15_000,
  })
}

// ── Dumps ─────────────────────────────────────────────────────────────────────

/** Returns the dump history list. */
export function useDumpHistory() {
  return useQuery({
    queryKey: adminDbKeys.dumpHistory(),
    queryFn: () => adminApi.listDumpHistory().then((r) => r.data.data),
    staleTime: 10_000,
  })
}

/** Mutation that generates a new dump and invalidates the history query. */
export function useGenerateDump() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: DumpRequest) => adminApi.generateDump(data).then((r) => r.data.data),
    onSuccess: (record) => {
      qc.invalidateQueries({ queryKey: adminDbKeys.dumpHistory() })
      toast.success(`Dump "${record.file_name}" generated — ready to download.`)
    },
    onError: (e) => {
      toast.error(getApiError(e))
    },
  })
}
