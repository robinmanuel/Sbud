"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import styles from "./dashboard.module.css";

const API_BASE = typeof window !== "undefined" ? `http://${window.location.hostname}:8000` : "http://localhost:8000";

interface DashboardStats {
  topics_studied: number;
  quizzes_completed: number;
  questions_answered: number;
  study_sessions: number;
}

interface RecentLearning {
  id: number;
  name: string;
  document_name: string;
  last_studied: string;
}

export default function HomePage() {
  const [userName, setUserName] = useState<string>("Student");
  const [stats, setStats] = useState<DashboardStats>({
    topics_studied: 0,
    quizzes_completed: 0,
    questions_answered: 0,
    study_sessions: 0
  });
  const [recentLearning, setRecentLearning] = useState<RecentLearning[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  const router = useRouter();

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        // Fetch User Info
        const userResp = await fetch(`${API_BASE}/users/me`, {
          method: "GET",
          credentials: "include",
        });
        if (userResp.ok) {
          const userData = await userResp.json();
          const name = userData.email.split("@")[0];
          setUserName(name.charAt(0).toUpperCase() + name.slice(1));
        }

        // Fetch Dashboard Stats
        const statsResp = await fetch(`${API_BASE}/dashboard/stats`, {
          method: "GET",
          credentials: "include",
        });
        if (statsResp.ok) {
          const statsData = await statsResp.json();
          setStats(statsData);
        }

        // Fetch Recent Learning Topics
        const learningResp = await fetch(`${API_BASE}/dashboard/recent-learning`, {
          method: "GET",
          credentials: "include",
        });
        if (learningResp.ok) {
          const learningData = await learningResp.json();
          setRecentLearning(learningData);
        }
      } catch (err) {
        console.error("Failed to load dashboard metrics:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  const getTimeGreeting = () => {
    const hrs = new Date().getHours();
    if (hrs < 12) return "Good morning";
    if (hrs < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <AppShell>
      <div className={styles.container}>
        <div className={styles.greetingSection}>
          <h1 className={styles.greeting}>{getTimeGreeting()} 👋</h1>
          <p className={styles.subGreeting}>Welcome back to your personalized learning workspace.</p>
        </div>

        {loading ? (
          <div className={styles.emptyState} style={{ padding: "4rem 0" }}>
            <div className={styles.spinner} style={{ margin: "0 auto 1rem auto" }} />
            Loading your study overview...
          </div>
        ) : (
          <div className={styles.grid}>
            {/* Left Column: Recent Learning & Activity Stream */}
            <div className={styles.leftCol}>
              {/* Recent Learning Workspace continuation */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>Your Recent Learning</h2>
                </div>

                {recentLearning.length === 0 ? (
                  <div className={styles.emptyState}>
                    No studied topics yet. Head to <strong>Assistant</strong> or upload a document to begin.
                  </div>
                ) : (
                  <div className={styles.studyGrid}>
                    {recentLearning.map((item) => (
                      <div key={item.id} className={styles.studyBox}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: 1 }}>
                          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
                            {item.document_name.split(".")[0]}
                          </span>
                          <span className={styles.studySubject}>{item.name}</span>
                          <span className={styles.studyDuration} style={{ fontSize: "0.75rem", marginTop: "0.5rem" }}>
                            Last studied {item.last_studied}
                          </span>
                        </div>
                        <button 
                          className={styles.startBtn}
                          onClick={() => router.push(`/assistant?topicId=${item.id}`)}
                          style={{ marginTop: "0.75rem" }}
                        >
                          Continue
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent activity log stream */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>Recent Activity</h2>
                </div>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {recentLearning.length === 0 ? (
                    <div className={styles.emptyState} style={{ padding: "0.5rem 0" }}>No recent records.</div>
                  ) : (
                    recentLearning.map((item, idx) => {
                      const logs = [
                        `Completed ${item.name} lesson`,
                        `Reviewed active recall for ${item.name}`,
                        `Attempted practice quiz on ${item.name}`
                      ];
                      return (
                        <div 
                          key={idx}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.75rem",
                            padding: "0.5rem 0",
                            borderBottom: idx < recentLearning.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none"
                          }}
                        >
                          <span style={{ color: "var(--success)", fontWeight: 700, fontSize: "1rem" }}>✓</span>
                          <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>{logs[idx % logs.length]}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Statistics Sidebar & Quick explanations */}
            <div className={styles.rightCol}>
              {/* Quick stats sidebar */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>Quick Stats</h2>
                </div>
                
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-light)", padding: "1rem", borderRadius: "14px", textAlign: "center" }}>
                    <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--accent-indigo)" }}>{stats.topics_studied}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>Topics Studied</div>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-light)", padding: "1rem", borderRadius: "14px", textAlign: "center" }}>
                    <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--accent-indigo)" }}>{stats.quizzes_completed}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>Quizzes Taken</div>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-light)", padding: "1rem", borderRadius: "14px", textAlign: "center" }}>
                    <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--accent-indigo)" }}>{stats.questions_answered}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>Answers Given</div>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-light)", padding: "1rem", borderRadius: "14px", textAlign: "center" }}>
                    <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--accent-indigo)" }}>{stats.study_sessions}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>Study Sessions</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
