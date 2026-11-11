import { useEffect, useMemo, useRef, useState } from "react";
import { FaArrowLeft, FaChevronDown, FaChevronUp, FaClockRotateLeft, FaMinus, FaPlus, FaTrashCan } from "react-icons/fa6";
import { FaRegStickyNote } from "react-icons/fa";
import { MdOutlineTableBar } from "react-icons/md";
import { FaShoppingCart } from "react-icons/fa";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { appendOrder, getNextBillNumber, getNextTokenNumber, printOrder, readOrders, updateOrder } from "../utils/orderStorage";
import { readCatalog, readCatalogAsync, readTables, readTablesAsync } from "../utils/catalog";
import { getCustomerByPhone, getCustomerId, normalizeCustomerPhone } from "../utils/customers";
import { createDeliveryDispatch, getFrequentlyUsedItems, ORDER_SCHEMA_VERSION } from "../utils/orderModel";
const orderCharges = { Parcel: "", Takeaway: "", Delivery: "" };

const formatCurrency = (amount) => new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
}).format(amount);

const toPaise = (value) => Math.round((Number(value) || 0) * 100);

const orderTypeFields = {
    Table: [
        { name: "tableNumber", label: "Table number", placeholder: "e.g. R1, L2, F1" },
    ],
    Parcel: [
        { name: "customerName", label: "Name", placeholder: "Enter customer name" },
        { name: "phone", label: "Phone number", placeholder: "Enter phone number" },
    ],
    Takeaway: [
        { name: "customerName", label: "Name", placeholder: "Enter customer name" },
        { name: "phone", label: "Phone number", placeholder: "Enter phone number" },
    ],
    Delivery: [
        { name: "customerName", label: "Name", placeholder: "Enter customer name" },
        { name: "phone", label: "Phone number", placeholder: "Enter phone number" },
        { name: "address", label: "Address", placeholder: "Enter delivery address", multiline: true },
    ],
};

const getOrderDetailsForType = (type, details = {}) => Object.fromEntries(
    (orderTypeFields[type] || [])
        .map(({ name }) => [name, details[name]])
        .filter(([, value]) => value !== undefined && value !== null && value !== ""),
);

const getCartProductId = (item) => {
    if (item.productId !== undefined && item.productId !== null) return String(item.productId);
    const itemId = String(item.id ?? "");
    return itemId.includes(":") ? itemId.slice(0, itemId.indexOf(":")) : itemId;
};

const getCartProductValue = (item) => {
    if (item.productId !== undefined && item.productId !== null) return item.productId;
    if (typeof item.id === "number") return item.id;
    const itemId = String(item.id ?? "");
    return itemId.includes(":") ? itemId.slice(0, itemId.indexOf(":")) : item.id;
};

const getCartVariationName = (item) => {
    if (item.variationName) return String(item.variationName);
    const itemId = String(item.id ?? "");
    const separator = itemId.indexOf(":");
    if (separator < 0) return "";
    const legacyVariation = itemId.slice(separator + 1);
    return legacyVariation === "base" ? "" : legacyVariation;
};

