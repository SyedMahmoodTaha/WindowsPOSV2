import { FaArrowLeft, FaBoxOpen } from "react-icons/fa6";
import { Link } from "react-router-dom";

const Inventory = () => (
    <main className="min-h-screen bg-[#1f1f1f] px-4 py-6 text-[#f5f5f5] sm:px-6">
        <div className="mx-auto max-w-5xl">
            <div className="mb-8 flex items-center gap-4">
                <Link to="/" className="rounded-full p-3 text-[#d3d3d3] transition-colors hover:bg-[#d3d3d3] hover:text-[#1a1a1a]" aria-label="Back to home">
                    <FaArrowLeft />
                </Link>
                <div>
                    <p className="text-sm uppercase tracking-[0.2em] text-[#ababab]">Stock management</p>
                    <h1 className="text-3xl font-semibold">Inventory</h1>
                </div>
            </div>
            <section className="flex min-h-64 flex-col items-center justify-center rounded-[24px] bg-[#2a2a2a] p-8 text-center shadow-lg">
                <FaBoxOpen className="mb-4 size-10 text-[#d3d3d3]" />
                <h2 className="text-2xl font-semibold">Coming soon</h2>
                <p className="mt-2 max-w-lg text-[#ababab]">Inventory management is not available yet.</p>
            </section>
        </div>
    </main>
);

export default Inventory;
