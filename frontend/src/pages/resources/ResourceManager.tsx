import { useEffect, useState } from 'react'
import { FileArchive, RefreshCw, Trash2, Upload } from 'lucide-react'
import { deleteResource, getResources, ResourceItem, uploadResource } from '@/api/resources'

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export function ResourceManager() {
  const [rows, setRows] = useState<ResourceItem[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [itemId, setItemId] = useState('')
  const [ttlHours, setTtlHours] = useState(168)
  const [maxDownloads, setMaxDownloads] = useState(3)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const load = async () => {
    try { setRows(await getResources()) } catch { setMessage('资源列表加载失败') }
  }
  useEffect(() => { void load() }, [])

  const submit = async () => {
    if (!file) return setMessage('请先选择文件')
    setBusy(true); setMessage('')
    try {
      const result = await uploadResource(file, itemId.trim(), ttlHours, maxDownloads)
      setMessage(result.card_id ? `上传成功，并创建自动发货卡券 #${result.card_id}` : '上传成功；未填写商品ID，因此未自动创建卡券')
      setFile(null)
      await load()
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || '上传失败')
    } finally { setBusy(false) }
  }

  return <div className="space-y-5">
    <div><h1 className="text-2xl font-bold text-slate-900 dark:text-white">资源管理</h1><p className="text-sm text-slate-500">上传软件资源，为每个订单生成独立限时下载链接。</p></div>
    <div className="vben-card"><div className="vben-card-body space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <label className="md:col-span-2"><span className="input-label">资源文件（最大5GB）</span><input type="file" onChange={e => setFile(e.target.files?.[0] || null)} className="input" /></label>
        <label><span className="input-label">关联商品ID（可选）</span><input value={itemId} onChange={e => setItemId(e.target.value)} placeholder="填写后自动创建卡券" className="input" /></label>
        <label><span className="input-label">链接有效期（小时）</span><input type="number" min={1} max={8760} value={ttlHours} onChange={e => setTtlHours(Number(e.target.value))} className="input" /></label>
        <label><span className="input-label">最大下载次数</span><input type="number" min={1} max={1000} value={maxDownloads} onChange={e => setMaxDownloads(Number(e.target.value))} className="input" /></label>
      </div>
      <button onClick={submit} disabled={busy} className="btn btn-primary inline-flex items-center gap-2"><Upload className="h-4 w-4" />{busy ? '上传中…' : '上传并配置'}</button>
      {message && <p className="text-sm text-blue-600">{message}</p>}
    </div></div>
    <div className="vben-card"><div className="vben-card-header flex justify-between"><h2 className="vben-card-title">已上传资源</h2><button onClick={load} className="btn"><RefreshCw className="h-4 w-4" /></button></div><div className="vben-card-body overflow-x-auto">
      <table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">文件</th><th className="p-2">大小</th><th className="p-2">每单次数</th><th className="p-2">累计下载</th><th className="p-2">创建时间</th><th className="p-2">操作</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-b border-slate-100 dark:border-slate-700"><td className="p-2"><span className="inline-flex items-center gap-2"><FileArchive className="h-4 w-4" />{row.name}</span></td><td className="p-2">{formatSize(row.size_bytes)}</td><td className="p-2">{row.max_downloads}</td><td className="p-2">{row.download_count}</td><td className="p-2">{row.created_at ? new Date(row.created_at).toLocaleString() : '-'}</td><td className="p-2"><button onClick={async () => { if (!confirm(`删除 ${row.name}？`)) return; await deleteResource(row.id); await load() }} className="text-red-500"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table>
      {!rows.length && <p className="py-8 text-center text-slate-400">暂无资源</p>}
    </div></div>
  </div>
}
