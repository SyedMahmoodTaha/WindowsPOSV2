import { useEffect, useMemo, useState } from "react";
import { FaArrowLeft, FaMagnifyingGlass, FaPhone, FaUserGroup } from "react-icons/fa6";
import { Link } from "react-router-dom";
import { getCurrentUser } from "../utils/auth";
import { getCustomers, saveCustomerNotes } from "../utils/customers";

const formatCurrency = (amount) => new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
}).format(Math.round(Number(amount) || 0));

const formatDate = (value) => {
    if (!value) return "No orders yet";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
};

const Customers = () => {
    const user = getCurrentUser();
    const isAdmin = user?.role === "Admin";
    const [customers, setCustomers] = useState([]);
    const [selectedId, setSelectedId] = useState("");
    const [search, setSearch] = useState("");
    const [notesDraft, setNotesDraft] = useState("");
    const [message, setMessage] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        let isMounted = true;
        const loadCustomers = async () => {
            try {
                const nextCustomers = await getCustomers();
                if (!isMounted) return;
                setCustomers(nextCustomers);
                setSelectedId((current) => current || nextCustomers[0]?.id || "");
            } catch (error) {
                if (isMounted) setMessage(`Could not load customers: ${error.message}`);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };
        void loadCustomers();
        const refresh = () => void loadCustomers();
        window.addEventListener("pfl-orders-updated", refresh);
        window.addEventListener("pfl-customers-updated", refresh);
        return () => {
            isMounted = false;
            window.removeEventListener("pfl-orders-updated", refresh);
            window.removeEventListener("pfl-customers-updated", refresh);
        };
    }, []);

    const searchTerm = search.trim().toLowerCase();
    const filteredCustomers = useMemo(() => customers.filter((customer) =>
        `${customer.name} ${customer.phone} ${customer.address}`.toLowerCase().includes(searchTerm),
    ), [customers, searchTerm]);
    const selectedCustomer = customers.find((customer) => customer.id === selectedId);
    const repeatCustomers = customers.filter((customer) => customer.totalOrders > 1).length;

    useEffect(() => {
        setNotesDraft(selectedCustomer?.notes || "");
        setMessage("");
    }, [selectedCustomer?.id, selectedCustomer?.notes]);

    const saveNotes = async (event) => {
        event.preventDefault();
        if (!selectedCustomer) return;
        setIsSaving(true);
        setMessage("");
        try {
            await saveCustomerNotes(selectedCustomer.id, notesDraft);
            setCustomers((current) => current.map((customer) =>
                customer.id === selectedCustomer.id ? { ...customer, notes: notesDraft } : customer,
            ));
            setMessage("Customer notes saved");
        } catch (error) {
            setMessage(`Could not save notes: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <main className="min-h-screen bg-[#1f1f1f] px-4 py-6 text-[#f5f5f5] sm:px-6">
            <div className="mx-auto max-w-7xl">
                <header className="mb-6 flex items-center gap-4">
                    <Link to="/" className="rounded-full p-3 text-[#d3d3d3] transition-colors hover:bg-[#d3d3d3] hover:text-[#1a1a1a]" aria-label="Back to home">
                        <FaArrowLeft />
                    </Link>
                    <div>
                        <p className="text-sm uppercase tracking-[0.2em] text-[#ababab]">Customer relationship management</p>
                        <h1 className="text-3xl font-semibold">Customers</h1>
                    </div>
                </header>

                <section className="mb-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[16px] bg-[#2a2a2a] p-4">
                        <p className="text-xs uppercase tracking-[0.14em] text-[#ababab]">Customer profiles</p>
                        <p className="mt-1 text-2xl font-semibold">{customers.length}</p>
                    </div>
                    <div className="rounded-[16px] bg-[#2a2a2a] p-4">
                        <p className="text-xs uppercase tracking-[0.14em] text-[#ababab]">Repeat customers</p>
                        <p className="mt-1 text-2xl font-semibold">{repeatCustomers}</p>
                    </div>
                </section>

                <section className="grid gap-5 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.5fr)]">
                    <div className="rounded-[20px] bg-[#2a2a2a] p-4">
                        <label className="mb-4 flex items-center gap-2 rounded-[10px] border border-[#444] bg-[#1f1f1f] px-3 py-2 text-[#ababab]">
                            <FaMagnifyingGlass />
                            <input
                                type="search"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search name, phone, or address"
                                aria-label="Search customers"
                                className="w-full bg-transparent text-sm text-[#f5f5f5] outline-none placeholder:text-[#777]"
                            />
                        </label>
                        {isLoading ? (
                            <p className="p-5 text-center text-sm text-[#ababab]">Loading customers…</p>
                        ) : filteredCustomers.length ? (
                            <div className="max-h-[65vh] space-y-2 overflow-y-auto">
                                {filteredCustomers.map((customer) => (
                                    <button
                                        key={customer.id}
                                        type="button"
                                        onClick={() => setSelectedId(customer.id)}
                                        className={`w-full rounded-[12px] p-3 text-left transition-colors ${selectedId === customer.id ? "bg-[#444]" : "bg-[#333] hover:bg-[#3a3a3a]"}`}
                                    >
                                        <span className="block truncate font-semibold">{customer.name || "Customer"}</span>
                                        <span className="mt-1 block text-sm text-[#ababab]">{customer.phone}</span>
                                        <span className="mt-1 block text-xs text-[#ababab]">{customer.totalOrders} completed {customer.totalOrders === 1 ? "order" : "orders"}</span>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="p-6 text-center text-sm text-[#ababab]">
                                <FaUserGroup className="mx-auto mb-2 size-6" />
                                <p>{searchTerm ? "No customers match this search." : "Customer profiles will be created automatically when orders include a phone number."}</p>
                            </div>
                        )}
                    </div>

                    <div className="min-w-0 rounded-[20px] bg-[#2a2a2a] p-5">
                        {selectedCustomer ? (
                            <>
                                <div className="flex flex-col justify-between gap-4 border-b border-[#444] pb-4 sm:flex-row sm:items-start">
                                    <div className="min-w-0">
                                        <p className="text-xs uppercase tracking-[0.14em] text-[#ababab]">Customer profile</p>
                                        <h2 className="mt-1 truncate text-2xl font-semibold">{selectedCustomer.name || "Customer"}</h2>
                                        {selectedCustomer.phone && (
                                            <a href={`tel:${selectedCustomer.phone}`} className="mt-2 inline-flex items-center gap-2 text-sm text-[#d3d3d3] hover:text-white">
                                                <FaPhone /> {selectedCustomer.phone}
                                            </a>
                                        )}
                                        {selectedCustomer.address && <p className="mt-2 text-sm text-[#ababab]">{selectedCustomer.address}</p>}
                                    </div>
                                    <div className="flex gap-5 text-sm">
                                        <div><p className="text-xs text-[#ababab]">Completed orders</p><p className="mt-1 font-semibold">{selectedCustomer.totalOrders}</p></div>
                                        {isAdmin && <div><p className="text-xs text-[#ababab]">Lifetime spend</p><p className="mt-1 font-semibold">{formatCurrency(selectedCustomer.lifetimeSpend)}</p></div>}
                                    </div>
                                </div>

                                <form onSubmit={saveNotes} className="border-b border-[#444] py-4">
                                    <label className="grid gap-2 text-sm font-medium text-[#ababab]">
                                        Customer notes
                                        <textarea
                                            value={notesDraft}
                                            maxLength={3000}
                                            onChange={(event) => setNotesDraft(event.target.value)}
                                            placeholder="Preferences, allergy reminders, or other service notes"
                                            rows={3}
                                            className="resize-y rounded-[10px] border border-[#444] bg-[#1f1f1f] px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#d3d3d3]"
                                        />
                                    </label>
                                    <div className="mt-2 flex items-center justify-between gap-3">
                                        <p className="text-xs text-[#888]">{notesDraft.length}/3000</p>
                                        <button type="submit" disabled={isSaving || notesDraft === (selectedCustomer.notes || "")} className="rounded-[9px] bg-[#d3d3d3] px-4 py-2 text-sm font-semibold text-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-50">
                                            {isSaving ? "Saving…" : "Save notes"}
                                        </button>
                                    </div>
                                </form>

                                <div className="pt-4">
                                    <div className="mb-3 flex items-center justify-between gap-2">
                                        <h3 className="font-semibold">Order history</h3>
                                        <p className="text-xs text-[#ababab]">Last visit: {formatDate(selectedCustomer.lastOrderAt)}</p>
                                    </div>
                                    {selectedCustomer.orders.length ? (
                                        <div className="max-h-[42vh] space-y-3 overflow-y-auto">
                                            {selectedCustomer.orders.map((order) => (
                                                <article key={order.id} className="rounded-[12px] bg-[#333] p-3">
                                                    <div className="flex flex-wrap justify-between gap-2">
                                                        <p className="font-medium">Order #{order.orderNumber || order.id}</p>
                                                        <p className="text-xs text-[#ababab]">{formatDate(order.createdAt)}</p>
                                                    </div>
                                                    <p className="mt-1 text-xs capitalize text-[#ababab]">{order.orderType} · {order.status}</p>
                                                    <ul className="mt-2 space-y-1 text-sm">
                                                        {order.cart.map((item, index) => (
                                                            <li key={`${item.name}-${index}`} className="flex justify-between gap-3">
                                                                <span>{item.quantity} × {item.name}</span>
                                                                {isAdmin && <span className="shrink-0">{formatCurrency(item.price * item.quantity)}</span>}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                    {isAdmin && order.total !== undefined && <p className="mt-2 border-t border-[#4a4a4a] pt-2 text-right text-sm font-semibold">Total {formatCurrency(order.total)}</p>}
                                                </article>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="rounded-[12px] bg-[#333] p-5 text-center text-sm text-[#ababab]">No order history is available for this customer yet.</p>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="flex min-h-64 flex-col items-center justify-center text-center text-[#ababab]">
                                <FaUserGroup className="mb-3 size-8" />
                                <p>Select a customer to view their profile and order history.</p>
                            </div>
                        )}
                    </div>
                </section>
                {message && <p role="status" className="mt-4 text-sm text-[#a7d7a7]">{message}</p>}
            </div>
        </main>
    );
};

export default Customers;
