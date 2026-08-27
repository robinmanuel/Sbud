"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import styles from "./goals.module.css";

const API_BASE = typeof window !== "undefined" ? `http://${window.location.hostname}:8000` : "http://localhost:8000";

interface StudyDocument {
  id: number;
  filename: string;
  file_type: string;
  file_size: number;
  created_at: string;
}

interface TopicProgressDetail {
  id: number;
  name: string;
  questions_attempted: number;
  questions_correct: number;
  accuracy: number;
  mastery_status: "Not Started" | "Mastered" | "Reviewing" | "Needs Practice";
}

interface LearningGoal {
  id: number;
  user_id: number;
  title: string;
  description: string | null;
  completed: boolean;
  created_at: string;
  topics: { id: number; name: string }[];
}

interface LearningGoalDetail {
  id: number;
  user_id: number;
  title: string;
  description: string | null;
  completed: boolean;
  created_at: string;
  topics: TopicProgressDetail[];
  document_ids: number[];
  quiz_ids: number[];
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<LearningGoal[]>([]);
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [selectedGoalId, setSelectedGoalId] = useState<number | null>(null);
  const [selectedGoalDetail, setSelectedGoalDetail] = useState<LearningGoalDetail | null>(null);
  
  const [loadingGoals, setLoadingGoals] = useState(true);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [creatingGoal, setCreatingGoal] = useState(false);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [goalTitle, setGoalTitle] = useState("");
  const [goalDescription, setGoalDescription] = useState("");
  const [selectedDocId, setSelectedDocId] = useState("");

  const router = useRouter();

  useEffect(() => {
    fetchGoals();
    fetchDocuments();
  }, []);

  useEffect(() => {
    if (selectedGoalId !== null) {
      fetchGoalDetail(selectedGoalId);
    } else {
      setSelectedGoalDetail(null);
    }
  }, [selectedGoalId]);

