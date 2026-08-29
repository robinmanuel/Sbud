"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import styles from "./materials.module.css";

const API_BASE = typeof window !== "undefined" ? `http://${window.location.hostname}:8000` : "http://localhost:8000";

interface StudyDocument {
  id: number;
  filename: string;
  file_type: string;
  file_size: number;
  created_at: string;
}

interface SavedSummary {
  id: number;
  topic_name: string;
  document_name: string;
  created_at: string;
}

interface SavedQuiz {
  id: number;
  title: string;
  score: number;
  total_questions: number;
  created_at: string;
}

interface SavedFlashcard {
  id: number;
  topic_name: string;
  question: string;
  created_at: string;
}

interface PreviousWork {
  summaries: SavedSummary[];
  quizzes: SavedQuiz[];
  flashcards: SavedFlashcard[];
}

type LibraryFilter = "all" | "documents" | "summaries" | "quizzes" | "flashcards";

export default function MaterialsPage() {
  const [activeFilter, setActiveFilter] = useState<LibraryFilter>("all");
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [previousWork, setPreviousWork] = useState<PreviousWork>({
    summaries: [],
    quizzes: [],
    flashcards: []
  });
  
  // Loading & Error states
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Immersive Reader View States
  const [readerDoc, setReaderDoc] = useState<StudyDocument | null>(null);
  const [readerText, setReaderText] = useState<string>("");
  const [loadingReader, setLoadingReader] = useState<boolean>(false);

  // Detail Modals Review States
  const [activeSummary, setActiveSummary] = useState<SavedSummary | null>(null);
  const [summaryBody, setSummaryBody] = useState<string>("");
  const [loadingSummaryBody, setLoadingSummaryBody] = useState<boolean>(false);

  const [activeFlashcard, setActiveFlashcard] = useState<SavedFlashcard | null>(null);
  const [flashcardAnswer, setFlashcardAnswer] = useState<string>("");
  const [revealFlashcardAns, setRevealFlashcardAns] = useState<boolean>(false);

  const router = useRouter();

  // Load documents and previous study items
  const loadLibraryData = async () => {
    try {
      // 1. Fetch documents
      const docResp = await fetch(`${API_BASE}/documents`, {
        method: "GET",
        credentials: "include",
      });
      if (!docResp.ok) throw new Error("Could not load study documents.");
      const docData = await docResp.json();
      setDocuments(docData);

      // 2. Fetch previous work logs (summaries, quizzes, cards)
      const workResp = await fetch(`${API_BASE}/materials/previous-work`, {
        method: "GET",
        credentials: "include",
      });
      if (workResp.ok) {
        const workData = await workResp.json();
        setPreviousWork(workData);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load study library.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLibraryData();
  }, []);

  const handleDeleteDocument = async (e: React.MouseEvent, docId: number) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this study material? All topics, saved quizzes, and progress will be deleted.")) return;

    try {
      const resp = await fetch(`${API_BASE}/documents/${docId}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!resp.ok) throw new Error("Deletion failed.");
      
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      // Refresh previous work to wipe out cascades
      loadLibraryData();
    } catch (err: any) {
      alert(err.message || "Failed to delete document.");
    }
  };

  // Open Distraction-Free Reader View
  const handleOpenReader = async (doc: StudyDocument) => {
    setReaderDoc(doc);
    setLoadingReader(true);
    setReaderText("");
    try {
      const resp = await fetch(`${API_BASE}/documents/${doc.id}/text`, {
        method: "GET",
        credentials: "include"
      });
      if (!resp.ok) throw new Error();
      const data = await resp.json();
      setReaderText(data.text || "No text could be extracted from this document.");
    } catch (e) {
      setReaderText("Error loading document text.");
    } finally {
      setLoadingReader(false);
    }
  };

  // Open Saved Summary Modal
  const handleOpenSummary = async (sum: SavedSummary) => {
    setActiveSummary(sum);
    setLoadingSummaryBody(true);
    setSummaryBody("");
    try {
      const resp = await fetch(`${API_BASE}/topics/${sum.id}/summarize`, {
        method: "POST",
        credentials: "include"
      });
      if (!resp.ok) throw new Error();
      const data = await resp.json();
      setSummaryBody(data.summary);
    } catch (e) {
      setSummaryBody("Error loading topic summary.");
    } finally {
      setLoadingSummaryBody(false);
    }
  };

  // Open Saved Flashcard Modal
  const handleOpenFlashcard = async (fc: SavedFlashcard) => {
    setActiveFlashcard(fc);
    setRevealFlashcardAns(false);
    setFlashcardAnswer("");
    try {
      const resp = await fetch(`${API_BASE}/topics/${fc.topic_name}/recall`, {
        method: "POST",
        credentials: "include"
      });
      // Fallback find if query fail
      if (resp.ok) {
        const data = await resp.json();
        setFlashcardAnswer(data.answer);
      } else {
        setFlashcardAnswer("Click 'Change Topic' in the assistant workspace to review flashcards.");
      }
    } catch (e) {
      setFlashcardAnswer("Click 'Change Topic' in the assistant workspace to review flashcards.");
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <AppShell>
      <div className={styles.container}>
        {/* Left Sidebar Filter Column */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarTitle}>Library Filter</div>
          <div className={styles.sidebarMenu}>
            {[
              { id: "all", name: "All Files", emoji: "🗂️" },
              { id: "documents", name: "Documents", emoji: "📄" },
              { id: "summaries", name: "Summaries", emoji: "📝" },
              { id: "quizzes", name: "Quizzes", emoji: "📝" },
              { id: "flashcards", name: "Flashcards", emoji: "🧠" }
            ].map((link) => (
              <div 
                key={link.id} 
                className={`${styles.sidebarLink} ${activeFilter === link.id ? styles.sidebarLinkActive : ""}`}
                onClick={() => setActiveFilter(link.id as LibraryFilter)}
              >
                <span className={styles.sidebarLinkIcon}>{link.emoji}</span>
                <span>{link.name}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* Right Library Content Column */}
        <main className={styles.mainArea}>
          {error && (
            <div style={{ padding: "1rem", backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid var(--danger)", borderRadius: "12px", color: "var(--danger)", fontSize: "0.85rem" }}>
              {error}
            </div>
          )}

          {loading ? (
            <div className={styles.loader} style={{ padding: "4rem 0" }}>
              <div className={styles.spinner} style={{ margin: "auto" }} />
              <p style={{ marginTop: "1rem" }}>Loading library materials...</p>
            </div>
          ) : (
            <>
              {/* 1. Documents Section */}
              {(activeFilter === "all" || activeFilter === "documents") && (
                <div>
                  <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: "20px", height: "20px" }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                      </svg>
                      Study Documents
                    </h2>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{documents.length} Files</span>
                  </div>

                  {documents.length === 0 ? (
                    <div className={styles.workCard} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                      No documents uploaded yet. Go to Assistant to upload material.
                    </div>
                  ) : (
                    <div className={styles.grid}>
                      {documents.map((doc) => (
                        <div key={doc.id} className={styles.docCard} onClick={() => handleOpenReader(doc)}>
                          <div className={styles.docInfo}>
                            <span className={styles.docIcon}>
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                              </svg>
                            </span>
                            <div className={styles.docDetails}>
                              <span className={styles.docTitle}>
                                {doc.filename.startsWith("Custom Curriculum: ") 
                                  ? doc.filename.replace("Custom Curriculum: ", "").replace(".pdf", "")
                                  : doc.filename
                                }
                              </span>
                              <span className={styles.docMeta}>{formatBytes(doc.file_size)}</span>
                            </div>
                          </div>
                          
                          <button 
                            className={styles.deleteBtn}
                            onClick={(e) => handleDeleteDocument(e, doc.id)}
                            title="Delete Material"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: "16px", height: "16px" }}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.34 9m-4.72 0-.34-9m9.96-3-3.2 13.6a2 2 0 0 1-2.1 1.4H9.7a2 2 0 0 1-2.1-1.4L4.4 6m8-3V1.5a1.5 1.5 0 0 1 3 0V3M4 6h16" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 2. Previous Work Section */}
              {activeFilter !== "documents" && (
                <div>
                  <div className={styles.sectionHeader} style={{ marginTop: "1rem" }}>
                    <h2 className={styles.sectionTitle}>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: "20px", height: "20px" }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                      </svg>
                      Previous Saved Work
                    </h2>
                  </div>

                  <div className={styles.grid}>
                    {/* Summaries filter list */}
                    {(activeFilter === "all" || activeFilter === "summaries") && 
                      previousWork.summaries.map((sum) => (
                        <div key={sum.id} className={styles.workCard} onClick={() => handleOpenSummary(sum)}>
                          <div className={styles.workHeader}>
                            <span className={`${styles.workBadge} ${styles.badgeSummary}`}>Summary</span>
                            <span className={styles.workMeta}>{sum.document_name.split(".")[0]}</span>
                          </div>
                          <h3 className={styles.workTitle}>{sum.topic_name}</h3>
                          <span className={styles.workMeta}>Saved during study session</span>
                        </div>
                      ))
                    }

                    {/* Quizzes filter list */}
                    {(activeFilter === "all" || activeFilter === "quizzes") && 
                      previousWork.quizzes.map((quiz) => (
                        <div key={quiz.id} className={styles.workCard} onClick={() => router.push(`/assistant`)}>
                          <div className={styles.workHeader}>
                            <span className={`${styles.workBadge} ${styles.badgeQuiz}`}>Quiz Result</span>
                            <span className={styles.workMeta}>Graded</span>
                          </div>
                          <h3 className={styles.workTitle}>{quiz.title}</h3>
                          <span className={styles.workMeta} style={{ color: "var(--success)", fontWeight: 700 }}>
                            Score: {quiz.score} / {quiz.total_questions}
                          </span>
                        </div>
                      ))
                    }

                    {/* Flashcards filter list */}
                    {(activeFilter === "all" || activeFilter === "flashcards") && 
                      previousWork.flashcards.map((fc) => (
                        <div key={fc.id} className={styles.workCard} onClick={() => handleOpenFlashcard(fc)}>
                          <div className={styles.workHeader}>
                            <span className={`${styles.workBadge} ${styles.badgeFlashcard}`}>Flashcard</span>
                            <span className={styles.workMeta}>{fc.topic_name}</span>
                          </div>
                          <h3 className={styles.workTitle}>"{fc.question}"</h3>
                          <span className={styles.workMeta}>Click to reveal answer key</span>
                        </div>
                      ))
                    }

                    {/* Empty lists check */}
                    {activeFilter === "summaries" && previousWork.summaries.length === 0 && (
                      <div className={styles.emptyState} style={{ gridColumn: "1 / -1" }}>No saved summaries found.</div>
                    )}
                    {activeFilter === "quizzes" && previousWork.quizzes.length === 0 && (
                      <div className={styles.emptyState} style={{ gridColumn: "1 / -1" }}>No completed quizzes found.</div>
                    )}
                    {activeFilter === "flashcards" && previousWork.flashcards.length === 0 && (
                      <div className={styles.emptyState} style={{ gridColumn: "1 / -1" }}>No active recall flashcards created yet.</div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Immersive Distraction-Free Reader View Modal Overlay */}
      {readerDoc && (
        <div className={styles.readerOverlay}>
          <div className={styles.readerCard}>
            <header className={styles.readerHeader}>
              <h2 className={styles.readerTitle}>
                {readerDoc.filename.startsWith("Custom Curriculum: ") 
                  ? readerDoc.filename.replace("Custom Curriculum: ", "").replace(".pdf", "")
                  : readerDoc.filename
                }
              </h2>
              <div className={styles.readerHeaderActions}>
                <button 
                  className={styles.studyBtn}
                  onClick={() => router.push(`/assistant?docId=${readerDoc.id}`)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" style={{ width: "16px", height: "16px" }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                  </svg>
                  Study this material
                </button>
                <button 
                  className={styles.closeBtn}
                  onClick={() => setReaderDoc(null)}
                  title="Close Reader"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: "20px", height: "20px" }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </header>
            
            <div className={styles.readerContent}>
              {loadingReader ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "1rem" }}>
                  <div className={styles.spinner} />
                  <span>Preparing document view...</span>
                </div>
              ) : (
                readerText
              )}
            </div>
          </div>
        </div>
      )}

      {/* Summary Review Modal */}
      {activeSummary && (
        <div className={styles.readerOverlay} onClick={() => setActiveSummary(null)}>
          <div className={styles.detailModalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <span className={`${styles.workBadge} ${styles.badgeSummary}`}>Syllabus Summary</span>
                <h3 className={styles.detailTitle} style={{ marginTop: "0.5rem" }}>{activeSummary.topic_name}</h3>
                <span className={styles.detailSub}>{activeSummary.document_name.split(".")[0]}</span>
              </div>
              <button className={styles.closeBtn} onClick={() => setActiveSummary(null)}>✕</button>
            </div>
            
            <div className={styles.detailBody} style={{ borderTop: "1px solid var(--border-light)", paddingTop: "1rem" }}>
              {loadingSummaryBody ? (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <div className={styles.spinner} style={{ width: "20px", height: "20px" }} />
                  <span>Loading summary...</span>
                </div>
              ) : (
                summaryBody
              )}
            </div>
          </div>
        </div>
      )}

      {/* Flashcard Review Modal */}
      {activeFlashcard && (
        <div className={styles.readerOverlay} onClick={() => setActiveFlashcard(null)}>
          <div className={styles.detailModalCard} onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span className={`${styles.workBadge} ${styles.badgeFlashcard}`}>Flashcard selfcheck</span>
              <button className={styles.closeBtn} onClick={() => setActiveFlashcard(null)}>✕</button>
            </div>
            
            <div style={{ margin: "1.5rem 0" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: "0.5rem" }}>Question:</span>
              <p style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text-primary)" }}>"{activeFlashcard.question}"</p>
            </div>

            <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: "1.5rem" }}>
              {!revealFlashcardAns ? (
                <button 
                  className={styles.studyBtn} 
                  style={{ width: "100%", justifyContent: "center" }}
                  onClick={() => setRevealFlashcardAns(true)}
                >
                  Reveal Correct Answer
                </button>
              ) : (
                <div style={{ animation: "fadeIn 0.2s ease-out" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--success)", display: "block", marginBottom: "0.5rem", fontWeight: 700 }}>Answer:</span>
                  <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>{flashcardAnswer || "Loading answer..."}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
