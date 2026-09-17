import { Outlet } from "react-router-dom";

import Navbar from "../Navbar/Navbar";
import Sidebar from "../Sidebar/Sidebar";

import { useApp } from "../../context/AppContext";

import "./Layout.css";

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