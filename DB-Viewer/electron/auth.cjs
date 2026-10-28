const fs = require("node:fs");

const readEnv = (envPath) => {
    let content;
    try {
        content = fs.readFileSync(envPath, "utf8");
    } catch (error) {
        if (error.code === "ENOENT") return {};
        throw error;
    }

    return content.split(/\r?\n/).reduce((values, line) => {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (match) values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
        return values;
    }, {});
};

const readStoredUsers = (usersPath) => {
    try {
        const users = JSON.parse(fs.readFileSync(usersPath, "utf8"));
        if (!Array.isArray(users)) throw new Error("POS users.json must contain an array.");
        return users;
    } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
    }
};

const readUsers = ({ envPath, usersPath }) => {
    const values = readEnv(envPath);
    const storedUsers = readStoredUsers(usersPath);
    const configuredAccounts = [
        { name: values.VITE_CASHIER_NAME, username: values.VITE_CASHIER_USERNAME, password: values.VITE_CASHIER_PASSWORD, role: "Cashier" },
        { name: values.VITE_ADMIN_NAME, username: values.VITE_ADMIN_USERNAME, password: values.VITE_ADMIN_PASSWORD, role: "Admin" },
    ];
    const configuredUsers = configuredAccounts.map((account) => {
        const override = storedUsers.find((stored) =>
            stored.originalUsername === account.username || stored.username === account.username,
        );
        return { ...account, ...override, originalUsername: override?.originalUsername || account.username };
    });

    return configuredUsers.concat(storedUsers.filter((stored) =>
        !configuredAccounts.some((configured) =>
            stored.originalUsername === configured.username || stored.username === configured.username,
        ),
    ));
};

const authenticateAdmin = (users, credentials = {}) => {
    if (typeof credentials.username !== "string" || typeof credentials.password !== "string") return null;
    const account = users.find((candidate) =>
        candidate.role === "Admin"
        && candidate.username === credentials.username
        && candidate.password === credentials.password,
    );
    return account
        ? { name: account.name, username: account.username, role: account.role }
        : null;
};

module.exports = { readUsers, authenticateAdmin };
