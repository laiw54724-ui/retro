import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { App } from "./app/App";
import { AuthProvider } from "./app/AuthProvider";
import { I18nextProvider } from "react-i18next";
import { i18n, initI18n } from "./i18n";
import "./styles/global.css";
import "./styles/w98.css";
import "./styles/ig.css";

// Keep App's existing routes; a data-router context enables supported POP/exit blocking.
const router = createBrowserRouter([{ path: "*", element: <AuthProvider><App /></AuthProvider> }]);

void initI18n().then(() => ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
    <RouterProvider router={router} />
    </I18nextProvider>
  </React.StrictMode>
));
