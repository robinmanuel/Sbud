"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Message, MessageProps } from "./Message";
import { ChatInput } from "./ChatInput";
import styles from "./Chat.module.css";

const API_BASE = "http://localhost:8000";

interface Conversation {
  id: number;
  title: string;
  created_at: string;
}

interface StudyDocument {
  id: number;
  filename: string;
  file_type: string;
  file_size: number;
  created_at: string;
}

const INITIAL_MESSAGES: MessageProps[] = [
  {
    role: "assistant",
    content: "Hi! I'm **SBud**, your AI study tutor. I'm here to help you understand complex concepts step-by-step.\n\nWhat would you like to study today? (e.g., Photosynthesis, Gravity, Mitosis, or paste a homework question!)",
  }
];

export const Chat: React.FC = () => {
  const [messages, setMessages] = useState<MessageProps[]>(INITIAL_MESSAGES);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Layout Tab selection
  const [activeTab, setActiveTab] = useState<"chats" | "materials">("chats");

  // Conversation State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Materials State
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Scroll to bottom on new messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Authenticate user, load conversations & documents on mount
  useEffect(() => {
    const checkAuthAndLoad = async () => {
      try {
        // 1. Authenticate user
        const authResp = await fetch(`${API_BASE}/users/me`, {
          method: "GET",
          credentials: "include",
        });

        if (!authResp.ok) {
          throw new Error("Unauthenticated user session.");
        }

        const userData = await authResp.json();
        setUserEmail(userData.email);

        // 2. Fetch User's Conversations
        const convResp = await fetch(`${API_BASE}/conversations`, {
          method: "GET",
          credentials: "include",
        });

        if (convResp.ok) {
          const convList = await convResp.json();
          setConversations(convList);
          if (convList.length > 0) {
            const mostRecent = convList[0];
            setActiveConversationId(mostRecent.id);
            await loadConversationMessages(mostRecent.id);
          } else {
            await handleNewChat();
          }
        }

        // 3. Fetch User's Study Documents
        await loadDocuments();
      } catch (err) {
        console.warn("Initialization failed, redirecting to login:", err);
        router.push("/login");
      } finally {
        setIsInitializing(false);
      }
    };

    checkAuthAndLoad();
  }, [router]);

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
      }
    } catch (e) {
      console.error("Failed to load documents list:", e);
    }
  };

  // Fetch past messages of a specific conversation
  const loadConversationMessages = async (convId: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${API_BASE}/conversations/${convId}`, {
        method: "GET",
        credentials: "include",
      });

      if (!resp.ok) {
        throw new Error("Could not restore conversation messages.");
      }

      const data = await resp.json();
      
      const mapped = data.messages.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
        createdAt: new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }));

      if (mapped.length === 0) {
        setMessages(INITIAL_MESSAGES);
      } else {
        setMessages(mapped);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load conversation history.");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle selecting a conversation from sidebar
  const handleSelectConversation = async (convId: number) => {
    if (isLoading || activeConversationId === convId) return;
    setActiveConversationId(convId);
    await loadConversationMessages(convId);
  };

  // Start a new conversation
  const handleNewChat = async () => {
    setError(null);
    try {
      const resp = await fetch(`${API_BASE}/conversations`, {
        method: "POST",
        credentials: "include",
      });

      if (!resp.ok) {
        throw new Error("Failed to start new chat.");
      }

      const newConv = await resp.json();
      setConversations((prev) => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
      setMessages(INITIAL_MESSAGES);
    } catch (err: any) {
      setError(err.message || "Failed to create new conversation.");
    }
  };

  // Delete a conversation
  const handleDeleteConversation = async (e: React.MouseEvent, convId: number) => {
    e.stopPropagation();
    if (isLoading) return;

    if (!confirm("Are you sure you want to delete this conversation?")) return;

    try {
      const resp = await fetch(`${API_BASE}/conversations/${convId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!resp.ok) {
        throw new Error("Failed to delete conversation.");
      }

      const updatedList = conversations.filter((c) => c.id !== convId);
      setConversations(updatedList);

      if (activeConversationId === convId) {
        if (updatedList.length > 0) {
          const nextActive = updatedList[0];
          setActiveConversationId(nextActive.id);
          await loadConversationMessages(nextActive.id);
        } else {
          await handleNewChat();
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to delete conversation.");
    }
  };

  // Upload PDF material
  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    // Frontend validations
    if (file.type !== "application/pdf") {
      setUploadError("Only PDF study materials are supported.");
      return;
    }

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
      // Clear file input value to allow uploading same file again if needed
      e.target.value = "";
    }
  };

  // Delete PDF material
  const handleDeleteDocument = async (e: React.MouseEvent, docId: number) => {
    e.stopPropagation();
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

  // Format bytes to human readable format
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  // Send message
  const handleSendMessage = async (text: string) => {
    if (activeConversationId === null) {
      setError("No active conversation session.");
      return;
    }

    const userMessage: MessageProps = {
      role: "user",
      content: text,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/conversations/${activeConversationId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({ content: text })
      });

      if (!response.ok) {
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Server returned an error responding to your request.");
      }

      const aiMsg = await response.json();
      
      const assistantMessage: MessageProps = {
        role: "assistant",
        content: aiMsg.content,
        createdAt: new Date(aiMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Refresh conversations list to pull updated dynamically-generated title
      const listResp = await fetch(`${API_BASE}/conversations`, {
        method: "GET",
        credentials: "include"
      });
      if (listResp.ok) {
        const convList = await listResp.json();
        setConversations(convList);
      }
    } catch (err: any) {
      console.error("Failed to send message:", err);
      setError(err.message || "Failed to communicate with tutor. Please check your network connection.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include"
      });
    } catch (e) {
      console.error("Logout request failed:", e);
    } finally {
      router.push("/login");
    }
  };

  const handleRetry = () => {
    setError(null);
    const lastUserMsg = [...messages].reverse().find(msg => msg.role === "user");
    if (lastUserMsg) {
      setMessages(prev => prev.filter((_, idx) => idx !== prev.lastIndexOf(lastUserMsg)));
      handleSendMessage(lastUserMsg.content);
    }
  };

  return (
    <div className={styles.appContainer}>
      {/* Sidebar Panel */}
      <aside className={`${styles.sidebar} ${isSidebarOpen ? styles.sidebarOpen : styles.sidebarClosed}`}>
        {/* Logo Section */}
        <div className={styles.sidebarHeader}>
          <div className={styles.logoGroup}>
            <div className={styles.logoGlow} />
            <h1 className={styles.logo}>SBud</h1>
            <span className={styles.tagline}>AI Study Tutor</span>
          </div>

          {/* Sidebar Tab Selector Buttons */}
          <div className={styles.tabSelector}>
            <button 
              className={`${styles.tabBtn} ${activeTab === "chats" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("chats")}
            >
              Chats
            </button>
            <button 
              className={`${styles.tabBtn} ${activeTab === "materials" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("materials")}
            >
              Materials
            </button>
          </div>
        </div>

        {/* Tab 1: Chats History List */}
        {activeTab === "chats" && (
          <div className={styles.conversationsScroll}>
            <button 
              className={styles.newChatButton} 
              onClick={handleNewChat}
              disabled={isLoading || isInitializing}
              title="Start New Chat"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={styles.newChatIcon}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span>New Chat</span>
            </button>

            <div className={styles.sectionHeader} style={{ marginTop: "1rem" }}>Conversations</div>
            <div className={styles.convList}>
              {conversations.map((conv) => (
                <div 
                  key={conv.id} 
                  className={`${styles.convItem} ${activeConversationId === conv.id ? styles.convItemActive : ""}`}
                  onClick={() => handleSelectConversation(conv.id)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={styles.chatBubbleIcon}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                  </svg>
                  <span className={styles.convTitle} title={conv.title}>{conv.title}</span>
                  <button 
                    className={styles.deleteConvButton}
                    onClick={(e) => handleDeleteConversation(e, conv.id)}
                    title="Delete Conversation"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={styles.trashIcon}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Materials Document List & Uploads */}
        {activeTab === "materials" && (
          <div className={styles.conversationsScroll}>
            {/* Native Hidden File Input */}
            <input 
              type="file" 
              accept=".pdf"
              ref={fileInputRef} 
              style={{ display: "none" }}
              onChange={handleFileUpload} 
            />

            {/* Upload PDF Trigger Button */}
            <button 
              className={styles.uploadButton} 
              onClick={triggerFileInput}
              disabled={isUploading}
              title="Upload PDF Document"
            >
              {isUploading ? (
                <>
                  <div className={styles.uploadSpinner} />
                  <span>Uploading PDF...</span>
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={styles.newChatIcon}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                  </svg>
                  <span>Upload PDF</span>
                </>
              )}
            </button>

            {/* Upload Error / Success Alerts */}
            {uploadError && <div className={styles.uploadErrorAlert}>{uploadError}</div>}
            {uploadSuccess && <div className={styles.uploadSuccessAlert}>{uploadSuccess}</div>}

            <div className={styles.sectionHeader} style={{ marginTop: "1rem" }}>My Study Materials</div>
            <div className={styles.convList}>
              {documents.length === 0 ? (
                <div className={styles.emptyMaterialsText}>
                  No PDF notes uploaded yet. Add materials to prepare for study!
                </div>
              ) : (
                documents.map((doc) => (
                  <div key={doc.id} className={styles.docItem} title={doc.filename}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={styles.docIcon}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                    <div className={styles.docMeta}>
                      <span className={styles.docName}>{doc.filename}</span>
                      <span className={styles.docSize}>{formatBytes(doc.file_size)}</span>
                    </div>
                    <button 
                      className={styles.deleteDocBtn}
                      onClick={(e) => handleDeleteDocument(e, doc.id)}
                      title="Delete Study Material"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={styles.trashIcon}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Sidebar Footer Section */}
        <div className={styles.sidebarFooter}>
          {userEmail && (
            <div className={styles.userProfile}>
              <div className={styles.userAvatarMini}>
                {userEmail.substring(0, 2).toUpperCase()}
              </div>
              <span className={styles.userEmailText} title={userEmail}>
                {userEmail.split("@")[0]}
              </span>
            </div>
          )}
          <button onClick={handleLogout} className={styles.logoutButton} title="Sign Out">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={styles.logoutIcon}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
            </svg>
          </button>
        </div>
      </aside>

      {/* Main Chat Container */}
      <div className={styles.chatWrapper}>
        {/* Toggle Sidebar Button (Mobile) */}
        <header className={styles.header}>
          <button 
            className={styles.sidebarToggle} 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            aria-label="Toggle sidebar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={styles.toggleIcon}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
            </svg>
          </button>

          <div className={styles.headerTitleContainer}>
            <span className={styles.activeTitle}>
              {conversations.find((c) => c.id === activeConversationId)?.title || "Chat session"}
            </span>
          </div>
        </header>

        {/* Messages Scroll Area */}
        <main className={styles.chatArea}>
          {isInitializing ? (
            <div className={styles.initializingContainer}>
              <div className={styles.spinner} />
              <p>Initializing SBud secure tutor connection...</p>
            </div>
          ) : (
            <div className={styles.messagesList}>
              {messages.map((msg, index) => (
                <Message key={index} role={msg.role} content={msg.content} createdAt={msg.createdAt} />
              ))}
              
              {/* Loading Typing Indicator */}
              {isLoading && (
                <div className={styles.typingIndicatorContainer}>
                  <div className={styles.avatarMini}>SB</div>
                  <div className={styles.typingBubble}>
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              )}

              {/* Error Banner */}
              {error && (
                <div className={styles.errorBanner}>
                  <div className={styles.errorContent}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={styles.errorIcon}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                    </svg>
                    <span>{error}</span>
                  </div>
                  <button className={styles.retryButton} onClick={handleRetry}>Retry</button>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        {/* Input Tray */}
        <footer className={styles.footer}>
          <div className={styles.inputWrapper}>
            <ChatInput onSendMessage={handleSendMessage} disabled={isLoading || isInitializing} />
          </div>
          <p className={styles.footerNote}>
            SBud is designed to guide your study. Tip: Ask it to break things down!
          </p>
        </footer>
      </div>
    </div>
  );
};
