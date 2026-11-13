import React from "react";
import { createRoot } from "react-dom/client";
import DeliveryApp from "./page.jsx";
import "./style.css";

createRoot(document.getElementById("root")).render(
    <React.StrictMode>
        <DeliveryApp />
    </React.StrictMode>,
);
