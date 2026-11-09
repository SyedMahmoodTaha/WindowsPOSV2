import { FaArrowLeft } from "react-icons/fa6";
import { FaEye, FaPrint } from "react-icons/fa6";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { completeOrderWithInventory, printOrder, printTableTransfer, readOrders, updateOrder } from "../utils/orderStorage";
import { readTablesAsync } from "../utils/catalog";

const Tables = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const backPath = location.state?.from || "/";
    const [orders, setOrders] = useState(readOrders);
    const [tables, setTables] = useState([]);
    const [settleOrder, setSettleOrder] = useState(null);
    const [paidAmount, setPaidAmount] = useState("");
    const [settlementMessage, setSettlementMessage] = useState("");
    const [isSettling, setIsSettling] = useState(false);
    const [transferOrder, setTransferOrder] = useState(null);
    const [targetTable, setTargetTable] = useState("");
    const [transferMessage, setTransferMessage] = useState("");
    const [isTransferring, setIsTransferring] = useState(false);
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
    const availableTransferTables = visibleTables.filter((table) => (
        table !== transferOrder?.orderDetails?.tableNumber && !occupiedTables.has(table)
    ));
    const moveTableOrder = async () => {
        if (!transferOrder || !targetTable || isTransferring) return;
        const fromTable = transferOrder.orderDetails?.tableNumber;
        const latestOrders = readOrders();
        const currentOrder = latestOrders.find((order) => order.id === transferOrder.id && order.status !== "completed");
        const destinationOccupied = latestOrders.some((order) => (
            order.id !== transferOrder.id
            && order.orderType === "Table"
            && order.status !== "completed"
            && order.orderDetails?.tableNumber === targetTable
        ));
        if (!currentOrder || !fromTable || destinationOccupied) {
            setTransferMessage("This table order changed. Refresh the table list and try again.");
            return;
        }

        setIsTransferring(true);
        setTransferMessage("");
        try {
            const printed = await printTableTransfer(transferOrder, fromTable, targetTable);
            if (!printed) {
                setTransferMessage("Transfer slip was not printed. The order has not been moved.");
                return;
            }
            updateOrder(transferOrder.id, {
                orderType: "Table",
                orderDetails: { ...(currentOrder.orderDetails || {}), tableNumber: targetTable },
                temporaryTable: !tables.includes(targetTable),
                updatedAt: new Date().toISOString(),
            });
            setTransferOrder(null);
            setTargetTable("");
            setOrders(readOrders());
        } catch (error) {
            console.error("Could not move table order", error);
            setTransferMessage("Could not move this order. Please try again.");
        } finally {
            setIsTransferring(false);
        }
    };
    const completeSettlement = async (shouldPrint) => {
        if (!settleOrder || isSettling) return;
        setIsSettling(true);
        setSettlementMessage("");
        try {
            if (shouldPrint) {
                const printed = await printOrder(settleOrder, "cashier");
                if (!printed) return;
            }
            const result = await completeOrderWithInventory(settleOrder.id);
            if (!result.ok) {
                setSettlementMessage(result.reason);
                return;
            }
            setOrders(readOrders());
            setSettleOrder(null);
            setPaidAmount("");
        } catch (error) {
            console.error("Could not complete table settlement:", error);
            setSettlementMessage(`Could not complete this order: ${error.message}`);
        } finally {
            setIsSettling(false);
        }
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
                                <button type="button" onClick={() => { setTransferOrder(orderForTable(table)); setTargetTable(""); setTransferMessage(""); }} className="px-2 text-[10px] font-semibold text-[#f5f5f5] hover:bg-[#3a3a3a] sm:text-xs" aria-label={`Move order from table ${table}`} title="Move table order">Move</button>
                                <button type="button" onClick={() => { setSettleOrder(orderForTable(table)); setPaidAmount(""); }} className="rounded-r-[10px] bg-[#d3d3d3] px-2 text-[10px] font-semibold text-[#1a1a1a] hover:bg-white sm:px-3 sm:text-xs">Settle Bill</button>
                            </div>}
                        </div>
                    ))}
                </section>
            </div>
            {settleOrder && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><section role="dialog" aria-modal="true" aria-labelledby="settlement-title" className="w-full max-w-md rounded-[20px] bg-[#2a2a2a] p-5"><div className="flex items-center justify-between"><div><p className="text-sm uppercase tracking-[0.16em] text-[#ababab]">Settle table {settleOrder.orderDetails?.tableNumber}</p><h2 id="settlement-title" className="text-2xl font-semibold">Bill {settleOrder.orderNumber}</h2></div><button type="button" onClick={() => { setSettleOrder(null); setPaidAmount(""); setSettlementMessage(""); }} className="rounded-full p-2 text-xl text-[#ababab] hover:bg-[#3a3a3a]" aria-label="Close settlement">&times;</button></div><p className="mt-5 flex justify-between text-lg"><span>Total</span><strong>₹{Math.round(settleOrder.total)}</strong></p><label className="mt-5 grid gap-2 text-sm text-[#ababab]">Customer paid<input autoFocus type="text" inputMode="numeric" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value.replace(/\D/g, ""))} className="field" /></label><p className="mt-4 flex justify-between rounded-[10px] bg-[#1f1f1f] px-3 py-3"><span>Return to customer</span><strong>₹{Math.round(changeDue)}</strong></p>{settlementMessage && <p className="mt-3 text-sm text-[#ffb8a8]" role="alert">{settlementMessage}</p>}<div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3"><button type="button" onClick={() => { setSettleOrder(null); setPaidAmount(""); }} disabled={isSettling} className="rounded-[10px] border border-[#555] px-3 py-3 text-sm font-semibold text-[#f5f5f5] hover:bg-[#3a3a3a] disabled:opacity-50">Cancel</button><button type="button" onClick={() => void completeSettlement(false)} disabled={isSettling} className="rounded-[10px] bg-[#d3d3d3] px-3 py-3 text-sm font-semibold text-[#1a1a1a] disabled:opacity-50">{isSettling ? "Updating..." : "Complete"}</button><button type="button" onClick={() => void completeSettlement(true)} disabled={isSettling} className="rounded-[10px] bg-[#d3d3d3] px-3 py-3 text-sm font-semibold text-[#1a1a1a] disabled:opacity-50">{isSettling ? "Updating..." : "Save & Print"}</button></div></section></div>}
            {transferOrder && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><section role="dialog" aria-modal="true" aria-labelledby="transfer-title" className="w-full max-w-md rounded-[20px] bg-[#2a2a2a] p-5"><div className="flex items-center justify-between"><div><p className="text-sm uppercase tracking-[0.16em] text-[#ababab]">Table {transferOrder.orderDetails?.tableNumber}</p><h2 id="transfer-title" className="text-2xl font-semibold">Move KOT</h2></div><button type="button" onClick={() => setTransferOrder(null)} className="rounded-full p-2 text-xl text-[#ababab] hover:bg-[#3a3a3a]" aria-label="Close table transfer">&times;</button></div><label className="mt-5 grid gap-2 text-sm text-[#ababab]">Move to table<select value={targetTable} onChange={(event) => setTargetTable(event.target.value)} className="field"><option value="">Select an available table</option>{availableTransferTables.map((table) => <option key={table} value={table}>{table}</option>)}</select></label><p className="mt-3 text-sm text-[#ababab]">A short transfer slip will print before the existing order moves.</p>{transferMessage && <p className="mt-3 text-sm text-[#f7d78c]" role="alert">{transferMessage}</p>}<div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => setTransferOrder(null)} className="rounded-[10px] border border-[#555] px-3 py-3 text-sm font-semibold text-[#f5f5f5] hover:bg-[#3a3a3a]">Cancel</button><button type="button" onClick={moveTableOrder} disabled={!targetTable || isTransferring} className="rounded-[10px] bg-[#d3d3d3] px-3 py-3 text-sm font-semibold text-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-40">{isTransferring ? "Printing..." : "Print & Move"}</button></div></section></div>}
        </main>
    );
};

export default Tables