import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const defaultOverview = {
  totalRevenue: 0,
  totalOrders: 0,
  averageOrderValue: 0,
  itemsSold: 0,
  todayRevenue: 0,
  salesByType: [],
}

const emptyDraft = {
  orderNumber: '',
  orderType: 'Walk-in',
  table: '',
  status: 'saved',
  total: 0,
}

const DbViewer = ({ onSignOut }) => {
  const [overview, setOverview] = useState(defaultOverview)
  const [dailySales, setDailySales] = useState([])
  const [recentOrders, setRecentOrders] = useState([])
  const [editingOrderId, setEditingOrderId] = useState(null)
  const [orderDraft, setOrderDraft] = useState(emptyDraft)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadSalesData = async () => {
    try {
      setLoading(true)
      setError('')

      if (!window.dbViewerApi) {
        setError('Database API not available')
        return
      }

      const [salesOverview, salesReport] = await Promise.all([
        window.dbViewerApi.getSalesOverview(),
        window.dbViewerApi.getSalesReport(),
      ])

      setOverview(salesOverview || defaultOverview)
      setDailySales(salesReport?.dailySales || [])
      setRecentOrders(salesReport?.recentOrders || [])
    } catch (loadError) {
      console.error('Error loading sales data:', loadError)
      setError('Error loading sales data: ' + loadError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSalesData()
  }, [])

  const salesTypeSummary = useMemo(() => overview.salesByType || [], [overview.salesByType])

  const startEditingOrder = (order) => {
    setEditingOrderId(order.id)
    setOrderDraft({
      orderNumber: order.orderNumber || '',
      orderType: order.orderType || 'Walk-in',
      table: order.table || '',
      status: order.status || 'saved',
      total: Number(order.total || 0),
    })
  }

  const saveEditedOrder = async () => {
    if (!editingOrderId) return

    try {
      setMessage('')
      const result = await window.dbViewerApi.updateOrderRecord({
        orderId: editingOrderId,
        changes: {
          orderNumber: orderDraft.orderNumber,
          orderType: orderDraft.orderType,
          table: orderDraft.table,
          status: orderDraft.status,
          total: Number(orderDraft.total || 0),
          orderDetails: {
            tableNumber: orderDraft.table,
          },
        },
      })

      if (!result?.ok) {
        throw new Error(result?.error || 'Unable to update order')
      }

      setEditingOrderId(null)
      setOrderDraft(emptyDraft)
      setMessage('Order updated successfully')
      await loadSalesData()
    } catch (updateError) {
      console.error('Error updating order:', updateError)
      setError('Error updating order: ' + updateError.message)
    }
  }

  const deleteOrder = async (orderId) => {
    if (!window.confirm('Delete this recent order from the database?')) return

    try {
      const result = await window.dbViewerApi.deleteOrderRecord({ orderId })
      if (!result?.ok) {
        throw new Error(result?.error || 'Unable to delete order')
      }

      const refreshed = await window.dbViewerApi.getSalesOverview()
      const report = await window.dbViewerApi.getSalesReport()
      setOverview(refreshed || defaultOverview)
      setDailySales(report?.dailySales || [])
      setRecentOrders(report?.recentOrders || [])
      setMessage('Order deleted successfully')
      setEditingOrderId(null)
    } catch (deleteError) {
      console.error('Error deleting order:', deleteError)
      setError('Error deleting order: ' + deleteError.message)
    }
  }

  const exportToExcel = async () => {
    try {
      const result = await window.dbViewerApi.exportSalesReport({
        overview,
        dailySales,
        recentOrders,
      })

      if (result?.ok && result.filePath) {
        setMessage(`Excel report saved to ${result.filePath}`)
        return
      }

      if (result?.canceled) {
        setMessage('Export canceled')
        return
      }

      throw new Error(result?.error || 'Unable to export report')
    } catch (exportError) {
      console.error('Export failed:', exportError)
      setError('Export failed: ' + exportError.message)
    }
  }

  return (
    <div className="min-h-screen bg-[#1f1f1f] p-6 text-[#f5f5f5]">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-[#ababab]">Database reports</p>
            <h1 className="mt-2 text-3xl font-bold">Sales Overview</h1>
            <p className="mt-2 text-sm text-[#ababab]">Signed in as Admin</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={exportToExcel}
              className="rounded-[12px] bg-[#d3d3d3] px-4 py-2 font-semibold text-[#1a1a1a] hover:bg-white"
            >
              Export to Excel
            </button>
            <button
              onClick={onSignOut}
              className="rounded-[12px] border border-[#555] px-4 py-2 font-semibold text-[#f5f5f5] hover:bg-[#3a3a3a]"
            >
              Sign out
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-[12px] border border-red-600 bg-red-950/30 p-4 text-red-200">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-6 rounded-[12px] border border-emerald-500 bg-emerald-950/30 p-4 text-emerald-200">
            {message}
          </div>
        )}

        {loading ? (
          <div className="rounded-[16px] bg-[#2a2a2a] p-6 text-[#d3d3d3]">Loading sales overview...</div>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-[16px] bg-[#2a2a2a] p-5">
                <p className="text-sm text-[#ababab]">Total Revenue</p>
                <h2 className="mt-3 text-2xl font-bold text-[#f5f5f5]">{currency.format(overview.totalRevenue || 0)}</h2>
              </div>
              <div className="rounded-[16px] bg-[#2a2a2a] p-5">
                <p className="text-sm text-[#ababab]">Total Orders</p>
                <h2 className="mt-3 text-2xl font-bold text-[#f5f5f5]">{overview.totalOrders || 0}</h2>
              </div>
              <div className="rounded-[16px] bg-[#2a2a2a] p-5">
                <p className="text-sm text-[#ababab]">Average Order Value</p>
                <h2 className="mt-3 text-2xl font-bold text-[#f5f5f5]">{currency.format(overview.averageOrderValue || 0)}</h2>
              </div>
              <div className="rounded-[16px] bg-[#2a2a2a] p-5">
                <p className="text-sm text-[#ababab]">Items Sold</p>
                <h2 className="mt-3 text-2xl font-bold text-[#f5f5f5]">{overview.itemsSold || 0}</h2>
              </div>
              <div className="rounded-[16px] bg-[#2a2a2a] p-5">
                <p className="text-sm text-[#ababab]">Today Revenue</p>
                <h2 className="mt-3 text-2xl font-bold text-[#f5f5f5]">{currency.format(overview.todayRevenue || 0)}</h2>
              </div>
            </section>

            <section className="mt-8 grid gap-6 xl:grid-cols-[1.1fr_1.4fr]">
              <div className="rounded-[16px] bg-[#2a2a2a] p-5">
                <h3 className="mb-4 text-xl font-semibold">Sales by order type</h3>
                <div className="space-y-3">
                  {salesTypeSummary.length === 0 ? (
                    <p className="text-[#ababab]">No sales data available yet.</p>
                  ) : (
                    salesTypeSummary.map(([type, amount]) => (
                      <div key={type} className="flex items-center justify-between rounded-[10px] bg-[#1f1f1f] px-3 py-2">
                        <span className="text-[#d3d3d3]">{type}</span>
                        <strong>{currency.format(amount)}</strong>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-[16px] bg-[#2a2a2a] p-5">
                <h3 className="mb-4 text-xl font-semibold">Daily sales report</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-[#444444] text-[#ababab]">
                        <th className="pb-3 pr-4">Date</th>
                        <th className="pb-3 pr-4">Orders</th>
                        <th className="pb-3 pr-4">Items</th>
                        <th className="pb-3">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailySales.length === 0 ? (
                        <tr>
                          <td colSpan="4" className="py-4 text-[#ababab]">No sales report available.</td>
                        </tr>
                      ) : (
                        dailySales.map((day) => (
                          <tr key={day.date} className="border-b border-[#333333]">
                            <td className="py-3 pr-4">{day.date}</td>
                            <td className="py-3 pr-4">{day.orders}</td>
                            <td className="py-3 pr-4">{day.items}</td>
                            <td className="py-3">{currency.format(day.revenue)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section className="mt-8 rounded-[16px] bg-[#2a2a2a] p-5">
              <h3 className="mb-4 text-xl font-semibold">Recent orders</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#444444] text-[#ababab]">
                      <th className="pb-3 pr-4">Order</th>
                      <th className="pb-3 pr-4">Date</th>
                      <th className="pb-3 pr-4">Type</th>
                      <th className="pb-3 pr-4">Table</th>
                      <th className="pb-3 pr-4">Status</th>
                      <th className="pb-3 pr-4 text-right">Total</th>
                      <th className="pb-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="py-4 text-[#ababab]">No orders recorded yet.</td>
                      </tr>
                    ) : (
                      recentOrders.map((order) => {
                        const isEditing = editingOrderId === order.id
                        return (
                          <tr key={order.id ?? `${order.orderNumber}-${order.createdAt}`} className="border-b border-[#333333] align-top">
                            <td className="py-3 pr-4">
                              {isEditing ? (
                                <input
                                  value={orderDraft.orderNumber}
                                  onChange={(event) => setOrderDraft((current) => ({ ...current, orderNumber: event.target.value }))}
                                  className="w-full rounded border border-[#444] bg-[#1f1f1f] px-2 py-1 text-white"
                                />
                              ) : (
                                order.orderNumber
                              )}
                            </td>
                            <td className="py-3 pr-4">
                              {order.createdAt ? new Date(order.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                            </td>
                            <td className="py-3 pr-4">
                              {isEditing ? (
                                <select
                                  value={orderDraft.orderType}
                                  onChange={(event) => setOrderDraft((current) => ({ ...current, orderType: event.target.value }))}
                                  className="w-full rounded border border-[#444] bg-[#1f1f1f] px-2 py-1 text-white"
                                >
                                  <option value="Walk-in">Walk-in</option>
                                  <option value="Table">Table</option>
                                  <option value="Takeaway">Takeaway</option>
                                  <option value="Delivery">Delivery</option>
                                </select>
                              ) : (
                                order.orderType
                              )}
                            </td>
                            <td className="py-3 pr-4">
                              {isEditing ? (
                                <input
                                  value={orderDraft.table}
                                  onChange={(event) => setOrderDraft((current) => ({ ...current, table: event.target.value }))}
                                  className="w-full rounded border border-[#444] bg-[#1f1f1f] px-2 py-1 text-white"
                                />
                              ) : (
                                order.table
                              )}
                            </td>
                            <td className="py-3 pr-4">
                              {isEditing ? (
                                <select
                                  value={orderDraft.status}
                                  onChange={(event) => setOrderDraft((current) => ({ ...current, status: event.target.value }))}
                                  className="w-full rounded border border-[#444] bg-[#1f1f1f] px-2 py-1 text-white"
                                >
                                  <option value="saved">Saved</option>
                                  <option value="completed">Completed</option>
                                  <option value="hold">On hold</option>
                                  <option value="void">Void</option>
                                </select>
                              ) : (
                                order.status
                              )}
                            </td>
                            <td className="py-3 pr-4 text-right">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={orderDraft.total}
                                  onChange={(event) => setOrderDraft((current) => ({ ...current, total: Number(event.target.value || 0) }))}
                                  className="w-28 rounded border border-[#444] bg-[#1f1f1f] px-2 py-1 text-right text-white"
                                />
                              ) : (
                                currency.format(order.total)
                              )}
                            </td>
                            <td className="py-3 text-right">
                              {isEditing ? (
                                <div className="flex justify-end gap-2">
                                  <button onClick={saveEditedOrder} className="rounded bg-emerald-600 px-2 py-1 hover:bg-emerald-500">Save</button>
                                  <button onClick={() => { setEditingOrderId(null); setOrderDraft(emptyDraft) }} className="rounded bg-gray-600 px-2 py-1 hover:bg-gray-500">Cancel</button>
                                </div>
                              ) : (
                                <div className="flex justify-end gap-2">
                                  <button onClick={() => startEditingOrder(order)} className="rounded bg-blue-600 px-2 py-1 hover:bg-blue-500">Edit</button>
                                  <button onClick={() => deleteOrder(order.id)} className="rounded bg-red-600 px-2 py-1 hover:bg-red-500">Delete</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

export default DbViewer
