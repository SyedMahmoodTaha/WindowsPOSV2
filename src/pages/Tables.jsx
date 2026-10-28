import { FaArrowLeft } from "react-icons/fa6";
import { FaEye, FaPrint } from "react-icons/fa6";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { printOrder, readOrders, updateOrder } from "../utils/orderStorage";
import { readTablesAsync } from "../utils/catalog";

const Tables = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const backPath = location.state?.from || "/";
    const [orders, setOrders] = useState(readOrders);
    const [tables, setTables] = useState([]);
    const [settleOrder, setSettleOrder] = useState(null);
    const [paidAmount, setPaidAmount] = useState("");
    const handledSettlementId = useRef(null);

    useEffect(() => {
        readTablesAsync().then(setTables);
    }, []);

    useEffect(() => {
        const refreshOrders = () => setOrders(readOrders());
        const refreshTables = () => readTablesAsync().then(setTables);
        window.addEventListener("pfl-orders-updated", refreshOrders);
        window.addEventListener("storage", refreshOrders);
        window.addEventListener("pfl-catalog-updated", refreshTables);
        return () => {
            window.removeEventListener("pfl-orders-updated", refreshOrders);
            window.removeEventListener("storage", refreshOrders);
            window.removeEventListener("pfl-catalog-updated", refreshTables);
        };
    }, []);

    useEffect(() => {
        const settlementId = location.state?.settleOrderId;
        if (!settlementId || handledSettlementId.current === settlementId) return;

        const settlementOrder = orders.find((order) => order.id === settlementId && order.status !== "completed");
        if (settlementOrder) {
            handledSettlementId.current = settlementId;
            setSettleOrder(settlementOrder);
            setPaidAmount("");
            navigate(location.pathname, { replace: true, state: { ...location.state, settleOrderId: null } });
        }
    }, [location.state?.settleOrderId, orders]);

    const occupiedTables = new Set(orders
        .filter((order) => order.orderType === "Table" && order.status !== "completed" && order.orderDetails?.tableNumber)
        .map((order) => order.orderDetails.tableNumber));
    const visibleTables = [...new Set([...tables, ...occupiedTables])];

    const orderForTable = (table) => orders.find((order) => order.orderType === "Table" && order.status !== "completed" && order.orderDetails?.tableNumber === table);
    const openTableOrder = (table) => navigate("/new-order", { state: { from: "/Tables", tableNumber: table } });
    const openOrderView = (order) => navigate("/new-order", { state: { from: "/Tables", existingOrder: order } });
    const completeSettlement = async (shouldPrint) => {
        if (!settleOrder) return;

        if (shouldPrint) {
            const orderToSettle = settleOrder;
            setSettleOrder(null);
            const printed = await printOrder(orderToSettle, "cashier");
            if (!printed) {
                setSettleOrder(orderToSettle);
                return;
            }
            updateOrder(orderToSettle.id, { status: "completed" });
            setPaidAmount("");
            return;
        }

        updateOrder(settleOrder.id, { status: "completed" });
        setSettleOrder(null);
        setPaidAmount("");
    };
    const changeDue = Math.max(0, (Number(paidAmount) || 0) - (settleOrder?.total || 0));

    return (
        <main className="min-h-screen overflow-y-auto bg-[#1f1f1f] px-3 py-6 text-[#f5f5f5] sm:px-6">
            <div className="mx-auto max-w-7xl">
                <div className="mb-6 flex items-center gap-4 sm:mb-8">
                    <Link to={backPath} className="rounded-full p-3 text-[#d3d3d3] transition-colors hover:bg-[#d3d3d3] hover:text-[#1a1a1a]" aria-label="Back to previous page">
                        <FaArrowLeft />
                    </Link>
                    <div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-[#ababab] sm:text-xs">Point of sale</p>
                        <h1 className="text-2xl font-semibold sm:text-3xl">Tables</h1>
                    </div>
                </div>

                <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
                    {visibleTables.map((table) => (
                        <div
                            key={table}
                            className="relative"
                        >
                            <button type="button" onClick={() => openTableOrder(table)} className={`group flex min-h-[112px] w-full flex-col items-center justify-center rounded-[14px] px-2 py-3 text-center transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#d3d3d3] hover:text-[#1a1a1a] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#d3d3d3] ${occupiedTables.has(table) ? "bg-[#f6c453] text-[#1a1a1a]" : "bg-[#2a2a2a]"}`}>
                                <span className="text-lg font-semibold sm:text-xl lg:text-2xl">{table}</span>
                                <span className={`mt-1 text-[10px] sm:text-xs ${occupiedTables.has(table) ? "text-[#5a4300]" : "text-[#ababab] group-hover:text-[#555555]"}`}>{occupiedTables.has(table) ? "Occupied" : "Available"}</span>
                            </button>
                            {occupiedTables.has(table) && <div className="absolute bottom-0 left-1/2 z-10 flex -translate-x-1/2 translate-y-1/2 overflow-hidden rounded-[10px] border border-black/20 bg-[#1f1f1f] shadow-lg">
                                <button type="button" onClick={() => openOrderView(orderForTable(table))} className="flex size-8 items-center justify-center text-[#f5f5f5] hover:bg-[#d3d3d3] hover:text-[#1a1a1a] sm:size-9" aria-label={`View order for table ${table}`} title="View order"><FaEye /></button>
                                <button type="button" onClick={() => printOrder(orderForTable(table), "kitchen")} className="flex size-8 items-center justify-center text-[#f5f5f5] hover:bg-[#d3d3d3] hover:text-[#1a1a1a] sm:size-9" aria-label={`Print order for table ${table}`} title="Print KOT"><FaPrint /></button>
                                <button type="button" onClick={() => { setSettleOrder(orderForTable(table)); setPaidAmount(""); }} className="rounded-r-[10px] bg-[#d3d3d3] px-2 text-[10px] font-semibold text-[#1a1a1a] hover:bg-white sm:px-3 sm:text-xs">Settle Bill</button>
                            </div>}
                        </div>
                    ))}
                </section>
            </div>
            {settleOrder && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><section role="dialog" aria-modal="true" aria-labelledby="settlement-title" className="w-full max-w-md rounded-[20px] bg-[#2a2a2a] p-5"><div className="flex items-center justify-between"><div><p className="text-sm uppercase tracking-[0.16em] text-[#ababab]">Settle table {settleOrder.orderDetails?.tableNumber}</p><h2 id="settlement-title" className="text-2xl font-semibold">Bill {settleOrder.orderNumber}</h2></div><button type="button" onClick={() => { setSettleOrder(null); setPaidAmount(""); }} className="rounded-full p-2 text-xl text-[#ababab] hover:bg-[#3a3a3a]" aria-label="Close settlement">&times;</button></div><p className="mt-5 flex justify-between text-lg"><span>Total</span><strong>₹{Math.round(settleOrder.total)}</strong></p><label className="mt-5 grid gap-2 text-sm text-[#ababab]">Customer paid<input autoFocus type="text" inputMode="numeric" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value.replace(/\D/g, ""))} className="field" /></label><p className="mt-4 flex justify-between rounded-[10px] bg-[#1f1f1f] px-3 py-3"><span>Return to customer</span><strong>₹{Math.round(changeDue)}</strong></p><div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3"><button type="button" onClick={() => { setSettleOrder(null); setPaidAmount(""); }} className="rounded-[10px] border border-[#555] px-3 py-3 text-sm font-semibold text-[#f5f5f5] hover:bg-[#3a3a3a]">Cancel</button><button type="button" onClick={() => completeSettlement(false)} className="rounded-[10px] bg-[#d3d3d3] px-3 py-3 text-sm font-semibold text-[#1a1a1a]">Complete</button><button type="button" onClick={() => completeSettlement(true)} className="rounded-[10px] bg-[#d3d3d3] px-3 py-3 text-sm font-semibold text-[#1a1a1a]">Save &amp; Print</button></div></section></div>}
        </main>
    );
};

export default Tables