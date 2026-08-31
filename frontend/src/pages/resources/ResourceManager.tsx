import { useEffect, useState } from 'react'
import { FileArchive, RefreshCw, Trash2, Upload } from 'lucide-react'
import { deleteResource, getResources, ResourceItem, uploadResource } from '@/api/resources'
import { getAllSelectableItemKeys, SelectableItem } from '@/api/items'

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

const inputClass = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
const labelClass = 'mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200'

export function ResourceManager() {
  const [rows, setRows] = useState<ResourceItem[]>([])
  const [items, setItems] = useState<SelectableItem[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [itemId, setItemId] = useState('')
  const [ttlHours, setTtlHours] = useState(72)
  const [maxDownloads, setMaxDownloads] = useState(3)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const load = async () => {
    try {
      const [resources, selectable] = await Promise.all([getResources(), getAllSelectableItemKeys()])
      setRows(resources)
      setItems(selectable.list)
    } catch { setMessage('资源或商品列表加载失败') }
  }
  useEffect(() => { void load() }, [])

  const submit = async () => {
    if (!file) return setMessage('请先选择文件')
    setBusy(true); setMessage('')
    try {
      const result = await uploadResource(file, itemId, ttlHours, maxDownloads)
      setMessage(result.card_id ? `上传成功，已绑定商品并创建自动发货卡券 #${result.card_id}` : '上传成功；未选择商品，因此未创建自动发货卡券')
      setFile(null)
      await load()
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || '上传失败')
    } finally { setBusy(false) }
  }

  const itemLabel = (id?: string | null) => {
    if (!id) return '未绑定商品'
    const item = items.find(option => option.item_id === id)
    return item ? `${item.item_id} · ${item.title || '未命名商品'}` : id
  }

  return <div className="space-y-5">
    <div><h1 className="text-2xl font-bold text-slate-900 dark:text-white">资源管理</h1><p className="text-sm text-slate-500 dark:text-slate-400">上传软件资源，为每个订单生成独立限时下载链接。</p></div>
    <div className="vben-card"><div className="vben-card-body space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <label className="lg:col-span-2"><span className={labelClass}>资源文件（最大 5GB）</span><input type="file" onChange={e => setFile(e.target.files?.[0] || null)} className={inputClass} /></label>
        <label><span className={labelClass}>关联商品（可选）</span><select value={itemId} onChange={e => setItemId(e.target.value)} className={inputClass}><option value="">不绑定商品</option>{items.map(item => <option key={item.item_id} value={item.item_id}>{item.item_id} · {item.title || '未命名商品'}</option>)}</select></label>
        <label><span className={labelClass}>链接有效期（小时）</span><input type="number" min={1} max={8760} value={ttlHours} onChange={e => setTtlHours(Number(e.target.value))} className={inputClass} /><span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">例如 72 小时 = 3 天</span></label>
        <label><span className={labelClass}>每单最大下载次数</span><input type="number" min={1} max={1000} value={maxDownloads} onChange={e => setMaxDownloads(Number(e.target.value))} className={inputClass} /></label>
      </div>
      {itemId && <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">将绑定：{itemLabel(itemId)}。上传后会自动创建 API 卡券。</p>}
      <button onClick={submit} disabled={busy} className="btn btn-primary inline-flex items-center gap-2"><Upload className="h-4 w-4" />{busy ? '上传中…' : '上传并配置'}</button>
      {message && <p className="text-sm text-blue-600 dark:text-blue-300">{message}</p>}
    </div></div>
    <div className="vben-card"><div className="vben-card-header flex justify-between"><h2 className="vben-card-title">已上传资源及绑定关系</h2><button onClick={load} className="btn" title="刷新"><RefreshCw className="h-4 w-4" /></button></div><div className="vben-card-body overflow-x-auto">
      <table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">文件</th><th className="p-2">绑定商品</th><th className="p-2">链接有效期</th><th className="p-2">每单次数</th><th className="p-2">累计下载</th><th className="p-2">创建时间</th><th className="p-2">操作</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-b border-slate-100 dark:border-slate-700"><td className="p-2"><span className="inline-flex items-center gap-2"><FileArchive className="h-4 w-4" />{row.name}<span className="text-xs text-slate-400">{formatSize(row.size_bytes)}</span></span></td><td className="p-2"><span className={row.item_id ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400'}>{itemLabel(row.item_id)}</span>{row.card_id && <span className="ml-2 text-xs text-blue-600 dark:text-blue-300">卡券 #{row.card_id}</span>}</td><td className="p-2">{row.ttl_hours ? `${row.ttl_hours} 小时` : '卡券配置中'}</td><td className="p-2">{row.max_downloads}</td><td className="p-2">{row.download_count}</td><td className="p-2">{row.created_at ? new Date(row.created_at).toLocaleString() : '-'}</td><td className="p-2"><button onClick={async () => { if (!confirm(`删除 ${row.name}？`)) return; await deleteResource(row.id); await load() }} className="text-red-500" title="删除"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table>
      {!rows.length && <p className="py-8 text-center text-slate-400">暂无资源</p>}
    </div></div>
  </div>
}