const NewOrder = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [cart, setCart] = useState([]);
    const [catalog, setCatalog] = useState(readCatalog);
    const [orderHistory, setOrderHistory] = useState(readOrders);
    const [selectedCategory, setSelectedCategory] = useState("Favourites");
    const [orderType, setOrderType] = useState("");
    const [orderTypeError, setOrderTypeError] = useState("");
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [summaryOpen, setSummaryOpen] = useState(false);
    const [orderDetails, setOrderDetails] = useState({});
    const [shortcutCode, setShortcutCode] = useState("");
    const [shortcutError, setShortcutError] = useState("");
    const [charges, setCharges] = useState(orderCharges);
    const [prepaidCash, setPrepaidCash] = useState("");
    const [prepaidOnline, setPrepaidOnline] = useState("");
    const [paymentError, setPaymentError] = useState("");
    const [menuSearch, setMenuSearch] = useState("");
    const [heldOrders, setHeldOrders] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem("pfl-held-orders")) || [];
        } catch {
            return [];
        }
    });
    const [activeHeldOrderId, setActiveHeldOrderId] = useState(null);
    const [holdDrawerOpen, setHoldDrawerOpen] = useState(false);
    const [orderNote, setOrderNote] = useState("");
    const [noteModal, setNoteModal] = useState(null);
    const [noteDraft, setNoteDraft] = useState("");
    const [variationItem, setVariationItem] = useState(null);
    const [tableCollision, setTableCollision] = useState(null);
    const [isEditingExistingOrder, setIsEditingExistingOrder] = useState(false);
    const [customerLookupMessage, setCustomerLookupMessage] = useState("");
    const existingOrderRef = useRef(null);
    const originalCartRef = useRef([]);
    const autoFilledCustomerRef = useRef(null);
    const orderListRef = useRef(null);
    const menuItems = catalog.menuItems;
    const categories = [
        "Favourites",
        "Frequently Used",
        ...catalog.categories.filter((category) => !["favourites", "favorites", "frequently used"].includes(String(category).toLowerCase())),
    ];
    const frequentlyUsedItems = useMemo(
        () => getFrequentlyUsedItems(menuItems, orderHistory),
        [menuItems, orderHistory],
    );
    const itemByCode = new Map(menuItems.filter((item) => String(item.code || "").trim()).map((item) => [String(item.code).trim(), item]));

    useEffect(() => {
        readCatalogAsync().then(setCatalog);
    }, []);

    useEffect(() => {
        const refreshOrderHistory = () => setOrderHistory(readOrders());
        window.addEventListener("pfl-orders-updated", refreshOrderHistory);
        return () => window.removeEventListener("pfl-orders-updated", refreshOrderHistory);
    }, []);

    useEffect(() => {
        const phone = normalizeCustomerPhone(orderDetails.phone);
        if (phone.length !== 10 || !["Parcel", "Takeaway", "Delivery"].includes(orderType)) {
            setCustomerLookupMessage("");
            return undefined;
        }

        let isCurrentLookup = true;
        setCustomerLookupMessage("Looking up saved customer...");
        getCustomerByPhone(phone).then((customer) => {
            if (!isCurrentLookup) return;
            if (!customer) {
                setCustomerLookupMessage("No saved customer found");
                return;
            }

            setOrderDetails((currentDetails) => {
                if (normalizeCustomerPhone(currentDetails.phone) !== phone) return currentDetails;
                const nextDetails = { ...currentDetails };
                const filledValues = {};
                for (const field of ["customerName", "address"]) {
                    const value = String(customer[field] || "").trim();
                    if (value && !String(currentDetails[field] || "").trim()) {
                        nextDetails[field] = value;
                        filledValues[field] = value;
                    }
                }
                if (Object.keys(filledValues).length) {
                    autoFilledCustomerRef.current = { phone, values: filledValues };
                }
                return nextDetails;
            });
            setCustomerLookupMessage("Saved customer details found");
        }).catch((error) => {
            if (!isCurrentLookup) return;
            console.error("Could not look up saved customer details", error);
            setCustomerLookupMessage("Could not look up saved customer details");
        });

        return () => {
            isCurrentLookup = false;
        };
    }, [orderDetails.phone, orderType]);

    useEffect(() => {
        const existingOrder = location.state?.existingOrder;
        if (existingOrder && existingOrderRef.current?.id !== existingOrder.id) {
            existingOrderRef.current = existingOrder;
            setIsEditingExistingOrder(true);
            originalCartRef.current = existingOrder.cart.map((item) => ({ ...item }));
            setCart(existingOrder.cart);
            const existingOrderType = existingOrder.orderType === "Unassigned" ? "" : existingOrder.orderType;
            setOrderType(existingOrderType);
            setOrderDetails(getOrderDetailsForType(existingOrderType, existingOrder.orderDetails || {}));
            setCharges(existingOrder.charges || orderCharges);
            setPrepaidCash(existingOrder.deliveryPayment?.prepaidCashPaise
                ? (existingOrder.deliveryPayment.prepaidCashPaise / 100).toFixed(2)
                : "");
            setPrepaidOnline(existingOrder.deliveryPayment?.prepaidOnlinePaise
                ? (existingOrder.deliveryPayment.prepaidOnlinePaise / 100).toFixed(2)
                : "");
            setOrderNote(existingOrder.orderNote || "");
        }

        const selectedMenuItem = location.state?.selectedMenuItem;
        if (selectedMenuItem) {
            const selectedCategoryName = selectedMenuItem.category || "All";
            setSelectedCategory(selectedCategoryName);
            if (selectedMenuItem.variations?.length) {
                setVariationItem(selectedMenuItem);
            } else {
                addToCart(selectedMenuItem);
            }
        }

        const tableNumber = location.state?.tableNumber;
        if (!tableNumber) return;
        setOrderType("Table");
        setOrderDetails({ tableNumber });
        if (!location.state?.existingOrder) {
            const runningOrder = readOrders().find((order) => order.orderType === "Table" && order.status !== "completed" && order.orderDetails?.tableNumber === tableNumber);
            if (runningOrder) setTableCollision(runningOrder);
        }
        window.history.replaceState({}, document.title);
    }, [location.state]);

    useEffect(() => {
        localStorage.setItem("pfl-held-orders", JSON.stringify(heldOrders));
    }, [heldOrders]);

    useEffect(() => {
        if (cart.length > 0) {
            orderListRef.current?.scrollTo({ top: orderListRef.current.scrollHeight, behavior: "smooth" });
        }
    }, [cart.length]);

    useEffect(() => {
        const refreshCatalog = () => readCatalogAsync().then(setCatalog);
        window.addEventListener("pfl-catalog-updated", refreshCatalog);
        return () => window.removeEventListener("pfl-catalog-updated", refreshCatalog);
    }, []);

    const addToCart = (menuItem, variation = null) => {
        const selectedVariationName = String(variation?.name || menuItem.variationName || getCartVariationName(menuItem));
        const productId = getCartProductValue(menuItem);
        const cartId = `${productId}:${selectedVariationName || "base"}`;
        const cartItem = {
            ...menuItem,
            ...(variation ? {
                name: `${menuItem.name} - ${variation.name}`,
                price: variation.price,
            } : {}),
            ...(selectedVariationName ? { variationName: selectedVariationName } : {}),
            productId,
            id: cartId,
            quantity: 1,
            note: "",
        };
        setCart((currentCart) => {
            const existingItem = currentCart.find((item) => (
                getCartProductId(item) === String(productId)
                && getCartVariationName(item) === selectedVariationName
                && Number(item.price) === Number(cartItem.price)
                && !String(item.note || "").trim()
            ));
            if (existingItem) {
                return currentCart.map((item) => item.id === existingItem.id
                    ? { ...item, quantity: item.quantity + 1 }
                    : item);
            }
            const matchingLineCount = currentCart.filter((item) => (
                String(item.id) === cartId || String(item.id).startsWith(`${cartId}:line:`)
            )).length;
            const uniqueId = matchingLineCount > 0
                ? `${cartId}:line:${matchingLineCount + 1}`
                : cartId;
            return [...currentCart, { ...cartItem, id: uniqueId }];
        });
    };

    const selectMenuItem = (menuItem) => {
        if (menuItem.variations?.length) setVariationItem(menuItem);
        else addToCart(menuItem);
    };

    const updateQuantity = (itemId, change) => {
        setCart((currentCart) => currentCart
            .map((item) => item.id === itemId
                ? { ...item, quantity: item.quantity + change }
                : item)
            .filter((item) => item.quantity > 0));
    };

    const setItemQuantity = (itemId, value) => {
        const quantity = Number.parseInt(value, 10);
        setCart((currentCart) => currentCart
            .map((item) => item.id === itemId
                ? { ...item, quantity: Number.isNaN(quantity) ? 0 : Math.max(0, quantity) }
                : item)
            .filter((item) => item.quantity > 0));
    };

    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const selectedQuantityByProduct = cart.reduce((quantities, item) => {
        const productId = getCartProductId(item);
        if (productId) quantities.set(productId, (quantities.get(productId) || 0) + Number(item.quantity || 0));
        return quantities;
    }, new Map());
    const charge = Number.parseFloat(charges[orderType]) || 0;
    const total = subtotal + charge;
    const visibleItems = selectedCategory === "Favourites"
        ? menuItems.filter((item) => item.favorite)
        : selectedCategory === "Frequently Used"
            ? frequentlyUsedItems
            : selectedCategory === "All"
                ? menuItems
                : menuItems.filter((item) => item.category === selectedCategory);
    const currentOrderFields = orderType ? orderTypeFields[orderType] : [];
    const searchTerm = menuSearch.toLowerCase().trim();
    const filteredItems = (searchTerm ? menuItems : visibleItems).filter((item) => item.name.toLowerCase().includes(searchTerm));
    const canPrint = Boolean(orderType);

    const handleDetailChange = (event) => {
        const { name, value } = event.target;
        setOrderDetails((currentDetails) => ({ ...currentDetails, [name]: value }));
    };

    const handleTableNumberChange = (event) => {
        const tableNumber = event.target.value;
        setOrderDetails((currentDetails) => ({ ...currentDetails, tableNumber }));
        setTableCollision(null);
        if (!tableNumber.trim() || existingOrderRef.current?.orderDetails?.tableNumber === tableNumber.trim()) return;
        const runningOrder = readOrders().find((order) => order.orderType === "Table" && order.status !== "completed" && order.orderDetails?.tableNumber === tableNumber.trim());
        if (runningOrder) setTableCollision(runningOrder);
    };

    const handlePhoneChange = (event) => {
        const phone = event.target.value.replace(/\D/g, "").slice(0, 10);
        const autoFilledCustomer = autoFilledCustomerRef.current;
        setOrderDetails((currentDetails) => {
            const nextDetails = { ...currentDetails, phone };
            if (autoFilledCustomer && normalizeCustomerPhone(phone) !== autoFilledCustomer.phone) {
                for (const [field, value] of Object.entries(autoFilledCustomer.values)) {
                    if (currentDetails[field] === value) nextDetails[field] = "";
                }
            }
            return nextDetails;
        });
        if (autoFilledCustomer && normalizeCustomerPhone(phone) !== autoFilledCustomer.phone) {
            autoFilledCustomerRef.current = null;
        }
    };

    const handleShortcutSubmit = (event) => {
        if (event.key !== "Enter") return;

        const item = itemByCode.get(shortcutCode.trim());
        if (!item) {
            setShortcutError("Code not found");
            return;
        }

        selectMenuItem(item);
        setShortcutCode("");
        setShortcutError("");
    };

    const handleChargeChange = (event) => {
        const value = event.target.value;
        setCharges((currentCharges) => ({
            ...currentCharges,
            [orderType]: value,
        }));
    };

    const changeOrderType = (type) => {
        setOrderType(type);
        setOrderTypeError("");
        setPaymentError("");
        if (type !== "Delivery") {
            setPrepaidCash("");
            setPrepaidOnline("");
        }
        setOrderDetails(getOrderDetailsForType(type, orderDetails));
        setCharges(orderCharges);
        setDetailsOpen(false);
        setSummaryOpen(false);
    };

    const toggleOrderType = (type) => {
        const isSameType = orderType === type || (type === "Parcel" && orderType === "Takeaway");
        changeOrderType(isSameType ? "" : type);
    };

    const holdCurrentOrder = () => {
        if (cart.length === 0 && !existingOrderRef.current) return;

        const heldOrder = {
            id: activeHeldOrderId || Date.now(),
            cart,
            orderType,
            orderDetails: getOrderDetailsForType(orderType, orderDetails),
            charges,
            prepaidCash,
            prepaidOnline,
            total,
            orderNote,
            label: orderType || "Unassigned order",
        };
        setHeldOrders((currentOrders) => activeHeldOrderId
            ? currentOrders.map((order) => order.id === activeHeldOrderId ? heldOrder : order)
            : [...currentOrders, heldOrder]);
        setCart([]);
        setOrderType("");
        setOrderDetails({});
        setOrderNote("");
        setCharges(orderCharges);
        setPrepaidCash("");
        setPrepaidOnline("");
        setPaymentError("");
        setDetailsOpen(false);
        setActiveHeldOrderId(null);
        setIsEditingExistingOrder(false);
    };

    const restoreHeldOrder = (heldOrder) => {
        setCart(heldOrder.cart);
        setOrderType(heldOrder.orderType);
        setOrderDetails(heldOrder.orderDetails);
        setOrderNote(heldOrder.orderNote || "");
        setCharges(heldOrder.charges);
        setPrepaidCash(heldOrder.prepaidCash || "");
        setPrepaidOnline(heldOrder.prepaidOnline || "");
        setDetailsOpen(false);
        setActiveHeldOrderId(heldOrder.id);
        setHoldDrawerOpen(false);
    };

    const saveNote = () => {
        if (noteModal?.type === "order") {
            setOrderNote(noteDraft);
        } else if (noteModal?.type === "item") {
            setCart((currentCart) => currentCart.map((item) => item.id === noteModal.itemId
                ? { ...item, note: noteDraft }
                : item));
        }
        setNoteModal(null);
    };

    const openOrderNote = () => {
        setNoteDraft(orderNote);
        setNoteModal({ type: "order" });
    };
    
    const clearOrder = () => {
        setCart([]);
    };

    const resetOrder = () => {
        setCart([]);
        setOrderType("");
        setOrderDetails({});
        setOrderNote("");
        setCharges(orderCharges);
        setPrepaidCash("");
        setPrepaidOnline("");
        setPaymentError("");
        setDetailsOpen(false);
        setSummaryOpen(false);
        setActiveHeldOrderId(null);
    };

    const holdCollisionOrder = () => {
        if (cart.length === 0) return;

        const heldOrder = {
            id: Date.now(),
            cart,
            orderType: "Table",
            orderDetails,
            charges,
            total,
            orderNote,
            label: `Table ${orderDetails.tableNumber}`,
        };
        const nextHeldOrders = [...heldOrders, heldOrder];
        localStorage.setItem("pfl-held-orders", JSON.stringify(nextHeldOrders));
        setHeldOrders(nextHeldOrders);
        navigate("/Tables", { state: { from: "/new-order", settleOrderId: tableCollision.id } });
    };

    const changedItems = () => {
        const originalItems = new Map(originalCartRef.current.map((item) => [item.id, item]));
        return cart.flatMap((item) => {
            const originalItem = originalItems.get(item.id);
            if (!originalItem) return [item];
            const quantityAdded = item.quantity - originalItem.quantity;
            const itemChanged = item.name !== originalItem.name || item.price !== originalItem.price || item.note !== originalItem.note;
            if (quantityAdded > 0) return [{ ...item, quantity: quantityAdded }];
            if (quantityAdded === 0 && itemChanged) return [item];
            return [];
        });
    };

    const removedItems = () => {
        const currentItems = new Map(cart.map((item) => [item.id, item]));
        return originalCartRef.current.flatMap((item) => {
            const currentItem = currentItems.get(item.id);
            const removedQuantity = Number(item.quantity || 0) - Number(currentItem?.quantity || 0);
            return removedQuantity > 0 ? [{ ...item, quantity: removedQuantity }] : [];
        });
    };

    const completeOrder = (status, destination = null) => {
        if (cart.length === 0 && !existingOrderRef.current) return;
        if (!orderType) {
            setOrderTypeError("Choose Table, Parcel / Takeaway, or Delivery before saving or sending a KOT.");
            return;
        }
        const prepaidCashPaise = toPaise(prepaidCash);
        const prepaidOnlinePaise = toPaise(prepaidOnline);
        if (orderType === "Delivery" && (prepaidCashPaise < 0 || prepaidOnlinePaise < 0
            || prepaidCashPaise + prepaidOnlinePaise > toPaise(total))) {
            setPaymentError("Payment received before delivery cannot be more than the order total.");
            setSummaryOpen(true);
            return;
        }
        setPaymentError("");

        const order = {
            ...(existingOrderRef.current || {}),
            schemaVersion: ORDER_SCHEMA_VERSION,
            id: existingOrderRef.current?.id || Date.now(),
            orderNumber: existingOrderRef.current?.orderNumber || getNextBillNumber(),
            tokenNumber: existingOrderRef.current?.tokenNumber || getNextTokenNumber(),
            cart,
            orderType,
            orderDetails,
            ...(getCustomerId(orderDetails.phone) ? { customerId: getCustomerId(orderDetails.phone) } : {}),
            ...(orderType === "Delivery" ? {
                deliveryDispatch: createDeliveryDispatch(existingOrderRef.current?.deliveryDispatch),
                deliveryPayment: {
                    prepaidCashPaise,
                    prepaidOnlinePaise,
                },
            } : {}),
            temporaryTable: orderType === "Table" && Boolean(orderDetails.tableNumber) && !readTablesAsync
                ? false
                : !readTables().includes(orderDetails.tableNumber),
            charges,
            subtotal,
            total,
            orderNote,
            status,
            destination,
            createdAt: new Date().toISOString(),
        };

        if (existingOrderRef.current) {
            updateOrder(order.id, order);
            const itemsToPrint = changedItems();
            const itemsRemoved = removedItems();
            if (destination === "kitchen" && itemsRemoved.length > 0) {
                const removalSlip = {
                    ...order,
                    cart: itemsRemoved,
                    kotAction: "cancel-items",
                };
                void (async () => {
                    await printOrder(removalSlip, "kitchen");
                    if (itemsToPrint.length > 0) {
                        const changedSubtotal = itemsToPrint.reduce((sum, item) => sum + item.price * item.quantity, 0);
                        await printOrder({ ...order, cart: itemsToPrint, subtotal: changedSubtotal, total: changedSubtotal }, destination);
                    }
                })();
            } else if (destination && itemsToPrint.length > 0) {
                const changedSubtotal = itemsToPrint.reduce((sum, item) => sum + item.price * item.quantity, 0);
                printOrder({ ...order, cart: itemsToPrint, subtotal: changedSubtotal, total: changedSubtotal }, destination);
            }
        } else {
            appendOrder(order);
            if (destination) printOrder(order, destination);
        }

        if (activeHeldOrderId) {
            setHeldOrders((currentOrders) => currentOrders.filter((heldOrder) => heldOrder.id !== activeHeldOrderId));
        }
        resetOrder();
    };

    const openItemNote = (item) => {
        setNoteDraft(item.note || "");
        setNoteModal({ type: "item", itemId: item.id });
    };

    const noteItem = noteModal?.type === "item"
        ? cart.find((item) => item.id === noteModal.itemId)
        : null;

    const discardHeldOrder = (heldOrderId) => {
        setHeldOrders((currentOrders) => currentOrders.filter((order) => order.id !== heldOrderId));
        if (activeHeldOrderId === heldOrderId) setActiveHeldOrderId(null);
    };

    const removeHeldOrder = (heldOrderId) => {
        setHeldOrders((currentOrders) => currentOrders.filter((order) => order.id !== heldOrderId));
        if (activeHeldOrderId === heldOrderId) setActiveHeldOrderId(null);
    };

    const renderCategoryButton = (category) => (
        <button
            key={category}
            type="button"
            onClick={() => setSelectedCategory(category)}
            className={`rounded-[14px] px-4 py-3 text-left text-sm font-medium transition-colors ${selectedCategory === category
                ? "bg-[#d3d3d3] text-[#1a1a1a]"
                : "text-[#ababab] hover:bg-[#3a3a3a] hover:text-[#f5f5f5]"}`}
        >
            {category}
        </button>
    );

    return (
        <main className="h-screen overflow-hidden bg-[#1f1f1f] px-4 py-6 text-[#f5f5f5] sm:px-6">
            <div className="mx-auto flex h-full w-full flex-col">
                <div className="mb-6 flex items-center gap-4">
                    <Link to={location.state?.from || "/"} className="rounded-full p-3 text-[#d3d3d3] transition-colors hover:bg-[#d3d3d3] hover:text-[#1a1a1a]" aria-label={`Back to ${location.state?.from === "/Tables" ? "tables" : "home"}`}>
                        <FaArrowLeft />
                    </Link>
                    <div className="flex-1">
                        <p className="text-sm uppercase tracking-[0.2em] text-[#ababab]">Point of sale</p>
                        <h1 className="text-3xl font-semibold">New Order</h1>
                    </div>
                    <Link
                        to="/Tables"
                        state={{ from: "/new-order" }}
                        className="flex items-center gap-2 rounded-[12px] border border-[#444444] bg-[#2a2a2a] px-4 py-3 text-sm font-medium text-[#d3d3d3] transition-colors hover:bg-[#d3d3d3] hover:text-[#1a1a1a]"
                    >
                        <MdOutlineTableBar className="size-4" />
                        Tables
                    </Link>
                    <button
                        type="button"
                        onClick={() => setHoldDrawerOpen(true)}
                        className="flex items-center gap-2 rounded-[12px] border border-[#444444] bg-[#2a2a2a] px-4 py-3 text-sm font-medium text-[#d3d3d3] transition-colors hover:bg-[#d3d3d3] hover:text-[#1a1a1a]"
                    >
                        <FaClockRotateLeft className="size-4" />
                        Hold
                        {heldOrders.length > 0 && <span className="rounded-full bg-[#d3d3d3] px-2 py-0.5 text-xs text-[#1a1a1a]">{heldOrders.length}</span>}
                    </button>
                </div>

                <div className="grid min-h-0 flex-1 gap-6 overflow-hidden lg:grid-cols-[6fr_4fr]">
                    <section className="grid min-h-0 overflow-hidden rounded-[24px] bg-[#2a2a2a] p-4 shadow-lg lg:grid-cols-[2fr_5fr]">
                    <aside className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden">
                        <h2 className="mb-4 text-xl font-semibold">Categories</h2>
                        <div className="grid grid-cols-2 gap-2 pb-2 lg:grid-cols-1">
                            {categories.slice(0, 2).map(renderCategoryButton)}
                        </div>
                        <div className="grid min-h-0 grid-cols-2 content-start gap-2 overflow-y-auto lg:grid-cols-1">
                            {categories.slice(2).map(renderCategoryButton)}
                        </div>
                    </aside>

                    <section className="scrollbar-hide min-h-0 overflow-y-auto lg:pl-4">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <h2 className="text-xl font-semibold">Menu</h2>
                            <input
                                type="search"
                                value={menuSearch}
                                onChange={(event) => setMenuSearch(event.target.value)}
                                placeholder="Search by name"
                                aria-label="Search menu by name"
                                className="min-w-0 flex-1 rounded-[10px] border border-[#444444] bg-[#1f1f1f] px-3 py-2 text-sm text-[#f5f5f5] outline-none placeholder:text-[#777777] focus:border-[#d3d3d3]"
                            />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {filteredItems.length === 0 && selectedCategory === "Frequently Used" && !searchTerm && (
                                <p className="col-span-full rounded-[12px] bg-[#1f1f1f] p-4 text-sm text-[#ababab]">
                                    Frequently used items will appear here after completed orders.
                                </p>
                            )}
                            {filteredItems.map((menuItem) => {
                                const selectedQuantity = selectedQuantityByProduct.get(String(menuItem.id)) || 0;
                                return <button
                                    key={menuItem.id}
                                    type="button"
                                    onClick={() => selectMenuItem(menuItem)}
                                    className="group flex min-h-[132px] min-w-0 flex-col rounded-[8px] bg-[#2a2a2a] p-4 text-left transition-all duration-200 hover:-translate-y-1 hover:bg-[#d3d3d3] hover:text-[#1a1a1a] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#d3d3d3]"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-xs uppercase tracking-wider text-[#ababab] group-hover:text-[#555555]">{menuItem.category}</p>
                                        <div className="flex items-center gap-2">
                                            {selectedQuantity > 0 && <span className="rounded-full bg-[#d3d3d3] px-2 py-0.5 text-xs font-bold text-[#1a1a1a] group-hover:bg-[#1a1a1a] group-hover:text-white" aria-label={`${selectedQuantity} selected`}>
                                                ×{selectedQuantity}
                                            </span>}
                                            <span
                                                title={menuItem.diet === "veg" ? "Vegetarian" : "Non-vegetarian"}
                                                aria-label={menuItem.diet === "veg" ? "Vegetarian" : "Non-vegetarian"}
                                                className={`size-3 rounded-full ${menuItem.diet === "veg"
                                                    ? "bg-[#38a169]"
                                                    : "bg-[#e53e3e]"}`}
                                            />
                                        </div>
                                    </div>
                                    <div className="mt-3 flex items-start gap-3">
                                        <h3 className="min-w-0 flex-1 break-normal whitespace-normal text-sm font-semibold leading-tight sm:text-base">{menuItem.name}</h3>
                                    </div>
                                    <span className="mt-auto self-end whitespace-nowrap font-semibold">{formatCurrency(menuItem.price)}</span>
                                </button>;
                            })}
                        </div>
                    </section>
                    </section>

                    <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
                        <section className="min-h-16 rounded-[24px] bg-[#2a2a2a] p-3 shadow-lg">
                            {!orderType ? (
                                <div className="grid h-full grid-cols-3 gap-2">
                                    <button type="button" onClick={() => toggleOrderType("Table")} className="rounded-[14px] px-2 py-3 text-center text-sm font-medium text-[#ababab] transition-colors duration-200 hover:bg-[#3a3a3a] hover:text-[#f5f5f5]">
                                        Table
                                    </button>
                                    <button type="button" onClick={() => toggleOrderType("Parcel")} className="rounded-[14px] px-2 py-3 text-center text-sm font-medium text-[#ababab] transition-colors duration-200 hover:bg-[#3a3a3a] hover:text-[#f5f5f5]">
                                        Parcel / Takeaway
                                    </button>
                                    <button type="button" onClick={() => toggleOrderType("Delivery")} className="rounded-[14px] px-2 py-3 text-center text-sm font-medium text-[#ababab] transition-colors duration-200 hover:bg-[#3a3a3a] hover:text-[#f5f5f5]">
                                        Delivery
                                    </button>
                                </div>
                            ) : orderType === "Table" ? (
                                <div className="flex h-full items-center gap-3 rounded-[14px] bg-[#f5f5f5] px-3 text-[#1a1a1a] transition-all duration-300 ease-out">
                                    <button type="button" onClick={() => toggleOrderType("Table")} className="rounded-[10px] px-2 py-3 text-sm font-medium transition-colors hover:bg-[#e0e0e0]">
                                        Table
                                    </button>
                                    <input
                                        name="tableNumber"
                                        value={orderDetails.tableNumber || ""}
                                        onChange={handleTableNumberChange}
                                        placeholder="Table number (R1, L2, F1)"
                                        className="min-w-0 flex-1 rounded-[10px] border border-[#444444] bg-[#1f1f1f] px-3 py-2 text-sm text-[#f5f5f5] outline-none placeholder:text-[#777777] focus:border-[#1a1a1a]"
                                    />
                                </div>
                            ) : (
                                <div
                                    className="flex h-full items-center justify-between rounded-[14px] bg-[#d3d3d3] px-3 text-[#1a1a1a] transition-all duration-300 ease-out"
                                    onClick={() => toggleOrderType(orderType === "Takeaway" ? "Parcel" : orderType)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") toggleOrderType(orderType === "Takeaway" ? "Parcel" : orderType);
                                    }}
                                >
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            toggleOrderType(orderType === "Takeaway" ? "Parcel" : orderType);
                                        }}
                                        className="rounded-[10px] px-2 py-3 text-sm font-medium transition-colors hover:bg-[#bdbdbd]"
                                    >
                                        {orderType === "Delivery" ? "Delivery" : "Parcel / Takeaway"}
                                    </button>
                                    {(orderType === "Parcel" || orderType === "Takeaway") && (
                                        <select
                                            value={orderType}
                                            onClick={(event) => event.stopPropagation()}
                                            onChange={(event) => {
                                                changeOrderType(event.target.value);
                                            }}
                                            className="max-w-28 cursor-pointer rounded-[10px] bg-[#bdbdbd] px-2 py-2 text-sm text-[#1a1a1a] outline-none"
                                            aria-label="Parcel or takeaway"
                                        >
                                            <option value="Parcel">Parcel</option>
                                            <option value="Takeaway">Takeaway</option>
                                        </select>
                                    )}
                                </div>
                            )}
                        </section>
                        {(orderTypeError || (cart.length > 0 && !orderType)) && (
                            <p className="rounded-[12px] border border-[#f08080]/40 bg-[#f08080]/10 px-3 py-2 text-sm text-[#f08080]" role="alert">
                                {orderTypeError || "Select an order type to enable Save and KOT."}
                            </p>
                        )}

                        {orderType && orderType !== "Table" && (
                            <section
                                className={`order-details-panel flex-none overflow-hidden rounded-[24px] bg-[#2a2a2a] p-4 shadow-lg transition-[max-height,opacity,transform,background-color] duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] hover:bg-[#303030] ${detailsOpen ? "max-h-96 translate-y-0 opacity-100" : "max-h-16 translate-y-0 opacity-100"}`}
                                onClick={(event) => {
                                    if (!event.target.closest?.("input, textarea, select, button")) {
                                        setDetailsOpen((isOpen) => !isOpen);
                                    }
                                }}
                            >
                                <div className="flex items-center justify-between">
                                    <h2 className="text-lg font-semibold">
                                        {orderType === "Table" ? "Table details" : `${orderType} details`}
                                    </h2>
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setDetailsOpen((isOpen) => !isOpen);
                                        }}
                                        aria-expanded={detailsOpen}
                                        aria-label={detailsOpen ? "Collapse order details" : "Expand order details"}
                                        title={detailsOpen ? "Collapse order details" : "Expand order details"}
                                        className="flex size-8 items-center justify-center rounded-full text-[#ababab] transition-all duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] hover:bg-[#3a3a3a] hover:text-[#f5f5f5] active:scale-90"
                                    >
                                        {detailsOpen ? <FaChevronUp className="size-3" /> : <FaChevronDown className="size-3" />}
                                    </button>
                                </div>
                                <div className={`grid gap-3 transition-[margin,opacity,transform] duration-500 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] ${detailsOpen ? "mt-3 translate-y-0 opacity-100" : "pointer-events-none mt-0 -translate-y-2 opacity-0"}`}>
                                    {currentOrderFields.map((field) => (
                                        <label key={field.name} className="grid gap-1 text-sm font-medium text-[#ababab]">
                                            {field.label}
                                            {field.multiline ? (
                                                <textarea
                                                    name={field.name}
                                                    value={orderDetails[field.name] || ""}
                                                    onChange={handleDetailChange}
                                                    placeholder={field.placeholder}
                                                    rows="2"
                                                    className="order-details-field resize-none rounded-[12px] border border-[#444444] bg-[#1f1f1f] px-3 py-2 text-[#f5f5f5] outline-none transition-colors placeholder:text-[#666666] focus:border-[#d3d3d3]"
                                                />
                                            ) : (
                                                    <input
                                                    name={field.name}
                                                        type={field.name === "phone" ? "tel" : "text"}
                                                        inputMode={field.name === "phone" ? "numeric" : undefined}
                                                        maxLength={field.name === "phone" ? 10 : undefined}
                                                    value={orderDetails[field.name] || ""}
                                                        onChange={field.name === "phone" ? handlePhoneChange : handleDetailChange}
                                                    placeholder={field.placeholder}
                                                    className="order-details-field rounded-[12px] border border-[#444444] bg-[#1f1f1f] px-3 py-2 text-[#f5f5f5] outline-none transition-colors placeholder:text-[#666666]"
                                                />
                                            )}
                                            {field.name === "phone" && customerLookupMessage && (
                                                <span className="text-xs font-normal text-[#ababab]" aria-live="polite">
                                                    {customerLookupMessage}
                                                </span>
                                            )}
                                        </label>
                                    ))}
                                </div>
                        </section>
                        )}

                        <aside className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] bg-[#2a2a2a] p-5 shadow-lg">
                            <div className="flex items-center justify-between border-b border-[#444444] pb-4">
                                <div className="flex items-center gap-3">
                                    <FaShoppingCart className="text-[#d3d3d3]" />
                                    <h2 className="text-xl font-semibold">Current Order</h2>
                                </div>
                                <div className="text-right">
                                    <div className="flex items-center gap-2">
                                        <button type="button" onClick={openOrderNote} className={`flex size-8 items-center justify-center rounded-[10px] border transition-colors ${orderNote ? "border-[#d3d3d3] bg-[#d3d3d3] text-[#1a1a1a]" : "border-[#444444] text-[#ababab] hover:bg-[#3a3a3a] hover:text-[#f5f5f5]"}`} aria-label="Add order note" title="Add order note">
                                            <FaRegStickyNote className="size-4" />
                                        </button>
                                        <button type="button" onClick={clearOrder} disabled={cart.length === 0} className="flex size-8 items-center justify-center rounded-[10px] border border-[#444444] text-[#ababab] transition-colors hover:border-[#f08080] hover:bg-[#f08080] hover:text-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-40" aria-label="Clear current order" title="Clear current order">
                                            <FaTrashCan className="size-4" />
                                        </button>
                                        <input
                                            value={shortcutCode}
                                            onChange={(event) => {
                                                setShortcutCode(event.target.value);
                                                setShortcutError("");
                                            }}
                                            onKeyDown={handleShortcutSubmit}
                                            placeholder="Code"
                                            inputMode="numeric"
                                            aria-label="Add item by shortcut code"
                                            className="w-16 rounded-[10px] border border-[#444444] bg-[#1f1f1f] px-2 py-1 text-center text-sm text-[#f5f5f5] outline-none placeholder:text-[#777777] focus:border-[#d3d3d3]"
                                        />
                                    </div>
                                    {shortcutError && <p className="mt-1 text-[10px] text-[#f08080]">{shortcutError}</p>}
                                </div>
                            </div>

                            <div ref={orderListRef} className="scrollbar-hide min-h-0 flex-1 overflow-y-auto py-4">
                                {cart.length === 0 ? (
                                    <div className="flex h-full min-h-48 flex-col items-center justify-center text-center text-[#ababab]">
                                        <FaShoppingCart className="mb-3 size-8" />
                                        <p>Your order is empty</p>
                                        <p className="mt-1 text-sm">Select an item from the menu to add it.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {cart.map((item) => (
                                            <div key={item.id} className="flex items-center justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <p className="truncate font-medium">{item.name}</p>
                                                        <span className="shrink-0 rounded-full bg-[#3a3a3a] px-2 py-0.5 text-xs font-semibold text-[#d3d3d3]" aria-label={`${item.quantity} selected`}>
                                                            ×{item.quantity}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-[#ababab]">{formatCurrency(item.price)} each</p>
                                                    {item.note && <p className="truncate text-xs italic text-[#ababab]">Note: {item.note}</p>}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button type="button" onClick={() => openItemNote(item)} className={`rounded-full p-2 transition-colors ${item.note ? "bg-[#d3d3d3] text-[#1a1a1a]" : "bg-[#3a3a3a] text-[#ababab] hover:bg-[#d3d3d3] hover:text-[#1a1a1a]"}`} aria-label={`Add note for ${item.name}`} title="Add item note">
                                                        <FaRegStickyNote className="size-3" />
                                                    </button>
                                                    <button type="button" onClick={() => updateQuantity(item.id, -1)} className="rounded-full bg-[#3a3a3a] p-2 transition-colors hover:bg-[#d3d3d3] hover:text-[#1a1a1a]" aria-label={`Remove one ${item.name}`}>
                                                        <FaMinus className="size-3" />
                                                    </button>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        step="1"
                                                        value={item.quantity}
                                                        onChange={(event) => setItemQuantity(item.id, event.target.value)}
                                                        aria-label={`Quantity of ${item.name}`}
                                                        className="quantity-input w-10 rounded-[8px] border border-[#444444] bg-[#1f1f1f] px-1 py-1 text-center text-sm text-[#f5f5f5] outline-none focus:border-[#d3d3d3]"
                                                    />
                                                    <button type="button" onClick={() => addToCart(menuItems.find((menuItem) => menuItem.id === (item.productId || item.id)) || item, item.variationName ? { name: item.variationName, price: item.price } : null)} className="rounded-full bg-[#3a3a3a] p-2 transition-colors hover:bg-[#d3d3d3] hover:text-[#1a1a1a]" aria-label={`Add one ${item.name}`}>
                                                        <FaPlus className="size-3" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="border-t border-[#444444] pt-2">
                                {(orderType === "Parcel" || orderType === "Takeaway" || orderType === "Delivery") && (
                                <>
                                <button
                                    type="button"
                                    onClick={() => setSummaryOpen((isOpen) => !isOpen)}
                                    aria-expanded={summaryOpen}
                                    aria-label={summaryOpen ? "Collapse price details" : "Expand price details"}
                                    title={summaryOpen ? "Collapse price details" : "Expand price details"}
                                    className="flex w-full items-center justify-between rounded-[10px] px-2 py-2 text-sm text-[#ababab] transition-colors hover:bg-[#3a3a3a] hover:text-[#f5f5f5]"
                                >
                                    <span className="flex items-center gap-3">
                                        Price details
                                        {summaryOpen ? <FaChevronUp className="size-3" /> : <FaChevronDown className="size-3" />}
                                    </span>
                                    <span>{formatCurrency(total)}</span>
                                </button>
                                <div className={`grid overflow-hidden transition-[max-height,opacity,margin] duration-500 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] ${summaryOpen ? "mt-2 max-h-64 opacity-100" : "mt-0 max-h-0 opacity-0"}`}>
                                    <div className="flex items-center justify-between px-2 text-sm text-[#ababab]">
                                        <span>Items subtotal</span>
                                        <span>{formatCurrency(subtotal)}</span>
                                    </div>
                                    {(orderType === "Parcel" || orderType === "Takeaway" || orderType === "Delivery") && (
                                        <label className="mt-2 flex items-center justify-between gap-3 px-2 text-sm text-[#ababab]">
                                            <span>{orderType === "Delivery" ? "Delivery charges" : "Parcel charges"}</span>
                                            <span className="flex items-center rounded-[10px] border border-[#444444] bg-[#1f1f1f] px-2 text-[#f5f5f5]">
                                                <span>₹</span>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    pattern="[0-9]*\.?[0-9]*"
                                                    value={charges[orderType]}
                                                    onChange={handleChargeChange}
                                                    placeholder="0.00"
                                                    aria-label={`${orderType === "Delivery" ? "Delivery" : "Parcel"} charges`}
                                                    className="w-20 bg-transparent px-1 py-1 text-right outline-none"
                                                />
                                            </span>
                                        </label>
                                    )}
                                    {orderType === "Delivery" && (
                                        <div className="mt-3 border-t border-[#444] pt-3">
                                            <p className="px-2 text-xs font-semibold text-[#d3d3d3]">Already paid before delivery</p>
                                            <div className="mt-2 grid grid-cols-2 gap-2">
                                                <label className="grid gap-1 px-2 text-xs text-[#ababab]">Cash paid
                                                    <input type="number" min="0" step="0.01" value={prepaidCash} onChange={(event) => setPrepaidCash(event.target.value)} placeholder="0.00" className="field text-right" />
                                                </label>
                                                <label className="grid gap-1 px-2 text-xs text-[#ababab]">Online paid
                                                    <input type="number" min="0" step="0.01" value={prepaidOnline} onChange={(event) => setPrepaidOnline(event.target.value)} placeholder="0.00" className="field text-right" />
                                                </label>
                                            </div>
                                            <p className="mt-2 px-2 text-xs text-[#ababab]">Rider will collect {formatCurrency(Math.max(0, total - (toPaise(prepaidCash) + toPaise(prepaidOnline)) / 100))}</p>
                                            {paymentError && <p role="alert" className="mt-2 px-2 text-xs text-[#f08080]">{paymentError}</p>}
                                        </div>
                                    )}
                                </div>
                                </>
                                )}
                                <div className="mb-2 mt-2 flex items-center justify-between text-base font-semibold">
                                    <span>Total</span>
                                    <span>{formatCurrency(total)}</span>
                                </div>
                                <div className="grid grid-cols-6 gap-1">
                                    <button type="button" onClick={() => completeOrder("saved")} disabled={!orderType || (cart.length === 0 && !isEditingExistingOrder)} className="col-span-2 rounded-[10px] bg-[#d3d3d3] px-1 py-1 text-xs font-semibold text-[#1a1a1a] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40">Save</button>
                                    <button type="button" onClick={() => completeOrder("saved", "cashier")} disabled={!canPrint || (cart.length === 0 && !isEditingExistingOrder)} className="col-span-2 rounded-[10px] bg-[#d3d3d3] px-1 py-1 text-xs font-semibold text-[#1a1a1a] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40">Save &amp; Print</button>
                                    <button type="button" onClick={() => completeOrder("kot")} disabled={!orderType || (cart.length === 0 && !isEditingExistingOrder)} className="col-span-2 rounded-[10px] bg-[#3a3a3a] px-1 py-1 text-xs font-semibold text-[#f5f5f5] transition-colors hover:bg-[#d3d3d3] hover:text-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-40">KOT</button>
                                    <button type="button" onClick={() => completeOrder("kot", "kitchen")} disabled={!canPrint || (cart.length === 0 && !isEditingExistingOrder)} className="col-span-3 rounded-[10px] bg-[#3a3a3a] px-1 py-1 text-xs font-semibold text-[#f5f5f5] transition-colors hover:bg-[#d3d3d3] hover:text-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-40">KOT &amp; Print</button>
                                    <button type="button" onClick={holdCurrentOrder} disabled={cart.length === 0} className="col-span-3 flex items-center justify-center gap-1 rounded-[10px] border border-[#555555] px-1 py-1 text-xs font-semibold text-[#d3d3d3] transition-colors hover:bg-[#3a3a3a] disabled:cursor-not-allowed disabled:opacity-40">Hold</button>
                                </div>
                            </div>
                        </aside>
                    </div>
                </div>
            </div>

            <div className={`hold-panel fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-[#242424] p-5 shadow-2xl transition-transform duration-300 ease-out ${holdDrawerOpen ? "translate-x-0" : "translate-x-full"}`}>
                <div className="flex items-center justify-between border-b border-[#444444] pb-4">
                    <div>
                        <p className="text-sm uppercase tracking-[0.2em] text-[#ababab]">Saved for later</p>
                        <h2 className="text-2xl font-semibold">Held Orders</h2>
                    </div>
                    <button type="button" onClick={() => setHoldDrawerOpen(false)} className="hold-panel-close rounded-full p-2 text-2xl text-[#ababab] transition-colors hover:bg-[#3a3a3a] hover:text-[#f5f5f5]" aria-label="Close held orders">&times;</button>
                </div>
                <div className="scrollbar-hide h-[calc(100%-5rem)] overflow-y-auto py-4">
                    {heldOrders.length === 0 ? (
                        <p className="hold-panel-empty py-10 text-center text-[#ababab]">No held orders</p>
                    ) : (
                        <div className="space-y-3">
                            {heldOrders.map((heldOrder) => (
                                <div key={heldOrder.id} className="hold-panel-card rounded-[16px] bg-[#2f2f2f] p-4">
                                    <button type="button" onClick={() => restoreHeldOrder(heldOrder)} className="w-full text-left transition-colors hover:text-[#d3d3d3]">
                                        <div className="flex items-center justify-between">
                                            <span className="font-semibold">{heldOrder.label}</span>
                                            <span className="text-sm">{formatCurrency(heldOrder.total)}</span>
                                        </div>
                                        <p className="mt-1 text-sm opacity-70">{heldOrder.cart.reduce((count, item) => count + item.quantity, 0)} items</p>
                                        <p className="mt-1 truncate text-sm text-[#ababab]">
                                            {heldOrder.orderType === "Table" && `Table: ${heldOrder.orderDetails.tableNumber || "Not entered"}`}
                                            {(heldOrder.orderType === "Parcel" || heldOrder.orderType === "Takeaway") && `Name: ${heldOrder.orderDetails.customerName || "Not entered"}`}
                                            {heldOrder.orderType === "Delivery" && `Address: ${heldOrder.orderDetails.address || "Not entered"}`}
                                        </p>
                                    </button>
                                    <button type="button" onClick={() => discardHeldOrder(heldOrder.id)} className="hold-panel-discard mt-3 rounded-[10px] border border-[#555555] px-3 py-1 text-xs font-medium text-[#ababab] transition-colors hover:border-[#f08080] hover:bg-[#f08080] hover:text-[#1a1a1a]">
                                        Discard
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            {holdDrawerOpen && <button type="button" onClick={() => setHoldDrawerOpen(false)} className="fixed inset-0 z-40 bg-black/40" aria-label="Close held orders overlay" />}
            {tableCollision && <div className="hold-modal fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"><section role="dialog" aria-modal="true" aria-labelledby="table-collision-title" className="w-full max-w-md rounded-[20px] bg-[#2a2a2a] p-5 shadow-2xl"><p className="text-sm uppercase tracking-[0.16em] text-[#f6c453]">Table already occupied</p><h2 id="table-collision-title" className="mt-2 text-xl font-semibold">Table {tableCollision.orderDetails?.tableNumber} has a running order</h2><p className="mt-3 text-sm text-[#ababab]">{cart.length === 0 ? "Add items before holding this order." : "This new order will be put on hold, and the existing table order will be opened for settlement."}</p><div className="mt-5 flex flex-col-reverse justify-end gap-2 sm:flex-row"><button type="button" onClick={() => navigate("/Tables", { replace: true })} className="rounded-[10px] px-4 py-2 text-sm text-[#ababab] hover:bg-[#3a3a3a]">No, return to Tables</button><button type="button" onClick={holdCollisionOrder} disabled={cart.length === 0} className="rounded-[10px] bg-[#d3d3d3] px-4 py-2 text-sm font-semibold text-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-50">Hold order &amp; settle</button></div></section></div>}
            {noteModal && (
                <div className="note-modal fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-[20px] bg-[#2a2a2a] p-5 shadow-2xl">
                        <div className="mb-4 flex items-center justify-between">
                            <div>
                                <p className="text-sm uppercase tracking-[0.16em] text-[#ababab]">{noteModal.type === "order" ? "Order note" : "Item note"}</p>
                                <h2 className="text-xl font-semibold">{noteModal.type === "order" ? "Note for the chef" : noteItem?.name}</h2>
                            </div>
                            <button type="button" onClick={() => setNoteModal(null)} className="rounded-full p-2 text-xl text-[#ababab] transition-colors hover:bg-[#3a3a3a] hover:text-[#f5f5f5]" aria-label="Close note">&times;</button>
                        </div>
                        <textarea
                            autoFocus
                            value={noteDraft}
                            onChange={(event) => setNoteDraft(event.target.value)}
                            placeholder={noteModal.type === "order" ? "Add instructions for the chef..." : "Add a note for this item..."}
                            rows="4"
                            className="w-full resize-none rounded-[12px] border border-[#444444] bg-[#1f1f1f] p-3 text-[#f5f5f5] outline-none placeholder:text-[#666666] focus:border-[#d3d3d3]"
                        />
                        <div className="mt-4 flex justify-end gap-2">
                            <button type="button" onClick={() => setNoteModal(null)} className="rounded-[12px] px-4 py-2 text-sm font-medium text-[#ababab] transition-colors hover:bg-[#3a3a3a] hover:text-[#f5f5f5]">Cancel</button>
                            <button type="button" onClick={saveNote} className="rounded-[12px] bg-[#d3d3d3] px-4 py-2 text-sm font-semibold text-[#1a1a1a] transition-colors hover:bg-white">Save note</button>
                        </div>
                    </div>
                </div>
            )}
            {variationItem && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
                    <div className="variation-modal w-full max-w-md rounded-[20px] bg-[#2a2a2a] p-5 shadow-2xl">
                        <div className="mb-5 flex items-center justify-between">
                            <div>
                                <p className="text-sm uppercase tracking-[0.16em] text-[#ababab]">Choose variation</p>
                                <h2 className="text-xl font-semibold">{variationItem.name}</h2>
                            </div>
                            <button type="button" onClick={() => setVariationItem(null)} className="variation-close rounded-full p-2 text-xl text-[#ababab] hover:bg-[#3a3a3a]" aria-label="Close variations">&times;</button>
                        </div>
                        <div className="grid gap-2">
                            {variationItem.variations.map((variation) => (
                                <button key={variation.name} type="button" onClick={() => { addToCart(variationItem, variation); setVariationItem(null); }} className="variation-option flex items-center justify-between rounded-[12px] bg-[#3a3a3a] px-4 py-3 text-left transition-colors hover:bg-[#d3d3d3] hover:text-[#1a1a1a]">
                                    <span className="font-medium">{variation.name}</span>
                                    <span>{formatCurrency(variation.price)}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
};

export default NewOrder;