  const fetchGoals = async () => {
    setLoadingGoals(true);
    try {
      const resp = await fetch(`${API_BASE}/learning-goals`, {
        method: "GET",
        credentials: "include",
      });
      if (resp.status === 401) {
        router.push("/login");
        return;
      }
      if (resp.ok) {
        const data = await resp.json();
        setGoals(data);
        if (data.length > 0 && selectedGoalId === null) {
          setSelectedGoalId(data[0].id);
        }
      } else {
        throw new Error("Failed to load learning goals.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load learning goals.");
    } finally {
      setLoadingGoals(false);
    }
  };

  const fetchDocuments = async () => {
    setLoadingDocs(true);
    try {
      const resp = await fetch(`${API_BASE}/documents`, {
        method: "GET",
        credentials: "include",
      });
      if (resp.ok) {
        const data = await resp.json();
        setDocuments(data);
      }
    } catch (err) {
      console.error("Failed to load documents", err);
    } finally {
      setLoadingDocs(false);
    }
  };

  const fetchGoalDetail = async (goalId: number) => {
    setLoadingDetail(true);
    try {
      const resp = await fetch(`${API_BASE}/learning-goals/${goalId}`, {
        method: "GET",
        credentials: "include",
      });
      if (resp.ok) {
        const data = await resp.json();
        setSelectedGoalDetail(data);
      } else {
        throw new Error("Failed to load learning goal details.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load details.");
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalTitle.trim() && !selectedDocId) {
      setError("Please specify what you are learning or select an uploaded syllabus document.");
      return;
    }

    setCreatingGoal(true);
    setError(null);

    try {
      const payload = {
        title: goalTitle.trim() || null,
        description: goalDescription.trim() || null,
        document_id: selectedDocId ? parseInt(selectedDocId) : null,
      };

      const resp = await fetch(`${API_BASE}/learning-goals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });

      if (!resp.ok) {
        const errData = await resp.json();
        throw new Error(errData.detail || "Failed to generate learning goal.");
      }

      const newGoal = await resp.json();
      setGoals((prev) => [newGoal, ...prev]);
      setSelectedGoalId(newGoal.id);
      
      // Clear Form
      setGoalTitle("");
      setGoalDescription("");
      setSelectedDocId("");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to create goal.");
    } finally {
      setCreatingGoal(false);
    }
  };

  const handleDeleteGoal = async (goalId: number) => {
    if (!confirm("Are you sure you want to delete this learning goal? This will delete all associated subtopics.")) {
      return;
    }
    try {
      const resp = await fetch(`${API_BASE}/learning-goals/${goalId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (resp.ok) {
        setGoals((prev) => prev.filter((g) => g.id !== goalId));
        if (selectedGoalId === goalId) {
          setSelectedGoalId(null);
          setSelectedGoalDetail(null);
        }
      }
    } catch (err) {
      console.error("Failed to delete goal", err);
    }
  };

  const handleGenerateGoalQuiz = async () => {
    if (!selectedGoalDetail) return;
    if (selectedGoalDetail.document_ids.length === 0) {
      alert("Please upload and associate study materials with this goal first to generate a quiz.");
      return;
    }

    setGeneratingQuiz(true);
    setError(null);

    try {
      const payload = {
        document_id: selectedGoalDetail.document_ids[0],
        learning_goal_id: selectedGoalDetail.id,
      };

      const resp = await fetch(`${API_BASE}/quizzes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });

      if (!resp.ok) {
        const errData = await resp.json();
        throw new Error(errData.detail || "Failed to generate quiz.");
      }

      const generatedQuiz = await resp.json();
      // Redirect to the active quiz runner on Sbud
      router.push(`/quizzes?quizId=${generatedQuiz.id}`);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Quiz generation failed. Please try again.");
    } finally {
      setGeneratingQuiz(false);
    }
  };

  const handleStartTutorSession = () => {
    if (!selectedGoalDetail) return;
    const topicList = selectedGoalDetail.topics.map(t => t.name).join(", ");
    const studyPrompt = `Help me study my learning goal: "${selectedGoalDetail.title}". I want to review the subtopics: ${topicList}.`;
    router.push(`/assistant?q=${encodeURIComponent(studyPrompt)}`);
  };

  const getMasteryColorClass = (status: string) => {
    switch (status) {
      case "Mastered": return styles.statusMastered;
      case "Reviewing": return styles.statusReviewing;
      case "Needs Practice": return styles.statusNeedsPractice;
      default: return styles.statusNotStarted;
    }
  };

  return (
    <AppShell>
      <div className={styles.container}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>Learning Targets & Curriculum</h1>
            <p className={styles.desc}>
              Break down your major study targets into concepts. Upload notes or tell us what you're studying, and our AI tutor decomposes it into discrete subtopics. We'll track quiz scores against each topic to prove if you actually know it.
            </p>
          </div>
        </div>

        {error && (
          <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "var(--danger)", padding: "1rem", borderRadius: "12px", fontSize: "0.9rem" }}>
            ⚠️ {error}
          </div>
        )}

        <div className={styles.layoutGrid}>
          {/* Left Column: List and Creation */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            
            {/* Goal Creation Card */}
            <div className={styles.card}>
              <h2 className={styles.cardHeader}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Set New Study Target
              </h2>
              <form onSubmit={handleCreateGoal} className={styles.form}>
                
                <div className={styles.formGroup}>
                  <label>Option A: What are you learning?</label>
                  <input
                    type="text"
                    value={goalTitle}
                    onChange={(e) => setGoalTitle(e.target.value)}
                    placeholder="e.g. Learn Python for my university exam"
                    className={styles.input}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Option B: Syllabus / Notes Material</label>
                  <select
                    value={selectedDocId}
                    onChange={(e) => setSelectedDocId(e.target.value)}
                    className={styles.select}
                  >
                    <option value="">-- Decompose uploaded material --</option>
                    {documents.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        📄 {doc.filename}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Description / Deadline Notes (Optional)</label>
                  <textarea
                    value={goalDescription}
                    onChange={(e) => setGoalDescription(e.target.value)}
                    placeholder="e.g. Exam is on Monday, need to focus on OOP concepts."
                    className={styles.textarea}
                  />
                </div>

                <button
                  type="submit"
                  disabled={creatingGoal}
                  className={styles.submitBtn}
                >
                  {creatingGoal ? "AI Decomposing Curriculum..." : "Define Target Goal"}
                </button>
              </form>
            </div>

            {/* Target Goals Directory */}
            <div className={styles.card}>
              <h2 className={styles.cardHeader}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.03 0 1.9.693 2.166 1.638m-7.377 12.408-.077.032a1.875 1.875 0 0 1-2.457-2.217l.076-.032a1.875 1.875 0 0 0 1.1-2.12l-.076-.032a1.875 1.875 0 0 1 2.457-2.217l.077.032a1.875 1.875 0 0 0 1.1 2.12l.076.032Z" />
                </svg>
                Targets Portfolio
              </h2>
              {loadingGoals ? (
                <div className={styles.spinnerWrapper}>
                  <div className={styles.spinner} />
                </div>
              ) : goals.length === 0 ? (
                <div className={styles.emptyState}>
                  <p className={styles.emptyTitle}>No study targets yet</p>
                  <p className={styles.emptyDesc}>Fill out the form above to define your first educational goal.</p>
                </div>
              ) : (
                <div className={styles.goalsList}>
                  {goals.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setSelectedGoalId(g.id)}
                      className={`${styles.goalItem} ${selectedGoalId === g.id ? styles.goalItemActive : ""}`}
                    >
                      <div className={styles.goalInfo}>
                        <div className={styles.goalName}>
                          {g.title}
                          {g.completed && <span className={styles.completedBadge}>Mastered</span>}
                        </div>
                        <div className={styles.goalMeta}>
                          {g.topics.length} topics decomposed
                        </div>
                      </div>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={styles.goalChevron}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                      </svg>
                    </button>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Right Column: Goal Detail Dashboard */}
          <div>
            {loadingDetail ? (
              <div className={`${styles.card} ${styles.goalSkeleton}`}>
                <div className={styles.spinner} />
                <p style={{ marginLeft: "0.5rem" }}>Calculating mastery maps...</p>
              </div>
            ) : selectedGoalDetail ? (
              <div className={styles.card}>
                
                {/* Detail Header */}
                <div className={styles.detailHeader}>
                  <div style={{ flex: 1 }}>
                    <h2 className={styles.goalTitle}>{selectedGoalDetail.title}</h2>
                    {selectedGoalDetail.description && (
                      <p className={styles.goalDesc}>{selectedGoalDetail.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteGoal(selectedGoalDetail.id)}
                    className={styles.deleteBtn}
                  >
                    Delete Target
                  </button>
                </div>

                {/* Topics Progress Tree */}
                <div>
                  <h3 className={styles.metaSectionTitle} style={{ marginBottom: "0.8rem" }}>
                    ├── Curriculum Breakdown
                  </h3>
                  <div className={styles.topicTree}>
                    {selectedGoalDetail.topics.map((t) => (
                      <div key={t.id} className={styles.topicRow}>
                        <div className={styles.topicLeft}>
                          <span className={styles.treePrefix}>├──</span>
                          <span className={styles.topicName}>{t.name}</span>
                        </div>
                        <div className={styles.topicRight}>
                          {t.questions_attempted > 0 && (
                            <span className={styles.topicStats}>
                              ({t.questions_correct}/{t.questions_attempted} correct)
                            </span>
                          )}
                          <span className={`${styles.masteryBadge} ${getMasteryColorClass(t.mastery_status)}`}>
                            {t.mastery_status === "Not Started" ? "Not Attempted" : `${t.mastery_status} (${Math.round(t.accuracy)}%)`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Attached Notes & Materials */}
                <div className={styles.metaSection}>
                  <h3 className={styles.metaSectionTitle}>Attached Resources</h3>
                  <div className={styles.metaList}>
                    {selectedGoalDetail.document_ids.length === 0 ? (
                      <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                        No study guides linked yet. Set a new study target by selecting an uploaded document to link them.
                      </p>
                    ) : (
                      selectedGoalDetail.document_ids.map((docId) => {
                        const docObj = documents.find((d) => d.id === docId);
                        return docObj ? (
                          <div key={docId} className={styles.metaItem}>
                            <svg className={styles.metaIcon} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 14, height: 14 }}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                            </svg>
                            <span>{docObj.filename}</span>
                          </div>
                        ) : null;
                      })
                    )}
                  </div>
                </div>

                {/* Primary Action Buttons */}
                <div className={styles.buttonGroup}>
                  <button
                    onClick={handleGenerateGoalQuiz}
                    disabled={generatingQuiz || selectedGoalDetail.document_ids.length === 0}
                    className={styles.primaryBtn}
                    title={selectedGoalDetail.document_ids.length === 0 ? "Upload notes under this target to practice" : "Generate targeted quiz questions"}
                  >
                    {generatingQuiz ? (
                      "Generating Quiz..."
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 16, height: 16 }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.03 0 1.9.693 2.166 1.638m-7.377 12.408-.077.032a1.875 1.875 0 0 1-2.457-2.217l.076-.032a1.875 1.875 0 0 0 1.1-2.12l-.076-.032a1.875 1.875 0 0 1 2.457-2.217l.077.032a1.875 1.875 0 0 0 1.1 2.12l.076.032Z" />
                        </svg>
                        Practice Target Quiz
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleStartTutorSession}
                    className={styles.secondaryBtn}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 16, height: 16 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z" />
                    </svg>
                    Study Goal with SBud
                  </button>
                </div>

              </div>
            ) : (
              <div className={styles.card} style={{ height: "300px", justifyContent: "center", alignItems: "center" }}>
                <div className={styles.emptyState}>
                  <svg className={styles.emptyIcon} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                  </svg>
                  <p className={styles.emptyTitle}>Select a study target</p>
                  <p className={styles.emptyDesc}>Choose a learning goal from the target portfolio list to inspect your dynamic mastery maps.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
