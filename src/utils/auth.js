export const AUTH_STORAGE_KEY = "pfl-auth-user";
const USERS_STORAGE_KEY = "pfl-users-v1";
const SHOP_STAFF_STORAGE_KEY = "pfl-shop-staff-v1";

export const getCurrentUser = () => {
    try {
        return JSON.parse(sessionStorage.getItem(AUTH_STORAGE_KEY));
    } catch {
        return null;
    }
};

const getConfiguredAccounts = () => [
    { name: import.meta.env.VITE_CASHIER_NAME, username: import.meta.env.VITE_CASHIER_USERNAME, password: import.meta.env.VITE_CASHIER_PASSWORD, role: "Cashier" },
    { name: import.meta.env.VITE_ADMIN_NAME, username: import.meta.env.VITE_ADMIN_USERNAME, password: import.meta.env.VITE_ADMIN_PASSWORD, role: "Admin" },
];

const readStoredUsers = () => {
    try {
        const users = JSON.parse(localStorage.getItem(USERS_STORAGE_KEY));
        return Array.isArray(users) ? users : [];
    } catch {
        return [];
    }
};

const getAccountRecords = () => {
    const storedUsers = readStoredUsers();
    const configuredUsers = getConfiguredAccounts()
        .filter((account) => account.name && account.username)
        .map((account) => {
            const override = storedUsers.find((stored) => stored.originalUsername === account.username || stored.username === account.username);
            return { ...account, ...override, originalUsername: override?.originalUsername || account.username };
        });
    return configuredUsers.concat(storedUsers.filter((stored) => !getConfiguredAccounts().some((configured) => stored.originalUsername === configured.username || stored.username === configured.username)));
};

const canManageTarget = (currentUser, target) => {
    if (currentUser?.role === "Admin") return true;
    if (currentUser?.role === "Manager") {
        return target.username === currentUser.username || ["Assistant Manager", "Cashier"].includes(target.role);
    }
    return currentUser?.role === "Assistant Manager" && target.username === currentUser.username;
};

const safeUser = ({ name, username, role, originalUsername, staffProfile }) => ({
    name,
    username,
    role,
    memberType: "pos-user",
    originalUsername: originalUsername || username,
    staffProfile: {
        photo: String(staffProfile?.photo || ""),
        phone: String(staffProfile?.phone || ""),
        address: String(staffProfile?.address || ""),
        email: String(staffProfile?.email || ""),
        emergencyContact: String(staffProfile?.emergencyContact || ""),
        notes: String(staffProfile?.notes || ""),
    },
});

export const readUsers = () => getAccountRecords().map(safeUser);

export const saveUsers = (users) => localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));

export const getStaffUsers = async () => {
    if (window.pflDesktop?.getStaffUsers) return window.pflDesktop.getStaffUsers();
    const currentUser = getCurrentUser();
    return getAccountRecords()
        .filter((account) => account.name && account.username
            && (currentUser?.role !== "Manager" || account.role !== "Admin"))
        .map(safeUser);
};

export const getMyAccount = async () => {
    if (window.pflDesktop?.getMyAccount) return window.pflDesktop.getMyAccount();
    const currentUser = getCurrentUser();
    const account = getAccountRecords().find((candidate) => candidate.username === currentUser?.username);
    if (!account) throw new Error("Could not find your POS account.");
    return safeUser(account);
};

const normalizeEditableProfile = (profile = {}) => {
    const limits = { phone: 50, address: 500, email: 254, emergencyContact: 200, notes: 2000 };
    const normalized = {};
    for (const [field, maxLength] of Object.entries(limits)) {
        const value = profile[field] ?? "";
        if (typeof value !== "string" || value.length > maxLength) {
            throw new Error(`${field} must be ${maxLength} characters or fewer.`);
        }
        normalized[field] = value.trim();
    }
    const photo = profile.photo ?? "";
    if (typeof photo !== "string" || photo.length > 1_400_000
        || (photo && !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(photo))) {
        throw new Error("Photo must be a PNG, JPEG, or WebP image smaller than 1 MB.");
    }
    normalized.photo = photo;
    return normalized;
};

