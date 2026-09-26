import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Root } from "./Root.js";
import "./styles.css";

const el = document.getElementById("root");
if (!el) throw new Error("no #root element");

createRoot(el).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
