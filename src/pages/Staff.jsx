import { useEffect, useMemo, useState } from "react";
import { FaArrowLeft, FaCamera, FaTrashCan, FaUser } from "react-icons/fa6";
import { Link, useLocation } from "react-router-dom";
import {
    getCurrentUser,
    getManageableUsers,
    getShopStaff,
    getStaffUsers,
    saveManageableUsers,
    saveShopStaff,
} from "../utils/auth";

const emptyProfile = { photo: "", phone: "", address: "", email: "", emergencyContact: "", notes: "" };
const emptyNewStaff = { memberType: "pos-user", name: "", username: "", password: "", role: "Cashier", jobTitle: "" };
const identity = (member) => member.memberType === "shop-staff"
    ? `shop:${member.id}`
    : `pos:${member.originalUsername || member.username}`;

const Staff = () => {
    const location = useLocation();
    const user = getCurrentUser();
    const isAdmin = user?.role === "Admin";
    const [members, setMembers] = useState([]);
    const [selectedId, setSelectedId] = useState("");
    const [filter, setFilter] = useState("all");
    const [draft, setDraft] = useState(null);
    const [newStaff, setNewStaff] = useState(emptyNewStaff);
    const [showNewStaff, setShowNewStaff] = useState(false);
    const [message, setMessage] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const visibleMembers = useMemo(
        () => filter === "all" ? members : members.filter((member) => member.memberType === filter),
        [filter, members],
    );
    const selectedStaff = useMemo(
        () => visibleMembers.find((member) => identity(member) === selectedId) || visibleMembers[0] || null,
        [visibleMembers, selectedId],
    );

    const loadStaff = async () => {
        setIsLoading(true);
        try {
            const [users, shopStaff] = await Promise.all([getStaffUsers(), getShopStaff()]);
            const records = [
                ...users.map((member) => ({ ...member, memberType: "pos-user" })),
                ...shopStaff.map((member) => ({ ...member, memberType: "shop-staff" })),
            ];
            setMembers(records);
            setSelectedId((current) => {
                const currentMember = records.find((member) => identity(member) === current);
                if (currentMember && (filter === "all" || currentMember.memberType === filter)) return current;
                return identity(records.find((member) => filter === "all" || member.memberType === filter) || records[0] || {});
            });
            setMessage("");
        } catch (error) {
            setMessage(`Could not load team members: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void loadStaff();
        const refresh = () => { void loadStaff(); };
        window.addEventListener("pfl-shop-staff-updated", refresh);
        return () => {
            window.removeEventListener("pfl-shop-staff-updated", refresh);
        };
    }, []);

    useEffect(() => {
        if (!selectedStaff) {
            setDraft(null);
            return;
        }
        setDraft({
            name: selectedStaff.name || "",
            username: selectedStaff.username || "",
            role: selectedStaff.role || "Cashier",
            jobTitle: selectedStaff.jobTitle || "",
            password: "",
            staffProfile: { ...emptyProfile, ...selectedStaff.staffProfile },
        });
    }, [selectedStaff]);

    const saveStaff = async (event) => {
        event.preventDefault();
        if (!isAdmin || !selectedStaff || !draft) return;
        const name = draft.name.trim();
        const username = draft.username.trim();
        const jobTitle = draft.jobTitle.trim();
        if (!name || (selectedStaff.memberType === "pos-user" && !username)
            || (selectedStaff.memberType === "shop-staff" && !jobTitle)) {
            setMessage(selectedStaff.memberType === "pos-user"
                ? "Name and username are required."
                : "Name and job title are required.");
            return;
        }

        if (selectedStaff.memberType === "pos-user" && members.some((member) => (
            member.memberType === "pos-user"
            && identity(member) !== identity(selectedStaff)
            && member.username.toLowerCase() === username.toLowerCase()
        ))) {
            setMessage("Username must be unique.");
            return;
        }

        setIsSaving(true);
        try {
            if (selectedStaff.memberType === "shop-staff") {
                const shopStaff = await getShopStaff();
                await saveShopStaff(shopStaff.map((member) => member.id === selectedStaff.id
                    ? { ...member, name, jobTitle, staffProfile: draft.staffProfile }
                    : member));
            } else {
                const manageable = await getManageableUsers();
                const nextUsers = manageable.map((member) => identity({ ...member, memberType: "pos-user" }) === identity(selectedStaff)
                    ? {
                        ...member,
                        name,
                        username,
                        role: draft.role,
                        ...(draft.password ? { password: draft.password } : {}),
                        staffProfile: draft.staffProfile,
                    }
                    : member);
                await saveManageableUsers(nextUsers);
            }
            await loadStaff();
            setMessage("Member profile saved.");
        } catch (error) {
            setMessage(`Could not save member profile: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const addStaff = async (event) => {
        event.preventDefault();
        if (!isAdmin) return;
        const name = newStaff.name.trim();
        const username = newStaff.username.trim();
        const jobTitle = newStaff.jobTitle.trim();
        if (!name || (newStaff.memberType === "pos-user" && (!username || !newStaff.password))
            || (newStaff.memberType === "shop-staff" && !jobTitle)) {
            setMessage(newStaff.memberType === "pos-user"
                ? "Name, username, and password are required."
                : "Name and job title are required.");
            return;
        }

        setIsSaving(true);
        try {
            let newIdentity;
            if (newStaff.memberType === "shop-staff") {
                const id = window.crypto.randomUUID();
                const shopStaff = await getShopStaff();
                await saveShopStaff([...shopStaff, { id, name, jobTitle, staffProfile: emptyProfile }]);
                newIdentity = `shop:${id}`;
            } else {
                if (members.some((member) => member.memberType === "pos-user"
                    && member.username.toLowerCase() === username.toLowerCase())) {
                    setMessage("Username must be unique.");
                    return;
                }
                const manageable = await getManageableUsers();
                await saveManageableUsers([...manageable, {
                    name,
                    username,
                    password: newStaff.password,
                    role: newStaff.role,
                    staffProfile: emptyProfile,
                }]);
                newIdentity = `pos:${username}`;
            }
            setNewStaff(emptyNewStaff);
            setShowNewStaff(false);
            setFilter(newStaff.memberType);
            await loadStaff();
            setSelectedId(newIdentity);
            setMessage(newStaff.memberType === "pos-user" ? "POS user created." : "Shop staff profile created.");
        } catch (error) {
            setMessage(`Could not create member: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const deleteStaff = async () => {
        if (!isAdmin || !selectedStaff) return;
        if (selectedStaff.memberType === "pos-user"
            && [import.meta.env.VITE_ADMIN_USERNAME, import.meta.env.VITE_CASHIER_USERNAME].includes(selectedStaff.username)) {
            setMessage("Configured POS accounts cannot be deleted here.");
            return;
        }
        if (!window.confirm(`Delete ${selectedStaff.name}'s ${selectedStaff.memberType === "pos-user" ? "POS account" : "staff profile"}?`)) return;
        setIsSaving(true);
        try {
            if (selectedStaff.memberType === "shop-staff") {
                const shopStaff = await getShopStaff();
                await saveShopStaff(shopStaff.filter((member) => member.id !== selectedStaff.id));
            } else {
                const manageable = await getManageableUsers();
                await saveManageableUsers(manageable.filter((member) => (
                    (member.originalUsername || member.username) !== (selectedStaff.originalUsername || selectedStaff.username)
                )));
            }
            setSelectedId("");
            await loadStaff();
            setMessage("Member removed.");
        } catch (error) {
            setMessage(`Could not remove member: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const setPhoto = (file) => {
        if (!file) return;
        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 1_000_000) {
            setMessage("Choose a PNG, JPEG, or WebP photo smaller than 1 MB.");
            return;
        }
        const reader = new FileReader();
        reader.onload = () => setDraft((current) => ({
            ...current,
            staffProfile: { ...current.staffProfile, photo: String(reader.result || "") },
        }));
        reader.onerror = () => setMessage("Could not read the selected photo.");
        reader.readAsDataURL(file);
    };

    const backPath = location.state?.from === "/more-settings" ? "/more-settings" : "/";
    const memberTypeLabel = (member) => member.memberType === "pos-user" ? member.role : member.jobTitle;

    return (
        <main className="staff-users-page min-h-screen bg-[#1f1f1f] px-4 py-6 text-[#f5f5f5] sm:px-6">
            <div className="mx-auto max-w-6xl">
                <header className="mb-8 flex items-center gap-4">
                    <Link to={backPath} aria-label={backPath === "/more-settings" ? "Back to More Settings" : "Back to home"} className="rounded-full p-3 text-[#d3d3d3] hover:bg-[#d3d3d3] hover:text-[#1a1a1a]">
                        <FaArrowLeft />
                    </Link>
                    <div>
                        <p className="text-sm uppercase tracking-[0.2em] text-[#ababab]">{isAdmin ? "Team administration" : "Team directory"}</p>
                        <h1 className="text-3xl font-semibold">Staff &amp; Users</h1>
                    </div>
                </header>

                <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
                    <section className="rounded-[20px] bg-[#2a2a2a] p-4">
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <h2 className="font-semibold">Team</h2>
                            {isAdmin && <button type="button" onClick={() => setShowNewStaff((visible) => !visible)} className="rounded-[9px] bg-[#d3d3d3] px-3 py-2 text-xs font-semibold text-[#1a1a1a]">{showNewStaff ? "Cancel" : "Add member"}</button>}
                        </div>
                        <div className="mb-3 grid grid-cols-3 gap-1 rounded-[10px] bg-[#1f1f1f] p-1 text-[11px]">
                            {[
                                ["all", "All"],
                                ["pos-user", "POS users"],
                                ["shop-staff", "Shop staff"],
                            ].map(([value, label]) => (
                                <button key={value} type="button" onClick={() => {
                                    setFilter(value);
                                    const nextMember = members.find((member) => value === "all" || member.memberType === value);
                                    setSelectedId(nextMember ? identity(nextMember) : "");
                                }} className={`rounded-[7px] px-1 py-2 ${filter === value ? "staff-filter-active bg-[#d3d3d3] font-semibold text-[#1a1a1a]" : "text-[#ababab]"}`}>{label}</button>
                            ))}
                        </div>
                        <div className="space-y-2">
                            {isLoading ? <p className="p-3 text-sm text-[#ababab]">Loading team...</p> : visibleMembers.map((member) => (
                                <button key={identity(member)} type="button" onClick={() => setSelectedId(identity(member))} className={`flex w-full items-center gap-3 rounded-[12px] p-3 text-left ${identity(member) === identity(selectedStaff || {}) ? "bg-[#444]" : "bg-[#1f1f1f] hover:bg-[#353535]"}`}>
                                    {member.staffProfile?.photo
                                        ? <img src={member.staffProfile.photo} alt="" className="size-10 rounded-full object-cover" />
                                        : <span className="flex size-10 items-center justify-center rounded-full bg-[#3a3a3a] text-[#ababab]"><FaUser /></span>}
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-medium">{member.name}</span>
                                        <span className="block truncate text-xs text-[#ababab]">{member.memberType === "pos-user" ? "POS user" : memberTypeLabel(member)}{member.memberType === "pos-user" ? ` · @${member.username}` : ""}</span>
                                    </span>
                                </button>
                            ))}
                            {!isLoading && visibleMembers.length === 0 && <p className="p-3 text-sm text-[#ababab]">No members in this section yet.</p>}
                        </div>
                    </section>

                    <div className="space-y-5">
                        {showNewStaff && isAdmin && <form onSubmit={addStaff} className="rounded-[20px] bg-[#2a2a2a] p-5">
                            <h2 className="mb-4 text-lg font-semibold">Create a team profile</h2>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="grid gap-1 text-sm text-[#ababab] sm:col-span-2">Profile type
                                    <select value={newStaff.memberType} onChange={(event) => setNewStaff({ ...newStaff, memberType: event.target.value })} className="field">
                                        <option value="pos-user">POS user — can sign in</option>
                                        <option value="shop-staff">Shop staff — no POS login</option>
                                    </select>
                                </label>
                                <input required value={newStaff.name} onChange={(event) => setNewStaff({ ...newStaff, name: event.target.value })} placeholder="Full name" className="field" />
                                {newStaff.memberType === "pos-user" ? <>
                                    <input required value={newStaff.username} onChange={(event) => setNewStaff({ ...newStaff, username: event.target.value })} placeholder="Username" className="field" />
                                    <input required type="password" autoComplete="new-password" value={newStaff.password} onChange={(event) => setNewStaff({ ...newStaff, password: event.target.value })} placeholder="Initial password" className="field" />
                                    <select value={newStaff.role} onChange={(event) => setNewStaff({ ...newStaff, role: event.target.value })} className="field">
                                        <option>Admin</option><option>Manager</option><option>Assistant Manager</option><option>Cashier</option>
                                    </select>
                                </> : <input required value={newStaff.jobTitle} onChange={(event) => setNewStaff({ ...newStaff, jobTitle: event.target.value })} placeholder="Job title (e.g. Pizza Master)" className="field sm:col-span-2" />}
                            </div>
                            <button disabled={isSaving} className="mt-4 rounded-[10px] bg-[#d3d3d3] px-4 py-2 text-sm font-semibold text-[#1a1a1a]">Create profile</button>
                        </form>}

                        {selectedStaff && draft && <form onSubmit={saveStaff} className="rounded-[20px] bg-[#2a2a2a] p-5">
                            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-xl font-semibold">{selectedStaff.name}</h2>
                                    <p className="text-sm text-[#ababab]">{selectedStaff.memberType === "pos-user" ? `POS user · ${selectedStaff.role} · @${selectedStaff.username}` : `${selectedStaff.jobTitle} · Shop staff`}</p>
                                </div>
                                {isAdmin && <button type="button" disabled={isSaving} onClick={() => void deleteStaff()} className="flex size-10 items-center justify-center rounded-[10px] text-[#f08080] hover:bg-[#f08080] hover:text-[#1a1a1a]" aria-label={`Delete ${selectedStaff.name}`}><FaTrashCan /></button>}
                            </div>

                            <div className="mb-5 flex items-center gap-4">
                                {draft.staffProfile.photo
                                    ? <img src={draft.staffProfile.photo} alt={`${selectedStaff.name} profile`} className="size-20 rounded-full object-cover" />
                                    : <span className="flex size-20 items-center justify-center rounded-full bg-[#3a3a3a] text-2xl text-[#ababab]"><FaUser /></span>}
                                {isAdmin && <label className="inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-[#555] px-3 py-2 text-sm text-[#d3d3d3] hover:bg-[#3a3a3a]">
                                    <FaCamera /> {draft.staffProfile.photo ? "Change photo" : "Add photo"}
                                    <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => setPhoto(event.target.files?.[0])} />
                                </label>}
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                {isAdmin && <>
                                    <label className="grid gap-1 text-sm text-[#ababab]">Full name<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="field" /></label>
                                    {selectedStaff.memberType === "pos-user" ? <>
                                        <label className="grid gap-1 text-sm text-[#ababab]">Username<input required value={draft.username} onChange={(event) => setDraft({ ...draft, username: event.target.value })} className="field" /></label>
                                        <label className="grid gap-1 text-sm text-[#ababab]">Role<select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })} className="field"><option>Admin</option><option>Manager</option><option>Assistant Manager</option><option>Cashier</option></select></label>
                                        <label className="grid gap-1 text-sm text-[#ababab]">Reset password<input type="password" autoComplete="new-password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} placeholder="Leave blank to keep current" className="field" /></label>
                                    </> : <label className="grid gap-1 text-sm text-[#ababab]">Job title<input required value={draft.jobTitle} onChange={(event) => setDraft({ ...draft, jobTitle: event.target.value })} className="field" /></label>}
                                </>}
                                <label className="grid gap-1 text-sm text-[#ababab]">Phone number<input readOnly={!isAdmin} value={draft.staffProfile.phone} onChange={(event) => setDraft({ ...draft, staffProfile: { ...draft.staffProfile, phone: event.target.value } })} className="field" /></label>
                                <label className="grid gap-1 text-sm text-[#ababab]">Email (optional)<input readOnly={!isAdmin} type="email" value={draft.staffProfile.email} onChange={(event) => setDraft({ ...draft, staffProfile: { ...draft.staffProfile, email: event.target.value } })} className="field" /></label>
                                <label className="grid gap-1 text-sm text-[#ababab]">Emergency contact<input readOnly={!isAdmin} value={draft.staffProfile.emergencyContact} onChange={(event) => setDraft({ ...draft, staffProfile: { ...draft.staffProfile, emergencyContact: event.target.value } })} className="field" /></label>
                                <label className="grid gap-1 text-sm text-[#ababab] sm:col-span-2">Address<textarea readOnly={!isAdmin} rows="2" maxLength="500" value={draft.staffProfile.address} onChange={(event) => setDraft({ ...draft, staffProfile: { ...draft.staffProfile, address: event.target.value } })} className="field resize-y" /></label>
                                <label className="grid gap-1 text-sm text-[#ababab] sm:col-span-2">Notes<textarea readOnly={!isAdmin} rows="3" maxLength="2000" value={draft.staffProfile.notes} onChange={(event) => setDraft({ ...draft, staffProfile: { ...draft.staffProfile, notes: event.target.value } })} className="field resize-y" /></label>
                            </div>
                            {isAdmin && <button disabled={isSaving} className="mt-5 rounded-[10px] bg-[#d3d3d3] px-4 py-2 text-sm font-semibold text-[#1a1a1a]">Save profile</button>}
                        </form>}
                    </div>
                </div>
                {message && <p role="status" className="mt-4 rounded-[10px] bg-[#2a2a2a] px-4 py-3 text-sm text-[#d3d3d3]">{message}</p>}
            </div>
        </main>
    );
};

export default Staff;
