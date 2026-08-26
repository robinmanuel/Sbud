"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { Message, MessageProps } from "@/components/Message";
import { ChatInput } from "@/components/ChatInput";
import styles from "@/components/Chat.module.css";

const API_BASE = "http://localhost:8000";

interface Conversation {
  id: number;
  title: string;
  created_at: string;
}

const INITIAL_MESSAGES: MessageProps[] = [
  {
    role: "assistant",
    content: "Hi! I'm **SBud**, your AI study tutor. I'm here to help you understand complex concepts step-by-step.\n\nWhat would you like to study today? (e.g., Photosynthesis, Gravity, Mitosis, or paste a homework question!)",
  }
];

function AssistantInner() {
  const [messages, setMessages] = useState<MessageProps[]>(INITIAL_MESSAGES);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Conversations State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q");

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Load profile and conversations on mount
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
          
          // Check if there was an initial query requested from dashboard
          if (initialQuery && initialQuery.trim()) {
            // Start a new conversation thread for the quick ask
            await handleNewChatWithQuery(initialQuery.trim());
          } else if (convList.length > 0) {
            const mostRecent = convList[0];
            setActiveConversationId(mostRecent.id);
            await loadConversationMessages(mostRecent.id);
          } else {
            await handleNewChat();
          }
        }
      } catch (err) {
        console.warn("Initialization failed, redirecting to login:", err);
        router.push("/login");
      } finally {
        setIsInitializing(false);
      }
    };

    checkAuthAndLoad();
  }, [router]);

  // Load messages of a specific conversation
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

  // Start new conversation thread
  const handleNewChat = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${API_BASE}/conversations`, {
        method: "POST",
        credentials: "include",
      });

      if (!resp.ok) {
        throw new Error("Failed to start a new chat session.");
      }

      const newConv = await resp.json();
      setConversations((prev) => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
      setMessages(INITIAL_MESSAGES);
    } catch (err: any) {
      setError(err.message || "Could not initialize new conversation thread.");
    } finally {
      setIsLoading(false);
    }
  };

  // Start new conversation thread and send query immediately
  const handleNewChatWithQuery = async (queryText: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${API_BASE}/conversations`, {
        method: "POST",
        credentials: "include",
      });

      if (!resp.ok) {
        throw new Error("Failed to start a new chat session.");
      }

      const newConv = await resp.json();
      setConversations((prev) => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
      
      // Clean query params so refresh doesn't trigger duplicate chats
      router.replace("/assistant");

      // Send the query message to this conversation
      await handleSendMessageDirectly(newConv.id, queryText);
    } catch (err: any) {
      setError(err.message || "Could not initialize new conversation thread.");
      setIsLoading(false);
    }
  };

  // Select another conversation
  const handleSelectConversation = async (convId: number) => {
    if (convId === activeConversationId) return;
    setActiveConversationId(convId);
    await loadConversationMessages(convId);
  };

  // Delete conversation thread
  const handleDeleteConversation = async (e: React.MouseEvent, convId: number) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this study chat thread?")) return;

    try {
      const resp = await fetch(`${API_BASE}/conversations/${convId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!resp.ok) {
        throw new Error("Could not delete conversation.");
      }

      setConversations((prev) => prev.filter((c) => c.id !== convId));

      if (activeConversationId === convId) {
        const remaining = conversations.filter((c) => c.id !== convId);
        if (remaining.length > 0) {
          setActiveConversationId(remaining[0].id);
          await loadConversationMessages(remaining[0].id);
        } else {
          await handleNewChat();
        }
      }
    } catch (err: any) {
      alert(err.message || "Failed to delete conversation thread.");
    }
  };

  // Send message helper
  const handleSendMessage = async (text: string) => {
    if (activeConversationId === null) {
      setError("No active conversation session.");
      return;
    }
    await handleSendMessageDirectly(activeConversationId, text);
  };

  const handleSendMessageDirectly = async (convId: number, text: string) => {
    const userMessage: MessageProps = {
      role: "user",
      content: text,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/conversations/${convId}/messages`, {
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

      // Refresh titles
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

  const handleRetry = () => {
    setError(null);
    const lastUserMsg = [...messages].reverse().find(msg => msg.role === "user");
    if (lastUserMsg) {
      setMessages(prev => prev.filter((_, idx) => idx !== prev.lastIndexOf(lastUserMsg)));
      handleSendMessage(lastUserMsg.content);
    }
  };

  return (
    <div 
      style={{
        display: "flex",
        height: "calc(100vh - 120px)",
        width: "100%",
        overflow: "hidden",
        position: "relative",
        background: "var(--glass-bg)",
        border: "1px solid var(--glass-border)",
        borderRadius: "20px",
        boxShadow: "var(--shadow-xl)",
        backdropFilter: "var(--glass-blur)"
      }}
    >
      {/* Historical Chats Sidebar */}
      <aside className={`${styles.sidebar} ${isSidebarOpen ? styles.sidebarOpen : styles.sidebarClosed}`} style={{ height: "100%", borderRight: "1px solid var(--border-light)" }}>
        <div className={styles.sidebarHeader} style={{ borderBottom: "1px solid var(--border-light)" }}>
          <button 
            className={styles.newChatButton} 
            onClick={handleNewChat}
            disabled={isLoading || isInitializing}
            title="Start New Chat"
            style={{ width: "100%" }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={styles.newChatIcon}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span>New Chat</span>
          </button>
        </div>

        <div className={styles.conversationsScroll} style={{ padding: "1rem" }}>
          <div className={styles.sectionHeader} style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px", marginBottom: "0.75rem" }}>Past Discussions</div>
          <div className={styles.convList} style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            {conversations.map((conv) => (
              <div 
                key={conv.id} 
                className={`${styles.convItem} ${activeConversationId === conv.id ? styles.convItemActive : ""}`}
                onClick={() => handleSelectConversation(conv.id)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={styles.chatBubbleIcon}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                </svg>
                <span className={styles.convTitle} style={{ fontSize: "0.9rem" }} title={conv.title}>{conv.title}</span>
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
      </aside>

      {/* Chat Workspace */}
      <div className={styles.chatWrapper} style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", background: "transparent" }}>
        <header className={styles.header} style={{ borderBottom: "1px solid var(--border-light)", background: "rgba(11, 15, 25, 0.2)" }}>
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
              {conversations.find((c) => c.id === activeConversationId)?.title || "Active Discussion"}
            </span>
          </div>
        </header>

        <main className={styles.chatArea} style={{ flex: 1, overflowY: "auto", padding: "1.5rem" }}>
          {isInitializing ? (
            <div className={styles.initializingContainer}>
              <div className={styles.spinner} />
              <p>Initializing SBud secure tutor connection...</p>
            </div>
          ) : (
            <div className={styles.messagesList} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {messages.map((msg, index) => (
                <Message key={index} role={msg.role} content={msg.content} createdAt={msg.createdAt} />
              ))}
              
              {/* Typing Loader */}
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

              {/* Error Alert */}
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

        <footer className={styles.footer} style={{ padding: "1.5rem", borderTop: "1px solid var(--border-light)", background: "rgba(11, 15, 25, 0.2)" }}>
          <div className={styles.inputWrapper}>
            <ChatInput onSendMessage={handleSendMessage} disabled={isLoading || isInitializing} />
          </div>
          <p className={styles.footerNote} style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.5rem", textAlign: "center" }}>
            SBud is designed to guide your study. Tip: Ask it to break things down!
          </p>
        </footer>
      </div>
    </div>
  );
}

export default function AssistantPage() {
  return (
    <AppShell>
      <Suspense fallback={
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "200px" }}>
          <div className={styles.spinner} />
        </div>
      }>
        <AssistantInner />
      </Suspense>
    </AppShell>
  );
}
