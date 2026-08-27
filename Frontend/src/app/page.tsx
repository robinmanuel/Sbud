"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import styles from "./dashboard.module.css";

const API_BASE = typeof window !== "undefined" ? `http://${window.location.hostname}:8000` : "http://localhost:8000";

interface StudyDocument {
  id: number;
  filename: string;
  file_type: string;
  file_size: number;
  created_at: string;
}

interface ProgressRecord {
  id: number;
  subject: string;
  topic: string;
  questions_attempted: number;
  questions_correct: number;
  accuracy: number;
  last_studied_at: string;
}

interface StudyBoxItem {
  id: number;
  subject: string;
  topic: string;
  duration: number; // in minutes
  completed: boolean;
}

interface UpcomingGoal {
  id: number;
  goal: string;
  date: string;
  completed: boolean;
}

interface ActiveTimer {
  boxId: number;
  subject: string;
  topic: string;
  timeLeft: number; // in seconds
  isRunning: boolean;
}

export default function DashboardPage() {
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [progress, setProgress] = useState<ProgressRecord[]>([]);
  const [userName, setUserName] = useState<string>("Student");
  const [learningGoals, setLearningGoals] = useState<any[]>([]);
  
  // Local storage state keys
  const [studyBlocks, setStudyBlocks] = useState<StudyBoxItem[]>([]);
  const [upcomingGoals, setUpcomingGoals] = useState<UpcomingGoal[]>([]);
  
  // Quick AI input
  const [aiPrompt, setAiPrompt] = useState<string>("");
  
  // Timer State
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Authenticate/Get User details
        const userResp = await fetch(`${API_BASE}/users/me`, {
          method: "GET",
          credentials: "include",
        });
        if (userResp.ok) {
          const userData = await userResp.json();
          const name = userData.email.split("@")[0];
          setUserName(name.charAt(0).toUpperCase() + name.slice(1));
        }

        // Get Documents list
        const docResp = await fetch(`${API_BASE}/documents`, {
          method: "GET",
          credentials: "include",
        });
        if (docResp.ok) {
          const docData = await docResp.json();
          setDocuments(docData);
        }

        // Get Progress list
        const progressResp = await fetch(`${API_BASE}/progress`, {
          method: "GET",
          credentials: "include",
        });
        if (progressResp.ok) {
          const progressData = await progressResp.json();
          setProgress(progressData);
        }

        // Get Learning Goals list
        const goalsResp = await fetch(`${API_BASE}/learning-goals`, {
          method: "GET",
          credentials: "include",
        });
        if (goalsResp.ok) {
          const goalsData = await goalsResp.json();
          const detailedGoals = await Promise.all(
            goalsData.slice(0, 3).map(async (goal: any) => {
              try {
                const detailResp = await fetch(`${API_BASE}/learning-goals/${goal.id}`, {
                  method: "GET",
                  credentials: "include",
                });
                if (detailResp.ok) {
                  return await detailResp.json();
                }
              } catch (e) {
                console.error("Failed to load details for goal", goal.id, e);
              }
              return goal;
            })
          );
          setLearningGoals(detailedGoals);
        }
      } catch (err) {
        console.error("Failed to load dashboard metrics:", err);
      }
    };

    fetchData();

    // Initialize local storage study blocks
    const storedBlocks = localStorage.getItem("sbud_study_blocks");
    if (storedBlocks) {
      setStudyBlocks(JSON.parse(storedBlocks));
    } else {
      const defaultBlocks: StudyBoxItem[] = [
        { id: 1, subject: "Physics", topic: "Momentum", duration: 30, completed: false },
        { id: 2, subject: "Biology", topic: "Mitosis", duration: 20, completed: false },
        { id: 3, subject: "Chemistry", topic: "Acids & Bases", duration: 15, completed: false },
      ];
      localStorage.setItem("sbud_study_blocks", JSON.stringify(defaultBlocks));
      setStudyBlocks(defaultBlocks);
    }

    // Initialize local storage upcoming goals
    const storedGoals = localStorage.getItem("sbud_upcoming_goals");
    if (storedGoals) {
      setUpcomingGoals(JSON.parse(storedGoals));
    } else {
      const defaultGoals: UpcomingGoal[] = [
        { id: 1, goal: "Complete Momentum Quiz", date: "Tomorrow", completed: false },
        { id: 2, goal: "Review Physics notes on Gravity", date: "Friday", completed: false },
        { id: 3, goal: "Study Mitosis diagram in Biology", date: "Next Monday", completed: false },
      ];
      localStorage.setItem("sbud_upcoming_goals", JSON.stringify(defaultGoals));
      setUpcomingGoals(defaultGoals);
    }
  }, []);

  // Save study blocks helper
  const saveStudyBlocks = (newBlocks: StudyBoxItem[]) => {
    setStudyBlocks(newBlocks);
    localStorage.setItem("sbud_study_blocks", JSON.stringify(newBlocks));
  };

  // Save upcoming goals helper
  const saveUpcomingGoals = (newGoals: UpcomingGoal[]) => {
    setUpcomingGoals(newGoals);
    localStorage.setItem("sbud_upcoming_goals", JSON.stringify(newGoals));
  };

  // Active Timer Ticker
  useEffect(() => {
    if (activeTimer && activeTimer.isRunning) {
      timerRef.current = setInterval(() => {
        setActiveTimer((prev) => {
          if (!prev) return null;
          if (prev.timeLeft <= 1) {
            clearInterval(timerRef.current!);
            // Handle completed block
            handleTimerComplete(prev.boxId);
            return null;
          }
          return {
            ...prev,
            timeLeft: prev.timeLeft - 1,
          };
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [activeTimer?.isRunning]);

  const handleStartTimer = (block: StudyBoxItem) => {
    setActiveTimer({
      boxId: block.id,
      subject: block.subject,
      topic: block.topic,
      timeLeft: block.duration * 60,
      isRunning: true,
    });
  };

  const handleToggleTimer = () => {
    setActiveTimer((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        isRunning: !prev.isRunning,
      };
    });
  };

  const handleCancelTimer = () => {
    if (confirm("Are you sure you want to stop this study session? Progress won't be saved.")) {
      setActiveTimer(null);
    }
  };

  const handleTimerComplete = (boxId: number) => {
    const updated = studyBlocks.map((b) => 
      b.id === boxId ? { ...b, completed: true } : b
    );
    saveStudyBlocks(updated);
    setActiveTimer(null);
    alert("Congratulations! Study session completed. Keep it up!");
  };

  const handleToggleGoal = (id: number) => {
    const updated = upcomingGoals.map((g) =>
      g.id === id ? { ...g, completed: !g.completed } : g
    );
    saveUpcomingGoals(updated);
  };

  const handleAskAI = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;
    router.push(`/assistant?q=${encodeURIComponent(aiPrompt.trim())}`);
  };

  // Get Subject level progress calculations
  const getSubjectProgress = () => {
    const subjectStats: Record<string, { correct: number; attempted: number }> = {};
    progress.forEach((rec) => {
      if (!subjectStats[rec.subject]) {
        subjectStats[rec.subject] = { correct: 0, attempted: 0 };
      }
      subjectStats[rec.subject].correct += rec.questions_correct;
      subjectStats[rec.subject].attempted += rec.questions_attempted;
    });

    return Object.entries(subjectStats)
      .map(([subject, stats]) => {
        const accuracy = stats.attempted > 0 ? (stats.correct / stats.attempted) * 100 : 0;
        return { subject, accuracy };
      })
      .sort((a, b) => b.accuracy - a.accuracy);
  };

  const subjectProgressList = getSubjectProgress();

  // Find weak topics (accuracy < 70%) to recommend studying
  const weakTopics = progress.filter((rec) => rec.accuracy < 70.0);

  // Format bytes helper
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  // Timer format display MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <AppShell>
      <div className={styles.container}>
        <div className={styles.greetingSection}>
          <h1 className={styles.greeting}>Good day, {userName}</h1>
          <p className={styles.subGreeting}>Let's dive into your targets and build accuracy today.</p>
        </div>

        {/* Learning Goals Dashboard Overview */}
        {learningGoals.length > 0 && (
          <div className={styles.goalsOverviewSection}>
            <div className={styles.goalsOverviewHeader}>
              <h2 className={styles.sectionTitle}>🎯 Active Learning Goals</h2>
              <span className={styles.cardLink} onClick={() => router.push("/goals")}>Manage Targets</span>
            </div>
            <div className={styles.goalsGrid}>
              {learningGoals.map((goal) => {
                const totalTopics = goal.topics?.length || 0;
                const masteredTopics = goal.topics?.filter((t: any) => t.mastery_status === "Mastered").length || 0;
                const percent = totalTopics > 0 ? (masteredTopics / totalTopics) * 100 : 0;
                return (
                  <div key={goal.id} className={styles.goalCard} onClick={() => router.push("/goals")}>
                    <div className={styles.goalCardTop}>
                      <span className={styles.goalCardTitle} title={goal.title}>{goal.title}</span>
                      <span className={styles.goalCardProgress}>
                        {masteredTopics} / {totalTopics} Mastered
                      </span>
                    </div>
                    <div className={styles.goalProgressBar}>
                      <div 
                        className={styles.goalProgressFill} 
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className={styles.grid}>
          {/* Left Column */}
          <div className={styles.leftCol}>
            {/* Today's Study Section */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  Today's Study
                </h2>
                <span className={styles.cardLink} onClick={() => router.push("/study-plan")}>Edit Plan</span>
              </div>
              
              <div className={styles.studyGrid}>
                {studyBlocks.map((block) => (
                  <div key={block.id} className={styles.studyBox}>
                    <span className={styles.studySubject}>{block.subject}</span>
                    <span className={styles.studyDuration}>{block.topic} ({block.duration} min)</span>
                    {block.completed ? (
                      <span className={styles.startBtn} style={{ background: "rgba(16, 185, 129, 0.2)", color: "var(--success)", border: "1px solid rgba(16, 185, 129, 0.4)", cursor: "default", textAlign: "center" }}>
                        ✓ Studied
                      </span>
                    ) : (
                      <button className={styles.startBtn} onClick={() => handleStartTimer(block)}>
                        Start
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Continue Studying Section */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347" />
                  </svg>
                  Continue Studying
                </h2>
                <span className={styles.cardLink} onClick={() => router.push("/progress")}>View Details</span>
              </div>

              {weakTopics.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {weakTopics.slice(0, 2).map((rec) => (
                    <div key={rec.id} className={styles.continueRow}>
                      <div className={styles.continueInfo}>
                        <span className={styles.continueTopic}>{rec.subject} — {rec.topic}</span>
                        <span className={styles.continueProgress}>
                          Current Accuracy: <span className={styles.weakText}>{Math.round(rec.accuracy)}%</span> (Needs review)
                        </span>
                      </div>
                      <button 
                        className={styles.continueBtn}
                        onClick={() => router.push(`/assistant?q=Help me review my weak topic: ${rec.subject} ${rec.topic}`)}
                      >
                        Ask SBud
                      </button>
                    </div>
                  ))}
                </div>
              ) : progress.length > 0 ? (
                <div className={styles.emptyState}>All studied topics are in good shape (accuracy &gt; 70%)! Generate a quiz to push yourself.</div>
              ) : (
                <div className={styles.emptyState}>No study history found. Generate and take a quiz to track your accuracy metrics!</div>
              )}
            </div>

            {/* Quick Access Materials Section */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                  Study Materials
                </h2>
                <span className={styles.cardLink} onClick={() => router.push("/materials")}>Manage Notes</span>
              </div>

              <div className={styles.materialsList}>
                {documents.slice(0, 3).map((doc) => (
                  <div key={doc.id} className={styles.materialItem} onClick={() => router.push("/materials")}>
                    <span className={styles.materialName}>{doc.filename}</span>
                    <div className={styles.materialDetails}>
                      <span className={styles.materialSize}>{formatBytes(doc.file_size)}</span>
                      <span className={styles.actionIcon}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                        </svg>
                      </span>
                    </div>
                  </div>
                ))}
                {documents.length === 0 && (
                  <div className={styles.emptyState}>No study documents uploaded yet. Go to Materials to upload your first PDF.</div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className={styles.rightCol}>
            {/* AI Assistant Widget Card */}
            <div className={`${styles.card} ${styles.aiWidget}`}>
              <span className={styles.aiHeader}>
                💡 Ask SBud Tutor
              </span>
              <p className={styles.aiDesc}>
                Need a prompt breakdown, homework explanation, or help reviewing notes? Ask your assistant:
              </p>
              <form onSubmit={handleAskAI} className={styles.aiInputGroup}>
                <input 
                  type="text" 
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Ask SBud about momentum..." 
                  className={styles.aiInput}
                />
                <button type="submit" className={styles.aiSendBtn}>Ask</button>
              </form>
            </div>

            {/* Subject Level Progress */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z" />
                  </svg>
                  Subject Progress
                </h2>
                <span className={styles.cardLink} onClick={() => router.push("/progress")}>Details</span>
              </div>

              <div className={styles.progressList}>
                {subjectProgressList.slice(0, 3).map((sub) => (
                  <div key={sub.subject} className={styles.progressItem}>
                    <div className={styles.progressLabel}>
                      <span className={styles.progressSubjectName}>{sub.subject}</span>
                      <span className={styles.progressSubjectPercent}>{Math.round(sub.accuracy)}% accuracy</span>
                    </div>
                    <div className={styles.progressBar}>
                      <div className={styles.progressFill} style={{ width: `${sub.accuracy}%` }} />
                    </div>
                  </div>
                ))}
                {subjectProgressList.length === 0 && (
                  <div className={styles.emptyState}>No studied subjects yet. Try taking some quiz challenges.</div>
                )}
              </div>
            </div>

            {/* Upcoming studies/goals */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4" />
                  </svg>
                  Upcoming Tasks
                </h2>
                <span className={styles.cardLink} onClick={() => router.push("/study-plan")}>Edit</span>
              </div>

              <div className={styles.upcomingList}>
                {upcomingGoals.slice(0, 3).map((goal) => (
                  <div key={goal.id} className={styles.upcomingItem}>
                    <div 
                      className={styles.checkbox} 
                      style={{ 
                        backgroundColor: goal.completed ? "var(--accent-indigo)" : "transparent",
                        borderColor: goal.completed ? "var(--accent-indigo)" : "var(--text-muted)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "white"
                      }}
                      onClick={() => handleToggleGoal(goal.id)}
                    >
                      {goal.completed && (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: 12, height: 12 }}>
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <div className={styles.upcomingDetails}>
                      <span 
                        className={styles.upcomingGoal}
                        style={{ textDecoration: goal.completed ? "line-through" : "none", color: goal.completed ? "var(--text-muted)" : "var(--text-primary)" }}
                      >
                        {goal.goal}
                      </span>
                      <span className={styles.upcomingDate}>{goal.date}</span>
                    </div>
                  </div>
                ))}
                {upcomingGoals.length === 0 && (
                  <div className={styles.emptyState}>All goals caught up! Schedule new goals under Study Plan.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Timer Overlay Modal */}
      {activeTimer && (
        <div className={styles.timerOverlay}>
          <div className={styles.timerCard}>
            <span className={styles.timerTitle}>Study Session Active</span>
            <span className={styles.timerSubject}>{activeTimer.subject} — {activeTimer.topic}</span>
            <span className={styles.timerCounter}>{formatTime(activeTimer.timeLeft)}</span>
            <div className={styles.timerControls}>
              <button className={`${styles.timerBtn} ${styles.timerBtnSecondary}`} onClick={handleToggleTimer}>
                {activeTimer.isRunning ? "Pause" : "Resume"}
              </button>
              <button className={`${styles.timerBtn} ${styles.timerBtnPrimary}`} onClick={() => handleTimerComplete(activeTimer.boxId)}>
                Complete
              </button>
              <button className={`${styles.timerBtn} ${styles.timerBtnDanger}`} onClick={handleCancelTimer}>
                Stop
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
