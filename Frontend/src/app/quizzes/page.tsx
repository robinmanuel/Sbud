"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import styles from "./quizzes.module.css";

const API_BASE = typeof window !== "undefined" ? `http://${window.location.hostname}:8000` : "http://localhost:8000";

interface StudyDocument {
  id: number;
  filename: string;
  file_type: string;
  file_size: number;
  created_at: string;
}

interface QuizQuestion {
  id: number;
  question_text: string;
  options: string[];
}

interface Quiz {
  id: number;
  document_id: number;
  title: string;
  created_at: string;
  questions: QuizQuestion[];
}

interface GradedQuestion {
  id: number;
  question_text: string;
  options: string[];
  student_answer: string | null;
  correct_answer: string;
  explanation: string;
  is_correct: boolean;
}

interface QuizResult {
  id: number;
  document_id: number;
  title: string;
  score: number;
  total_questions: number;
  created_at: string;
  questions: GradedQuestion[];
}

function QuizzesInner() {
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active quiz runner state
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isSubmittingQuiz, setIsSubmittingQuiz] = useState(false);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const autoQuizId = searchParams.get("quizId");

  useEffect(() => {
    const initPage = async () => {
      try {
        // Load documents list
        const docResp = await fetch(`${API_BASE}/documents`, {
          method: "GET",
          credentials: "include",
        });

        if (docResp.ok) {
          const docData = await docResp.json();
          setDocuments(docData);
        }

        // If quizId query param is present, load it immediately
        if (autoQuizId) {
          await loadAndStartQuiz(parseInt(autoQuizId));
        }
      } catch (err: any) {
        setError(err.message || "Failed to initialize quizzes page.");
      } finally {
        setLoading(false);
      }
    };

    initPage();
  }, [autoQuizId]);

  // Load and start quiz
  const loadAndStartQuiz = async (quizId: number) => {
    setIsGeneratingQuiz(true);
    setError(null);
    try {
      const resp = await fetch(`${API_BASE}/quizzes/${quizId}`, {
        method: "GET",
        credentials: "include",
      });

      if (!resp.ok) {
        throw new Error("Failed to load quiz details.");
      }

      const data = await resp.json();
      setActiveQuiz(data);
      setQuizAnswers({});
      setCurrentQuestionIndex(0);
      setQuizResult(null);

      // Clean query params so refresh doesn't trigger quiz restart
      router.replace("/quizzes");
    } catch (err: any) {
      setError(err.message || "Failed to start quiz.");
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  // Generate study quiz
  const handleGenerateQuiz = async (docId: number) => {
    setIsGeneratingQuiz(true);
    setError(null);
    setActiveQuiz(null);
    try {
      const resp = await fetch(`${API_BASE}/quizzes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ document_id: docId }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to generate quiz from study guide.");
      }

      const data = await resp.json();
      setActiveQuiz(data);
      setQuizAnswers({});
      setCurrentQuestionIndex(0);
      setQuizResult(null);
    } catch (err: any) {
      setError(err.message || "Failed to generate quiz.");
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  // Select quiz choice A/B/C/D
  const handleSelectOption = (questionId: number, optionLetter: string) => {
    setQuizAnswers((prev) => ({
      ...prev,
      [questionId]: optionLetter,
    }));
  };

  // Submit quiz for grading
  const handleSubmitQuiz = async () => {
    if (!activeQuiz) return;
    setIsSubmittingQuiz(true);
    try {
      const stringifiedAnswers: Record<string, string> = {};
      Object.entries(quizAnswers).forEach(([qid, ans]) => {
        stringifiedAnswers[qid] = ans;
      });

      const resp = await fetch(`${API_BASE}/quizzes/${activeQuiz.id}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ answers: stringifiedAnswers }),
      });

      if (!resp.ok) {
        throw new Error("Failed to grade the quiz.");
      }

      const result = await resp.json();
      setQuizResult(result);
    } catch (e: any) {
      alert(e.message || "Quiz submission failed.");
    } finally {
      setIsSubmittingQuiz(false);
    }
  };

  return (
    <div className={styles.container}>
      {loading ? (
        <div className={styles.loaderArea}>
          <div className={styles.spinner} />
          <p>Loading quizzes hub...</p>
        </div>
      ) : isGeneratingQuiz ? (
        <div className={styles.loaderArea}>
          <div className={styles.spinner} />
          <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "white" }}>SBud is Composing Quiz...</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Analyzing PDF content and writing multiple choice challenge questions.</p>
        </div>
      ) : activeQuiz ? (
        /* Sequential Quiz Active Practice Workspace */
        <div className={styles.quizWorkspace}>
          {quizResult === null ? (
            /* Running Quiz Answering Screen */
            <div className={styles.quizCard}>
              <div className={styles.quizCardHeader}>
                <span className={styles.quizMeta}>{activeQuiz.title}</span>
                <span className={styles.quizProgressLabel}>
                  Question {currentQuestionIndex + 1} of {activeQuiz.questions.length}
                </span>
              </div>

              <div className={styles.progressBar}>
                <div 
                  className={styles.progressBarFill} 
                  style={{ width: `${((currentQuestionIndex + 1) / activeQuiz.questions.length) * 100}%` }}
                />
              </div>

              <h2 className={styles.questionText}>
                {activeQuiz.questions[currentQuestionIndex].question_text}
              </h2>

              <div className={styles.optionsList}>
                {activeQuiz.questions[currentQuestionIndex].options.map((option, idx) => {
                  const letter = option.substring(0, 1).toUpperCase();
                  const isSelected = quizAnswers[activeQuiz.questions[currentQuestionIndex].id] === letter;
                  return (
                    <div 
                      key={idx} 
                      className={`${styles.optionCard} ${isSelected ? styles.optionCardSelected : ""}`}
                      onClick={() => handleSelectOption(activeQuiz.questions[currentQuestionIndex].id, letter)}
                    >
                      <div className={styles.radioBubble}>
                        {isSelected && <div className={styles.radioBubbleInner} />}
                      </div>
                      <span className={styles.optionText}>{option}</span>
                    </div>
                  );
                })}
              </div>

              <div className={styles.controlsRow}>
                <button className={styles.quitBtn} onClick={() => setActiveQuiz(null)}>
                  Quit
                </button>

                {currentQuestionIndex < activeQuiz.questions.length - 1 ? (
                  <button 
                    className={styles.nextBtn}
                    disabled={!quizAnswers[activeQuiz.questions[currentQuestionIndex].id]}
                    onClick={() => setCurrentQuestionIndex(currentQuestionIndex + 1)}
                  >
                    Next Question
                  </button>
                ) : (
                  <button 
                    className={styles.submitBtn}
                    disabled={!quizAnswers[activeQuiz.questions[currentQuestionIndex].id] || isSubmittingQuiz}
                    onClick={handleSubmitQuiz}
                  >
                    {isSubmittingQuiz ? "Grading..." : "Submit Answers"}
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Graded Quiz Review Screen */
            <div className={styles.quizResultCard}>
              <div className={styles.scoreBanner}>
                <div className={styles.scoreCircle}>
                  <span className={styles.scoreNumber}>{quizResult.score}</span>
                  <span className={styles.scoreMax}>/ {quizResult.total_questions}</span>
                </div>
                <div className={styles.scoreDetails}>
                  <h2>{quizResult.title} Results</h2>
                  <p className={styles.scoreFeedback}>
                    {quizResult.score >= 4 
                      ? "✨ Excellent work! You've mastered this chapter's key points!" 
                      : "📖 Good attempt. Let's study the explanations below and try again."}
                  </p>
                </div>
              </div>

              <div className={styles.resultsList}>
                {quizResult.questions.map((q, idx) => (
                  <div key={q.id} className={styles.gradedItem}>
                    <div className={styles.gradedHeader}>
                      <span className={styles.gradedQuestionNum}>Question {idx + 1}</span>
                      <span className={q.is_correct ? styles.badgeCorrect : styles.badgeIncorrect}>
                        {q.is_correct ? "Correct" : "Incorrect"}
                      </span>
                    </div>

                    <h3 className={styles.gradedQuestionText}>{q.question_text}</h3>
                    
                    <div className={styles.gradedOptions}>
                      {q.options.map((option, oIdx) => {
                        const letter = option.substring(0, 1).toUpperCase();
                        const isSelected = q.student_answer === letter;
                        const isCorrect = q.correct_answer === letter;

                        let cardClass = styles.gradedOptionCard;
                        if (isSelected) {
                          cardClass = q.is_correct ? styles.gradedOptionCorrect : styles.gradedOptionIncorrect;
                        } else if (isCorrect) {
                          cardClass = styles.gradedOptionCorrectHighlight;
                        }

                        return (
                          <div key={oIdx} className={cardClass}>
                            <span className={styles.optionText}>{option}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className={styles.explanationBox}>
                      <span className={styles.explanationTitle}>Explanation:</span>
                      <p>{q.explanation}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className={styles.resultsControls}>
                <button className={styles.doneBtn} onClick={() => setActiveQuiz(null)}>
                  Finish Review
                </button>
                <button 
                  className={styles.askTutorBtn} 
                  onClick={() => router.push(`/assistant?q=Let's discuss my quiz results for ${activeQuiz.title}`)}
                >
                  Discuss with SBud
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Quizzes Selection Home Screen */
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          <div>
            <h1 className={styles.title}>Practice Quizzes</h1>
            <p className={styles.desc}>Select from your study guides and notes to start a multiple-choice practice session. Your accuracy score will update your progress metrics.</p>
          </div>

          {error && <div className={styles.alertError}>{error}</div>}

          {documents.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                </svg>
              </div>
              <h3>No Study Materials Found</h3>
              <p>Practice quizzes are generated dynamically from your uploaded PDF notes. Go to Materials to upload a study guide.</p>
              <button className={styles.emptyActionBtn} onClick={() => router.push("/materials")}>Go to Materials</button>
            </div>
          ) : (
            <div className={styles.quizzesGrid}>
              {documents.map((doc) => (
                <div key={doc.id} className={styles.quizDocCard}>
                  <div className={styles.quizDocHeader}>
                    <div className={styles.quizDocIcon}>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.03 0 1.9.693 2.166 1.638m-7.377 2.24a.75.75 0 0 1 1.03.31l1.53 2.548a.75.75 0 0 1-.31 1.03l-1.53.918a.75.75 0 0 1-1.03-.31l-1.53-2.548a.75.75 0 0 1 .31-1.03l1.53-.918Z" />
                      </svg>
                    </div>
                    <h3 className={styles.quizDocTitle} title={doc.filename}>{doc.filename}</h3>
                  </div>
                  <p className={styles.quizDocSubText}>Generate a 5-question MCQ quiz based on this study guide.</p>
                  <button 
                    className={styles.startQuizBtn}
                    onClick={() => handleGenerateQuiz(doc.id)}
                  >
                    Start Practice Quiz
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function QuizzesPage() {
  return (
    <AppShell>
      <Suspense fallback={
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "200px" }}>
          <div className={styles.spinner} />
        </div>
      }>
        <QuizzesInner />
      </Suspense>
    </AppShell>
  );
}
