import { useEffect, useState } from "react";
import { FaMoon, FaSun } from "react-icons/fa6";

export const THEME_KEY = "pfl-theme";

export const getStoredTheme = () => {
    const savedTheme = localStorage.getItem(THEME_KEY);
    return savedTheme === "light" || savedTheme === "dark" ? savedTheme : "dark";
};

export const applyTheme = (nextTheme) => {
    const safeTheme = nextTheme === "light" ? "light" : "dark";
    document.body.classList.toggle("theme-light", safeTheme === "light");
    document.documentElement.style.colorScheme = safeTheme;
    localStorage.setItem(THEME_KEY, safeTheme);
    return safeTheme;
};

const ThemeToggle = () => {
    const [theme, setTheme] = useState(() => getStoredTheme());

    useEffect(() => {
        applyTheme(theme);
    }, [theme]);

    useEffect(() => {
        applyTheme(getStoredTheme());
    }, []);

    const nextTheme = theme === "light" ? "dark" : "light";
    return (
        <button
            type="button"
            onClick={(event) => {
                event.stopPropagation();
                setTheme(nextTheme);
            }}
            className="flex size-10 items-center justify-center rounded-full text-[#ababab] transition-colors hover:bg-[#d3d3d3] hover:text-[#1a1a1a]"
            aria-label={`Switch to ${nextTheme} mode`}
            title={`Switch to ${nextTheme} mode`}
        >
            {theme === "light" ? <FaMoon /> : <FaSun />}
        </button>
    );
};

export default ThemeToggle;