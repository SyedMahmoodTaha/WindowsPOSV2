import React from "react";
import { GoListOrdered } from "react-icons/go";
import { MdOutlineTableBar } from "react-icons/md";
import { FaHome } from "react-icons/fa";
import { MdDeliveryDining } from "react-icons/md";
import { FaPlus } from "react-icons/fa6";


const BottomNav = () => {
    return(
                 <div className="fixed bottom-0 left-0 right-0 flex h-16 justify-around bg-[#262626] p-2 text-[#f5f5f5]">
                     <button type="button" className="flex flex-1 flex-col items-center justify-center gap-1 rounded-[20px] transition-colors duration-150 hover:bg-[#d3d3d3] hover:text-[#1a1a1a] active:bg-[#d3d3d3] active:text-[#1a1a1a]">
                         <FaHome className="size-5 shrink-0" />
                         <span>Home</span>
                     </button>
                     <button type="button" className="flex flex-1 flex-col items-center justify-center gap-1 rounded-[20px] transition-colors duration-150 hover:bg-[#d3d3d3] hover:text-[#1a1a1a] active:bg-[#d3d3d3] active:text-[#1a1a1a]">
                         <GoListOrdered className="size-5 shrink-0" />
                         <span>Orders</span>
                     </button>
                     <button type="button" className="flex flex-1 flex-col items-center justify-center gap-1 rounded-[20px] transition-colors duration-150 hover:bg-[#d3d3d3] hover:text-[#1a1a1a] active:bg-[#d3d3d3] active:text-[#1a1a1a]">
                         <MdOutlineTableBar className="size-5 shrink-0" />
                         <span>Tables</span>
                     </button>
                     <button type="button" className="flex flex-1 flex-col items-center justify-center gap-1 rounded-[20px] transition-colors duration-150 hover:bg-[#d3d3d3] hover:text-[#1a1a1a] active:bg-[#d3d3d3] active:text-[#1a1a1a]">
                         <MdDeliveryDining className="size-5 shrink-0" />
                         <span>Delivery</span>
                     </button>
                     <button className="absolute bottom-7 bg-[red] rounded-full p3 item-center"><FaPlus size={50}/>
</button>
        </div>
    )
}

export default BottomNav