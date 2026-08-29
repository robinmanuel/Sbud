"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import styles from "./AppShell.module.css";

const API_BASE = typeof window !== "undefined" ? `http://${window.location.hostname}:8000` : "http://localhost:8000";

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const verifyAuth = async () => {
      try {
        const resp = await fetch(`${API_BASE}/users/me`, {
          method: "GET",
          credentials: "include",
        });

        if (!resp.ok) {
          throw new Error("Unauthorized");
        }

        const data = await resp.json();
        setUserEmail(data.email);
        setIsAuthenticated(true);
      } catch (err) {
        console.warn("User is not authenticated. Redirecting to login.");
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };

    verifyAuth();
  }, [router]);

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (e) {
      console.error("Logout request failed:", e);
    } finally {
      router.push("/login");
    }
  };

  if (loading) {
    return (
      <div className={styles.loaderContainer}>
        <div className={styles.glow} />
        <div className={styles.spinner} />
        <p className={styles.loadingText}>Verifying secure connection...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const userDisplayName = userEmail ? userEmail.split("@")[0] : "Student";

  const navItems = [
    { name: "Home", path: "/" },
    { name: "Assistant", path: "/assistant" },
    { name: "Materials", path: "/materials" },
  ];

  return (
    <div className={styles.layout}>
      {/* Background glow */}
      <div className={styles.glow} />

      {/* Top Navigation Bar */}
      <header className={styles.topbar}>
        <div className={styles.brand} onClick={() => router.push("/")} style={{ cursor: "pointer" }}>
          <div className={styles.logoIcon}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A57.778 57.778 0 0 1 12 13.5a57.762 57.762 0 0 1 5.25-2.175V15M12 13.5v3.825" />
            </svg>
          </div>
          <span className={styles.logoText}>SBud</span>
        </div>

        <nav className={styles.navMenu}>
          {navItems.map((item) => {
            const isActive = pathname === item.path || (item.path !== "/" && pathname.startsWith(item.path));
            return (
              <Link 
                key={item.name}
                href={item.path} 
                className={`${styles.navLink} ${isActive ? styles.navActive : ""}`}
              >
                {item.name}
                {isActive && <div className={styles.activeIndicator} />}
              </Link>
            );
          })}
        </nav>

        <div className={styles.userSection}>
          <span className={styles.emailBadge}>{userEmail}</span>
          <div className={styles.avatar}>
            {userDisplayName.charAt(0).toUpperCase()}
          </div>
          <button 
            onClick={handleLogout} 
            className={styles.logoutButton} 
            title="Sign Out"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={styles.logoutIcon}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className={styles.mainContent}>
        {children}
      </main>
    </div>
  );
}
