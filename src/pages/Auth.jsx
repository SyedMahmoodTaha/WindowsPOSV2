import { useState } from "react";
import { FaLock, FaUser } from "react-icons/fa6";
import { useLocation, useNavigate } from "react-router-dom";
import { signIn } from "../utils/auth";

const logo = `${import.meta.env.BASE_URL}Logo.png`;

const Auth = () => {
    const navigate= useNavigate();
    const location = useLocation();
    const [username, setUsername] = useState(location.state?.selectedUsername || "");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!await signIn(username.trim(), password)) {
            setError("Incorrect username or password");
            return;
        }
        navigate(location.state?.from || "/", { replace: true });
    };

    return (
        <main className="flex min-h-screen items-center justify-center bg-[#1f1f1f] px-4 py-8 text-[#f5f5f5]">
            <section className="w-full max-w-md rounded-[24px] bg-[#2a2a2a] p-6 shadow-2xl sm:p-8">
                <div className="mb-8 text-center">
                    <img src={logo} alt="Lassi Shop logo" className="mx-auto mb-4 size-16 rounded-[16px]" />
                    <p className="text-sm uppercase tracking-[0.2em] text-[#ababab]">Lassi Shop POS</p>
                    <h1 className="mt-2 text-3xl font-semibold">Sign in</h1>
                </div>
                <form onSubmit={handleSubmit} className="grid gap-4">
                    <label className="grid gap-2 text-sm font-medium text-[#ababab]">
                        Username
                        <span className="flex items-center gap-3 rounded-[12px] border border-[#444] bg-[#1f1f1f] px-3 py-3 focus-within:border-[#d3d3d3]">
                            <FaUser className="text-[#777]" />
                            <input required autoFocus value={username} onChange={(event) => { setUsername(event.target.value); setError(""); }} className="min-w-0 flex-1 bg-transparent text-[#f5f5f5] outline-none" autoComplete="username" />
                        </span>
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#ababab]">
                        Password
                        <span className="flex items-center gap-3 rounded-[12px] border border-[#444] bg-[#1f1f1f] px-3 py-3 focus-within:border-[#d3d3d3]">
                            <FaLock className="text-[#777]" />
                            <input required type="password" value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} className="min-w-0 flex-1 bg-transparent text-[#f5f5f5] outline-none" autoComplete="current-password" />
                        </span>
                    </label>
                    {error && <p className="text-sm text-[#f08080]" role="alert">{error}</p>}
                    <button type="submit" className="mt-2 rounded-[12px] bg-[#d3d3d3] px-5 py-3 font-semibold text-[#1a1a1a] transition-colors hover:bg-white">Sign in</button>
                </form>
            </section>
        </main>
    );
};

export default Auth