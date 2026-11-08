export const AUTH_STORAGE_KEY = "pfl-auth-user";
const USERS_STORAGE_KEY = "pfl-users-v1";

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
    const configuredUsers = getConfiguredAccounts().map((account) => {
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

const safeUser = ({ name, username, role, originalUsername }) => ({
    name,
    username,
    role,
    originalUsername: originalUsername || username,
});

export const readUsers = () => getAccountRecords().map(safeUser);

export const saveUsers = (users) => localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));

export const getManageableUsers = async () => {
    if (window.pflDesktop) return window.pflDesktop.getUsers();
    const currentUser = getCurrentUser();
    return getAccountRecords()
        .filter((account) => canManageTarget(currentUser, account))
        .map(safeUser);
};

export const getLoginUsers = async () => {
    if (window.pflDesktop) return window.pflDesktop.getLoginUsers();
    return readUsers();
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
