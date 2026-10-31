const CUSTOMER_NOTES_STORAGE_KEY = "pfl-customer-notes-v1";

export const normalizeCustomerPhone = (phone) => String(phone || "").replace(/\D/g, "");

export const getCustomerId = (phone) => {
    const phoneKey = normalizeCustomerPhone(phone);
    return phoneKey ? `phone:${phoneKey}` : "";
};

const readCustomerNotes = () => {
    try {
        const notes = JSON.parse(localStorage.getItem(CUSTOMER_NOTES_STORAGE_KEY));
        return notes && typeof notes === "object" ? notes : {};
    } catch {
        return {};
    }
};

const getBrowserCustomers = () => {
    const notes = readCustomerNotes();
    const customers = new Map();
    const showFinancial = getCurrentUserRole() === "Admin";
    let orders = [];
    try {
        const storedOrders = JSON.parse(localStorage.getItem("pfl-orders-v2"));
        orders = Array.isArray(storedOrders) ? storedOrders : [];
    } catch {
        orders = [];
    }

    for (const order of [...orders].sort((left, right) => new Date(left.createdAt || 0) - new Date(right.createdAt || 0))) {
        const customerId = getCustomerId(order.orderDetails?.phone) || order.customerId;
        if (!customerId) continue;

        const customer = customers.get(customerId) || {
            id: customerId,
            name: "",
            phone: "",
            address: "",
            notes: notes[customerId] || "",
            totalOrders: 0,
            lifetimeSpend: 0,
            lastOrderAt: "",
            orders: [],
        };
        customer.name = order.orderDetails?.customerName || customer.name;
        customer.phone = order.orderDetails?.phone || customer.phone;
        customer.address = order.orderDetails?.address || customer.address;
        if (!customer.lastOrderAt || new Date(order.createdAt || 0) > new Date(customer.lastOrderAt)) {
            customer.lastOrderAt = order.createdAt || "";
        }
        if (order.status === "completed") {
            customer.totalOrders += 1;
            customer.lifetimeSpend += Number(order.total || 0);
        }
        customer.orders.push({
            id: order.id,
            orderNumber: order.orderNumber || "",
            createdAt: order.createdAt || "",
            orderType: order.orderType || "",
            status: order.status || "",
            cart: (order.cart || []).map((item) => ({
                name: item.name || "",
                quantity: Number(item.quantity || 1),
                ...(showFinancial ? { price: Number(item.price || 0) } : {}),
            })),
            ...(showFinancial ? { total: Number(order.total || 0) } : {}),
        });
        customers.set(customerId, customer);
    }

    return [...customers.values()]
        .map((customer) => {
            const { lifetimeSpend, ...publicCustomer } = customer;
            return {
                ...(showFinancial ? customer : publicCustomer),
                orders: customer.orders.sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0)),
            };
        })
        .sort((left, right) => new Date(right.lastOrderAt || 0) - new Date(left.lastOrderAt || 0));
};

const getCurrentUserRole = () => {
    try {
        return JSON.parse(sessionStorage.getItem("pfl-auth-user"))?.role;
    } catch {
        return undefined;
    }
};

export const getCustomers = async () => window.pflDesktop?.getCustomers
    ? window.pflDesktop.getCustomers()
    : getBrowserCustomers();

export const getCustomerByPhone = async (phone) => {
    const phoneKey = normalizeCustomerPhone(phone);
    if (!/^\d{10}$/.test(phoneKey)) return null;
    if (window.pflDesktop?.getCustomerByPhone) {
        return window.pflDesktop.getCustomerByPhone(phoneKey);
    }

    const customer = (await getBrowserCustomers()).find((candidate) =>
        normalizeCustomerPhone(candidate.phone) === phoneKey,
    );
    return customer
        ? { id: customer.id, name: customer.name, phone: customer.phone, address: customer.address }
        : null;
};

export const saveCustomerNotes = async (customerId, notes) => {
    if (typeof notes !== "string" || notes.length > 3000) {
        throw new Error("Customer notes must be 3000 characters or fewer.");
    }
    if (window.pflDesktop?.saveCustomerNotes) {
        await window.pflDesktop.saveCustomerNotes({ customerId, notes });
    } else {
        const nextNotes = readCustomerNotes();
        nextNotes[customerId] = notes;
        localStorage.setItem(CUSTOMER_NOTES_STORAGE_KEY, JSON.stringify(nextNotes));
    }
    window.dispatchEvent(new Event("pfl-customers-updated"));
};
