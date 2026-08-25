"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./progress.module.css";

const API_BASE = "http://localhost:8000";

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

export default function ProgressPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<SubjectGroup[]>([]);
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
      } catch (err: any) {
        setError(err.message || "An unexpected error occurred.");
      } finally {
        setLoading(false);
      }
    };

    fetchProgress();
  }, [router]);

  const handleBackToTutor = () => {
    router.push("/");
  };

  return (
    <div className={styles.container}>
      <div className={styles.glow} />
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Your Progress</h1>
          <button className={styles.backBtn} onClick={handleBackToTutor}>
            <svg
              className={styles.backIcon}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
              />
            </svg>
            <span>Back to Tutor</span>
          </button>
        </div>

        {loading ? (
          <div className={styles.loadingContainer}>
            <div className={styles.spinner} />
            <p>Loading your study statistics...</p>
          </div>
        ) : error ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>{error}</p>
            <button className={styles.studyBtn} onClick={handleBackToTutor}>
              Return to Chat
            </button>
          </div>
        ) : subjects.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIconContainer}>
              <svg
                className={styles.emptyIcon}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
                />
              </svg>
            </div>
            <h2>No Progress Logged Yet</h2>
            <p className={styles.emptyText}>
              Once you generate and submit quizzes from your study guides, your topic statistics will appear here.
            </p>
            <button className={styles.studyBtn} onClick={handleBackToTutor}>
              Start Studying Now
            </button>
          </div>
        ) : (
          subjects.map((sub) => (
            <div key={sub.subject} className={styles.subjectSection}>
              <div className={styles.subjectHeader}>
                <span className={styles.subjectName}>{sub.subject}</span>
                <span className={styles.subjectPercent}>{Math.round(sub.accuracy)}%</span>
              </div>
              <div className={styles.subjectProgressBar}>
                <div
                  className={styles.subjectProgressFill}
                  style={{ width: `${sub.accuracy}%` }}
                />
              </div>

              <div className={styles.topicsContainer}>
                {sub.topics.map((top) => {
                  const isWeak = top.accuracy < 70;
                  return (
                    <div key={top.id} className={styles.topicRow}>
                      <div className={styles.topicMeta}>
                        <span className={styles.topicName}>{top.topic}</span>
                        <div className={styles.topicRight}>
                          <span className={styles.topicStats}>
                            ({top.questions_correct}/{top.questions_attempted} correct)
                          </span>
                          <span className={styles.topicPercent}>{Math.round(top.accuracy)}%</span>
                          {isWeak && (
                            <span className={styles.warningBadge} title="Weak Topic (accuracy < 70%)">
                              ⚠️
                            </span>
                          )}
                        </div>
                      </div>
                      <div className={styles.topicProgressBar}>
                        <div
                          className={`${styles.topicProgressFill} ${
                            isWeak ? styles.topicProgressFillWeak : styles.topicProgressFillGood
                          }`}
                          style={{ width: `${top.accuracy}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