export const updateMyAccount = async ({ name, staffProfile, password }) => {
    const nextName = typeof name === "string" ? name.trim() : "";
    if (!nextName || nextName.length > 120) throw new Error("Name is required and must be 120 characters or fewer.");
    const nextProfile = normalizeEditableProfile(staffProfile);
    if (password !== undefined && (typeof password !== "string" || password.length > 256)) {
        throw new Error("Password must be 256 characters or fewer.");
    }
    if (window.pflDesktop?.updateMyAccount) {
        const updated = await window.pflDesktop.updateMyAccount({
            name: nextName,
            staffProfile: nextProfile,
            ...(password ? { password } : {}),
        });
        sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
            name: updated.name,
            username: updated.username,
            role: updated.role,
        }));
        window.dispatchEvent(new Event("pfl-my-account-updated"));
        return updated;
    }

    const currentUser = getCurrentUser();
    if (!currentUser) throw new Error("Sign in to update your account.");
    const accounts = getAccountRecords();
    const account = accounts.find((candidate) => candidate.username === currentUser.username);
    if (!account) throw new Error("Could not find your POS account.");
    const nextUsers = accounts.map((candidate) => candidate.username === currentUser.username
        ? { ...candidate, name: nextName, staffProfile: nextProfile, ...(password ? { password } : {}) }
        : candidate);
    saveUsers(nextUsers);
    const updated = safeUser(nextUsers.find((candidate) => candidate.username === currentUser.username));
    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
        name: updated.name,
        username: updated.username,
        role: updated.role,
    }));
    window.dispatchEvent(new Event("pfl-my-account-updated"));
    return updated;
};

export const getShopStaff = async () => {
    if (window.pflDesktop?.getShopStaff) return window.pflDesktop.getShopStaff();
    try {
        const staff = JSON.parse(localStorage.getItem(SHOP_STAFF_STORAGE_KEY) || "[]");
        if (!Array.isArray(staff)) throw new Error("Shop staff data must be a list.");
        return staff;
    } catch (error) {
        throw new Error(`Could not read shop staff: ${error.message}`);
    }
};

export const saveShopStaff = async (staff) => {
    if (window.pflDesktop?.setShopStaff) return window.pflDesktop.setShopStaff(staff);
    if (!Array.isArray(staff)) throw new Error("Shop staff must be a list.");
    localStorage.setItem(SHOP_STAFF_STORAGE_KEY, JSON.stringify(staff));
    return staff;
};

export const getManageableUsers = async () => {
    if (window.pflDesktop) return window.pflDesktop.getUsers();
    const currentUser = getCurrentUser();
    return getAccountRecords()
        .filter((account) => canManageTarget(currentUser, account))
        .map(safeUser);
};

export const getLoginUsers = async () => {
    if (window.pflDesktop) return window.pflDesktop.getLoginUsers();
    const currentUser = getCurrentUser();
    return getAccountRecords()
        .filter((account) => currentUser?.role !== "Manager" || account.role !== "Admin")
        .map(({ name, username, role, originalUsername }) => ({
        name, username, role, originalUsername: originalUsername || username,
    }));
};

const saveUsersInBrowser = (users) => {
    const currentUser = getCurrentUser();
    if (!Array.isArray(users)) throw new Error("Users must be a list");

    const accounts = getAccountRecords();
    if (currentUser?.role === "Admin") {
        const nextUsers = users.map((user) => {
            const originalUsername = user.originalUsername || user.username;
            const existing = accounts.find((account) => account.originalUsername === originalUsername || account.username === originalUsername);
            const password = user.password || existing?.password;
            if (!password) throw new Error(`A password is required for ${user.username}`);
            if (!["Admin", "Manager", "Assistant Manager", "Cashier"].includes(user.role)) {
                throw new Error(`Unsupported POS user role for ${user.username}`);
            }
            return { ...user, password, originalUsername };
        });
        saveUsers(nextUsers);
        return nextUsers;
    }

    const manageable = accounts.filter((account) => canManageTarget(currentUser, account));
    if (users.length !== manageable.length) throw new Error("You cannot add or remove user accounts");
    const submittedUsers = new Map(users.map((user) => [user.originalUsername || user.username, user]));
    if (submittedUsers.size !== manageable.length) throw new Error("The user list contains duplicate accounts");

    let passwordChanged = false;
    const nextAccounts = accounts.map((account) => {
        const originalUsername = account.originalUsername || account.username;
        const submitted = submittedUsers.get(originalUsername);
        if (!submitted) return account;
        if (submitted.name !== account.name || submitted.username !== account.username || submitted.role !== account.role) {
            throw new Error("You can only change passwords for permitted accounts");
        }
        if (submitted.password) {
            passwordChanged = true;
            return { ...account, password: submitted.password };
        }
        return account;
    });
    if (!passwordChanged) throw new Error("Enter a new password");
    saveUsers(nextAccounts);
    return users.map(safeUser);
};

export const saveManageableUsers = async (users) => window.pflDesktop
    ? window.pflDesktop.setUsers(users)
    : saveUsersInBrowser(users);

export const signIn = async (username, password) => {
    const account = window.pflDesktop
        ? await window.pflDesktop.authenticate({ username, password })
        : getAccountRecords().find((candidate) => candidate.username === username && candidate.password === password);
    if (!account) return null;
    const user = { name: account.name, username: account.username, role: account.role };
    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    return user;
};

export const signOut = () => {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    void window.pflDesktop?.signOut?.();
};
