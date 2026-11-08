import { useEffect, useState } from "react";
import { FaArrowLeft, FaCamera, FaUser } from "react-icons/fa6";
import { Link, useLocation } from "react-router-dom";
import { getCurrentUser, getMyAccount, updateMyAccount } from "../utils/auth";

const emptyProfile = { photo: "", phone: "", address: "", email: "", emergencyContact: "", notes: "" };

const MyAccount = () => {
    const location = useLocation();
    const user = getCurrentUser();
    const backPath = location.state?.from || "/";
    const [account, setAccount] = useState(null);
    const [draft, setDraft] = useState({ name: user?.name || "", staffProfile: emptyProfile, password: "" });
    const [message, setMessage] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        let active = true;
        getMyAccount()
            .then((result) => {
                if (!active) return;
                setAccount(result);
                setDraft({
                    name: result.name || "",
                    staffProfile: { ...emptyProfile, ...result.staffProfile },
                    password: "",
                });
            })
            .catch((error) => {
                console.error("Could not load your account:", error);
                if (active) setMessage(`Could not load your account: ${error.message}`);
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });
        return () => { active = false; };
    }, []);

    const updateProfileField = (field, value) => {
        setDraft((current) => ({
            ...current,
            staffProfile: { ...current.staffProfile, [field]: value },
        }));
    };

    const setPhoto = (file) => {
        if (!file) return;
        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 1_000_000) {
            setMessage("Choose a PNG, JPEG, or WebP photo smaller than 1 MB.");
            return;
        }
        const reader = new FileReader();
        reader.onload = () => updateProfileField("photo", String(reader.result || ""));
        reader.onerror = () => setMessage("Could not read the selected photo.");
        reader.readAsDataURL(file);
    };

    const saveAccount = async (event) => {
        event.preventDefault();
        setIsSaving(true);
        setMessage("");
        try {
            const updated = await updateMyAccount({
                name: draft.name,
                staffProfile: draft.staffProfile,
                ...(draft.password ? { password: draft.password } : {}),
            });
            setAccount(updated);
            setDraft({
                name: updated.name,
                staffProfile: { ...emptyProfile, ...updated.staffProfile },
                password: "",
            });
            setMessage("Account details saved.");
        } catch (error) {
            setMessage(`Could not save account details: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <main className="min-h-screen bg-[#1f1f1f] px-4 py-6 text-[#f5f5f5] sm:px-6">
            <div className="mx-auto max-w-3xl">
                <header className="mb-8 flex items-center gap-4">
                    <Link to={backPath} className="rounded-full p-3 text-[#d3d3d3] hover:bg-[#d3d3d3] hover:text-[#1a1a1a]" aria-label="Back">
                        <FaArrowLeft />
                    </Link>
                    <div>
                        <p className="text-sm uppercase tracking-[0.2em] text-[#ababab]">Account settings</p>
                        <h1 className="text-3xl font-semibold">My Account</h1>
                    </div>
                </header>

                {isLoading ? <p className="text-sm text-[#ababab]">Loading account...</p> : account && (
                    <form onSubmit={saveAccount} className="rounded-[20px] bg-[#2a2a2a] p-5 sm:p-7">
                        <div className="mb-6 flex flex-wrap items-center gap-4">
                            {draft.staffProfile.photo
                                ? <img src={draft.staffProfile.photo} alt="Your profile" className="size-20 rounded-full object-cover" />
                                : <span className="flex size-20 items-center justify-center rounded-full bg-[#3a3a3a] text-2xl text-[#ababab]"><FaUser /></span>}
                            <label className="inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-[#555] px-3 py-2 text-sm text-[#d3d3d3] hover:bg-[#3a3a3a]">
                                <FaCamera /> {draft.staffProfile.photo ? "Change photo" : "Add profile photo"}
                                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => setPhoto(event.target.files?.[0])} />
                            </label>
                        </div>

                        <div className="mb-5 grid gap-3 sm:grid-cols-2">
                            <label className="grid gap-1 text-sm text-[#ababab]">Username
                                <input value={account.username} readOnly className="field opacity-70" />
                            </label>
                            <label className="grid gap-1 text-sm text-[#ababab]">Role
                                <input value={account.role} readOnly className="field opacity-70" />
                            </label>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="grid gap-1 text-sm text-[#ababab] sm:col-span-2">Full name
                                <input required maxLength="120" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className="field" />
                            </label>
                            <label className="grid gap-1 text-sm text-[#ababab]">Phone number
                                <input maxLength="50" type="tel" value={draft.staffProfile.phone} onChange={(event) => updateProfileField("phone", event.target.value)} className="field" />
                            </label>
                            <label className="grid gap-1 text-sm text-[#ababab]">Email
                                <input maxLength="254" type="email" value={draft.staffProfile.email} onChange={(event) => updateProfileField("email", event.target.value)} className="field" />
                            </label>
                            <label className="grid gap-1 text-sm text-[#ababab]">Emergency contact
                                <input maxLength="200" value={draft.staffProfile.emergencyContact} onChange={(event) => updateProfileField("emergencyContact", event.target.value)} className="field" />
                            </label>
                            <label className="grid gap-1 text-sm text-[#ababab] sm:col-span-2">Address
                                <textarea rows="3" maxLength="500" value={draft.staffProfile.address} onChange={(event) => updateProfileField("address", event.target.value)} className="field resize-y" />
                            </label>
                            <label className="grid gap-1 text-sm text-[#ababab] sm:col-span-2">New password (leave blank to keep current)
                                <input type="password" autoComplete="new-password" maxLength="256" value={draft.password} onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))} className="field" />
                            </label>
                        </div>
                        <button disabled={isSaving} className="mt-5 rounded-[10px] bg-[#d3d3d3] px-4 py-2 text-sm font-semibold text-[#1a1a1a] disabled:opacity-60">
                            {isSaving ? "Saving..." : "Save account"}
                        </button>
                    </form>
                )}
                {message && <p role="status" className="mt-4 rounded-[10px] bg-[#2a2a2a] px-4 py-3 text-sm text-[#d3d3d3]">{message}</p>}
            </div>
        </main>
    );
};

export default MyAccount;
