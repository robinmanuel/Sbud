"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import styles from "./materials.module.css";

const API_BASE = "http://localhost:8000";

interface StudyDocument {
  id: number;
  filename: string;
  file_type: string;
  file_size: number;
  created_at: string;
}

export default function MaterialsPage() {
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState<number | null>(null); // holds docId being generated
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Load study documents list
  const loadDocuments = async () => {
    try {
      const resp = await fetch(`${API_BASE}/documents`, {
        method: "GET",
        credentials: "include",
      });
      if (resp.ok) {
        const data = await resp.json();
        setDocuments(data);
      } else {
        throw new Error("Failed to load documents.");
      }
    } catch (e: any) {
      setError(e.message || "Failed to load documents list.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Upload PDF material
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      setUploadError("Only PDF documents are supported for study materials.");
      return;
    }

    // Limit to 10MB
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("File size exceeds 10MB limit.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

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
        throw new Error(errData.detail || "Failed to upload file to backend.");
      }

      setUploadSuccess(`Successfully uploaded "${file.name}"!`);
      await loadDocuments();
    } catch (err: any) {
      setUploadError(err.message || "Network failure during upload.");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  // Delete PDF material
  const handleDeleteDocument = async (docId: number) => {
    if (!confirm("Are you sure you want to delete this study material?")) return;

    setUploadError(null);
    setUploadSuccess(null);

    try {
      const resp = await fetch(`${API_BASE}/documents/${docId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!resp.ok) {
        throw new Error("Failed to delete study material.");
      }

      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      setUploadSuccess("Material deleted successfully.");
    } catch (err: any) {
      setUploadError(err.message || "Failed to delete study material.");
    }
  };

  // Generate quiz and redirect to quizzes page
  const handleGenerateQuiz = async (docId: number) => {
    setIsGeneratingQuiz(docId);
    setUploadError(null);
    setUploadSuccess(null);
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
      setUploadSuccess("Quiz generated successfully!");
      // Redirect to quizzes page with active quiz ID to take it
      router.push(`/quizzes?quizId=${data.id}`);
    } catch (err: any) {
      setUploadError(err.message || "Failed to generate quiz.");
    } finally {
      setIsGeneratingQuiz(null);
    }
  };

  // Format bytes helper
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
        {/* Native Hidden File Input */}
        <input 
          type="file" 
          accept=".pdf"
          ref={fileInputRef} 
          style={{ display: "none" }}
          onChange={handleFileUpload} 
        />

        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>Study Guides & Notes</h1>
            <p className={styles.desc}>Upload textbook chapters or notes (PDF format, max 10MB) to generate quiz questions and unlock vector-based chat context matching.</p>
          </div>

          <button 
            className={styles.uploadBtn}
            onClick={triggerFileInput}
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <div className={styles.spinnerMini} />
                <span>Uploading...</span>
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={styles.uploadIcon}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
                <span>Upload PDF</span>
              </>
            )}
          </button>
        </div>

        {/* Upload Alert Badges */}
        {uploadError && <div className={styles.alertError}>{uploadError}</div>}
        {uploadSuccess && <div className={styles.alertSuccess}>{uploadSuccess}</div>}

        {loading ? (
          <div className={styles.loaderArea}>
            <div className={styles.spinner} />
            <p>Loading study materials list...</p>
          </div>
        ) : error ? (
          <div className={styles.errorArea}>{error}</div>
        ) : documents.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <h3>No Documents Uploaded</h3>
            <p>Once you upload PDF notes, they will appear here. SBud will automatically segment them for retrieval context and prepare practice quizzes.</p>
            <button className={styles.emptyActionBtn} onClick={triggerFileInput}>Upload Notes Now</button>
          </div>
        ) : (
          <div className={styles.grid}>
            {documents.map((doc) => (
              <div key={doc.id} className={styles.docCard}>
                <div className={styles.docInfo}>
                  <div className={styles.docIconWrapper}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                  </div>
                  <div className={styles.docMeta}>
                    <h3 className={styles.docTitle} title={doc.filename}>{doc.filename}</h3>
                    <span className={styles.docSize}>{formatBytes(doc.file_size)}</span>
                  </div>
                </div>

                <div className={styles.docActions}>
                  <button 
                    className={styles.actionBtnPrimary}
                    onClick={() => handleGenerateQuiz(doc.id)}
                    disabled={isGeneratingQuiz !== null}
                  >
                    {isGeneratingQuiz === doc.id ? (
                      <>
                        <div className={styles.spinnerMini} />
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={styles.btnIcon}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.03 0 1.9.693 2.166 1.638m-7.377 2.24a.75.75 0 0 1 1.03.31l1.53 2.548a.75.75 0 0 1-.31 1.03l-1.53.918a.75.75 0 0 1-1.03-.31l-1.53-2.548a.75.75 0 0 1 .31-1.03l1.53-.918Z" />
                        </svg>
                        <span>Generate Quiz</span>
                      </>
                    )}
                  </button>
                  <button 
                    className={styles.actionBtnSecondary}
                    onClick={() => router.push(`/assistant?q=Explain key concepts from the uploaded guide: ${doc.filename}`)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={styles.btnIcon}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z" />
                    </svg>
                    <span>Ask SBud</span>
                  </button>
                  <button 
                    className={styles.actionBtnDanger}
                    onClick={() => handleDeleteDocument(doc.id)}
                    title="Delete Study Material"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={styles.btnIcon} style={{ margin: 0 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
