import { FaArrowLeft, FaBolt } from "react-icons/fa6";
import { Link } from "react-router-dom";
import { getCurrentUser } from "../utils/auth";
import { quickActionOptions, readQuickActionIds } from "../utils/quickActions";

const MoreSettings = () => {
    const role = getCurrentUser()?.role;
    const selectedIds = readQuickActionIds();
    const options = quickActionOptions.filter(({ id, roles }) => (
        !selectedIds.includes(id) && (!roles || roles.includes(role))
    ));

    return (
        <main className="min-h-screen bg-[#1f1f1f] px-4 py-6 text-[#f5f5f5] sm:px-6">
            <div className="mx-auto max-w-6xl">
                <div className="mb-8 flex items-center gap-4">
                    <Link to="/" className="rounded-full p-3 text-[#d3d3d3] transition-colors hover:bg-[#d3d3d3] hover:text-[#1a1a1a]" aria-label="Back to home">
                        <FaArrowLeft />
                    </Link>
                    <div>
                        <p className="text-sm uppercase tracking-[0.2em] text-[#ababab]">{role || "POS"} options</p>
                        <h1 className="text-3xl font-semibold">More Settings</h1>
                    </div>
                </div>
                <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Link to="/quick-action-settings" state={{ from: "/more-settings" }} className="flex items-start gap-4 rounded-[20px] bg-[#2a2a2a] p-5 transition-colors hover:bg-[#353535] focus:outline-none focus:ring-2 focus:ring-[#d3d3d3]">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#3a3a3a] text-[#d3d3d3]">
                            <FaBolt className="size-5" />
                        </span>
                        <span>
                            <span className="block font-semibold">Quick Action Settings</span>
                            <span className="mt-1 block text-sm text-[#ababab]">Choose shortcuts for the home screen</span>
                        </span>
                    </Link>
                </div>
                <h2 className="mb-3 text-xl font-semibold">More Settings</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {options.map(({ label, description, icon: Icon, path }) => (
                        <Link key={label} to={path} state={{ from: "/more-settings" }} className="flex items-start gap-4 rounded-[20px] bg-[#2a2a2a] p-5 transition-colors hover:bg-[#353535] focus:outline-none focus:ring-2 focus:ring-[#d3d3d3]">
                            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#3a3a3a] text-[#d3d3d3]">
                                <Icon className="size-5" />
                            </span>
                            <span>
                                <span className="block font-semibold">{label}</span>
                                <span className="mt-1 block text-sm text-[#ababab]">{description}</span>
                            </span>
                        </Link>
                    ))}
                </div>
            </div>
        </main>
    );
};

export default MoreSettings;
