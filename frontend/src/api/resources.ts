import { get, post, del } from '@/utils/request'

export interface ResourceItem {
  id: number
  name: string
  size_bytes: number
  expires_at?: string | null
  max_downloads: number
  download_count: number
  created_at?: string
}

const PREFIX = '/api/v1/resources'

export const getResources = (): Promise<ResourceItem[]> => get(PREFIX)

export const uploadResource = (file: File, itemId: string, ttlHours: number, maxDownloads: number) => {
  const body = new FormData()
  body.append('file', file)
  body.append('item_id', itemId)
  body.append('ttl_hours', String(ttlHours))
  body.append('max_downloads', String(maxDownloads))
  return post<{ success: boolean; resource: ResourceItem; card_id?: number }>(PREFIX, body, { timeout: 0 })
}

export const deleteResource = (id: number) => del(`${PREFIX}/${id}`)
