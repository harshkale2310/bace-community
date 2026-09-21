import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";

import Navbar from "../Navbar/Navbar";
import Sidebar from "../Sidebar/Sidebar";

import { useApp } from "../../context/AppContext";

import "./Layout.css";

/* ==========================================================================
   SCROLL TO TOP
========================================================================== */

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  }, [pathname]);

  return null;
}

/* ==========================================================================
   LAYOUT
========================================================================== */

function Layout() {
  const { sidebarOpen } = useApp();

  return (
    <div
      className={
        sidebarOpen
          ? "app-layout sidebar-expanded"
          : "app-layout sidebar-collapsed"
      }
    >
      <ScrollToTop />

      <Sidebar />

      <div className="app-main">
        <Navbar />

        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default Layout;