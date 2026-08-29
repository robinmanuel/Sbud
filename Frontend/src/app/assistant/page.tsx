"use client";

import React, { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import styles from "./assistant.module.css";

const API_BASE = typeof window !== "undefined" ? `http://${window.location.hostname}:8000` : "http://localhost:8000";

interface Topic {
  id: number;
  name: string;
}

interface DocumentWorkspace {
  id: number;
  filename: string;
  extracted_text?: string;
  topics: Topic[];
}

interface Lesson {
  concept: string;
  example: string;
  understanding_question: string;
  understanding_answer: string;
  understanding_explanation: string;
}

interface PracticeExercise {
  id: number;
  question: string;
  correct_answer: string;
  explanation: string;
}

interface QuizQuestion {
  id: number;
  question_text: string;
  options: string[];
}

interface Quiz {
  id: number;
  title: string;
  questions: QuizQuestion[];
}

interface GradedQuestion {
  id: number;
  question_text: string;
  options: string[];
  student_answer: string;
  correct_answer: string;
  explanation: string;
  is_correct: boolean;
}

interface QuizResult {
  score: number;
  total_questions: number;
  questions: GradedQuestion[];
}

interface RecallQuestion {
  question: string;
  answer: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

function AssistantWorkspaceContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Route Deep Linking Params
  const docIdParam = searchParams.get("docId");
  const topicIdParam = searchParams.get("topicId");

  // Query & Upload States (Topic Setup)
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Core Study Data State
  const [activeDocId, setActiveDocId] = useState<number | null>(null);
  const [document, setDocument] = useState<DocumentWorkspace | null>(null);
  const [extractedText, setExtractedText] = useState<string>("");
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [activeAction, setActiveAction] = useState<"learn" | "practice" | "quiz" | "summarize" | "recall" | "clarify" | null>(null);

  // Status/Loading State
  const [loadingWorkspace, setLoadingWorkspace] = useState<boolean>(false);
  const [loadingAction, setLoadingAction] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Action Panel Contents
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [practice, setPractice] = useState<PracticeExercise | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [summary, setSummary] = useState<string>("");
  const [recall, setRecall] = useState<RecallQuestion | null>(null);

  // Action inputs/progress
  const [lessonAnswer, setLessonAnswer] = useState<string>("");
  const [showLessonFeedback, setShowLessonFeedback] = useState<boolean>(false);
  const [practiceAnswer, setPracticeAnswer] = useState<string>("");
  const [showPracticeFeedback, setShowPracticeFeedback] = useState<boolean>(false);
  const [recallAnswer, setRecallAnswer] = useState<string>("");
  const [isRecallRevealed, setIsRecallRevealed] = useState<boolean>(false);

  // Quiz progress
  const [activeQuizQuestionIndex, setActiveQuizQuestionIndex] = useState<number>(0);
  const [quizSelections, setQuizSelections] = useState<Record<string, string>>({});
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);

  // Clarify chat progress
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>("");
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Library lists & general chatbot states
  const [documents, setDocuments] = useState<any[]>([]);
  const [isGeneralChat, setIsGeneralChat] = useState<boolean>(false);
  const [generalChatMessages, setGeneralChatMessages] = useState<ChatMessage[]>([]);
  const [generalConversationId, setGeneralConversationId] = useState<number | null>(null);
  const [loadingGeneralChat, setLoadingGeneralChat] = useState<boolean>(false);

  // Fetch documents list on mount
  useEffect(() => {
    const loadDocs = async () => {
      try {
        const resp = await fetch(`${API_BASE}/documents`, {
          method: "GET",
          credentials: "include"
        });
        if (resp.ok) {
          const docData = await resp.json();
          setDocuments(docData);
        }
      } catch (e) {
        console.warn("Failed to load documents in Assistant", e);
      }
    };
    loadDocs();
  }, []);

  // Parse deep-linked documents/topics on mount or params change
  useEffect(() => {
    if (docIdParam) {
      const id = parseInt(docIdParam);
      setActiveDocId(id);
      loadWorkspace(id);
    } else {
      setActiveDocId(null);
      setDocument(null);
      setExtractedText("");
      setSelectedTopic(null);
      setActiveAction(null);
    }
  }, [docIdParam]);

  // Scroll clarify chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, activeAction]);

  const loadWorkspace = async (docIdVal: number) => {
    setLoadingWorkspace(true);
    setError(null);
    try {
      // 1. Fetch document and topics list
      const docResp = await fetch(`${API_BASE}/documents/${docIdVal}`, {
        method: "GET",
        credentials: "include"
      });
      if (!docResp.ok) throw new Error("Failed to load study curriculum.");
      const docData = await docResp.json();
      setDocument(docData);

      // 2. Fetch raw text source
      const textResp = await fetch(`${API_BASE}/documents/${docIdVal}/text`, {
        method: "GET",
        credentials: "include"
      });
      if (textResp.ok) {
        const textData = await textResp.json();
        setExtractedText(textData.text);
      }

      // 3. Pre-select topic if topicIdParam matches one of the topics
      if (topicIdParam && docData.topics) {
        const topicIdVal = parseInt(topicIdParam);
        const matched = docData.topics.find((t: Topic) => t.id === topicIdVal);
        if (matched) {
          setSelectedTopic(matched);
          setActiveAction(null);
        }
      }
    } catch (e: any) {
      setError(e.message || "Failed to launch workspace.");
    } finally {
      setLoadingWorkspace(false);
    }
  };

  const handleCustomSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setLoadingWorkspace(true);
    setError(null);
    try {
      const resp = await fetch(`${API_BASE}/topics/custom-curriculum`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ topic: searchQuery })
      });

      if (!resp.ok) throw new Error("Failed to formulate custom syllabus.");
      const data = await resp.json();
      
      // Redirect URL with newly created document id to update history and deep-linking state
      router.push(`/assistant?docId=${data.document_id}`);
    } catch (err: any) {
      setError(err.message || "Failed to generate AI custom curriculum.");
      setLoadingWorkspace(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      setFileError("Only PDF documents are supported for study materials.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setFileError("File size exceeds 10MB limit.");
      return;
    }

    setIsUploading(true);
    setFileError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const resp = await fetch(`${API_BASE}/documents`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to upload file.");
      }

      const data = await resp.json();
      router.push(`/assistant?docId=${data.id}`);
    } catch (err: any) {
      setFileError(err.message || "Failed to upload document.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSelectTopic = (topic: Topic) => {
    setSelectedTopic(topic);
    setActiveAction(null);
    setLesson(null);
    setPractice(null);
    setQuiz(null);
    setSummary("");
    setRecall(null);
    setQuizResult(null);
    setChatMessages([]);
  };

  const handleTriggerAction = async (action: "learn" | "practice" | "quiz" | "summarize" | "recall" | "clarify") => {
    if (!selectedTopic) return;
    setActiveAction(action);
    setLoadingAction(true);
    setError(null);

    setLessonAnswer("");
    setShowLessonFeedback(false);
    setPracticeAnswer("");
    setShowPracticeFeedback(false);
    setRecallAnswer("");
    setIsRecallRevealed(false);

    try {
      if (action === "learn") {
        const resp = await fetch(`${API_BASE}/topics/${selectedTopic.id}/learn`, {
          method: "POST",
          credentials: "include"
        });
        if (!resp.ok) throw new Error("Failed to load study lesson.");
        const data = await resp.json();
        setLesson(data);
      } else if (action === "practice") {
        const resp = await fetch(`${API_BASE}/topics/${selectedTopic.id}/practice`, {
          method: "POST",
          credentials: "include"
        });
        if (!resp.ok) throw new Error("Failed to load practice exercise.");
        const data = await resp.json();
        setPractice(data);
      } else if (action === "quiz") {
        const resp = await fetch(`${API_BASE}/topics/${selectedTopic.id}/quiz`, {
          method: "POST",
          credentials: "include"
        });
        if (!resp.ok) throw new Error("Failed to generate topic quiz.");
        const data = await resp.json();
        setQuiz(data);
        setActiveQuizQuestionIndex(0);
        setQuizSelections({});
        setQuizResult(null);
      } else if (action === "summarize") {
        const resp = await fetch(`${API_BASE}/topics/${selectedTopic.id}/summarize`, {
          method: "POST",
          credentials: "include"
        });
        if (!resp.ok) throw new Error("Failed to generate topic summary.");
        const data = await resp.json();
        setSummary(data.summary);
      } else if (action === "recall") {
        const resp = await fetch(`${API_BASE}/topics/${selectedTopic.id}/recall`, {
          method: "POST",
          credentials: "include"
        });
        if (!resp.ok) throw new Error("Failed to generate active recall card.");
        const data = await resp.json();
        setRecall(data);
      } else if (action === "clarify") {
        const resp = await fetch(`${API_BASE}/topics/${selectedTopic.id}/clarify`, {
          method: "GET",
          credentials: "include"
        });
        if (resp.ok) {
          const data = await resp.json();
          setChatMessages(data.messages || []);
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to execute topic action.");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleSendClarifyMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !selectedTopic) return;

    const currentInput = chatInput;
    setChatInput("");

    const localUserMsg: ChatMessage = {
      role: "user",
      content: currentInput,
      created_at: new Date().toISOString()
    };
    setChatMessages((prev) => [...prev, localUserMsg]);

    try {
      const resp = await fetch(`${API_BASE}/topics/${selectedTopic.id}/clarify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: currentInput })
      });

      if (!resp.ok) throw new Error("AI tutor failed to reply.");
      const data = await resp.json();
      setChatMessages(data.messages || []);
    } catch (err: any) {
      alert(err.message || "Tutor response failed.");
    }
  };

  const handleQuizSubmit = async () => {
    if (!quiz) return;
    setLoadingAction(true);
    try {
      const resp = await fetch(`${API_BASE}/quizzes/${quiz.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ answers: quizSelections })
      });
      if (!resp.ok) throw new Error("Failed to submit quiz grading.");
      const data = await resp.json();
      setQuizResult({
        score: data.score,
        total_questions: data.total_questions,
        questions: data.questions
      });
    } catch (err: any) {
      alert(err.message || "Could not grade quiz.");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleSendGeneralChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const currentInput = chatInput;
    setChatInput("");

    const localUserMsg: ChatMessage = {
      role: "user",
      content: currentInput,
      created_at: new Date().toISOString()
    };
    setGeneralChatMessages((prev) => [...prev, localUserMsg]);
    setLoadingGeneralChat(true);

    try {
      const resp = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messages: [...generalChatMessages, localUserMsg].map(m => ({ role: m.role, content: m.content })),
          conversation_id: generalConversationId
        })
      });

      if (!resp.ok) throw new Error("General tutor failed to reply.");
      const data = await resp.json();
      
      setGeneralConversationId(data.conversation_id);
      
      const localAiMsg: ChatMessage = {
        role: "assistant",
        content: data.response,
        created_at: new Date().toISOString()
      };
      setGeneralChatMessages((prev) => [...prev, localAiMsg]);
    } catch (err: any) {
      alert(err.message || "Tutor response failed.");
    } finally {
      setLoadingGeneralChat(false);
    }
  };

  return (
    <div className={styles.container}>
      {isGeneralChat ? (
        // General AI Chatbot Workspace
        <>
          <div className={styles.header}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Interactive AI Tutor</span>
              <h1 className={styles.docTitle}>SBud AI Tutor</h1>
            </div>
            <button className={styles.backBtn} onClick={() => setIsGeneralChat(false)}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: "16px", height: "16px" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
              </svg>
              Back to Options
            </button>
          </div>
          
          <div className={styles.workspace}>
            {/* Left Column: SBud general info */}
            <div className={styles.viewerCard}>
              <div className={styles.viewerHeader}>
                <h2 className={styles.viewerTitle}>
                  💡 AI Study Companion
                </h2>
              </div>
              <div className={styles.textContent} style={{ fontSize: "0.95rem" }}>
                <p style={{ marginBottom: "1.25rem" }}>
                  Welcome! You can ask SBud anything you're studying. SBud AI Tutor is trained to:
                </p>
                <ul style={{ display: "flex", flexDirection: "column", gap: "0.6rem", paddingLeft: "1.25rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  <li>Explain complex academic concepts.</li>
                  <li>Solve and explain math/science problems step-by-step.</li>
                  <li>Decompose topics into digestible explanations.</li>
                  <li>Draft review questions or check understanding.</li>
                </ul>
                <p style={{ marginTop: "2rem", color: "var(--text-muted)", fontStyle: "italic", fontSize: "0.85rem" }}>
                  Note: If you want SBud to answer questions based on a specific textbook, syllabus PDF, or notes, select it from your library or upload it in the entry dashboard.
                </p>
              </div>
            </div>

            {/* Right Column: Chat area */}
            <div className={styles.studyCard}>
              <div className={styles.chatContainer}>
                <div className={styles.chatHistory}>
                  {generalChatMessages.length === 0 ? (
                    <div className={styles.emptyState} style={{ margin: "auto" }}>
                      Ask any study question to start learning.
                    </div>
                  ) : (
                    generalChatMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`${styles.chatMessage} ${
                          msg.role === "user" ? styles.chatMessageUser : styles.chatMessageAssistant
                        }`}
                      >
                        {msg.content}
                      </div>
                    ))
                  )}
                  {loadingGeneralChat && (
                    <div className={styles.chatMessage} style={{ alignSelf: "flex-start", background: "transparent", color: "var(--text-muted)" }}>
                      SBud is thinking...
                    </div>
                  )}
                  <div ref={chatBottomRef} />
                </div>

                <form onSubmit={handleSendGeneralChatMessage} className={styles.chatInputGroup}>
                  <input
                    type="text"
                    placeholder="Ask SBud anything..."
                    className={styles.chatInput}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                  />
                  <button type="submit" className={styles.chatSendBtn}>
                    Send
                  </button>
                </form>
              </div>
            </div>
          </div>
        </>
      ) : activeDocId === null ? (
        // Experience Entry state: Search query, Library selector, PDF upload, or General Tutor Chat
        <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem", maxWidth: "600px", margin: "3rem auto 0 auto" }}>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: "2.2rem", fontWeight: 800, background: "var(--accent-gradient)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: "0.5rem" }}>
              What do you want to learn?
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
              Enter any topic curriculum, select from library, or upload your document.
            </p>
          </div>

          {error && (
            <div style={{ padding: "1rem", backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid var(--danger)", borderRadius: "12px", color: "var(--danger)", fontSize: "0.85rem" }}>
              {error}
            </div>
          )}

          {/* Search form query */}
          <form onSubmit={handleCustomSearch} className={styles.panelCard} style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)", padding: "1.5rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>AI Curriculum Search</label>
              <div style={{ display: "flex", background: "rgba(11, 15, 25, 0.5)", border: "1px solid var(--border-light)", borderRadius: "12px", padding: "0.25rem" }}>
                <input
                  type="text"
                  placeholder="Syllabus topic e.g. Newtonian Mechanics, Organic Chemistry..."
                  className={styles.inputField}
                  style={{ border: "none", margin: 0, background: "transparent" }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button type="submit" className={styles.submitBtn} style={{ borderRadius: "10px" }}>
                  Generate
                </button>
              </div>
            </div>
          </form>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
            <div style={{ height: "1px", background: "var(--border-light)", flex: 1 }} />
            <span>OR</span>
            <div style={{ height: "1px", background: "var(--border-light)", flex: 1 }} />
          </div>

          {/* Select from Library Dropdown */}
          <div className={styles.panelCard} style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)", padding: "1.5rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>Select from your Library</label>
              <select
                onChange={(e) => { if (e.target.value) router.push(`/assistant?docId=${e.target.value}`); }}
                className={styles.inputField}
                style={{ width: "100%", margin: 0, padding: "0.75rem 1rem" }}
              >
                <option value="" style={{ background: "var(--bg-secondary)" }}>-- Choose a previously uploaded document --</option>
                {documents.map((doc) => (
                  <option key={doc.id} value={doc.id} style={{ background: "var(--bg-secondary)" }}>
                    {doc.filename.startsWith("Custom Curriculum: ") 
                      ? doc.filename.replace("Custom Curriculum: ", "").replace(".pdf", "")
                      : doc.filename
                  }
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
            <div style={{ height: "1px", background: "var(--border-light)", flex: 1 }} />
            <span>OR</span>
            <div style={{ height: "1px", background: "var(--border-light)", flex: 1 }} />
          </div>

          {/* Material Uploader */}
          <div className={styles.panelCard} style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)", padding: "1.5rem" }}>
            <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.75rem" }}>Upload Study Guide</h3>
            <div
              onClick={triggerFileInput}
              style={{
                border: "2px dashed var(--border-light)",
                borderRadius: "12px",
                padding: "2rem 1.5rem",
                textAlign: "center",
                cursor: "pointer",
                transition: "all 0.2s",
                background: "rgba(255,255,255,0.01)"
              }}
              onMouseOver={(e) => e.currentTarget.style.borderColor = "var(--border-active)"}
              onMouseOut={(e) => e.currentTarget.style.borderColor = "var(--border-light)"}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="application/pdf"
                style={{ display: "none" }}
              />
              {isUploading ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
                  <div className={styles.spinner} />
                  <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Uploading material PDF...</span>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: "32px", height: "32px", color: "var(--text-muted)" }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
                  </svg>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Select PDF Document</span>
                </div>
              )}
            </div>
            {fileError && (
              <p style={{ color: "var(--danger)", fontSize: "0.75rem", marginTop: "0.5rem", textAlign: "center" }}>{fileError}</p>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
            <div style={{ height: "1px", background: "var(--border-light)", flex: 1 }} />
            <span>OR</span>
            <div style={{ height: "1px", background: "var(--border-light)", flex: 1 }} />
          </div>

          {/* General AI Tutor Card */}
          <div className={styles.panelCard} style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-primary)" }}>Chat with AI Tutor</h3>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Ask SBud any homework, study topic, or conceptual question directly.</p>
            <button 
              className={styles.submitBtn} 
              style={{ width: "100%", justifyContent: "center", display: "flex" }} 
              onClick={() => {
                setIsGeneralChat(true);
                setGeneralChatMessages([]);
                setGeneralConversationId(null);
              }}
            >
              Start General Chat
            </button>
          </div>
        </div>
      ) : (
        // Workspace Mode: Split pane study guide reading & topic action execution
        <>
          <div className={styles.header}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Learning Workspace</span>
              <h1 className={styles.docTitle}>
                {document?.filename.startsWith("Custom Curriculum: ") 
                  ? document.filename.replace("Custom Curriculum: ", "").replace(".pdf", "")
                  : document?.filename || "Loading Curriculum Workspace..."
                }
              </h1>
            </div>
            <button className={styles.backBtn} onClick={() => router.push("/assistant")}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: "16px", height: "16px" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
              </svg>
              Search New Topic
            </button>
          </div>

          {error && (
            <div style={{ padding: "1rem", backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid var(--danger)", borderRadius: "12px", color: "var(--danger)", fontSize: "0.85rem", marginBottom: "1rem" }}>
              {error}
            </div>
          )}

          {loadingWorkspace ? (
            <div className={styles.loader}>
              <div className={styles.spinner} />
              <p>Constructing study guide context...</p>
            </div>
          ) : (
            <div className={styles.workspace}>
              {/* Left Column: Source reading context */}
              <div className={styles.viewerCard}>
                <div className={styles.viewerHeader}>
                  <h2 className={styles.viewerTitle}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: "20px", height: "20px", color: "var(--accent-indigo)" }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                    </svg>
                    Guide Reference Text
                  </h2>
                </div>
                <div className={styles.textContent}>
                  {extractedText}
                </div>
              </div>

              {/* Right Column: Interactive actions */}
              <div className={styles.studyCard}>
                {!selectedTopic ? (
                  // Topics selection sidebar inside workspace
                  <>
                    <div className={styles.studyHeader}>
                      <h2 className={styles.studyTitle}>Study Topics</h2>
                    </div>
                    <div className={styles.topicsList}>
                      {document?.topics && document.topics.length > 0 ? (
                        document.topics.map((t) => (
                          <div key={t.id} className={styles.topicItem} onClick={() => handleSelectTopic(t)}>
                            <span className={styles.topicName}>{t.name}</span>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" style={{ width: "16px", height: "16px", color: "var(--accent-indigo)" }}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                            </svg>
                          </div>
                        ))
                      ) : (
                        <div className={styles.loader}>
                          <div className={styles.spinner} />
                          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center" }}>Analyzing material syllabus topics...</p>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  // Active subtopic actions execution
                  <>
                    <div className={styles.studyHeader}>
                      <div className={styles.actionsHeader}>
                        <span className={styles.actionsSub}>Subtopic selected</span>
                        <h2 className={styles.studyTitle} style={{ background: "var(--accent-gradient)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                          {selectedTopic.name}
                        </h2>
                      </div>
                      <button className={styles.backBtn} onClick={() => setSelectedTopic(null)} style={{ padding: "0.4rem 0.75rem", fontSize: "0.75rem" }}>
                        View Topics
                      </button>
                    </div>

                    {/* Actions Navigation Menu */}
                    <div className={styles.actionsGrid}>
                      {(["learn", "practice", "quiz", "summarize", "recall", "clarify"] as const).map((act) => {
                        const isActive = activeAction === act;
                        const emojis: Record<string, string> = {
                          learn: "📖",
                          practice: "🧩",
                          quiz: "📝",
                          summarize: "📄",
                          recall: "🧠",
                          clarify: "❓"
                        };
                        return (
                          <button
                            key={act}
                            className={`${styles.actionBtn} ${isActive ? styles.actionBtnActive : ""}`}
                            onClick={() => handleTriggerAction(act)}
                          >
                            <span style={{ fontSize: "1.25rem" }}>{emojis[act]}</span>
                            <span style={{ textTransform: "capitalize" }}>{act}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Active Action Panel Content */}
                    <div className={styles.actionPanel}>
                      {loadingAction ? (
                        <div className={styles.loader}>
                          <div className={styles.spinner} />
                          <p style={{ textTransform: "capitalize" }}>Preparing {activeAction} action...</p>
                        </div>
                      ) : activeAction === "learn" && lesson ? (
                        // Learn Progress View
                        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                          <div className={styles.panelCard}>
                            <div className={styles.learnStep}>
                              <span className={styles.stepTitle}>Concept Explanation</span>
                              <p className={styles.stepBody}>{lesson.concept}</p>
                            </div>
                          </div>
                          <div className={styles.panelCard}>
                            <div className={styles.learnStep}>
                              <span className={styles.stepTitle}>Practical Example</span>
                              <p className={`${styles.stepBody} ${styles.stepExample}`}>{lesson.example}</p>
                            </div>
                          </div>
                          <div className={styles.panelCard}>
                            <div className={styles.learnStep}>
                              <span className={styles.stepTitle}>Check Understanding</span>
                              <p className={styles.stepBody} style={{ fontWeight: 600 }}>{lesson.understanding_question}</p>
                              
                              <div className={styles.checkContainer}>
                                <textarea
                                  className={styles.inputField}
                                  placeholder="Formulate your response to self-check..."
                                  rows={2}
                                  value={lessonAnswer}
                                  onChange={(e) => setLessonAnswer(e.target.value)}
                                  disabled={showLessonFeedback}
                                />
                                {!showLessonFeedback ? (
                                  <button className={styles.submitBtn} onClick={() => setShowLessonFeedback(true)}>
                                    Verify Answer
                                  </button>
                                ) : (
                                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
                                    <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--success)" }}>Answer Key:</span>
                                    <p style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>{lesson.understanding_answer}</p>
                                    <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--accent-indigo)", marginTop: "0.25rem" }}>Reasoning:</span>
                                    <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{lesson.understanding_explanation}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : activeAction === "practice" && practice ? (
                        // Practice Problem View
                        <div className={styles.panelCard}>
                          <div className={styles.learnStep}>
                            <span className={styles.stepTitle}>Application Problem</span>
                            <p className={styles.stepBody} style={{ fontWeight: 600, fontSize: "0.95rem" }}>{practice.question}</p>
                            
                            <div className={styles.checkContainer}>
                              <input
                                type="text"
                                className={styles.inputField}
                                placeholder="Your answer..."
                                value={practiceAnswer}
                                onChange={(e) => setPracticeAnswer(e.target.value)}
                                disabled={showPracticeFeedback}
                              />
                              {!showPracticeFeedback ? (
                                <button className={styles.submitBtn} onClick={() => setShowPracticeFeedback(true)}>
                                  Submit Answer
                                </button>
                              ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
                                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--success)" }}>Correct Answer:</span>
                                  <p style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>{practice.correct_answer}</p>
                                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--accent-indigo)", marginTop: "0.25rem" }}>Explanation:</span>
                                  <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{practice.explanation}</p>
                                  <button className={styles.submitBtn} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-light)", alignSelf: "flex-start", marginTop: "0.5rem" }} onClick={() => handleTriggerAction("practice")}>
                                    Next Exercise
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : activeAction === "quiz" && quiz ? (
                        // Structured Topic Quiz
                        <div className={styles.panelCard}>
                          {!quizResult ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                              <div className={styles.quizProgress}>
                                Question {activeQuizQuestionIndex + 1} of {quiz.questions.length}
                              </div>
                              
                              <div className={styles.quizQuestion}>
                                {quiz.questions[activeQuizQuestionIndex].question_text}
                              </div>

                              <div className={styles.quizOptions}>
                                {quiz.questions[activeQuizQuestionIndex].options.map((opt) => {
                                  const qIdStr = quiz.questions[activeQuizQuestionIndex].id.toString();
                                  const isSelected = quizSelections[qIdStr] === opt.charAt(0);
                                  return (
                                    <button
                                      key={opt}
                                      className={`${styles.quizOption} ${isSelected ? styles.quizOptionSelected : ""}`}
                                      onClick={() => setQuizSelections((prev) => ({ ...prev, [qIdStr]: opt.charAt(0) }))}
                                    >
                                      {opt}
                                    </button>
                                  );
                                })}
                              </div>

                              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
                                <button
                                  className={styles.backBtn}
                                  style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}
                                  disabled={activeQuizQuestionIndex === 0}
                                  onClick={() => setActiveQuizQuestionIndex((p) => p - 1)}
                                >
                                  Previous
                                </button>
                                
                                {activeQuizQuestionIndex < quiz.questions.length - 1 ? (
                                  <button
                                    className={styles.submitBtn}
                                    style={{ padding: "0.5rem 1.25rem", fontSize: "0.85rem" }}
                                    onClick={() => setActiveQuizQuestionIndex((p) => p + 1)}
                                  >
                                    Next
                                  </button>
                                ) : (
                                  <button
                                    className={styles.submitBtn}
                                    style={{ padding: "0.5rem 1.25rem", fontSize: "0.85rem", backgroundColor: "var(--success)" }}
                                    onClick={handleQuizSubmit}
                                  >
                                    Submit Quiz
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                              <div className={styles.quizResultTitle}>Quiz Completed!</div>
                              <div className={styles.quizScore}>{quizResult.score} / {quizResult.total_questions}</div>
                              
                              <div className={styles.quizAnswerReview}>
                                {quizResult.questions.map((q, idx) => (
                                  <div key={q.id} className={styles.reviewItem}>
                                    <div className={styles.reviewText}>
                                      {idx + 1}. {q.question_text}
                                    </div>
                                    <div className={styles.reviewAns}>
                                      <span className={q.is_correct ? styles.reviewCorrect : styles.reviewIncorrect}>
                                        Your Answer: {q.student_answer || "None"} {q.is_correct ? "✓" : "✗"}
                                      </span>
                                      {!q.is_correct && (
                                        <span className={styles.reviewCorrect}>
                                          Correct: {q.correct_answer}
                                        </span>
                                      )}
                                    </div>
                                    <div className={styles.reviewExp}>
                                      {q.explanation}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <button className={styles.submitBtn} style={{ marginTop: "1rem", alignSelf: "center" }} onClick={() => handleTriggerAction("quiz")}>
                                Retake Quiz
                              </button>
                            </div>
                          )}
                        </div>
                      ) : activeAction === "summarize" && summary ? (
                        // Topic Summary View
                        <div className={styles.panelCard}>
                          <span className={styles.stepTitle}>Concise Summary</span>
                          <div className={styles.stepBody} style={{ whiteSpace: "pre-wrap" }}>{summary}</div>
                        </div>
                      ) : activeAction === "recall" && recall ? (
                        // Recall flashcards view
                        <div className={styles.panelCard}>
                          <div className={styles.learnStep}>
                            <span className={styles.stepTitle}>Active Recall Question</span>
                            <p className={styles.stepBody} style={{ fontWeight: 600, fontSize: "1.05rem", textAlign: "center", padding: "1.5rem 0" }}>
                              "{recall.question}"
                            </p>
                            
                            <div className={styles.checkContainer} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                              <textarea
                                className={styles.inputField}
                                placeholder="Answer mentally or write it here to self-check..."
                                rows={3}
                                value={recallAnswer}
                                onChange={(e) => setRecallAnswer(e.target.value)}
                                disabled={isRecallRevealed}
                              />
                              
                              {!isRecallRevealed ? (
                                <button className={styles.submitBtn} style={{ width: "100%" }} onClick={() => setIsRecallRevealed(true)}>
                                  Reveal Answer
                                </button>
                              ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%", borderTop: "1px solid var(--border-light)", paddingTop: "1rem", marginTop: "0.5rem" }}>
                                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--success)" }}>Correct Answer:</span>
                                  <p style={{ fontSize: "0.9rem", color: "var(--text-primary)", lineHeight: 1.5 }}>{recall.answer}</p>
                                  <button className={styles.submitBtn} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-light)", marginTop: "1rem", width: "100%" }} onClick={() => handleTriggerAction("recall")}>
                                    Next Flashcard
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : activeAction === "clarify" ? (
                        // Clarify tutor chat view
                        <div className={styles.chatContainer}>
                          <div className={styles.chatHistory}>
                            {chatMessages.length === 0 ? (
                              <div className={styles.emptyState} style={{ margin: "auto" }}>
                                Ask any specific question about {selectedTopic.name} to start.
                              </div>
                            ) : (
                              chatMessages.map((msg, idx) => (
                                <div
                                  key={idx}
                                  className={`${styles.chatMessage} ${
                                    msg.role === "user" ? styles.chatMessageUser : styles.chatMessageAssistant
                                  }`}
                                >
                                  {msg.content}
                                </div>
                              ))
                            )}
                            <div ref={chatBottomRef} />
                          </div>

                          <form onSubmit={handleSendClarifyMessage} className={styles.chatInputGroup}>
                            <input
                              type="text"
                              placeholder="I don't understand why..."
                              className={styles.chatInput}
                              value={chatInput}
                              onChange={(e) => setChatInput(e.target.value)}
                            />
                            <button type="submit" className={styles.chatSendBtn}>
                              Ask Tutor
                            </button>
                          </form>
                        </div>
                      ) : (
                        <div className={styles.emptyState}>
                          Select one of the actions above to start learning this topic.
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AssistantPage() {
  return (
    <AppShell>
      <Suspense fallback={
        <div className={styles.loader}>
          <div className={styles.spinner} />
          <p>Loading learning workspace...</p>
        </div>
      }>
        <AssistantWorkspaceContent />
      </Suspense>
    </AppShell>
  );
}
