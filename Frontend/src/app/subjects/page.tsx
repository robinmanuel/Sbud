"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import styles from "./subjects.module.css";

const API_BASE = typeof window !== "undefined" ? `http://${window.location.hostname}:8000` : "http://localhost:8000";

interface ProgressRecord {
  id: number;
  subject: string;
  topic: string;
  questions_attempted: number;
  questions_correct: number;
  accuracy: number;
  last_studied_at: string;
}

interface SubjectGroup {
  subject: string;
  attempted: number;
  correct: number;
  accuracy: number;
  topics: ProgressRecord[];
}

export default function SubjectsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<SubjectGroup[]>([]);
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchProgress = async () => {
      try {
        const resp = await fetch(`${API_BASE}/progress`, {
          method: "GET",
          credentials: "include",
        });

        if (resp.status === 401) {
          router.push("/login");
          return;
        }

        if (!resp.ok) {
          throw new Error("Failed to load progress data.");
        }

        const data: ProgressRecord[] = await resp.json();
        
        // Group by subject
        const groups: Record<string, SubjectGroup> = {};
        data.forEach((rec) => {
          if (!groups[rec.subject]) {
            groups[rec.subject] = {
              subject: rec.subject,
              attempted: 0,
              correct: 0,
              accuracy: 0,
              topics: [],
            };
          }
          groups[rec.subject].attempted += rec.questions_attempted;
          groups[rec.subject].correct += rec.questions_correct;
          groups[rec.subject].topics.push(rec);
        });

        // Calculate subject-level accuracy
        const subjectList = Object.values(groups).map((group) => {
          const accuracy = group.attempted > 0 
            ? (group.correct / group.attempted) * 100 
            : 0;
          return {
            ...group,
            accuracy,
            topics: group.topics.sort((a, b) => a.topic.localeCompare(b.topic)),
          };
        });

        // Sort subjects by name
        subjectList.sort((a, b) => a.subject.localeCompare(b.subject));

        setSubjects(subjectList);
        if (subjectList.length > 0) {
          setExpandedSubject(subjectList[0].subject);
        }
      } catch (err: any) {
        setError(err.message || "An unexpected error occurred.");
      } finally {
        setLoading(false);
      }
    };

    fetchProgress();
  }, [router]);

  const toggleSubject = (subjectName: string) => {
    setExpandedSubject(expandedSubject === subjectName ? null : subjectName);
  };

  return (
    <AppShell>
      <div className={styles.container}>
        <div>
          <h1 className={styles.title}>Subjects Library</h1>
          <p className={styles.desc}>Explore your study metrics grouped by subject. Inspect specific topic accuracy ratings, identify weak categories, and trigger reviews with your AI tutor.</p>
        </div>

        {loading ? (
          <div className={styles.loaderArea}>
            <div className={styles.spinner} />
            <p>Loading subjects portfolio...</p>
          </div>
        ) : error ? (
          <div className={styles.alertError}>{error}</div>
        ) : subjects.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <h3>No Subjects Tracked</h3>
            <p>You haven't completed any quizzes yet. Upload a study guide and start practicing to track accuracy details for your subjects.</p>
            <button className={styles.emptyActionBtn} onClick={() => router.push("/quizzes")}>Practice a Quiz</button>
          </div>
        ) : (
          <div className={styles.accordionContainer}>
            {subjects.map((sub) => {
              const isExpanded = expandedSubject === sub.subject;
              return (
                <div key={sub.subject} className={`${styles.subjectCard} ${isExpanded ? styles.cardActive : ""}`}>
                  <header 
                    className={styles.cardHeader} 
                    onClick={() => toggleSubject(sub.subject)}
                  >
                    <div className={styles.headerLeft}>
                      <div className={styles.folderIcon}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25H12a1.5 1.5 0 0 1-1.06-.44Z" />
                        </svg>
                      </div>
                      <span className={styles.subjectName}>{sub.subject}</span>
                    </div>

                    <div className={styles.headerRight}>
                      <div className={styles.subjectProgressArea}>
                        <span className={styles.subjectAccuracy}>{Math.round(sub.accuracy)}% accuracy</span>
                        <div className={styles.progressBar}>
                          <div className={styles.progressFill} style={{ width: `${sub.accuracy}%` }} />
                        </div>
                      </div>
                      <button className={styles.expandChevron} aria-label="Toggle details">
                        <svg 
                          xmlns="http://www.w3.org/2000/svg" 
                          fill="none" 
                          viewBox="0 0 24 24" 
                          strokeWidth={2.5} 
                          stroke="currentColor"
                          style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                        </svg>
                      </button>
                    </div>
                  </header>

                  {isExpanded && (
                    <div className={styles.cardContent}>
                      <div className={styles.topicsHeader}>
                        <span>Topic Review Areas</span>
                        <span>Performance Summary</span>
                      </div>

                      <div className={styles.topicsList}>
                        {sub.topics.map((top) => {
                          const isWeak = top.accuracy < 70;
                          return (
                            <div key={top.id} className={styles.topicRow}>
                              <div className={styles.topicNameGroup}>
                                <span className={styles.topicName}>{top.topic}</span>
                                {isWeak && (
                                  <span className={styles.weakBadge} title="Weak Topic (accuracy < 70%)">
                                    ⚠️ Weak
                                  </span>
                                )}
                              </div>

                              <div className={styles.topicStatsGroup}>
                                <span className={styles.correctStats}>
                                  ({top.questions_correct}/{top.questions_attempted} correct)
                                </span>
                                <span className={styles.topicPercent}>{Math.round(top.accuracy)}% accuracy</span>
                                <button 
                                  className={styles.reviewBtn}
                                  onClick={() => router.push(`/assistant?q=Help me study ${sub.subject}: ${top.topic}`)}
                                >
                                  Ask SBud
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className={styles.cardFooter}>
                        <button className={styles.footerBtn} onClick={() => router.push("/quizzes")}>
                          Start Practice Quiz
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
